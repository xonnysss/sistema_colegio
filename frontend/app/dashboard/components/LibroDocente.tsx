'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Row = Record<string, unknown>;
type Libro = { asignacion: Row; periodo: number; estudiantes: Row[] };

export function LibroDocente({ asignaciones }: { asignaciones: Row[] }) {
  const [asignacionId, setAsignacionId] = useState('');
  const [periodo, setPeriodo] = useState('1');
  const [libro, setLibro] = useState<Libro | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!asignacionId && asignaciones[0]) setAsignacionId(String(asignaciones[0].id_asignacion)); }, [asignaciones, asignacionId]);

  async function cargar() {
    if (!asignacionId) return;
    try {
      setMessage('');
      const data = await api(`/docente/centralizador?asignacionId=${asignacionId}&periodo=${periodo}`) as Libro;
      setLibro(data);
      setNotas(Object.fromEntries(data.estudiantes.map((e) => [String(e.id_inscripcion), e.nota === null || e.nota === undefined ? '' : String(e.nota)])));
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo cargar el libro'); }
  }

  async function guardar() {
    if (!asignacionId) return;
    const payload = Object.entries(notas).filter(([, nota]) => nota !== '').map(([inscripcion_id, nota]) => ({ inscripcion_id: Number(inscripcion_id), nota: Number(nota) }));
    if (!payload.length) { setMessage('Ingresa al menos una nota antes de guardar.'); return; }
    setSaving(true);
    try {
      const data = await api('/docente/centralizador', { method: 'POST', body: JSON.stringify({ asignacion_id: Number(asignacionId), periodo: Number(periodo), notas: payload }) }) as Libro;
      setLibro(data); setMessage('Notas guardadas correctamente.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudieron guardar las notas'); } finally { setSaving(false); }
  }

  return <section className="boletin-card"><h2>Ingreso de notas</h2><p>Selecciona una de tus materias, el período y registra una nota de 0 a 100 por estudiante.</p><div className="filters"><label>Curso y materia<select value={asignacionId} onChange={(e) => setAsignacionId(e.target.value)}>{asignaciones.map((a) => <option key={String(a.id_asignacion)} value={String(a.id_asignacion)}>{String(a.grado)} {String(a.paralelo)} · {String(a.materia)} · {String(a.gestion)}</option>)}</select></label><label>Período<select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>{[1, 2, 3, 4].map((p) => <option key={p} value={p}>Período {p}</option>)}</select></label><button type="button" onClick={cargar}>Cargar lista</button><button type="button" className="outline" disabled={saving || !libro} onClick={guardar}>{saving ? 'Guardando…' : 'Guardar notas'}</button></div>{message && <p className="notice">{message}</p>}{libro && <><h3>{String(libro.asignacion.materia)} · {String(libro.asignacion.grado)} {String(libro.asignacion.paralelo)} · Gestión {String(libro.asignacion.gestion)}</h3><div className="table-wrap"><table><thead><tr><th>N.º</th><th>Estudiante</th><th>RUDE</th><th>Nota P{periodo}</th><th>Promedio materia</th><th>Estado</th></tr></thead><tbody>{libro.estudiantes.map((e, index) => { const value = notas[String(e.id_inscripcion)] ?? ''; const numeric = Number(value); return <tr key={String(e.id_inscripcion)}><td>{index + 1}</td><td>{String(e.apellidos)} {String(e.nombres)}</td><td>{String(e.rude)}</td><td><input aria-label={`Nota de ${String(e.nombres)}`} type="number" min="0" max="100" step="0.01" value={value} onChange={(event) => setNotas({ ...notas, [String(e.id_inscripcion)]: event.target.value })} /></td><td>{e.promedio_materia === null || e.promedio_materia === undefined ? '—' : String(e.promedio_materia)}</td><td>{value !== '' && numeric < 61 ? 'En riesgo' : value !== '' ? 'Registrada' : 'Pendiente'}</td></tr>; })}</tbody></table></div></>}</section>;
}
