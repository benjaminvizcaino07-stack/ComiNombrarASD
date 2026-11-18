import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DepartmentPosition } from '../types';

export interface ParsedMemberRow {
  name: string;
  notes?: string;
}

export async function parseMembersExcel(file: File): Promise<ParsedMemberRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
  if (rows.length === 0) return [];

  const sampleKeys = Object.keys(rows[0]);
  const nameKey =
    sampleKeys.find((k) =>
      /nombre|name|miembro|hermano|persona|candidato|integrante/i.test(k)
    ) ?? sampleKeys[0];

  const notesKey = sampleKeys.find(
    (k) => k !== nameKey && /nota|observ|cargo|ministerio|detalle|tel|grupo/i.test(k)
  );

  const seen = new Set<string>();
  const parsed: ParsedMemberRow[] = [];

  for (const row of rows) {
    const rawName = String(row[nameKey] ?? '').trim().replace(/\s+/g, ' ');
    if (!rawName || rawName.length < 2) continue;
    const normalized = rawName.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const rawNotes = notesKey ? String(row[notesKey] ?? '').trim().slice(0, 240) : '';
    parsed.push({
      name: rawName.slice(0, 140),
      notes: rawNotes || undefined,
    });
  }

  return parsed;
}

export interface ReportRoleRow {
  id: string;
  roleTitle: string;
  electedNames: string[];
  seats: number;
  status: DepartmentPosition['status'];
}

export interface DepartmentSummaryGroup {
  department: string;
  positions: DepartmentPosition[];
  rows: ReportRoleRow[];
  totalAssigned: number;
  totalSeats: number;
}

export function expandPositionForReport(pos: DepartmentPosition): ReportRoleRow[] {
  if (pos.votingMode === 'grouped' && pos.seats >= 2) {
    const leaderTitle = pos.leaderRoleTitle?.trim() || 'Cargo Principal';
    const membersTitle = pos.membersRoleTitle?.trim() || 'Integrantes';
    const leaderNames = pos.leaderElectedName
      ? [pos.leaderElectedName]
      : pos.electedNames.length > 0
        ? [pos.electedNames[0]]
        : [];
    const memberNames = Array.isArray(pos.memberElectedNames)
      ? pos.memberElectedNames
      : pos.electedNames.slice(1);

    return [
      {
        id: `${pos.id}_leader`,
        roleTitle: leaderTitle,
        electedNames: leaderNames,
        seats: 1,
        status: pos.status,
      },
      {
        id: `${pos.id}_members`,
        roleTitle: membersTitle,
        electedNames: memberNames,
        seats: Math.max(1, pos.seats - 1),
        status: pos.status,
      },
    ];
  }

  return [
    {
      id: pos.id,
      roleTitle: pos.roleTitle,
      electedNames: pos.electedNames,
      seats: pos.seats,
      status: pos.status,
    },
  ];
}

export function groupDepartmentsForReport(
  departments: DepartmentPosition[]
): DepartmentSummaryGroup[] {
  const map = new Map<string, DepartmentPosition[]>();
  const ordered = [...departments].sort((a, b) => a.order - b.order);

  for (const pos of ordered) {
    const key = pos.department.trim() || 'General';
    const existing = map.get(key) ?? [];
    existing.push(pos);
    map.set(key, existing);
  }

  return Array.from(map.entries()).map(([department, positions]) => ({
    department,
    positions,
    rows: positions.flatMap(expandPositionForReport),
    totalAssigned: positions.reduce((acc, p) => acc + p.electedNames.length, 0),
    totalSeats: positions.reduce((acc, p) => acc + p.seats, 0),
  }));
}

export function exportFinalListExcel(
  churchName: string,
  year: string,
  departments: DepartmentPosition[]
): void {
  const groups = groupDepartmentsForReport(departments);
  const rows: Record<string, string | number>[] = [];

  for (const group of groups) {
    for (const row of group.rows) {
      rows.push({
        Departamento: group.department,
        Cargo: row.roleTitle,
        'Personas Elegidas':
          row.electedNames.length > 0 ? row.electedNames.join(', ') : 'Pendiente',
        'Integrantes Asignados': row.electedNames.length,
        'Puestos Requeridos': row.seats,
        Estado:
          row.status === 'completed'
            ? 'Completado'
            : row.status === 'tie'
              ? 'Empate pendiente'
              : row.status === 'voting'
                ? 'En votación'
                : 'Pendiente',
      });
    }
  }

  const summaryRows = groups.map((g) => ({
    Departamento: g.department,
    'Cargos en el Departamento': g.rows.length,
    'Total Integrantes Asignados': g.totalAssigned,
    'Total Puestos Configurados': g.totalSeats,
  }));

  const wb = XLSX.utils.book_new();
  const wsList = XLSX.utils.json_to_sheet(rows);
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

  wsList['!cols'] = [
    { wch: 30 },
    { wch: 34 },
    { wch: 44 },
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
  ];
  wsSummary['!cols'] = [{ wch: 34 }, { wch: 24 }, { wch: 26 }, { wch: 26 }];

  XLSX.utils.book_append_sheet(wb, wsList, 'Lista de Nombramientos');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen por Departamento');

  const safeChurch = churchName.replace(/[^a-zA-Z0-9_-]+/g, '_');
  XLSX.writeFile(wb, `Nombramientos_SDA_${safeChurch}_${year}.xlsx`);
}

const APP_LOGO_PATH = '/assets/aistudio/Icono_azul_de_nombramientos_SDA_0e21f0e4.png';

async function loadLogoAsPngDataUrl(url: string): Promise<string | null> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function exportFinalListPDF(
  churchName: string,
  year: string,
  departments: DepartmentPosition[]
): Promise<void> {
  const groups = groupDepartmentsForReport(departments);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const logoDataUrl = await loadLogoAsPngDataUrl(APP_LOGO_PATH);

  const textStartX = logoDataUrl ? 35 : 14;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 14, 11, 18, 18);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('INFORME DE COMISIÓN DE NOMBRAMIENTOS', textStartX, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`NOMBRAMIENTOS SDA · ${churchName} · Período ${year}`, textStartX, 23);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Iglesia Adventista del Séptimo Día · Generado el ${new Date().toLocaleDateString('es-ES')}`,
    textStartX,
    28.5
  );

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 33, 196, 33);

  const tableBody: (string | number)[][] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      tableBody.push([
        group.department,
        row.roleTitle,
        row.electedNames.length > 0 ? row.electedNames.join('\n') : 'Sin asignar',
        `${row.electedNames.length} / ${row.seats}`,
      ]);
    }
  }

  autoTable(doc, {
    startY: 37,
    head: [['Departamento', 'Cargo', 'Personas Elegidas', 'Asignados']],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [30, 58, 95],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 46, fontStyle: 'bold' },
      1: { cellWidth: 48 },
      2: { cellWidth: 70 },
      3: { cellWidth: 22, halign: 'center' },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 220;
  const sigY = Math.min(finalY + 20, 255);

  doc.setDrawColor(148, 163, 184);
  doc.line(20, sigY, 90, sigY);
  doc.line(120, sigY, 190, sigY);
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Pastor / Presidente de Comisión', 55, sigY + 5, { align: 'center' });
  doc.text('Secretario(a) de Comisión', 155, sigY + 5, { align: 'center' });

  const safeChurch = churchName.replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`Nombramientos_SDA_${safeChurch}_${year}.pdf`);
}
