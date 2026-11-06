import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { Client } from 'pg';

type Materia = { nombre: string; sigla: string };
type Curso = { nombre: string; nivel: 'INICIAL' | 'PRIMARIA' | 'SECUNDARIA'; paralelo: string; turno: 'MAÑANA' | 'TARDE' | 'NOCHE' };
type Docente = { ci: string; nombres: string; apellidos: string; especialidad: string; celular: string; email: string };
type Estudiante = { rude: string; ci: string; nombres: string; apellidos: string; nacimiento: string; tutor: string; celular: string; curso: string };

const gestion = 2026;
const materias: Materia[] = [
  { nombre: 'MATEMÁTICA', sigla: 'MAT-101' }, { nombre: 'LENGUAJE Y COMUNICACIÓN', sigla: 'LEN-101' },
  { nombre: 'CIENCIAS NATURALES', sigla: 'CN-101' }, { nombre: 'CIENCIAS SOCIALES', sigla: 'CS-101' },
  { nombre: 'INGLÉS', sigla: 'ING-101' },
];
const cursos: Curso[] = [
  { nombre: '1ro', nivel: 'PRIMARIA', paralelo: 'A', turno: 'MAÑANA' },
  { nombre: '2do', nivel: 'PRIMARIA', paralelo: 'A', turno: 'MAÑANA' },
  { nombre: '3ro', nivel: 'PRIMARIA', paralelo: 'A', turno: 'MAÑANA' },
  { nombre: '3ro', nivel: 'PRIMARIA', paralelo: 'B', turno: 'MAÑANA' },
  { nombre: '4to', nivel: 'PRIMARIA', paralelo: 'A', turno: 'MAÑANA' },
  { nombre: '5to', nivel: 'PRIMARIA', paralelo: 'A', turno: 'MAÑANA' },
  { nombre: '6to', nivel: 'PRIMARIA', paralelo: 'A', turno: 'MAÑANA' },
  { nombre: '1ro', nivel: 'SECUNDARIA', paralelo: 'A', turno: 'MAÑANA' },
  { nombre: '2do', nivel: 'SECUNDARIA', paralelo: 'A', turno: 'MAÑANA' },
  { nombre: '3ro', nivel: 'SECUNDARIA', paralelo: 'A', turno: 'MAÑANA' },
  { nombre: '4to', nivel: 'SECUNDARIA', paralelo: 'A', turno: 'MAÑANA' },
  { nombre: '5to', nivel: 'SECUNDARIA', paralelo: 'A', turno: 'MAÑANA' },
  { nombre: '6to', nivel: 'SECUNDARIA', paralelo: 'A', turno: 'MAÑANA' },
];
const docentes: Docente[] = [
  { ci: '4580011', nombres: 'Ana María', apellidos: 'Quispe Morales', especialidad: 'Matemática', celular: '70010101', email: 'ana.quispe@marcoschool.bo' },
  { ci: '5290342', nombres: 'Carlos', apellidos: 'Mamani Choque', especialidad: 'Lenguaje y Comunicación', celular: '70020202', email: 'carlos.mamani@marcoschool.bo' },
  { ci: '6120453', nombres: 'Lucía', apellidos: 'Fernández Rojas', especialidad: 'Ciencias Naturales', celular: '70030303', email: 'lucia.fernandez@marcoschool.bo' },
  { ci: '7340564', nombres: 'Jorge', apellidos: 'Condori Flores', especialidad: 'Ciencias Sociales e Inglés', celular: '70040404', email: 'jorge.condori@marcoschool.bo' },
];
const estudiantes: Estudiante[] = [
  { rude: 'RUDE-2026-0001', ci: '9876543', nombres: 'Federico Samuel Chevrolet', apellidos: 'Padilla', nacimiento: '2010-04-18', tutor: 'María Padilla', celular: '71234567', curso: '5to-SECUNDARIA-A' },
  { rude: 'RUDE-2026-0002', ci: '8765432', nombres: 'Valentina', apellidos: 'Rojas López', nacimiento: '2016-08-09', tutor: 'Patricia López', celular: '72345678', curso: '3ro-PRIMARIA-B' },
  { rude: 'RUDE-2026-0003', ci: '7654321', nombres: 'Mateo', apellidos: 'Gutiérrez Arce', nacimiento: '2010-11-23', tutor: 'Roberto Gutiérrez', celular: '73456789', curso: '5to-SECUNDARIA-A' },
  { rude: 'RUDE-2026-0004', ci: '6543210', nombres: 'Sofía', apellidos: 'Flores Vega', nacimiento: '2016-02-14', tutor: 'Daniela Vega', celular: '74567890', curso: '3ro-PRIMARIA-B' },
];

async function main() {
  const client = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await client.connect();
  try {
    await client.query('BEGIN');
    const materiaIds = new Map<string, number>();
    for (const item of materias) {
      const result = await client.query('INSERT INTO materias (nombre_materia,sigla,estado) VALUES ($1,$2,1) ON CONFLICT (sigla) DO UPDATE SET nombre_materia=EXCLUDED.nombre_materia, estado=1 RETURNING id_materia', [item.nombre, item.sigla]);
      materiaIds.set(item.sigla, result.rows[0].id_materia);
    }
    const cursoIds = new Map<string, number>();
    for (const item of cursos) {
      const result = await client.query('INSERT INTO cursos (nombre,nivel,paralelo,turno,gestion,estado) VALUES ($1,$2,$3,$4,$5,1) ON CONFLICT (gestion,nivel,nombre,paralelo,turno) DO UPDATE SET estado=1 RETURNING id_curso', [item.nombre, item.nivel, item.paralelo, item.turno, gestion]);
      cursoIds.set(`${item.nombre}-${item.nivel}-${item.paralelo}`, result.rows[0].id_curso);
    }
    const docenteIds = new Map<string, number>();
    for (const item of docentes) {
      const existing = await client.query('SELECT id_docente FROM docentes WHERE ci=$1', [item.ci]);
      const result = existing.rowCount
        ? await client.query('UPDATE docentes SET nombres=$1,apellidos=$2,especialidad=$3,celular=$4,estado=1 WHERE id_docente=$5 RETURNING id_docente', [item.nombres, item.apellidos, item.especialidad, item.celular, existing.rows[0].id_docente])
        : await client.query('INSERT INTO docentes (ci,nombres,apellidos,especialidad,celular,estado) VALUES ($1,$2,$3,$4,$5,1) RETURNING id_docente', [item.ci, item.nombres, item.apellidos, item.especialidad, item.celular]);
      docenteIds.set(item.ci, result.rows[0].id_docente);
      const user = await client.query('SELECT id_usuario,rol FROM usuarios WHERE LOWER(email)=LOWER($1)', [item.email]);
      const userId = user.rowCount
        ? user.rows[0].id_usuario
        : (await client.query('INSERT INTO usuarios (email,password_hash,rol,estado) VALUES ($1,$2,$3,1) RETURNING id_usuario', [item.email, await bcrypt.hash('Docente2026', 10), 'DOCENTE'])).rows[0].id_usuario;
      if (user.rowCount && user.rows[0].rol !== 'DOCENTE') throw new Error(`La cuenta ${item.email} debe tener rol DOCENTE`);
      await client.query('UPDATE docentes SET usuario_id=$1 WHERE id_docente=$2', [userId, result.rows[0].id_docente]);
    }
    const inscripcionIds = new Map<string, number>();
    for (const item of estudiantes) {
      const result = await client.query(
        `INSERT INTO estudiantes (rude,ci,nombres,apellidos,fecha_nacimiento,tutor_nombre,tutor_celular,estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1)
         ON CONFLICT (rude) DO UPDATE SET ci=EXCLUDED.ci,nombres=EXCLUDED.nombres,apellidos=EXCLUDED.apellidos,fecha_nacimiento=EXCLUDED.fecha_nacimiento,tutor_nombre=EXCLUDED.tutor_nombre,tutor_celular=EXCLUDED.tutor_celular,estado=1
         RETURNING id_estudiante`, [item.rude, item.ci, item.nombres, item.apellidos, item.nacimiento, item.tutor, item.celular],
      );
      const estudianteId = result.rows[0].id_estudiante;
      const cursoId = cursoIds.get(item.curso);
      // Los cuatro RUDE del seed son datos demostrativos: al reejecutarlo se
      // conserva una sola inscripción activa para la gestión y se actualiza al curso definido arriba.
      const active = await client.query(
        `SELECT i.id_inscripcion,i.curso_id FROM inscripciones i
         JOIN cursos c ON c.id_curso=i.curso_id
         WHERE i.estudiante_id=$1 AND c.gestion=$2 AND i.estado=1`, [estudianteId, gestion],
      );
      if (active.rowCount && active.rows[0].curso_id === cursoId) {
        inscripcionIds.set(item.rude, active.rows[0].id_inscripcion);
      } else {
        if (active.rowCount) await client.query('UPDATE inscripciones SET estado=0 WHERE id_inscripcion=$1', [active.rows[0].id_inscripcion]);
        const enrollment = await client.query('INSERT INTO inscripciones (estudiante_id,curso_id,estado) VALUES ($1,$2,1) ON CONFLICT (estudiante_id,curso_id) DO UPDATE SET estado=1 RETURNING id_inscripcion', [estudianteId, cursoId]);
        inscripcionIds.set(item.rude, enrollment.rows[0].id_inscripcion);
      }
    }
    const federico = await client.query('SELECT id_estudiante FROM estudiantes WHERE rude=$1', ['RUDE-2026-0001']);
    const studentUser = await client.query('SELECT id_usuario FROM usuarios WHERE LOWER(email)=LOWER($1)', ['federico@marcoschool.bo']);
    const federicoUserId = studentUser.rowCount
      ? studentUser.rows[0].id_usuario
      : (await client.query('INSERT INTO usuarios (email,password_hash,rol,estado) VALUES ($1,$2,$3,1) RETURNING id_usuario', ['federico@marcoschool.bo', await bcrypt.hash('Estudiante2026', 10), 'ESTUDIANTE'])).rows[0].id_usuario;
    await client.query('UPDATE estudiantes SET usuario_id=$1 WHERE id_estudiante=$2', [federicoUserId, federico.rows[0].id_estudiante]);
    const asignaciones: Array<[string, string, string]> = [
      ['4580011', '5to-SECUNDARIA-A', 'MAT-101'], ['5290342', '5to-SECUNDARIA-A', 'LEN-101'], ['6120453', '5to-SECUNDARIA-A', 'CN-101'], ['7340564', '5to-SECUNDARIA-A', 'CS-101'],
      ['4580011', '3ro-PRIMARIA-B', 'MAT-101'], ['5290342', '3ro-PRIMARIA-B', 'LEN-101'], ['6120453', '3ro-PRIMARIA-B', 'CN-101'], ['7340564', '3ro-PRIMARIA-B', 'ING-101'],
    ];
    const asignacionIds = new Map<string, number>();
    for (const [docenteCi, cursoKey, sigla] of asignaciones) {
      const result = await client.query('INSERT INTO asignaciones (docente_id,curso_id,materia_id,estado) VALUES ($1,$2,$3,1) ON CONFLICT (docente_id,curso_id,materia_id) DO UPDATE SET estado=1 RETURNING id_asignacion', [docenteIds.get(docenteCi), cursoIds.get(cursoKey), materiaIds.get(sigla)]);
      asignacionIds.set(`${cursoKey}-${sigla}`, result.rows[0].id_asignacion);
    }
    const notas: Array<[string, string, number]> = [
      ['RUDE-2026-0001', 'MAT-101', 88], ['RUDE-2026-0001', 'LEN-101', 84], ['RUDE-2026-0001', 'CN-101', 91], ['RUDE-2026-0002', 'MAT-101', 86], ['RUDE-2026-0002', 'LEN-101', 89], ['RUDE-2026-0003', 'MAT-101', 78], ['RUDE-2026-0004', 'MAT-101', 93],
    ];
    for (const [rude, sigla, nota] of notas) {
      const estudiante = estudiantes.find((item) => item.rude === rude)!;
      await client.query('INSERT INTO calificaciones (inscripcion_id,asignacion_id,periodo,nota,estado) VALUES ($1,$2,1,$3,1) ON CONFLICT (inscripcion_id,asignacion_id,periodo) DO UPDATE SET nota=EXCLUDED.nota,estado=1', [inscripcionIds.get(rude), asignacionIds.get(`${estudiante.curso}-${sigla}`), nota]);
    }
    await client.query('INSERT INTO pagos (inscripcion_id,mes,monto_pagado,fecha_pago,nro_recibo,pagado_por,estado) VALUES ($1,3,350.00,$2,$3,$4,1) ON CONFLICT (inscripcion_id,mes) DO NOTHING', [inscripcionIds.get('RUDE-2026-0001'), '2026-03-05', 'REC-2026-0001', 'María Padilla']);
    await client.query('INSERT INTO pagos (inscripcion_id,mes,monto_pagado,fecha_pago,nro_recibo,pagado_por,estado) VALUES ($1,3,300.00,$2,$3,$4,1) ON CONFLICT (inscripcion_id,mes) DO NOTHING', [inscripcionIds.get('RUDE-2026-0002'), '2026-03-07', 'REC-2026-0002', 'Patricia López']);
    await client.query('COMMIT');
    console.log('Seed académico completado: 4 docentes con cuenta (clave temporal Docente2026), 4 estudiantes, cursos de 1ro a 6to de Primaria y Secundaria, materias, asignaciones, notas, pagos y cuenta de estudiante de ejemplo.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}
void main();
