import { BadRequestException, Body, Controller, DefaultValuePipe, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isResource, ResourceName } from './resources';
import { SchoolService } from './school.service';
import { SCHOOL_CONFIG } from './config';

@UseGuards(JwtAuthGuard)
@Controller()
export class SchoolController {
  constructor(private readonly school: SchoolService) {}
  private resource(value: string): ResourceName { if (!isResource(value)) throw new Error('Recurso inválido'); return value; }
  private canReadManagement(user: { rol?: string }) { if (user.rol === 'ADMIN') return; throw new ForbiddenException('Esta información está disponible solo para administración'); }
  private async canWrite(user: { rol?: string; sub?: number }, resource: string, asignacionIds: number[] = []) {
    if (user.rol === 'ADMIN') return;
    if (user.rol === 'DOCENTE' && resource === 'calificaciones' && asignacionIds.length && (await Promise.all(asignacionIds.map((id) => this.school.docentePuedeCalificar(Number(user.sub), id)))).every(Boolean)) return;
    throw new ForbiddenException('No tienes permiso para modificar este módulo');
  }

  @Get('mi/resumen') miResumen(@Req() req: { user: { sub: number } }) { return this.school.miResumen(req.user.sub); }
  @Get('mi/boletin/:inscripcionId') miBoletin(@Req() req: { user: { sub: number } }, @Param('inscripcionId', ParseIntPipe) id: number) { return this.school.miBoletin(req.user.sub, id); }
  @Get('mi/pagos') miPagos(@Req() req: { user: { sub: number } }) { return this.school.miPagos(req.user.sub); }
  @Get('docente/asignaciones') docenteAsignaciones(@Req() req: { user: { rol?: string; sub: number } }) { if (req.user.rol !== 'DOCENTE') throw new ForbiddenException(); return this.school.docenteAsignaciones(req.user.sub); }
  @Get('docente/centralizador') async notasPorAsignacion(@Req() req: { user: { rol?: string; sub?: number } }, @Query('asignacionId', ParseIntPipe) asignacionId: number, @Query('periodo', ParseIntPipe) periodo: number) { await this.canWrite(req.user, 'calificaciones', [asignacionId]); return this.school.notasPorAsignacion(asignacionId, periodo); }
  @Post('docente/centralizador') async guardarNotasPorAsignacion(@Req() req: { user: { rol?: string; sub?: number } }, @Body() body: { asignacion_id?: number; periodo?: number; notas?: Array<{ inscripcion_id: number; nota: number | null }> }) { const asignacionId = Number(body.asignacion_id); await this.canWrite(req.user, 'calificaciones', [asignacionId]); return this.school.guardarNotasPorAsignacion(asignacionId, Number(body.periodo), body.notas ?? []); }
  @Get('dashboard/resumen') summary(@Req() req: { user: { rol?: string } }, @Query('gestion', new DefaultValuePipe(2026), ParseIntPipe) gestion: number) { this.canReadManagement(req.user); return this.school.summary(gestion); }
  @Get('dashboard/graficos') dashboard(@Req() req: { user: { rol?: string } }, @Query('gestion', new DefaultValuePipe(2026), ParseIntPipe) gestion: number) { this.canReadManagement(req.user); return this.school.dashboardGestion(gestion); }
  @Get('catalogos') catalogos(@Req() req: { user: { rol?: string } }, @Query('gestion') gestion?: string) { this.canReadManagement(req.user); return this.school.catalogos(gestion ? Number(gestion) : undefined); }
  @Get('reportes/boletin/:inscripcionId') boletin(@Req() req: { user: { rol?: string } }, @Param('inscripcionId', ParseIntPipe) id: number) { this.canReadManagement(req.user); return this.school.boletin(id); }
  @Get('reportes/estudiantes/:id/ficha') ficha(@Req() req: { user: { rol?: string } }, @Param('id', ParseIntPipe) id: number) { this.canReadManagement(req.user); return this.school.fichaEstudiante(id); }
  @Get('reportes/centralizador') centralizador(
    @Req() req: { user: { rol?: string } },
    @Query('gestion', new DefaultValuePipe(2026), ParseIntPipe) gestion: number,
    @Query('cursoId') cursoId?: string,
    @Query('modo') modo?: 'promedio' | 'periodo',
  ) {
    this.canReadManagement(req.user);
    return this.school.centralizador(gestion, cursoId ? Number(cursoId) : undefined, modo ?? 'promedio');
  }
  @Get('reportes/recibo/:pagoId') recibo(
    @Req() req: { user: { rol?: string; sub: number } },
    @Param('pagoId', ParseIntPipe) pagoId: number,
  ) {
    return this.school.recibo(pagoId, req.user.sub, req.user.rol);
  }
  @Get('reportes/morosidad') morosidad(
    @Req() req: { user: { rol?: string } },
    @Query('mes') mes?: string,
    @Query('gestion', new DefaultValuePipe(2026), ParseIntPipe) gestion?: number,
    @Query('nivel') nivel?: string,
    @Query('cursoId') cursoId?: string,
    @Query('turno') turno?: string,
  ) {
    this.canReadManagement(req.user);
    const m = mes ? Number(mes) : undefined;
    return this.school.morosidad(m, gestion ?? 2026, nivel, cursoId ? Number(cursoId) : undefined, turno);
  }
  @Get('reportes/cursos') cursosPorGestion(@Req() req: { user: { rol?: string } }, @Query('gestion') gestion?: string, @Query('nivel') nivel?: string, @Query('turno') turno?: string) { this.canReadManagement(req.user); const year = gestion ? Number(gestion) : undefined; if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2100)) throw new BadRequestException('La gestión es inválida'); return this.school.cursosPorGestion(year, nivel, turno); }
  @Get('reportes/cursos/:cursoId/estudiantes') estudiantesPorCurso(@Req() req: { user: { rol?: string } }, @Param('cursoId', ParseIntPipe) cursoId: number) { this.canReadManagement(req.user); return this.school.estudiantesPorCurso(cursoId); }
  @Get('reportes/asignaciones') asignacionesPorGestion(@Req() req: { user: { rol?: string } }, @Query('gestion', new DefaultValuePipe(2026), ParseIntPipe) gestion: number) { this.canReadManagement(req.user); return this.school.asignacionesPorGestion(gestion); }
  @Get('reportes/inscripciones') inscripciones(
    @Req() req: { user: { rol?: string } },
    @Query('gestion', new DefaultValuePipe(2026), ParseIntPipe) gestion: number,
    @Query('nivel') nivel?: string,
    @Query('cursoId') cursoId?: string,
  ) {
    this.canReadManagement(req.user);
    return this.school.inscripcionesPorGestion(
      gestion,
      nivel,
      cursoId ? Number(cursoId) : undefined,
    );
  }
  @Get('reportes/listado') listado(@Req() req: { user: { rol?: string } }, @Query('gestion', new DefaultValuePipe(2026), ParseIntPipe) gestion: number, @Query('nivel') nivel?: string, @Query('cursoId') cursoId?: string, @Query('turno') turno?: string) { this.canReadManagement(req.user); return this.school.listadoGestion(gestion, nivel, cursoId ? Number(cursoId) : undefined, turno); }
  @Get('reportes/academicos') academicos(@Req() req: { user: { rol?: string } }, @Query('gestion', new DefaultValuePipe(2026), ParseIntPipe) gestion: number, @Query('cursoId') cursoId?: string) { this.canReadManagement(req.user); return this.school.reportesAcademicos(gestion, cursoId ? Number(cursoId) : undefined); }

  @Get('notas/gestiones')
  gestionesNotas(@Req() req: { user: { rol?: string } }) {
    return this.school.gestionesNotas(req.user);
  }

  @Get('notas/asignaciones')
  asignacionesNotas(
    @Req() req: { user: { rol?: string; sub?: number } },
    @Query('gestion') gestion?: string,
    @Query('nivel') nivel?: string,
    @Query('cursoId') cursoId?: string,
  ) {
    return this.school.asignacionesNotas(req.user, {
      gestion: gestion ? Number(gestion) : undefined,
      nivel: nivel || undefined,
      cursoId: cursoId ? Number(cursoId) : undefined,
    });
  }

  @Get('notas/grilla/:asignacionId')
  grillaNotas(
    @Req() req: { user: { rol?: string; sub?: number } },
    @Param('asignacionId', ParseIntPipe) asignacionId: number,
  ) {
    return this.school.grillaNotas(asignacionId, req.user);
  }

  @Put('notas/grilla/:asignacionId')
  guardarGrillaNotas(
    @Req() req: { user: { rol?: string; sub?: number } },
    @Param('asignacionId', ParseIntPipe) asignacionId: number,
    @Body() body: { cambios?: Array<{ inscripcion_id?: unknown; periodo?: unknown; nota?: unknown }> },
  ) {
    return this.school.guardarGrillaNotas(asignacionId, req.user, body);
  }

  @Get('notas')
  listarNotas(
    @Req() req: { user: { rol?: string; sub?: number } },
    @Query('gestion') gestion?: string,
    @Query('cursoId') cursoId?: string,
    @Query('asignacionId') asignacionId?: string,
    @Query('periodo') periodo?: string,
    @Query('estudianteId') estudianteId?: string,
    @Query('buscar') buscar?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: 'asc' | 'desc',
  ) {
    return this.school.listarNotas(req.user, {
      gestion: gestion ? Number(gestion) : undefined,
      cursoId: cursoId ? Number(cursoId) : undefined,
      asignacionId: asignacionId ? Number(asignacionId) : undefined,
      periodo: periodo ? (periodo === 'promedio' ? 'promedio' : Number(periodo)) : undefined,
      estudianteId: estudianteId ? Number(estudianteId) : undefined,
      buscar: buscar || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      sort: sort || undefined,
      dir: dir || undefined,
    });
  }

  @Get('estudiantes/buscar')
  buscarEstudiantes(
    @Req() req: { user: { rol?: string } },
    @Query('q') q?: string,
    @Query('gestion') gestion?: string,
    @Query('limit') limit?: string,
  ) {
    if (req.user.rol !== 'ADMIN') {
      throw new ForbiddenException('Solo los administradores pueden buscar estudiantes');
    }
    return this.school.buscarEstudiantes(
      q,
      gestion ? Number(gestion) : undefined,
      limit ? Number(limit) : 10,
    );
  }

  @Get(':resource') list(
    @Req() req: { user: { rol?: string } },
    @Param('resource') resource: string,
    @Query('buscar') buscar?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: 'asc' | 'desc',
    @Query('estado') estado?: string,
    @Query('gestion') gestion?: string,
    @Query('nivel') nivel?: string,
    @Query('cursoId') cursoId?: string,
    @Query('materiaId') materiaId?: string,
    @Query('periodo') periodo?: string,
  ) {
    this.canReadManagement(req.user);
    const p = page ? Number(page) : undefined;
    const ps = pageSize ? Number(pageSize) : undefined;
    const extraFilters = {
      gestion: gestion ? Number(gestion) : undefined,
      nivel: nivel || undefined,
      cursoId: cursoId ? Number(cursoId) : undefined,
      materiaId: materiaId ? Number(materiaId) : undefined,
      periodo: periodo ? Number(periodo) : undefined,
    };
    return this.school.list(this.resource(resource), buscar, p, ps, sort, dir, estado ?? '1', extraFilters);
  }

  @Get(':resource/:id') one(@Req() req: { user: { rol?: string } }, @Param('resource') resource: string, @Param('id', ParseIntPipe) id: number) { this.canReadManagement(req.user); return this.school.one(this.resource(resource), id); }
  @Post(':resource') async create(@Req() req: { user: { rol?: string; sub?: number } }, @Param('resource') resource: string, @Body() body: Record<string, unknown>) { await this.canWrite(req.user, resource, body.asignacion_id ? [Number(body.asignacion_id)] : []); return this.school.create(this.resource(resource), body); }
  @Patch(':resource/:id/reactivar') async reactivate(@Req() req: { user: { rol?: string } }, @Param('resource') resource: string, @Param('id', ParseIntPipe) id: number) { this.canReadManagement(req.user); return this.school.reactivate(this.resource(resource), id); }
  @Patch(':resource/:id') async update(@Req() req: { user: { rol?: string; sub?: number } }, @Param('resource') resource: string, @Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    if (resource === 'calificaciones') {
      delete body.inscripcion_id;
      delete body.asignacion_id;
      if (body.nota !== undefined && body.nota !== null) {
        const strNota = typeof body.nota === 'string' ? body.nota.replace(',', '.') : String(body.nota);
        const numNota = Number(strNota);
        if (isNaN(numNota) || !Number.isFinite(numNota) || numNota < 0 || numNota > 100) {
          throw new BadRequestException('La nota debe estar entre 0 y 100');
        }
        const parts = strNota.split('.');
        if (parts[1] && parts[1].length > 2) {
          throw new BadRequestException('La nota no puede tener más de 2 decimales');
        }
        body.nota = Number(numNota.toFixed(2));
      }
      if (body.periodo !== undefined && body.periodo !== null) {
        const p = Number(body.periodo);
        if (!Number.isInteger(p) || p < 1 || p > SCHOOL_CONFIG.PERIODOS_TOTALES) {
          throw new BadRequestException(`El período debe estar entre 1 y ${SCHOOL_CONFIG.PERIODOS_TOTALES}`);
        }
        body.periodo = p;
      }
    }
    const ids = resource === 'calificaciones' ? [await this.school.asignacionDeCalificacion(id)] : [];
    await this.canWrite(req.user, resource, ids);
    return this.school.update(this.resource(resource), id, body);
  }
  @Delete(':resource/:id') async remove(@Req() req: { user: { rol?: string; sub?: number } }, @Param('resource') resource: string, @Param('id', ParseIntPipe) id: number) { const ids = resource === 'calificaciones' ? [await this.school.asignacionDeCalificacion(id)] : []; await this.canWrite(req.user, resource, ids); return this.school.deactivate(this.resource(resource), id); }
}
