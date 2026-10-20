import { useMemo, useRef, useState } from 'react';
import { useForecast } from '@/api/hooks';
import type { ForecastResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { crosshair } from '@/components/charts/fx';
import { tip } from '@/components/charts/tip';
import { EmptyState, QueryBoundary, Skeleton } from '@/components/common/States';
import { Segmented, Select } from '@/components/filters/controls';
import { formatCount, formatCrore } from '@/lib/format';

const METRICS = [
  { value: 'total_visits', label: 'Total visits' }, { value: 'domestic_visits', label: 'Domestic visits' },
  { value: 'foreign_visits', label: 'Foreign visits' }, { value: 'revenue', label: 'Tourism revenue' },
];
const FORECAST_PILL = '<span style="display:inline-block;margin-left:6px;padding:0 6px;border:1px solid #818cf8;border-radius:99px;font-size:9px;letter-spacing:.06em;color:#818cf8">FORECAST</span>';

function Chart({ resp, metric, chartRef }: { resp: ForecastResponse; metric: string; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const { history, forecast, model } = resp.data;
  const src = resp.meta.data_sources[0];
  const fmt = metric === 'revenue' ? formatCrore : formatCount;
  const option = useMemo(() => {
    const hy = history.map((h) => String(h.year));
    const fy = forecast.map((f) => String(f.year));
    const years = [...hy, ...fy];
    const lastIdx = history.length - 1;
    const anchor = history[lastIdx]?.value ?? null;
    const pad = (n: number) => Array.from({ length: n }, () => null as number | null);
    const excluded = history.filter((h) => !h.used_in_training);
    return {
      grid: { left: 70, right: 24, top: 34, bottom: 30 },
      legend: { top: 0, textStyle: { color: t.muted }, icon: 'roundRect', data: ['History', 'Forecast (model projection)', 'Confidence band'] },
      aria: { enabled: false },
      tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: crosshair(t), formatter: (ps: { dataIndex: number }[]) => {
        const i = ps[0].dataIndex;
        if (i < history.length) {
          const h = history[i];
          return tip(t, { title: String(h.year), synthetic: h.is_synthetic, source: src, note: h.used_in_training ? undefined : 'Excluded from training (COVID outlier)', rows: [[metric === 'revenue' ? 'Revenue' : 'Visits', h.display]] });
        }
        const f = forecast[i - history.length];
        return tip(t, { title: `${f.year}`, titleExtra: FORECAST_PILL, synthetic: f.is_synthetic, source: src, note: 'Forecast: a model projection, not data. The synthetic flag shows the training data is synthetic.', rows: [['Forecast', f.display], ['Lower bound', f.lower_display], ['Upper bound', f.upper_display]] });
      } },
      xAxis: { type: 'category', data: years, boundaryGap: false, axisLabel: { color: t.muted }, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => fmt(v) ?? '' } },
      series: [
        { name: 'History', type: 'line', symbolSize: 7, lineStyle: { width: 3, color: t.teal }, itemStyle: { color: t.teal }, z: 3,
          data: [...history.map((h) => ({ value: h.value, itemStyle: h.used_in_training ? undefined : { color: t.bg, borderColor: t.faint, borderWidth: 2 } })), ...pad(forecast.length)],
          markArea: excluded.length ? { silent: true, itemStyle: { color: t.theme === 'dark' ? 'rgba(148,163,184,.12)' : 'rgba(100,116,139,.12)' }, label: { show: true, position: 'insideTop', color: t.muted, fontSize: 10, formatter: 'Excluded from training' },
            data: [[{ xAxis: String(excluded[0].year) }, { xAxis: String(excluded[excluded.length - 1].year) }]] } : undefined },
        { name: 'Confidence band', type: 'line', stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false }, z: 1,
          data: [...pad(lastIdx), anchor, ...forecast.map((f) => f.lower)] },
        { name: 'Confidence band', type: 'line', stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false }, z: 1,
          areaStyle: { color: t.theme === 'dark' ? 'rgba(129,140,248,.28)' : 'rgba(67,56,202,.20)' },
          data: [...pad(lastIdx), 0, ...forecast.map((f) => f.upper - f.lower)] },
        { name: 'Forecast (model projection)', type: 'line', symbol: 'emptyCircle', symbolSize: 8, lineStyle: { width: 3, type: 'dashed', color: t.indigo }, itemStyle: { color: t.indigo }, z: 4,
          label: { show: true, color: t.indigo, fontSize: 10, position: 'top', formatter: (p: { dataIndex: number }) => (p.dataIndex > lastIdx ? 'forecast' : '') },
          data: [...pad(lastIdx), anchor, ...forecast.map((f) => f.value)] },
      ],
    };
  }, [history, forecast, metric, fmt, src, t]);
  return (
    <>
      <EChart ref={chartRef} option={option} height={330} ariaLabel={`Line chart of ${metric.replace('_', ' ')} history with a ${forecast.length}-year forecast and confidence band`} />
      {model && <p className="px-2 pt-1 text-[11px] text-muted">{model.name}. Implied growth {model.implied_annual_growth_pct}% a year. Trained on {model.training_years[0]}–{model.training_years[model.training_years.length - 1]} (excluding {model.excluded_years.join(' and ')}). {model.interval}.</p>}
    </>
  );
}

export function ForecastSection({ code }: { code: string }) {
  const [metric, setMetric] = useState('total_visits');
  const [years, setYears] = useState<2 | 3>(3);
  const q = useForecast(code, metric, years);
  const chart = useRef<ChartHandle>(null);
  const d = q.data?.data;
  const rows = d ? [...d.history.map((h) => ({ year: h.year, kind: 'history', value: h.display, lower: '', upper: '', note: h.used_in_training ? '' : 'excluded from training' })), ...d.forecast.map((f) => ({ year: f.year, kind: 'forecast', value: f.display, lower: f.lower_display, upper: f.upper_display, note: 'model projection' }))] : [];
  const noModel = d && !d.model;
  return (
    <ChartCard
      title="Forecast" chart={chart} view="forecast" params={{ state: code, metric, years, include_synthetic: true }}
      subtitle={`Dashed line and shaded band are a model projection (is_forecast), shown separately from the synthetic flag. ${d?.model ? d.model.interval + '.' : ''}`}
      controls={<div className="flex items-end gap-2"><Select label="" allLabel="" value={metric} onChange={(v) => v && setMetric(v)} options={METRICS} /><Segmented label="" value={String(years) as '2' | '3'} onChange={(v) => setYears(Number(v) as 2 | 3)} options={[{ value: '2', label: '2 years' }, { value: '3', label: '3 years' }]} /></div>}
      table={d && !noModel ? <DataTable caption="History and forecast" rows={rows} columns={[{ key: 'y', label: 'Year', render: (r) => r.year }, { key: 'k', label: 'Kind', render: (r) => r.kind }, { key: 'v', label: 'Value', align: 'right', render: (r) => r.value }, { key: 'l', label: 'Lower', align: 'right', render: (r) => r.lower }, { key: 'u', label: 'Upper', align: 'right', render: (r) => r.upper }, { key: 'n', label: 'Note', render: (r) => r.note }]} /> : undefined}
      footer={d?.notes?.length ? <ul className="list-disc pl-4">{d.notes.map((n) => <li key={n}>{n.replace(/^(not_available|boundary_change):\s*/, '')}</li>)}</ul> : undefined}
    >
      <QueryBoundary query={q} skeleton={<Skeleton className="h-[330px] w-full" />}>
        {(r) => (r.data.model ? <Chart resp={r} metric={metric} chartRef={chart} /> : <EmptyState title="No forecast available" hint={r.data.notes[0]?.replace(/^not_available:\s*/, '') ?? 'Not enough usable history for this state.'} />)}
      </QueryBoundary>
    </ChartCard>
  );
}
