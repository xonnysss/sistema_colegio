-- =====================================================================
--  MARCO SCHOOL - versión compacta (9 tablas) - PostgreSQL 12+
--  Tablas: usuarios, estudiantes, docentes, materias, cursos,
--          inscripciones, asignaciones, calificaciones, pagos
--
--  LOGIN: la base solo GUARDA el hash. El hasheo y la verificación
--  se hacen en el backend (bcrypt/argon2). Nunca guardar la clave en texto plano.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION set_fyh_actualizacion() RETURNS trigger AS $$
BEGIN
    NEW.fyh_actualizacion := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 1. USUARIOS (login). El rol es un campo validado con CHECK.
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
    id_usuario        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email             VARCHAR(255) NOT NULL,
    password_hash     TEXT NOT NULL,            -- hash bcrypt, nunca la clave real
    rol               VARCHAR(20) NOT NULL,
    fyh_creacion      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fyh_actualizacion TIMESTAMP,
    estado            SMALLINT NOT NULL DEFAULT 1,
    CONSTRAINT ck_usuarios_rol CHECK (rol IN ('ADMIN','DOCENTE','ESTUDIANTE'))
);
-- Email único sin distinguir mayúsculas
CREATE UNIQUE INDEX uq_usuarios_email ON usuarios (LOWER(email));

-- ---------------------------------------------------------------------
-- 2. ESTUDIANTES (el tutor se guarda aquí mismo)
-- ---------------------------------------------------------------------
CREATE TABLE estudiantes (
    id_estudiante     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id        INT UNIQUE,               -- opcional: no todos inician sesión
    rude              VARCHAR(50)  NOT NULL UNIQUE,
    ci                VARCHAR(20)  NOT NULL,
    nombres           VARCHAR(100) NOT NULL,
    apellidos         VARCHAR(100) NOT NULL,
    fecha_nacimiento  DATE NOT NULL,
    tutor_nombre      VARCHAR(100) NOT NULL,
    tutor_celular     VARCHAR(20)  NOT NULL,
    fyh_creacion      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fyh_actualizacion TIMESTAMP,
    estado            SMALLINT NOT NULL DEFAULT 1,
    CONSTRAINT fk_estudiantes_usuario FOREIGN KEY (usuario_id)
        REFERENCES usuarios (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- 3. DOCENTES
-- ---------------------------------------------------------------------
CREATE TABLE docentes (
    id_docente        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id        INT UNIQUE,
    ci                VARCHAR(20)  NOT NULL,
    nombres           VARCHAR(100) NOT NULL,
    apellidos         VARCHAR(100) NOT NULL,
    especialidad      VARCHAR(255) NOT NULL,
    celular           VARCHAR(20)  NOT NULL,
    fyh_creacion      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fyh_actualizacion TIMESTAMP,
    estado            SMALLINT NOT NULL DEFAULT 1,
    CONSTRAINT fk_docentes_usuario FOREIGN KEY (usuario_id)
        REFERENCES usuarios (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- 4. MATERIAS (catálogo)
-- ---------------------------------------------------------------------
CREATE TABLE materias (
    id_materia        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_materia    VARCHAR(255) NOT NULL UNIQUE,
    sigla             VARCHAR(20)  NOT NULL UNIQUE,
    fyh_creacion      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fyh_actualizacion TIMESTAMP,
    estado            SMALLINT NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------
-- 5. CURSOS (unifica gestión + nivel + grado + paralelo + turno)
-- ---------------------------------------------------------------------
CREATE TABLE cursos (
    id_curso          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre            VARCHAR(50) NOT NULL,     -- ej. '1ro'
    nivel             VARCHAR(20) NOT NULL,
    paralelo          VARCHAR(10) NOT NULL,
    turno             VARCHAR(20) NOT NULL,
    gestion           SMALLINT    NOT NULL,     -- ej. 2026
    fyh_creacion      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fyh_actualizacion TIMESTAMP,
    estado            SMALLINT NOT NULL DEFAULT 1,
    CONSTRAINT ck_cursos_nivel  CHECK (nivel IN ('INICIAL','PRIMARIA','SECUNDARIA')),
    CONSTRAINT ck_cursos_turno  CHECK (turno IN ('MAÑANA','TARDE','NOCHE')),
    CONSTRAINT ck_cursos_gestion CHECK (gestion BETWEEN 2000 AND 2100),
    CONSTRAINT uq_curso UNIQUE (gestion, nivel, nombre, paralelo, turno)
);

-- ---------------------------------------------------------------------
-- 6. INSCRIPCIONES (matrícula: qué alumno está en qué curso)
-- ---------------------------------------------------------------------
CREATE TABLE inscripciones (
    id_inscripcion    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estudiante_id     INT NOT NULL,
    curso_id          INT NOT NULL,
    fecha_inscripcion DATE NOT NULL DEFAULT CURRENT_DATE,
    fyh_creacion      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fyh_actualizacion TIMESTAMP,
    estado            SMALLINT NOT NULL DEFAULT 1,
    CONSTRAINT fk_insc_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES estudiantes (id_estudiante) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_insc_curso FOREIGN KEY (curso_id)
        REFERENCES cursos (id_curso) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT uq_inscripcion UNIQUE (estudiante_id, curso_id)
);

-- ---------------------------------------------------------------------
-- 7. ASIGNACIONES (qué docente dicta qué materia en qué curso)
-- ---------------------------------------------------------------------
CREATE TABLE asignaciones (
    id_asignacion     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    docente_id        INT NOT NULL,
    curso_id          INT NOT NULL,
    materia_id        INT NOT NULL,
    fyh_creacion      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fyh_actualizacion TIMESTAMP,
    estado            SMALLINT NOT NULL DEFAULT 1,
    CONSTRAINT fk_asig_docente FOREIGN KEY (docente_id)
        REFERENCES docentes (id_docente) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_asig_curso FOREIGN KEY (curso_id)
        REFERENCES cursos (id_curso) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_asig_materia FOREIGN KEY (materia_id)
        REFERENCES materias (id_materia) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT uq_asignacion UNIQUE (docente_id, curso_id, materia_id)
);

-- ---------------------------------------------------------------------
-- 8. CALIFICACIONES (una fila por período; la nota final = AVG(nota))
-- ---------------------------------------------------------------------
CREATE TABLE calificaciones (
    id_calificacion   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inscripcion_id    INT NOT NULL,
    asignacion_id     INT NOT NULL,
    periodo           SMALLINT NOT NULL,
    nota              NUMERIC(5,2) NOT NULL,
    fyh_creacion      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fyh_actualizacion TIMESTAMP,
    estado            SMALLINT NOT NULL DEFAULT 1,
    CONSTRAINT fk_cal_inscripcion FOREIGN KEY (inscripcion_id)
        REFERENCES inscripciones (id_inscripcion) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_cal_asignacion FOREIGN KEY (asignacion_id)
        REFERENCES asignaciones (id_asignacion) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT ck_cal_periodo CHECK (periodo BETWEEN 1 AND 4),
    CONSTRAINT ck_cal_nota    CHECK (nota BETWEEN 0 AND 100),
    CONSTRAINT uq_calificacion UNIQUE (inscripcion_id, asignacion_id, periodo)
);

-- La inscripción y la asignación deben ser del MISMO curso
CREATE OR REPLACE FUNCTION chk_calificacion_mismo_curso() RETURNS trigger AS $$
BEGIN
    IF (SELECT curso_id FROM inscripciones WHERE id_inscripcion = NEW.inscripcion_id)
       IS DISTINCT FROM
       (SELECT curso_id FROM asignaciones WHERE id_asignacion = NEW.asignacion_id)
    THEN
        RAISE EXCEPTION 'La inscripción y la asignación pertenecen a cursos distintos';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cal_mismo_curso
    BEFORE INSERT OR UPDATE OF inscripcion_id, asignacion_id ON calificaciones
    FOR EACH ROW EXECUTE FUNCTION chk_calificacion_mismo_curso();

-- ---------------------------------------------------------------------
-- 9. PAGOS (la deuda es de la inscripción; pagado_por = quien llevó el dinero)
-- ---------------------------------------------------------------------
CREATE TABLE pagos (
    id_pago           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inscripcion_id    INT NOT NULL,
    mes               SMALLINT NOT NULL,        -- 1 = enero ... 12 = diciembre
    monto_pagado      NUMERIC(10,2) NOT NULL,
    fecha_pago        DATE NOT NULL DEFAULT CURRENT_DATE,
    nro_recibo        VARCHAR(20) NOT NULL UNIQUE,
    pagado_por        VARCHAR(100),             -- por defecto, el tutor del estudiante
    fyh_creacion      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fyh_actualizacion TIMESTAMP,
    estado            SMALLINT NOT NULL DEFAULT 1,
    CONSTRAINT fk_pagos_inscripcion FOREIGN KEY (inscripcion_id)
        REFERENCES inscripciones (id_inscripcion) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT ck_pagos_mes   CHECK (mes BETWEEN 1 AND 12),
    CONSTRAINT ck_pagos_monto CHECK (monto_pagado > 0),
    CONSTRAINT uq_pago_mes UNIQUE (inscripcion_id, mes)
);

-- ---------------------------------------------------------------------
-- ÍNDICES EN CLAVES FORÁNEAS
-- ---------------------------------------------------------------------
CREATE INDEX ix_insc_curso      ON inscripciones (curso_id);
CREATE INDEX ix_asig_curso      ON asignaciones (curso_id);
CREATE INDEX ix_asig_materia    ON asignaciones (materia_id);
CREATE INDEX ix_cal_asignacion  ON calificaciones (asignacion_id);

-- ---------------------------------------------------------------------
-- TRIGGER fyh_actualizacion en todas las tablas
-- ---------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'fyh_actualizacion'
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_fyh BEFORE UPDATE ON %1$I
             FOR EACH ROW EXECUTE FUNCTION set_fyh_actualizacion()', t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- DATOS INICIALES
-- (el hash es el bcrypt del script original; ajusta a tu propia clave)
-- ---------------------------------------------------------------------
INSERT INTO usuarios (email, password_hash, rol)
VALUES ('marco@gmail.com', '$2y$10$zSJ99LWaKh32rsWib9z9suDd1yFQBDvyNRaq.XMVkl7x9Szk/mdyi', 'ADMIN');

INSERT INTO materias (nombre_materia, sigla) VALUES ('MATEMATICA', 'MAT-101');

INSERT INTO cursos (nombre, nivel, paralelo, turno, gestion)
VALUES ('1ro', 'INICIAL', 'A', 'MAÑANA', 2026);

COMMIT;

-- =====================================================================
-- CONSULTAS DE EJEMPLO
-- =====================================================================
-- Nota final por materia de una inscripción:
--   SELECT m.nombre_materia, ROUND(AVG(c.nota), 2) AS nota_final
--   FROM calificaciones c
--   JOIN asignaciones a ON a.id_asignacion = c.asignacion_id
--   JOIN materias m     ON m.id_materia    = a.materia_id
--   WHERE c.inscripcion_id = 1
--   GROUP BY m.nombre_materia;
--
-- Meses pagados de un estudiante:
--   SELECT p.mes, p.monto_pagado, p.fecha_pago, p.nro_recibo
--   FROM pagos p WHERE p.inscripcion_id = 1 ORDER BY p.mes;