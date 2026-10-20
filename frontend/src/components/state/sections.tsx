import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { StateDetail } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { barFx, crosshair } from '@/components/charts/fx';
import { tip } from '@/components/charts/tip';
import { EmptyState } from '@/components/common/States';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import type { Query } from '@/api/client';
import { formatCount, formatNumber, formatPct } from '@/lib/format';
import { useAnomalies } from '@/api/hooks';
import { anomalyLegend, anomalyList, anomalyMarkPoint } from '@/components/charts/anomaly';

interface P { d: StateDetail; src: string | undefined; code: string; params: Query }

export function ProfileCard({ d }: { d: StateDetail }) {
  const p = d.profile;
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-3 border-t border-line/50 py-1.5 text-sm first:border-0"><dt className="text-muted">{k}</dt><dd className="num text-right">{v ?? 'n/a'}</dd></div>;
  return (
    <section className="card p-4" aria-label="Profile">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Profile</h2><SyntheticBadge show={p.is_synthetic} compact align="right" /></div>
      <div className="mt-2 flex flex-wrap gap-1.5">{p.tourism_types.length ? p.tourism_types.map((t) => <span key={t} className="chip !py-0.5 capitalize">{t}</span>) : <span className="text-xs text-muted">No tourism tags</span>}</div>
      <dl className="mt-3">
        {row('Region', p.region)}{row('Capital', p.capital)}{row('Population', p.population_display)}
        {row('Area', p.area_km2 != null ? `${formatNumber(p.area_km2)} km²` : null)}
        {row('Airports', p.airports != null ? `${p.airports}${p.international_airports != null ? ` (${p.international_airports} international)` : ''}` : null)}
        {row('Data from', p.first_year)}
      </dl>
      <h3 className="label mt-3">UNESCO sites ({p.unesco_count})</h3>
      {p.unesco_sites.length ? (
        <ul className="mt-1 space-y-1">{p.unesco_sites.map((s) => <li key={s.name} className="flex justify-between gap-2 text-sm"><span>{s.name}</span><span className="num text-xs text-muted">{formatCount(s.annual_footfall)} visitors</span></li>)}</ul>
      ) : <p className="mt-1 text-sm text-muted">None listed in the dataset.</p>}
      {p.boundary_note && <p className="mt-3 rounded-lg border border-marigold/40 bg-marigold/10 p-2 text-[11px] text-ink">{p.boundary_note}</p>}
    </section>
  );
}

export function KpiGrid({ d }: { d: StateDetail }) {
  if (d.kpis.length === 0) {
    return <section className="card p-6" role="status"><EmptyState title="Not available for this year" hint={d.notes[0]?.replace(/^not_available:\s*/, '') ?? 'No tourism data for this state in the selected year.'} /></section>;
  }
  return (
    <section aria-label="Key figures" className="grid grid-cols-4 gap-3">
      {d.kpis.map((k) => (
        <div key={k.key} className="card p-3" data-testid={`state-kpi-${k.key}`}>
          <div className="flex items-start justify-between gap-1"><span className="label !text-[10px]">{k.label}</span><SyntheticBadge show={k.is_synthetic} compact align="right" /></div>
          <p className="num mt-1 text-xl font-semibold">{k.display ?? 'n/a'}</p>
          <p className={`num mt-0.5 text-[11px] ${k.direction === 'up' ? 'text-good' : k.direction === 'down' ? 'text-bad' : 'text-muted'}`}>
            <span aria-hidden>{k.direction === 'up' ? '▲ ' : k.direction === 'down' ? '▼ ' : ''}</span><span className="sr-only">{k.direction === 'none' ? 'no comparison' : k.direction}: </span>{k.change_display ?? 'no comparison'}
          </p>
        </div>
      ))}
    </section>
  );
}

export function TrendSection({ d, src, code, params }: P) {
  const t = useChartTheme();
  const chart = useRef<ChartHandle>(null);
  const tr = d.trend;
  const an = useAnomalies([code]);
  const flagged = useMemo(() => an.data?.data.anomalies ?? [], [an.data]);
  const option = useMemo(() => ({
    grid: { left: 64, right: 64, top: 30, bottom: 28 },
    legend: { top: 0, textStyle: { color: t.muted }, icon: 'roundRect' },
    aria: { enabled: true, label: { description: 'Domestic and foreign visits by year' } },
    tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: crosshair(t), formatter: (ps: { dataIndex: number }[]) => {
      const p = tr[ps[0].dataIndex];
      return tip(t, { title: String(p.year), synthetic: p.is_synthetic, source: src, rows: [['Domestic', p.domestic_display], ['Domestic YoY', formatPct(p.yoy_domestic_pct, true)], ['Foreign', p.foreign_display], ['Foreign YoY', formatPct(p.yoy_foreign_pct, true)]] });
    } },
    xAxis: { type: 'category', data: tr.map((p) => String(p.year)), boundaryGap: false, axisLabel: { color: t.muted }, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false } },
    yAxis: [
      { type: 'value', name: 'Domestic', nameTextStyle: { color: t.teal, align: 'left' }, splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.teal, formatter: (v: number) => formatCount(v) ?? '' } },
      { type: 'value', name: 'Foreign', nameTextStyle: { color: t.saffron, align: 'right' }, splitLine: { show: false }, axisLabel: { color: t.saffron, formatter: (v: number) => formatCount(v) ?? '' } },
    ],
    series: [
      { name: 'Domestic visits', type: 'line', smooth: 0.2, symbolSize: 6, yAxisIndex: 0, lineStyle: { width: 3, color: t.teal }, itemStyle: { color: t.teal }, emphasis: { focus: 'series' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: t.theme === 'dark' ? 'rgba(45,212,191,.25)' : 'rgba(13,125,116,.22)' }, { offset: 1, color: 'rgba(45,212,191,0)' }] } }, data: tr.map((p) => p.domestic_visits),
        markPoint: anomalyMarkPoint(t, flagged, (a) => tr.find((p) => p.year === a.year)?.domestic_visits ?? null, src) },
      { name: 'Foreign visits', type: 'line', smooth: 0.2, symbolSize: 6, symbol: 'diamond', yAxisIndex: 1, lineStyle: { width: 3, color: t.saffron, type: 'solid' }, itemStyle: { color: t.saffron }, emphasis: { focus: 'series' }, data: tr.map((p) => p.foreign_visits) },
    ],
  }), [tr, flagged, src, t]);
  return (
    <ChartCard title="Domestic vs foreign visits" subtitle="Separate axes, since domestic volumes are far larger" chart={chart} view="trend" params={{ ...params, states: code }}
      table={<DataTable caption="Domestic and foreign visits by year" rows={tr} columns={[{ key: 'y', label: 'Year', render: (r) => r.year }, { key: 'd', label: 'Domestic', align: 'right', render: (r) => r.domestic_display }, { key: 'dy', label: 'YoY', align: 'right', render: (r) => formatPct(r.yoy_domestic_pct, true) ?? 'n/a' }, { key: 'f', label: 'Foreign', align: 'right', render: (r) => r.foreign_display }, { key: 'fy', label: 'YoY', align: 'right', render: (r) => formatPct(r.yoy_foreign_pct, true) ?? 'n/a' }]} />}>
      {tr.length ? <EChart ref={chart} option={option} height={310} ariaLabel="Line chart of domestic and foreign visits by year" /> : <EmptyState hint="No yearly data for this state." />}
      {flagged.length > 0 && <p className="px-2 pt-1 text-[11px] text-muted" role="status"><span className="font-medium text-saffron">Flagged: </span>{anomalyList(flagged)}. <span className="text-faint">{anomalyLegend}.</span></p>}
    </ChartCard>
  );
}

export function SourceCountries({ d, src, code }: P) {
  const t = useChartTheme();
  const chart = useRef<ChartHandle>(null);
  const cs = d.source_countries;
  const option = useMemo(() => ({
    grid: { left: 110, right: 78, top: 6, bottom: 20 },
    aria: { enabled: true, label: { description: 'Foreign visits by source country' } },
    tooltip: { ...tooltipBase(t), trigger: 'item', formatter: (p: { dataIndex: number }) => { const c = cs[p.dataIndex]; return tip(t, { title: c.country, synthetic: c.is_synthetic, source: src, rows: [['Foreign visits', c.display], ['Share', c.share_pct != null ? `${c.share_pct}%` : null]] }); } },
    xAxis: { type: 'value', splitNumber: 3, splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, hideOverlap: true, formatter: (v: number) => formatCount(v) ?? '' } },
    yAxis: { type: 'category', inverse: true, data: cs.map((c) => c.country), axisTick: { show: false }, axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.ink } },
    series: [{ type: 'bar', barWidth: '60%', barMaxWidth: 26, data: cs.map((c, i) => ({ value: c.foreign_visits, itemStyle: { color: c.is_other ? t.faint : t.palette[i % t.palette.length], borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: t.ink, fontSize: 11, formatter: (p: { dataIndex: number }) => `${cs[p.dataIndex].share_pct ?? ''}%` }, ...barFx(t) }],
  }), [cs, src, t]);
  return (
    <ChartCard title="Top foreign source countries" subtitle="Share of the state's foreign visits" chart={chart} csv={{ name: `${code}-source-countries`, source: src, rows: cs.map((c) => ({ country: c.country, foreign_visits: c.foreign_visits, share_pct: c.share_pct, is_other: c.is_other, is_synthetic: c.is_synthetic })) }}
      table={<DataTable caption="Foreign visits by source country" rows={cs} columns={[{ key: 'c', label: 'Country', render: (r) => r.country + (r.is_other ? ' (all others)' : '') }, { key: 'v', label: 'Visits', align: 'right', render: (r) => r.display }, { key: 's', label: 'Share', align: 'right', render: (r) => (r.share_pct != null ? `${r.share_pct}%` : 'n/a') }]} />}>
      {cs.length ? <EChart ref={chart} option={option} height={310} ariaLabel="Bar chart of foreign visits by source country" /> : <EmptyState hint="No source-country data for this state and year." />}
    </ChartCard>
  );
}

export function TopAttractions({ d, src, code }: P) {
  const t = useChartTheme();
  const chart = useRef<ChartHandle>(null);
  const at = d.top_attractions;
  const option = useMemo(() => ({
    grid: { left: 200, right: 78, top: 6, bottom: 20 },
    aria: { enabled: true, label: { description: 'Top attractions by annual footfall' } },
    tooltip: { ...tooltipBase(t), trigger: 'item', formatter: (p: { dataIndex: number }) => { const a = at[p.dataIndex]; return tip(t, { title: a.name, synthetic: a.is_synthetic, source: src, note: `${a.type}${a.is_unesco ? ' · UNESCO' : ''}${a.is_asi_protected ? ' · ASI protected' : ''}`, rows: [[`Footfall (${a.footfall_year})`, a.footfall_display]] }); } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => formatCount(v) ?? '' } },
    yAxis: { type: 'category', inverse: true, data: at.map((a) => `${a.is_unesco ? '★ ' : ''}${a.name}`), axisTick: { show: false }, axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.ink, width: 188, overflow: 'truncate' } },
    series: [{ type: 'bar', barWidth: '60%', barMaxWidth: 30, data: at.map((a) => ({ value: a.annual_footfall, itemStyle: { color: a.is_unesco ? t.saffron : t.teal, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: t.ink, fontSize: 11, formatter: (p: { dataIndex: number }) => at[p.dataIndex].footfall_display ?? '' }, ...barFx(t) }],
  }), [at, src, t]);
  return (
    <ChartCard title="Top attractions by footfall" subtitle="Single-year snapshot. ★ = UNESCO site" chart={chart} csv={{ name: `${code}-attractions`, source: src, rows: at.map((a) => ({ name: a.name, type: a.type, annual_footfall: a.annual_footfall, footfall_year: a.footfall_year, is_unesco: a.is_unesco, is_asi_protected: a.is_asi_protected, is_synthetic: a.is_synthetic })) }}
      table={<DataTable caption="Top attractions" rows={at} columns={[{ key: 'n', label: 'Attraction', render: (r) => r.name }, { key: 't', label: 'Type', render: (r) => r.type }, { key: 'u', label: 'UNESCO', render: (r) => (r.is_unesco ? 'Yes' : '') }, { key: 'f', label: `Footfall`, align: 'right', render: (r) => r.footfall_display }]} />}>
      {at.length ? <EChart ref={chart} option={option} height={310} ariaLabel="Bar chart of top attractions by annual footfall" /> : <EmptyState hint="No attractions listed for this state." />}
    </ChartCard>
  );
}

export function HotelInfra({ d, src, code }: P) {
  const t = useChartTheme();
  const chart = useRef<ChartHandle>(null);
  const h = d.hotel_infrastructure;
  const star = useMemo(() => {
    if (!h) return {};
    const mix = h.star_mix as { class: string; hotels: number; share_pct: number | null }[];
    return {
      grid: { left: 70, right: 70, top: 4, bottom: 16 },
      aria: { enabled: true, label: { description: 'Hotels by class' } },
      tooltip: { ...tooltipBase(t), trigger: 'item', formatter: (p: { dataIndex: number }) => { const m = mix[p.dataIndex]; return tip(t, { title: m.class, synthetic: h.is_synthetic, source: src, rows: [['Hotels', formatNumber(m.hotels)], ['Share', m.share_pct != null ? `${m.share_pct}%` : null]] }); } },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', inverse: true, data: mix.map((m) => m.class), axisTick: { show: false }, axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.ink } },
      series: [{ type: 'bar', barWidth: '58%', data: mix.map((m, i) => ({ value: m.hotels, itemStyle: { color: t.palette[i % t.palette.length], borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', color: t.ink, fontSize: 11, formatter: (p: { dataIndex: number }) => `${formatNumber(mix[p.dataIndex].hotels)} (${mix[p.dataIndex].share_pct ?? '?'}%)` }, ...barFx(t) }],
    };
  }, [h, src, t]);
  const occ = useMemo(() => !h ? {} : ({
    grid: { left: 40, right: 12, top: 10, bottom: 22 },
    aria: { enabled: true, label: { description: 'Hotel occupancy by year' } },
    tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: crosshair(t), formatter: (ps: { dataIndex: number }[]) => tip(t, { title: String(h.occupancy_history[ps[0].dataIndex].year), synthetic: h.is_synthetic, source: src, rows: [['Occupancy', `${h.occupancy_history[ps[0].dataIndex].occupancy_rate}%`]] }) },
    xAxis: { type: 'category', data: h.occupancy_history.map((o) => String(o.year)), boundaryGap: false, axisLabel: { color: t.muted, fontSize: 10 }, axisTick: { show: false }, axisLine: { lineStyle: { color: t.line } } },
    yAxis: { type: 'value', min: 0, max: 100, splitNumber: 2, splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: '{value}%' } },
    series: [{ type: 'line', smooth: 0.2, symbolSize: 5, lineStyle: { width: 2.5, color: t.marigold }, itemStyle: { color: t.marigold }, data: h.occupancy_history.map((o) => o.occupancy_rate) }],
  }), [h, src, t]);
  const tile = (k: string, v: string | number | null) => <div className="rounded-lg border border-line/70 bg-raised/60 p-2.5"><p className="label !text-[10px]">{k}</p><p className="num mt-0.5 text-lg font-semibold">{v ?? 'n/a'}</p></div>;
  return (
    <ChartCard title="Hotel infrastructure" subtitle={h ? `${h.year}` : undefined} chart={chart} synthetic={h?.is_synthetic ?? true} csv={h ? { name: `${code}-hotels`, source: src, rows: (h.star_mix as { class: string; hotels: number; share_pct: number | null }[]).map((m) => ({ year: h.year, class: m.class, hotels: m.hotels, share_pct: m.share_pct, hotel_rooms: h.hotel_rooms, occupancy_rate: h.occupancy_rate, is_synthetic: h.is_synthetic })) } : undefined}
      table={h && <DataTable caption="Hotel infrastructure" rows={h.star_mix as { class: string; hotels: number; share_pct: number | null }[]} columns={[{ key: 'c', label: 'Class', render: (r) => r.class }, { key: 'h', label: 'Hotels', align: 'right', render: (r) => formatNumber(r.hotels) }, { key: 's', label: 'Share', align: 'right', render: (r) => (r.share_pct != null ? `${r.share_pct}%` : 'n/a') }]} />}>
      {!h ? <EmptyState hint="No hotel data for this state and year." /> : (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">{tile('Hotel rooms', h.hotel_rooms_display)}{tile('Hotels', formatNumber(h.hotels_total))}{tile('Homestays', formatNumber(h.registered_homestays))}{tile('Tour operators', formatNumber(h.registered_tour_operators))}</div>
          <div>
            <div className="flex items-baseline justify-between"><span className="label">Occupancy</span><span className="num text-sm font-semibold">{h.occupancy_rate}%</span></div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-line/60" role="meter" aria-valuenow={h.occupancy_rate} aria-valuemin={0} aria-valuemax={100} aria-label="Occupancy rate"><div className="h-full rounded-full bg-marigold transition-all duration-base" style={{ width: `${h.occupancy_rate}%` }} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="label mb-1">Star mix</p><EChart ref={chart} option={star} height={190} ariaLabel="Bar chart of hotels by class" /></div>
            <div><p className="label mb-1">Occupancy over time</p><EChart option={occ} height={190} ariaLabel="Line chart of hotel occupancy by year" /></div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

export function SeasonalitySection({ d, src, code, params }: P) {
  const t = useChartTheme();
  const chart = useRef<ChartHandle>(null);
  const s = d.seasonality;
  const fest = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const f of d.festivals) m.set(f.month, [...(m.get(f.month) ?? []), `${f.name} (${f.type})`]);
    return m;
  }, [d.festivals]);
  const option = useMemo(() => {
    if (!s.months.length) return {};
    return {
      grid: { left: 64, right: 20, top: 26, bottom: 30 },
      aria: { enabled: true, label: { description: `Monthly visits in ${s.year} with festivals marked` } },
      tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: crosshair(t), formatter: (ps: { dataIndex: number }[]) => {
        const m = s.months[ps[0].dataIndex]; const fs = fest.get(m.month);
        return tip(t, { title: `${m.month_name} ${s.year}`, synthetic: m.is_synthetic, source: src, note: fs ? `Festivals: ${fs.join('; ')}` : undefined, rows: [['Total visits', formatCount(m.total_visits)], ['Share of year', `${m.share_of_year_pct}%`], ['Seasonal index', String(m.seasonal_index)], ['Avg temp', `${m.avg_temp_c}°C`], ['Season', m.season]] });
      } },
      xAxis: { type: 'category', data: s.months.map((m) => m.month_name), boundaryGap: false, axisLabel: { color: t.muted }, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false } },
      yAxis: { type: 'value', min: 0, splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => formatCount(v) ?? '' } },
      series: [
        { name: 'Visits', type: 'line', smooth: 0.3, symbolSize: 6, lineStyle: { width: 3, color: t.teal }, itemStyle: { color: t.teal }, data: s.months.map((m) => m.total_visits),
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: t.theme === 'dark' ? 'rgba(45,212,191,.3)' : 'rgba(13,125,116,.25)' }, { offset: 1, color: 'rgba(45,212,191,0)' }] } },
          markPoint: { symbol: 'circle', symbolSize: 10, label: { show: true, color: t.ink, fontSize: 11, position: 'top', formatter: (p: { name: string }) => p.name }, itemStyle: { color: t.saffron },
            data: [{ name: 'Peak', coord: [s.peak_month ? s.months.findIndex((m) => m.month === s.peak_month) : 0, s.months.find((m) => m.month === s.peak_month)?.total_visits ?? 0] }, { name: 'Low', coord: [s.months.findIndex((m) => m.month === s.low_month), s.months.find((m) => m.month === s.low_month)?.total_visits ?? 0] }] } },
        { name: 'Festivals', type: 'scatter', symbol: 'diamond', symbolSize: (v: number[]) => 8 + v[2] * 4, itemStyle: { color: t.marigold, borderColor: t.bg, borderWidth: 1 }, tooltip: { show: false }, z: 5,
          data: s.months.filter((m) => fest.has(m.month)).map((m) => [m.month_name, 0, fest.get(m.month)?.length ?? 0]) },
      ],
    };
  }, [s, fest, src, t]);
  return (
    <ChartCard title="Seasonality and festivals" subtitle={s.months.length ? `${s.year}. Peak ${s.months.find((m) => m.month === s.peak_month)?.month_name}, low ${s.months.find((m) => m.month === s.low_month)?.month_name}. ◆ = festival months` : undefined}
      chart={chart} view="heatmap" params={{ ...params, states: code }}
      table={<DataTable caption="Monthly visits" rows={s.months} columns={[{ key: 'm', label: 'Month', render: (r) => r.month_name }, { key: 'v', label: 'Visits', align: 'right', render: (r) => formatCount(r.total_visits) }, { key: 'i', label: 'Index', align: 'right', render: (r) => r.seasonal_index }, { key: 'f', label: 'Festivals', render: (r) => fest.get(r.month)?.join('; ') ?? '' }]} />}
      footer={d.festivals.length ? <span>{d.festivals.length} festivals and events: {d.festivals.map((f) => `${f.name} (${f.month_name})`).join(', ')}</span> : 'No festivals listed for this state.'}>
      {s.months.length ? <EChart ref={chart} option={option} height={300} ariaLabel="Line chart of monthly visits with festival months marked" /> : <EmptyState hint="No monthly data for this state and year." />}
    </ChartCard>
  );
}

export function RankHistory({ d, src, code }: P) {
  const t = useChartTheme();
  const chart = useRef<ChartHandle>(null);
  const h = d.rank_history;
  const option = useMemo(() => ({
    grid: { left: 44, right: 16, top: 30, bottom: 28 },
    legend: { top: 0, textStyle: { color: t.muted }, icon: 'roundRect' },
    aria: { enabled: true, label: { description: 'Rank by total visits and revenue over time' } },
    tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: crosshair(t), formatter: (ps: { dataIndex: number }[]) => { const r = h[ps[0].dataIndex]; return tip(t, { title: String(r.year), synthetic: r.is_synthetic, source: src, rows: [['Rank by visits', `#${r.rank_total_visits}`], ['Total visits', formatCount(r.total_visits)], ['Rank by revenue', r.rank_revenue != null ? `#${r.rank_revenue}` : null]] }); } },
    xAxis: { type: 'category', data: h.map((r) => String(r.year)), boundaryGap: false, axisLabel: { color: t.muted }, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false } },
    yAxis: { type: 'value', inverse: true, min: 1, minInterval: 1, splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: '#{value}' } },
    series: [
      { name: 'By visits', type: 'line', symbolSize: 7, lineStyle: { width: 3, color: t.teal }, itemStyle: { color: t.teal }, emphasis: { focus: 'series' }, data: h.map((r, i) => ({ value: r.rank_total_visits, label: { show: i === 0 || i === h.length - 1, color: t.ink, fontSize: 10, position: 'top', formatter: '#{c}' } })) },
      { name: 'By revenue', type: 'line', symbolSize: 6, symbol: 'diamond', lineStyle: { width: 2, color: t.saffron, type: 'dashed' }, itemStyle: { color: t.saffron }, emphasis: { focus: 'series' }, data: h.map((r) => r.rank_revenue) },
    ],
  }), [h, src, t]);
  return (
    <ChartCard title="Rank history" subtitle="Among all states and UTs (1 = highest)" chart={chart} csv={{ name: `${code}-rank-history`, source: src, rows: h.map((r) => ({ year: r.year, rank_total_visits: r.rank_total_visits, total_visits: r.total_visits, rank_revenue: r.rank_revenue, is_synthetic: r.is_synthetic })) }}
      table={<DataTable caption="Rank history" rows={h} columns={[{ key: 'y', label: 'Year', render: (r) => r.year }, { key: 'v', label: 'Rank by visits', align: 'right', render: (r) => `#${r.rank_total_visits}` }, { key: 'r', label: 'Rank by revenue', align: 'right', render: (r) => (r.rank_revenue != null ? `#${r.rank_revenue}` : 'n/a') }]} />}>
      {h.length ? <EChart ref={chart} option={option} height={300} ariaLabel="Line chart of rank by total visits and revenue over time" /> : <EmptyState hint="No rank history for this state." />}
    </ChartCard>
  );
}

export function BackLink({ search }: { search: string }) {
  return <Link to={{ pathname: '/overview', search }} className="btn text-sm"><svg aria-hidden width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7.5 2 3.5 6l4 4" /></svg>Back to India</Link>;
}
