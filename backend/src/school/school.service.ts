import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { QueryFailedError, DataSource } from 'typeorm';
import { RESOURCES, ResourceName } from './resources';
import { SCHOOL_CONFIG, MESES_NOMBRES, MESES_CORTOS } from './config';

type Values = Record<string, unknown>;

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const clean = String(dateStr).split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return String(dateStr);
}

function formatMoney(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  if (isNaN(num)) return 'Bs 0,00';
  return `Bs ${num.toFixed(2)}`;
}

@Injectable()
export class SchoolService {
  constructor(private readonly dataSource: DataSource) {}

  private definition(resource: ResourceName) { return RESOURCES[resource]; }

  private listView(resource: ResourceName) {
    const views: Record<ResourceName, string> = {
      usuarios: 'SELECT id_usuario,email,rol,fyh_creacion,fyh_actualizacion,estado FROM usuarios',
      estudiantes: `SELECT e.*,u.email AS cuenta_acceso FROM estudiantes e LEFT JOIN usuarios u ON u.id_usuario=e.usuario_id`,
      docentes: `SELECT d.*,u.email AS cuenta_acceso FROM docentes d LEFT JOIN usuarios u ON u.id_usuario=d.usuario_id`,
      materias: 'SELECT * FROM materias',
      cursos: `SELECT c.*,COUNT(i.id_inscripcion) FILTER (WHERE i.estado=1)::int AS total_estudiantes FROM cursos c LEFT JOIN inscripciones i ON i.curso_id=c.id_curso GROUP BY c.id_curso`,
      inscripciones: `SELECT i.*,e.nombres || ' ' || e.apellidos AS estudiante,e.rude,c.nombre || ' ' || c.paralelo || ' - ' || c.nivel || ' (' || c.gestion || ')' AS curso,c.gestion,c.nivel,c.id_curso FROM inscripciones i JOIN estudiantes e ON e.id_estudiante=i.estudiante_id JOIN cursos c ON c.id_curso=i.curso_id`,
      asignaciones: `SELECT a.*,d.nombres || ' ' || d.apellidos AS docente,m.nombre_materia AS materia,m.sigla,c.nombre || ' ' || c.paralelo AS curso,c.gestion,c.nivel,c.turno,c.id_curso,m.id_materia FROM asignaciones a JOIN docentes d ON d.id_docente=a.docente_id JOIN materias m ON m.id_materia=a.materia_id JOIN cursos c ON c.id_curso=a.curso_id`,
      calificaciones: `SELECT ca.*,e.nombres || ' ' || e.apellidos AS estudiante,e.ci,e.rude,m.nombre_materia AS materia,d.nombres || ' ' || d.apellidos AS docente,c.nombre || ' ' || c.paralelo || ' - ' || c.nivel || ' (' || c.gestion || ')' AS curso,c.gestion,c.nivel,c.id_curso,m.id_materia FROM calificaciones ca JOIN inscripciones i ON i.id_inscripcion=ca.inscripcion_id JOIN estudiantes e ON e.id_estudiante=i.estudiante_id JOIN asignaciones a ON a.id_asignacion=ca.asignacion_id JOIN materias m ON m.id_materia=a.materia_id JOIN docentes d ON d.id_docente=a.docente_id JOIN cursos c ON c.id_curso=i.curso_id`,
      pagos: `SELECT p.*,e.nombres || ' ' || e.apellidos AS estudiante,c.nombre || ' ' || c.paralelo || ' - ' || c.nivel || ' (' || c.gestion || ')' AS curso,c.gestion,c.nivel,c.id_curso FROM pagos p JOIN inscripciones i ON i.id_inscripcion=p.inscripcion_id JOIN estudiantes e ON e.id_estudiante=i.estudiante_id JOIN cursos c ON c.id_curso=i.curso_id`,
    };
    return views[resource];
  }

  private clean(resource: ResourceName, input: Values, partial = false) {
    const def = this.definition(resource);
    const clean: Values = {};
    for (const field of def.fields) if (input[field] !== undefined) clean[field] = input[field];
    if (resource === 'usuarios') {
      const password = input.password;
      if (!partial && (typeof password !== 'string' || password.length < 6)) {
        throw new BadRequestException('La contraseña debe tener al menos 6 caracteres');
      }
      if (typeof password === 'string') delete clean.password_hash;
    }
    if (!partial && Object.keys(clean).length === 0 && resource !== 'usuarios') {
      throw new BadRequestException('No se recibieron campos válidos');
    }
    return clean;
  }

  private async query<T = Values>(sql: string, values: unknown[] = []): Promise<T[]> {
    try { return await this.dataSource.query(sql, values); }
    catch (error) {
      if (error instanceof QueryFailedError) {
        const driver = error.driverError as { code?: string; detail?: string; message?: string; constraint?: string };
        if (driver.code === '23505' || driver.code === '23503' || driver.code === '23514') {
          if (driver.constraint === 'uq_pago_mes') {
            throw new ConflictException('Ya existe un pago registrado para este mes en esta inscripción.');
          }
          if (driver.constraint === 'uq_calificacion') {
            throw new ConflictException('Ya existe una calificación registrada para este período en esta materia.');
          }
          if (driver.constraint === 'uq_inscripcion') {
            throw new ConflictException('El estudiante ya se encuentra inscrito en este curso.');
          }
          if (driver.constraint === 'uq_asignacion' || driver.constraint === 'uq_asignacion_activa_curso_materia') {
            throw new ConflictException('Ya existe una asignación docente activa para esta materia en este curso.');
          }
          if (driver.constraint === 'uq_curso') {
            throw new ConflictException('Ya existe un curso registrado con el mismo grado, nivel, paralelo, turno y gestión.');
          }
          if (driver.constraint?.includes('nro_recibo')) {
            throw new ConflictException('El número de recibo ya se encuentra registrado.');
          }
          if (driver.constraint?.includes('rude')) {
            throw new ConflictException('Ya existe un estudiante registrado con este RUDE.');
          }
          if (driver.constraint?.includes('ci')) {
            throw new ConflictException('Ya existe un registro con este número de CI.');
          }
          if (driver.constraint?.includes('email')) {
            throw new ConflictException('Ya existe un usuario con este correo electrónico.');
          }
          throw new ConflictException(driver.detail ?? driver.message ?? 'Los datos no cumplen las reglas de la base de datos');
        }
        if (driver.code === '23502' || driver.code === '22P02') {
          throw new BadRequestException(driver.detail ?? driver.message ?? 'Faltan datos obligatorios o el formato es inválido');
        }
      }
      throw error;
    }
  }

  async list(
    resource: ResourceName,
    search?: string,
    page?: number,
    pageSize?: number,
    sort?: string,
    dir?: 'asc' | 'desc',
    estado: string = '1',
    filters?: {
      gestion?: number;
      nivel?: string;
      cursoId?: number;
      materiaId?: number;
      periodo?: number;
    },
  ) {
    const def = this.definition(resource);
    const view = this.listView(resource);

    let estadoClause = 'registros.estado = 1';
    if (estado === '0') {
      estadoClause = 'registros.estado = 0';
    } else if (estado === 'todos') {
      estadoClause = '1 = 1';
    }

    const values: unknown[] = [];
    const filterClauses: string[] = [estadoClause];

    const hasGestion = ['cursos', 'inscripciones', 'asignaciones', 'calificaciones', 'pagos'].includes(resource);
    const hasNivel = ['cursos', 'inscripciones', 'asignaciones', 'calificaciones', 'pagos'].includes(resource);
    const hasCurso = ['inscripciones', 'asignaciones', 'calificaciones', 'pagos'].includes(resource);
    const hasMateria = ['asignaciones', 'calificaciones'].includes(resource);
    const hasPeriodo = ['calificaciones'].includes(resource);

    if (filters?.gestion && hasGestion) {
      values.push(filters.gestion);
      filterClauses.push(`registros.gestion = $${values.length}`);
    }
    if (filters?.nivel && hasNivel) {
      values.push(filters.nivel.toUpperCase());
      filterClauses.push(`UPPER(registros.nivel) = $${values.length}`);
    }
    if (filters?.cursoId && hasCurso) {
      values.push(filters.cursoId);
      filterClauses.push(`registros.id_curso = $${values.length}`);
    }
    if (filters?.materiaId && hasMateria) {
      values.push(filters.materiaId);
      filterClauses.push(`registros.id_materia = $${values.length}`);
    }
    if (filters?.periodo && hasPeriodo) {
      values.push(filters.periodo);
      filterClauses.push(`registros.periodo = $${values.length}`);
    }

    const searchClauses: string[] = [];
    if (search?.trim() && def.searchable?.length) {
      const term = `%${search.trim()}%`;
      def.searchable.forEach((field) => {
        values.push(term);
        searchClauses.push(`CAST(${field} AS TEXT) ILIKE $${values.length}`);
      });
    }

    if (searchClauses.length) {
      filterClauses.push(`(${searchClauses.join(' OR ')})`);
    }

    const whereClause = filterClauses.join(' AND ');

    const allowedSortCols = [def.id, ...def.fields, ...(def.searchable ?? [])];
    const sortCol = sort && allowedSortCols.includes(sort) ? sort : def.id;
    const sortDir = dir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    if (page && Number(page) >= 1) {
      const limit = Math.max(1, Math.min(pageSize ? Number(pageSize) : 10, 100));
      const offset = (Number(page) - 1) * limit;

      const countRes = await this.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM (${view}) registros WHERE ${whereClause}`,
        values,
      );
      const total = countRes[0]?.total ?? 0;

      const rows = await this.query(
        `SELECT * FROM (${view}) registros WHERE ${whereClause} ORDER BY ${sortCol} ${sortDir} LIMIT ${limit} OFFSET ${offset}`,
        values,
      );

      return { data: rows, total, page: Number(page), pageSize: limit };
    }

    return this.query(
      `SELECT * FROM (${view}) registros WHERE ${whereClause} ORDER BY ${sortCol} ${sortDir}`,
      values,
    );
  }

  async one(resource: ResourceName, id: number) {
    const def = this.definition(resource);
    const columns = resource === 'usuarios' ? `${def.id}, email, rol, fyh_creacion, fyh_actualizacion, estado` : '*';
    const rows = await this.query(`SELECT ${columns} FROM ${def.table} WHERE ${def.id} = $1`, [id]);
    if (!rows[0]) throw new NotFoundException('Registro no encontrado');
    return rows[0];
  }

  async create(resource: ResourceName, input: Values) {
    const def = this.definition(resource);
    const data = this.clean(resource, input);
    if (resource === 'usuarios') {
      data.password_hash = await bcrypt.hash(String(input.password), 10);
    }
    if (resource === 'pagos') {
      const mesNum = Number(data.mes);
      const inscId = Number(data.inscripcion_id);
      if (inscId && mesNum) {
        const existing = await this.query(
          `SELECT id_pago FROM pagos WHERE inscripcion_id = $1 AND mes = $2`,
          [inscId, mesNum],
        );
        if (existing.length > 0) {
          const nombreMes = MESES_NOMBRES[mesNum - 1] ?? `Mes ${mesNum}`;
          throw new ConflictException(
            `Ya existe un pago registrado para ${nombreMes} en esta inscripción.`,
          );
        }
      }
    }
    if (resource === 'asignaciones') {
      const cursoId = Number(data.curso_id);
      const materiaId = Number(data.materia_id);
      if (cursoId && materiaId) {
        const existing = await this.query(
          `SELECT a.id_asignacion, d.nombres, d.apellidos, m.nombre_materia
           FROM asignaciones a
           JOIN docentes d ON d.id_docente = a.docente_id
           JOIN materias m ON m.id_materia = a.materia_id
           WHERE a.curso_id = $1 AND a.materia_id = $2 AND a.estado = 1`,
          [cursoId, materiaId],
        );
        if (existing.length > 0) {
          const doc = `${existing[0].nombres} ${existing[0].apellidos}`.trim();
          const mat = existing[0].nombre_materia;
          throw new ConflictException(
            `La materia "${mat}" ya está asignada al docente ${doc} en este curso. Para reasignarla, primero da de baja la asignación actual.`,
          );
        }
      }
    }
    const fields = Object.keys(data);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    const rows = await this.query(`INSERT INTO ${def.table} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`, fields.map((field) => data[field]));
    return resource === 'usuarios' ? this.one(resource, Number(rows[0][def.id])) : rows[0];
  }

  async update(resource: ResourceName, id: number, input: Values) {
    const def = this.definition(resource);
    const data = this.clean(resource, input, true);
    if (resource === 'usuarios' && typeof input.password === 'string') data.password_hash = await bcrypt.hash(input.password, 10);
    if (resource === 'pagos' && (data.mes !== undefined || data.inscripcion_id !== undefined)) {
      const current = await this.query<{ inscripcion_id: number; mes: number }>(
        `SELECT inscripcion_id, mes FROM pagos WHERE id_pago = $1`,
        [id],
      );
      if (current[0]) {
        const mesNum = data.mes !== undefined ? Number(data.mes) : current[0].mes;
        const inscId = data.inscripcion_id !== undefined ? Number(data.inscripcion_id) : current[0].inscripcion_id;
        const existing = await this.query(
          `SELECT id_pago FROM pagos WHERE inscripcion_id = $1 AND mes = $2 AND id_pago <> $3`,
          [inscId, mesNum, id],
        );
        if (existing.length > 0) {
          const nombreMes = MESES_NOMBRES[mesNum - 1] ?? `Mes ${mesNum}`;
          throw new ConflictException(
            `Ya existe otro pago registrado para ${nombreMes} en esta inscripción.`,
          );
        }
      }
    }
    if (resource === 'asignaciones' && (data.curso_id !== undefined || data.materia_id !== undefined)) {
      const current = await this.query<{ curso_id: number; materia_id: number }>(
        `SELECT curso_id, materia_id FROM asignaciones WHERE id_asignacion = $1`,
        [id],
      );
      if (current[0]) {
        const cursoId = data.curso_id !== undefined ? Number(data.curso_id) : current[0].curso_id;
        const materiaId = data.materia_id !== undefined ? Number(data.materia_id) : current[0].materia_id;
        const existing = await this.query(
          `SELECT a.id_asignacion, d.nombres, d.apellidos, m.nombre_materia
           FROM asignaciones a
           JOIN docentes d ON d.id_docente = a.docente_id
           JOIN materias m ON m.id_materia = a.materia_id
           WHERE a.curso_id = $1 AND a.materia_id = $2 AND a.estado = 1 AND a.id_asignacion <> $3`,
          [cursoId, materiaId, id],
        );
        if (existing.length > 0) {
          const doc = `${existing[0].nombres} ${existing[0].apellidos}`.trim();
          const mat = existing[0].nombre_materia;
          throw new ConflictException(
            `La materia "${mat}" ya está asignada al docente ${doc} en este curso.`,
          );
        }
      }
    }
    const fields = Object.keys(data);
    if (!fields.length) throw new BadRequestException('No se recibieron campos válidos para actualizar');
    const assignments = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const rows = await this.query(`UPDATE ${def.table} SET ${assignments} WHERE ${def.id} = $${fields.length + 1} RETURNING *`, [...fields.map((field) => data[field]), id]);
    if (!rows[0]) throw new NotFoundException('Registro no encontrado');
    return resource === 'usuarios' ? this.one(resource, id) : rows[0];
  }

  async deactivate(resource: ResourceName, id: number) {
    const def = this.definition(resource);

    if (resource === 'cursos') {
      const res = await this.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM inscripciones WHERE curso_id = $1 AND estado = 1',
        [id],
      );
      if (res[0]?.total > 0) {
        throw new BadRequestException(`No se puede dar de baja: el curso tiene ${res[0].total} inscripciones activas.`);
      }
    } else if (resource === 'estudiantes') {
      const res = await this.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM inscripciones WHERE estudiante_id = $1 AND estado = 1',
        [id],
      );
      if (res[0]?.total > 0) {
        throw new BadRequestException(`No se puede dar de baja: el estudiante tiene ${res[0].total} inscripciones activas.`);
      }
    } else if (resource === 'docentes') {
      const res = await this.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM asignaciones WHERE docente_id = $1 AND estado = 1',
        [id],
      );
      if (res[0]?.total > 0) {
        throw new BadRequestException(`No se puede dar de baja: el docente tiene ${res[0].total} asignaciones activas.`);
      }
    } else if (resource === 'materias') {
      const res = await this.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM asignaciones WHERE materia_id = $1 AND estado = 1',
        [id],
      );
      if (res[0]?.total > 0) {
        throw new BadRequestException(`No se puede dar de baja: la materia tiene ${res[0].total} asignaciones activas.`);
      }
    } else if (resource === 'inscripciones') {
      const cal = await this.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM calificaciones WHERE inscripcion_id = $1 AND estado = 1',
        [id],
      );
      const pag = await this.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM pagos WHERE inscripcion_id = $1 AND estado = 1',
        [id],
      );
      if ((cal[0]?.total ?? 0) > 0 || (pag[0]?.total ?? 0) > 0) {
        throw new BadRequestException('No se puede dar de baja: la inscripción tiene registros de notas o pagos asociados.');
      }
    }

    const rows = await this.query(`UPDATE ${def.table} SET estado = 0 WHERE ${def.id} = $1 RETURNING ${def.id}`, [id]);
    if (!rows[0]) throw new NotFoundException('Registro no encontrado');
    return { message: 'Registro dado de baja correctamente' };
  }

  async reactivate(resource: ResourceName, id: number) {
    const def = this.definition(resource);
    const rows = await this.query(`UPDATE ${def.table} SET estado = 1 WHERE ${def.id} = $1 RETURNING ${def.id}`, [id]);
    if (!rows[0]) throw new NotFoundException('Registro no encontrado');
    return { message: 'Registro reactivado correctamente' };
  }

  async summary(gestion: number) {
    const [estudiantes, docentes, cursos, inscripciones, pagos] = await Promise.all(
      [
        this.query<{ total: number }>(`SELECT COUNT(DISTINCT i.estudiante_id)::int AS total FROM inscripciones i JOIN cursos c ON c.id_curso=i.curso_id WHERE i.estado=1 AND c.estado=1 AND c.gestion=$1`, [gestion]),
        this.query<{ total: number }>(`SELECT COUNT(DISTINCT a.docente_id)::int AS total FROM asignaciones a JOIN cursos c ON c.id_curso=a.curso_id WHERE a.estado=1 AND c.estado=1 AND c.gestion=$1`, [gestion]),
        this.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM cursos WHERE estado=1 AND gestion=$1`, [gestion]),
        this.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM inscripciones i JOIN cursos c ON c.id_curso=i.curso_id WHERE i.estado=1 AND c.estado=1 AND c.gestion=$1`, [gestion]),
        this.query<{ total: number }>(`SELECT COALESCE(SUM(p.monto_pagado),0)::int AS total FROM pagos p JOIN inscripciones i ON i.id_inscripcion=p.inscripcion_id JOIN cursos c ON c.id_curso=i.curso_id WHERE p.estado=1 AND c.estado=1 AND c.gestion=$1`, [gestion]),
      ],
    );
    return { estudiantes: estudiantes[0].total, docentes: docentes[0].total, cursos: cursos[0].total, inscripciones: inscripciones[0].total, pagos: pagos[0].total };
  }

  async boletin(inscripcionId: number) {
    const student = await this.query(
      `SELECT i.id_inscripcion, e.id_estudiante, e.rude, e.ci, e.nombres, e.apellidos,
              c.id_curso, c.nombre, c.nivel, c.paralelo, c.turno, c.gestion
       FROM inscripciones i
       JOIN estudiantes e ON e.id_estudiante = i.estudiante_id
       JOIN cursos c ON c.id_curso = i.curso_id
       WHERE i.id_inscripcion = $1`,
      [inscripcionId],
    );
    if (!student[0]) throw new NotFoundException('Inscripción no encontrada');

    const rawRows = await this.query<{
      id_materia: number;
      nombre_materia: string;
      sigla: string;
      docente: string;
      periodo: number | null;
      nota: string | null;
    }>(
      `SELECT m.id_materia, m.nombre_materia, m.sigla,
              d.nombres || ' ' || d.apellidos AS docente,
              ca.periodo, ca.nota
       FROM asignaciones a
       JOIN materias m ON m.id_materia = a.materia_id
       JOIN docentes d ON d.id_docente = a.docente_id
       JOIN inscripciones i ON i.curso_id = a.curso_id
       LEFT JOIN calificaciones ca ON ca.asignacion_id = a.id_asignacion AND ca.inscripcion_id = i.id_inscripcion AND ca.estado = 1
       WHERE i.id_inscripcion = $1 AND a.estado = 1 AND m.estado = 1 AND d.estado = 1
       ORDER BY m.nombre_materia, ca.periodo`,
      [inscripcionId],
    );

    let materiaItems: Array<{
      id_materia: number;
      nombre_materia: string;
      sigla: string;
      docente: string;
      notas_por_periodo: Record<string, number | null>;
      periodos_cargados: number;
      nota_final: number | null;
      completo: boolean;
      estado: 'Aprobada' | 'Reprobada' | 'Parcial';
    }> = [];

    if (rawRows.length > 0) {
      const map = new Map<number, {
        id_materia: number;
        nombre_materia: string;
        sigla: string;
        docente: string;
        notas_por_periodo: Record<string, number | null>;
        notas: number[];
      }>();

      for (const r of rawRows) {
        if (!map.has(r.id_materia)) {
          map.set(r.id_materia, {
            id_materia: r.id_materia,
            nombre_materia: r.nombre_materia,
            sigla: r.sigla,
            docente: r.docente,
            notas_por_periodo: { '1': null, '2': null, '3': null, '4': null },
            notas: [],
          });
        }
        if (r.periodo && r.nota !== null) {
          const item = map.get(r.id_materia)!;
          const n = Number(r.nota);
          item.notas_por_periodo[String(r.periodo)] = n;
          item.notas.push(n);
        }
      }

      materiaItems = Array.from(map.values()).map((item) => {
        const periodos_cargados = item.notas.length;
        const promedio = periodos_cargados > 0
          ? Math.round((item.notas.reduce((a, b) => a + b, 0) / periodos_cargados) * 100) / 100
          : null;
        const completo = periodos_cargados === SCHOOL_CONFIG.PERIODOS_TOTALES;
        let estado: 'Aprobada' | 'Reprobada' | 'Parcial' = 'Parcial';
        if (completo) {
          estado = (promedio ?? 0) >= SCHOOL_CONFIG.NOTA_APROBACION ? 'Aprobada' : 'Reprobada';
        }
        return {
          id_materia: item.id_materia,
          nombre_materia: item.nombre_materia,
          sigla: item.sigla,
          docente: item.docente,
          notas_por_periodo: item.notas_por_periodo,
          periodos_cargados,
          nota_final: promedio,
          completo,
          estado,
        };
      });
    } else {
      const fallback = await this.query<{
        id_materia: number;
        nombre_materia: string;
        sigla: string;
        docente: string;
        periodo: number;
        nota: string;
      }>(
        `SELECT m.id_materia, m.nombre_materia, m.sigla,
                d.nombres || ' ' || d.apellidos AS docente,
                ca.periodo, ca.nota
         FROM calificaciones ca
         JOIN asignaciones a ON a.id_asignacion = ca.asignacion_id
         JOIN materias m ON m.id_materia = a.materia_id
         JOIN docentes d ON d.id_docente = a.docente_id
         WHERE ca.inscripcion_id = $1 AND ca.estado = 1
         ORDER BY m.nombre_materia, ca.periodo`,
        [inscripcionId],
      );

      const map = new Map<number, {
        id_materia: number;
        nombre_materia: string;
        sigla: string;
        docente: string;
        notas_por_periodo: Record<string, number | null>;
        notas: number[];
      }>();

      for (const r of fallback) {
        if (!map.has(r.id_materia)) {
          map.set(r.id_materia, {
            id_materia: r.id_materia,
            nombre_materia: r.nombre_materia,
            sigla: r.sigla,
            docente: r.docente,
            notas_por_periodo: { '1': null, '2': null, '3': null, '4': null },
            notas: [],
          });
        }
        const item = map.get(r.id_materia)!;
        const n = Number(r.nota);
        item.notas_por_periodo[String(r.periodo)] = n;
        item.notas.push(n);
      }

      materiaItems = Array.from(map.values()).map((item) => {
        const periodos_cargados = item.notas.length;
        const promedio = periodos_cargados > 0
          ? Math.round((item.notas.reduce((a, b) => a + b, 0) / periodos_cargados) * 100) / 100
          : null;
        const completo = periodos_cargados === SCHOOL_CONFIG.PERIODOS_TOTALES;
        let estado: 'Aprobada' | 'Reprobada' | 'Parcial' = 'Parcial';
        if (completo) {
          estado = (promedio ?? 0) >= SCHOOL_CONFIG.NOTA_APROBACION ? 'Aprobada' : 'Reprobada';
        }
        return {
          id_materia: item.id_materia,
          nombre_materia: item.nombre_materia,
          sigla: item.sigla,
          docente: item.docente,
          notas_por_periodo: item.notas_por_periodo,
          periodos_cargados,
          nota_final: promedio,
          completo,
          estado,
        };
      });
    }

    const aprobadas = materiaItems.filter((m) => m.estado === 'Aprobada').length;
    const reprobadas = materiaItems.filter((m) => m.estado === 'Reprobada').length;
    const pendientes = materiaItems.filter((m) => m.estado === 'Parcial').length;
    const promediosConNota = materiaItems.filter((m) => m.nota_final !== null).map((m) => m.nota_final!);
    const promedio_general = promediosConNota.length > 0
      ? Math.round((promediosConNota.reduce((a, b) => a + b, 0) / promediosConNota.length) * 100) / 100
      : null;

    let estado_general: 'Aprobado' | 'Reprobado' | 'En curso' = 'En curso';
    if (reprobadas > 0) {
      estado_general = 'Reprobado';
    } else if (materiaItems.length > 0 && pendientes === 0 && aprobadas === materiaItems.length) {
      estado_general = 'Aprobado';
    }

    const resumen = {
      promedio_general,
      aprobadas,
      reprobadas,
      pendientes,
      estado_general,
      total_materias: materiaItems.length,
    };

    return { estudiante: student[0], materias: materiaItems, resumen };
  }

  async fichaEstudiante(estudianteId: number) {
    const estRows = await this.query(
      `SELECT e.*, u.email AS cuenta_acceso
       FROM estudiantes e
       LEFT JOIN usuarios u ON u.id_usuario = e.usuario_id
       WHERE e.id_estudiante = $1`,
      [estudianteId],
    );
    if (!estRows[0]) throw new NotFoundException('Estudiante no encontrado');
    const estudiante = estRows[0];

    const inscripciones = await this.query(
      `SELECT i.id_inscripcion, i.fecha_inscripcion, i.estado AS estado_inscripcion,
              c.id_curso, c.nombre AS grado, c.nivel, c.paralelo, c.turno, c.gestion
       FROM inscripciones i
       JOIN cursos c ON c.id_curso = i.curso_id
       WHERE i.estudiante_id = $1
       ORDER BY c.gestion DESC, c.nombre, c.paralelo`,
      [estudianteId],
    );

    const inscripcionesConEstado = await Promise.all(
      inscripciones.map(async (insc: any) => {
        try {
          const bol = await this.boletin(Number(insc.id_inscripcion));
          return {
            ...insc,
            promedio_general: bol.resumen.promedio_general,
            estado_academico: bol.resumen.estado_general,
          };
        } catch {
          return { ...insc, promedio_general: null, estado_academico: 'En curso' };
        }
      }),
    );

    const curso_actual = inscripcionesConEstado[0] ?? null;

    const pagos = await this.query(
      `SELECT p.id_pago, p.inscripcion_id, p.mes, p.monto_pagado, p.fecha_pago, p.nro_recibo, p.pagado_por, p.estado,
              c.gestion, c.nombre AS grado, c.paralelo
       FROM pagos p
       JOIN inscripciones i ON i.id_inscripcion = p.inscripcion_id
       JOIN cursos c ON c.id_curso = i.curso_id
       WHERE i.estudiante_id = $1 AND p.estado = 1
       ORDER BY c.gestion DESC, p.mes ASC`,
      [estudianteId],
    );

    return { estudiante, curso_actual, inscripciones: inscripcionesConEstado, pagos };
  }

  async centralizador(gestion: number, cursoId?: number, modo: 'promedio' | 'periodo' = 'promedio') {
    let targetCursoId = cursoId;
    if (!targetCursoId) {
      const firstCourse = await this.query<{ id_curso: number }>(
        'SELECT id_curso FROM cursos WHERE gestion = $1 AND estado = 1 ORDER BY nivel, nombre, paralelo, turno LIMIT 1',
        [gestion],
      );
      if (firstCourse[0]) targetCursoId = firstCourse[0].id_curso;
    }

    if (!targetCursoId) {
      return { curso: null, materias: [], filas: [], promedios_materia: {}, promedio_curso: null };
    }

    const cursoRows = await this.query(
      'SELECT * FROM cursos WHERE id_curso = $1',
      [targetCursoId],
    );
    const curso = cursoRows[0] ?? null;

    const materias = await this.query<{
      id_materia: number;
      sigla: string;
      nombre_materia: string;
      docente: string;
      id_asignacion: number;
    }>(
      `SELECT m.id_materia, m.sigla, m.nombre_materia,
              d.nombres || ' ' || d.apellidos AS docente,
              a.id_asignacion
       FROM asignaciones a
       JOIN materias m ON m.id_materia = a.materia_id
       JOIN docentes d ON d.id_docente = a.docente_id
       WHERE a.curso_id = $1 AND a.estado = 1 AND m.estado = 1 AND d.estado = 1
       ORDER BY m.nombre_materia`,
      [targetCursoId],
    );

    const estudiantes = await this.query<{
      id_inscripcion: number;
      id_estudiante: number;
      rude: string;
      ci: string;
      apellidos: string;
      nombres: string;
    }>(
      `SELECT i.id_inscripcion, e.id_estudiante, e.rude, e.ci, e.apellidos, e.nombres
       FROM inscripciones i
       JOIN estudiantes e ON e.id_estudiante = i.estudiante_id
       WHERE i.curso_id = $1 AND i.estado = 1 AND e.estado = 1
       ORDER BY e.apellidos, e.nombres`,
      [targetCursoId],
    );

    if (estudiantes.length === 0) {
      return { curso, materias, filas: [], promedios_materia: {}, promedio_curso: null };
    }

    const inscripcionIds = estudiantes.map((e) => e.id_inscripcion);

    const calRows = await this.query<{
      inscripcion_id: number;
      materia_id: number;
      periodo: number;
      nota: string;
    }>(
      `SELECT ca.inscripcion_id, a.materia_id, ca.periodo, ca.nota
       FROM calificaciones ca
       JOIN asignaciones a ON a.id_asignacion = ca.asignacion_id
       WHERE ca.inscripcion_id = ANY($1) AND ca.estado = 1`,
      [inscripcionIds],
    );

    const calMap = new Map<string, Record<string, number>>();
    for (const c of calRows) {
      const key = `${c.inscripcion_id}-${c.materia_id}`;
      if (!calMap.has(key)) {
        calMap.set(key, {});
      }
      calMap.get(key)![String(c.periodo)] = Number(c.nota);
    }

    const materiaNotasSum: Record<number, { sum: number; count: number }> = {};
    for (const m of materias) {
      materiaNotasSum[m.id_materia] = { sum: 0, count: 0 };
    }

    const filas = estudiantes.map((est, index) => {
      const notas: Record<number, {
        p1: number | null;
        p2: number | null;
        p3: number | null;
        p4: number | null;
        promedio: number | null;
        completo: boolean;
        estado: 'Aprobada' | 'Reprobada' | 'Parcial';
      }> = {};

      let reprobadas = 0;
      let pendientes = 0;
      const promediosAlumno: number[] = [];

      for (const m of materias) {
        const key = `${est.id_inscripcion}-${m.id_materia}`;
        const ps = calMap.get(key) ?? {};
        const p1 = ps['1'] ?? null;
        const p2 = ps['2'] ?? null;
        const p3 = ps['3'] ?? null;
        const p4 = ps['4'] ?? null;

        const cargados = [p1, p2, p3, p4].filter((v): v is number => v !== null);
        const promedio = cargados.length > 0
          ? Math.round((cargados.reduce((a, b) => a + b, 0) / cargados.length) * 100) / 100
          : null;

        const completo = cargados.length === SCHOOL_CONFIG.PERIODOS_TOTALES;
        let estado: 'Aprobada' | 'Reprobada' | 'Parcial' = 'Parcial';

        if (completo) {
          if ((promedio ?? 0) >= SCHOOL_CONFIG.NOTA_APROBACION) {
            estado = 'Aprobada';
          } else {
            estado = 'Reprobada';
            reprobadas++;
          }
        } else {
          pendientes++;
        }

        if (promedio !== null) {
          promediosAlumno.push(promedio);
          materiaNotasSum[m.id_materia].sum += promedio;
          materiaNotasSum[m.id_materia].count++;
        }

        notas[m.id_materia] = { p1, p2, p3, p4, promedio, completo, estado };
      }

      const promedio_general = promediosAlumno.length > 0
        ? Math.round((promediosAlumno.reduce((a, b) => a + b, 0) / promediosAlumno.length) * 100) / 100
        : null;

      let estadoFinal = 'En curso';
      if (reprobadas > 0) estadoFinal = 'Reprobado';
      else if (materias.length > 0 && pendientes === 0 && reprobadas === 0) estadoFinal = 'Aprobado';

      return {
        numero: index + 1,
        inscripcion_id: est.id_inscripcion,
        estudiante: `${est.apellidos} ${est.nombres}`,
        rude: est.rude,
        ci: est.ci,
        notas,
        promedio_general,
        reprobadas,
        estado: estadoFinal,
      };
    });

    const promedios_materia: Record<number, number | null> = {};
    let totalPromediosMateria = 0;
    let countPromediosMateria = 0;

    for (const m of materias) {
      const acc = materiaNotasSum[m.id_materia];
      if (acc && acc.count > 0) {
        const avg = Math.round((acc.sum / acc.count) * 100) / 100;
        promedios_materia[m.id_materia] = avg;
        totalPromediosMateria += avg;
        countPromediosMateria++;
      } else {
        promedios_materia[m.id_materia] = null;
      }
    }

    const promedio_curso = countPromediosMateria > 0
      ? Math.round((totalPromediosMateria / countPromediosMateria) * 100) / 100
      : null;

    return { curso, materias, filas, promedios_materia, promedio_curso, modo };
  }

  async recibo(pagoId: number, usuarioId?: number, rol?: string) {
    const rows = await this.query(
      `SELECT p.id_pago, p.nro_recibo, p.mes, p.monto_pagado, p.fecha_pago, p.pagado_por,
              e.id_estudiante, e.rude, e.ci, e.nombres, e.apellidos, e.usuario_id,
              c.id_curso, c.nombre AS grado, c.nivel, c.paralelo, c.turno, c.gestion
       FROM pagos p
       JOIN inscripciones i ON i.id_inscripcion = p.inscripcion_id
       JOIN estudiantes e ON e.id_estudiante = i.estudiante_id
       JOIN cursos c ON c.id_curso = i.curso_id
       WHERE p.id_pago = $1 AND p.estado = 1`,
      [pagoId],
    );
    if (!rows[0]) throw new NotFoundException('Recibo de pago no encontrado');
    const pago: any = rows[0];

    if (rol === 'ESTUDIANTE' && pago.usuario_id !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para ver este recibo');
    }

    const mesNumero = Number(pago.mes);
    const mesNombre = MESES_NOMBRES[mesNumero - 1] ?? `Mes ${mesNumero}`;

    return {
      ...pago,
      mes_nombre: mesNombre,
      colegio: SCHOOL_CONFIG.NOMBRE_COLEGIO,
    };
  }

  async morosidad(mesCorte?: number, gestion: number = 2026, nivel?: string, cursoId?: number, turno?: string) {
    const mesMin = SCHOOL_CONFIG.MES_INICIO_PENSIONES; // 2
    const mesMax = SCHOOL_CONFIG.MES_FIN_PENSIONES;    // 11
    const corte = Math.max(mesMin, Math.min(Number(mesCorte || new Date().getMonth() + 1), mesMax));

    const values: unknown[] = [gestion];
    const filters = ['i.estado = 1', 'e.estado = 1', 'c.estado = 1', 'c.gestion = $1'];

    if (nivel) { values.push(nivel); filters.push(`c.nivel = $${values.length}`); }
    if (cursoId) { values.push(cursoId); filters.push(`c.id_curso = $${values.length}`); }
    if (turno) { values.push(turno); filters.push(`c.turno = $${values.length}`); }

    const estudiantes = await this.query<{
      id_inscripcion: number;
      rude: string;
      nombres: string;
      apellidos: string;
      tutor_nombre: string;
      tutor_celular: string;
      curso: string;
      paralelo: string;
      nivel: string;
      gestion: number;
    }>(
      `SELECT i.id_inscripcion, e.rude, e.nombres, e.apellidos, e.tutor_nombre, e.tutor_celular,
              c.nombre AS curso, c.paralelo, c.nivel, c.gestion
       FROM inscripciones i
       JOIN estudiantes e ON e.id_estudiante = i.estudiante_id
       JOIN cursos c ON c.id_curso = i.curso_id
       WHERE ${filters.join(' AND ')}
       ORDER BY e.apellidos, e.nombres`,
      values,
    );

    const pagos = await this.query<{
      inscripcion_id: number;
      mes: number;
      monto_pagado: string;
      fecha_pago: string;
    }>(
      `SELECT p.inscripcion_id, p.mes, p.monto_pagado, p.fecha_pago
       FROM pagos p
       JOIN inscripciones i ON i.id_inscripcion = p.inscripcion_id
       JOIN cursos c ON c.id_curso = i.curso_id
       WHERE c.gestion = $1 AND p.estado = 1
       ORDER BY p.mes DESC`,
      [gestion],
    );

    const pagosPorNivel: Record<string, number[]> = {};
    for (const p of pagos) {
      const est = estudiantes.find((e) => e.id_inscripcion === p.inscripcion_id);
      if (est) {
        if (!pagosPorNivel[est.nivel]) pagosPorNivel[est.nivel] = [];
        pagosPorNivel[est.nivel].push(Number(p.monto_pagado));
      }
    }

    const medianaPorNivel: Record<string, number> = {};
    for (const niv in pagosPorNivel) {
      const list = pagosPorNivel[niv].sort((a, b) => a - b);
      const mid = Math.floor(list.length / 2);
      medianaPorNivel[niv] = list.length % 2 !== 0 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
    }

    const pagosPorInsc = new Map<number, Array<{ mes: number; monto: number; fecha: string }>>();
    for (const p of pagos) {
      if (!pagosPorInsc.has(p.inscripcion_id)) pagosPorInsc.set(p.inscripcion_id, []);
      pagosPorInsc.get(p.inscripcion_id)!.push({
        mes: p.mes,
        monto: Number(p.monto_pagado),
        fecha: p.fecha_pago,
      });
    }

    const mesesEsperados: number[] = [];
    for (let m = mesMin; m <= corte; m++) {
      mesesEsperados.push(m);
    }

    const enMora: any[] = [];
    let deudaReferencialTotal = 0;

    for (const est of estudiantes) {
      const pagosAlumno = pagosPorInsc.get(est.id_inscripcion) ?? [];
      const mesesPagadosSet = new Set(pagosAlumno.map((p) => p.mes));

      const mesesAdeudados = mesesEsperados.filter((m) => !mesesPagadosSet.has(m));
      if (mesesAdeudados.length > 0) {
        const mesesAdeudadosNombres = mesesAdeudados.map((m) => MESES_CORTOS[m - 1]);
        const mesesAdeudadosTexto = `${mesesAdeudadosNombres.join(', ')} (${mesesAdeudados.length})`;

        const ultimoPago = pagosAlumno.length > 0 ? pagosAlumno[0] : null;
        const tarifaRef = ultimoPago?.monto ?? medianaPorNivel[est.nivel] ?? null;
        const deudaRef = tarifaRef !== null ? tarifaRef * mesesAdeudados.length : null;

        if (deudaRef !== null) {
          deudaReferencialTotal += deudaRef;
        }

        enMora.push({
          id_inscripcion: est.id_inscripcion,
          estudiante: `${est.apellidos} ${est.nombres}`,
          curso: `${est.curso} ${est.paralelo} - ${est.nivel}`,
          tutor: est.tutor_nombre,
          celular: est.tutor_celular,
          meses_pagados: mesesPagadosSet.size,
          meses_adeudados: mesesAdeudadosTexto,
          cantidad_meses_adeudados: mesesAdeudados.length,
          ultimo_pago: ultimoPago ? `${formatDate(ultimoPago.fecha)} (${formatMoney(ultimoPago.monto)})` : 'Sin pagos',
          deuda_referencial: deudaRef,
        });
      }
    }

    enMora.sort((a, b) => b.cantidad_meses_adeudados - a.cantidad_meses_adeudados || a.estudiante.localeCompare(b.estudiante));

    return {
      estudiantes: enMora,
      total_alumnos_mora: enMora.length,
      deuda_referencial_total: deudaReferencialTotal,
      mes_corte: corte,
      gestion,
    };
  }

  async cursosPorGestion(gestion?: number, nivel?: string, turno?: string) {
    const values: unknown[] = [];
    const filters = ['c.estado=1'];
    if (gestion) { values.push(gestion); filters.push(`c.gestion=$${values.length}`); }
    if (nivel) { values.push(nivel); filters.push(`c.nivel=$${values.length}`); }
    if (turno) { values.push(turno); filters.push(`c.turno=$${values.length}`); }
    return this.query(
      `SELECT c.id_curso, c.nombre, c.nivel, c.paralelo, c.turno, c.gestion,
       COUNT(i.id_inscripcion) FILTER (WHERE i.estado=1)::int AS total_estudiantes
       FROM cursos c LEFT JOIN inscripciones i ON i.curso_id=c.id_curso
       WHERE ${filters.join(' AND ')}
       GROUP BY c.id_curso, c.nombre, c.nivel, c.paralelo, c.turno, c.gestion
       ORDER BY c.gestion DESC, c.nivel, c.nombre, c.paralelo, c.turno`, values,
    );
  }

  async docentePuedeCalificar(usuarioId: number, asignacionId: number) {
    const rows = await this.query(`SELECT a.id_asignacion FROM asignaciones a JOIN docentes d ON d.id_docente=a.docente_id WHERE a.id_asignacion=$1 AND a.estado=1 AND d.usuario_id=$2 AND d.estado=1`, [asignacionId, usuarioId]);
    return Boolean(rows[0]);
  }

  async asignacionDeCalificacion(id: number) {
    const rows = await this.query<{ asignacion_id: number }>('SELECT asignacion_id FROM calificaciones WHERE id_calificacion=$1 AND estado=1', [id]);
    if (!rows[0]) throw new NotFoundException('Calificación no encontrada');
    return rows[0].asignacion_id;
  }

  async docenteAsignaciones(usuarioId: number) {
    return this.query(`SELECT a.id_asignacion,m.nombre_materia AS materia,m.sigla,c.nombre AS grado,c.nivel,c.paralelo,c.turno,c.gestion FROM asignaciones a JOIN docentes d ON d.id_docente=a.docente_id JOIN materias m ON m.id_materia=a.materia_id JOIN cursos c ON c.id_curso=a.curso_id WHERE d.usuario_id=$1 AND d.estado=1 AND a.estado=1 AND m.estado=1 AND c.estado=1 ORDER BY c.gestion DESC,c.nivel,c.nombre,c.paralelo,m.nombre_materia`, [usuarioId]);
  }

  async notasPorAsignacion(asignacionId: number, periodo: number) {
    if (!Number.isInteger(periodo) || periodo < 1 || periodo > 4) throw new BadRequestException('El período debe estar entre 1 y 4');
    const asignacion = await this.query(
      `SELECT a.id_asignacion,c.id_curso,c.nombre AS grado,c.nivel,c.paralelo,c.turno,c.gestion,
        m.nombre_materia AS materia,m.sigla,d.nombres || ' ' || d.apellidos AS docente
       FROM asignaciones a JOIN cursos c ON c.id_curso=a.curso_id
       JOIN materias m ON m.id_materia=a.materia_id JOIN docentes d ON d.id_docente=a.docente_id
       WHERE a.id_asignacion=$1 AND a.estado=1 AND c.estado=1 AND m.estado=1 AND d.estado=1`, [asignacionId],
    );
    if (!asignacion[0]) throw new NotFoundException('Asignación no encontrada');
    const estudiantes = await this.query(
      `SELECT i.id_inscripcion,e.rude,e.ci,e.nombres,e.apellidos,ca.id_calificacion,ca.nota,
        ROUND((SELECT AVG(cx.nota) FROM calificaciones cx WHERE cx.inscripcion_id=i.id_inscripcion AND cx.asignacion_id=$1 AND cx.estado=1),2) AS promedio_materia
       FROM inscripciones i JOIN estudiantes e ON e.id_estudiante=i.estudiante_id
       LEFT JOIN calificaciones ca ON ca.inscripcion_id=i.id_inscripcion AND ca.asignacion_id=$1 AND ca.periodo=$2 AND ca.estado=1
       WHERE i.curso_id=$3 AND i.estado=1 AND e.estado=1
       ORDER BY e.apellidos,e.nombres`, [asignacionId, periodo, asignacion[0].id_curso],
    );
    return { asignacion: asignacion[0], periodo, estudiantes };
  }

  async guardarNotasPorAsignacion(asignacionId: number, periodo: number, notas: Array<{ inscripcion_id: number; nota: number | null }>) {
    if (!Number.isInteger(periodo) || periodo < 1 || periodo > 4) throw new BadRequestException('El período debe estar entre 1 y 4');
    if (!Array.isArray(notas) || !notas.length) throw new BadRequestException('No hay notas para guardar');
    await this.dataSource.transaction(async (manager) => {
      const assignment = await manager.query('SELECT curso_id FROM asignaciones WHERE id_asignacion=$1 AND estado=1', [asignacionId]);
      if (!assignment[0]) throw new NotFoundException('Asignación no encontrada');
      for (const item of notas) {
        if (!Number.isInteger(Number(item.inscripcion_id))) throw new BadRequestException('Inscripción inválida');
        if (item.nota === null || item.nota === undefined) continue;
        const nota = Number(item.nota);
        if (!Number.isFinite(nota) || nota < 0 || nota > 100) throw new BadRequestException('Cada nota debe estar entre 0 y 100');
        const valid = await manager.query('SELECT 1 FROM inscripciones WHERE id_inscripcion=$1 AND curso_id=$2 AND estado=1', [item.inscripcion_id, assignment[0].curso_id]);
        if (!valid[0]) throw new BadRequestException('Un estudiante no pertenece al curso de esta asignación');
        await manager.query(
          `INSERT INTO calificaciones (inscripcion_id,asignacion_id,periodo,nota,estado)
           VALUES ($1,$2,$3,$4,1)
           ON CONFLICT (inscripcion_id,asignacion_id,periodo) DO UPDATE SET nota=EXCLUDED.nota,estado=1`,
          [item.inscripcion_id, asignacionId, periodo, nota],
        );
      }
    });
    return this.notasPorAsignacion(asignacionId, periodo);
  }

  async estudiantesPorCurso(cursoId: number) {
    return this.query(
      `SELECT e.id_estudiante, e.rude, e.ci, e.nombres, e.apellidos, e.tutor_nombre, e.tutor_celular,
       i.id_inscripcion, i.fecha_inscripcion
       FROM inscripciones i JOIN estudiantes e ON e.id_estudiante=i.estudiante_id
       WHERE i.curso_id=$1 AND i.estado=1 AND e.estado=1
       ORDER BY e.apellidos, e.nombres`, [cursoId],
    );
  }

  async asignacionesPorGestion(gestion: number) {
    return this.query(
      `SELECT a.id_asignacion, d.id_docente, d.nombres || ' ' || d.apellidos AS docente,
       d.especialidad, m.nombre_materia AS materia, m.sigla,
       c.id_curso, c.nombre AS grado, c.nivel, c.paralelo, c.turno, c.gestion
       FROM asignaciones a JOIN docentes d ON d.id_docente=a.docente_id
       JOIN materias m ON m.id_materia=a.materia_id JOIN cursos c ON c.id_curso=a.curso_id
       WHERE a.estado=1 AND d.estado=1 AND m.estado=1 AND c.estado=1 AND c.gestion=$1
       ORDER BY docente, c.nivel, c.nombre, c.paralelo, m.nombre_materia`, [gestion],
    );
  }

  async catalogos(gestion?: number) {
    const values: unknown[] = [];
    let cursoWhere = 'WHERE estado=1';
    let inscWhere = 'WHERE i.estado=1 AND e.estado=1 AND c.estado=1';
    let asigWhere = 'WHERE a.estado=1 AND d.estado=1 AND m.estado=1 AND c.estado=1';
    if (gestion) {
      values.push(gestion);
      cursoWhere += ' AND gestion=$1';
      inscWhere += ' AND c.gestion=$1';
      asigWhere += ' AND c.gestion=$1';
    }

    const [usuarios, cursos, estudiantes, docentes, materias, inscripciones, asignaciones] = await Promise.all([
      this.query(`SELECT id_usuario, email || ' - ' || rol AS etiqueta FROM usuarios WHERE estado=1 ORDER BY email`),
      this.query(`SELECT id_curso, nombre || ' ' || paralelo || ' - ' || nivel || ' (' || gestion || ')' AS etiqueta, gestion, nivel, turno FROM cursos ${cursoWhere} ORDER BY gestion DESC,nivel,nombre,paralelo`, values),
      this.query(`SELECT id_estudiante, nombres || ' ' || apellidos || ' - ' || rude AS etiqueta FROM estudiantes WHERE estado=1 ORDER BY apellidos,nombres`),
      this.query(`SELECT id_docente, nombres || ' ' || apellidos AS etiqueta FROM docentes WHERE estado=1 ORDER BY apellidos,nombres`),
      this.query(`SELECT id_materia, nombre_materia || ' (' || sigla || ')' AS etiqueta FROM materias WHERE estado=1 ORDER BY nombre_materia`),
      this.query(`SELECT i.id_inscripcion, e.apellidos || ' ' || e.nombres || ' · CI:' || e.ci || ' · ' || e.rude || ' · ' || c.nivel || ' ' || c.nombre || ' ' || c.paralelo || ' (' || c.gestion || ')' AS etiqueta FROM inscripciones i JOIN estudiantes e ON e.id_estudiante=i.estudiante_id JOIN cursos c ON c.id_curso=i.curso_id ${inscWhere} ORDER BY e.apellidos,e.nombres`, values),
      this.query(`SELECT a.id_asignacion, c.nombre || ' ' || c.paralelo || ' · ' || c.nivel || ' (' || c.gestion || ') · ' || m.sigla || ' · ' || d.nombres || ' ' || d.apellidos AS etiqueta FROM asignaciones a JOIN docentes d ON d.id_docente=a.docente_id JOIN materias m ON m.id_materia=a.materia_id JOIN cursos c ON c.id_curso=a.curso_id ${asigWhere} ORDER BY c.gestion DESC,c.nivel,c.nombre,c.paralelo,m.sigla`, values),
    ]);
    return { usuarios, cursos, estudiantes, docentes, materias, inscripciones, asignaciones };
  }

  async gestionesNotas(user: { rol?: string }) {
    if (user.rol !== 'ADMIN' && user.rol !== 'DOCENTE') {
      throw new ForbiddenException('No tienes permiso para ver las gestiones');
    }
    const rows = await this.query<{ gestion: number }>(
      'SELECT DISTINCT gestion FROM cursos WHERE estado = 1 ORDER BY gestion DESC',
    );
    return rows.map((r) => Number(r.gestion));
  }

  async asignacionesNotas(
    user: { rol?: string; sub?: number },
    filters: { gestion?: number; nivel?: string; cursoId?: number },
  ) {
    if (user.rol !== 'ADMIN' && user.rol !== 'DOCENTE') {
      throw new ForbiddenException('No tienes permiso para consultar asignaciones');
    }

    const values: unknown[] = [];
    const where: string[] = ['a.estado = 1', 'c.estado = 1', 'm.estado = 1', 'd.estado = 1'];

    if (user.rol === 'DOCENTE') {
      values.push(user.sub);
      where.push(`d.usuario_id = $${values.length}`);
    }

    if (filters.gestion) {
      values.push(filters.gestion);
      where.push(`c.gestion = $${values.length}`);
    }

    if (filters.nivel) {
      values.push(filters.nivel.toUpperCase());
      where.push(`UPPER(c.nivel) = $${values.length}`);
    }

    if (filters.cursoId) {
      values.push(filters.cursoId);
      where.push(`c.id_curso = $${values.length}`);
    }

    const sql = `
      SELECT
        a.id_asignacion,
        c.id_curso,
        c.nombre || ' ' || c.paralelo || ' · ' || c.nivel || ' · ' || c.turno AS curso_etiqueta,
        c.nivel,
        c.nombre,
        c.paralelo,
        c.turno,
        c.gestion,
        m.id_materia,
        m.nombre_materia AS materia,
        m.sigla,
        d.nombres || ' ' || d.apellidos AS docente,
        (
          SELECT COUNT(*)::int
          FROM inscripciones i
          JOIN estudiantes e ON e.id_estudiante = i.estudiante_id
          WHERE i.curso_id = c.id_curso AND i.estado = 1 AND e.estado = 1
        ) AS total_estudiantes
      FROM asignaciones a
      JOIN cursos c ON c.id_curso = a.curso_id
      JOIN materias m ON m.id_materia = a.materia_id
      JOIN docentes d ON d.id_docente = a.docente_id
      WHERE ${where.join(' AND ')}
      ORDER BY c.nivel, c.nombre, c.paralelo, m.nombre_materia
    `;

    return this.query(sql, values);
  }

  async grillaNotas(asignacionId: number, user: { rol?: string; sub?: number }) {
    if (user.rol !== 'ADMIN') {
      if (user.rol !== 'DOCENTE') {
        throw new ForbiddenException('No tienes permiso para ver calificaciones');
      }
      const can = await this.docentePuedeCalificar(Number(user.sub), asignacionId);
      if (!can) {
        throw new ForbiddenException('No tienes permiso para acceder a esta asignación');
      }
    }

    const asigRows = await this.query<{
      id_asignacion: number;
      id_curso: number;
      curso_etiqueta: string;
      materia: string;
      sigla: string;
      docente: string;
      gestion: number;
    }>(
      `SELECT
         a.id_asignacion,
         c.id_curso,
         c.nombre || ' ' || c.paralelo || ' · ' || c.nivel || ' · ' || c.turno AS curso_etiqueta,
         m.nombre_materia AS materia,
         m.sigla,
         d.nombres || ' ' || d.apellidos AS docente,
         c.gestion
       FROM asignaciones a
       JOIN cursos c ON c.id_curso = a.curso_id
       JOIN materias m ON m.id_materia = a.materia_id
       JOIN docentes d ON d.id_docente = a.docente_id
       WHERE a.id_asignacion = $1 AND a.estado = 1 AND c.estado = 1 AND m.estado = 1 AND d.estado = 1`,
      [asignacionId],
    );

    if (!asigRows[0]) {
      throw new NotFoundException('Asignación no encontrada o inactiva');
    }

    const asignacion = asigRows[0];

    const estudiantes = await this.query<{
      inscripcion_id: number;
      id_inscripcion?: number;
      id_estudiante: number;
      rude: string;
      apellidos: string;
      nombres: string;
    }>(
      `SELECT
         i.id_inscripcion AS inscripcion_id,
         i.id_inscripcion,
         e.id_estudiante,
         e.rude,
         e.apellidos,
         e.nombres
       FROM inscripciones i
       JOIN estudiantes e ON e.id_estudiante = i.estudiante_id
       WHERE i.curso_id = $1 AND i.estado = 1 AND e.estado = 1
       ORDER BY e.apellidos, e.nombres`,
      [asignacion.id_curso],
    );

    const calRows = await this.query<{
      inscripcion_id: number;
      periodo: number;
      nota: string | number;
    }>(
      `SELECT inscripcion_id, periodo, nota
       FROM calificaciones
       WHERE asignacion_id = $1 AND estado = 1`,
      [asignacionId],
    );

    const notasMap = new Map<number, Record<string, number | null>>();
    for (const c of calRows) {
      const cInscId = Number(c.inscripcion_id);
      if (!notasMap.has(cInscId)) {
        notasMap.set(cInscId, {});
      }
      notasMap.get(cInscId)![String(c.periodo)] = c.nota !== null ? Number(c.nota) : null;
    }

    const estudiantesConNotas = estudiantes.map((est) => {
      const inscId = Number(est.inscripcion_id ?? est.id_inscripcion);
      const studentNotas = notasMap.get(inscId) || {};
      const notasObj: Record<string, number | null> = {};
      for (let p = 1; p <= SCHOOL_CONFIG.PERIODOS_TOTALES; p++) {
        notasObj[String(p)] = studentNotas[String(p)] ?? null;
      }
      return {
        inscripcion_id: inscId,
        id_inscripcion: inscId,
        id_estudiante: est.id_estudiante,
        rude: est.rude,
        apellidos: est.apellidos,
        nombres: est.nombres,
        notas: notasObj,
      };
    });

    return {
      asignacion: {
        id_asignacion: asignacion.id_asignacion,
        curso_etiqueta: asignacion.curso_etiqueta,
        materia: asignacion.materia,
        sigla: asignacion.sigla,
        docente: asignacion.docente,
        gestion: asignacion.gestion,
      },
      periodos_totales: SCHOOL_CONFIG.PERIODOS_TOTALES,
      estudiantes: estudiantesConNotas,
    };
  }

  async guardarGrillaNotas(
    asignacionId: number,
    user: { rol?: string; sub?: number },
    body: { cambios?: Array<{ inscripcion_id?: unknown; periodo?: unknown; nota?: unknown }> },
  ) {
    if (user.rol !== 'ADMIN') {
      if (user.rol !== 'DOCENTE') {
        throw new ForbiddenException('No tienes permiso para guardar calificaciones');
      }
      const can = await this.docentePuedeCalificar(Number(user.sub), asignacionId);
      if (!can) {
        throw new ForbiddenException('No tienes permiso para calificar esta asignación');
      }
    }

    const asigRows = await this.query<{ id_asignacion: number; curso_id: number }>(
      `SELECT a.id_asignacion, a.curso_id
       FROM asignaciones a
       JOIN cursos c ON c.id_curso = a.curso_id
       WHERE a.id_asignacion = $1 AND a.estado = 1 AND c.estado = 1`,
      [asignacionId],
    );
    if (!asigRows[0]) {
      throw new NotFoundException('Asignación no encontrada o inactiva');
    }
    const cursoId = asigRows[0].curso_id;

    if (!body || !Array.isArray(body.cambios) || body.cambios.length === 0) {
      throw new BadRequestException('No se recibieron cambios para guardar');
    }
    if (body.cambios.length > 500) {
      throw new BadRequestException('El límite máximo es de 500 cambios por envío');
    }

    const validInscRows = await this.query<{ id_inscripcion: number }>(
      `SELECT i.id_inscripcion
       FROM inscripciones i
       JOIN estudiantes e ON e.id_estudiante = i.estudiante_id
       WHERE i.curso_id = $1 AND i.estado = 1 AND e.estado = 1`,
      [cursoId],
    );
    const validInscSet = new Set(validInscRows.map((r) => Number(r.id_inscripcion)));

    const errores: Array<{ inscripcion_id: number; periodo: number; mensaje: string }> = [];

    for (const c of body.cambios) {
      const inscId = Number(c.inscripcion_id);
      const per = Number(c.periodo);

      if (!Number.isInteger(inscId)) {
        errores.push({
          inscripcion_id: Number(c.inscripcion_id) || 0,
          periodo: per || 0,
          mensaje: 'ID de inscripción inválido.',
        });
        continue;
      }

      if (!validInscSet.has(inscId)) {
        errores.push({
          inscripcion_id: inscId,
          periodo: per || 0,
          mensaje: 'El estudiante no pertenece al curso de esta asignación o la inscripción está inactiva.',
        });
        continue;
      }

      if (!Number.isInteger(per) || per < 1 || per > SCHOOL_CONFIG.PERIODOS_TOTALES) {
        errores.push({
          inscripcion_id: inscId,
          periodo: per,
          mensaje: `El período debe estar entre 1 y ${SCHOOL_CONFIG.PERIODOS_TOTALES}.`,
        });
        continue;
      }

      if (c.nota !== null && c.nota !== undefined && c.nota !== '') {
        const strNota = typeof c.nota === 'string' ? c.nota.replace(',', '.') : String(c.nota);
        const numNota = Number(strNota);
        if (isNaN(numNota) || !Number.isFinite(numNota) || numNota < 0 || numNota > 100) {
          errores.push({
            inscripcion_id: inscId,
            periodo: per,
            mensaje: 'La nota debe estar entre 0 y 100.',
          });
          continue;
        }
        const parts = strNota.split('.');
        if (parts[1] && parts[1].length > 2) {
          errores.push({
            inscripcion_id: inscId,
            periodo: per,
            mensaje: 'La nota no puede tener más de 2 decimales.',
          });
          continue;
        }
      }
    }

    if (errores.length > 0) {
      throw new BadRequestException({
        message: 'Se encontraron errores de validación en las notas',
        errores,
      });
    }

    let guardadas = 0;
    let eliminadas = 0;

    const cambios = body.cambios;

    await this.dataSource.transaction(async (manager) => {
      for (const c of cambios) {
        const inscId = Number(c.inscripcion_id);
        const per = Number(c.periodo);
        const isDelete = c.nota === null || c.nota === undefined || c.nota === '';

        if (isDelete) {
          const res = await manager.query(
            `UPDATE calificaciones SET estado = 0
             WHERE inscripcion_id = $1 AND asignacion_id = $2 AND periodo = $3 AND estado = 1
             RETURNING id_calificacion`,
            [inscId, asignacionId, per],
          );
          if (res.length > 0) {
            eliminadas++;
          }
        } else {
          const strNota = typeof c.nota === 'string' ? c.nota.replace(',', '.') : String(c.nota);
          const numNota = Number(Number(strNota).toFixed(2));
          await manager.query(
            `INSERT INTO calificaciones (inscripcion_id, asignacion_id, periodo, nota, estado)
             VALUES ($1, $2, $3, $4, 1)
             ON CONFLICT (inscripcion_id, asignacion_id, periodo)
             DO UPDATE SET nota = EXCLUDED.nota, estado = 1`,
            [inscId, asignacionId, per, numNota],
          );
          guardadas++;
        }
      }
    });

    return { guardadas, eliminadas };
  }

  async buscarEstudiantes(q?: string, gestion?: number, limit = 10) {
    if (!q || q.trim().length < 2) {
      return [];
    }
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 20));
    const values: unknown[] = [`%${q.trim()}%`];
    let gestionClause = '';
    if (gestion) {
      values.push(gestion);
      gestionClause = ` AND c.gestion = $${values.length}`;
    }
    values.push(safeLimit);
    const limitParam = `$${values.length}`;

    return this.query(
      `SELECT
         e.id_estudiante,
         i.id_inscripcion,
         e.apellidos || ' ' || e.nombres || ' · CI:' || COALESCE(e.ci, '—') || ' · ' || e.rude || ' · ' || c.nivel || ' ' || c.nombre || ' ' || c.paralelo || ' (' || c.gestion || ')' AS etiqueta,
         e.rude,
         e.ci,
         c.nombre || ' ' || c.paralelo || ' · ' || c.nivel || ' · ' || c.turno AS curso_etiqueta,
         c.gestion
       FROM inscripciones i
       JOIN estudiantes e ON e.id_estudiante = i.estudiante_id
       JOIN cursos c ON c.id_curso = i.curso_id
       WHERE i.estado = 1 AND e.estado = 1 AND c.estado = 1
         AND (e.apellidos || ' ' || e.nombres || ' ' || e.rude || ' ' || COALESCE(e.ci, '')) ILIKE $1
         ${gestionClause}
       ORDER BY e.apellidos, e.nombres
       LIMIT ${limitParam}`,
      values,
    );
  }

  async listarNotas(
    user: { rol?: string; sub?: number },
    params: {
      gestion?: number;
      cursoId?: number;
      asignacionId?: number;
      periodo?: number | 'promedio';
      estudianteId?: number;
      buscar?: string;
      page?: number;
      pageSize?: number;
      sort?: string;
      dir?: 'asc' | 'desc';
    },
  ) {
    if (user.rol !== 'ADMIN' && user.rol !== 'DOCENTE') {
      throw new ForbiddenException('No tienes permiso para consultar notas');
    }

    const values: unknown[] = [];
    const where: string[] = [
      'ca.estado = 1',
      'i.estado = 1',
      'e.estado = 1',
      'a.estado = 1',
      'c.estado = 1',
      'm.estado = 1',
      'd.estado = 1',
    ];

    if (user.rol === 'DOCENTE') {
      values.push(user.sub);
      where.push(`d.usuario_id = $${values.length}`);
    }

    if (params.gestion) {
      values.push(params.gestion);
      where.push(`c.gestion = $${values.length}`);
    }
    if (params.cursoId) {
      values.push(params.cursoId);
      where.push(`c.id_curso = $${values.length}`);
    }
    if (params.asignacionId) {
      values.push(params.asignacionId);
      where.push(`a.id_asignacion = $${values.length}`);
    }
    if (params.periodo && params.periodo !== 'promedio') {
      values.push(params.periodo);
      where.push(`ca.periodo = $${values.length}`);
    }
    if (params.estudianteId) {
      values.push(params.estudianteId);
      where.push(`e.id_estudiante = $${values.length}`);
    }
    if (params.buscar && params.buscar.trim()) {
      values.push(`%${params.buscar.trim()}%`);
      const idx = values.length;
      where.push(
        `(e.apellidos ILIKE $${idx} OR e.nombres ILIKE $${idx} OR COALESCE(e.ci, '') ILIKE $${idx} OR e.rude ILIKE $${idx} OR m.nombre_materia ILIKE $${idx})`,
      );
    }

    const isPromedio = params.periodo === 'promedio';
    const sortDir = params.dir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const validPageSizes = [10, 25, 50, 100];
    const pageSize = validPageSizes.includes(Number(params.pageSize)) ? Number(params.pageSize) : 25;
    const page = Math.max(1, Number(params.page) || 1);
    const offset = (page - 1) * pageSize;

    const baseFrom = `
      FROM calificaciones ca
      JOIN inscripciones i ON i.id_inscripcion = ca.inscripcion_id
      JOIN estudiantes e ON e.id_estudiante = i.estudiante_id
      JOIN asignaciones a ON a.id_asignacion = ca.asignacion_id
      JOIN materias m ON m.id_materia = a.materia_id
      JOIN docentes d ON d.id_docente = a.docente_id
      JOIN cursos c ON c.id_curso = i.curso_id
      WHERE ${where.join(' AND ')}
    `;

    if (isPromedio) {
      const sortMap: Record<string, string> = {
        estudiante: 'e.apellidos, e.nombres',
        curso_etiqueta: 'c.nivel, c.nombre, c.paralelo',
        materia: 'm.nombre_materia',
        periodo: 'COUNT(ca.id_calificacion)',
        nota: 'ROUND(AVG(ca.nota), 2)',
        gestion: 'c.gestion',
      };

      const sortCol = params.sort && sortMap[params.sort] ? sortMap[params.sort] : null;
      let orderBy = 'c.gestion DESC, c.nombre ASC, e.apellidos ASC';
      if (sortCol) {
        orderBy = sortCol
          .split(',')
          .map((part) => `${part.trim()} ${sortDir}`)
          .join(', ');
      }

      const countRes = await this.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM (
           SELECT 1 ${baseFrom}
           GROUP BY c.gestion, c.nombre, c.paralelo, c.nivel, c.turno, e.apellidos, e.nombres, e.rude, m.nombre_materia, m.sigla, d.nombres, d.apellidos, a.id_asignacion, i.id_inscripcion, c.id_curso, e.id_estudiante
         ) q`,
        values,
      );
      const total = countRes[0]?.total ?? 0;

      const selectValues = [...values, pageSize, offset];
      const limitParam = `$${selectValues.length - 1}`;
      const offsetParam = `$${selectValues.length}`;

      const rows = await this.query<{
        id_calificacion: number;
        gestion: number;
        curso_etiqueta: string;
        estudiante: string;
        apellidos: string;
        nombres: string;
        rude: string;
        ci: string | null;
        materia: string;
        sigla: string;
        docente: string;
        periodo: number | null;
        periodo_etiqueta: string;
        periodos_cargados: number;
        nota: string | number;
        id_asignacion: number;
        id_inscripcion: number;
        id_curso: number;
        id_estudiante: number;
      }>(
        `SELECT
           MIN(ca.id_calificacion) AS id_calificacion,
           c.gestion,
           c.nombre || ' ' || c.paralelo || ' · ' || c.nivel || ' · ' || c.turno AS curso_etiqueta,
           e.apellidos || ' ' || e.nombres AS estudiante,
           e.apellidos,
           e.nombres,
           e.rude,
           e.ci,
           m.nombre_materia AS materia,
           m.sigla,
           d.nombres || ' ' || d.apellidos AS docente,
           NULL::smallint AS periodo,
           'Promedio' AS periodo_etiqueta,
           COUNT(ca.id_calificacion)::int AS periodos_cargados,
           ROUND(AVG(ca.nota), 2) AS nota,
           a.id_asignacion,
           i.id_inscripcion,
           c.id_curso,
           e.id_estudiante
         ${baseFrom}
         GROUP BY c.gestion, c.nombre, c.paralelo, c.nivel, c.turno, e.apellidos, e.nombres, e.rude, e.ci, m.nombre_materia, m.sigla, d.nombres, d.apellidos, a.id_asignacion, i.id_inscripcion, c.id_curso, e.id_estudiante
         ORDER BY ${orderBy}
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        selectValues,
      );

      const data = rows.map((r) => ({
        ...r,
        nota: Number(r.nota),
      }));

      return {
        data,
        total,
        page,
        pageSize,
      };
    }

    const sortMap: Record<string, string> = {
      estudiante: 'e.apellidos, e.nombres',
      curso_etiqueta: 'c.nivel, c.nombre, c.paralelo',
      materia: 'm.nombre_materia',
      periodo: 'ca.periodo',
      nota: 'ca.nota',
      gestion: 'c.gestion',
    };

    const sortCol = params.sort && sortMap[params.sort] ? sortMap[params.sort] : null;

    let orderBy = 'c.gestion DESC, c.nombre ASC, e.apellidos ASC, ca.periodo ASC';
    if (sortCol) {
      orderBy = sortCol
        .split(',')
        .map((part) => `${part.trim()} ${sortDir}`)
        .join(', ');
    }

    const countRes = await this.query<{ total: number }>(`SELECT COUNT(*)::int AS total ${baseFrom}`, values);
    const total = countRes[0]?.total ?? 0;

    const selectValues = [...values, pageSize, offset];
    const limitParam = `$${selectValues.length - 1}`;
    const offsetParam = `$${selectValues.length}`;

    const rows = await this.query<{
      id_calificacion: number;
      gestion: number;
      curso_etiqueta: string;
      estudiante: string;
      apellidos: string;
      nombres: string;
      rude: string;
      ci: string | null;
      materia: string;
      sigla: string;
      docente: string;
      periodo: number;
      nota: string | number;
      id_asignacion: number;
      id_inscripcion: number;
      id_curso: number;
      id_estudiante: number;
    }>(
      `SELECT
         ca.id_calificacion,
         c.gestion,
         c.nombre || ' ' || c.paralelo || ' · ' || c.nivel || ' · ' || c.turno AS curso_etiqueta,
         e.apellidos || ' ' || e.nombres AS estudiante,
         e.apellidos,
         e.nombres,
         e.rude,
         e.ci,
         m.nombre_materia AS materia,
         m.sigla,
         d.nombres || ' ' || d.apellidos AS docente,
         ca.periodo,
         ca.nota,
         a.id_asignacion,
         i.id_inscripcion,
         c.id_curso,
         e.id_estudiante
       ${baseFrom}
       ORDER BY ${orderBy}
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      selectValues,
    );

    const data = rows.map((r) => ({
      ...r,
      periodo_etiqueta: `P${r.periodo}`,
      periodos_cargados: 1,
      nota: Number(r.nota),
    }));

    return {
      data,
      total,
      page,
      pageSize,
    };
  }

  async listadoGestion(gestion: number, nivel?: string, cursoId?: number, turno?: string) {
    const values: unknown[] = [gestion];
    const filters = ['c.gestion=$1', 'c.estado=1', 'i.estado=1', 'e.estado=1'];
    if (nivel) { values.push(nivel); filters.push(`c.nivel=$${values.length}`); }
    if (cursoId) { values.push(cursoId); filters.push(`c.id_curso=$${values.length}`); }
    if (turno) { values.push(turno); filters.push(`c.turno=$${values.length}`); }
    return this.query(`SELECT c.id_curso,c.nombre AS grado,c.nivel,c.paralelo,c.turno,c.gestion,e.id_estudiante,e.rude,e.ci,e.nombres,e.apellidos,e.tutor_nombre,e.tutor_celular,i.id_inscripcion,i.fecha_inscripcion FROM inscripciones i JOIN estudiantes e ON e.id_estudiante=i.estudiante_id JOIN cursos c ON c.id_curso=i.curso_id WHERE ${filters.join(' AND ')} ORDER BY c.nivel,c.nombre,c.paralelo,e.apellidos,e.nombres`, values);
  }

  async inscripcionesPorGestion(gestion: number, nivel?: string, cursoId?: number) {
    const values: unknown[] = [gestion];
    const filters = ['i.estado=1', 'e.estado=1', 'c.estado=1', 'c.gestion=$1'];
    if (nivel) { values.push(nivel.toUpperCase()); filters.push(`UPPER(c.nivel)=$${values.length}`); }
    if (cursoId) { values.push(cursoId); filters.push(`c.id_curso=$${values.length}`); }
    return this.query(
      `SELECT i.id_inscripcion,e.id_estudiante,e.nombres || ' ' || e.apellidos AS estudiante,c.id_curso,c.nombre AS grado,c.nivel,c.paralelo,c.gestion
       FROM inscripciones i
       JOIN estudiantes e ON e.id_estudiante=i.estudiante_id
       JOIN cursos c ON c.id_curso=i.curso_id
       WHERE ${filters.join(' AND ')}
       ORDER BY e.apellidos,e.nombres`,
      values,
    );
  }

  async reportesAcademicos(gestion: number, cursoId?: number) {
    const values: unknown[] = [gestion];
    const cursoFilter = cursoId ? ` AND c.id_curso=$2` : '';
    if (cursoId) values.push(cursoId);
    const [ingresos, promedios, ranking, riesgo] = await Promise.all([
      this.query(`SELECT p.mes,c.nombre AS grado,c.nivel,c.paralelo,COUNT(p.id_pago)::int AS cantidad_pagos,COALESCE(SUM(p.monto_pagado),0)::numeric(12,2) AS total_ingresos FROM pagos p JOIN inscripciones i ON i.id_inscripcion=p.inscripcion_id JOIN cursos c ON c.id_curso=i.curso_id WHERE p.estado=1 AND i.estado=1 AND c.estado=1 AND c.gestion=$1${cursoFilter} GROUP BY p.mes,c.nombre,c.nivel,c.paralelo ORDER BY p.mes,c.nivel,c.nombre,c.paralelo`, values),
      this.query(`SELECT c.id_curso,m.id_materia,c.nombre AS grado,c.nivel,c.paralelo,m.nombre_materia AS materia,ROUND(AVG(ca.nota),2) AS promedio FROM calificaciones ca JOIN inscripciones i ON i.id_inscripcion=ca.inscripcion_id JOIN asignaciones a ON a.id_asignacion=ca.asignacion_id JOIN cursos c ON c.id_curso=i.curso_id JOIN materias m ON m.id_materia=a.materia_id WHERE ca.estado=1 AND i.estado=1 AND a.estado=1 AND c.estado=1 AND c.gestion=$1${cursoFilter} GROUP BY c.id_curso,m.id_materia,c.nombre,c.nivel,c.paralelo,m.nombre_materia ORDER BY c.nivel,c.nombre,c.paralelo,m.nombre_materia`, values),
      this.query(`SELECT c.id_curso,c.nombre AS grado,c.nivel,c.paralelo,e.id_estudiante,e.nombres || ' ' || e.apellidos AS estudiante,ROUND(AVG(ca.nota),2) AS promedio_final FROM (SELECT ca.inscripcion_id,a.materia_id,ROUND(AVG(ca.nota),2) AS nota FROM calificaciones ca JOIN asignaciones a ON a.id_asignacion=ca.asignacion_id JOIN materias m ON m.id_materia=a.materia_id JOIN docentes d ON d.id_docente=a.docente_id WHERE ca.estado=1 AND a.estado=1 AND m.estado=1 AND d.estado=1 GROUP BY ca.inscripcion_id,a.materia_id) ca JOIN inscripciones i ON i.id_inscripcion=ca.inscripcion_id JOIN estudiantes e ON e.id_estudiante=i.estudiante_id JOIN cursos c ON c.id_curso=i.curso_id WHERE i.estado=1 AND e.estado=1 AND c.estado=1 AND c.gestion=$1${cursoFilter} GROUP BY c.id_curso,c.nombre,c.nivel,c.paralelo,e.id_estudiante,e.nombres,e.apellidos ORDER BY promedio_final DESC,estudiante`, values),
      this.query(`SELECT c.id_curso,c.nombre AS grado,c.nivel,c.paralelo,e.id_estudiante,e.nombres || ' ' || e.apellidos AS estudiante,ROUND(AVG(ca.nota),2) AS promedio_final FROM (SELECT ca.inscripcion_id,a.materia_id,ROUND(AVG(ca.nota),2) AS nota FROM calificaciones ca JOIN asignaciones a ON a.id_asignacion=ca.asignacion_id JOIN materias m ON m.id_materia=a.materia_id JOIN docentes d ON d.id_docente=a.docente_id WHERE ca.estado=1 AND a.estado=1 AND m.estado=1 AND d.estado=1 GROUP BY ca.inscripcion_id,a.materia_id) ca JOIN inscripciones i ON i.id_inscripcion=ca.inscripcion_id JOIN estudiantes e ON e.id_estudiante=i.estudiante_id JOIN cursos c ON c.id_curso=i.curso_id WHERE i.estado=1 AND e.estado=1 AND c.estado=1 AND c.gestion=$1${cursoFilter} GROUP BY c.id_curso,c.nombre,c.nivel,c.paralelo,e.id_estudiante,e.nombres,e.apellidos HAVING AVG(ca.nota)<${SCHOOL_CONFIG.NOTA_RIESGO} ORDER BY promedio_final,estudiante`, values),
    ]);
    return { ingresos, promedios, ranking, riesgo };
  }

  async dashboardGestion(gestion: number) {
    const [alumnosPorCurso, pagosPorMes] = await Promise.all([
      this.query(`SELECT c.nombre || ' ' || c.paralelo || ' - ' || c.nivel AS etiqueta,COUNT(i.id_inscripcion) FILTER (WHERE i.estado=1)::int AS total FROM cursos c LEFT JOIN inscripciones i ON i.curso_id=c.id_curso WHERE c.estado=1 AND c.gestion=$1 GROUP BY c.id_curso,c.nombre,c.paralelo,c.nivel ORDER BY total DESC,etiqueta`, [gestion]),
      this.query(`SELECT p.mes,COALESCE(SUM(p.monto_pagado),0)::numeric(12,2) AS total FROM pagos p JOIN inscripciones i ON i.id_inscripcion=p.inscripcion_id JOIN cursos c ON c.id_curso=i.curso_id WHERE p.estado=1 AND c.gestion=$1 GROUP BY p.mes ORDER BY p.mes`, [gestion]),
    ]);
    return { alumnosPorCurso, pagosPorMes };
  }

  async miResumen(usuarioId: number) {
    const estudiante = await this.query(`SELECT id_estudiante,rude,nombres,apellidos FROM estudiantes WHERE usuario_id=$1 AND estado=1`, [usuarioId]);
    if (!estudiante[0]) throw new NotFoundException('Tu usuario no está vinculado a un estudiante');
    const inscripciones = await this.query(`SELECT i.id_inscripcion,c.nombre AS grado,c.nivel,c.paralelo,c.gestion FROM inscripciones i JOIN cursos c ON c.id_curso=i.curso_id WHERE i.estudiante_id=$1 AND i.estado=1 AND c.estado=1 ORDER BY c.gestion DESC`, [estudiante[0].id_estudiante]);
    return { estudiante: estudiante[0], inscripciones };
  }

  async miBoletin(usuarioId: number, inscripcionId: number) {
    const own = await this.query(`SELECT i.id_inscripcion FROM inscripciones i JOIN estudiantes e ON e.id_estudiante=i.estudiante_id WHERE i.id_inscripcion=$1 AND e.usuario_id=$2 AND i.estado=1 AND e.estado=1`, [inscripcionId, usuarioId]);
    if (!own[0]) throw new ForbiddenException('No tienes acceso a esta inscripción');
    return this.boletin(inscripcionId);
  }

  async miPagos(usuarioId: number) {
    const estRows = await this.query(
      'SELECT id_estudiante, rude, ci, nombres, apellidos FROM estudiantes WHERE usuario_id = $1 AND estado = 1',
      [usuarioId],
    );
    if (!estRows[0]) throw new NotFoundException('Tu usuario no está vinculado a un estudiante');
    const estudiante = estRows[0];

    const inscripciones = await this.query(
      `SELECT i.id_inscripcion, c.id_curso, c.nombre AS grado, c.nivel, c.paralelo, c.turno, c.gestion
       FROM inscripciones i
       JOIN cursos c ON c.id_curso = i.curso_id
       WHERE i.estudiante_id = $1 AND i.estado = 1
       ORDER BY c.gestion DESC`,
      [estudiante.id_estudiante],
    );

    const pagos = await this.query(
      `SELECT p.id_pago, p.inscripcion_id, p.mes, p.monto_pagado, p.fecha_pago, p.nro_recibo, p.pagado_por
       FROM pagos p
       JOIN inscripciones i ON i.id_inscripcion = p.inscripcion_id
       WHERE i.estudiante_id = $1 AND p.estado = 1
       ORDER BY p.mes`,
      [estudiante.id_estudiante],
    );

    return { estudiante, inscripciones, pagos };
  }
}
