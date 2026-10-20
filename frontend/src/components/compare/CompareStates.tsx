import { useRef } from 'react';
import { useCompare, useRankings } from '@/api/hooks';
import type { CompareResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { crosshair } from '@/components/charts/fx';
import { tip } from '@/components/charts/tip';
import { EmptyState, QueryBoundary, Skeleton } from '@/components/common/States';
import { formatCount } from '@/lib/format';
import { useFilters } from '@/store/filters';
import { useSharedHover } from '@/ui/interactions/useSharedHover';

function Cell({ code, children }: { code: string; children: React.ReactNode }) {
  const { highlighted, bind } = useSharedHover(code);
  return <td {...bind} className={`num px-3 py-2 text-right transition-colors duration-hover ${highlighted ? 'bg-teal/10' : ''}`}>{children}</td>;
}

function Side({ resp }: { resp: CompareResponse }) {
  const t = useChartTheme();
  const { states, metrics, series, year } = resp.data;
  const src = resp.meta.data_sources[0];
  const years = series[states[0].state_code].map((p) => String(p.year));
  const option = {
    grid: { left: 64, right: 16, top: 28, bottom: 26 },
    legend: { top: 0, textStyle: { color: t.muted }, icon: 'roundRect' },
    aria: { enabled: true, label: { description: 'Total visits by year for the compared states' } },
    tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: crosshair(t),
      formatter: (ps: { dataIndex: number; seriesName: string; value: number }[]) =>
        tip(t, { title: years[ps[0].dataIndex], synthetic: true, source: src, rows: ps.map((p) => [p.seriesName, formatCount(p.value)] as [string, string | null]) }) },
    xAxis: { type: 'category', data: years, boundaryGap: false, axisLabel: { color: t.muted }, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => formatCount(v) ?? '' } },
    series: states.map((s, i) => ({ name: s.state_name, type: 'line', smooth: 0.2, symbolSize: 6, lineStyle: { width: 2.5, color: t.palette[i] }, itemStyle: { color: t.palette[i] },
      emphasis: { focus: 'series' }, data: series[s.state_code].map((p) => p.total_visits) })),
  };
  return (
    <div className="grid grid-cols-5 gap-4">
      <div className="col-span-3 overflow-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Key metrics for {states.map((s) => s.state_name).join(', ')} in {year}</caption>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
              <th scope="col" className="px-3 py-2 font-medium">Metric</th>
              {states.map((s, i) => <th key={s.state_code} scope="col" className="px-3 py-2 text-right font-semibold normal-case tracking-normal text-ink"><span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: t.palette[i] }} />{s.state_name}</th>)}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.key} className="border-t border-line/50">
                <th scope="row" className="px-3 py-2 text-left font-normal text-muted">{m.label}</th>
                {states.map((s) => {
                  const v = m.values[s.state_code];
                  const lead = m.leader === s.state_code;
                  return (
                    <Cell key={s.state_code} code={s.state_code}>
                      <span className={lead ? 'font-semibold text-ink' : 'text-ink/85'}>
                        {v?.display ?? 'n/a'}
                        {lead && <span className="ml-1 text-saffron" title={m.higher_is_better ? 'Highest of the selected states' : 'Best (lowest) of the selected states'}><span aria-hidden>★</span><span className="sr-only"> leader</span></span>}
                      </span>
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-3 pt-2 text-[11px] text-faint"><span className="text-saffron">★</span> marks the leader on each metric (for rank, the lowest number). YoY is blank across the J&amp;K/Ladakh boundary change.</p>
      </div>
      <div className="col-span-2"><EChart option={option} height={330} ariaLabel="Line chart of total visits by year for the compared states" /></div>
    </div>
  );
}

export function CompareStates() {
  const selected = useFilters((s) => s.states);
  const setStates = useFilters((s) => s.setStates);
  const top = useRankings('total_visits', 'top', 3);
  const custom = selected.length >= 2 && selected.length <= 3;
  const codes = custom ? selected : (top.data?.data.items.slice(0, 3).map((i) => i.state_code) ?? []);
  const q = useCompare(codes);
  const chart = useRef<ChartHandle>(null);
  const names = new Map(q.data?.data.states.map((s) => [s.state_code, s.state_name]));
  return (
    <ChartCard
      title="State comparison" chart={chart} view="compare" params={{ ...q.params, states: codes.join(',') }}
      subtitle={custom ? 'Your selection. Change it in the States filter or by clicking bars in the ranking chart.' : 'Showing the top 3 states by visits. Select 2 or 3 states (States filter, or click bars above) to compare your own.'}
      controls={custom ? (
        <div className="flex items-center gap-1.5">{codes.map((c) => <span key={c} className="chip">{names.get(c) ?? c}<button type="button" aria-label={`Remove ${names.get(c) ?? c}`} className="text-muted hover:text-ink" onClick={() => setStates(selected.filter((x) => x !== c))}>×</button></span>)}</div>
      ) : selected.length > 0 ? <span className="text-xs text-bad" role="status">{selected.length === 1 ? 'Select one more state' : 'Compare works with 2 or 3 states'}</span> : undefined}
    >
      {codes.length < 2 ? (top.isLoading ? <Skeleton className="h-[330px] w-full" /> : <EmptyState title="Nothing to compare" hint="No states available under the current filters." />) : (
        <QueryBoundary query={q} skeleton={<Skeleton className="h-[330px] w-full" />}>{(r) => <Side resp={r} />}</QueryBoundary>
      )}
    </ChartCard>
  );
}
