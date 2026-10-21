import { useMemo } from 'react';
import { useGeo } from '@/api/hooks';
import { useStatePaths } from '@/components/common/IndiaSilhouette';
import { Skeleton } from '@/components/common/States';
import { NEUTRAL, classIndex, quantileBreaks, seqColour } from '@/lib/colour';
import { useUi } from '@/store/ui';
import { useSharedHover } from '@/ui/interactions/useSharedHover';
import { formatCell, labelOf, type Row } from './analyse';

function Region({ code, name, d, fill, value }: { code: string; name: string; d: string; fill: string; value: string | null }) {
  const { highlighted, bind } = useSharedHover(code);
  return (
    <path d={d} fill={fill} stroke="rgb(var(--bg))" strokeWidth={highlighted ? 3 : 1} {...bind} tabIndex={value != null ? 0 : -1} role="img" aria-label={`${name}: ${value ?? 'no value'}`}
      style={{ filter: highlighted ? 'drop-shadow(0 0 6px rgb(var(--saffron)))' : undefined, transition: 'stroke-width 200ms var(--ease)', outline: 'none' }}>
      <title>{name}{value ? `: ${value}` : ''}</title>
    </path>
  );
}

/** Choropleth for ask results: one value per state_code. SVG from the API geometry, quantile colours, values listed beside it. */
export function MiniMap({ rows, code, value }: { rows: Row[]; code: string; value: string }) {
  const geo = useGeo();
  const paths = useStatePaths(geo.data);
  const theme = useUi((s) => s.theme);
  const by = useMemo(() => new Map(rows.map((r) => [String(r[code]), r[value] as number | null])), [rows, code, value]);
  const vals = [...by.values()].filter((v): v is number => typeof v === 'number');
  const breaks = quantileBreaks(vals, 5);
  const ranked = [...rows].filter((r) => typeof r[value] === 'number').sort((a, b) => (b[value] as number) - (a[value] as number));
  if (geo.isLoading || !paths) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="grid grid-cols-5 gap-4">
      <svg viewBox={`0 0 ${paths.width} ${paths.height}`} className="col-span-3 max-h-[340px] w-full" role="group" aria-label={`Map of ${labelOf(value)} by state`}>
        {paths.states.map((s) => {
          const v = by.get(s.code);
          const fill = typeof v === 'number' ? seqColour(theme, classIndex(v, breaks), 5) : NEUTRAL[theme];
          return <Region key={s.code} code={s.code} name={s.name} d={s.d} fill={fill} value={typeof v === 'number' ? formatCell(value, v) : null} />;
        })}
      </svg>
      <div className="col-span-2">
        <p className="label mb-1">{labelOf(value)}, highest first</p>
        <ol className="max-h-[300px] space-y-0.5 overflow-auto pr-1 text-sm">
          {ranked.map((r, i) => <li key={String(r[code])} className="flex justify-between gap-2"><span><span className="num mr-1.5 text-faint">{i + 1}</span>{String(r.state_name ?? r[code])}</span><span className="num text-muted">{formatCell(value, r[value])}</span></li>)}
        </ol>
        <p className="mt-2 text-[11px] text-faint">Darker = higher (quantile scale). States without a value are grey.</p>
      </div>
    </div>
  );
}
