import { SCHOOL_CONFIG, formatDate, formatMoney, formatNumber, montoEnLetras } from './config';

type Row = Record<string, unknown>;

export async function imprimirBoletinPdf(data: {
  estudiante: Row;
  materias: Row[];
  resumen?: {
    promedio_general: number | null;
    aprobadas: number;
    reprobadas: number;
    pendientes: number;
    estado_general: string;
  };
}) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' });
  const est = data.estudiante;
  const materias = data.materias;
  const res = data.resumen;

  // Encabezado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(6, 107, 115);
  doc.text(SCHOOL_CONFIG.NOMBRE_COLEGIO, 105, 18, { align: 'center' });

  doc.setFontSize(13);
  doc.setTextColor(23, 50, 77);
  doc.text('BOLETÍN OFICIAL DE CALIFICACIONES', 105, 26, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(97, 117, 138);
  doc.text(`Gestión Académica ${est.gestion ?? ''}`, 105, 31, { align: 'center' });

  // Cuadro de datos del estudiante
  doc.setDrawColor(220, 228, 237);
  doc.setFillColor(244, 247, 251);
  doc.roundedRect(14, 35, 182, 24, 3, 3, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(23, 50, 77);

  // Columna 1
  doc.setFont('helvetica', 'bold');
  doc.text('Estudiante:', 18, 41);
  doc.setFont('helvetica', 'normal');
  doc.text(`${est.apellidos ?? ''} ${est.nombres ?? ''}`, 38, 41);

  doc.setFont('helvetica', 'bold');
  doc.text('RUDE:', 18, 47);
  doc.setFont('helvetica', 'normal');
  doc.text(String(est.rude ?? '—'), 38, 47);

  doc.setFont('helvetica', 'bold');
  doc.text('C.I.:', 18, 53);
  doc.setFont('helvetica', 'normal');
  doc.text(String(est.ci ?? '—'), 38, 53);

  // Columna 2
  const cursoStr = `${est.grado ?? est.nombre ?? ''} ${est.paralelo ?? ''} - ${est.nivel ?? ''}`;
  doc.setFont('helvetica', 'bold');
  doc.text('Curso:', 110, 41);
  doc.setFont('helvetica', 'normal');
  doc.text(cursoStr, 126, 41);

  doc.setFont('helvetica', 'bold');
  doc.text('Turno:', 110, 47);
  doc.setFont('helvetica', 'normal');
  doc.text(String(est.turno ?? 'MAÑANA'), 126, 47);

  const hoy = new Date();
  const emisionStr = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
  doc.setFont('helvetica', 'bold');
  doc.text('Emisión:', 110, 53);
  doc.setFont('helvetica', 'normal');
  doc.text(emisionStr, 126, 53);

  // Tabla de materias
  const tableRows = materias.map((m, idx) => {
    const notas = (m.notas_por_periodo as Record<string, number | null>) ?? {};
    const p1 = notas['1'] !== null && notas['1'] !== undefined ? formatNumber(notas['1'], 1) : '—';
    const p2 = notas['2'] !== null && notas['2'] !== undefined ? formatNumber(notas['2'], 1) : '—';
    const p3 = notas['3'] !== null && notas['3'] !== undefined ? formatNumber(notas['3'], 1) : '—';
    const p4 = notas['4'] !== null && notas['4'] !== undefined ? formatNumber(notas['4'], 1) : '—';
    const finalStr = m.nota_final !== null && m.nota_final !== undefined ? formatNumber(Number(m.nota_final), 2) : '—';
    return [
      idx + 1,
      String(m.nombre_materia ?? ''),
      String(m.docente ?? '—'),
      p1, p2, p3, p4,
      finalStr,
      String(m.estado ?? 'Parcial')
    ];
  });

  autoTable(doc, {
    head: [['N.º', 'Materia', 'Docente', 'P1', 'P2', 'P3', 'P4', 'Promedio', 'Estado']],
    body: tableRows,
    startY: 63,
    styles: { fontSize: 8.5, cellPadding: 2.2, font: 'helvetica' },
    headStyles: { fillColor: [6, 107, 115], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 46 },
      2: { cellWidth: 40 },
      3: { halign: 'center', cellWidth: 12 },
      4: { halign: 'center', cellWidth: 12 },
      5: { halign: 'center', cellWidth: 12 },
      6: { halign: 'center', cellWidth: 12 },
      7: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
      8: { halign: 'center', cellWidth: 20 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        const val = hookData.cell.raw;
        if (typeof val === 'string' && val.includes(',')) {
          const num = parseFloat(val.replace(',', '.'));
          if (!isNaN(num) && num < SCHOOL_CONFIG.NOTA_APROBACION) {
            hookData.cell.styles.textColor = [168, 54, 54];
          }
        }
        if (hookData.column.index === 8) {
          if (val === 'Aprobada') {
            hookData.cell.styles.textColor = [6, 107, 115];
            hookData.cell.styles.fontStyle = 'bold';
          } else if (val === 'Reprobada') {
            hookData.cell.styles.textColor = [168, 54, 54];
            hookData.cell.styles.fontStyle = 'bold';
          }
        }
      }
    }
  });

  // Resumen al pie
  const finalY = (doc as any).lastAutoTable?.finalY ?? 180;
  const resumenY = Math.min(finalY + 6, 235);

  doc.setDrawColor(220, 228, 237);
  doc.setFillColor(244, 247, 251);
  doc.roundedRect(14, resumenY, 182, 18, 3, 3, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(23, 50, 77);
  doc.text('Promedio General:', 18, resumenY + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(res?.promedio_general ? formatNumber(res.promedio_general, 2) : '—', 50, resumenY + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('Estado Académico:', 80, resumenY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(
    res?.estado_general === 'Aprobado' ? 6 : res?.estado_general === 'Reprobado' ? 168 : 97,
    res?.estado_general === 'Aprobado' ? 107 : res?.estado_general === 'Reprobado' ? 54 : 117,
    res?.estado_general === 'Aprobado' ? 115 : res?.estado_general === 'Reprobado' ? 54 : 138
  );
  doc.text(res?.estado_general ?? 'En curso', 114, resumenY + 7);

  doc.setTextColor(23, 50, 77);
  doc.setFontSize(8.5);
  doc.text(`Materias Aprobadas: ${res?.aprobadas ?? 0}   |   Reprobadas: ${res?.reprobadas ?? 0}   |   Pendientes: ${res?.pendientes ?? 0}`, 18, resumenY + 13);

  // Líneas de firma al pie de página (fijas a Y=270)
  const lineY = 270;
  doc.setDrawColor(160, 174, 192);
  doc.line(20, lineY, 68, lineY);
  doc.line(81, lineY, 129, lineY);
  doc.line(142, lineY, 190, lineY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(97, 117, 138);
  doc.text('Director(a) General', 44, lineY + 4, { align: 'center' });
  doc.text('Docente de Curso', 105, lineY + 4, { align: 'center' });
  doc.text('Padre / Madre / Tutor', 166, lineY + 4, { align: 'center' });

  doc.save(`boletin-${String(est.rude ?? 'alumno').toLowerCase()}.pdf`);
}

export async function imprimirReciboPdf(recibo: any, copia = false) {
  const { jsPDF } = await import('jspdf');

  // Media hoja carta: 216 mm x 140 mm
  const doc = new jsPDF({
    format: [216, 140],
    unit: 'mm',
    orientation: 'landscape',
  });

  const colegio = recibo.colegio ?? SCHOOL_CONFIG.NOMBRE_COLEGIO;
  const montoNum = Number(recibo.monto_pagado ?? 0);
  const montoTexto = montoEnLetras(montoNum);

  // Marco exterior
  doc.setDrawColor(6, 107, 115);
  doc.setLineWidth(0.8);
  doc.rect(8, 8, 200, 124);

  doc.setDrawColor(220, 228, 237);
  doc.setLineWidth(0.3);
  doc.rect(10, 10, 196, 120);

  // Marca de agua o etiqueta ORIGINAL / COPIA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(copia ? 150 : 6, copia ? 150 : 107, copia ? 150 : 115);
  doc.text(copia ? '[ COPIA ]' : '[ ORIGINAL ]', 194, 17, { align: 'right' });

  // Encabezado
  doc.setFontSize(16);
  doc.setTextColor(6, 107, 115);
  doc.text(colegio, 14, 18);

  doc.setFontSize(11);
  doc.setTextColor(23, 50, 77);
  doc.text('RECIBO DE PENSIÓN ESCOLAR', 14, 25);

  // Cuadro con Nro. Recibo y Monto
  doc.setDrawColor(6, 107, 115);
  doc.setFillColor(244, 247, 251);
  doc.roundedRect(138, 22, 64, 18, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(23, 50, 77);
  doc.text('N.º Recibo:', 142, 28);
  doc.setFont('helvetica', 'normal');
  doc.text(String(recibo.nro_recibo ?? '—'), 162, 28);

  doc.setFont('helvetica', 'bold');
  doc.text('Monto:', 142, 35);
  doc.setFontSize(11);
  doc.setTextColor(6, 107, 115);
  doc.text(formatMoney(montoNum), 162, 35);

  // Fecha
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(97, 117, 138);
  doc.text(`Fecha de pago: ${formatDate(recibo.fecha_pago)}`, 14, 32);

  // Línea divisoria
  doc.setDrawColor(220, 228, 237);
  doc.line(14, 43, 198, 43);

  // Cuerpo del recibo
  let y = 52;
  const lineGap = 9;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(23, 50, 77);
  doc.text('Recibí de:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(recibo.pagado_por ?? 'Tutor'), 40, y);

  y += lineGap;
  doc.setFont('helvetica', 'bold');
  doc.text('Por concepto de:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Pensión correspondiente al mes de ${recibo.mes_nombre ?? `Mes ${recibo.mes}`} (Gestión ${recibo.gestion ?? ''})`, 44, y);

  y += lineGap;
  doc.setFont('helvetica', 'bold');
  doc.text('Estudiante:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${recibo.nombres ?? ''} ${recibo.apellidos ?? ''}`, 40, y);

  doc.setFont('helvetica', 'bold');
  doc.text('RUDE:', 130, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(recibo.rude ?? '—'), 145, y);

  y += lineGap;
  doc.setFont('helvetica', 'bold');
  doc.text('Curso:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${recibo.grado ?? ''} ${recibo.paralelo ?? ''} - ${recibo.nivel ?? ''} (Turno ${recibo.turno ?? ''})`, 40, y);

  y += lineGap;
  doc.setFont('helvetica', 'bold');
  doc.text('La suma de:', 14, y);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(6, 107, 115);
  doc.text(montoTexto, 40, y);

  // Línea de firma al pie
  const firmaY = 114;
  doc.setDrawColor(160, 174, 192);
  doc.line(135, firmaY, 190, firmaY);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(97, 117, 138);
  doc.text('Firma y Sello de Caja', 162, firmaY + 5, { align: 'center' });

  doc.text('Gracias por su pago puntual.', 14, firmaY + 5);

  doc.save(`recibo-${String(recibo.nro_recibo ?? 'pago').toLowerCase()}.pdf`);
}
