import { formatDate, formatMoney } from './config';
import { getColumnLabel } from './labels';

type Row = Record<string, unknown>;

function formatExportValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);

  const valStr = String(value);

  // Formato para fechas
  if (key.startsWith('fecha_') || key === 'fecha' || (/^\d{4}-\d{2}-\d{2}/.test(valStr))) {
    return formatDate(valStr);
  }

  // Formato para dinero
  if (key.includes('monto') || key.includes('ingreso') || key.includes('deuda')) {
    const num = Number(value);
    if (!isNaN(num)) return formatMoney(num);
  }

  // Formato para estado
  if (key === 'estado') {
    return value === 1 || value === '1' ? 'Activo' : 'Baja';
  }

  return valStr;
}

const clean = (rows: Row[]) => rows.map((row) => Object.fromEntries(
  Object.entries(row)
    .filter(([key]) => !key.startsWith('fyh_') && key !== 'password_hash' && !key.startsWith('id_') && !key.endsWith('_id'))
    .map(([key, value]) => [getColumnLabel(key), formatExportValue(key, value)])
));

export async function exportExcel(title: string, rows: Row[]) {
  const data = clean(rows);
  const columns = Object.keys(data[0] ?? {});
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = [
    columns,
    ...data.map((row) => columns.map((column) => String(row[column] ?? '')))
  ].map((line) => line.map(escape).join(';')).join('\n');

  download(`\ufeff${csv}`, `${title.toLowerCase().replaceAll(' ', '-')}.csv`, 'text/csv;charset=utf-8');
}

export async function exportPdf(title: string, rows: Row[]) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
  const data = clean(rows);
  const columns = Object.keys(data[0] ?? {});

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(6, 107, 115);
  doc.text(title, 14, 15);

  const hoy = new Date();
  const fechaStr = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(97, 117, 138);
  doc.text(`Generado: ${fechaStr} | Total registros: ${rows.length}`, 14, 20);

  autoTable(doc, {
    head: [columns],
    body: data.map((row) => columns.map((column) => row[column])),
    startY: 24,
    styles: { fontSize: 7.5, cellPadding: 2, font: 'helvetica' },
    headStyles: { fillColor: [6, 107, 115], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`${title.toLowerCase().replaceAll(' ', '-')}.pdf`);
}

function download(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
