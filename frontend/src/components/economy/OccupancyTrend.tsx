import { useMemo, useRef } from 'react';
import { useOccupancy, useTrend } from '@/api/hooks';
import type { OccupancyResponse, TrendResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { tip } from '@/components/charts/tip';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { regionColour } from '@/lib/colour';

function Chart({ resp, trend, chartRef }: { resp: OccupancyResponse; trend: TrendResponse | undefined; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const { national, states } = resp.data;
  const src = resp.meta.data_sources[0];
  const years = national.map((n) => String(n.year));
  const ann = trend?.data.annotations.find((a) => a.type === 'covid');
  const codes = useMemo(() => [...states.map((s) => s.state_code), null], [states]);
  const option = useMemo(() => ({
    grid: { left: 52, right: 16, top: 16, bottom: 28 },
    aria: { enabled: true, label: { description: 'Hotel occupancy rate by year: one thin line per state and a bold national line weighted by hotel rooms' } },
    tooltip: { ...tooltipBase(t), trigger: 'item', formatter: (p: { seriesIndex: number; dataIndex: number }) => {
      if (p.seriesIndex >= states.length) { const n = national[p.dataIndex]; return tip(t, { title: `All states, ${n.year}`, synthetic: n.is_synthetic, source: src, note: 'Weighted by hotel rooms', rows: [['Occupancy', `${n.weighted_occupancy_rate}%`], ['Simple mean', `${n.mean_occupancy_rate}%`], ['States', String(n.n_states)]] }); }
      const s = states[p.seriesIndex]; const pt = s.points[p.dataIndex];
      return pt ? tip(t, { title: `${s.state_name}, ${pt.year}`, synthetic: pt.is_synthetic, source: src, rows: [['Occupancy', `${pt.occupancy_rate}%`]] }) : '';
    } },
    xAxis: { type: 'category', data: years, boundaryGap: false, axisLabel: { color: t.muted }, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false } },
    yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: '{value}%' } },
    series: [
      ...states.map((s) => ({ name: s.state_name, type: 'line', symbol: 'none', smooth: 0.15, lineStyle: { width: 1.2, opacity: 0.35, color: regionColour(t.theme, s.region) }, emphasis: { focus: 'series', lineStyle: { width: 3, opacity: 1 } }, blur: { lineStyle: { opacity: 0.08 } },
        data: years.map((y) => s.points.find((p) => String(p.year) === y)?.occupancy_rate ?? null) })),
      { name: 'All states (room-weighted)', type: 'line', symbolSize: 7, smooth: 0.15, z: 5, lineStyle: { width: 4, color: t.ink }, itemStyle: { color: t.ink }, emphasis: { focus: 'series' }, data: national.map((n) => n.weighted_occupancy_rate),
        markArea: ann ? { silent: true, itemStyle: { color: t.theme === 'dark' ? 'rgba(255,153,51,.12)' : 'rgba(194,90,5,.11)' }, label: { show: true, position: 'insideTop', color: t.saffron, fontWeight: 600, fontSize: 11 }, data: [[{ xAxis: String(ann.year_from), name: ann.label }, { xAxis: String(ann.year_to) }]] } : undefined },
    ],
  }), [states, national, years, ann, src, t]);
  return <EChart ref={chartRef} option={option} height={360} hoverCodes={codes} hoverBy="series" ariaLabel="Line chart of hotel occupancy by year, one line per state and a national line" />;
}

export function OccupancyTrend() {
  const q = useOccupancy();
  const tq = useTrend();
  const chart = useRef<ChartHandle>(null);
  const d = q.data?.data;
  return (
    <ChartCard title="Hotel occupancy over time" subtitle="Bold line: all states, weighted by hotel rooms. Thin lines: each state, coloured by region. Hover a state anywhere to highlight its line." chart={chart} view="occupancy_trend" params={q.params}
      table={d && <DataTable caption="Hotel occupancy by year" rows={d.national} columns={[{ key: 'y', label: 'Year', render: (r) => r.year }, { key: 'w', label: 'Weighted', align: 'right', render: (r) => `${r.weighted_occupancy_rate}%` }, { key: 'm', label: 'Simple mean', align: 'right', render: (r) => `${r.mean_occupancy_rate}%` }, { key: 'n', label: 'States', align: 'right', render: (r) => r.n_states }]} />}>
      <QueryBoundary query={q} skeleton={<Skeleton className="h-[360px] w-full" />} isEmpty={(r) => r.data.national.length === 0} emptyHint="No occupancy data for the current filters.">{(r) => <Chart resp={r} trend={tq.data} chartRef={chart} />}</QueryBoundary>
    </ChartCard>
  );
}
