import type { ReactNode } from 'react';
import { useUi } from '@/store/ui';

export interface Column<T> { key: string; label: string; align?: 'left' | 'right'; render: (row: T) => ReactNode }

/** Accessible table fallback for every chart. Rows with a `code` cross-highlight the state everywhere. */
export function DataTable<T>({ columns, rows, caption, rowCode, maxHeight = 320 }: {
  columns: Column<T>[]; rows: T[]; caption: string; rowCode?: (row: T) => string | null; maxHeight?: number;
}) {
  const hovered = useUi((s) => s.hovered);
  const setHovered = useUi((s) => s.setHovered);
  return (
    <div className="overflow-auto rounded-lg border border-line/70" style={{ maxHeight }}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-raised text-left text-[11px] uppercase tracking-wider text-faint">
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={`px-3 py-2 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const code = rowCode?.(r) ?? null;
            const on = code != null && hovered === code;
            return (
              <tr
                key={i}
                onMouseEnter={code ? () => setHovered(code) : undefined}
                onMouseLeave={code ? () => setHovered(null) : undefined}
                className={`border-t border-line/50 transition-all duration-hover ${on ? '-translate-y-px bg-teal/10' : ''}`}
              >
                {columns.map((c) => <td key={c.key} className={`num px-3 py-1.5 ${c.align === 'right' ? 'text-right' : ''}`}>{c.render(r)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
