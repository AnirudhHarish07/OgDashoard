import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useGeo, useKpis } from '@/api/hooks';
import { CountUp } from '@/components/cards/CountUp';
import { IndiaSilhouette } from '@/components/common/IndiaSilhouette';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import { Skeleton } from '@/components/common/States';
import { useMagnetic, useParallax } from '@/ui/interactions';

export default function Home() {
  const geo = useGeo();
  const kpis = useKpis();
  const { search } = useLocation();
  const stage = useRef<HTMLDivElement>(null);
  const cta = useRef<HTMLAnchorElement>(null);
  useParallax(stage, 40);
  useMagnetic(cta, 0.35, 100);
  const wanted = ['total_domestic', 'total_foreign', 'revenue'];
  const shown = wanted.map((k) => kpis.data?.data.kpis.find((x) => x.key === k)).filter((k) => !!k);
  return (
    <div ref={stage} className="relative isolate flex min-h-[calc(100vh-56px)] items-center overflow-hidden">
      {/* parallax layers: each moves at its own speed. The outer div centres, the inner one is moved by the parallax transform */}
      <div aria-hidden className="pointer-events-none absolute -right-24 top-1/2 -z-10 h-[780px] w-[780px] -translate-y-1/2">
        <div data-depth="0.25" className="h-full w-full rounded-full opacity-70 blur-3xl" style={{ background: 'radial-gradient(circle, rgb(var(--saffron) / 0.28), rgb(var(--teal) / 0.12) 50%, transparent 70%)' }} />
      </div>
      <div aria-hidden className="pointer-events-none absolute right-[3%] top-1/2 -z-10 h-[700px] w-[640px] -translate-y-1/2">
        <div data-depth="0.55" className="h-full w-full opacity-35 blur-md"><IndiaSilhouette geo={geo.data} className="h-full w-full" /></div>
      </div>
      <div aria-hidden className="pointer-events-none absolute right-[5%] top-1/2 -z-10 h-[620px] w-[560px] -translate-y-1/2">
        <div data-depth="1" className="h-full w-full drop-shadow-[0_30px_50px_rgba(0,0,0,0.45)]"><IndiaSilhouette geo={geo.data} className="h-full w-full" /></div>
      </div>

      <div className="relative mx-auto w-full max-w-[1600px] px-10">
        <div className="max-w-[640px]" data-depth="0.15">
          <p className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-saffron">
            State-wise tourism analytics <SyntheticBadge compact />
          </p>
          <h1 className="text-[56px] font-semibold leading-[1.04] tracking-tight">
            India, <span className="bg-gradient-to-r from-saffron via-marigold to-teal bg-clip-text text-transparent">state by state.</span>
          </h1>
          <p className="mt-5 max-w-[520px] text-lg leading-relaxed text-muted">
            Explore domestic and foreign visits, revenue, seasonality, infrastructure and COVID recovery across every state and union territory.
          </p>

          <div className="mt-9 flex gap-4" role="list" aria-label="Headline figures">
            {kpis.isLoading || !kpis.data
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[84px] w-[170px]" />)
              : shown.map((k) => (
                <div key={k.key} role="listitem" className="card min-w-[170px] px-4 py-3">
                  <p className="label">{k.label}</p>
                  <p className="mt-1 text-2xl font-semibold">{k.display ? <CountUp display={k.display} /> : 'n/a'}</p>
                  <p className={`num text-xs ${k.direction === 'up' ? 'text-good' : k.direction === 'down' ? 'text-bad' : 'text-muted'}`}>
                    {k.direction === 'up' ? '▲ ' : k.direction === 'down' ? '▼ ' : ''}{k.change_display ?? ''}
                  </p>
                </div>
              ))}
          </div>

          <Link
            ref={cta} to={{ pathname: '/overview', search }}
            className="mt-10 inline-flex items-center gap-3 rounded-full bg-saffron px-7 py-3.5 text-base font-semibold text-bg shadow-[0_10px_40px_-10px_rgb(var(--saffron)/0.7)] will-change-transform hover:brightness-110"
          >
            Explore the dashboard
            <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9h12m0 0-5-5m5 5-5 5" /></svg>
          </Link>
          {kpis.isError && <p role="alert" className="mt-4 text-sm text-bad">Couldn't load the headline figures. The dashboard is still available.</p>}
        </div>
      </div>
    </div>
  );
}
