import { useEffect, useMemo, useRef, useState } from 'react';
import { useRace } from '@/api/hooks';
import type { RaceResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { Select } from '@/components/filters/controls';
import { formatMetric } from '@/lib/format';
import { regionColour } from '@/lib/colour';
import { RANK_METRICS } from '@/lib/metrics';
import { useMotionEnabled } from '@/ui/interactions';

const STEP_MS = 1100;

function Race({ resp, frame, chartRef }: { resp: RaceResponse; frame: number; chartRef: React.RefObject<ChartHandle> }) {
  const t = useChartTheme();
  const motion = useMotionEnabled();
  const { states, frames, max_value, metric, label } = resp.data;
  const n = Math.max(...frames.map((f) => f.items.length), 1);
  const f = frames[Math.min(frame, frames.length - 1)];
  const option = useMemo(() => {
    const by = new Map(f.items.map((i) => [i.state_code, i]));
    return {
      grid: { left: 150, right: 120, top: 12, bottom: 28 },
      aria: { enabled: true, label: { description: `Bar chart race of ${label}, showing ${f.year}` } },
      animationDuration: 0, animationDurationUpdate: motion ? STEP_MS : 0, animationEasing: 'linear' as const, animationEasingUpdate: 'linear' as const,
      xAxis: { type: 'value', max: max_value ? max_value * 1.12 : 'dataMax', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => formatMetric(metric, v) ?? '' } },
      yAxis: { type: 'category', data: states.map((s) => s.state_name), inverse: true, max: n - 1, animationDuration: 300, animationDurationUpdate: motion ? 300 : 0, axisTick: { show: false }, axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.ink, fontSize: 12 } },
      series: [{
        id: 'race', type: 'bar', realtimeSort: true, barWidth: '64%',
        data: states.map((s) => ({ value: by.get(s.state_code)?.value ?? 0, itemStyle: { color: regionColour(t.theme, s.region), borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', valueAnimation: motion, color: t.ink, fontSize: 11, formatter: (p: { dataIndex: number }) => { const i = by.get(states[p.dataIndex].state_code); return i ? `#${i.rank}  ${i.display}` : ''; } },
        emphasis: { itemStyle: { shadowBlur: 16, shadowColor: t.teal } },
      }],
      graphic: [{ id: 'year', type: 'text', right: 30, bottom: 44, style: { text: String(f.year), font: '700 54px Inter Variable, system-ui, sans-serif', fill: t.theme === 'dark' ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)' }, silent: true }],
    };
  }, [f, states, max_value, metric, label, n, motion, t]);
  return <EChart ref={chartRef} merge option={option} height={Math.max(320, n * 36 + 60)} ariaLabel={`Animated bar chart race of ${label}. Use the play button or the year slider.`} />;
}

export function RaceChart() {
  const [metric, setMetric] = useState('total_visits');
  const q = useRace(metric, 10);
  const chart = useRef<ChartHandle>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const d = q.data?.data;
  const last = (d?.frames.length ?? 1) - 1;

  useEffect(() => { setFrame(0); setPlaying(false); }, [metric, d?.frames.length]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setFrame((f) => { if (f >= last) { setPlaying(false); return f; } return f + 1; }), STEP_MS / speed);
    return () => clearInterval(id);
  }, [playing, speed, last]);

  const year = d?.frames[Math.min(frame, last)]?.year;
  const controls = (
    <div className="flex items-center gap-2">
      <Select label="" allLabel="" value={metric} onChange={(v) => v && setMetric(v)} options={RANK_METRICS.filter((m) => m.value !== 'growth_pct').map((m) => ({ value: m.value, label: m.label }))} />
    </div>
  );
  return (
    <ChartCard
      title="Bar chart race" subtitle={d ? `${d.label} by year. Colour is the region; rank and value are labelled on each bar.` : undefined}
      chart={chart} view="race" params={{ ...q.params, metric, n: 10 }} controls={controls}
      table={d && year != null && <DataTable caption={`Ranking in ${year}`} rows={d.frames[Math.min(frame, last)].items} rowCode={(r) => r.state_code} columns={[
        { key: 'r', label: 'Rank', render: (r) => r.rank }, { key: 's', label: 'State', render: (r) => r.state_name }, { key: 'v', label: d.label, align: 'right', render: (r) => r.display }]} />}
      footer={
        d && d.frames.length > 0 && (
          <div className="flex items-center gap-3">
            <button type="button" className="btn !py-1" aria-label={playing ? 'Pause' : frame >= last ? 'Replay' : 'Play'} onClick={() => { if (!playing && frame >= last) setFrame(0); setPlaying((p) => !p); }}>
              {playing ? <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="2" width="3.5" height="10" /><rect x="8.5" y="2" width="3.5" height="10" /></svg> : <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 2l9 5-9 5z" /></svg>}
              {playing ? 'Pause' : frame >= last ? 'Replay' : 'Play'}
            </button>
            <label htmlFor="race-year" className="label">Year</label>
            <input id="race-year" type="range" min={0} max={last} step={1} value={frame} onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} className="range-thumb h-6 flex-1 appearance-none bg-transparent"
              style={{ backgroundImage: 'linear-gradient(rgb(var(--line)), rgb(var(--line)))', backgroundSize: '100% 3px', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} aria-valuetext={String(year)} />
            <output htmlFor="race-year" className="num w-12 text-right text-sm font-semibold">{year}</output>
            <button type="button" className="btn !py-1 text-xs" aria-pressed={speed === 2} onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}>{speed}x</button>
          </div>
        )
      }
    >
      <QueryBoundary query={q} skeleton={<Skeleton className="h-[380px] w-full" />} isEmpty={(r) => r.data.frames.length === 0} emptyHint="No ranking frames for the current filters.">
        {(r) => <Race resp={r} frame={frame} chartRef={chart} />}
      </QueryBoundary>
    </ChartCard>
  );
}
