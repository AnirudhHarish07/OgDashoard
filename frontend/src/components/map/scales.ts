import type { MapState } from '@/api/types';
import { classIndex, divColour, hexToRgb, NEUTRAL, NO_DATA, quantileBreaks, SEQ_CLASSES, seqColour, top10Colour, type RGB, type Theme } from '@/lib/colour';
import { formatMetric } from '@/lib/format';

export type ColourMode = 'choropleth' | 'top10';
export interface StateVis { fill: RGB; h: number }

export interface Legend {
  kind: 'classes' | 'diverging' | 'top10';
  swatches: { colour: string; label: string }[];
  note: string;
}

/** Per-state fill colour and extrusion height from the API rows. Missing rows get the "no data" colour. */
export function computeVis(rows: MapState[], codes: string[], o: { metric: string; mode: ColourMode; theme: Theme }): Map<string, StateVis> {
  const byCode = new Map(rows.map((r) => [r.state_code, r]));
  const vals = rows.map((r) => r.value).filter((v): v is number => v != null);
  const breaks = quantileBreaks(vals);
  const maxAbs = vals.length ? Math.max(...vals.map(Math.abs)) : 0;
  const out = new Map<string, StateVis>();
  for (const code of codes) {
    const r = byCode.get(code);
    let hex: string;
    if (!r || r.value == null) hex = NO_DATA[o.theme];
    else if (o.mode === 'top10') hex = r.is_top10 && r.color_bucket != null ? top10Colour(o.theme, r.color_bucket) : NEUTRAL[o.theme];
    else if (o.metric === 'growth_pct') hex = divColour(o.theme, r.value, maxAbs);
    else hex = seqColour(o.theme, classIndex(r.value, breaks));
    out.set(code, { fill: hexToRgb(hex), h: r?.height ?? 0 });
  }
  return out;
}

export function buildLegend(rows: MapState[], o: { metric: string; mode: ColourMode; theme: Theme }): Legend {
  if (o.mode === 'top10') {
    return {
      kind: 'top10', note: 'Top 10 states by rank. Every other state is neutral.',
      swatches: [...Array.from({ length: 10 }, (_, i) => ({ colour: top10Colour(o.theme, i + 1), label: String(i + 1) })), { colour: NEUTRAL[o.theme], label: 'Other' }],
    };
  }
  const vals = rows.map((r) => r.value).filter((v): v is number => v != null);
  if (!vals.length) return { kind: 'classes', swatches: [], note: 'No values for this selection.' };
  if (o.metric === 'growth_pct') {
    const m = Math.max(...vals.map(Math.abs));
    return {
      kind: 'diverging', note: 'Diverging scale centred on 0%.',
      swatches: [-1, -0.5, 0, 0.5, 1].map((t) => ({ colour: divColour(o.theme, t * m, m), label: formatMetric('growth_pct', t * m) ?? '' })),
    };
  }
  const breaks = quantileBreaks(vals);
  const lows = [Math.min(...vals), ...breaks];
  return {
    kind: 'classes', note: `Quantile scale: ${SEQ_CLASSES} classes with equal numbers of states.`,
    swatches: lows.map((v, i) => ({ colour: seqColour(o.theme, i), label: `${formatMetric(o.metric, v)}${i === lows.length - 1 ? '+' : ''}` })),
  };
}
