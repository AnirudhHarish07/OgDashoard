import type { ReactNode } from 'react';
import { useSharedHover } from '@/ui/interactions/useSharedHover';

export interface Column<T> { key: string; label: string; align?: 'left' | 'right'; render: (row: T) => ReactNode }

/** Accessible table fallback for every chart. Rows with a `code` cross-highlight the state everywhere. */
function Row<T>({ row, columns, code }: { row: T; columns: Column<T>[]; code: string | null }) {
  const { highlighted, bind } = useSharedHover(code);
  return (
    <tr {...(code ? bind : {})} data-highlighted={highlighted || undefined} className={`border-t border-line/50 transition-all duration-hover ${highlighted ? '-translate-y-px bg-teal/10 shadow-[0_6px_14px_-8px_rgb(var(--teal)/0.6)]' : ''}`}>
      {columns.map((c) => <td key={c.key} className={`num px-3 py-1.5 ${c.align === 'right' ? 'text-right' : ''}`}>{c.render(row)}</td>)}
    </tr>
  );
}

/** Accessible table fallback for every chart. Rows with a state code lift and cross-highlight that state everywhere. */
export function DataTable<T>({ columns, rows, caption, rowCode, maxHeight = 320 }: {
  columns: Column<T>[]; rows: T[]; caption: string; rowCode?: (row: T) => string | null; maxHeight?: number;
}) {
  return (
    <div className="overflow-auto rounded-lg border border-line/70" style={{ maxHeight }}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-raised text-left text-[11px] uppercase tracking-wider text-faint">
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={`px-3 py-2 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>{rows.map((r, i) => <Row key={i} row={r} columns={columns} code={rowCode?.(r) ?? null} />)}</tbody>
      </table>
    </div>
  );
}
