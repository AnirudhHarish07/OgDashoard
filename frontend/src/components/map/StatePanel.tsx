import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useStateDetail } from '@/api/hooks';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import { ErrorState, Skeleton } from '@/components/common/States';

/** Compact drill-down shown in the side panel after the fly-in. The full page lives at /state/:code. */
export function StatePanel({ code, open, onBack }: { code: string | null; open: boolean; onBack: () => void }) {
  const q = useStateDetail(open ? code : null);
  const root = useRef<HTMLElement>(null);
  // React 18 has no boolean `inert` prop: toggle the attribute directly so closed-panel controls aren't focusable
  useEffect(() => { root.current?.toggleAttribute('inert', !open); }, [open]);
  const d = q.data?.data;
  const hist = d?.rank_history ?? [];
  const ranks = hist.map((h) => h.rank_total_visits);
  const lo = Math.min(...ranks), hi = Math.max(...ranks);
  const pts = hist.map((h, i) => `${(i / Math.max(1, hist.length - 1)) * 220 + 4},${hi === lo ? 20 : ((h.rank_total_visits - lo) / (hi - lo)) * 32 + 4}`).join(' ');
  return (
    <aside
      ref={root} aria-label="State details" aria-hidden={!open}
      className="card absolute bottom-3 right-3 top-3 z-20 flex w-[440px] flex-col overflow-hidden"
      style={{ transform: open ? 'translate3d(0,0,0)' : 'translate3d(calc(100% + 24px),0,0)', opacity: open ? 1 : 0, transition: 'transform var(--t-base) var(--ease), opacity var(--t-base) var(--ease)', pointerEvents: open ? 'auto' : 'none' }}
    >
      <div className="flex items-center gap-2 border-b border-line/70 px-4 py-3">
        <button type="button" className="btn !py-1 text-xs" onClick={onBack}>
          <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7.5 2 3.5 6l4 4" /></svg>
          Back to India
        </button>
        {code && <Link className="ml-auto text-xs text-teal hover:underline" to={{ pathname: `/state/${code}`, search: window.location.search }}>Open full page</Link>}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {q.isError && !d && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
        {!d && !q.isError && <><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-40" /></>}
        {d && (
          <>
            <div>
              <div className="flex items-center gap-2"><h2 className="text-xl font-semibold">{d.profile.state_name}</h2><SyntheticBadge show={d.profile.is_synthetic} compact /></div>
              <p className="text-xs text-muted">{d.profile.region}{d.profile.capital ? ` · capital ${d.profile.capital}` : ''}{d.profile.population_display ? ` · population ${d.profile.population_display}` : ''}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {d.profile.tourism_types.map((t) => <span key={t} className="chip !py-0.5 capitalize">{t}</span>)}
                <span className="chip !py-0.5">{d.profile.unesco_count} UNESCO site{d.profile.unesco_count === 1 ? '' : 's'}</span>
                <span className="chip !py-0.5">{d.profile.airports ?? 'n/a'} airports{d.profile.international_airports != null ? ` (${d.profile.international_airports} intl)` : ''}</span>
              </div>
            </div>
            {d.kpis.length === 0 ? (
              <p className="rounded-lg border border-line p-3 text-sm text-muted" role="status">Not available: {d.notes[0] ?? 'no tourism data for this year.'}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {d.kpis.slice(0, 8).map((k) => (
                  <div key={k.key} className="rounded-lg border border-line/70 bg-raised/60 p-2.5">
                    <p className="label !text-[10px]">{k.label}</p>
                    <p className="num mt-0.5 text-base font-semibold">{k.display ?? 'n/a'}</p>
                    <p className={`num text-[11px] ${k.direction === 'up' ? 'text-good' : k.direction === 'down' ? 'text-bad' : 'text-muted'}`}>
                      {k.direction === 'up' ? '▲ ' : k.direction === 'down' ? '▼ ' : ''}{k.change_display ?? 'no comparison'}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {hist.length > 1 && (
              <div className="rounded-lg border border-line/70 p-3">
                <p className="label mb-1">Rank by total visits, {hist[0].year} to {hist[hist.length - 1].year}</p>
                <svg viewBox="0 0 228 40" className="h-10 w-full" role="img" aria-label={`Rank moved from ${hist[0].rank_total_visits} to ${hist[hist.length - 1].rank_total_visits}`}>
                  <polyline points={pts} fill="none" stroke="rgb(var(--teal))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
                <p className="num mt-0.5 flex justify-between text-[11px] text-muted"><span>#{hist[0].rank_total_visits}</span><span>#{hist[hist.length - 1].rank_total_visits}</span></p>
              </div>
            )}
            <p className="text-[11px] text-faint">Full domestic/foreign trend, source countries, attractions, hotels, seasonality, festivals and forecast are on the drill-down page.</p>
          </>
        )}
      </div>
    </aside>
  );
}
