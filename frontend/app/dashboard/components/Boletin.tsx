'use client';
import { SCHOOL_CONFIG, formatNumber } from '../../../lib/config';
import { imprimirBoletinPdf } from '../../../lib/documents';

type Row = Record<string, unknown>;

export function Boletin({
  data,
  onClose,
}: {
  data: {
    estudiante: Row;
    materias: Row[];
    resumen?: {
      promedio_general: number | null;
      aprobadas: number;
      reprobadas: number;
      pendientes: number;
      estado_general: string;
      total_materias?: number;
    };
  };
  onClose?: () => void;
}) {
  const est = data.estudiante;
  const materias = data.materias ?? [];
  const res = data.resumen;

  const cursoNombre = `${est.grado ?? est.nombre ?? ''} ${est.paralelo ?? ''} - ${est.nivel ?? ''}`;

  return (
    <section className="boletin-card">
      <div className="boletin-header">
        <div>
          <h2>Boletín: {String(est.nombres ?? '')} {String(est.apellidos ?? '')}</h2>
          <p className="boletin-meta">
            {cursoNombre} · RUDE: <strong>{String(est.rude ?? '—')}</strong> · Gestión {String(est.gestion ?? '')}
          </p>
        </div>
        <div className="boletin-actions">
          <button
            type="button"
            className="outline"
            onClick={() => imprimirBoletinPdf(data)}
          >
            🖨 Imprimir boletín
          </button>
          {onClose && (
            <button type="button" className="outline" onClick={onClose}>
              Cerrar
            </button>
          )}
        </div>
      </div>

      {!materias.length ? (
        <p className="empty-notice">Este estudiante aún no tiene calificaciones registradas.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="boletin-table">
              <thead>
                <tr>
                  <th>Materia</th>
                  <th>Docente</th>
                  <th style={{ textAlign: 'center' }}>P1</th>
                  <th style={{ textAlign: 'center' }}>P2</th>
                  <th style={{ textAlign: 'center' }}>P3</th>
                  <th style={{ textAlign: 'center' }}>P4</th>
                  <th style={{ textAlign: 'center' }}>Promedio</th>
                  <th style={{ textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {materias.map((m, idx) => {
                  const notas = (m.notas_por_periodo as Record<string, number | null>) ?? {};
                  const p1 = notas['1'];
                  const p2 = notas['2'];
                  const p3 = notas['3'];
                  const p4 = notas['4'];
                  const finalNum = m.nota_final as number | null;

                  return (
                    <tr key={idx}>
                      <td>
                        <strong>{String(m.nombre_materia ?? '')}</strong>
                        {m.sigla ? <small style={{ display: 'block', color: 'var(--muted)' }}>{String(m.sigla)}</small> : null}
                      </td>
                      <td>{String(m.docente ?? '—')}</td>
                      <td style={{ textAlign: 'center' }} className={p1 !== null && p1 !== undefined && p1 < SCHOOL_CONFIG.NOTA_APROBACION ? 'nota-reprobada' : ''}>
                        {p1 !== null && p1 !== undefined ? formatNumber(p1, 1) : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }} className={p2 !== null && p2 !== undefined && p2 < SCHOOL_CONFIG.NOTA_APROBACION ? 'nota-reprobada' : ''}>
                        {p2 !== null && p2 !== undefined ? formatNumber(p2, 1) : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }} className={p3 !== null && p3 !== undefined && p3 < SCHOOL_CONFIG.NOTA_APROBACION ? 'nota-reprobada' : ''}>
                        {p3 !== null && p3 !== undefined ? formatNumber(p3, 1) : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }} className={p4 !== null && p4 !== undefined && p4 < SCHOOL_CONFIG.NOTA_APROBACION ? 'nota-reprobada' : ''}>
                        {p4 !== null && p4 !== undefined ? formatNumber(p4, 1) : '—'}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }} className={finalNum !== null && finalNum !== undefined && finalNum < SCHOOL_CONFIG.NOTA_APROBACION ? 'nota-reprobada' : ''}>
                        {finalNum !== null && finalNum !== undefined ? formatNumber(finalNum, 2) : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${m.estado === 'Aprobada' ? 'badge-aprobado' : m.estado === 'Reprobada' ? 'badge-reprobado' : 'badge-parcial'}`}>
                          {String(m.estado ?? 'Parcial')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {res && (
            <div className="boletin-resumen">
              <div>
                <small>PROMEDIO GENERAL</small>
                <strong>{res.promedio_general ? formatNumber(res.promedio_general, 2) : '—'}</strong>
              </div>
              <div>
                <small>ESTADO GENERAL</small>
                <span className={`badge ${res.estado_general === 'Aprobado' ? 'badge-aprobado' : res.estado_general === 'Reprobado' ? 'badge-reprobado' : 'badge-parcial'}`}>
                  {res.estado_general}
                </span>
              </div>
              <div>
                <small>MATERIAS APROBADAS</small>
                <strong>{res.aprobadas}</strong>
              </div>
              <div>
                <small>REPROBADAS</small>
                <strong style={{ color: res.reprobadas > 0 ? 'var(--danger)' : 'inherit' }}>{res.reprobadas}</strong>
              </div>
              <div>
                <small>PENDIENTES / PARCIAL</small>
                <strong>{res.pendientes}</strong>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
