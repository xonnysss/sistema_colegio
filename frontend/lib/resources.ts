import { SCHOOL_CONFIG } from './config';

export type Field = { key: string; label: string; type?: 'number' | 'date' | 'email' | 'password' | 'select'; relation?: 'usuarios' | 'estudiantes' | 'docentes' | 'materias' | 'cursos' | 'inscripciones' | 'asignaciones'; options?: string[]; optional?: boolean };
export type Resource = { title: string; singular: string; id: string; fields: Field[] };

// Meses del año escolar según configuración (ej: 2=Febrero ... 11=Noviembre)
const MESES_PENSION: string[] = Array.from(
  { length: SCHOOL_CONFIG.MES_FIN_PENSIONES - SCHOOL_CONFIG.MES_INICIO_PENSIONES + 1 },
  (_, i) => String(SCHOOL_CONFIG.MES_INICIO_PENSIONES + i),
);

export const resources: Record<string, Resource> = {
  estudiantes: { title: 'Estudiantes', singular: 'estudiante', id: 'id_estudiante', fields: [{ key: 'usuario_id', label: 'Cuenta de acceso (opcional)', type: 'select', relation: 'usuarios', optional: true }, { key: 'rude', label: 'RUDE' }, { key: 'ci', label: 'CI' }, { key: 'nombres', label: 'Nombres' }, { key: 'apellidos', label: 'Apellidos' }, { key: 'fecha_nacimiento', label: 'Nacimiento', type: 'date' }, { key: 'tutor_nombre', label: 'Tutor' }, { key: 'tutor_celular', label: 'Celular tutor' }] },
  docentes: { title: 'Docentes', singular: 'docente', id: 'id_docente', fields: [{ key: 'ci', label: 'CI' }, { key: 'nombres', label: 'Nombres' }, { key: 'apellidos', label: 'Apellidos' }, { key: 'especialidad', label: 'Especialidad' }, { key: 'celular', label: 'Celular' }] },
  materias: { title: 'Materias', singular: 'materia', id: 'id_materia', fields: [{ key: 'nombre_materia', label: 'Nombre de materia' }, { key: 'sigla', label: 'Sigla' }] },
  cursos: { title: 'Cursos', singular: 'curso', id: 'id_curso', fields: [{ key: 'nombre', label: 'Grado (ej. 1ro)' }, { key: 'nivel', label: 'Nivel', type: 'select', options: ['INICIAL', 'PRIMARIA', 'SECUNDARIA'] }, { key: 'paralelo', label: 'Paralelo' }, { key: 'turno', label: 'Turno', type: 'select', options: ['MAÑANA', 'TARDE', 'NOCHE'] }, { key: 'gestion', label: 'Gestión', type: 'number' }] },
  inscripciones: { title: 'Inscripciones', singular: 'inscripción', id: 'id_inscripcion', fields: [{ key: 'estudiante_id', label: 'Estudiante', type: 'select', relation: 'estudiantes' }, { key: 'curso_id', label: 'Curso', type: 'select', relation: 'cursos' }, { key: 'fecha_inscripcion', label: 'Fecha', type: 'date' }] },
  asignaciones: { title: 'Asignaciones', singular: 'asignación', id: 'id_asignacion', fields: [{ key: 'docente_id', label: 'Docente', type: 'select', relation: 'docentes' }, { key: 'curso_id', label: 'Curso', type: 'select', relation: 'cursos' }, { key: 'materia_id', label: 'Materia', type: 'select', relation: 'materias' }] },
  calificaciones: { title: 'Calificaciones', singular: 'calificación', id: 'id_calificacion', fields: [{ key: 'inscripcion_id', label: 'Estudiante y curso', type: 'select', relation: 'inscripciones' }, { key: 'asignacion_id', label: 'Docente, materia y curso', type: 'select', relation: 'asignaciones' }, { key: 'periodo', label: 'Período', type: 'select', options: ['1', '2', '3', '4'] }, { key: 'nota', label: 'Nota (0-100)', type: 'number' }] },
  pagos: { title: 'Pagos', singular: 'pago', id: 'id_pago', fields: [{ key: 'inscripcion_id', label: 'Estudiante y curso', type: 'select', relation: 'inscripciones' }, { key: 'mes', label: 'Mes', type: 'select', options: MESES_PENSION }, { key: 'monto_pagado', label: 'Monto pagado', type: 'number' }, { key: 'fecha_pago', label: 'Fecha de pago', type: 'date' }, { key: 'nro_recibo', label: 'Nro. recibo' }, { key: 'pagado_por', label: 'Pagado por' }] },
  usuarios: { title: 'Usuarios', singular: 'usuario', id: 'id_usuario', fields: [{ key: 'email', label: 'Correo', type: 'email' }, { key: 'password', label: 'Contraseña (mín. 6)', type: 'password' }, { key: 'rol', label: 'Rol', type: 'select', options: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] }] },
};

export const navigation = ['estudiantes', 'docentes', 'materias', 'cursos', 'inscripciones', 'asignaciones', 'pagos', 'usuarios'];
