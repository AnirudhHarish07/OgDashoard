import { useMemo, useRef, useState } from 'react';
import { useByType, useFestivals } from '@/api/hooks';
import type { ByTypeResponse, FestivalResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { crosshair } from '@/components/charts/fx';
import { tip } from '@/components/charts/tip';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import { Segmented } from '@/components/filters/controls';
import { formatCount } from '@/lib/format';

type Mode = 'index' | 'volume';

function Chart({ types, fest, mode, month, onMonth, chartRef }: { types: ByTypeResponse; fest: FestivalResponse | undefined; mode: Mode; month: number | null; onMonth: (m: number) => void; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const { curves, year } = types.data;
  const src = types.meta.data_sources[0];
  const months = useMemo(() => curves[0]?.months.map((m) => m.month_name) ?? [], [curves]);
  const byMonth = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const e of fest?.data.events ?? []) m.set(e.month, [...(m.get(e.month) ?? []), `${e.name} (${e.state_code})`]);
    return m;
  }, [fest]);
  const option = useMemo(() => ({
    grid: { left: 64, right: 52, top: 40, bottom: 28 },
    legend: { top: 0, textStyle: { color: t.muted }, icon: 'roundRect', selectedMode: true },
    aria: { enabled: true, label: { description: `Monthly visits by tourism type in ${year}, with the number of festivals per month as bars` } },
    tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: crosshair(t), formatter: (ps: { dataIndex: number; seriesName: string; seriesType: string; value: number }[]) => {
      const i = ps[0].dataIndex; const names = byMonth.get(i + 1);
      return tip(t, { title: `${months[i]} ${year}`, synthetic: true, source: src, note: names ? `${names.length} festival${names.length === 1 ? '' : 's'}: ${names.slice(0, 5).join('; ')}${names.length > 5 ? '…' : ''}` : 'No festivals listed',
        rows: ps.filter((p) => p.seriesType === 'line').map((p) => [p.seriesName, mode === 'index' ? `index ${p.value}` : formatCount(p.value)] as [string, string | null]) });
    } },
    xAxis: { type: 'category', data: months, boundaryGap: true, axisLabel: { color: t.muted }, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false } },
    yAxis: [
      { type: 'value', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => (mode === 'index' ? String(v) : formatCount(v) ?? '') } },
      { type: 'value', name: 'Festivals', nameTextStyle: { color: t.marigold, align: 'right' }, minInterval: 1, splitLine: { show: false }, axisLabel: { color: t.marigold } },
    ],
    series: [
      { name: 'Festivals (count)', type: 'bar', yAxisIndex: 1, barWidth: '26%', z: 1, cursor: 'pointer', itemStyle: { color: t.theme === 'dark' ? 'rgba(251,191,36,.18)' : 'rgba(180,83,9,.16)', borderColor: t.marigold, borderWidth: 1, borderRadius: [3, 3, 0, 0] },
        data: months.map((_, i) => ({ value: fest?.data.by_month[i]?.count ?? 0, itemStyle: month === i + 1 ? { color: t.marigold } : undefined })) },
      ...curves.map((c, i) => ({ name: `${c.tourism_type[0].toUpperCase()}${c.tourism_type.slice(1)} (${c.n_states})`, type: 'line', smooth: 0.25, symbolSize: 5, z: 3, lineStyle: { width: 2.5, color: t.palette[i % t.palette.length] }, itemStyle: { color: t.palette[i % t.palette.length] }, emphasis: { focus: 'series' },
        data: c.months.map((m) => (mode === 'index' ? m.seasonal_index : m.value)) })),
    ],
  }), [curves, months, byMonth, fest, mode, month, year, src, t]);
  return <EChart ref={chartRef} option={option} height={380} onEvents={{ click: (p) => { const i = (p as { dataIndex?: number }).dataIndex; if (i != null) onMonth(i + 1); } }} ariaLabel={`Line chart of monthly visits by tourism type with festival counts, ${year}`} />;
}

export function TypeCurves() {
  const tq = useByType();
  const fq = useFestivals();
  const [mode, setMode] = useState<Mode>('index');
  const [month, setMonth] = useState<number | null>(null);
  const chart = useRef<ChartHandle>(null);
  const d = tq.data?.data;
  const events = (fq.data?.data.events ?? []).filter((e) => month == null || e.month === month);
  return (
    <ChartCard
      title="Monthly curves by tourism type, with festivals" chart={chart} view="seasonality_by_type" params={tq.params}
      subtitle={d ? `${d.year}. ${mode === 'index' ? 'Lines: seasonal index (100 = an average month). ' : 'Lines: visits. '}Bars: festivals per month, so events line up with the spikes. Click a month to list them.` : undefined}
      controls={<Segmented label="" value={mode} onChange={setMode} options={[{ value: 'index', label: 'Seasonal index' }, { value: 'volume', label: 'Volume' }]} />}
      table={d && <DataTable caption="Seasonal index by tourism type and month" maxHeight={380} rows={d.curves[0]?.months.map((_, i) => i) ?? []} columns={[{ key: 'm', label: 'Month', render: (i) => d.curves[0].months[i].month_name }, ...d.curves.map((c) => ({ key: c.tourism_type, label: c.tourism_type, align: 'right' as const, render: (i: number) => `${c.months[i].seasonal_index}` })), { key: 'f', label: 'Festivals', align: 'right' as const, render: (i: number) => fq.data?.data.by_month[i]?.count ?? 0 }]} />}
      footer={<span>Types come from state tags. A state with several tags appears in each of its types, so these curves overlap and must not be added together.</span>}
    >
      <QueryBoundary query={tq} skeleton={<Skeleton className="h-[380px] w-full" />} isEmpty={(r) => r.data.curves.length === 0} emptyHint="No monthly data for the current filters.">
        {(r) => <Chart types={r} fest={fq.data} mode={mode} month={month} onMonth={(m) => setMonth((cur) => (cur === m ? null : m))} chartRef={chart} />}
      </QueryBoundary>
      <div className="mt-2 border-t border-line/60 px-1 pt-3">
        <div className="mb-2 flex items-center gap-2" role="group" aria-label="Festival month">
          <span className="label mr-1">Festivals in</span>
          <button type="button" className={`chip ${month == null ? 'border-teal bg-teal/15' : ''}`} aria-pressed={month == null} onClick={() => setMonth(null)}>All year ({fq.data?.data.events.length ?? 0})</button>
          {(fq.data?.data.by_month ?? []).map((m) => <button key={m.month} type="button" className={`chip ${month === m.month ? 'border-marigold bg-marigold/15' : ''}`} aria-pressed={month === m.month} onClick={() => setMonth(month === m.month ? null : m.month)}>{m.month_name} <span className="num text-faint">{m.count}</span></button>)}
        </div>
        {fq.isLoading ? <Skeleton className="h-16 w-full" /> : fq.isError ? <p className="text-sm text-bad" role="alert">Couldn't load festivals. <button className="underline" onClick={() => void fq.refetch()}>Retry</button></p> : events.length === 0 ? <p className="text-sm text-muted" role="status">No festivals listed for this selection.</p> : (
          <ul className="grid max-h-40 grid-cols-3 gap-x-4 gap-y-1 overflow-auto pr-1 text-sm" aria-label="Festivals">
            {events.map((e) => <li key={`${e.name}-${e.state_code}`} className="flex items-baseline gap-2"><span className="num w-8 shrink-0 text-xs text-marigold">{e.month_name}</span><span className="truncate" title={`${e.name}, ${e.state_name}`}>{e.name}</span><span className="shrink-0 text-xs text-muted">{e.state_code} · {e.type}</span></li>)}
          </ul>
        )}
        <p className="mt-2 flex items-center gap-2 text-[11px] text-faint">Festival names and months are hand-entered reference values, unverified. <SyntheticBadge compact /></p>
      </div>
    </ChartCard>
  );
}
