import React from 'react';

export interface Column<T> {
  header: React.ReactNode;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  className?: string;
  emptyMessage?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  className = '',
  emptyMessage = 'No records found',
}: TableProps<T>) {
  return (
    <div className={`w-full overflow-x-auto rounded-[var(--radius-cards)] border border-[var(--border-subtle)] bg-[var(--bg-2)] ${className}`}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="h-11 border-b border-[var(--border-subtle)] bg-[var(--bg-1)]">
            {columns.map((col, idx) => (
              <th
                key={idx}
                className={`px-4 text-[12px] font-semibold tracking-wider uppercase text-[var(--text-secondary)] ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'
                } ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="h-28 text-center text-[var(--text-secondary)] text-[13px]"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr
                key={keyExtractor(item)}
                className="h-14 transition-colors hover:bg-[var(--bg-3)]/60 text-[13px] text-[var(--text-primary)]"
              >
                {columns.map((col, idx) => (
                  <td
                    key={idx}
                    className={`px-4 tabular-nums ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${col.className || ''}`}
                  >
                    {col.cell
                      ? col.cell(item)
                      : col.accessorKey
                      ? String(item[col.accessorKey] ?? '')
                      : null}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
