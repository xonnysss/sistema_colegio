'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { SCHOOL_CONFIG } from '../../../lib/config';
import { Combobox, ComboboxOption } from './Combobox';
import { ConfirmDialog } from './ConfirmDialog';

type NotaRow = {
  id_calificacion: number;
  gestion: number;
  curso_etiqueta: string;
  estudiante: string;
  apellidos: string;
  nombres: string;
  rude: string;
  ci?: string | null;
  materia: string;
  sigla: string;
  docente: string;
  periodo: number | null;
  periodo_etiqueta?: string;
  periodos_cargados?: number;
  nota: number;
  id_asignacion: number;
  id_inscripcion: number;
  id_curso: number;
  id_estudiante: number;
};

interface NotasRegistradasProps {
  user: { email: string; rol: string };
  onGoToRegistrar?: () => void;
}

export function NotasRegistradas({ user, onGoToRegistrar }: NotasRegistradasProps) {
  const requestId = useRef(0);
  // Filtros
  const [gestiones, setGestiones] = useState<number[]>([]);
  const [filterGestion, setFilterGestion] = useState<number | ''>('');
  const [filterCursoId, setFilterCursoId] = useState<string>('');
  const [filterPeriodo, setFilterPeriodo] = useState<string>('');
  const [filterBuscar, setFilterBuscar] = useState<string>('');
  const [debouncedBuscar, setDebouncedBuscar] = useState<string>('');

  // Filtro por estudiante específico (ADMIN via Combobox remoto)
  const [selectedStudentOpt, setSelectedStudentOpt] = useState<ComboboxOption | null>(null);

  // Cursos disponibles para filtro
  const [cursosList, setCursosList] = useState<Array<{ id_curso: number; curso_etiqueta: string }>>([]);

  // Paginación y orden en servidor
  const [data, setData] = useState<NotaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<string>('gestion');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(false);

  // Notificaciones
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');

  // Edición de nota puntual
  const [editRow, setEditRow] = useState<NotaRow | null>(null);
  const [editNotaValue, setEditNotaValue] = useState('');
  const [editError, setEditError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Baja de nota puntual
  const [deleteRow, setDeleteRow] = useState<NotaRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Cargar gestiones disponibles al inicio
  useEffect(() => {
    api('/notas/gestiones')
      .then((res: number[]) => {
        if (Array.isArray(res) && res.length > 0) {
          setGestiones(res);
          setFilterGestion(res[0]);
        }
      })
      .catch((err) => {
        setErrorNotice(err.message || 'Error al cargar gestiones');
      });
  }, []);

  // Cargar cursos de la gestión seleccionada
  useEffect(() => {
    if (!filterGestion) {
      setCursosList([]);
      return;
    }
    api(`/notas/asignaciones?gestion=${filterGestion}`)
      .then((res: Array<{ id_curso: number; curso_etiqueta: string }>) => {
        const unique = new Map<number, { id_curso: number; curso_etiqueta: string }>();
        for (const item of res || []) {
          if (!unique.has(item.id_curso)) {
            unique.set(item.id_curso, {
              id_curso: item.id_curso,
              curso_etiqueta: item.curso_etiqueta,
            });
          }
        }
        setCursosList(Array.from(unique.values()));
      })
      .catch(() => setCursosList([]));
  }, [filterGestion]);

  // Debounce del término de búsqueda general
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBuscar(filterBuscar);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filterBuscar]);

  // Cargar notas desde el backend
  const fetchNotas = useCallback(async () => {
    const request = ++requestId.current;
    setData([]);
    if (!filterGestion) return;
    setLoading(true);
    setErrorNotice('');

    const params = new URLSearchParams();
    if (filterGestion) params.set('gestion', String(filterGestion));
    if (filterCursoId) params.set('cursoId', filterCursoId);
    if (filterPeriodo) params.set('periodo', filterPeriodo);
    if (debouncedBuscar.trim()) params.set('buscar', debouncedBuscar.trim());
    if (selectedStudentOpt?.raw) {
      const st = selectedStudentOpt.raw as { id_estudiante?: number };
      if (st.id_estudiante) params.set('estudianteId', String(st.id_estudiante));
    }
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    params.set('sort', sort);
    params.set('dir', dir);

    try {
      const res = await api(`/notas?${params.toString()}`);
      if (request !== requestId.current) return;
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      if (request !== requestId.current) return;
      setErrorNotice(err.message || 'Error al cargar notas');
      setData([]);
      setTotal(0);
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [filterGestion, filterCursoId, filterPeriodo, debouncedBuscar, selectedStudentOpt, page, pageSize, sort, dir]);

  useEffect(() => {
    fetchNotas();
    return () => { requestId.current++; };
  }, [fetchNotas]);

  // Cambio de ordenamiento al pulsar encabezado
  const handleSort = (colKey: string) => {
    if (sort === colKey) {
      setDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(colKey);
      setDir('asc');
    }
    setPage(1);
  };

  // Búsqueda remota de estudiantes para ADMIN
  const searchEstudiantesRemoto = async (q: string): Promise<ComboboxOption[]> => {
    if (!filterGestion) return [];
    try {
      const res = await api(`/estudiantes/buscar?q=${encodeURIComponent(q)}&gestion=${filterGestion}`);
      return (res || []).map((r: any) => ({
        value: r.id_estudiante,
        label: `${r.etiqueta}`,
        sublabel: `C.I.: ${r.ci ?? '—'} · RUDE: ${r.rude}`,
        raw: r,
      }));
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  // Abrir modal de edición puntual de nota
  const handleOpenEdit = (row: NotaRow) => {
    setEditRow(row);
    setEditNotaValue(String(row.nota));
    setEditError('');
  };

  // Guardar edición puntual
  const handleSaveEdit = async () => {
    if (!editRow || isUpdating) return;

    const trimmed = editNotaValue.trim().replace(',', '.');
    const num = Number(trimmed);
    if (trimmed === '' || isNaN(num) || !Number.isFinite(num) || num < 0 || num > 100) {
      setEditError('La nota debe ser un número entre 0 y 100.');
      return;
    }
    const parts = trimmed.split('.');
    if (parts[1] && parts[1].length > 2) {
      setEditError('La nota no puede tener más de 2 decimales.');
      return;
    }

    setIsUpdating(true);
    setEditError('');
    try {
      await api(`/calificaciones/${editRow.id_calificacion}`, {
        method: 'PATCH',
        body: JSON.stringify({ nota: Number(num.toFixed(2)) }),
      });
      setNotice(`Nota actualizada correctamente para ${editRow.estudiante}.`);
      setEditRow(null);
      fetchNotas();
    } catch (err: any) {
      setEditError(err.message || 'Error al actualizar la nota');
    } finally {
      setIsUpdating(false);
    }
  };

  // Confirmar baja puntual
  const handleConfirmDelete = async () => {
    if (!deleteRow || isDeleting) return;

    setIsDeleting(true);
    try {
      await api(`/calificaciones/${deleteRow.id_calificacion}`, {
        method: 'DELETE',
      });
      setNotice(
        `Se dio de baja la nota ${deleteRow.nota} de ${deleteRow.estudiante} en ${deleteRow.materia}, período ${deleteRow.periodo}.`,
      );
      setDeleteRow(null);
      fetchNotas();
    } catch (err: any) {
      setErrorNotice(err.message || 'Error al dar de baja la calificación');
      setDeleteRow(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="notas-registradas-container">
      <header>
        <div>
          <span className="eyebrow">CALIFICACIONES</span>
          <h1>Notas registradas</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '.86rem' }}>
            Consulta, busca y corrige calificaciones registradas en el sistema.
          </p>
        </div>
        <div className="user">
          {user.email}
          <b>{user.rol}</b>
        </div>
      </header>

      {/* Banner / Enlace a Registrar Notas */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '14px 18px',
          background: '#e6f4f1',
          border: '1px solid #066b73',
          borderRadius: 10,
          marginBottom: 18,
        }}
      >
        <div>
          <strong style={{ color: '#034f57', fontSize: '.92rem' }}>
            ¿Deseas registrar o calificar todo un curso?
          </strong>
          <p style={{ margin: '2px 0 0', color: 'var(--ink)', fontSize: '.84rem' }}>
            Carga y guarda las notas de todos los alumnos en una sola grilla con un clic.
          </p>
        </div>
        {onGoToRegistrar && (
          <button
            type="button"
            onClick={onGoToRegistrar}
            style={{ padding: '8px 16px', fontSize: '.84rem' }}
          >
            Ir a Registrar notas
          </button>
        )}
      </div>

      {/* Avisos */}
      {notice && <p className="notice" style={{ marginBottom: 16 }}>{notice}</p>}
      {errorNotice && <p className="notice error" style={{ marginBottom: 16 }}>{errorNotice}</p>}

      {/* Barra de Filtros */}
      <div className="filters" style={{ marginBottom: 20 }}>
        {/* Gestión */}
        <label>
          Gestión
          <select
            value={filterGestion}
            onChange={(e) => {
              setFilterGestion(e.target.value ? Number(e.target.value) : '');
              setFilterCursoId('');
              setSelectedStudentOpt(null);
              setPage(1);
            }}
          >
            {gestiones.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        {/* Curso */}
        <label style={{ minWidth: 220 }}>
          Curso
          <select
            value={filterCursoId}
            onChange={(e) => {
              setFilterCursoId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los cursos</option>
            {cursosList.map((c) => (
              <option key={c.id_curso} value={c.id_curso}>
                {c.curso_etiqueta}
              </option>
            ))}
          </select>
        </label>

        {/* Período */}
        <label style={{ minWidth: 140 }}>
          Período
          <select
            value={filterPeriodo}
            onChange={(e) => {
              setFilterPeriodo(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los períodos</option>
            {Array.from({ length: SCHOOL_CONFIG.PERIODOS_TOTALES }).map((_, i) => (
              <option key={i + 1} value={i + 1}>
                Período {i + 1}
              </option>
            ))}
            <option value="promedio">Promedio</option>
          </select>
        </label>

        {/* Búsqueda por texto (apellidos, nombres, CI, RUDE o materia) */}
        <label style={{ flex: 2, minWidth: 220 }}>
          Buscar
          <input
            type="text"
            placeholder="Estudiante, C.I., RUDE o materia…"
            value={filterBuscar}
            onChange={(e) => setFilterBuscar(e.target.value)}
          />
        </label>

        {/* Buscador de estudiante con Combobox remoto para ADMIN */}
        {user.rol === 'ADMIN' && (
          <div style={{ flex: 2, minWidth: 260 }}>
            <Combobox
              label="Buscar alumno (por nombre, C.I. o RUDE)"
              placeholder="Escribe nombre, C.I. o RUDE…"
              value={selectedStudentOpt?.value ?? null}
              onSearch={searchEstudiantesRemoto}
              onChange={(val, opt) => {
                setSelectedStudentOpt(opt ?? null);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      {/* Tabla de Resultados */}
      <div className="table-wrap">
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th
                onClick={() => handleSort('gestion')}
                style={{ cursor: 'pointer', width: 80 }}
                aria-sort={sort === 'gestion' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Gestión {sort === 'gestion' && (dir === 'asc' ? '▲' : '▼')}
              </th>
              <th
                onClick={() => handleSort('curso_etiqueta')}
                style={{ cursor: 'pointer', minWidth: 180 }}
                aria-sort={sort === 'curso_etiqueta' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Curso {sort === 'curso_etiqueta' && (dir === 'asc' ? '▲' : '▼')}
              </th>
              <th
                onClick={() => handleSort('estudiante')}
                style={{ cursor: 'pointer', minWidth: 200 }}
                aria-sort={sort === 'estudiante' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Estudiante {sort === 'estudiante' && (dir === 'asc' ? '▲' : '▼')}
              </th>
              <th style={{ width: 110 }}>RUDE</th>
              <th style={{ width: 100 }}>C.I.</th>
              <th
                onClick={() => handleSort('materia')}
                style={{ cursor: 'pointer', minWidth: 160 }}
                aria-sort={sort === 'materia' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Materia {sort === 'materia' && (dir === 'asc' ? '▲' : '▼')}
              </th>
              <th style={{ minWidth: 160 }}>Docente</th>
              <th
                onClick={() => handleSort('periodo')}
                style={{ cursor: 'pointer', width: 80, textAlign: 'center' }}
                aria-sort={sort === 'periodo' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Período {sort === 'periodo' && (dir === 'asc' ? '▲' : '▼')}
              </th>
              <th
                onClick={() => handleSort('nota')}
                style={{ cursor: 'pointer', width: 90, textAlign: 'center' }}
                aria-sort={sort === 'nota' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Nota {sort === 'nota' && (dir === 'asc' ? '▲' : '▼')}
              </th>
              <th style={{ width: 140, textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
                  Cargando calificaciones…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
                  No se encontraron calificaciones registradas con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const notaNum = Number(row.nota);
                let notaColor = 'inherit';
                if (notaNum < SCHOOL_CONFIG.NOTA_APROBACION) {
                  notaColor = '#b91c1c'; // rojo
                } else if (notaNum < SCHOOL_CONFIG.NOTA_RIESGO) {
                  notaColor = '#d97706'; // amarillo/ámbar
                } else {
                  notaColor = '#065f46'; // verde
                }

                return (
                  <tr key={row.id_calificacion}>
                    <td>{row.gestion}</td>
                    <td>{row.curso_etiqueta}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.estudiante}</div>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{row.rude}</td>
                    <td style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{row.ci ?? '—'}</td>
                    <td>
                      <div>
                        {row.materia}{' '}
                        <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>({row.sigla})</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: '.82rem' }}>{row.docente}</td>
                    <td style={{ textAlign: 'center' }}>
                      {row.periodo_etiqueta === 'Promedio' || filterPeriodo === 'promedio' ? (
                        <div>
                          <span className="badge badge-activo" style={{ fontWeight: 700 }}>
                            Promedio
                          </span>
                          {row.periodos_cargados !== undefined && (
                            <small
                              style={{
                                display: 'block',
                                color: 'var(--muted)',
                                fontSize: '.68rem',
                                marginTop: 2,
                              }}
                            >
                              {row.periodos_cargados} de {SCHOOL_CONFIG.PERIODOS_TOTALES} notas
                            </small>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontWeight: 600 }}>P{row.periodo}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: notaColor, fontSize: '.92rem' }}>
                      {notaNum.toLocaleString('es-BO', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.periodo_etiqueta === 'Promedio' || filterPeriodo === 'promedio' ? (
                        <button
                          type="button"
                          className="outline"
                          title="Ver calificaciones de cada período de este alumno"
                          onClick={() => {
                            setFilterPeriodo('');
                            setFilterBuscar(row.estudiante);
                          }}
                          style={{ padding: '4px 8px', fontSize: '.74rem' }}
                        >
                          Ver períodos
                        </button>
                      ) : (
                        <div className="row-actions" style={{ justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="outline"
                            onClick={() => handleOpenEdit(row)}
                            style={{ padding: '4px 8px', fontSize: '.75rem' }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => setDeleteRow(row)}
                            style={{ padding: '4px 8px', fontSize: '.75rem' }}
                          >
                            Dar de baja
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="pagination">
        <div className="pagination-info">
          <span>
            Total: <strong>{total}</strong> notas
          </span>
          <div className="pagination-size">
            <label htmlFor="pageSizeSelect">Por página:</label>
            <select
              id="pageSizeSelect"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="pagination-nav">
          <button
            type="button"
            className="outline"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Anterior
          </button>
          <span className="pagination-current">
            Página <strong>{page}</strong> de {totalPages}
          </span>
          <button
            type="button"
            className="outline"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente →
          </button>
        </div>
      </div>

      {/* Modal para Editar Nota Puntual */}
      {editRow && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h2>Modificar nota</h2>
            <p>
              Estudiante: <strong>{editRow.estudiante}</strong>
              <br />
              Materia: <strong>{editRow.materia}</strong> ({editRow.curso_etiqueta})
              <br />
              Período: <strong>Período {editRow.periodo}</strong>
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEdit();
              }}
            >
              <label style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                <span style={{ fontWeight: 700, fontSize: '.85rem' }}>Nota (0 - 100):</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={editNotaValue}
                  onChange={(e) => {
                    setEditNotaValue(e.target.value);
                    setEditError('');
                  }}
                  style={{ padding: 10, fontSize: '1rem', fontWeight: 700 }}
                />
              </label>

              {editError && (
                <div style={{ color: 'var(--danger)', fontSize: '.8rem', marginBottom: 14 }}>
                  {editError}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="outline"
                  disabled={isUpdating}
                  onClick={() => setEditRow(null)}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={isUpdating}>
                  {isUpdating ? 'Guardando…' : 'Guardar nota'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Diálogo de Confirmación para Dar de Baja */}
      <ConfirmDialog
        isOpen={Boolean(deleteRow)}
        title="Dar de baja calificación"
        message={
          deleteRow
            ? `¿Dar de baja la nota ${deleteRow.nota} de ${deleteRow.estudiante} en ${deleteRow.materia}, período ${deleteRow.periodo}?`
            : ''
        }
        confirmLabel={isDeleting ? 'Eliminando…' : 'Dar de baja'}
        cancelLabel="Cancelar"
        danger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteRow(null)}
      />
    </div>
  );
}
