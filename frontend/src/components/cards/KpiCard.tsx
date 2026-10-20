import { useRef } from 'react';
import type { Kpi } from '@/api/types';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import { useTilt } from '@/ui/interactions';
import { CountUp } from './CountUp';

function Arrow({ dir }: { dir: string }) {
  if (dir === 'up') return <svg aria-hidden width="14" height="14" viewBox="0 0 14 14"><path d="M7 11V3m0 0L3.5 6.5M7 3l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (dir === 'down') return <svg aria-hidden width="14" height="14" viewBox="0 0 14 14"><path d="M7 3v8m0 0L3.5 7.5M7 11l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg aria-hidden width="14" height="14" viewBox="0 0 14 14"><path d="M3 7h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

/** KPI card: change arrow vs previous year, 3D tilt with sheen, count-up on first view. */
export function KpiCard({ kpi, previousYear, highlight = false }: { kpi: Kpi; previousYear: number | null; highlight?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useTilt(ref, 8);
  const tone = kpi.direction === 'up' ? 'text-good' : kpi.direction === 'down' ? 'text-bad' : 'text-muted';
  const word = kpi.direction === 'up' ? 'up' : kpi.direction === 'down' ? 'down' : kpi.direction === 'flat' ? 'unchanged' : 'no comparison';
  return (
    <div ref={ref} className={`card relative overflow-hidden p-4 will-change-transform ${highlight ? 'ring-1 ring-saffron/40' : ''}`} data-testid={`kpi-${kpi.key}`}>
      <div data-sheen aria-hidden className="pointer-events-none absolute -inset-1/2 opacity-0 transition-opacity duration-hover" style={{ background: 'radial-gradient(circle at 50% 50%, rgb(var(--ink) / 0.10), transparent 40%)' }} />
      <div className="flex items-start justify-between gap-2">
        <span className="label">{kpi.label}</span>
        <SyntheticBadge show={kpi.is_synthetic} compact align="right" />
      </div>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight">
        {kpi.display ? <CountUp display={kpi.display} /> : <span className="text-base font-normal text-muted">Not available</span>}
      </div>
      {kpi.key === 'top_state' && kpi.state_name && (
        <p className="mt-1 text-sm text-ink">{kpi.state_name}{kpi.share_pct != null && <span className="text-muted"> · {kpi.share_pct}% of India</span>}</p>
      )}
      <div className={`mt-3 flex items-center gap-1.5 text-xs ${tone}`}>
        <Arrow dir={kpi.direction} />
        <span className="font-medium"><span className="sr-only">{word}: </span>{kpi.change_display ?? 'n/a'}</span>
        <span className="text-faint">
          {kpi.previous_display ? `vs ${kpi.previous_display}${previousYear ? ` in ${previousYear}` : ''}` : kpi.note?.startsWith('boundary_change') ? 'not comparable (boundary change)' : 'no previous year'}
        </span>
      </div>
    </div>
  );
}
