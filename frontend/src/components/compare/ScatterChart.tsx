import { useMemo, useRef } from 'react';
import { useScatter } from '@/api/hooks';
import type { ScatterResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { scatterFx } from '@/components/charts/fx';
import { tip } from '@/components/charts/tip';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { REGION_LIST, regionColour } from '@/lib/colour';
import { formatCount, formatRupees } from '@/lib/format';
import { ceilTo, floorTo, niceLogMax, niceLogMin } from '@/lib/scale';

function Chart({ resp, chartRef }: { resp: ScatterResponse; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const { points, medians, year } = resp.data;
  const src = resp.meta.data_sources[0];
  const codes = useMemo(() => points.map((p) => p.state_code), [points]);
  const mx = medians.visits ?? 0, my = medians.revenue_per_tourist ?? 0;
  const crowdedCheap = points.filter((p) => p.visits > mx && p.revenue_per_tourist < my);
  const xs = points.map((p) => p.visits), ys = points.map((p) => p.revenue_per_tourist);
  const xMin = niceLogMin(Math.min(...xs)), xMax = niceLogMax(Math.max(...xs)), yMin = floorTo(Math.min(...ys) * 0.9, 500), yMax = ceilTo(Math.max(...ys) * 1.05, 1000);
  const option = useMemo(() => ({
    grid: { left: 78, right: 28, top: 20, bottom: 52 },
    aria: { enabled: true, label: { description: `Scatter of visits against revenue per tourist for ${points.length} states in ${year}; bubble size is hotel rooms.` } },
    tooltip: { ...tooltipBase(t), trigger: 'item', formatter: (p: { dataIndex: number }) => {
      const d = points[p.dataIndex];
      return tip(t, { title: d.state_name, synthetic: d.is_synthetic, source: src, note: d.region, rows: [['Visits', d.visits_display], ['Revenue per tourist', d.revenue_per_tourist_display], ['Hotel rooms', d.hotel_rooms_display]] });
    } },
    xAxis: { type: 'log', min: xMin, max: xMax, name: 'Visits (log scale)', nameLocation: 'middle', nameGap: 32, nameTextStyle: { color: t.muted }, splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => formatCount(v) ?? '' } },
    yAxis: { type: 'value', min: yMin, max: yMax, name: 'Revenue per tourist', nameTextStyle: { color: t.muted, align: 'left' }, splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => formatRupees(v) ?? '' } },
    series: [{
      type: 'scatter', cursor: 'pointer',
      data: points.map((p) => ({ value: [p.visits, p.revenue_per_tourist, p.bubble_size ?? 0], itemStyle: { color: regionColour(t.theme, p.region), opacity: 0.82, borderColor: t.bg, borderWidth: 1 } })),
      symbolSize: (v: number[]) => 9 + Math.sqrt(v[2] ?? 0) * 34,
      label: { show: true, position: 'right', color: t.muted, fontSize: 10, formatter: (p: { dataIndex: number }) => points[p.dataIndex].state_code },
      ...scatterFx(t),
      markLine: { silent: true, symbol: 'none', lineStyle: { color: t.faint, type: 'dashed', width: 1 }, label: { color: t.faint, fontSize: 10, backgroundColor: t.surface, padding: [1, 4] },
        data: [{ xAxis: mx, label: { formatter: 'median visits', position: 'insideEndTop' } }, { yAxis: my, label: { formatter: 'median revenue / tourist', position: 'insideEndTop' } }] },
      markArea: { silent: true, itemStyle: { color: t.theme === 'dark' ? 'rgba(255,153,51,.10)' : 'rgba(194,90,5,.09)' },
        label: { show: true, position: 'insideBottomRight', color: t.saffron, fontWeight: 600, fontSize: 11, formatter: 'High crowds, low spending', backgroundColor: t.surface, padding: [3, 7], borderRadius: 4, borderColor: t.saffron, borderWidth: 1 },
        data: [[{ xAxis: mx, yAxis: yMin }, { xAxis: xMax, yAxis: my }]] },
    }],
  }), [points, mx, my, xMin, xMax, yMin, yMax, year, src, t]);
  return (
    <>
      <EChart ref={chartRef} option={option} height={470} hoverCodes={codes} ariaLabel="Bubble chart: visits against revenue per tourist, bubble size is hotel rooms" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pt-1 text-[11px] text-muted">
        {REGION_LIST.filter((r) => points.some((p) => p.region === r)).map((r) => <span key={r} className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: regionColour(t.theme, r) }} />{r}</span>)}
        <span className="ml-auto text-faint">Bubble size = hotel rooms</span>
      </div>
      <p className="px-2 pt-1 text-xs text-ink" role="status"><span className="font-medium text-saffron">High crowds, low spending:</span> {crowdedCheap.length} state{crowdedCheap.length === 1 ? '' : 's'} above median visits and below median revenue per tourist{crowdedCheap.length ? ` (${crowdedCheap.map((p) => p.state_name).join(', ')})` : ''}.</p>
    </>
  );
}

export function ScatterChart() {
  const q = useScatter();
  const chart = useRef<ChartHandle>(null);
  const d = q.data?.data;
  return (
    <ChartCard
      title="Crowds vs spending" subtitle={d ? `${d.year}: visits against revenue per tourist, bubble size = hotel rooms` : undefined} chart={chart} view="scatter" params={q.params}
      table={d && <DataTable caption="Visits, revenue per tourist and hotel rooms by state" maxHeight={420} rows={d.points} rowCode={(r) => r.state_code} columns={[
        { key: 's', label: 'State', render: (r) => r.state_name }, { key: 'v', label: 'Visits', align: 'right', render: (r) => r.visits_display },
        { key: 'r', label: 'Revenue / tourist', align: 'right', render: (r) => r.revenue_per_tourist_display }, { key: 'h', label: 'Hotel rooms', align: 'right', render: (r) => r.hotel_rooms_display ?? 'n/a' }]} />}
    >
      <QueryBoundary query={q} skeleton={<Skeleton className="h-[470px] w-full" />} isEmpty={(r) => r.data.points.length === 0} emptyHint="No states match the current filters.">
        {(r) => <Chart resp={r} chartRef={chart} />}
      </QueryBoundary>
    </ChartCard>
  );
}
