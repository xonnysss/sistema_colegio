'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { SCHOOL_CONFIG } from '../../../lib/config';
import { ConfirmDialog } from './ConfirmDialog';

type AsignacionItem = {
  id_asignacion: number;
  id_curso: number;
  curso_etiqueta: string;
  nivel: string;
  nombre: string;
  paralelo: string;
  turno: string;
  gestion: number;
  id_materia: number;
  materia: string;
  sigla: string;
  docente: string;
  total_estudiantes: number;
};

type EstudianteGrilla = {
  inscripcion_id: number;
  id_estudiante: number;
  rude: string;
  apellidos: string;
  nombres: string;
  notas: Record<string, number | null>;
};

type GrillaResponse = {
  asignacion: {
    id_asignacion: number;
    curso_etiqueta: string;
    materia: string;
    sigla: string;
    docente: string;
    gestion: number;
  };
  periodos_totales: number;
  estudiantes: EstudianteGrilla[];
};

type CellKey = `${number}_${number}`; // `${inscripcion_id}_${periodo}`

interface RegistrarNotasProps {
  user: { email: string; rol: string };
}

export function RegistrarNotas({ user }: RegistrarNotasProps) {
  // Filtros
  const [gestiones, setGestiones] = useState<number[]>([]);
  const [selectedGestion, setSelectedGestion] = useState<number | ''>('');
  const [selectedNivel, setSelectedNivel] = useState<string>('');
  const [selectedCursoId, setSelectedCursoId] = useState<number | ''>('');
  const [selectedAsignacionId, setSelectedAsignacionId] = useState<number | ''>('');

  const [asignaciones, setAsignaciones] = useState<AsignacionItem[]>([]);
  const [loadingAsignaciones, setLoadingAsignaciones] = useState(false);

  // Grilla
  const [grillaData, setGrillaData] = useState<GrillaResponse | null>(null);
  const [loadingGrilla, setLoadingGrilla] = useState(false);

  // Cambios pendientes: CellKey -> string | null (string para admitir comas mientras escribe, o null si vacía)
  const [cellInputs, setCellInputs] = useState<Map<CellKey, string>>(new Map());
  const [cellErrors, setCellErrors] = useState<Map<CellKey, string>>(new Map());

  // Búsqueda en cliente sobre la grilla
  const [buscarAlumno, setBuscarAlumno] = useState('');

  // Guardar / Notificaciones
  const [isSaving, setIsSaving] = useState(false);
  const [successNotice, setSuccessNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');

  // Diálogo para descartar cambios
  const [pendingFilterAction, setPendingFilterAction] = useState<(() => void) | null>(null);
  const [showConfirmDiscard, setShowConfirmDiscard] = useState(false);

  const grillaRequest = useRef(0);
  const [confirmSave, setConfirmSave] = useState(false);
  const hasUnsavedChanges = cellInputs.size > 0;

  // Cargar gestiones disponibles al inicio
  useEffect(() => {
    api('/notas/gestiones')
      .then((res: number[]) => {
        if (Array.isArray(res) && res.length > 0) {
          setGestiones(res);
          setSelectedGestion(res[0]);
        }
      })
      .catch((err) => {
        setErrorNotice(err.message || 'Error al cargar gestiones');
      });
  }, []);

  // Cargar asignaciones cuando cambia la gestión
  useEffect(() => {
    if (!selectedGestion) {
      setAsignaciones([]);
      return;
    }
    setLoadingAsignaciones(true);
    api(`/notas/asignaciones?gestion=${selectedGestion}`)
      .then((res: AsignacionItem[]) => {
        setAsignaciones(res || []);
      })
      .catch((err) => {
        setErrorNotice(err.message || 'Error al cargar asignaciones');
        setAsignaciones([]);
      })
      .finally(() => setLoadingAsignaciones(false));
  }, [selectedGestion]);

  // Alerta de cierre de pestaña si hay cambios sin guardar
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Manejo de cambio de filtro con confirmación si hay cambios sin guardar
  const requestFilterChange = useCallback(
    (action: () => void) => {
      if (hasUnsavedChanges) {
        setPendingFilterAction(() => action);
        setShowConfirmDiscard(true);
      } else {
        action();
      }
    },
    [hasUnsavedChanges],
  );

  const confirmDiscard = () => {
    setCellInputs(new Map());
    setCellErrors(new Map());
    setShowConfirmDiscard(false);
    if (pendingFilterAction) {
      pendingFilterAction();
      setPendingFilterAction(null);
    }
  };

  const cancelDiscard = () => {
    setShowConfirmDiscard(false);
    setPendingFilterAction(null);
  };

  // Cursos disponibles según gestión y nivel
  const cursosDisponibles = useMemo(() => {
    const cursosMap = new Map<number, { id_curso: number; curso_etiqueta: string; nivel: string }>();
    for (const a of asignaciones) {
      if (selectedNivel && a.nivel.toUpperCase() !== selectedNivel.toUpperCase()) {
        continue;
      }
      if (!cursosMap.has(a.id_curso)) {
        cursosMap.set(a.id_curso, {
          id_curso: a.id_curso,
          curso_etiqueta: a.curso_etiqueta,
          nivel: a.nivel,
        });
      }
    }
    return Array.from(cursosMap.values());
  }, [asignaciones, selectedNivel]);

  // Materias disponibles según curso seleccionado
  const materiasDisponibles = useMemo(() => {
    if (!selectedCursoId) return [];
    return asignaciones.filter((a) => a.id_curso === Number(selectedCursoId));
  }, [asignaciones, selectedCursoId]);

  // Auto-selección si solo hay 1 materia en el curso seleccionado
  useEffect(() => {
    if (selectedCursoId && materiasDisponibles.length === 1) {
      const singleAsigId = materiasDisponibles[0].id_asignacion;
      if (selectedAsignacionId !== singleAsigId) {
        setSelectedAsignacionId(singleAsigId);
      }
    }
  }, [selectedCursoId, materiasDisponibles, selectedAsignacionId]);

  // Cargar grilla al seleccionar asignación
  const loadGrilla = useCallback((asigId: number) => {
    const request = ++grillaRequest.current;
    setGrillaData(null);
    setLoadingGrilla(true);
    setErrorNotice('');
    setSuccessNotice('');
    setCellInputs(new Map());
    setCellErrors(new Map());

    api(`/notas/grilla/${asigId}`)
      .then((res: GrillaResponse) => {
        if (request !== grillaRequest.current) return;
        if (res && Array.isArray(res.estudiantes)) {
          res.estudiantes = res.estudiantes.map((e: any) => ({
            ...e,
            inscripcion_id: Number(e.inscripcion_id ?? e.id_inscripcion),
          }));
        }
        setGrillaData(res);
      })
      .catch((err) => {
        if (request !== grillaRequest.current) return;
        setErrorNotice(err.message || 'Error al cargar la grilla de notas');
        setGrillaData(null);
      })
      .finally(() => { if (request === grillaRequest.current) setLoadingGrilla(false); });
  }, []);

  useEffect(() => {
    if (selectedAsignacionId) {
      loadGrilla(Number(selectedAsignacionId));
    } else {
      grillaRequest.current++;
      setGrillaData(null);
    }
    return () => { grillaRequest.current++; };
  }, [selectedAsignacionId, loadGrilla]);

  // Validar una nota
  const validateGrade = (raw: string): { isValid: boolean; error?: string; value: number | null } => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { isValid: true, value: null };
    }
    const clean = trimmed.replace(',', '.');
    const num = Number(clean);
    if (isNaN(num) || !Number.isFinite(num)) {
      return { isValid: false, error: 'Nota inválida', value: null };
    }
    if (num < 0 || num > 100) {
      return { isValid: false, error: 'Entre 0 y 100', value: null };
    }
    const parts = clean.split('.');
    if (parts[1] && parts[1].length > 2) {
      return { isValid: false, error: 'Máx. 2 decimales', value: null };
    }
    return { isValid: true, value: Number(num.toFixed(2)) };
  };

  // Manejo de cambio en celda
  const handleCellChange = (inscripcionId: number, periodo: number, textValue: string) => {
    const key: CellKey = `${inscripcionId}_${periodo}`;
    const newInputs = new Map(cellInputs);
    const newErrors = new Map(cellErrors);

    const check = validateGrade(textValue);
    if (!check.isValid) {
      newErrors.set(key, check.error || 'Inválido');
    } else {
      newErrors.delete(key);
    }

    // Verificar si el valor es idéntico al original en el servidor
    const originalStudent = grillaData?.estudiantes.find((e) => e.inscripcion_id === inscripcionId);
    const originalNota = originalStudent?.notas[String(periodo)] ?? null;

    if (check.isValid) {
      if (check.value === originalNota || (check.value === null && originalNota === null)) {
        newInputs.delete(key);
      } else {
        newInputs.set(key, textValue);
      }
    } else {
      newInputs.set(key, textValue);
    }

    setCellInputs(newInputs);
    setCellErrors(newErrors);
  };

  // Obtener valor actual para mostrar en celda
  const getCellValue = (student: EstudianteGrilla, periodo: number): string => {
    const key: CellKey = `${student.inscripcion_id}_${periodo}`;
    if (cellInputs.has(key)) {
      return cellInputs.get(key)!;
    }
    const n = student.notas[String(periodo)];
    if (n === null || n === undefined) return '';
    return String(n);
  };

  // Obtener valor numérico actual para cálculo de promedio y colores
  const getCellNumeric = (student: EstudianteGrilla, periodo: number): number | null => {
    const key: CellKey = `${student.inscripcion_id}_${periodo}`;
    if (cellInputs.has(key)) {
      const val = cellInputs.get(key)!;
      const chk = validateGrade(val);
      return chk.isValid ? chk.value : null;
    }
    const n = student.notas[String(periodo)];
    return n !== null && n !== undefined ? Number(n) : null;
  };

  // Navegación por teclado entre celdas (Enter baja, Flechas arriba/abajo)
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    periodo: number,
    totalRows: number,
  ) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextRow = rowIndex + 1;
      if (nextRow < totalRows) {
        const nextInput = document.querySelector<HTMLInputElement>(
          `input[data-row="${nextRow}"][data-col="${periodo}"]`,
        );
        nextInput?.focus();
        nextInput?.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevRow = rowIndex - 1;
      if (prevRow >= 0) {
        const prevInput = document.querySelector<HTMLInputElement>(
          `input[data-row="${prevRow}"][data-col="${periodo}"]`,
        );
        prevInput?.focus();
        prevInput?.select();
      }
    }
  };

  // Pegar columna de Excel hacia abajo
  const handleCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRowIndex: number,
    periodo: number,
    filteredStudents: EstudianteGrilla[],
  ) => {
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\n') && !text.includes('\r'))) {
      return; // Dejar comportamiento normal para un solo valor
    }

    e.preventDefault();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const newInputs = new Map(cellInputs);
    const newErrors = new Map(cellErrors);

    lines.forEach((line, idx) => {
      const targetRow = startRowIndex + idx;
      if (targetRow < filteredStudents.length) {
        const student = filteredStudents[targetRow];
        const key: CellKey = `${student.inscripcion_id}_${periodo}`;
        const check = validateGrade(line);

        if (!check.isValid) {
          newErrors.set(key, check.error || 'Inválido');
        } else {
          newErrors.delete(key);
        }

        const originalNota = student.notas[String(periodo)] ?? null;
        if (check.isValid && (check.value === originalNota || (check.value === null && originalNota === null))) {
          newInputs.delete(key);
        } else {
          newInputs.set(key, line);
        }
      }
    });

    setCellInputs(newInputs);
    setCellErrors(newErrors);
  };

  // Guardar cambios
  const handleSave = async () => {
    if (loadingGrilla || grillaData?.asignacion.id_asignacion !== selectedAsignacionId || !selectedAsignacionId || cellInputs.size === 0 || cellErrors.size > 0 || isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorNotice('');
    setSuccessNotice('');

    const cambios: Array<{ inscripcion_id: number; periodo: number; nota: number | null }> = [];

    cellInputs.forEach((rawVal, key) => {
      const [inscStr, perStr] = key.split('_');
      const inscripcion_id = Number(inscStr);
      const periodo = Number(perStr);
      const chk = validateGrade(rawVal);
      cambios.push({
        inscripcion_id,
        periodo,
        nota: chk.isValid ? chk.value : null,
      });
    });

    try {
      const res = await api(`/notas/grilla/${selectedAsignacionId}`, {
        method: 'PUT',
        body: JSON.stringify({ cambios }),
      });

      const guardadas = res?.guardadas ?? 0;
      const eliminadas = res?.eliminadas ?? 0;
      let msg = `Se guardaron ${guardadas} ${guardadas === 1 ? 'nota' : 'notas'}.`;
      if (eliminadas > 0) {
        msg += ` (${eliminadas} ${eliminadas === 1 ? 'eliminada' : 'eliminadas'})`;
      }
      setSuccessNotice(msg);

      // Recargar la grilla desde el servidor
      loadGrilla(Number(selectedAsignacionId));
    } catch (err: any) {
      if (err?.errores && Array.isArray(err.errores)) {
        const newErrors = new Map(cellErrors);
        for (const e of err.errores) {
          const key: CellKey = `${e.inscripcion_id}_${e.periodo}`;
          newErrors.set(key, e.mensaje || 'Error');
        }
        setCellErrors(newErrors);
        setErrorNotice(err.message || 'Se encontraron errores al guardar');
      } else {
        setErrorNotice(err.message || 'Error al guardar notas');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Descartar cambios manual
  const handleDiscard = () => {
    setCellInputs(new Map());
    setCellErrors(new Map());
    setErrorNotice('');
    setSuccessNotice('Cambios descartados.');
  };

  // Filtrado de alumnos en la grilla
  const periodosTotales = grillaData?.periodos_totales ?? SCHOOL_CONFIG.PERIODOS_TOTALES;
  const filteredEstudiantes = useMemo(() => {
    if (!grillaData?.estudiantes) return [];
    if (!buscarAlumno.trim()) return grillaData.estudiantes;
    const q = buscarAlumno.toLowerCase().trim();
    return grillaData.estudiantes.filter(
      (e) =>
        e.apellidos.toLowerCase().includes(q) ||
        e.nombres.toLowerCase().includes(q) ||
        e.rude.toLowerCase().includes(q),
    );
  }, [grillaData, buscarAlumno]);

  // Cálculo de promedios de curso por período
  const promediosCurso = useMemo(() => {
    if (!grillaData?.estudiantes || grillaData.estudiantes.length === 0) return {};
    const sums: Record<number, { sum: number; count: number }> = {};
    for (let p = 1; p <= periodosTotales; p++) {
      sums[p] = { sum: 0, count: 0 };
    }

    for (const est of grillaData.estudiantes) {
      for (let p = 1; p <= periodosTotales; p++) {
        const val = getCellNumeric(est, p);
        if (val !== null) {
          sums[p].sum += val;
          sums[p].count += 1;
        }
      }
    }

    const avgs: Record<number, number | null> = {};
    let totalSum = 0;
    let totalCount = 0;
    for (let p = 1; p <= periodosTotales; p++) {
      if (sums[p].count > 0) {
        avgs[p] = Math.round((sums[p].sum / sums[p].count) * 100) / 100;
        totalSum += sums[p].sum;
        totalCount += sums[p].count;
      } else {
        avgs[p] = null;
      }
    }
    const general = totalCount > 0 ? Math.round((totalSum / totalCount) * 100) / 100 : null;
    return { porPeriodo: avgs, general };
  }, [grillaData, cellInputs, periodosTotales]);

  return (
    <div className="registrar-notas-container">
      <header>
        <div>
          <span className="eyebrow">CALIFICACIONES</span>
          <h1>Registrar notas</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '.86rem' }}>
            Carga y actualiza las notas de todo el curso en una sola grilla.
          </p>
        </div>
        <div className="user">
          {user.email}
          <b>{user.rol}</b>
        </div>
      </header>

      {/* Barra de Filtros en Cascada */}
      <div className="filters" style={{ marginBottom: 20 }}>
        {/* 1. Gestión */}
        <label>
          Gestión
          <select
            value={selectedGestion}
            onChange={(e) => {
              const val = Number(e.target.value);
              requestFilterChange(() => {
                setSelectedGestion(val);
                setSelectedCursoId('');
                setSelectedAsignacionId('');
              });
            }}
          >
            {gestiones.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        {/* 2. Nivel */}
        <label>
          Nivel
          <select
            value={selectedNivel}
            onChange={(e) => {
              const val = e.target.value;
              requestFilterChange(() => {
                setSelectedNivel(val);
                setSelectedCursoId('');
                setSelectedAsignacionId('');
              });
            }}
          >
            <option value="">Todos los niveles</option>
            <option value="INICIAL">Inicial</option>
            <option value="PRIMARIA">Primaria</option>
            <option value="SECUNDARIA">Secundaria</option>
          </select>
        </label>

        {/* 3. Curso */}
        <label style={{ minWidth: 260 }}>
          Curso
          <select
            value={selectedCursoId}
            disabled={cursosDisponibles.length === 0}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : '';
              requestFilterChange(() => {
                setSelectedCursoId(val);
                setSelectedAsignacionId('');
              });
            }}
          >
            <option value="">
              {cursosDisponibles.length === 0 ? 'Sin cursos disponibles' : 'Selecciona un curso…'}
            </option>
            {cursosDisponibles.map((c) => (
              <option key={c.id_curso} value={c.id_curso}>
                {c.curso_etiqueta}
              </option>
            ))}
          </select>
        </label>

        {/* 4. Materia */}
        <label style={{ minWidth: 280 }}>
          Materia
          <select
            value={selectedAsignacionId}
            disabled={!selectedCursoId || materiasDisponibles.length === 0}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : '';
              requestFilterChange(() => {
                setSelectedAsignacionId(val);
              });
            }}
          >
            <option value="">
              {!selectedCursoId
                ? 'Elige primero un curso…'
                : materiasDisponibles.length === 0
                ? 'Sin materias disponibles'
                : 'Selecciona una materia…'}
            </option>
            {materiasDisponibles.map((m) => (
              <option key={m.id_asignacion} value={m.id_asignacion}>
                {m.materia} ({m.sigla}) — {m.docente}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Avisos */}
      {successNotice && <p className="notice" style={{ marginBottom: 16 }}>{successNotice}</p>}
      {errorNotice && <p className="notice error" style={{ marginBottom: 16 }}>{errorNotice}</p>}

      {/* Barra de Acciones Fija (arriba de la grilla) */}
      {grillaData && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            padding: '12px 16px',
            background: hasUnsavedChanges ? '#eff6ff' : '#f8fafc',
            border: `1px solid ${hasUnsavedChanges ? '#93c5fd' : 'var(--line)'}`,
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '.9rem', color: hasUnsavedChanges ? '#1d4ed8' : 'var(--ink)' }}>
              {hasUnsavedChanges
                ? `● ${cellInputs.size} ${cellInputs.size === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}`
                : 'Sin cambios pendientes'}
            </span>
            {cellErrors.size > 0 && (
              <span style={{ color: 'var(--danger)', fontSize: '.84rem', fontWeight: 700 }}>
                ⚠️ Hay {cellErrors.size} {cellErrors.size === 1 ? 'error que corregir' : 'errores que corregir'} antes de guardar
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="outline"
              disabled={!hasUnsavedChanges || isSaving}
              onClick={handleDiscard}
              style={{ padding: '8px 14px', fontSize: '.84rem' }}
            >
              Descartar cambios
            </button>
            <button
              type="button"
              disabled={!hasUnsavedChanges || cellErrors.size > 0 || isSaving}
              onClick={() => setConfirmSave(true)}
              style={{
                padding: '8px 18px',
                fontSize: '.84rem',
                opacity: !hasUnsavedChanges || cellErrors.size > 0 || isSaving ? 0.6 : 1,
              }}
            >
              {isSaving ? 'Guardando…' : 'Guardar notas'}
            </button>
          </div>
        </div>
      )}

      {/* Estados Vacíos y Contenido */}
      {loadingGrilla ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          <p>Cargando lista de estudiantes y calificaciones…</p>
        </div>
      ) : !selectedAsignacionId ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--paper)',
            borderRadius: 10,
            border: '1px solid var(--line)',
            color: 'var(--muted)',
          }}
        >
          <h3 style={{ margin: '0 0 6px', color: 'var(--ink)' }}>
            Elige un curso y una materia para registrar notas
          </h3>
          <p style={{ margin: 0, fontSize: '.88rem' }}>
            {user.rol === 'DOCENTE' && asignaciones.length === 0 && !loadingAsignaciones
              ? 'Aún no tienes materias asignadas. Consulta con la administración.'
              : 'Selecciona una gestión, curso y materia en la barra superior para desplegar la grilla.'}
          </p>
        </div>
      ) : grillaData && grillaData.estudiantes.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--paper)',
            borderRadius: 10,
            border: '1px solid var(--line)',
            color: 'var(--muted)',
          }}
        >
          <h3 style={{ margin: '0 0 6px', color: 'var(--ink)' }}>Curso sin alumnos</h3>
          <p style={{ margin: 0, fontSize: '.88rem' }}>Este curso aún no tiene estudiantes inscritos.</p>
        </div>
      ) : grillaData ? (
        <div className="table-wrap" style={{ position: 'relative' }}>
          {/* Herramientas de tabla */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              padding: '12px 14px',
              borderBottom: '1px solid var(--line)',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="text"
                placeholder="Buscar por apellido, nombre o RUDE…"
                value={buscarAlumno}
                onChange={(e) => setBuscarAlumno(e.target.value)}
                style={{ width: 280, padding: '7px 10px', fontSize: '.84rem' }}
              />
              {buscarAlumno && (
                <button
                  type="button"
                  className="outline"
                  onClick={() => setBuscarAlumno('')}
                  style={{ padding: '6px 10px', fontSize: '.78rem' }}
                >
                  Limpiar
                </button>
              )}
            </div>

            <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
              Estudiantes: <strong>{filteredEstudiantes.length}</strong> de {grillaData.estudiantes.length}
            </div>
          </div>

          {/* Grilla de Calificaciones */}
          <table style={{ minWidth: 900 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
                <th style={{ width: 45, textAlign: 'center' }}>N.º</th>
                <th style={{ minWidth: 220 }}>Estudiante</th>
                <th style={{ width: 110 }}>RUDE</th>
                {Array.from({ length: periodosTotales }).map((_, i) => (
                  <th key={i + 1} style={{ width: 95, textAlign: 'center' }}>
                    P{i + 1}
                  </th>
                ))}
                <th style={{ width: 100, textAlign: 'center' }}>Promedio</th>
                <th style={{ width: 110, textAlign: 'center' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredEstudiantes.map((student, rowIndex) => {
                // Cálculo de promedio y estado para la fila
                const grades: number[] = [];
                for (let p = 1; p <= periodosTotales; p++) {
                  const val = getCellNumeric(student, p);
                  if (val !== null) grades.push(val);
                }

                const hasGrades = grades.length > 0;
                const isComplete = grades.length === periodosTotales;
                const promedio = hasGrades
                  ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 100) / 100
                  : null;

                let estadoText = '—';
                let estadoBadgeClass = '';
                if (hasGrades) {
                  if (isComplete) {
                    if ((promedio ?? 0) >= SCHOOL_CONFIG.NOTA_APROBACION) {
                      estadoText = 'Aprobado';
                      estadoBadgeClass = 'badge-aprobado';
                    } else {
                      estadoText = 'Reprobado';
                      estadoBadgeClass = 'badge-reprobado';
                    }
                  } else {
                    estadoText = 'Parcial';
                    estadoBadgeClass = 'badge-parcial';
                  }
                }

                const studentKey =
                  student.inscripcion_id ||
                  (student as any).id_inscripcion ||
                  `est-${student.id_estudiante}-${rowIndex}`;

                return (
                  <tr key={studentKey}>
                    <td style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '.78rem' }}>
                      {rowIndex + 1}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {student.apellidos} {student.nombres}
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: '.8rem' }}>
                      {student.rude}
                    </td>

                    {/* Celdas de Período */}
                    {Array.from({ length: periodosTotales }).map((_, pIdx) => {
                      const p = pIdx + 1;
                      const key: CellKey = `${student.inscripcion_id}_${p}`;
                      const isModified = cellInputs.has(key);
                      const errorMsg = cellErrors.get(key);
                      const currentVal = getCellValue(student, p);
                      const numVal = getCellNumeric(student, p);

                      // Color del texto de la nota
                      let gradeColor = 'inherit';
                      if (numVal !== null && !errorMsg) {
                        if (numVal < SCHOOL_CONFIG.NOTA_APROBACION) {
                          gradeColor = '#b91c1c'; // rojo
                        } else if (numVal < SCHOOL_CONFIG.NOTA_RIESGO) {
                          gradeColor = '#d97706'; // amarillo/ámbar
                        } else {
                          gradeColor = '#065f46'; // verde oscuro
                        }
                      }

                      return (
                        <td
                          key={p}
                          style={{
                            textAlign: 'center',
                            padding: '6px 8px',
                            background: errorMsg
                              ? '#fee2e2'
                              : isModified
                              ? '#e0f2fe'
                              : 'transparent',
                          }}
                        >
                          <div style={{ display: 'inline-block', position: 'relative' }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              data-row={rowIndex}
                              data-col={p}
                              value={currentVal}
                              onChange={(e) => handleCellChange(student.inscripcion_id, p, e.target.value)}
                              onKeyDown={(e) =>
                                handleCellKeyDown(e, rowIndex, p, filteredEstudiantes.length)
                              }
                              onPaste={(e) =>
                                handleCellPaste(e, rowIndex, p, filteredEstudiantes)
                              }
                              style={{
                                width: 75,
                                textAlign: 'center',
                                padding: '6px 4px',
                                fontWeight: 700,
                                fontSize: '.88rem',
                                color: gradeColor,
                                border: errorMsg
                                  ? '2px solid #ef4444'
                                  : isModified
                                  ? '2px solid #3b82f6'
                                  : '1px solid var(--line)',
                                borderRadius: 6,
                                background: '#ffffff',
                              }}
                              title={errorMsg || undefined}
                            />
                            {errorMsg && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: -16,
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  whiteSpace: 'nowrap',
                                  fontSize: '.66rem',
                                  fontWeight: 700,
                                  color: '#dc2626',
                                  zIndex: 5,
                                }}
                              >
                                {errorMsg}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Promedio */}
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>
                      {promedio !== null ? (
                        <span>
                          {promedio.toLocaleString('es-BO', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          {!isComplete && (
                            <small
                              style={{
                                display: 'block',
                                color: 'var(--muted)',
                                fontSize: '.68rem',
                                fontWeight: 500,
                              }}
                            >
                              (parcial)
                            </small>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Estado */}
                    <td style={{ textAlign: 'center' }}>
                      {estadoBadgeClass ? (
                        <span className={`badge ${estadoBadgeClass}`}>{estadoText}</span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Fila Final: Promedios del Curso */}
            <tfoot>
              <tr style={{ background: '#f1f5f9', fontWeight: 700, borderTop: '2px solid var(--line)' }}>
                <td colSpan={3} style={{ textAlign: 'right', padding: '12px 14px' }}>
                  PROMEDIO DEL CURSO:
                </td>
                {Array.from({ length: periodosTotales }).map((_, pIdx) => {
                  const p = pIdx + 1;
                  const avg = promediosCurso.porPeriodo?.[p];
                  return (
                    <td key={p} style={{ textAlign: 'center', fontSize: '.9rem' }}>
                      {avg !== null && avg !== undefined
                        ? avg.toLocaleString('es-BO', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : '—'}
                    </td>
                  );
                })}
                <td style={{ textAlign: 'center', fontSize: '.92rem', color: 'var(--accent)' }}>
                  {promediosCurso.general !== null && promediosCurso.general !== undefined
                    ? promediosCurso.general.toLocaleString('es-BO', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '—'}
                </td>
                <td style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '.76rem' }}>
                  General
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      <ConfirmDialog isOpen={confirmSave} title="Confirmar notas y correcciones" message={`Se guardarán ${cellInputs.size} cambios en ${grillaData?.asignacion.materia ?? ''}, ${grillaData?.asignacion.curso_etiqueta ?? ''}. Las celdas modificadas reemplazan las notas anteriores; una celda vacía retira esa nota. Podrás corregirlas nuevamente.`} confirmLabel="Guardar cambios" onCancel={() => setConfirmSave(false)} onConfirm={() => { setConfirmSave(false); void handleSave(); }} />
      {/* Diálogo de Confirmación para Descartar Cambios al Cambiar Filtros */}
      <ConfirmDialog
        isOpen={showConfirmDiscard}
        title="Cambios sin guardar"
        message={`Tienes ${cellInputs.size} ${
          cellInputs.size === 1 ? 'cambio pendiente' : 'cambios pendientes'
        } en la grilla. Si cambias de filtro ahora, se descartarán. ¿Deseas descartarlos y continuar?`}
        confirmLabel="Descartar y continuar"
        cancelLabel="Permanecer aquí"
        danger={true}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </div>
  );
}
