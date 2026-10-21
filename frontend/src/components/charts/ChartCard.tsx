import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { toPng } from 'html-to-image';
import type { Query } from '@/api/client';
import { ExportMenu, type CsvRows } from './ExportMenu';
import type { ChartHandle } from './EChart';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

/** Card chrome shared by every chart: title, controls, export menu, table fallback toggle. */
export function ChartCard({ title, subtitle, view, params, csv, chart, synthetic = true, controls, table, children, footer, className = '', bodyClass = '' }: {
  title: string; subtitle?: string; view?: string; params?: Query; csv?: CsvRows; chart?: RefObject<ChartHandle>; synthetic?: boolean;
  controls?: ReactNode; table?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string; bodyClass?: string;
}) {
  const card = useRef<HTMLElement>(null);
  const [asTable, setAsTable] = useState(false);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const onPng = async () => {
    const url = chart?.current?.dataUrl();
    if (url) return download(url, `${slug}.png`);
    if (card.current) download(await toPng(card.current, { pixelRatio: 2, cacheBust: true }), `${slug}.png`);
  };
  return (
    <section ref={card} className={`card flex flex-col ${className}`} aria-label={title}>
      <header className="flex items-start gap-3 px-4 pb-1 pt-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">{title}<SyntheticBadge show={synthetic} compact /></h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {controls}
        {table && (
          <button type="button" className="btn !py-1 text-xs" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            {asTable ? 'Chart' : 'Table'}
          </button>
        )}
        <ExportMenu view={view} params={params} onPng={onPng} csv={csv} />
      </header>
      <div className={`min-h-0 flex-1 px-3 pb-3 ${bodyClass}`}>{asTable && table ? table : children}</div>
      {footer && <footer className="border-t border-line/60 px-4 py-2 text-xs text-muted">{footer}</footer>}
    </section>
  );
}
