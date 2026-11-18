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

export interface ReportMetadata {
  churchName: string;
  year: string;
  pastorName?: string;
  secretaryName?: string;
  meetingDate?: string;
  meetingTime?: string;
}

export function formatMeetingDate(dateStr?: string): string {
  const clean = (dateStr ?? '').trim();
  if (!clean) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const parsed = new Date(`${clean}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }
  }
  return clean;
}

export function formatMeetingTime(timeStr?: string): string {
  const clean = (timeStr ?? '').trim();
  if (!clean) return '';
  if (/^\d{2}:\d{2}$/.test(clean)) {
    const parsed = new Date(`2000-01-01T${clean}:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
  }
  return clean;
}

export function exportFinalListExcel(
  meta: ReportMetadata,
  departments: DepartmentPosition[]
): void {
  const groups = groupDepartmentsForReport(departments);
  const formattedDate = formatMeetingDate(meta.meetingDate) || new Date().toLocaleDateString('es-ES');
  const formattedTime = formatMeetingTime(meta.meetingTime) || 'No especificada';
  const pastorDisplay = meta.pastorName?.trim() || 'No especificado';
  const secretaryDisplay = meta.secretaryName?.trim() || 'No especificado';

  const listHeader: (string | number)[][] = [
    ['NOMBRAMIENTOS SDA - HOJA FINAL DE RESULTADOS'],
    ['Iglesia:', meta.churchName, 'Período:', meta.year],
    ['Pastor:', pastorDisplay, 'Secretaria(o):', secretaryDisplay],
    ['Fecha de reunión:', formattedDate, 'Hora:', formattedTime],
    [],
    [
      'Departamento',
      'Cargo',
      'Personas Elegidas',
      'Integrantes Asignados',
      'Puestos Requeridos',
      'Estado',
    ],
  ];

  const listDataRows: (string | number)[][] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      listDataRows.push([
        group.department,
        row.roleTitle,
        row.electedNames.length > 0 ? row.electedNames.join(', ') : 'Pendiente',
        row.electedNames.length,
        row.seats,
        row.status === 'completed'
          ? 'Completado'
          : row.status === 'tie'
            ? 'Empate pendiente'
            : row.status === 'voting'
              ? 'En votación'
              : 'Pendiente',
      ]);
    }
  }

  const summaryHeader: (string | number)[][] = [
    ['NOMBRAMIENTOS SDA - RESUMEN POR DEPARTAMENTO'],
    ['Iglesia:', meta.churchName, 'Período:', meta.year],
    ['Pastor:', pastorDisplay, 'Secretaria(o):', secretaryDisplay],
    ['Fecha de reunión:', formattedDate, 'Hora:', formattedTime],
    [],
    [
      'Departamento',
      'Cargos en el Departamento',
      'Total Integrantes Asignados',
      'Total Puestos Configurados',
    ],
  ];

  const summaryDataRows: (string | number)[][] = groups.map((g) => [
    g.department,
    g.rows.length,
    g.totalAssigned,
    g.totalSeats,
  ]);

  const wb = XLSX.utils.book_new();
  const wsList = XLSX.utils.aoa_to_sheet([...listHeader, ...listDataRows]);
  const wsSummary = XLSX.utils.aoa_to_sheet([...summaryHeader, ...summaryDataRows]);

  wsList['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];

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

  const safeChurch = meta.churchName.replace(/[^a-zA-Z0-9_-]+/g, '_');
  XLSX.writeFile(wb, `Nombramientos_SDA_${safeChurch}_${meta.year}.xlsx`);
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
  meta: ReportMetadata,
  departments: DepartmentPosition[]
): Promise<void> {
  const groups = groupDepartmentsForReport(departments);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const logoDataUrl = await loadLogoAsPngDataUrl(APP_LOGO_PATH);

  const formattedDate = formatMeetingDate(meta.meetingDate) || new Date().toLocaleDateString('es-ES');
  const formattedTime = formatMeetingTime(meta.meetingTime) || 'No especificada';
  const pastorDisplay = meta.pastorName?.trim() || 'No especificado';
  const secretaryDisplay = meta.secretaryName?.trim() || 'No especificado';

  const textStartX = logoDataUrl ? 35 : 14;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 14, 11, 18, 18);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(15, 23, 42);
  doc.text('INFORME DE COMISIÓN DE NOMBRAMIENTOS', textStartX, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`NOMBRAMIENTOS SDA · ${meta.churchName} · Período ${meta.year}`, textStartX, 23);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Iglesia Adventista del Séptimo Día · Hoja Oficial de Resultados', textStartX, 28.5);

  // Structured Acta / Meeting Metadata Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 34, 186, 18, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Pastor:', 18, 41);
  doc.text('Secretaria(o):', 18, 48);
  doc.text('Fecha de reunión:', 112, 41);
  doc.text('Hora:', 112, 48);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(pastorDisplay.slice(0, 40), 33, 41);
  doc.text(secretaryDisplay.slice(0, 36), 42, 48);
  doc.text(formattedDate, 143, 41);
  doc.text(formattedTime, 123, 48);

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
    startY: 56,
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

  const pageHeight = doc.internal.pageSize.getHeight();
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 220;
  let sigY = finalY + 24;
  if (sigY + 14 > pageHeight - 10) {
    doc.addPage();
    sigY = 38;
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(20, sigY, 90, sigY);
  doc.line(120, sigY, 190, sigY);

  if (meta.pastorName?.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(meta.pastorName.trim().slice(0, 42), 55, sigY - 2, { align: 'center' });
  }
  if (meta.secretaryName?.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(meta.secretaryName.trim().slice(0, 42), 155, sigY - 2, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Pastor / Presidente de Comisión', 55, sigY + 5, { align: 'center' });
  doc.text('Secretaria(o) de Comisión', 155, sigY + 5, { align: 'center' });

  const safeChurch = meta.churchName.replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`Nombramientos_SDA_${safeChurch}_${meta.year}.pdf`);
}
