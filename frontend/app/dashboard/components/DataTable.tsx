'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { exportExcel, exportPdf } from '../../../lib/export';
import { formatDate, formatMoney, MESES_NOMBRES } from '../../../lib/config';
import { getColumnLabel } from '../../../lib/labels';

type Row = Record<string, unknown>;

function formatCellValue(key: string, value: unknown): React.ReactNode {
  if (value === null || value === undefined) return '—';

  // Badge para estado
  if (key === 'estado') {
    const isActivo = value === 1 || value === '1' || value === true;
    return (
      <span className={`badge ${isActivo ? 'badge-activo' : 'badge-baja'}`}>
        {isActivo ? 'Activo' : 'Baja'}
      </span>
    );
  }

  // Nombre de mes si la columna es 'mes'
  if (key === 'mes') {
    const num = Number(value);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      return MESES_NOMBRES[num - 1] ?? String(value);
    }
  }

  // Fechas
  if (key.startsWith('fecha_') || key === 'fecha' || (/^\d{4}-\d{2}-\d{2}/.test(String(value)))) {
    return formatDate(String(value));
  }

  // Dinero
  if (key.includes('monto') || key.includes('ingreso') || key.includes('deuda')) {
    const num = Number(value);
    if (!isNaN(num)) return formatMoney(num);
  }

  return String(value);
}

export function DataTable({
  title,
  rows = [],
  action,
  secondaryAction,
  remove,
  onReactivate,
  estadoFilter,
  onEstadoFilterChange,
  showEstadoFilter = false,
  defaultPageSize = 10,
  preferredColumns,
  defaultSort = '',
  defaultSortAsc = true,
}: {
  title: string;
  rows: Row[];
  action?: { label: string; run: (r: Row) => void };
  secondaryAction?: { label: string; run: (r: Row) => void };
  remove?: (r: Row) => void;
  onReactivate?: (r: Row) => void;
  estadoFilter?: string;
  onEstadoFilterChange?: (estado: string) => void;
  showEstadoFilter?: boolean;
  defaultPageSize?: number;
  preferredColumns?: string[];
  defaultSort?: string;
  defaultSortAsc?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState(defaultSort);
  const [asc, setAsc] = useState(defaultSortAsc);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Debounce search 300 ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [rows, estadoFilter]);

  const PRIORITY_ORDER = [
    'estudiante',
    'rude',
    'ci',
    'nombres',
    'apellidos',
    'email',
    'rol',
    'curso',
    'grado',
    'nivel',
    'paralelo',
    'turno',
    'gestion',
    'materia',
    'nombre_materia',
    'sigla',
    'docente',
    'especialidad',
    'periodo',
    'nota',
    'nota_final',
    'promedio',
    'promedio_final',
    'promedio_general',
    'total_estudiantes',
    'mes',
    'cantidad_pagos',
    'total_ingresos',
    'monto_pagado',
    'fecha_pago',
    'nro_recibo',
    'pagado_por',
    'tutor_nombre',
    'tutor_celular',
    'estado',
  ];

  const columnPriority = preferredColumns ?? PRIORITY_ORDER;
  const columns = rows[0]
    ? Object.keys(rows[0])
        .filter(
          (key) =>
            !key.startsWith('fyh_') &&
            key !== 'password_hash' &&
            !key.startsWith('id_') &&
            !key.endsWith('_id') &&
            key !== 'usuario_id',
        )
        .sort((a, b) => {
          const idxA = columnPriority.indexOf(a);
          const idxB = columnPriority.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return 0;
        })
    : [];

  const visible = useMemo(() => {
    return rows
      .filter((r) =>
        Object.values(r).some((v) =>
          String(v ?? '').toLowerCase().includes(debouncedSearch.toLowerCase()),
        ),
      )
      .sort((a, b) =>
        sort
          ? String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), 'es', { numeric: true }) *
            (asc ? 1 : -1)
          : 0,
      );
  }, [rows, debouncedSearch, sort, asc]);

  const total = visible.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = total === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const paginatedRows = useMemo(
    () => visible.slice(startIndex, endIndex),
    [visible, startIndex, endIndex],
  );

  const sortBy = useCallback((key: string) => {
    setAsc((prevAsc) => (sort === key ? !prevAsc : true));
    setSort(key);
  }, [sort]);

  const tablePrefix = useMemo(
    () => (title ? title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 24) : 'tbl'),
    [title],
  );

  const rowKey = (row: Row, index: number) => {
    // Para garantizar unicidad absoluta en cualquier tabla o reporte agrupado:
    // Combinamos el prefijo de la tabla, el índice absoluto de la fila y los valores representativos.
    const idKeys = Object.keys(row).filter((k) => k.startsWith('id_'));
    const idPart = idKeys.length > 0 ? idKeys.map((k) => `${k}:${row[k]}`).join('|') : '';
    const valSnippet = Object.values(row)
      .slice(0, 3)
      .map((v) => String(v ?? ''))
      .join('-');
    return `${tablePrefix}-${startIndex + index}-${idPart}-${valSnippet}`;
  };

  return (
    <section className="data-section">
      <div className="table-tools">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en la tabla…"
          aria-label="Buscar en la tabla"
        />

        {showEstadoFilter && onEstadoFilterChange && (
          <label className="filter-estado-label">
            <span>Estado:</span>
            <select
              value={estadoFilter ?? '1'}
              onChange={(e) => onEstadoFilterChange(e.target.value)}
            >
              <option value="1">Activos</option>
              <option value="0">Dados de baja</option>
              <option value="todos">Todos</option>
            </select>
          </label>
        )}

        <span>{total} registro(s)</span>
        <button
          type="button"
          className="outline"
          onClick={() => exportExcel(title, visible)}
        >
          Excel
        </button>
        <button
          type="button"
          className="outline"
          onClick={() => exportPdf(title, visible)}
        >
          PDF
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const isSorted = sort === c;
                const ariaSort = isSorted ? (asc ? 'ascending' : 'descending') : 'none';
                return (
                  <th key={c} aria-sort={ariaSort}>
                    <button
                      type="button"
                      className="sort"
                      onClick={() => sortBy(c)}
                      aria-label={`Ordenar por ${getColumnLabel(c)}`}
                    >
                      {getColumnLabel(c)} {isSorted ? (asc ? '▲' : '▼') : '↕'}
                    </button>
                  </th>
                );
              })}
              {(action || secondaryAction || remove || onReactivate) && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((r, i) => {
              const isBaja = r.estado === 0 || r.estado === '0';
              return (
                <tr key={rowKey(r, i)} className={isBaja ? 'row-baja' : ''}>
                  {columns.map((c) => (
                    <td key={c}>{formatCellValue(c, r[c])}</td>
                  ))}
                  {(action || secondaryAction || remove || onReactivate) && (
                    <td className="row-actions">
                      {action && (
                        <button type="button" onClick={() => action.run(r)}>
                          {action.label}
                        </button>
                      )}
                      {secondaryAction && (
                        <button type="button" className="outline" onClick={() => secondaryAction.run(r)}>
                          {secondaryAction.label}
                        </button>
                      )}
                      {isBaja && onReactivate && (
                        <button
                          type="button"
                          className="reactivate-btn"
                          onClick={() => onReactivate(r)}
                        >
                          Reactivar
                        </button>
                      )}
                      {!isBaja && remove && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => remove(r)}
                        >
                          Baja
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: '24px' }}>
                  No hay registros para los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="pagination">
          <div className="pagination-info">
            <span>
              Mostrando {startIndex + 1}–{endIndex} de {total}
            </span>
            <label className="pagination-size">
              <span>Por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          {totalPages > 1 && (
            <div className="pagination-nav">
              <button
                type="button"
                className="outline"
                disabled={currentPage <= 1}
                onClick={() => setPage(1)}
                title="Primera página"
              >
                «
              </button>
              <button
                type="button"
                className="outline"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                title="Página anterior"
              >
                ‹ Anterior
              </button>
              <span className="pagination-current">
                Pág. <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
              </span>
              <button
                type="button"
                className="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                title="Página siguiente"
              >
                Siguiente ›
              </button>
              <button
                type="button"
                className="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(totalPages)}
                title="Última página"
              >
                »
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
