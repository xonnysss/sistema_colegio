export type ResourceName =
  | 'usuarios' | 'estudiantes' | 'docentes' | 'materias' | 'cursos'
  | 'inscripciones' | 'asignaciones' | 'calificaciones' | 'pagos';

export type ResourceDefinition = {
  table: string;
  id: string;
  fields: readonly string[];
  searchable?: readonly string[];
};

export const RESOURCES: Record<ResourceName, ResourceDefinition> = {
  usuarios: {
    table: 'usuarios',
    id: 'id_usuario',
    fields: ['email', 'password_hash', 'rol', 'estado'],
    searchable: ['email', 'rol'],
  },
  estudiantes: {
    table: 'estudiantes',
    id: 'id_estudiante',
    fields: ['usuario_id', 'rude', 'ci', 'nombres', 'apellidos', 'fecha_nacimiento', 'tutor_nombre', 'tutor_celular', 'estado'],
    searchable: ['rude', 'ci', 'nombres', 'apellidos', 'tutor_nombre'],
  },
  docentes: {
    table: 'docentes',
    id: 'id_docente',
    fields: ['usuario_id', 'ci', 'nombres', 'apellidos', 'especialidad', 'celular', 'estado'],
    searchable: ['ci', 'nombres', 'apellidos', 'especialidad'],
  },
  materias: {
    table: 'materias',
    id: 'id_materia',
    fields: ['nombre_materia', 'sigla', 'estado'],
    searchable: ['nombre_materia', 'sigla'],
  },
  cursos: {
    table: 'cursos',
    id: 'id_curso',
    fields: ['nombre', 'nivel', 'paralelo', 'turno', 'gestion', 'estado'],
    searchable: ['nombre', 'nivel', 'paralelo', 'gestion'],
  },
  inscripciones: {
    table: 'inscripciones',
    id: 'id_inscripcion',
    fields: ['estudiante_id', 'curso_id', 'fecha_inscripcion', 'estado'],
    searchable: ['estudiante', 'rude', 'curso'],
  },
  asignaciones: {
    table: 'asignaciones',
    id: 'id_asignacion',
    fields: ['docente_id', 'curso_id', 'materia_id', 'estado'],
    searchable: ['docente', 'materia', 'curso'],
  },
  calificaciones: {
    table: 'calificaciones',
    id: 'id_calificacion',
    fields: ['inscripcion_id', 'asignacion_id', 'periodo', 'nota', 'estado'],
    searchable: ['estudiante', 'ci', 'rude', 'materia', 'docente', 'curso'],
  },
  pagos: {
    table: 'pagos',
    id: 'id_pago',
    fields: ['inscripcion_id', 'mes', 'monto_pagado', 'fecha_pago', 'nro_recibo', 'pagado_por', 'estado'],
    searchable: ['nro_recibo', 'pagado_por', 'estudiante', 'curso'],
  },
};

export function isResource(value: string): value is ResourceName {
  return Object.prototype.hasOwnProperty.call(RESOURCES, value);
}
