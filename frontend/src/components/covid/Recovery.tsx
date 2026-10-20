import { useMemo, useRef, useState } from 'react';
import { useCovid } from '@/api/hooks';
import { ApiError } from '@/api/client';
import type { CovidResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { barFx } from '@/components/charts/fx';
import { tip } from '@/components/charts/tip';
import { EmptyState, QueryBoundary, Skeleton } from '@/components/common/States';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import { Segmented } from '@/components/filters/controls';
import { formatPct } from '@/lib/format';

type Mode = 'overall' | 'split';
const FASTEST = 5;

function Chart({ resp, mode, chartRef }: { resp: CovidResponse; mode: Mode; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const { states, baseline_year, latest_year } = resp.data;
  const src = resp.meta.data_sources[0];
  const codes = useMemo(() => states.map((s) => s.state_code), [states]);
  const option = useMemo(() => ({
    grid: { left: 170, right: 96, top: mode === 'split' ? 30 : 8, bottom: 24 },
    legend: mode === 'split' ? { top: 0, textStyle: { color: t.muted }, icon: 'roundRect' } : undefined,
    aria: { enabled: true, label: { description: `Recovery of visits in ${latest_year} compared with ${baseline_year}, by state, ranked` } },
    tooltip: { ...tooltipBase(t), trigger: 'item', formatter: (p: { dataIndex: number }) => {
      const s = states[p.dataIndex];
      return tip(t, { title: `#${s.rank} ${s.state_name}`, synthetic: s.is_synthetic, source: src, note: s.recovered ? `Back above the ${baseline_year} level${s.recovery_year ? ` since ${s.recovery_year}` : ''}` : `Still below the ${baseline_year} level`,
        rows: [[`Recovery (${latest_year} vs ${baseline_year})`, s.recovery_display], ['Domestic', formatPct(s.domestic.recovery_pct)], ['Foreign', formatPct(s.foreign.recovery_pct)], ['Deepest drop', formatPct(s.trough_drop_pct, true)], [`${baseline_year} visits`, s.baseline_display], [`${latest_year} visits`, s.latest_display]] });
    } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: '{value}%' } },
    yAxis: { type: 'category', inverse: true, data: states.map((s) => `#${s.rank}  ${s.state_name}`), axisTick: { show: false }, axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.ink, fontSize: 11, interval: 0 } },
    series: mode === 'overall' ? [{
      type: 'bar', barWidth: '64%', cursor: 'pointer',
      data: states.map((s) => ({ value: s.recovery_pct, itemStyle: { color: s.rank <= FASTEST ? t.saffron : t.teal, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: t.ink, fontSize: 11, formatter: (p: { dataIndex: number }) => `${states[p.dataIndex].recovery_display ?? ''}${states[p.dataIndex].rank <= FASTEST ? '  ★' : ''}` },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: t.ink, type: 'dashed', width: 1.2 }, label: { formatter: `${baseline_year} level (100%)`, color: t.ink, fontSize: 10, position: 'end' }, data: [{ xAxis: 100 }] },
      ...barFx(t),
    }] : [
      { name: 'Domestic', type: 'bar', barGap: '10%', data: states.map((s) => s.domestic.recovery_pct), itemStyle: { color: t.teal, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', color: t.muted, fontSize: 9.5, formatter: (p: { value: number }) => formatPct(p.value) ?? '' }, ...barFx(t),
        markLine: { silent: true, symbol: 'none', lineStyle: { color: t.ink, type: 'dashed', width: 1.2 }, label: { formatter: '100%', color: t.ink, fontSize: 10 }, data: [{ xAxis: 100 }] } },
      { name: 'Foreign', type: 'bar', data: states.map((s) => s.foreign.recovery_pct), itemStyle: { color: t.saffron, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', color: t.muted, fontSize: 9.5, formatter: (p: { value: number }) => formatPct(p.value) ?? '' }, ...barFx(t) },
    ],
  }), [states, mode, baseline_year, latest_year, src, t]);
  return <div className="max-h-[620px] overflow-y-auto pr-1"><EChart ref={chartRef} option={option} height={states.length * (mode === 'split' ? 38 : 24) + 50} hoverCodes={codes} ariaLabel={`Bar chart of recovery vs ${baseline_year} by state`} /></div>;
}

export function Recovery() {
  const q = useCovid();
  const [mode, setMode] = useState<Mode>('overall');
  const chart = useRef<ChartHandle>(null);
  const d = q.data?.data;
  const tooEarly = q.error instanceof ApiError && q.error.code === 'year_before_recovery';
  const fastest = d?.states.slice(0, FASTEST) ?? [];
  return (
    <div className="space-y-5">
      {d?.summary && (
        <section aria-label="National recovery" className="grid grid-cols-4 gap-4">
          {[['Visits vs ' + d.baseline_year, formatPct(d.summary.recovery_pct)], ['States above ' + d.baseline_year + ' level', `${d.summary.states_recovered} of ${d.summary.n_states}`], ['COVID years', d.covid_years.join(' to ')], ['Measured in', String(d.latest_year)]].map(([k, v]) => (
            <div key={k} className="card p-3.5"><div className="flex items-start justify-between"><span className="label">{k}</span><SyntheticBadge show={d.summary?.is_synthetic} compact align="right" /></div><p className="num mt-1.5 text-2xl font-semibold">{v ?? 'n/a'}</p></div>
          ))}
        </section>
      )}
      <ChartCard title={`Recovery vs ${d?.baseline_year ?? 'pre-COVID'}, ranked`} chart={chart} view="covid_recovery" params={q.params}
        subtitle={d ? `${d.latest_year} visits as a percentage of ${d.baseline_year}. Ranked from fastest to slowest recovery; ★ marks the ${FASTEST} fastest.` : undefined}
        controls={<Segmented label="" value={mode} onChange={setMode} options={[{ value: 'overall', label: 'Overall' }, { value: 'split', label: 'Domestic vs foreign' }]} />}
        table={d && <DataTable caption="COVID recovery by state" maxHeight={620} rows={d.states} rowCode={(r) => r.state_code} columns={[
          { key: 'r', label: 'Rank', render: (r) => r.rank }, { key: 's', label: 'State', render: (r) => r.state_name }, { key: 'o', label: 'Recovery', align: 'right', render: (r) => r.recovery_display },
          { key: 'd', label: 'Domestic', align: 'right', render: (r) => formatPct(r.domestic.recovery_pct) ?? 'n/a' }, { key: 'f', label: 'Foreign', align: 'right', render: (r) => formatPct(r.foreign.recovery_pct) ?? 'n/a' },
          { key: 't', label: 'Deepest drop', align: 'right', render: (r) => formatPct(r.trough_drop_pct, true) ?? 'n/a' }, { key: 'y', label: 'Recovered in', align: 'right', render: (r) => r.recovery_year ?? 'not yet' }]} />}
        footer={fastest.length ? <span><b className="text-saffron">Fastest:</b> {fastest.map((s) => `${s.state_name} ${s.recovery_display}`).join(' · ')}</span> : undefined}>
        {tooEarly ? <EmptyState title="Pick a later year" hint="Recovery is measured against the pre-COVID baseline, so the year range must end after the COVID years. Move the end of the year range forward." />
          : <QueryBoundary query={q} skeleton={<Skeleton className="h-[560px] w-full" />} isEmpty={(r) => r.data.states.length === 0} emptyHint="No states match the current filters.">{(r) => <Chart resp={r} mode={mode} chartRef={chart} />}</QueryBoundary>}
      </ChartCard>
    </div>
  );
}
