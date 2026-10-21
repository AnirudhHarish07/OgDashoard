import { useEffect, useMemo, useRef, useState } from 'react';
import { useHeatmap } from '@/api/hooks';
import type { HeatmapResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { heatmapFx } from '@/components/charts/fx';
import { tip } from '@/components/charts/tip';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { Segmented } from '@/components/filters/controls';
import { ramp, rgbToHex } from '@/lib/colour';
import { useUi } from '@/store/ui';

type Sort = 'peak' | 'name';
type Scale = 'shape' | 'volume';

function Chart({ resp, sort, scale, chartRef }: { resp: HeatmapResponse; sort: Sort; scale: Scale; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const hovered = useUi((s) => s.hovered);
  const [cell, setCell] = useState<{ x: number; y: number } | null>(null);
  const { rows: raw, month_names, year } = resp.data;
  const src = resp.meta.data_sources[0];
  const rows = useMemo(() => [...raw].sort((a, b) => (sort === 'peak' ? a.peak_month - b.peak_month || a.state_name.localeCompare(b.state_name) : a.state_name.localeCompare(b.state_name))), [raw, sort]);
  const cells = useMemo(() => rows.flatMap((r, ri) => r.cells.map((c) => ({ r, ri, c }))), [rows]);
  const codes = useMemo(() => cells.map((x) => x.r.state_code), [cells]);
  const stops = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map((k) => rgbToHex(ramp(t.theme === 'dark' ? ['#101a2e', '#1d4d5a', '#2a8c8c', '#e8a33a', '#ffd9a3'] : ['#eef6f5', '#a9dcd3', '#4cb0a4', '#e39a2c', '#b9400d'], k))), [t.theme]);

  const option = useMemo(() => ({
    grid: { left: 150, right: 20, top: 36, bottom: 8 },
    aria: { enabled: true, label: { description: `Heatmap of monthly visits for ${rows.length} states in ${year}. Dots mark each state's peak month, rings its lowest month.` } },
    tooltip: { ...tooltipBase(t), trigger: 'item', formatter: (p: { dataIndex: number; seriesType: string; value: number[] }) => {
      if (p.seriesType !== 'heatmap') return '';
      const { r, c } = cells[p.dataIndex];
      return tip(t, { title: `${r.state_name}, ${month_names[c.month - 1]} ${year}`, synthetic: c.is_synthetic, source: src, note: `${c.month === r.peak_month ? 'Peak month. ' : c.month === r.low_month ? 'Lowest month. ' : ''}${r.region}`, rows: [['Visits', c.display], ['Share of the year', c.share_of_year_pct != null ? `${c.share_of_year_pct}%` : null], ['Peak to low ratio', r.peak_to_low_ratio != null ? `${r.peak_to_low_ratio}x` : null]] });
    } },
    xAxis: { type: 'category', position: 'top', data: month_names, splitArea: { show: false }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.muted } },
    yAxis: { type: 'category', inverse: true, data: rows.map((r) => r.state_name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.ink, fontSize: 11, interval: 0 } },
    visualMap: { show: false, min: 0, max: 1, dimension: 2, inRange: { color: stops } },
    series: [
      { id: 'heat', type: 'heatmap', cursor: 'pointer', data: cells.map(({ ri, c }) => [c.month - 1, ri, (scale === 'shape' ? c.intensity_row : c.intensity_global) ?? 0]),
        itemStyle: { borderColor: t.bg, borderWidth: 1.5, borderRadius: 3 }, ...heatmapFx(t), markArea: { silent: true, data: [] } },
      { id: 'peaks', type: 'scatter', symbol: 'circle', symbolSize: 7, silent: true, z: 6, itemStyle: { color: t.theme === 'dark' ? '#0b101d' : '#ffffff', borderColor: t.ink, borderWidth: 1.5 }, data: rows.map((r, ri) => [r.peak_month - 1, ri]) },
      { id: 'lows', type: 'scatter', symbol: 'circle', symbolSize: 7, silent: true, z: 6, itemStyle: { color: 'transparent', borderColor: t.ink, borderWidth: 1.5 }, data: rows.map((r, ri) => [r.low_month - 1, ri]) },
    ],
  }), [rows, cells, month_names, year, scale, src, stops, t]);

  // row + column highlight: from the hovered cell, or from a state hovered elsewhere (map, table, bars)
  useEffect(() => {
    const inst = chartRef.current?.instance();
    if (!inst) return;
    const rowIdx = cell ? cell.y : hovered ? rows.findIndex((r) => r.state_code === hovered) : -1;
    const band = t.theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
    const data: unknown[] = [];
    if (rowIdx >= 0) data.push([{ yAxis: rows[rowIdx].state_name }, { yAxis: rows[rowIdx].state_name }]);
    if (cell) data.push([{ xAxis: month_names[cell.x] }, { xAxis: month_names[cell.x] }]);
    inst.setOption({ series: [{ id: 'heat', markArea: { silent: true, itemStyle: { color: band, borderColor: t.ink, borderWidth: 1, borderType: 'dashed' }, data } }] });
  }, [cell, hovered, rows, month_names, t, chartRef, option]);

  return (
    <EChart ref={chartRef} option={option} height={rows.length * 18 + 52} hoverCodes={codes}
      onEvents={{ mouseover: (p) => { const v = (p as { seriesType?: string; value?: number[] }); if (v.seriesType === 'heatmap' && v.value) setCell({ x: v.value[0], y: v.value[1] }); }, globalout: () => setCell(null) }}
      ariaLabel={`Heatmap of monthly visits by state for ${year}`} />
  );
}

export function Heatmap() {
  const q = useHeatmap();
  const [sort, setSort] = useState<Sort>('peak');
  const [scale, setScale] = useState<Scale>('shape');
  const chart = useRef<ChartHandle>(null);
  const d = q.data?.data;
  return (
    <ChartCard
      title="When each state is busy" chart={chart} view="heatmap" params={q.params}
      subtitle={d ? `${d.year}. ${scale === 'shape' ? 'Colour compares each month with that state\'s own busiest month.' : 'Colour shows absolute visits across all states.'} ● peak month, ○ lowest month.` : undefined}
      controls={<div className="flex items-end gap-2"><Segmented label="" value={scale} onChange={setScale} options={[{ value: 'shape', label: 'Seasonal shape' }, { value: 'volume', label: 'Volume' }]} /><Segmented label="" value={sort} onChange={setSort} options={[{ value: 'peak', label: 'By peak month' }, { value: 'name', label: 'A to Z' }]} /></div>}
      table={d && <DataTable caption="Peak and lowest month per state" maxHeight={640} rows={d.rows} rowCode={(r) => r.state_code} columns={[
        { key: 's', label: 'State / UT', render: (r) => r.state_name }, { key: 'p', label: 'Peak', render: (r) => d.month_names[r.peak_month - 1] }, { key: 'l', label: 'Lowest', render: (r) => d.month_names[r.low_month - 1] },
        { key: 'x', label: 'Peak ÷ low', align: 'right', render: (r) => (r.peak_to_low_ratio != null ? `${r.peak_to_low_ratio}x` : 'n/a') }, { key: 't', label: 'Year total', align: 'right', render: (r) => r.year_total.toLocaleString('en-IN') }]} />}
    >
      <QueryBoundary query={q} skeleton={<Skeleton className="h-[700px] w-full" />} isEmpty={(r) => r.data.rows.length === 0} emptyHint="No monthly data for the current filters.">
        {(r) => <Chart resp={r} sort={sort} scale={scale} chartRef={chart} />}
      </QueryBoundary>
    </ChartCard>
  );
}
