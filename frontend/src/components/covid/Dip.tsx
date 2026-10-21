import { useMemo, useRef } from 'react';
import { useTrend } from '@/api/hooks';
import type { TrendResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { crosshair } from '@/components/charts/fx';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { escapeHtml, formatCount, formatPct, shortSource } from '@/lib/format';

/** National visits indexed to the pre-COVID year (= 100) so the fall and the climb back are visible at once. */
function Chart({ resp, chartRef }: { resp: TrendResponse; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const { series, annotations } = resp.data;
  const ann = annotations.find((a) => a.type === 'covid');
  const base = series.find((s) => s.year === ann?.baseline_year);
  const src = shortSource(resp.meta.data_sources[0]);
  const option = useMemo(() => {
    const idx = (pick: (s: (typeof series)[number]) => number | null | undefined, b: number | null | undefined) =>
      series.map((s) => { const v = pick(s); return v != null && b ? Math.round((v / b) * 1000) / 10 : null; });
    const total = idx((s) => s.total_visits, base?.total_visits);
    const dom = idx((s) => s.domestic_visits, base?.domestic_visits);
    const fgn = idx((s) => s.foreign_visits, base?.foreign_visits);
    return {
      grid: { left: 52, right: 24, top: 40, bottom: 28 },
      legend: { top: 0, textStyle: { color: t.muted }, icon: 'roundRect' },
      tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: crosshair(t), formatter: (p: unknown) => {
        const i = (p as { dataIndex: number }[])[0].dataIndex;
        const row = (name: string, v: number | null, color: string) => `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:${color}">${name}</span><b class="num">${v == null ? 'n/a' : v.toFixed(1)}</b></div>`;
        return `<div style="min-width:200px"><div style="font-weight:600;margin-bottom:4px">${series[i].year} <span style="color:${t.muted};font-weight:400">(${ann?.baseline_year} = 100)</span></div>${row('All visitors', total[i], t.ink)}${row('Domestic', dom[i], t.teal)}${row('Foreign', fgn[i], t.saffron)}<div style="margin-top:4px;font-size:10.5px;color:${t.faint}">Source: ${escapeHtml(src)}</div></div>`;
      } },
      xAxis: { type: 'category', data: series.map((s) => String(s.year)), boundaryGap: false, axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.muted }, axisTick: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted } },
      series: [
        { name: 'All visitors', type: 'line', data: total, lineStyle: { width: 3, color: t.ink }, itemStyle: { color: t.ink }, symbolSize: 6,
          markLine: { silent: true, symbol: 'none', lineStyle: { color: t.muted, type: 'dashed' }, label: { formatter: `${ann?.baseline_year} level`, color: t.muted, fontSize: 10, position: 'insideStartTop' }, data: [{ yAxis: 100 }] },
          markArea: ann ? { silent: true, itemStyle: { color: t.theme === 'dark' ? 'rgba(255,153,51,.13)' : 'rgba(168,76,0,.12)' }, label: { show: true, position: 'insideTop', color: t.saffron, fontWeight: 600, fontSize: 11 }, data: [[{ xAxis: String(ann.year_from), name: ann.label }, { xAxis: String(ann.year_to) }]] } : undefined },
        { name: 'Domestic', type: 'line', data: dom, lineStyle: { width: 2, color: t.teal }, itemStyle: { color: t.teal }, symbolSize: 5 },
        { name: 'Foreign', type: 'line', data: fgn, lineStyle: { width: 2, color: t.saffron }, itemStyle: { color: t.saffron }, symbolSize: 5 },
      ],
    };
  }, [series, ann, base, src, t]);
  return <EChart ref={chartRef} option={option} height={300} ariaLabel={`Line chart of national visits indexed to ${ann?.baseline_year ?? 'the baseline year'} for all, domestic and foreign visitors`} />;
}

export function Dip() {
  const q = useTrend();
  const chart = useRef<ChartHandle>(null);
  const ann = q.data?.data.annotations.find((a) => a.type === 'covid');
  return (
    <ChartCard title="The dip and the climb back" subtitle={`National visits indexed to ${ann?.baseline_year ?? '2019'} = 100, all years in the dataset`} chart={chart} view="trend" params={q.params}
      table={q.data && <DataTable caption="National annual visits" rows={q.data.data.series} rowCode={() => null} columns={[
        { key: 'y', label: 'Year', render: (r) => r.year }, { key: 'd', label: 'Domestic', align: 'right', render: (r) => formatCount(r.domestic_visits) },
        { key: 'f', label: 'Foreign', align: 'right', render: (r) => formatCount(r.foreign_visits) }, { key: 'g', label: 'YoY', align: 'right', render: (r) => formatPct(r.yoy_total_pct, true) ?? 'n/a' }]} />}
      footer={ann?.description}>
      <QueryBoundary query={q} skeleton={<Skeleton className="h-[300px] w-full" />} isEmpty={(r) => r.data.series.length === 0} emptyHint="No yearly data.">{(r) => <Chart resp={r} chartRef={chart} />}</QueryBoundary>
    </ChartCard>
  );
}
