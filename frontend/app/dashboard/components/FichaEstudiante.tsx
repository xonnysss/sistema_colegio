'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { SCHOOL_CONFIG, calcularEdad, formatDate, formatMoney } from '../../../lib/config';
import { imprimirReciboPdf } from '../../../lib/documents';
import { Boletin } from './Boletin';

type Row = Record<string, unknown>;

export function FichaEstudiante({
  estudianteId,
  onBack,
}: {
  estudianteId: number;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'datos' | 'historial' | 'notas' | 'pagos'>('datos');
  const [data, setData] = useState<{
    estudiante: Row;
    curso_actual: Row | null;
    inscripciones: Row[];
    pagos: Row[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedInscripcionId, setSelectedInscripcionId] = useState<number | null>(null);
  const [boletinData, setBoletinData] = useState<any>(null);
  const [loadingBoletin, setLoadingBoletin] = useState(false);

  useEffect(() => {
    async function loadFicha() {
      setLoading(true);
      setError('');
      try {
        const res = await api(`/reportes/estudiantes/${estudianteId}/ficha`);
        setData(res);
        if (res.inscripciones && res.inscripciones.length > 0) {
          setSelectedInscripcionId(Number(res.inscripciones[0].id_inscripcion));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar la ficha');
      } finally {
        setLoading(false);
      }
    }
    void loadFicha();
  }, [estudianteId]);

  useEffect(() => {
    if (selectedInscripcionId && (activeTab === 'notas' || activeTab === 'historial')) {
      setLoadingBoletin(true);
      api(`/reportes/boletin/${selectedInscripcionId}`)
        .then((b) => setBoletinData(b))
        .catch(() => setBoletinData(null))
        .finally(() => setLoadingBoletin(false));
    }
  }, [selectedInscripcionId, activeTab]);

  if (loading) return <p className="notice">Cargando ficha del estudiante…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="notice">No se encontró información del estudiante.</p>;

  const est = data.estudiante;
  const curso = data.curso_actual;
  const edad = calcularEdad(String(est.fecha_nacimiento ?? ''));
  const cursoStr = curso
    ? `${curso.grado ?? ''} ${curso.paralelo ?? ''} · ${curso.nivel ?? ''} · ${curso.turno ?? ''} · ${curso.gestion ?? ''}`
    : 'Sin curso actual';

  // Tutor WhatsApp
  const telLimpio = String(est.tutor_celular ?? '').replace(/\D/g, '');
  const waMensaje = encodeURIComponent(`Estimado/a ${est.tutor_nombre ?? 'tutor/a'}, le saludamos de Marco School en relación a su hijo/a ${est.nombres} ${est.apellidos}.`);
  const waUrl = telLimpio ? `https://wa.me/591${telLimpio}?text=${waMensaje}` : null;

  // Filtrar pagos por inscripción seleccionada
  const selectedInsc = data.inscripciones.find((i) => Number(i.id_inscripcion) === selectedInscripcionId) ?? data.inscripciones[0];
  const pagosInsc = data.pagos.filter((p) => Number(p.inscripcion_id) === Number(selectedInsc?.id_inscripcion));
  const pagosPorMesMap = new Map<number, Row>();
  let totalPagadoGestion = 0;
  for (const p of pagosInsc) {
    pagosPorMesMap.set(Number(p.mes), p);
    totalPagadoGestion += Number(p.monto_pagado ?? 0);
  }

  // Generar cuadrícula de meses
  const mesesGrid = [];
  const nombresMeses = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  for (let m = SCHOOL_CONFIG.MES_INICIO_PENSIONES; m <= SCHOOL_CONFIG.MES_FIN_PENSIONES; m++) {
    const pago = pagosPorMesMap.get(m);
    mesesGrid.push({
      mes: m,
      nombreMes: nombresMeses[m],
      pagado: Boolean(pago),
      pago,
    });
  }

  async function handleDescargarRecibo(pagoId: number) {
    try {
      const rec = await api(`/reportes/recibo/${pagoId}`);
      await imprimirReciboPdf(rec);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo descargar el recibo');
    }
  }

  return (
    <section className="ficha-estudiante">
      <div className="ficha-header">
        <div>
          <button type="button" className="outline back-btn" onClick={onBack}>
            ← Volver a estudiantes
          </button>
          <h1>{String(est.nombres ?? '')} {String(est.apellidos ?? '')}</h1>
          <div className="ficha-meta-tags">
            <span>RUDE: <strong>{String(est.rude ?? '—')}</strong></span>
            <span>C.I.: <strong>{String(est.ci ?? '—')}</strong></span>
            <span>Edad: <strong>{edad !== null ? `${edad} años` : '—'}</strong></span>
            <span>Curso: <strong>{cursoStr}</strong></span>
            <span className={`badge ${est.estado === 1 ? 'badge-activo' : 'badge-baja'}`}>
              {est.estado === 1 ? 'Activo' : 'Baja'}
            </span>
          </div>
        </div>
      </div>

      <nav className="ficha-tabs">
        <button
          type="button"
          className={activeTab === 'datos' ? 'active' : ''}
          onClick={() => setActiveTab('datos')}
        >
          Datos personales
        </button>
        <button
          type="button"
          className={activeTab === 'historial' ? 'active' : ''}
          onClick={() => setActiveTab('historial')}
        >
          Historial académico ({data.inscripciones.length})
        </button>
        <button
          type="button"
          className={activeTab === 'notas' ? 'active' : ''}
          onClick={() => setActiveTab('notas')}
        >
          Notas y boletín
        </button>
        <button
          type="button"
          className={activeTab === 'pagos' ? 'active' : ''}
          onClick={() => setActiveTab('pagos')}
        >
          Control de pagos
        </button>
      </nav>

      <div className="ficha-body">
        {activeTab === 'datos' && (
          <div className="tab-grid">
            <article className="info-card">
              <h3>Datos del Estudiante</h3>
              <dl>
                <dt>Nombres y Apellidos</dt>
                <dd>{String(est.nombres ?? '')} {String(est.apellidos ?? '')}</dd>
                <dt>RUDE</dt>
                <dd>{String(est.rude ?? '—')}</dd>
                <dt>Cédula de Identidad</dt>
                <dd>{String(est.ci ?? '—')}</dd>
                <dt>Fecha de nacimiento</dt>
                <dd>{formatDate(String(est.fecha_nacimiento ?? ''))} ({edad !== null ? `${edad} años` : '—'})</dd>
                <dt>Cuenta de acceso</dt>
                <dd>{est.cuenta_acceso ? String(est.cuenta_acceso) : <em>Sin cuenta asignada</em>}</dd>
              </dl>
            </article>

            <article className="info-card">
              <h3>Datos del Tutor</h3>
              <dl>
                <dt>Nombre del tutor</dt>
                <dd>{String(est.tutor_nombre ?? '—')}</dd>
                <dt>Celular de contacto</dt>
                <dd>
                  {est.tutor_celular ? (
                    <span className="tutor-phone-wrap">
                      {String(est.tutor_celular)}
                      {waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="wa-btn"
                          title="Contactar por WhatsApp"
                        >
                          💬 WhatsApp
                        </a>
                      )}
                    </span>
                  ) : '—'}
                </dd>
              </dl>
            </article>
          </div>
        )}

        {activeTab === 'historial' && (
          <div>
            <h3>Historial de Inscripciones</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Gestión</th>
                    <th>Curso</th>
                    <th>Nivel</th>
                    <th>Turno</th>
                    <th>Fecha Inscripción</th>
                    <th>Promedio Final</th>
                    <th>Estado del Año</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {data.inscripciones.map((insc) => (
                    <tr key={String(insc.id_inscripcion)}>
                      <td><strong>{String(insc.gestion ?? '')}</strong></td>
                      <td>{String(insc.grado ?? '')} {String(insc.paralelo ?? '')}</td>
                      <td>{String(insc.nivel ?? '')}</td>
                      <td>{String(insc.turno ?? '')}</td>
                      <td>{formatDate(String(insc.fecha_inscripcion ?? ''))}</td>
                      <td style={{ fontWeight: 'bold' }}>
                        {insc.promedio_general ? Number(insc.promedio_general).toFixed(2) : '—'}
                      </td>
                      <td>
                        <span className={`badge ${insc.estado_academico === 'Aprobado' ? 'badge-aprobado' : insc.estado_academico === 'Reprobado' ? 'badge-reprobado' : 'badge-parcial'}`}>
                          {String(insc.estado_academico ?? 'En curso')}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="outline"
                          onClick={() => {
                            setSelectedInscripcionId(Number(insc.id_inscripcion));
                            setActiveTab('notas');
                          }}
                        >
                          Ver boletín
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'notas' && (
          <div>
            <div className="tab-control-bar">
              <label>
                Seleccionar Gestión / Inscripción:
                <select
                  value={selectedInscripcionId ?? ''}
                  onChange={(e) => setSelectedInscripcionId(Number(e.target.value))}
                >
                  {data.inscripciones.map((insc) => (
                    <option key={String(insc.id_inscripcion)} value={String(insc.id_inscripcion)}>
                      Gestión {String(insc.gestion)} — {String(insc.grado)} {String(insc.paralelo)} ({String(insc.nivel)})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {loadingBoletin ? (
              <p className="notice">Cargando boletín…</p>
            ) : boletinData ? (
              <Boletin data={boletinData} />
            ) : (
              <p className="notice">No se encontraron calificaciones para esta inscripción.</p>
            )}
          </div>
        )}

        {activeTab === 'pagos' && (
          <div>
            <div className="tab-control-bar">
              <label>
                Gestión / Inscripción:
                <select
                  value={selectedInscripcionId ?? ''}
                  onChange={(e) => setSelectedInscripcionId(Number(e.target.value))}
                >
                  {data.inscripciones.map((insc) => (
                    <option key={String(insc.id_inscripcion)} value={String(insc.id_inscripcion)}>
                      Gestión {String(insc.gestion)} — {String(insc.grado)} {String(insc.paralelo)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="total-pagos-badge">
                Total pagado en esta gestión: <strong>{formatMoney(totalPagadoGestion)}</strong>
              </div>
            </div>

            <div className="meses-grid">
              {mesesGrid.map((m) => (
                <div
                  key={m.mes}
                  className={`mes-card ${m.pagado ? 'mes-pagado' : 'mes-pendiente'}`}
                >
                  <div className="mes-card-header">
                    <strong>{m.nombreMes}</strong>
                    <span className={`badge ${m.pagado ? 'badge-aprobado' : 'badge-baja'}`}>
                      {m.pagado ? 'Pagado' : 'Pendiente'}
                    </span>
                  </div>
                  {m.pagado && m.pago ? (
                    <div className="mes-card-body">
                      <p className="mes-monto">{formatMoney(Number(m.pago.monto_pagado))}</p>
                      <small>Recibo: {String(m.pago.nro_recibo ?? '—')}</small>
                      <small>Fecha: {formatDate(String(m.pago.fecha_pago ?? ''))}</small>
                      <button
                        type="button"
                        className="outline print-recibo-btn"
                        onClick={() => handleDescargarRecibo(Number(m.pago!.id_pago))}
                      >
                        🖨 Recibo
                      </button>
                    </div>
                  ) : (
                    <div className="mes-card-body">
                      <p className="mes-sin-pago">Sin registro de pago</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
