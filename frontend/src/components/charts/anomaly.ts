/** Anomaly markers for line charts: ▲ spike / ▼ drop (shape + colour), with a tooltip showing the triggering values. */
import type { Anomaly } from '@/api/types';
import { formatPct } from '@/lib/format';
import type { useChartTheme } from './EChart';
import { tip } from './tip';

type T = ReturnType<typeof useChartTheme>;

export function anomalyMarkPoint(t: T, anomalies: Anomaly[], yFor: (a: Anomaly) => number | null, source: string | undefined) {
  const data = anomalies.flatMap((a) => {
    const y = yFor(a);
    if (y == null) return [];
    return [{
      name: `${a.state_code} ${a.year}`, coord: [String(a.year), y], symbol: 'triangle', symbolSize: 15, symbolRotate: a.kind === 'drop' ? 180 : 0,
      itemStyle: { color: a.kind === 'spike' ? t.saffron : t.indigo, borderColor: t.ink, borderWidth: 1.2 }, anomaly: a,
    }];
  });
  return {
    data, animation: false,
    tooltip: {
      trigger: 'item',
      formatter: (p: { data?: { anomaly?: Anomaly } }) => {
        const a = p.data?.anomaly;
        if (!a) return '';
        return tip(t, {
          title: `${a.state_name} ${a.year}: unusual ${a.kind}`, synthetic: a.is_synthetic, source,
          note: `${a.kind === 'spike' ? 'Grew' : 'Grew less'} than peers that year. z-score ${a.z_score > 0 ? '+' : ''}${a.z_score}.`,
          rows: [['Visits', a.value_display], ['Previous year', a.previous_display], ['Change', a.growth_display], ['Peer median change', formatPct(a.peer_median_growth_pct, true)], ['Gap to peers', `${a.deviation_pp > 0 ? '+' : ''}${a.deviation_pp} pp`]],
        });
      },
    },
  };
}

/** One-line, accessible description of flagged points (shape and text, not colour alone). */
export function anomalyList(anomalies: Anomaly[]): string {
  return anomalies.map((a) => `${a.kind === 'spike' ? '▲' : '▼'} ${a.state_code} ${a.year}`).join(', ');
}
export const anomalyLegend = '▲ unusually strong year, ▼ unusually weak year, compared with peer states (z-score of at least 2)';
