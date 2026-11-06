'use client';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { exportExcel, exportPdf } from '../../lib/export';
import { navigation, resources, Field } from '../../lib/resources';
import { SCHOOL_CONFIG, formatDate, formatMoney } from '../../lib/config';
import { imprimirReciboPdf } from '../../lib/documents';
import { DataTable } from './components/DataTable';
import { Boletin } from './components/Boletin';
import { FichaEstudiante } from './components/FichaEstudiante';
import { Centralizador } from './components/Centralizador';
import { Mora } from './components/Mora';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Combobox } from './components/Combobox';
import { RegistrarNotas } from './components/RegistrarNotas';
import { NotasRegistradas } from './components/NotasRegistradas';

type Row = Record<string, unknown>;
type User = { email: string; rol: string };
type Catalogs = Record<string, Array<{ [key: string]: unknown; etiqueta: string }>>;
type FiltersState = {
  gestion: string;
  nivel: string;
  cursoId: string;
  turno: string;
  mes: string;
  materiaId: string;
  periodo: string;
};

const labels: Record<string, string> = {
  estudiantes: 'Estudiantes',
  docentes: 'Docentes',
  cursos: 'Cursos',
  inscripciones: 'Inscripciones',
  pagos: 'Pagos',
};
const gestionActual = 2026;
const text = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const courseName = (r: Row) => `${text(r.grado ?? r.nombre)} ${text(r.paralelo)} - ${text(r.nivel)}`;

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('usuario');
    if (!raw) router.replace('/login');
    else setUser(JSON.parse(raw));
  }, [router]);

  if (!user) return null;

  return user.rol === 'ESTUDIANTE' ? (
    <StudentPortal user={user} logout={() => logout(router)} />
  ) : user.rol === 'DOCENTE' ? (
    <TeacherPortal user={user} logout={() => logout(router)} />
  ) : (
    <Management user={user} logout={() => logout(router)} />
  );
}

function logout(router: ReturnType<typeof useRouter>) {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  router.replace('/login');
}

function Management({ user, logout }: { user: User; logout: () => void }) {
  const [section, setSection] = useState('inicio');
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('');
  const [isErrorNotice, setIsErrorNotice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [catalogs, setCatalogs] = useState<Catalogs>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [academic, setAcademic] = useState<Record<string, Row[]>>({});
  const [charts, setCharts] = useState<Record<string, Row[]>>({});
  const [estadoFilter, setEstadoFilter] = useState('1');

  // Estados para vistas especializadas
  const [fichaEstudianteId, setFichaEstudianteId] = useState<number | null>(null);
  const [confirmRow, setConfirmRow] = useState<Row | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [filters, setFilters] = useState<FiltersState>({
    gestion: String(gestionActual),
    nivel: '',
    cursoId: '',
    turno: '',
    mes: String(new Date().getMonth() + 1),
    materiaId: '',
    periodo: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>({
    gestion: String(gestionActual),
    nivel: '',
    cursoId: '',
    turno: '',
    mes: String(new Date().getMonth() + 1),
    materiaId: '',
    periodo: '',
  });

  const [boletin, setBoletin] = useState<{ estudiante: Row; materias: Row[]; resumen?: any } | null>(null);
  const [courseStudents, setCourseStudents] = useState<{ course: Row; students: Row[] } | null>(null);

  const resource = resources[section];
  const canEdit = user.rol === 'ADMIN' || (user.rol === 'DOCENTE' && section === 'calificaciones');

  // Auto-dismiss de mensajes a los 5 segundos
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const notify = (msg: string, isError = false) => {
    setMessage(msg);
    setIsErrorNotice(isError);
  };

  const handleApplyFilters = useCallback((newFilters?: FiltersState) => {
    const target = newFilters ?? filters;
    setFilters(target);
    setAppliedFilters(target);
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const gestion = appliedFilters.gestion;
      const defaultYear = String(gestionActual);

      if (section === 'inicio') {
        const y = gestion || defaultYear;
        const [s, c] = await Promise.all([
          api(`/dashboard/resumen?gestion=${y}`),
          api(`/dashboard/graficos?gestion=${y}`),
        ]);
        setSummary(s);
        setCharts(c);
      } else if (section === 'cursos_gestion') {
        const q = new URLSearchParams();
        if (gestion) q.set('gestion', gestion);
        if (appliedFilters.nivel) q.set('nivel', appliedFilters.nivel);
        if (appliedFilters.turno) q.set('turno', appliedFilters.turno);
        setRows(await api(`/reportes/cursos?${q}`));
      } else if (section === 'consultas') {
        const q = new URLSearchParams({ gestion: gestion || defaultYear });
        if (appliedFilters.nivel) q.set('nivel', appliedFilters.nivel);
        if (appliedFilters.cursoId) q.set('cursoId', appliedFilters.cursoId);
        if (appliedFilters.turno) q.set('turno', appliedFilters.turno);
        setRows(await api(`/reportes/listado?${q}`));
      } else if (section === 'academicos') {
        const q = new URLSearchParams({ gestion: gestion || defaultYear });
        if (appliedFilters.cursoId) q.set('cursoId', appliedFilters.cursoId);
        setAcademic(await api(`/reportes/academicos?${q}`));
      } else if (section === 'boletines') {
        const q = new URLSearchParams({ gestion: gestion || defaultYear });
        if (appliedFilters.nivel) q.set('nivel', appliedFilters.nivel);
        if (appliedFilters.cursoId) q.set('cursoId', appliedFilters.cursoId);
        setRows(await api(`/reportes/inscripciones?${q}`));
      } else if (section === 'calificaciones') {
        const q = new URLSearchParams({ estado: estadoFilter });
        if (gestion) q.set('gestion', gestion);
        if (appliedFilters.nivel) q.set('nivel', appliedFilters.nivel);
        if (appliedFilters.cursoId) q.set('cursoId', appliedFilters.cursoId);
        if (appliedFilters.materiaId) q.set('materiaId', appliedFilters.materiaId);
        if (appliedFilters.periodo) q.set('periodo', appliedFilters.periodo);
        setRows(await api(`/calificaciones?${q}`));
      } else if (section === 'asignaciones') {
        const q = new URLSearchParams({ estado: estadoFilter });
        if (gestion) q.set('gestion', gestion);
        if (appliedFilters.nivel) q.set('nivel', appliedFilters.nivel);
        if (appliedFilters.cursoId) q.set('cursoId', appliedFilters.cursoId);
        if (appliedFilters.materiaId) q.set('materiaId', appliedFilters.materiaId);
        setRows(await api(`/asignaciones?${q}`));
      } else if (section === 'inscripciones') {
        const q = new URLSearchParams({ estado: estadoFilter });
        if (gestion) q.set('gestion', gestion);
        if (appliedFilters.nivel) q.set('nivel', appliedFilters.nivel);
        if (appliedFilters.cursoId) q.set('cursoId', appliedFilters.cursoId);
        setRows(await api(`/inscripciones?${q}`));
      } else if (section === 'pagos') {
        const q = new URLSearchParams({ estado: estadoFilter });
        if (gestion) q.set('gestion', gestion);
        if (appliedFilters.nivel) q.set('nivel', appliedFilters.nivel);
        if (appliedFilters.cursoId) q.set('cursoId', appliedFilters.cursoId);
        setRows(await api(`/pagos?${q}`));
      } else if (resource) {
        setRows(await api(`/${section}?estado=${estadoFilter}`));
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron cargar los datos', true);
    } finally {
      setLoading(false);
    }
  }, [section, resource, appliedFilters, estadoFilter]);

  useEffect(() => {
    if (user) void api('/catalogos').then(setCatalogs).catch((e) => notify(e.message, true));
  }, [user]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  function select(next: string) {
    setSection(next);
    setRows([]);
    setBoletin(null);
    setCourseStudents(null);
    setEditing(null);
    setForm({});
    setFichaEstudianteId(null);
    setEstadoFilter('1');
  }

  function edit(row: Row) {
    if (!resource) return;
    const data: Record<string, string> = {};
    resource.fields.forEach((f) => {
      const value = row[f.key];
      data[f.key] = value === undefined || value === null ? '' : f.type === 'date' ? String(value).slice(0, 10) : String(value);
    });
    setForm(data);
    setEditing(Number(row[resource.id]));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!resource) return;
    setSubmitting(true);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      await api(`/${section}${editing ? `/${editing}` : ''}`, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      notify('Registro guardado correctamente.');
      setForm({});
      setEditing(null);
      const cat = await api('/catalogos');
      setCatalogs(cat);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo guardar', true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!resource || !confirmRow) return;
    const id = confirmRow[resource.id];
    setConfirmRow(null);
    try {
      await api(`/${section}/${id}`, { method: 'DELETE' });
      notify('Registro dado de baja correctamente.');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo dar de baja', true);
    }
  }

  async function handleReactivate(row: Row) {
    if (!resource) return;
    try {
      await api(`/${section}/${row[resource.id]}/reactivar`, { method: 'PATCH' });
      notify('Registro reactivado correctamente.');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo reactivar el registro', true);
    }
  }

  async function openBoletin(row: Row) {
    try {
      setBoletin(await api(`/reportes/boletin/${row.id_inscripcion}`));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo abrir el boletín', true);
    }
  }

  async function openCourse(row: Row) {
    try {
      setCourseStudents({
        course: row,
        students: await api(`/reportes/cursos/${row.id_curso}/estudiantes`),
      });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo cargar la lista del curso', true);
    }
  }

  async function handlePrintRecibo(pagoId: number) {
    try {
      const rec = await api(`/reportes/recibo/${pagoId}`);
      await imprimirReciboPdf(rec);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo descargar el recibo', true);
    }
  }

  const title =
    section === 'inicio'
      ? 'Resumen institucional'
      : section === 'centralizador'
      ? 'Centralizador de calificaciones'
      : section === 'cursos_gestion'
      ? 'Cursos de la gestión'
      : section === 'consultas'
      ? 'Lista de estudiantes'
      : section === 'academicos'
      ? 'Reportes académicos'
      : section === 'boletines'
      ? 'Boletines'
      : section === 'morosidad'
      ? 'Control de mora'
      : section === 'registrar_notas'
      ? 'Registrar notas'
      : section === 'notas_registradas'
      ? 'Notas registradas'
      : resource?.title;

  return (
    <main className="shell">
      <Sidebar section={section} select={select} logout={logout} management role={user.rol} />
      <section className="content">
        {section !== 'registrar_notas' && section !== 'notas_registradas' && (
          <header>
            <div>
              <span className="eyebrow">
                {appliedFilters.gestion ? `GESTIÓN ${appliedFilters.gestion}` : 'TODAS LAS GESTIONES'}
              </span>
              <h1>{title}</h1>
            </div>
            <div className="user">
              {user.email}
              <b>{user.rol}</b>
            </div>
          </header>
        )}

        {message && (
          <div
            className={isErrorNotice ? 'error' : 'notice'}
            role={isErrorNotice ? 'alert' : 'status'}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>{message}</span>
            <button
              type="button"
              style={{ background: 'none', border: 0, padding: 0, color: 'inherit', fontWeight: 'bold' }}
              onClick={() => setMessage('')}
            >
              ✕
            </button>
          </div>
        )}

        {loading && <p className="notice">Cargando…</p>}

        {/* INICIO */}
        {section === 'inicio' && (
          <>
            <Filters
              value={filters}
              setValue={setFilters}
              catalogs={catalogs}
              onApply={handleApplyFilters}
            />
            <div className="stats">
              {Object.entries(summary).map(([key, value]) => (
                <article key={key}>
                  <small>{labels[key] ?? key}</small>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            <Charts data={charts} />
          </>
        )}

        {/* FILTROS EN REPORTES Y CRUD */}
        {['cursos_gestion', 'consultas', 'academicos', 'boletines', 'calificaciones', 'asignaciones', 'inscripciones'].includes(section) && (
          <Filters
            value={filters}
            setValue={setFilters}
            catalogs={catalogs}
            onApply={handleApplyFilters}
            allowAllManagement={['cursos_gestion', 'calificaciones', 'asignaciones', 'inscripciones'].includes(section)}
            showLevel={['cursos_gestion', 'consultas', 'boletines', 'calificaciones', 'asignaciones', 'inscripciones'].includes(section)}
            showCourse={['consultas', 'academicos', 'boletines', 'calificaciones', 'asignaciones', 'inscripciones'].includes(section)}
            showTurn={['cursos_gestion', 'consultas'].includes(section)}
            showMateria={['calificaciones', 'asignaciones'].includes(section)}
            showPeriodo={section === 'calificaciones'}
          />
        )}

        {/* CENTRALIZADOR DE NOTAS */}
        {section === 'centralizador' && <Centralizador catalogs={catalogs} />}

        {/* REGISTRAR NOTAS (PANTALLA 1) */}
        {section === 'registrar_notas' && <RegistrarNotas user={user} />}

        {/* NOTAS REGISTRADAS (PANTALLA 2) */}
        {section === 'notas_registradas' && (
          <NotasRegistradas user={user} onGoToRegistrar={() => setSection('registrar_notas')} />
        )}

        {/* MORA */}
        {section === 'morosidad' && <Mora catalogs={catalogs} />}

        {/* CURSOS DE LA GESTIÓN */}
        {section === 'cursos_gestion' && (
          <>
            <CourseSummary rows={rows} />
            <DataTable title="Cursos" rows={rows} action={{ label: 'Ver estudiantes', run: openCourse }} />
            {courseStudents && (
              <section className="boletin-card">
                <h2>{courseName(courseStudents.course)}</h2>
                <DataTable title="Estudiantes del curso" rows={courseStudents.students} />
              </section>
            )}
          </>
        )}

        {/* LISTA POR CURSO / CONSULTAS */}
        {section === 'consultas' && <DataTable title="Lista de estudiantes" rows={rows} />}

        {/* REPORTES ACADÉMICOS */}
        {section === 'academicos' && <AcademicReports data={academic} />}

        {/* BOLETINES */}
        {section === 'boletines' && (
          <>
            <DataTable
              title="Inscripciones de la gestión"
              rows={rows}
              action={{ label: 'Ver boletín', run: openBoletin }}
            />
            {boletin && <Boletin data={boletin} onClose={() => setBoletin(null)} />}
          </>
        )}

        {/* VISTA FICHA DEL ESTUDIANTE */}
        {section === 'estudiantes' && fichaEstudianteId !== null && (
          <FichaEstudiante
            estudianteId={fichaEstudianteId}
            onBack={() => setFichaEstudianteId(null)}
          />
        )}

        {/* CRUD GENÉRICO DE RECURSOS */}
        {resource && !(section === 'estudiantes' && fichaEstudianteId !== null) && (
          <>
            <div className="module-head">
              <p>Registra y administra {resource.title.toLowerCase()}.</p>
              {canEdit && (
                <button
                  className="outline"
                  onClick={() => {
                    setEditing(null);
                    setForm({});
                  }}
                >
                  Nuevo {resource.singular}
                </button>
              )}
            </div>

            {canEdit && (
              <Editor
                resource={resource}
                catalogs={catalogs}
                form={form}
                setForm={setForm}
                editing={editing}
                submit={submit}
                cancel={() => {
                  setEditing(null);
                  setForm({});
                }}
                submitting={submitting}
              />
            )}

            {section === 'asignaciones' ? (
              <AssignmentOverview
                rows={rows}
                courseSelected={Boolean(appliedFilters.cursoId)}
                estadoFilter={estadoFilter}
                onEstadoFilterChange={setEstadoFilter}
                onEdit={edit}
                onRemove={(r) => setConfirmRow(r)}
                onReactivate={handleReactivate}
              />
            ) : (
              <DataTable
                title={resource.title}
                rows={rows}
                showEstadoFilter
                estadoFilter={estadoFilter}
                onEstadoFilterChange={(est) => setEstadoFilter(est)}
                action={
                  section === 'estudiantes'
                  ? { label: '👁 Ver ficha', run: (r) => setFichaEstudianteId(Number(r.id_estudiante)) }
                  : section === 'pagos'
                  ? { label: '🖨 Recibo', run: (r) => handlePrintRecibo(Number(r.id_pago)) }
                  : canEdit
                  ? { label: 'Editar', run: edit }
                  : undefined
              }
                secondaryAction={
                  (section === 'estudiantes' || section === 'pagos') && canEdit
                  ? { label: 'Editar', run: edit }
                  : undefined
                }
                remove={canEdit ? (r) => setConfirmRow(r) : undefined}
                onReactivate={canEdit ? handleReactivate : undefined}
              />
            )}
          </>
        )}

        <ConfirmDialog
          isOpen={Boolean(confirmRow)}
          title="Confirmar baja lógica"
          message={`¿Estás seguro de que deseas dar de baja a "${
            confirmRow ? (confirmRow.nombres ? `${confirmRow.nombres} ${confirmRow.apellidos ?? ''}` : confirmRow.nombre_materia || confirmRow.nombre || confirmRow.email || 'este registro') : ''
          }"?`}
          danger
          confirmLabel="Dar de baja"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmRow(null)}
        />
      </section>
    </main>
  );
}

function Sidebar({
  section,
  select,
  logout,
  management,
  role,
}: {
  section: string;
  select: (s: string) => void;
  logout: () => void;
  management?: boolean;
  role?: string;
}) {
  const isDocente = role === 'DOCENTE';

  const links = isDocente
    ? ['mis_asignaciones', 'registrar_notas', 'notas_registradas']
    : management
    ? [
        'registrar_notas',
        'notas_registradas',
        ...navigation,
        'centralizador',
        'cursos_gestion',
        'consultas',
        'boletines',
        'academicos',
        'morosidad',
      ]
    : [];

  const names: Record<string, string> = {
    mis_asignaciones: 'Mis asignaciones',
    registrar_notas: 'Registrar notas',
    notas_registradas: 'Notas registradas',
    centralizador: 'Centralizador de notas',
    cursos_gestion: 'Cursos de la gestión',
    consultas: 'Lista por curso',
    boletines: 'Boletines',
    academicos: 'Reportes académicos',
    morosidad: 'Control de mora',
  };

  return (
    <aside>
      <div className="brand">
        <span>MS</span>
        <div>
          <strong>Marco School</strong>
          <small>Gestión escolar</small>
        </div>
      </div>
      <nav>
        {management && (
          <button className={section === 'inicio' ? 'active' : ''} onClick={() => select('inicio')}>
            Inicio
          </button>
        )}
        {links.map((key) => (
          <button
            key={key}
            className={section === key ? 'active' : ''}
            onClick={() => select(key)}
          >
            {resources[key]?.title ?? names[key]}
          </button>
        ))}
      </nav>
      <button className="logout" onClick={logout}>
        Cerrar sesión
      </button>
    </aside>
  );
}

function AssignmentOverview({
  rows,
  courseSelected,
  estadoFilter,
  onEstadoFilterChange,
  onEdit,
  onRemove,
  onReactivate,
}: {
  rows: Row[];
  courseSelected: boolean;
  estadoFilter: string;
  onEstadoFilterChange: (value: string) => void;
  onEdit: (row: Row) => void;
  onRemove: (row: Row) => void;
  onReactivate: (row: Row) => void;
}) {
  const totals = useMemo(() => ({
    cursos: new Set(rows.map((row) => String(row.id_curso))).size,
    materias: new Set(rows.map((row) => String(row.id_materia))).size,
    docentes: new Set(rows.map((row) => String(row.docente))).size,
  }), [rows]);

  return (
    <section className="assignment-overview">
      <div className="assignment-summary" aria-label="Resumen de carga académica">
        <article><small>Asignaciones</small><strong>{rows.length}</strong></article>
        <article><small>Cursos</small><strong>{totals.cursos}</strong></article>
        <article><small>Materias</small><strong>{totals.materias}</strong></article>
        <article><small>Docentes</small><strong>{totals.docentes}</strong></article>
      </div>
      <div className="assignment-help">
        <strong>{courseSelected ? 'Carga académica del curso seleccionado' : 'Vista general de carga académica'}</strong>
        <span>
          {courseSelected
            ? 'Cada fila corresponde a una materia y muestra quién la imparte.'
            : 'Para revisar claramente las materias de un curso, selecciónalo en el filtro Curso.'}
        </span>
      </div>
      <DataTable
        title={courseSelected ? 'Materias y docentes del curso' : 'Carga académica'}
        rows={rows}
        showEstadoFilter
        estadoFilter={estadoFilter}
        onEstadoFilterChange={onEstadoFilterChange}
        preferredColumns={['gestion', 'nivel', 'curso', 'turno', 'materia', 'sigla', 'docente', 'estado']}
        defaultSort="curso"
        defaultSortAsc
        action={{ label: 'Editar', run: onEdit }}
        remove={onRemove}
        onReactivate={onReactivate}
        defaultPageSize={25}
      />
    </section>
  );
}

function Filters({
  value,
  setValue,
  catalogs,
  onApply,
  allowAllManagement,
  showCourse,
  showLevel,
  showTurn,
  showMateria,
  showPeriodo,
}: {
  value: FiltersState;
  setValue: (v: FiltersState) => void;
  catalogs: Catalogs;
  onApply: (v?: FiltersState) => void;
  allowAllManagement?: boolean;
  showCourse?: boolean;
  showLevel?: boolean;
  showTurn?: boolean;
  showMateria?: boolean;
  showPeriodo?: boolean;
}) {
  const detectedYears = [...new Set((catalogs.cursos ?? []).map((c) => String(c.gestion)).filter(Boolean))].sort(
    (a, b) => Number(b) - Number(a)
  );
  const years = detectedYears.length ? detectedYears : ['2026', '2025'];

  const update = (key: keyof FiltersState, val: string) => {
    const next: FiltersState = { ...value, [key]: val };

    // Si se cambia la gestión o el nivel, verificar si el curso seleccionado sigue siendo válido
    if (key === 'gestion' || key === 'nivel') {
      const targetGestion = key === 'gestion' ? val : value.gestion;
      const targetNivel = key === 'nivel' ? val : value.nivel;
      if (next.cursoId) {
        const stillValid = (catalogs.cursos ?? []).some(
          (c) =>
            String(c.id_curso) === next.cursoId &&
            (!targetGestion || String(c.gestion) === targetGestion) &&
            (!targetNivel || c.nivel === targetNivel)
        );
        if (!stillValid) {
          next.cursoId = '';
        }
      }
    }

    setValue(next);
    onApply(next);
  };

  const reset = () => {
    const empty: FiltersState = {
      gestion: String(gestionActual),
      nivel: '',
      cursoId: '',
      turno: '',
      mes: String(new Date().getMonth() + 1),
      materiaId: '',
      periodo: '',
    };
    setValue(empty);
    onApply(empty);
  };

  return (
    <div className="filters">
      <label>
        Gestión
        <select value={value.gestion} onChange={(e) => update('gestion', e.target.value)}>
          {allowAllManagement && <option value="">Todas las gestiones</option>}
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      {showLevel && (
        <label>
          Nivel
          <select value={value.nivel} onChange={(e) => update('nivel', e.target.value)}>
            <option value="">Todos los niveles</option>
            <option value="PRIMARIA">PRIMARIA</option>
            <option value="SECUNDARIA">SECUNDARIA</option>
            <option value="INICIAL">INICIAL</option>
          </select>
        </label>
      )}
      {showCourse && (
        <label>
          Curso
          <select value={value.cursoId} onChange={(e) => update('cursoId', e.target.value)}>
            <option value="">Todos los cursos</option>
            {(catalogs.cursos ?? [])
              .filter(
                (c) =>
                  (!value.gestion || String(c.gestion) === value.gestion) &&
                  (!value.nivel || c.nivel === value.nivel)
              )
              .map((c) => (
                <option key={String(c.id_curso)} value={String(c.id_curso)}>
                  {c.etiqueta}
                </option>
              ))}
          </select>
        </label>
      )}
      {showMateria && (
        <label>
          Materia
          <select value={value.materiaId} onChange={(e) => update('materiaId', e.target.value)}>
            <option value="">Todas las materias</option>
            {(catalogs.materias ?? []).map((m) => (
              <option key={String(m.id_materia)} value={String(m.id_materia)}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </label>
      )}
      {showPeriodo && (
        <label>
          Período
          <select value={value.periodo} onChange={(e) => update('periodo', e.target.value)}>
            <option value="">Todos los períodos</option>
            <option value="1">1.º Período</option>
            <option value="2">2.º Período</option>
            <option value="3">3.º Período</option>
            <option value="4">4.º Período</option>
          </select>
        </label>
      )}
      {showTurn && (
        <label>
          Turno
          <select value={value.turno} onChange={(e) => update('turno', e.target.value)}>
            <option value="">Todos los turnos</option>
            <option value="MAÑANA">MAÑANA</option>
            <option value="TARDE">TARDE</option>
            <option value="NOCHE">NOCHE</option>
          </select>
        </label>
      )}
      <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
        <button type="button" onClick={() => onApply(value)}>
          Filtrar
        </button>
        <button type="button" className="outline" onClick={reset} title="Restablecer filtros">
          Limpiar
        </button>
      </div>
    </div>
  );
}

function Editor({
  resource,
  catalogs,
  form,
  setForm,
  editing,
  submit,
  cancel,
  submitting,
}: {
  resource: typeof resources[string];
  catalogs: Catalogs;
  form: Record<string, string>;
  setForm: (v: Record<string, string>) => void;
  editing: number | null;
  submit: (e: FormEvent) => void;
  cancel: () => void;
  submitting?: boolean;
}) {
  return (
    <form className="editor" onSubmit={submit}>
      <h2>{editing ? `Editar ${resource.singular}` : `Nuevo ${resource.singular}`}</h2>
      <div className="form-grid">
        {resource.fields.map((f) => (
          <FieldInput
            key={f.key}
            field={f}
            form={form}
            setForm={setForm}
            catalogs={catalogs}
            editing={editing}
          />
        ))}
      </div>
      <div className="actions">
        <button disabled={submitting}>
          {submitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar'}
        </button>
        {editing && (
          <button type="button" className="outline" onClick={cancel} disabled={submitting}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function FieldInput({
  field,
  form,
  setForm,
  catalogs,
  editing,
}: {
  field: Field;
  form: Record<string, string>;
  setForm: (v: Record<string, string>) => void;
  catalogs: Catalogs;
  editing: number | null;
}) {
  const set = (value: string) => setForm({ ...form, [field.key]: value });
  // Un campo es requerido salvo que: sea 'password' en edición, o tenga optional:true
  const isRequired = !field.optional && (!editing || field.key !== 'password');

  if (field.type === 'select') {
    const options = field.options
      ? field.options.map((x) => ({ value: x, label: x }))
      : (catalogs[field.relation ?? ''] ?? []).map((x) => ({
          value: String(Object.entries(x).find(([k]) => k.startsWith('id_'))?.[1]),
          label: x.etiqueta,
        }));

    const useCombobox = options.length > 15;

    return (
      <label>
        {field.label} {isRequired && <span style={{ color: 'var(--danger)' }}>*</span>}
        {useCombobox ? (
          <Combobox
            options={options}
            value={form[field.key] ?? ''}
            onChange={(val) => set(val !== null && val !== undefined ? String(val) : '')}
            placeholder="Buscar o seleccionar…"
          />
        ) : (
          <select
            value={form[field.key] ?? ''}
            onChange={(e) => set(e.target.value)}
            required={isRequired}
          >
            <option value="">{field.optional ? '— Sin asignar —' : 'Selecciona…'}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </label>
    );
  }

  return (
    <label>
      {field.label} {isRequired && <span style={{ color: 'var(--danger)' }}>*</span>}
      <input
        type={field.type ?? 'text'}
        value={form[field.key] ?? ''}
        onChange={(e) => set(e.target.value)}
        required={isRequired}
      />
    </label>
  );
}

function CourseSummary({ rows }: { rows: Row[] }) {
  const students = rows.reduce((total, row) => total + Number(row.total_estudiantes ?? 0), 0);
  const levels = new Set(rows.map((row) => String(row.nivel))).size;

  return (
    <div className="course-summary">
      <article>
        <small>Cursos encontrados</small>
        <strong>{rows.length}</strong>
      </article>
      <article>
        <small>Estudiantes inscritos</small>
        <strong>{students}</strong>
      </article>
      <article>
        <small>Niveles incluidos</small>
        <strong>{levels}</strong>
      </article>
      <p>Usa los encabezados para ordenar por gestión, nivel, grado, paralelo, turno o cantidad de estudiantes.</p>
    </div>
  );
}

function AcademicReports({ data }: { data: Record<string, Row[]> }) {
  return (
    <div className="reports">
      <div className="report-card">
        <div className="report-header">
          <h2>💰 1. Ingresos por mes y curso</h2>
          <p>
            Muestra el total recaudado en Bolivianos (Bs) y la cantidad de mensualidades cobradas en cada mes y curso de la gestión.
          </p>
        </div>
        <DataTable title="Ingresos por mes y curso" rows={data.ingresos ?? []} />
      </div>

      <div className="report-card">
        <div className="report-header">
          <h2>📊 2. Promedios por curso y materia</h2>
          <p>
            Calcula la nota promedio general alcanzada en cada materia por curso. Sirve para evaluar el rendimiento grupal y detectar materias con bajo promedio.
          </p>
        </div>
        <DataTable title="Promedios por curso y materia" rows={data.promedios ?? []} />
      </div>

      <div className="report-card">
        <div className="report-header">
          <h2>🏆 3. Ranking académico del curso</h2>
          <p>
            Lista a los estudiantes ordenados de mayor a menor promedio general final. Ideal para definir el cuadro de honor y reconocer a los mejores alumnos.
          </p>
        </div>
        <DataTable title="Ranking del curso" rows={data.ranking ?? []} />
      </div>

      <div className="report-card">
        <div className="report-header">
          <h2>⚠️ 4. Estudiantes en riesgo académico (Promedio menor a 61)</h2>
          <p>
            Alumnos cuyo promedio general final no alcanza la nota mínima de seguridad (61 puntos). Permite intervenir oportunamente con apoyo pedagógico antes del cierre de gestión.
          </p>
        </div>
        <DataTable title="Alumnos en riesgo promedio menor a 61" rows={data.riesgo ?? []} />
      </div>
    </div>
  );
}

function Charts({ data }: { data: Record<string, Row[]> }) {
  const students = data.alumnosPorCurso ?? [];
  const payments = data.pagosPorMes ?? [];
  const maxA = Math.max(1, ...students.map((r) => Number(r.total)));
  const maxP = Math.max(1, ...payments.map((r) => Number(r.total)));

  return (
    <div className="charts">
      <Chart
        title="Alumnos por curso"
        rows={students}
        label={(r) => text(r.etiqueta)}
        value={(r) => Number(r.total)}
        max={maxA}
      />
      <Chart
        title="Pagos por mes"
        rows={payments}
        label={(r) => `Mes ${text(r.mes)}`}
        value={(r) => Number(r.total)}
        max={maxP}
        currency
      />
    </div>
  );
}

function Chart({
  title,
  rows,
  label,
  value,
  max,
  currency,
}: {
  title: string;
  rows: Row[];
  label: (r: Row) => string;
  value: (r: Row) => number;
  max: number;
  currency?: boolean;
}) {
  return (
    <section className="chart">
      <h2>{title}</h2>
      {rows.length ? (
        rows.map((r, i) => (
          <div className="bar" key={i}>
            <span>{label(r)}</span>
            <div>
              <i style={{ width: `${(value(r) / max) * 100}%` }} />
            </div>
            <b>{currency ? formatMoney(value(r)) : value(r)}</b>
          </div>
        ))
      ) : (
        <p>Sin datos para esta gestión.</p>
      )}
    </section>
  );
}

function TeacherPortal({ user, logout }: { user: User; logout: () => void }) {
  const [section, setSection] = useState<'mis_asignaciones' | 'registrar_notas' | 'notas_registradas'>('mis_asignaciones');
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/docente/asignaciones')
      .then(setRows)
      .catch((e) => setMessage(e.message));
  }, []);

  return (
    <main className="shell">
      <Sidebar section={section} select={(s) => setSection(s as any)} logout={logout} role="DOCENTE" />
      <section className="content">
        {section === 'mis_asignaciones' && (
          <>
            <header>
              <div>
                <span className="eyebrow">PORTAL DOCENTE</span>
                <h1>Mis asignaciones</h1>
              </div>
              <div className="user">
                {user.email}
                <b>DOCENTE</b>
              </div>
            </header>
            {message && <p className="notice">{message}</p>}
            <DataTable title="Mis asignaciones" rows={rows} />
            <button type="button" onClick={() => setSection('registrar_notas')}>Registrar o corregir notas</button>
          </>
        )}
        {section === 'registrar_notas' && <RegistrarNotas user={user} />}
        {section === 'notas_registradas' && (
          <NotasRegistradas user={user} onGoToRegistrar={() => setSection('registrar_notas')} />
        )}
      </section>
    </main>
  );
}

function StudentPortal({ user, logout }: { user: User; logout: () => void }) {
  const [portalTab, setPortalTab] = useState<'academico' | 'pagos'>('academico');
  const [data, setData] = useState<{ estudiante: Row; inscripciones: Row[] } | null>(null);
  const [pagosData, setPagosData] = useState<{
    estudiante: Row;
    inscripciones: Row[];
    pagos: Row[];
  } | null>(null);
  const [boletin, setBoletin] = useState<any>(null);
  const [selectedInscId, setSelectedInscId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/mi/resumen')
      .then((res) => {
        setData(res);
        if (res.inscripciones && res.inscripciones.length > 0) {
          setSelectedInscId(Number(res.inscripciones[0].id_inscripcion));
        }
      })
      .catch((e) => setMessage(e.message));
  }, []);

  useEffect(() => {
    if (portalTab === 'pagos') {
      api('/mi/pagos')
        .then(setPagosData)
        .catch((e) => setMessage(e.message));
    }
  }, [portalTab]);

  async function view(id: unknown) {
    try {
      setBoletin(await api(`/mi/boletin/${id}`));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo cargar el boletín');
    }
  }

  async function handlePrintStudentRecibo(pagoId: number) {
    try {
      const rec = await api(`/reportes/recibo/${pagoId}`);
      await imprimirReciboPdf(rec);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo descargar el recibo');
    }
  }

  // Meses grid para pagos del estudiante
  const activeInsc = pagosData?.inscripciones.find((i) => Number(i.id_inscripcion) === selectedInscId) ?? pagosData?.inscripciones[0];
  const pagosEst = (pagosData?.pagos ?? []).filter((p) => Number(p.inscripcion_id) === Number(activeInsc?.id_inscripcion));
  const pagosEstMap = new Map<number, Row>();
  let totalPagado = 0;
  for (const p of pagosEst) {
    pagosEstMap.set(Number(p.mes), p);
    totalPagado += Number(p.monto_pagado ?? 0);
  }

  const nombresMeses = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const gridMesesEst = [];
  let pendientesCount = 0;
  for (let m = SCHOOL_CONFIG.MES_INICIO_PENSIONES; m <= SCHOOL_CONFIG.MES_FIN_PENSIONES; m++) {
    const pago = pagosEstMap.get(m);
    if (!pago) pendientesCount++;
    gridMesesEst.push({
      mes: m,
      nombreMes: nombresMeses[m],
      pagado: Boolean(pago),
      pago,
    });
  }

  return (
    <main className="shell">
      <Sidebar section="" select={() => undefined} logout={logout} />
      <section className="content">
        <header>
          <div>
            <span className="eyebrow">PORTAL DEL ESTUDIANTE</span>
            <h1>Mi información académica y pagos</h1>
          </div>
          <div className="user">
            {user.email}
            <b>ESTUDIANTE</b>
          </div>
        </header>

        {message && <p className="notice">{message}</p>}

        {data && (
          <div className="student-card" style={{ marginBottom: 16 }}>
            <h2>{text(data.estudiante.nombres)} {text(data.estudiante.apellidos)}</h2>
            <p>RUDE: <strong>{text(data.estudiante.rude)}</strong></p>
          </div>
        )}

        <nav className="portal-nav">
          <button
            type="button"
            className={portalTab === 'academico' ? 'active' : ''}
            onClick={() => setPortalTab('academico')}
          >
            📚 Mis inscripciones y boletines
          </button>
          <button
            type="button"
            className={portalTab === 'pagos' ? 'active' : ''}
            onClick={() => setPortalTab('pagos')}
          >
            💳 Mis pagos de pensión
          </button>
        </nav>

        {portalTab === 'academico' && data && (
          <>
            <DataTable
              title="Mis inscripciones"
              rows={data.inscripciones}
              action={{ label: 'Ver mi boletín', run: (r) => view(r.id_inscripcion) }}
            />
            {boletin && <Boletin data={boletin} onClose={() => setBoletin(null)} />}
          </>
        )}

        {portalTab === 'pagos' && (
          <div>
            <div className="tab-control-bar">
              <label>
                Seleccionar Gestión / Inscripción:
                <select
                  value={selectedInscId ?? ''}
                  onChange={(e) => setSelectedInscId(Number(e.target.value))}
                >
                  {(pagosData?.inscripciones ?? []).map((insc) => (
                    <option key={String(insc.id_inscripcion)} value={String(insc.id_inscripcion)}>
                      Gestión {String(insc.gestion)} — {String(insc.grado)} {String(insc.paralelo)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="total-pagos-badge">
                Total pagado: <strong>{formatMoney(totalPagado)}</strong> | Meses pendientes: <strong>{pendientesCount}</strong>
              </div>
            </div>

            <div className="meses-grid">
              {gridMesesEst.map((m) => (
                <div key={m.mes} className={`mes-card ${m.pagado ? 'mes-pagado' : 'mes-pendiente'}`}>
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
                        onClick={() => handlePrintStudentRecibo(Number(m.pago!.id_pago))}
                      >
                        🖨 Recibo
                      </button>
                    </div>
                  ) : (
                    <div className="mes-card-body">
                      <p className="mes-sin-pago">Pendiente de pago</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
