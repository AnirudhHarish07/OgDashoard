import type { Legend } from './scales';

export function MapLegend({ legend, title, unit }: { legend: Legend; title: string; unit: string }) {
  if (!legend.swatches.length) return null;
  const top = legend.kind === 'top10';
  return (
    <div className="card pointer-events-auto px-3 py-2.5" aria-label={`Legend: ${title}`}>
      <p className="label mb-1.5">{title} <span className="normal-case tracking-normal text-faint">· {unit}</span></p>
      <div className="flex gap-0.5">
        {legend.swatches.map((s, i) => (
          <div key={i} className="flex flex-col items-stretch" style={{ width: top ? 22 : 60 }}>
            <span className="h-2.5 rounded-sm" style={{ background: s.colour }} />
            <span className="num mt-1 truncate text-center text-[10px] text-muted" title={s.label}>{s.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 max-w-[22rem] text-[10px] text-faint">{legend.note}</p>
    </div>
  );
}
