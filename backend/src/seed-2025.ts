import 'dotenv/config';
import { Client } from 'pg';

type Nivel = 'PRIMARIA' | 'SECUNDARIA';
type Turno = 'MAÑANA' | 'TARDE';
type Paralelo = 'A' | 'B';

const GESTION = 2025;
const NIVELES: Nivel[] = ['PRIMARIA', 'SECUNDARIA'];
const GRADOS = ['1ro', '2do', '3ro', '4to', '5to', '6to'];
const PARALELOS: Paralelo[] = ['A', 'B'];
const TURNOS: Turno[] = ['MAÑANA', 'TARDE'];
const STUDENTS_PER_COURSE = 5;

// Año base de nacimiento por nivel y grado para gestión 2025
const ANIOS_NACIMIENTO: Record<Nivel, Record<string, number>> = {
  PRIMARIA: {
    '1ro': 2018,
    '2do': 2017,
    '3ro': 2016,
    '4to': 2015,
    '5to': 2014,
    '6to': 2013,
  },
  SECUNDARIA: {
    '1ro': 2012,
    '2do': 2011,
    '3ro': 2010,
    '4to': 2009,
    '5to': 2008,
    '6to': 2007,
  },
};

const NOMBRES_MASCULINOS = [
  'Alejandro', 'Andrés', 'Bernardo', 'Carlos', 'Cristian', 'Daniel', 'Diego', 'Eduardo',
  'Esteban', 'Fernando', 'Gabriel', 'Gonzalo', 'Hugo', 'Ignacio', 'Javier', 'Joaquín',
  'José', 'Juan', 'Leonardo', 'Lucas', 'Luis', 'Manuel', 'Marcelo', 'Marcos',
  'Mateo', 'Matías', 'Mauricio', 'Nicolás', 'Pablo', 'Patricio', 'Pedro', 'Rafael',
  'Rodrigo', 'Samuel', 'Santiago', 'Sebastián', 'Sergio', 'Tomás', 'Valentín', 'Víctor',
  'Alonso', 'Álvaro', 'Bruno', 'Camilo', 'Damián', 'Emilio', 'Fabián', 'Franco',
];

const NOMBRES_FEMENINOS = [
  'Adriana', 'Alejandra', 'Alicia', 'Andrea', 'Camila', 'Carla', 'Carolina', 'Cecilia',
  'Claudia', 'Daniela', 'Elena', 'Emilia', 'Fabiana', 'Florencia', 'Gabriela', 'Isabel',
  'Jimena', 'Laura', 'Lucía', 'Luciana', 'Marcela', 'Mariana', 'Martina', 'Micaela',
  'Natalia', 'Nicole', 'Paola', 'Patricia', 'Renata', 'Romina', 'Sara', 'Sofía',
  'Tatiana', 'Valeria', 'Valentina', 'Vanessa', 'Verónica', 'Victoria', 'Viviana', 'Ximena',
  'Abril', 'Antonella', 'Bianca', 'Catalina', 'Constanza', 'Julieta', 'Miranda', 'Rafaela',
];

const APELLIDOS = [
  'Quispe', 'Mamani', 'Flores', 'Choque', 'Condori', 'Rojas', 'Vargas', 'Guzmán',
  'Morales', 'Mendoza', 'Aguilar', 'López', 'Gutiérrez', 'Arce', 'Fernández', 'Pinto',
  'Torrico', 'Balderrama', 'Soliz', 'Miranda', 'Cabrera', 'Castro', 'Cruz', 'Ramos',
  'Romero', 'Suárez', 'Ortiz', 'Silva', 'Medina', 'Reyes', 'Delgado', 'Peña',
  'Ríos', 'Carvajal', 'Espinoza', 'Benítez', 'Mercado', 'Villarroel', 'Salazar', 'Montaño',
  'Chávez', 'Peredo', 'Camacho', 'Aparicio', 'Zeballos', 'Céspedes', 'Escobar', 'Valdez',
];

const TUTOR_TITULOS = ['Padre', 'Madre', 'Tutor'];

function padZero(num: number, length: number = 4): string {
  return String(num).padStart(length, '0');
}

async function seed2025() {
  const dbPassword = process.env.DB_PASSWORD;
  if (!dbPassword) {
    throw new Error(
      'Falta DB_PASSWORD. Configura tu clave de PostgreSQL en backend/.env o crea un seed con tu propia configuración.',
    );
  }

  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? 'postgres',
    password: dbPassword,
    database: process.env.DB_DATABASE ?? 'colegio',
  });

  await client.connect();
  console.log(`Conectado a la base de datos: ${client.database}`);

  try {
    await client.query('BEGIN');

    // 1. Crear Cursos para Gestión 2025
    console.log('--- Creando cursos gestión 2025 ---');
    const cursoMap = new Map<string, number>();
    let totalCursos = 0;

    for (const nivel of NIVELES) {
      for (const grado of GRADOS) {
        for (const paralelo of PARALELOS) {
          for (const turno of TURNOS) {
            const res = await client.query(
              `INSERT INTO cursos (nombre, nivel, paralelo, turno, gestion, estado)
               VALUES ($1, $2, $3, $4, $5, 1)
               ON CONFLICT (gestion, nivel, nombre, paralelo, turno)
               DO UPDATE SET estado = 1
               RETURNING id_curso`,
              [grado, nivel, paralelo, turno, GESTION]
            );
            const idCurso = res.rows[0].id_curso;
            const key = `${nivel}-${grado}-${paralelo}-${turno}`;
            cursoMap.set(key, idCurso);
            totalCursos++;
          }
        }
      }
    }
    console.log(`✓ Cursos listos: ${totalCursos} cursos en gestión ${GESTION} (24 Primaria + 24 Secundaria).`);

    // 2. Crear Estudiantes e Inscripciones para Gestión 2025
    console.log('--- Creando estudiantes e inscripciones para gestión 2025 ---');

    let studentIndex = 1;
    let inscritosTotal = 0;

    for (const nivel of NIVELES) {
      for (const grado of GRADOS) {
        const anioNac = ANIOS_NACIMIENTO[nivel][grado];

        for (const paralelo of PARALELOS) {
          for (const turno of TURNOS) {
            const cursoKey = `${nivel}-${grado}-${paralelo}-${turno}`;
            const idCurso = cursoMap.get(cursoKey);

            if (!idCurso) {
              throw new Error(`Curso no encontrado: ${cursoKey}`);
            }

            for (let i = 0; i < STUDENTS_PER_COURSE; i++) {
              const isFemale = (studentIndex % 2 === 0);
              const nombre = isFemale
                ? NOMBRES_FEMENINOS[(studentIndex * 3) % NOMBRES_FEMENINOS.length]
                : NOMBRES_MASCULINOS[(studentIndex * 3) % NOMBRES_MASCULINOS.length];
              
              const apellidoPat = APELLIDOS[(studentIndex * 5) % APELLIDOS.length];
              const apellidoMat = APELLIDOS[(studentIndex * 7 + 3) % APELLIDOS.length];
              const apellidos = `${apellidoPat} ${apellidoMat}`;

              // RUDE correlativo único 2025
              const rude = `RUDE-${GESTION}-${padZero(studentIndex, 4)}`;

              // CI único de 7 u 8 dígitos
              const ci = `${1000000 + studentIndex * 137}`;

              // Fecha de nacimiento coherente con el grado escolar
              const mesNac = padZero((studentIndex % 12) + 1, 2);
              const diaNac = padZero((studentIndex % 28) + 1, 2);
              const fechaNacimiento = `${anioNac}-${mesNac}-${diaNac}`;

              // Tutor
              const tutorNombre = `${isFemale ? NOMBRES_FEMENINOS[(studentIndex * 2 + 5) % NOMBRES_FEMENINOS.length] : NOMBRES_MASCULINOS[(studentIndex * 2 + 5) % NOMBRES_MASCULINOS.length]} ${apellidoPat}`;
              const tutorCelular = `7${padZero(1000000 + studentIndex * 987, 7)}`;

              // Insertar estudiante (sin usuario_id, cumpliendo la indicación)
              const resEst = await client.query(
                `INSERT INTO estudiantes (rude, ci, nombres, apellidos, fecha_nacimiento, tutor_nombre, tutor_celular, estado)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
                 ON CONFLICT (rude)
                 DO UPDATE SET ci = EXCLUDED.ci,
                               nombres = EXCLUDED.nombres,
                               apellidos = EXCLUDED.apellidos,
                               fecha_nacimiento = EXCLUDED.fecha_nacimiento,
                               tutor_nombre = EXCLUDED.tutor_nombre,
                               tutor_celular = EXCLUDED.tutor_celular,
                               estado = 1
                 RETURNING id_estudiante`,
                [rude, ci, nombre, apellidos, fechaNacimiento, tutorNombre, tutorCelular]
              );
              const idEstudiante = resEst.rows[0].id_estudiante;

              // Fecha de inscripción durante enero 2025
              const diaInsc = padZero((studentIndex % 20) + 10, 2);
              const fechaInscripcion = `${GESTION}-01-${diaInsc}`;

              // Desactivar inscripciones previas del mismo estudiante en 2025 si existieran por reejecución
              const active = await client.query(
                `SELECT i.id_inscripcion, i.curso_id FROM inscripciones i
                 JOIN cursos c ON c.id_curso = i.curso_id
                 WHERE i.estudiante_id = $1 AND c.gestion = $2 AND i.estado = 1`,
                [idEstudiante, GESTION]
              );

              if (active.rowCount && active.rows[0].curso_id === idCurso) {
                // Ya inscrito en este mismo curso
              } else {
                if (active.rowCount) {
                  await client.query('UPDATE inscripciones SET estado = 0 WHERE id_inscripcion = $1', [active.rows[0].id_inscripcion]);
                }
                await client.query(
                  `INSERT INTO inscripciones (estudiante_id, curso_id, fecha_inscripcion, estado)
                   VALUES ($1, $2, $3, 1)
                   ON CONFLICT (estudiante_id, curso_id)
                   DO UPDATE SET fecha_inscripcion = EXCLUDED.fecha_inscripcion, estado = 1`,
                  [idEstudiante, idCurso, fechaInscripcion]
                );
              }

              inscritosTotal++;
              studentIndex++;
            }
          }
        }
      }
    }

    // 3. Completar el histórico: asignaciones y cuatro períodos de notas.
    // Una gestión anterior no debe aparecer como "en curso" solo por tener
    // alumnos inscritos sin materias ni calificaciones.
    console.log('--- Creando asignaciones y notas históricas de 2025 ---');
    const docentes = await client.query<{ id_docente: number }>(
      'SELECT id_docente FROM docentes WHERE estado = 1 ORDER BY id_docente',
    );
    const materias = await client.query<{ id_materia: number; sigla: string }>(
      'SELECT id_materia, sigla FROM materias WHERE estado = 1 ORDER BY id_materia',
    );
    if (docentes.rows.length < 1 || materias.rows.length < 1) {
      throw new Error('Primero ejecuta el seed académico: faltan docentes o materias para cerrar la gestión 2025.');
    }

    const asignacionMap = new Map<string, number>();
    for (const [, cursoId] of cursoMap) {
      for (const [index, materia] of materias.rows.entries()) {
        const docente = docentes.rows[index % docentes.rows.length];
        const existing = await client.query<{ id_asignacion: number }>(
          'SELECT id_asignacion FROM asignaciones WHERE curso_id=$1 AND materia_id=$2 ORDER BY estado DESC, id_asignacion LIMIT 1',
          [cursoId, materia.id_materia],
        );
        const assignment = existing.rows[0]
          ? await client.query<{ id_asignacion: number }>('UPDATE asignaciones SET estado=1 WHERE id_asignacion=$1 RETURNING id_asignacion', [existing.rows[0].id_asignacion])
          : await client.query<{ id_asignacion: number }>(
              'INSERT INTO asignaciones (docente_id,curso_id,materia_id,estado) VALUES ($1,$2,$3,1) RETURNING id_asignacion',
              [docente.id_docente, cursoId, materia.id_materia],
            );
        asignacionMap.set(`${cursoId}-${materia.id_materia}`, assignment.rows[0].id_asignacion);
      }
    }

    const inscripciones = await client.query<{ id_inscripcion: number; curso_id: number }>(
      `SELECT i.id_inscripcion,i.curso_id FROM inscripciones i
       JOIN cursos c ON c.id_curso=i.curso_id
       WHERE c.gestion=$1 AND c.estado=1 AND i.estado=1`, [GESTION],
    );
    let notasTotal = 0;
    for (const [studentPosition, inscripcion] of inscripciones.rows.entries()) {
      for (const [subjectPosition, materia] of materias.rows.entries()) {
        const asignacionId = asignacionMap.get(`${inscripcion.curso_id}-${materia.id_materia}`);
        if (!asignacionId) throw new Error('No se pudo crear la asignación histórica');
        for (let periodo = 1; periodo <= 4; periodo++) {
          // Notas reproducibles de demostración entre 55 y 100.
          const nota = 55 + ((studentPosition * 7 + subjectPosition * 11 + periodo * 5) % 46);
          await client.query(
            `INSERT INTO calificaciones (inscripcion_id,asignacion_id,periodo,nota,estado)
             VALUES ($1,$2,$3,$4,1)
             ON CONFLICT (inscripcion_id,asignacion_id,periodo) DO NOTHING`,
            [inscripcion.id_inscripcion, asignacionId, periodo, nota],
          );
          notasTotal++;
        }
      }
    }

    await client.query('COMMIT');
    console.log(`✓ Sembrado de gestión ${GESTION} completado exitosamente:`);
    console.log(`  - ${totalCursos} cursos creados/verificados (Primaria y Secundaria, A y B, Mañana y Tarde).`);
    console.log(`  - ${inscritosTotal} estudiantes inscritos (${STUDENTS_PER_COURSE} por curso).`);
    console.log(`  - ${asignacionMap.size} asignaciones y ${notasTotal} notas históricas (P1–P4) cargadas.`);
    console.log(`  - Cero docentes y cero administradores modificados/creados.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error durante el sembrado 2025:', error);
    throw error;
  } finally {
    await client.end();
  }
}

void seed2025();
