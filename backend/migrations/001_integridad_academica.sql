-- Ejecutar una vez sobre una base existente.
-- Las validaciones previas confirmaron que los datos actuales cumplen estas reglas.

CREATE UNIQUE INDEX IF NOT EXISTS uq_estudiantes_ci ON estudiantes (ci);
CREATE UNIQUE INDEX IF NOT EXISTS uq_docentes_ci ON docentes (ci);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asignacion_activa_curso_materia
  ON asignaciones (curso_id, materia_id) WHERE estado = 1;

CREATE OR REPLACE FUNCTION chk_inscripcion_unica_gestion() RETURNS trigger AS $$
DECLARE gestion_destino SMALLINT;
BEGIN
  IF NEW.estado <> 1 THEN RETURN NEW; END IF;
  SELECT gestion INTO gestion_destino FROM cursos WHERE id_curso = NEW.curso_id;
  IF EXISTS (
    SELECT 1 FROM inscripciones i
    JOIN cursos c ON c.id_curso = i.curso_id
    WHERE i.estudiante_id = NEW.estudiante_id AND i.estado = 1
      AND c.gestion = gestion_destino AND i.id_inscripcion <> COALESCE(NEW.id_inscripcion, 0)
  ) THEN
    RAISE EXCEPTION 'El estudiante ya tiene una inscripción activa en esta gestión';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inscripcion_unica_gestion ON inscripciones;
CREATE TRIGGER trg_inscripcion_unica_gestion
  BEFORE INSERT OR UPDATE OF estudiante_id, curso_id, estado ON inscripciones
  FOR EACH ROW EXECUTE FUNCTION chk_inscripcion_unica_gestion();

CREATE OR REPLACE FUNCTION chk_rol_usuario_vinculado() RETURNS trigger AS $$
DECLARE rol_usuario VARCHAR(20);
DECLARE esperado VARCHAR(20);
BEGIN
  esperado := TG_ARGV[0];
  IF NEW.usuario_id IS NULL THEN RETURN NEW; END IF;
  SELECT rol INTO rol_usuario FROM usuarios WHERE id_usuario = NEW.usuario_id;
  IF rol_usuario IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'La cuenta vinculada debe tener rol %', esperado;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estudiante_rol_usuario ON estudiantes;
CREATE TRIGGER trg_estudiante_rol_usuario
  BEFORE INSERT OR UPDATE OF usuario_id ON estudiantes
  FOR EACH ROW EXECUTE FUNCTION chk_rol_usuario_vinculado('ESTUDIANTE');

DROP TRIGGER IF EXISTS trg_docente_rol_usuario ON docentes;
CREATE TRIGGER trg_docente_rol_usuario
  BEFORE INSERT OR UPDATE OF usuario_id ON docentes
  FOR EACH ROW EXECUTE FUNCTION chk_rol_usuario_vinculado('DOCENTE');

CREATE OR REPLACE FUNCTION chk_cambio_rol_usuario() RETURNS trigger AS $$
BEGIN
  IF NEW.rol <> OLD.rol AND (
    EXISTS (SELECT 1 FROM estudiantes WHERE usuario_id = OLD.id_usuario)
    OR EXISTS (SELECT 1 FROM docentes WHERE usuario_id = OLD.id_usuario)
  ) THEN
    RAISE EXCEPTION 'No se puede cambiar el rol de un usuario vinculado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuarios_rol_vinculado ON usuarios;
CREATE TRIGGER trg_usuarios_rol_vinculado
  BEFORE UPDATE OF rol ON usuarios
  FOR EACH ROW EXECUTE FUNCTION chk_cambio_rol_usuario();
