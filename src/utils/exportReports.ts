import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DepartmentPosition } from '../types';

export interface ParsedMemberRow {
  name: string;
  notes?: string;
}

const TEMPLATE_HEADER_PATTERN =
  /^(?:nombre(?:\s+completo)?|nombres?(?:\s+y\s+apellidos?)?|apellidos?\s+y\s+nombres?|miembro|integrante|feligr[eé]s|persona|candidato|#)$/i;

const TEMPLATE_EXAMPLE_PATTERN = /^ejemplo\s*:/i;

function isTemplateNoiseName(name: string): boolean {
  const clean = name.trim();
  if (!clean || clean.length < 2) return true;
  if (TEMPLATE_HEADER_PATTERN.test(clean)) return true;
  if (TEMPLATE_EXAMPLE_PATTERN.test(clean)) return true;
  return false;
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
    if (isTemplateNoiseName(rawName)) continue;
    const normalized = rawName.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const rawNotes = notesKey
      ? String(row[notesKey] ?? '').trim().replace(/\s+/g, ' ').slice(0, 240)
      : '';
    const cleanNotes =
      rawNotes && !TEMPLATE_EXAMPLE_PATTERN.test(rawNotes) ? rawNotes : undefined;
    parsed.push({
      name: rawName.slice(0, 140),
      notes: cleanNotes,
    });
  }

  return parsed;
}

export function parseBulkPastedMembers(rawText: string): ParsedMemberRow[] {
  const lines = rawText.split(/\r?\n/);
  const seen = new Set<string>();
  const parsed: ParsedMemberRow[] = [];

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const rawCells = rawLine.split('\t').map((c) => c.trim().replace(/\s+/g, ' '));
    // Drop leading empty cells if selection started before name column
    while (rawCells.length > 0 && !rawCells[0]) {
      rawCells.shift();
    }
    if (rawCells.length === 0) continue;

    // If first column is an ordinal index (e.g. "1" or "1.") and next column is the name
    if (
      rawCells.length >= 2 &&
      /^(?:#|n°|no\.?)?\s*\d{1,4}\.?$/i.test(rawCells[0]) &&
      /\p{L}/u.test(rawCells[1])
    ) {
      rawCells.shift();
    }

    const { text: cleanedName } = stripListPrefix(rawCells[0] ?? '');
    if (isTemplateNoiseName(cleanedName)) continue;

    const normalized = cleanedName.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const rawNote = rawCells.slice(1).filter(Boolean).join(' · ').slice(0, 240);
    const cleanNote =
      rawNote &&
      !/^(?:observaciones?|notas?|observaciones?\s*\(opcional\)|tel[eé]fono(?:\s*\(opcional\))?|celular(?:\s*\(opcional\))?)$/i.test(
        rawNote
      ) &&
      !TEMPLATE_EXAMPLE_PATTERN.test(rawNote)
        ? rawNote
        : undefined;

    parsed.push({
      name: cleanedName.slice(0, 140),
      notes: cleanNote,
    });
  }

  return parsed;
}

export function downloadMembersExcelTemplate(churchName?: string): void {
  const membersRows: string[][] = [
    ['Nombre completo', 'Teléfono (opcional)'],
    ['Ejemplo: Juan Carlos Pérez', 'Ejemplo: 809-555-0123'],
    ['Ejemplo: Ana Lucía Torres', ''],
  ];

  const guideRows: string[][] = [
    ['PLANTILLA DE MIEMBROS APTOS - NOMBRAMIENTOS SDA'],
    [''],
    ['Cómo usar esta plantilla en el sistema:'],
    ['1. Llena la hoja "Miembros Aptos" colocando un miembro por fila en la columna "Nombre completo".'],
    ['2. La columna "Teléfono (opcional)" es opcional; puedes dejarla vacía si no deseas incluir teléfono.'],
    [''],
    ['Para usar en "Pegar lista múltiple":'],
    ['- Selecciona los nombres en Excel (1 columna o ambas columnas Nombre completo + Teléfono).'],
    ['- Copia las celdas (Ctrl+C), abre "Pegar lista múltiple" en la aplicación y pega (Ctrl+V).'],
    [''],
    ['Para subir el archivo directamente:'],
    ['- Guarda este archivo (.xlsx) y súbelo con el botón "Cargar Excel / CSV".'],
    [''],
    ['Nota: Los encabezados y las filas de ejemplo ("Ejemplo: ...") se omiten automáticamente.'],
  ];

  const wb = XLSX.utils.book_new();
  const wsMembers = XLSX.utils.aoa_to_sheet(membersRows);
  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);

  wsMembers['!cols'] = [{ wch: 40 }, { wch: 28 }];
  wsGuide['!cols'] = [{ wch: 92 }];

  XLSX.utils.book_append_sheet(wb, wsMembers, 'Miembros Aptos');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Instrucciones');

  const safeChurch = (churchName ?? 'Iglesia_SDA')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  XLSX.writeFile(wb, `Plantilla_Miembros_Aptos_${safeChurch || 'SDA'}.xlsx`);
}

const PDF_HEADER_OR_NOISE_PATTERNS: RegExp[] = [
  /^(?:p[aá]gina|page|p[aá]g\.?)\s*\d+/i,
  /\bp[aá]gina\s+\d+\s+de\s+\d+\b/i,
  /^(?:total(?:\s+de\s+miembros)?|subtotal|resumen)\b/i,
  /^(?:iglesia\s+adventista|asociaci[oó]n|misi[oó]n|uni[oó]n|distrito)\b/i,
  /^(?:comisi[oó]n\s+de\s+nombramientos|lista\s+(?:de\s+)?miembros|registro\s+de\s+feligres[ií]a|n[oó]mina\s+de\s+miembros|directorio\s+de\s+iglesia)\b/i,
  /^(?:nombre(?:\s+completo)?|nombres?\s+y\s+apellidos?|apellidos?\s+y\s+nombres?|miembro|integrante|feligr[eé]s|estado|bautismo|tel[eé]fono|celular|observaci[oó]n|observaciones|notas?|cargo|departamento|firma|fecha|hora)\s*:?$/i,
  /^(?:generado|impreso|emitido|actualizado)\s+(?:el|por)\b/i,
  /^(?:pastor|secretaria|secretario)\s*:/i,
];

const PDF_STATUS_ONLY_PATTERN =
  /^(?:activo|activa|inactivo|inactiva|bautizado|bautizada|profesi[oó]n\s+de\s+fe|traslado|miembro|regular|irregular|s[ií]|no|m|f|masculino|femenino|soltero|soltera|casado|casada|viudo|viuda|divorciado|divorciada|adulto|joven|ni[ñn]o|ni[ñn]a)$/i;

function stripListPrefix(raw: string): { text: string; hadListMarker: boolean } {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  const stripped = trimmed.replace(
    /^(?:#?\d{1,4}\s*[.):\-–]\s*|[•·▪▫◦‣⁃\-*]+\s+|#?\d{1,4}\s+(?=[\p{L}]))/u,
    ''
  );
  return {
    text: stripped.trim(),
    hadListMarker: stripped.trim().length !== trimmed.length,
  };
}

function isLikelyPersonName(raw: string): boolean {
  const clean = raw.trim().replace(/\s+/g, ' ');
  if (clean.length < 3 || clean.length > 100) return false;
  if (!/\p{L}/u.test(clean)) return false;
  if (/\d/.test(clean)) return false;
  if (clean.includes('@') || clean.includes(':') || /https?:\/\/|www\./i.test(clean)) return false;
  if (/^[+\d\s().\-/]+$/.test(clean)) return false;
  if (PDF_STATUS_ONLY_PATTERN.test(clean)) return false;
  if (PDF_HEADER_OR_NOISE_PATTERNS.some((re) => re.test(clean))) return false;

  const words = clean.split(' ').filter(Boolean);
  if (words.length > 7) return false;

  // Reject single short abbreviations/codes like "N°", "S/N", "ASD"
  if (words.length === 1 && clean.length < 4) return false;
  return true;
}

export async function parseMembersPdf(file: File): Promise<ParsedMemberRow[]> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  interface PositionedText {
    str: string;
    x: number;
    y: number;
    endX: number;
  }

  let totalTextItems = 0;
  const allRows: string[][] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items: PositionedText[] = [];
    for (const rawItem of textContent.items) {
      if (!('str' in rawItem) || typeof rawItem.str !== 'string') continue;
      const str = rawItem.str;
      if (!str.trim()) continue;
      const transform = Array.isArray(rawItem.transform) ? rawItem.transform : [1, 0, 0, 1, 0, 0];
      const x = Number(transform[4] ?? 0);
      const y = Number(transform[5] ?? 0);
      const width = typeof rawItem.width === 'number' ? rawItem.width : str.length * 4;
      items.push({ str, x, y, endX: x + width });
      totalTextItems += 1;
    }

    items.sort((a, b) => {
      if (Math.abs(b.y - a.y) > 3.5) return b.y - a.y;
      return a.x - b.x;
    });

    const lineBuckets: PositionedText[][] = [];
    for (const item of items) {
      const lastBucket = lineBuckets[lineBuckets.length - 1];
      if (!lastBucket || Math.abs(lastBucket[0].y - item.y) > 3.5) {
        lineBuckets.push([item]);
      } else {
        lastBucket.push(item);
      }
    }

    for (const bucket of lineBuckets) {
      bucket.sort((a, b) => a.x - b.x);
      const cells: string[] = [];
      let currentCell = '';
      let prevEndX: number | null = null;

      for (const item of bucket) {
        const textPart = item.str.replace(/\s+/g, ' ');
        if (prevEndX === null) {
          currentCell = textPart;
        } else {
          const gap = item.x - prevEndX;
          if (gap > 16) {
            if (currentCell.trim()) cells.push(currentCell.trim());
            currentCell = textPart;
          } else if (gap > 1.5 && !currentCell.endsWith(' ') && !textPart.startsWith(' ')) {
            currentCell += ` ${textPart}`;
          } else {
            currentCell += textPart;
          }
        }
        prevEndX = Math.max(prevEndX ?? item.endX, item.endX);
      }
      if (currentCell.trim()) cells.push(currentCell.trim());
      if (cells.length > 0) allRows.push(cells);
    }
  }

  if (totalTextItems === 0) {
    throw new Error('NO_TEXT_PDF');
  }

  // Try detecting explicit table header columns (e.g., Nombre, Apellidos, Notas/Estado)
  let nameColIndex = -1;
  let lastNameColIndex = -1;
  let firstNameColIndex = -1;
  let notesColIndex = -1;

  for (const row of allRows.slice(0, 25)) {
    if (row.length < 2) continue;
    const lowerCells = row.map((c) => c.toLowerCase());
    const hasHeaderHint = lowerCells.some((c) =>
      /^(?:#|n°|no\.?|nombre|nombres|apellidos|miembro|integrante|estado|tel[eé]fono|observ|notas?)/i.test(
        c
      )
    );
    if (!hasHeaderHint) continue;

    lowerCells.forEach((cell, idx) => {
      if (/^apellidos?$/i.test(cell) && lastNameColIndex === -1) {
        lastNameColIndex = idx;
      } else if (/^nombres?$/i.test(cell) && firstNameColIndex === -1) {
        firstNameColIndex = idx;
      } else if (
        /(nombre|miembro|hermano|persona|candidato|integrante|feligr[eé]s)/i.test(cell) &&
        nameColIndex === -1
      ) {
        nameColIndex = idx;
      } else if (
        /(nota|observ|cargo|ministerio|detalle|grupo)/i.test(cell) &&
        notesColIndex === -1
      ) {
        notesColIndex = idx;
      }
    });

    if (nameColIndex !== -1 || (firstNameColIndex !== -1 && lastNameColIndex !== -1)) {
      break;
    }
  }

  const seen = new Set<string>();
  const parsed: ParsedMemberRow[] = [];

  const pushCandidate = (rawName: string, rawNotes?: string) => {
    const cleanName = rawName.trim().replace(/\s+/g, ' ');
    if (!isLikelyPersonName(cleanName)) return;
    const normalized = cleanName.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    const cleanNotes = rawNotes ? rawNotes.trim().replace(/\s+/g, ' ').slice(0, 240) : '';
    parsed.push({
      name: cleanName.slice(0, 140),
      notes: cleanNotes || undefined,
    });
  };

  for (const row of allRows) {
    // Skip obvious page headers/footers across joined row
    const joinedRow = row.join(' ').trim();
    if (PDF_HEADER_OR_NOISE_PATTERNS.some((re) => re.test(joinedRow))) {
      continue;
    }

    if (firstNameColIndex !== -1 && lastNameColIndex !== -1 && row.length > Math.max(firstNameColIndex, lastNameColIndex)) {
      const combined = `${row[firstNameColIndex] ?? ''} ${row[lastNameColIndex] ?? ''}`.trim();
      const { text } = stripListPrefix(combined);
      const note = notesColIndex !== -1 ? row[notesColIndex] : undefined;
      pushCandidate(text, note);
      continue;
    }

    if (nameColIndex !== -1 && row.length > nameColIndex) {
      const { text } = stripListPrefix(row[nameColIndex] ?? '');
      const note = notesColIndex !== -1 && notesColIndex !== nameColIndex ? row[notesColIndex] : undefined;
      pushCandidate(text, note);
      continue;
    }

    // No explicit table header detected: handle 1-column lists, multi-column directories, or [index, name, ...]
    const strippedCells = row.map((cell) => stripListPrefix(cell));
    const multiColumnNumberedList =
      strippedCells.length >= 2 &&
      strippedCells.filter((c) => c.hadListMarker && isLikelyPersonName(c.text)).length >= 2;

    if (multiColumnNumberedList) {
      for (const cell of strippedCells) {
        pushCandidate(cell.text);
      }
      continue;
    }

    // Single name per row (choosing the first plausible person name cell)
    const nameCell = strippedCells.find((c) => isLikelyPersonName(c.text));
    if (nameCell) {
      pushCandidate(nameCell.text);
    }
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
