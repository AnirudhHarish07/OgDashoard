import { useMemo, useRef } from 'react';
import { useDemandCapacity } from '@/api/hooks';
import type { DemandResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { scatterFx } from '@/components/charts/fx';
import { tip } from '@/components/charts/tip';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { formatCount, formatNumber } from '@/lib/format';
import { niceLogMax, niceLogMin } from '@/lib/scale';

const LABEL = { under_served: 'Under-served', balanced: 'Balanced', over_supplied: 'Over-supplied' } as const;
const SYMBOL = { under_served: 'diamond', balanced: 'circle', over_supplied: 'triangle' } as const;

function Chart({ resp, chartRef }: { resp: DemandResponse; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const { states, thresholds, year } = resp.data;
  const src = resp.meta.data_sources[0];
  const codes = useMemo(() => states.map((s) => s.state_code), [states]);
  const option = useMemo(() => {
  const colour = (s: string) => (s === 'under_served' ? t.saffron : s === 'over_supplied' ? t.indigo : t.teal);
  const xs = states.map((s) => s.hotel_rooms), ys = states.map((s) => s.visits);
  const xMin = niceLogMin(Math.min(...xs)), xMax = niceLogMax(Math.max(...xs)), yMin = niceLogMin(Math.min(...ys)), yMax = niceLogMax(Math.max(...ys));
  const lines = thresholds ? [{ k: 'p25', v: thresholds.p25, n: '25th pct' }, { k: 'median', v: thresholds.median, n: 'median' }, { k: 'p75', v: thresholds.p75, n: '75th pct' }] : [];
  return {
    grid: { left: 80, right: 190, top: 16, bottom: 52 },
    aria: { enabled: true, label: { description: `Visits against hotel rooms for ${states.length} states in ${year}. Diamonds mark under-served states.` } },
    tooltip: { ...tooltipBase(t), trigger: 'item', formatter: (p: { seriesType: string; dataIndex: number }) => {
      if (p.seriesType !== 'scatter') return '';
      const s = states[p.dataIndex];
      return tip(t, { title: s.state_name, synthetic: s.is_synthetic, source: src, note: `${LABEL[s.status as keyof typeof LABEL] ?? s.status}${s.under_served ? `: needs about ${formatNumber(s.rooms_to_reach_median_ratio)} more rooms to reach the median ratio` : ''}`, rows: [['Visits', s.visits_display], ['Hotel rooms', s.hotel_rooms_display], ['Visits per room', formatNumber(s.visits_per_room, 0)], ['Occupancy', `${s.occupancy_rate}%`]] });
    } },
    xAxis: { type: 'log', min: xMin, max: xMax, name: 'Hotel rooms (log)', nameLocation: 'middle', nameGap: 32, nameTextStyle: { color: t.muted }, splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => formatCount(v) ?? '' } },
    yAxis: { type: 'log', min: yMin, max: yMax, name: 'Visits (log)', nameTextStyle: { color: t.muted, align: 'left' }, splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => formatCount(v) ?? '' } },
    series: [
      { type: 'scatter', cursor: 'pointer', symbolSize: 13, data: states.map((s) => ({ value: [s.hotel_rooms, s.visits], symbol: SYMBOL[s.status as keyof typeof SYMBOL] ?? 'circle', symbolSize: s.under_served ? 17 : 12, itemStyle: { color: colour(s.status), borderColor: t.bg, borderWidth: 1.2, opacity: 0.92 } })),
        label: { show: true, position: 'right', color: t.muted, fontSize: 10, formatter: (p: { dataIndex: number }) => (states[p.dataIndex].under_served ? states[p.dataIndex].state_code : '') }, ...scatterFx(t) },
      ...lines.map((l, i) => ({ name: l.n, type: 'line', silent: true, symbol: 'none', z: 1, lineStyle: { type: 'dashed', width: 1.3, color: i === 2 ? t.saffron : t.faint },
        data: [[xMin, l.v * xMin], [xMax, l.v * xMax]], endLabel: { show: true, formatter: `${l.n}: ${formatNumber(l.v, 0)} visits/room`, color: i === 2 ? t.saffron : t.faint, fontSize: 10 } })),
    ],
  }; }, [states, thresholds, year, src, t]);
  return <EChart ref={chartRef} option={option} height={460} hoverCodes={codes} ariaLabel="Scatter chart of visits against hotel rooms with capacity thresholds" />;
}

export function DemandCapacity() {
  const q = useDemandCapacity();
  const chart = useRef<ChartHandle>(null);
  const d = q.data?.data;
  const under = (d?.states ?? []).filter((s) => s.under_served);
  return (
    <ChartCard title="Demand vs capacity" subtitle={d?.thresholds ? `${d.year}. Dashed diagonals are visits-per-room thresholds across all states. ◆ under-served, ● balanced, ▲ over-supplied.` : undefined} chart={chart} view="demand_capacity" params={q.params}
      table={d && <DataTable caption="Visits per hotel room by state" maxHeight={460} rows={d.states} rowCode={(r) => r.state_code} columns={[
        { key: 's', label: 'State', render: (r) => r.state_name }, { key: 'v', label: 'Visits', align: 'right', render: (r) => r.visits_display }, { key: 'h', label: 'Rooms', align: 'right', render: (r) => r.hotel_rooms_display },
        { key: 'x', label: 'Visits / room', align: 'right', render: (r) => formatNumber(r.visits_per_room, 0) }, { key: 'st', label: 'Status', render: (r) => LABEL[r.status as keyof typeof LABEL] ?? r.status }]} />}
      footer={d?.thresholds ? <span>{d.thresholds.method}. Flags are relative, not an absolute standard.</span> : undefined}>
      <QueryBoundary query={q} skeleton={<Skeleton className="h-[460px] w-full" />} isEmpty={(r) => r.data.states.length === 0} emptyHint="No states match the current filters.">
        {(r) => (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2"><Chart resp={r} chartRef={chart} /></div>
            <div>
              <h3 className="label mb-1.5">Under-served states ({under.length})</h3>
              {under.length === 0 ? <p className="text-sm text-muted" role="status">No state is above the under-served threshold in this selection.</p> : (
                <DataTable caption="Under-served states" maxHeight={420} rows={under} rowCode={(r2) => r2.state_code} columns={[
                  { key: 's', label: 'State', render: (r2) => r2.state_name }, { key: 'x', label: 'Visits / room', align: 'right', render: (r2) => formatNumber(r2.visits_per_room, 0) }, { key: 'n', label: 'Rooms to median', align: 'right', render: (r2) => `+${formatNumber(r2.rooms_to_reach_median_ratio)}` }]} />
              )}
              <p className="mt-2 text-[11px] text-faint">"Rooms to median" is how many extra rooms would bring the state to the median visits-per-room ratio.</p>
            </div>
          </div>
        )}
      </QueryBoundary>
    </ChartCard>
  );
}
