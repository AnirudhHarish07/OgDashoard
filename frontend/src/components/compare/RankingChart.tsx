import { useMemo, useRef, useState } from 'react';
import { useRankings } from '@/api/hooks';
import type { RankingResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { barFx } from '@/components/charts/fx';
import { tip } from '@/components/charts/tip';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { Segmented, Select } from '@/components/filters/controls';
import { formatMetric } from '@/lib/format';
import { RANK_METRICS } from '@/lib/metrics';
import { top10Colour } from '@/lib/colour';
import { useFilters } from '@/store/filters';

function Chart({ resp, order, chartRef }: { resp: RankingResponse; order: 'top' | 'bottom'; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const toggleState = useFilters((s) => s.toggleState);
  const { items, metric, label, year } = resp.data;
  const src = resp.meta.data_sources[0];
  const codes = useMemo(() => items.map((i) => i.state_code), [items]);
  const option = useMemo(() => ({
    grid: { left: 150, right: 90, top: 8, bottom: 24 },
    aria: { enabled: true, label: { description: `${order === 'top' ? 'Top' : 'Bottom'} ${items.length} states by ${label}, ${year}` } },
    tooltip: {
      ...tooltipBase(t), trigger: 'item',
      formatter: (p: { dataIndex: number }) => {
        const i = items[p.dataIndex];
        return tip(t, { title: `#${i.rank} ${i.state_name}`, synthetic: i.is_synthetic, source: src, rows: [[label, i.display], ['Share of scope', i.share_pct != null ? `${i.share_pct}%` : null], ['YoY', i.yoy_display], ['National rank', `#${i.national_rank ?? 'n/a'}`]] });
      },
    },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => formatMetric(metric, v) ?? '' } },
    yAxis: { type: 'category', inverse: true, data: items.map((i) => `#${i.rank}  ${i.state_name}`), axisTick: { show: false }, axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.ink, fontSize: 12 } },
    series: [{
      type: 'bar', barWidth: '62%', cursor: 'pointer',
      data: items.map((i) => ({ value: i.value, itemStyle: { color: order === 'top' ? top10Colour(t.theme, Math.min(i.rank, 10)) : t.indigo, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: t.ink, fontSize: 11, formatter: (p: { dataIndex: number }) => items[p.dataIndex].display ?? '' },
      ...barFx(t),
    }],
  }), [items, metric, label, year, order, src, t]);
  return <EChart ref={chartRef} option={option} height={Math.max(300, items.length * 34 + 40)} hoverCodes={codes}
    onEvents={{ click: (p) => { const i = (p as { dataIndex?: number }).dataIndex; if (i != null) toggleState(codes[i] as string); } }}
    ariaLabel={`Bar chart of ${label} for ${items.length} states. Click a bar to add the state to the comparison.`} />;
}

export function RankingChart() {
  const [metric, setMetric] = useState('total_visits');
  const [order, setOrder] = useState<'top' | 'bottom'>('top');
  const q = useRankings(metric, order, 10);
  const chart = useRef<ChartHandle>(null);
  const d = q.data?.data;
  return (
    <ChartCard
      title={`${order === 'top' ? 'Top' : 'Bottom'} 10 states`} subtitle={d ? `${d.label}, ${d.year}. Click a bar to add it to the comparison below.` : undefined}
      chart={chart} view="rankings" params={q.params}
      controls={<div className="flex items-end gap-2"><Select label="" allLabel="" value={metric} onChange={(v) => v && setMetric(v)} options={RANK_METRICS.map((m) => ({ value: m.value, label: m.label }))} />
        <Segmented label="" value={order} onChange={setOrder} options={[{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }]} /></div>}
      table={d && <DataTable caption="Ranking" rows={d.items} rowCode={(r) => r.state_code} columns={[
        { key: 'r', label: 'Rank', render: (r) => r.rank }, { key: 's', label: 'State', render: (r) => r.state_name },
        { key: 'v', label: d.label, align: 'right', render: (r) => r.display }, { key: 'sh', label: 'Share', align: 'right', render: (r) => (r.share_pct != null ? `${r.share_pct}%` : 'n/a') },
        { key: 'y', label: 'YoY', align: 'right', render: (r) => r.yoy_display ?? 'n/a' }]} />}
    >
      <QueryBoundary query={q} skeleton={<Skeleton className="h-[380px] w-full" />} isEmpty={(r) => r.data.items.length === 0} emptyHint="No states match the current filters.">
        {(r) => <Chart resp={r} order={order} chartRef={chart} />}
      </QueryBoundary>
    </ChartCard>
  );
}
