import { useEffect, useRef, useState } from 'react';
import { USE_MOCKS, exportUrl, type Query } from '@/api/client';
import { downloadText, toCsv } from '@/lib/csv';

/** Export menu: CSV via /api/export (with is_synthetic and data_source columns) and PNG of the chart. */
export interface CsvRows { rows: Record<string, unknown>[]; source?: string; name: string }

export function ExportMenu({ view, params, onPng, csv }: { view?: string; params?: Query; onPng?: () => void | Promise<void>; csv?: CsvRows }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const serverCsv = !!view && !USE_MOCKS;
  const clientCsv = !serverCsv && !!csv;
  const item = 'flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-line/40';
  return (
    <div ref={root} className="relative">
      <button type="button" className="btn !py-1 text-xs" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg aria-hidden width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" /></svg>
        Export
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 top-full z-50 mt-1 w-60 p-1.5">
          {serverCsv ? (
            <a role="menuitem" className={item} href={exportUrl(view as string, params ?? {})} download onClick={() => setOpen(false)}>CSV · includes is_synthetic, data_source</a>
          ) : clientCsv ? (
            <button role="menuitem" type="button" className={item} onClick={() => { downloadText(toCsv((csv as CsvRows).rows, (csv as CsvRows).source), `${(csv as CsvRows).name}.csv`); setOpen(false); }}>CSV · includes is_synthetic, data_source</button>
          ) : (
            <span role="menuitem" aria-disabled className={`${item} cursor-not-allowed text-faint`} title={USE_MOCKS ? 'CSV export needs the live backend' : undefined}>{USE_MOCKS ? 'CSV (needs live backend)' : 'CSV not available for this chart'}</span>
          )}
          {onPng && <button role="menuitem" type="button" className={item} onClick={() => { void onPng(); setOpen(false); }}>PNG image</button>}
        </div>
      )}
    </div>
  );
}
