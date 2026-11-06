'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { SCHOOL_CONFIG, formatMoney } from '../../../lib/config';
import { exportExcel, exportPdf } from '../../../lib/export';

type AlumnoMora = {
  id_inscripcion: number;
  estudiante: string;
  curso: string;
  tutor: string;
  celular: string;
  meses_pagados: number;
  meses_adeudados: string;
  cantidad_meses_adeudados: number;
  ultimo_pago: string;
  deuda_referencial: number | null;
};

export function Mora({ catalogs }: { catalogs: any }) {
  const [gestion, setGestion] = useState('2026');
  const [nivel, setNivel] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [turno, setTurno] = useState('');
  const [mesCorte, setMesCorte] = useState(() => {
    const m = new Date().getMonth() + 1;
    return String(Math.max(SCHOOL_CONFIG.MES_INICIO_PENSIONES, Math.min(m, SCHOOL_CONFIG.MES_FIN_PENSIONES)));
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    estudiantes: AlumnoMora[];
    total_alumnos_mora: number;
    deuda_referencial_total: number;
    mes_corte: number;
    gestion: number;
  } | null>(null);

  const loadMora = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ gestion, mes: mesCorte });
      if (nivel) q.set('nivel', nivel);
      if (cursoId) q.set('cursoId', cursoId);
      if (turno) q.set('turno', turno);
      const res = await api(`/reportes/morosidad?${q}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el reporte de mora');
    } finally {
      setLoading(false);
    }
  }, [gestion, mesCorte, nivel, cursoId, turno]);

  useEffect(() => {
    void loadMora();
  }, [loadMora]);

  const years: string[] = Array.from(new Set<string>((catalogs.cursos ?? []).map((c: any) => String(c.gestion)).filter(Boolean))).sort((a, b) => Number(b) - Number(a));
  const cursosFiltrados = (catalogs.cursos ?? []).filter(
    (c: any) => (!gestion || String(c.gestion) === String(gestion)) && (!nivel || c.nivel === nivel)
  );

  useEffect(() => {
    if (cursoId && !cursosFiltrados.some((c: any) => String(c.id_curso) === String(cursoId))) {
      setCursoId('');
    }
  }, [cursosFiltrados, cursoId]);

  const mesesNombres = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const mesesCorteOptions = [];
  for (let m = SCHOOL_CONFIG.MES_INICIO_PENSIONES; m <= SCHOOL_CONFIG.MES_FIN_PENSIONES; m++) {
    mesesCorteOptions.push({ value: String(m), label: mesesNombres[m] });
  }

  const exportRows = (data?.estudiantes ?? []).map((e) => ({
    Estudiante: e.estudiante,
    Curso: e.curso,
    Tutor: e.tutor,
    Celular: e.celular,
    'Meses pagados': e.meses_pagados,
    'Meses adeudados': e.meses_adeudados,
    'Último pago': e.ultimo_pago,
    'Deuda referencial': e.deuda_referencial !== null ? formatMoney(e.deuda_referencial) : '—',
  }));

  return (
    <section className="mora-section">
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
          Mes de corte
          <select value={mesCorte} onChange={(e) => setMesCorte(e.target.value)}>
            {mesesCorteOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Nivel
          <select value={nivel} onChange={(e) => { setNivel(e.target.value); setCursoId(''); }}>
            <option value="">Todos los niveles</option>
            <option value="PRIMARIA">PRIMARIA</option>
            <option value="SECUNDARIA">SECUNDARIA</option>
            <option value="INICIAL">INICIAL</option>
          </select>
        </label>

        <label>
          Curso
          <select value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
            <option value="">Todos los cursos</option>
            {cursosFiltrados.map((c: any) => (
              <option key={c.id_curso} value={String(c.id_curso)}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label>
          Turno
          <select value={turno} onChange={(e) => setTurno(e.target.value)}>
            <option value="">Todos</option>
            <option value="MAÑANA">MAÑANA</option>
            <option value="TARDE">TARDE</option>
            <option value="NOCHE">NOCHE</option>
          </select>
        </label>

        <button type="button" onClick={loadMora}>
          Aplicar filtros
        </button>

        <div className="export-actions" style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="outline"
            onClick={() => exportExcel(`reporte-mora-${mesesNombres[Number(mesCorte)]}-${gestion}`, exportRows)}
            disabled={!exportRows.length}
          >
            Excel
          </button>
          <button
            type="button"
            className="outline"
            onClick={() => exportPdf(`Reporte de Mora · ${mesesNombres[Number(mesCorte)]} ${gestion}`, exportRows)}
            disabled={!exportRows.length}
          >
            PDF
          </button>
        </div>
      </div>

      {loading && <p className="notice">Cargando reporte de mora…</p>}
      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <div className="module-head" style={{ marginTop: 12 }}>
            <h2>Control de Morosidad al mes de {mesesNombres[data.mes_corte]} ({data.gestion})</h2>
            <div className="stats-badges">
              <span>Alumnos en mora: <strong>{data.total_alumnos_mora}</strong></span>
              <span>Deuda referencial estimada: <strong>{formatMoney(data.deuda_referencial_total)}</strong></span>
            </div>
          </div>

          <p className="nota-referencial">
            ℹ️ <em>Estimación basada en pagos anteriores. El colegio aún no tiene una tarifa mensual registrada.</em>
          </p>

          {!data.estudiantes.length ? (
            <p className="notice" style={{ textAlign: 'center', padding: '24px' }}>
              🎉 No hay estudiantes con pensiones pendientes a este mes.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Curso</th>
                    <th>Tutor</th>
                    <th>Contacto WhatsApp</th>
                    <th style={{ textAlign: 'center' }}>Meses Pagados</th>
                    <th>Meses Adeudados</th>
                    <th>Último Pago</th>
                    <th style={{ textAlign: 'right' }}>Deuda Referencial</th>
                  </tr>
                </thead>
                <tbody>
                  {data.estudiantes.map((e) => {
                    const cant = e.cantidad_meses_adeudados;
                    const gravedadClass = cant >= 4 ? 'mora-grave' : cant >= 2 ? 'mora-media' : 'mora-leve';

                    const telLimpio = String(e.celular ?? '').replace(/\D/g, '');
                    const waText = encodeURIComponent(
                      `Estimado/a ${e.tutor}, le recordamos cordialmente desde Marco School la pensión pendiente de su hijo/a ${e.estudiante} correspondiente a los meses: ${e.meses_adeudados}.`
                    );
                    const waUrl = telLimpio ? `https://wa.me/591${telLimpio}?text=${waText}` : null;

                    return (
                      <tr key={e.id_inscripcion} className={gravedadClass}>
                        <td><strong>{e.estudiante}</strong></td>
                        <td>{e.curso}</td>
                        <td>{e.tutor}</td>
                        <td>
                          {e.celular ? (
                            <span className="tutor-phone-wrap">
                              {e.celular}
                              {waUrl && (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="wa-btn"
                                  title="Enviar recordatorio por WhatsApp"
                                >
                                  💬 Recordar
                                </a>
                              )}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-activo">{e.meses_pagados}</span>
                        </td>
                        <td>
                          <span className={`badge ${cant >= 4 ? 'badge-reprobado' : cant >= 2 ? 'badge-parcial' : 'badge-baja'}`}>
                            {e.meses_adeudados}
                          </span>
                        </td>
                        <td><small>{e.ultimo_pago}</small></td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                          {e.deuda_referencial !== null ? formatMoney(e.deuda_referencial) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="fila-promedios-footer">
                    <td colSpan={5} style={{ fontWeight: 'bold' }}>
                      TOTALES: {data.total_alumnos_mora} estudiante(s) en mora
                    </td>
                    <td colSpan={2}></td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--accent)' }}>
                      {formatMoney(data.deuda_referencial_total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
