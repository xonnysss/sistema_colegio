'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { SCHOOL_CONFIG, formatNumber } from '../../../lib/config';

type MateriaInfo = {
  id_materia: number;
  sigla: string;
  nombre_materia: string;
  docente: string;
};

type NotaData = {
  p1: number | null;
  p2: number | null;
  p3: number | null;
  p4: number | null;
  promedio: number | null;
  completo?: boolean;
  estado?: string;
};

type FilaAlumno = {
  numero: number;
  inscripcion_id: number;
  estudiante: string;
  rude: string;
  ci: string;
  notas: Record<number, NotaData>;
  promedio_general: number | null;
  reprobadas: number;
  estado: string;
};

export function Centralizador({ catalogs }: { catalogs: any }) {
  const requestId = useRef(0);
  const [gestion, setGestion] = useState('2026');
  const [nivel, setNivel] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [modo, setModo] = useState<'promedio' | 'periodo'>('promedio');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    curso: any;
    materias: MateriaInfo[];
    filas: FilaAlumno[];
    promedios_materia: Record<number, number | null>;
    promedio_curso: number | null;
  } | null>(null);

  const cursosDisponibles = (catalogs.cursos ?? []).filter(
    (c: any) =>
      (!gestion || String(c.gestion) === String(gestion)) &&
      (!nivel || c.nivel === nivel)
  );

  useEffect(() => {
    const isCurrentValid = cursosDisponibles.some((c: any) => String(c.id_curso) === String(cursoId));
    if (!isCurrentValid) {
      if (cursosDisponibles.length > 0) {
        setCursoId(String(cursosDisponibles[0].id_curso));
      } else {
        setCursoId('');
        setData(null);
      }
    }
  }, [cursosDisponibles, cursoId]);

  const loadCentralizador = useCallback(async () => {
    const id = ++requestId.current;
    setData(null);
    if (!cursoId) return;
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ gestion, cursoId, modo });
      const res = await api(`/reportes/centralizador?${q}`);
      if (id === requestId.current) setData(res);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : 'No se pudo cargar el centralizador');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [gestion, cursoId, modo]);

  useEffect(() => {
    void loadCentralizador();
    return () => { requestId.current++; };
  }, [loadCentralizador]);

  const years: string[] = Array.from(new Set<string>((catalogs.cursos ?? []).map((c: any) => String(c.gestion)).filter(Boolean))).sort((a, b) => Number(b) - Number(a));

  const exportarPdfCentralizador = async () => {
    if (!data || !data.curso) return;
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
    const cursoStr = `${data.curso.nombre} ${data.curso.paralelo} · ${data.curso.nivel} (${data.curso.turno})`;
    const title = `Centralizador · ${cursoStr} · Gestión ${data.curso.gestion}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(6, 107, 115);
    doc.text(SCHOOL_CONFIG.NOMBRE_COLEGIO, 14, 12);

    doc.setFontSize(12);
    doc.setTextColor(23, 50, 77);
    doc.text(title, 14, 18);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(97, 117, 138);
    const hoy = new Date();
    doc.text(`Fecha: ${hoy.toLocaleDateString('es-BO')} | Alumnos: ${data.filas.length} | Modo: ${modo === 'promedio' ? 'Promedio acumulado' : 'Por períodos'}`, 14, 23);

    // Encabezados
    let head: string[][] = [];
    if (modo === 'promedio') {
      head = [[
        'N.º',
        'Apellidos y Nombres',
        'RUDE',
        ...data.materias.map((m) => m.sigla),
        'Promedio',
        'Reprobadas',
        'Estado'
      ]];
    } else {
      const row1 = ['N.º', 'Apellidos y Nombres', 'RUDE'];
      for (const m of data.materias) {
        row1.push(`${m.sigla} P1`, 'P2', 'P3', 'P4', 'Prom');
      }
      row1.push('Prom. Gral', 'Rep.', 'Estado');
      head = [row1];
    }

    // Filas
    const body: any[] = data.filas.map((f, idx) => {
      if (modo === 'promedio') {
        const row = [
          idx + 1,
          f.estudiante,
          f.rude,
          ...data.materias.map((m) => {
            const nota = f.notas[m.id_materia];
            return nota && nota.promedio !== null ? formatNumber(nota.promedio, 1) : '—';
          }),
          f.promedio_general !== null ? formatNumber(f.promedio_general, 2) : '—',
          f.reprobadas,
          f.estado
        ];
        return row;
      } else {
        const row = [
          idx + 1,
          f.estudiante,
          f.rude,
        ];
        for (const m of data.materias) {
          const nota = f.notas[m.id_materia] ?? { p1: null, p2: null, p3: null, p4: null, promedio: null };
          row.push(
            nota.p1 !== null ? formatNumber(nota.p1, 1) : '—',
            nota.p2 !== null ? formatNumber(nota.p2, 1) : '—',
            nota.p3 !== null ? formatNumber(nota.p3, 1) : '—',
            nota.p4 !== null ? formatNumber(nota.p4, 1) : '—',
            nota.promedio !== null ? formatNumber(nota.promedio, 1) : '—'
          );
        }
        row.push(
          f.promedio_general !== null ? formatNumber(f.promedio_general, 2) : '—',
          f.reprobadas,
          f.estado
        );
        return row;
      }
    });

    // Fila de promedios al pie
    if (modo === 'promedio') {
      const footerRow = [
        '',
        'PROMEDIO POR MATERIA',
        '',
        ...data.materias.map((m) => {
          const avg = data.promedios_materia[m.id_materia];
          return avg !== null && avg !== undefined ? formatNumber(avg, 2) : '—';
        }),
        data.promedio_curso !== null ? formatNumber(data.promedio_curso, 2) : '—',
        '',
        ''
      ];
      body.push(footerRow);
    }

    autoTable(doc, {
      head,
      body,
      startY: 27,
      styles: { fontSize: 7, cellPadding: 1.5, font: 'helvetica' },
      headStyles: { fillColor: [6, 107, 115], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`centralizador-${data.curso.nombre}-${data.curso.paralelo}-${data.curso.gestion}.pdf`);
  };

  const exportarExcelCentralizador = () => {
    if (!data || !data.curso) return;
    const headers: string[] = ['N.º', 'Apellidos y Nombres', 'RUDE', 'C.I.'];
    if (modo === 'promedio') {
      data.materias.forEach((m) => headers.push(`${m.nombre_materia} (${m.sigla})`));
      headers.push('Promedio General', 'Reprobadas', 'Estado');
    } else {
      data.materias.forEach((m) => {
        headers.push(`${m.sigla} P1`, `${m.sigla} P2`, `${m.sigla} P3`, `${m.sigla} P4`, `${m.sigla} Prom`);
      });
      headers.push('Promedio General', 'Reprobadas', 'Estado');
    }

    const lines = [headers];
    data.filas.forEach((f, idx) => {
      const line: any[] = [idx + 1, f.estudiante, f.rude, f.ci];
      if (modo === 'promedio') {
        data.materias.forEach((m) => {
          const n = f.notas[m.id_materia];
          line.push(n && n.promedio !== null ? String(n.promedio).replace('.', ',') : '');
        });
      } else {
        data.materias.forEach((m) => {
          const n = f.notas[m.id_materia];
          line.push(
            n?.p1 !== null && n?.p1 !== undefined ? String(n.p1).replace('.', ',') : '',
            n?.p2 !== null && n?.p2 !== undefined ? String(n.p2).replace('.', ',') : '',
            n?.p3 !== null && n?.p3 !== undefined ? String(n.p3).replace('.', ',') : '',
            n?.p4 !== null && n?.p4 !== undefined ? String(n.p4).replace('.', ',') : '',
            n?.promedio !== null && n?.promedio !== undefined ? String(n.promedio).replace('.', ',') : ''
          );
        });
      }
      line.push(
        f.promedio_general !== null ? String(f.promedio_general).replace('.', ',') : '',
        f.reprobadas,
        f.estado
      );
      lines.push(line);
    });

    const escape = (val: any) => `"${String(val ?? '').replaceAll('"', '""')}"`;
    const csvContent = lines.map((l) => l.map(escape).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `centralizador-${data.curso.nombre}-${data.curso.paralelo}-${data.curso.gestion}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="centralizador-section">
      <p>Los promedios son parciales mientras falten períodos. Notas completas no significa gestión cerrada; este sistema permite correcciones.</p>
      <div className="filters">
        <label>
          Gestión
          <select value={gestion} onChange={(e) => setGestion(e.target.value)}>
            {(years.length ? years : ['2026', '2025']).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        <label>
          Nivel
          <select value={nivel} onChange={(e) => setNivel(e.target.value)}>
            <option value="">Todos los niveles</option>
            <option value="PRIMARIA">PRIMARIA</option>
            <option value="SECUNDARIA">SECUNDARIA</option>
            <option value="INICIAL">INICIAL</option>
          </select>
        </label>

        <label>
          Curso
          <select value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
            {cursosDisponibles.map((c: any) => (
              <option key={c.id_curso} value={String(c.id_curso)}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label>
          Modo de visualización
          <select value={modo} onChange={(e) => setModo(e.target.value as any)}>
            <option value="promedio">Promedio acumulado</option>
            <option value="periodo">Por período (P1–P4)</option>
          </select>
        </label>

        <div className="export-actions" style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
          <button type="button" className="outline" onClick={exportarExcelCentralizador} disabled={!data?.filas.length}>
            Excel
          </button>
          <button type="button" className="outline" onClick={exportarPdfCentralizador} disabled={!data?.filas.length}>
            PDF Horizontal
          </button>
        </div>
      </div>

      {loading && <p className="notice">Cargando centralizador…</p>}
      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <div className="module-head" style={{ marginTop: 12 }}>
            <h2>
              {data.curso ? `${data.curso.nombre} ${data.curso.paralelo} · ${data.curso.nivel} (${data.curso.turno}) — Gestión ${data.curso.gestion}` : 'Curso'}
            </h2>
            <p>
              Estudiantes: <strong>{data.filas.length}</strong> | Materias: <strong>{data.materias.length}</strong>
              {data.promedio_curso !== null && (
                <> | Promedio del curso: <strong>{formatNumber(data.promedio_curso, 2)}</strong></>
              )}
            </p>
          </div>

          {!data.filas.length ? (
            <p className="notice">Este curso aún no tiene estudiantes inscritos.</p>
          ) : (
            <div className="table-wrap centralizador-table-wrap">
              <table className="centralizador-table">
                <thead>
                  {modo === 'promedio' ? (
                    <tr>
                      <th style={{ width: 40, textAlign: 'center' }}>N.º</th>
                      <th>Apellidos y Nombres</th>
                      {data.materias.map((m) => (
                        <th key={m.id_materia} style={{ textAlign: 'center' }} title={`${m.nombre_materia} — Prof. ${m.docente}`}>
                          <span className="materia-tag">{m.sigla}</span>
                        </th>
                      ))}
                      <th style={{ textAlign: 'center' }}>Promedio</th>
                      <th style={{ textAlign: 'center' }}>Rep.</th>
                      <th style={{ textAlign: 'center' }}>Estado</th>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <th rowSpan={2} style={{ width: 40, textAlign: 'center' }}>N.º</th>
                        <th rowSpan={2}>Apellidos y Nombres</th>
                        {data.materias.map((m) => (
                          <th key={m.id_materia} colSpan={5} style={{ textAlign: 'center' }} title={`${m.nombre_materia} — Prof. ${m.docente}`}>
                            <span className="materia-tag">{m.sigla}</span>
                          </th>
                        ))}
                        <th rowSpan={2} style={{ textAlign: 'center' }}>Promedio</th>
                        <th rowSpan={2} style={{ textAlign: 'center' }}>Rep.</th>
                        <th rowSpan={2} style={{ textAlign: 'center' }}>Estado</th>
                      </tr>
                      <tr>
                        {data.materias.map((m) => (
                          <Fragment key={`sub-${m.id_materia}`}>
                            <th style={{ textAlign: 'center', fontSize: '0.68rem', padding: '4px' }}>P1</th>
                            <th style={{ textAlign: 'center', fontSize: '0.68rem', padding: '4px' }}>P2</th>
                            <th style={{ textAlign: 'center', fontSize: '0.68rem', padding: '4px' }}>P3</th>
                            <th style={{ textAlign: 'center', fontSize: '0.68rem', padding: '4px' }}>P4</th>
                            <th style={{ textAlign: 'center', fontSize: '0.68rem', padding: '4px', fontWeight: 'bold' }}>Avg</th>
                          </Fragment>
                        ))}
                      </tr>
                    </>
                  )}
                </thead>
                <tbody>
                  {data.filas.map((f) => (
                    <tr key={f.inscripcion_id}>
                      <td style={{ textAlign: 'center' }}>{f.numero}</td>
                      <td>
                        <strong>{f.estudiante}</strong>
                        <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.72rem' }}>
                          RUDE: {f.rude}
                        </small>
                      </td>

                      {modo === 'promedio' ? (
                        <>
                          {data.materias.map((m) => {
                            const n = f.notas[m.id_materia];
                            const val = n?.promedio;
                            const isReprobada = val !== null && val !== undefined && val < SCHOOL_CONFIG.NOTA_APROBACION;
                            const isRiesgo = val !== null && val !== undefined && val >= SCHOOL_CONFIG.NOTA_APROBACION && val < SCHOOL_CONFIG.NOTA_RIESGO;
                            return (
                              <td
                                key={m.id_materia}
                                style={{ textAlign: 'center' }}
                                className={isReprobada ? 'nota-reprobada' : isRiesgo ? 'nota-riesgo' : ''}
                              >
                                {val !== null && val !== undefined ? formatNumber(val, 1) : '—'}
                              </td>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          {data.materias.map((m) => {
                            const n = f.notas[m.id_materia];
                            const avg = n?.promedio;
                            return (
                              <Fragment key={`cells-${m.id_materia}`}>
                                <td style={{ textAlign: 'center' }} className={n?.p1 !== null && n?.p1 !== undefined && n.p1 < SCHOOL_CONFIG.NOTA_APROBACION ? 'nota-reprobada' : ''}>
                                  {n?.p1 !== null && n?.p1 !== undefined ? formatNumber(n.p1, 1) : '—'}
                                </td>
                                <td style={{ textAlign: 'center' }} className={n?.p2 !== null && n?.p2 !== undefined && n.p2 < SCHOOL_CONFIG.NOTA_APROBACION ? 'nota-reprobada' : ''}>
                                  {n?.p2 !== null && n?.p2 !== undefined ? formatNumber(n.p2, 1) : '—'}
                                </td>
                                <td style={{ textAlign: 'center' }} className={n?.p3 !== null && n?.p3 !== undefined && n.p3 < SCHOOL_CONFIG.NOTA_APROBACION ? 'nota-reprobada' : ''}>
                                  {n?.p3 !== null && n?.p3 !== undefined ? formatNumber(n.p3, 1) : '—'}
                                </td>
                                <td style={{ textAlign: 'center' }} className={n?.p4 !== null && n?.p4 !== undefined && n.p4 < SCHOOL_CONFIG.NOTA_APROBACION ? 'nota-reprobada' : ''}>
                                  {n?.p4 !== null && n?.p4 !== undefined ? formatNumber(n.p4, 1) : '—'}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold' }} className={avg !== null && avg !== undefined && avg < SCHOOL_CONFIG.NOTA_APROBACION ? 'nota-reprobada' : ''}>
                                  {avg !== null && avg !== undefined ? formatNumber(avg, 1) : '—'}
                                </td>
                              </Fragment>
                            );
                          })}
                        </>
                      )}

                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        {f.promedio_general !== null ? formatNumber(f.promedio_general, 2) : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }} className={f.reprobadas > 0 ? 'nota-reprobada' : ''}>
                        {f.reprobadas}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${f.estado === 'Aprobado' ? 'badge-aprobado' : f.estado === 'Reprobado' ? 'badge-reprobado' : 'badge-parcial'}`}>
                          {f.estado}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Fila final de promedios */}
                  {modo === 'promedio' && (
                    <tr className="fila-promedios-footer">
                      <td colSpan={2} style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        PROMEDIO DE MATERIA:
                      </td>
                      {data.materias.map((m) => {
                        const avg = data.promedios_materia[m.id_materia];
                        return (
                          <td key={`avg-${m.id_materia}`} style={{ textAlign: 'center', fontWeight: 'bold' }}>
                            {avg !== null && avg !== undefined ? formatNumber(avg, 2) : '—'}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--accent)' }}>
                        {data.promedio_curso !== null ? formatNumber(data.promedio_curso, 2) : '—'}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
