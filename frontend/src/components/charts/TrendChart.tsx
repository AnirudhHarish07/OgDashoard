import { useMemo, useRef, useState } from 'react';
import { useTrend } from '@/api/hooks';
import { ChartCard } from './ChartCard';
import { DataTable } from './DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from './EChart';
import { crosshair } from './fx';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { syntheticBadgeHtml } from '@/components/common/SyntheticBadge';
import { escapeHtml, formatCount, formatCrore, formatPct, shortSource } from '@/lib/format';
import { Segmented } from '@/components/filters/controls';
import type { TrendResponse } from '@/api/types';

type Metric = 'visits' | 'revenue';

function Chart({ resp, metric, chartRef }: { resp: TrendResponse; metric: Metric; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const { series, annotations } = resp.data;
  const src = shortSource(resp.meta.data_sources[0]);
  const option = useMemo(() => {
    const years = series.map((s) => String(s.year));
    const values = series.map((s) => ({
      value: metric === 'visits' ? s.total_visits : s.revenue_cr,
      display: metric === 'visits' ? s.total_display : s.revenue_display,
      yoy: s.yoy_total_pct, syn: s.is_synthetic,
    }));
    const ann = annotations.find((a) => a.type === 'covid');
    return {
      grid: { left: 64, right: 24, top: 28, bottom: 28 },
      aria: { enabled: true, label: { description: 'Annual national tourism trend with the 2020 to 2021 COVID dip highlighted.' } },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis',
        axisPointer: crosshair(t),
        formatter: (p: unknown) => {
          const a = (p as { dataIndex: number }[])[0];
          const s = series[a.dataIndex];
          const v = values[a.dataIndex];
          return `<div style="min-width:190px"><div style="font-weight:600;margin-bottom:4px">${s.year}${v.syn ? syntheticBadgeHtml : ''}</div>
            <div style="display:flex;justify-content:space-between;gap:16px"><span style="color:${t.muted}">${metric === 'visits' ? 'Total visits' : 'Revenue'}</span><b class="num">${escapeHtml(v.display ?? '')}</b></div>
            <div style="display:flex;justify-content:space-between;gap:16px"><span style="color:${t.muted}">YoY</span><b>${s.yoy_total_pct == null ? 'n/a' : escapeHtml(formatPct(s.yoy_total_pct, true) ?? '')}</b></div>
            <div style="margin-top:4px;font-size:10.5px;color:${t.faint}">Source: ${escapeHtml(src)}</div></div>`;
        },
      },
      xAxis: { type: 'category', data: years, boundaryGap: false, axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.muted }, axisTick: { show: false } },
      yAxis: {
        type: 'value', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => (metric === 'visits' ? formatCount(v) : formatCrore(v)) ?? '' },
      },
      series: [{
        type: 'line', data: values, smooth: 0.25, symbolSize: 7, showSymbol: true, lineStyle: { width: 3, color: t.teal }, itemStyle: { color: t.teal },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: t.theme === 'dark' ? 'rgba(45,212,191,.32)' : 'rgba(13,125,116,.28)' }, { offset: 1, color: 'rgba(45,212,191,0)' }] } },
        emphasis: { focus: 'series', itemStyle: { shadowBlur: 14, shadowColor: t.teal } },
        markArea: ann ? {
          silent: true, itemStyle: { color: t.theme === 'dark' ? 'rgba(255,153,51,.13)' : 'rgba(194,90,5,.12)' },
          label: { show: true, position: 'insideTop', color: t.saffron, fontWeight: 600, fontSize: 11 },
          data: [[{ xAxis: String(ann.year_from), name: ann.label }, { xAxis: String(ann.year_to) }]],
        } : undefined,
      }],
    };
  }, [series, annotations, metric, src, t]);
  return <EChart ref={chartRef} option={option} height={300} ariaLabel={`Line chart of national ${metric === 'visits' ? 'total visits' : 'tourism revenue'} by year`} />;
}

export function TrendChart() {
  const q = useTrend();
  const [metric, setMetric] = useState<Metric>('visits');
  const chart = useRef<ChartHandle>(null);
  const ann = q.data?.data.annotations.find((a) => a.type === 'covid');
  return (
    <ChartCard
      title="National trend" subtitle="All years in the dataset, with the 2020–21 COVID dip" chart={chart} view="trend" params={q.params}
      controls={<div><Segmented label="" value={metric} onChange={setMetric} options={[{ value: 'visits', label: 'Visits' }, { value: 'revenue', label: 'Revenue' }]} /></div>}
      table={q.data && (
        <DataTable caption="National annual trend" rows={q.data.data.series} rowCode={() => null} columns={[
          { key: 'y', label: 'Year', render: (r) => r.year },
          { key: 'd', label: 'Domestic', align: 'right', render: (r) => formatCount(r.domestic_visits) },
          { key: 'f', label: 'Foreign', align: 'right', render: (r) => formatCount(r.foreign_visits) },
          { key: 'r', label: 'Revenue', align: 'right', render: (r) => r.revenue_display },
          { key: 'g', label: 'YoY', align: 'right', render: (r) => formatPct(r.yoy_total_pct, true) ?? 'n/a' },
        ]} />
      )}
      footer={ann?.description}
    >
      <QueryBoundary query={q} skeleton={<Skeleton className="h-[300px] w-full" />} isEmpty={(d) => d.data.series.length === 0}>
        {(resp) => <Chart resp={resp} metric={metric} chartRef={chart} />}
      </QueryBoundary>
    </ChartCard>
  );
}
