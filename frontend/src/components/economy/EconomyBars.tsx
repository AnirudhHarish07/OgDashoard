import { useMemo, useRef, useState } from 'react';
import { useEconomy } from '@/api/hooks';
import type { EconomyResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { barFx } from '@/components/charts/fx';
import { tip } from '@/components/charts/tip';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import { Segmented } from '@/components/filters/controls';
import { Caption } from '@/components/common/PageHeader';
import { REGION_LIST, regionColour } from '@/lib/colour';
import { formatCrore, formatPct, formatRupees } from '@/lib/format';

type M = 'gsdp' | 'rpt' | 'forex';
const META: Record<M, { label: string; sub: string }> = {
  gsdp: { label: "Share of state GSDP", sub: "Tourism revenue as a share of the state's GSDP" },
  rpt: { label: 'Revenue per tourist', sub: 'Tourism revenue divided by visits' },
  forex: { label: 'Forex earnings', sub: 'Revenue from foreign visitors' },
};

function Chart({ resp, m, chartRef }: { resp: EconomyResponse; m: M; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const src = resp.meta.data_sources[0];
  const rows = useMemo(() => {
    const get = (r: EconomyResponse['data']['states'][number]) => (m === 'gsdp' ? r.tourism_share_of_gsdp : m === 'rpt' ? r.revenue_per_tourist : r.forex_earnings_cr);
    return [...resp.data.states].sort((a, b) => get(b) - get(a)).map((r) => ({ r, v: get(r), disp: m === 'gsdp' ? r.tourism_share_display : m === 'rpt' ? r.revenue_per_tourist_display : r.forex_display, rank: m === 'gsdp' ? r.rank_gsdp_share : m === 'rpt' ? r.rank_revenue_per_tourist : r.rank_forex }));
  }, [resp, m]);
  const codes = useMemo(() => rows.map((x) => x.r.state_code), [rows]);
  const option = useMemo(() => ({
    grid: { left: 170, right: 100, top: 4, bottom: 22 },
    aria: { enabled: true, label: { description: `${META[m].label} by state, ${resp.data.year}` } },
    tooltip: { ...tooltipBase(t), trigger: 'item', formatter: (p: { dataIndex: number }) => {
      const { r, disp, rank } = rows[p.dataIndex];
      return tip(t, { title: `#${rank} ${r.state_name}`, synthetic: r.is_synthetic, source: src, note: r.region, rows: [[META[m].label, disp], ['Share of GSDP', r.tourism_share_display], ['Revenue per tourist', r.revenue_per_tourist_display], ['Forex earnings', r.forex_display], ['Revenue', r.revenue_display]] });
    } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => (m === 'gsdp' ? formatPct(v) : m === 'rpt' ? formatRupees(v) : formatCrore(v)) ?? '' } },
    yAxis: { type: 'category', inverse: true, data: rows.map((x) => `#${x.rank}  ${x.r.state_name}`), axisTick: { show: false }, axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.ink, fontSize: 11, interval: 0 } },
    series: [{ type: 'bar', barWidth: '64%', cursor: 'pointer', data: rows.map((x) => ({ value: x.v, itemStyle: { color: regionColour(t.theme, x.r.region), borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', color: t.ink, fontSize: 11, formatter: (p: { dataIndex: number }) => rows[p.dataIndex].disp ?? '' }, ...barFx(t) }],
  }), [rows, m, resp.data.year, src, t]);
  return (
    <>
      <div className="max-h-[560px] overflow-y-auto pr-1"><EChart ref={chartRef} option={option} height={rows.length * 24 + 30} hoverCodes={codes} ariaLabel={`Bar chart of ${META[m].label} for ${rows.length} states`} /></div>
      <Caption>Scroll inside the chart to see all {rows.length} states and UTs.</Caption>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pt-2 text-[11px] text-muted">{REGION_LIST.filter((g) => rows.some((x) => x.r.region === g)).map((g) => <span key={g} className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: regionColour(t.theme, g) }} />{g}</span>)}</div>
    </>
  );
}

export function EconomySummary() {
  const q = useEconomy();
  const s = q.data?.data.summary;
  if (!s) return null;
  const tile = (k: string, v: string | null | undefined) => <div className="card p-3.5"><div className="flex items-start justify-between"><span className="label">{k}</span><SyntheticBadge show={s.is_synthetic} compact align="right" /></div><p className="num mt-1.5 text-2xl font-semibold">{v ?? 'n/a'}</p></div>;
  return <section aria-label="Economy summary" className="grid grid-cols-4 gap-4">{tile('Tourism revenue', s.revenue_display)}{tile('Forex earnings', s.forex_display)}{tile('Share of GSDP', formatPct(s.tourism_share_of_gsdp))}{tile('Revenue per tourist', s.revenue_per_tourist_display)}</section>;
}

export function EconomyBars() {
  const q = useEconomy();
  const [m, setM] = useState<M>('gsdp');
  const chart = useRef<ChartHandle>(null);
  const d = q.data?.data;
  return (
    <ChartCard title="Tourism's weight in each state's economy" subtitle={d ? `${d.year}. ${META[m].sub}. Colour is the region; rank and value are labelled.` : undefined} chart={chart} view="economy" params={q.params}
      controls={<Segmented label="" value={m} onChange={setM} options={[{ value: 'gsdp', label: 'GSDP share' }, { value: 'rpt', label: 'Per tourist' }, { value: 'forex', label: 'Forex' }]} />}
      table={d && <DataTable caption="Economy by state" maxHeight={560} rows={d.states} rowCode={(r) => r.state_code} columns={[
        { key: 's', label: 'State', render: (r) => r.state_name }, { key: 'g', label: 'GSDP share', align: 'right', render: (r) => r.tourism_share_display }, { key: 'p', label: 'Revenue / tourist', align: 'right', render: (r) => r.revenue_per_tourist_display },
        { key: 'f', label: 'Forex', align: 'right', render: (r) => r.forex_display }, { key: 'fs', label: 'Forex % of revenue', align: 'right', render: (r) => formatPct(r.forex_share_of_revenue_pct) }]} />}>
      <QueryBoundary query={q} skeleton={<Skeleton className="h-[520px] w-full" />} isEmpty={(r) => r.data.states.length === 0} emptyHint="No states match the current filters.">{(r) => <Chart resp={r} m={m} chartRef={chart} />}</QueryBoundary>
    </ChartCard>
  );
}
