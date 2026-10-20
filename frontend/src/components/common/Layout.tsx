import { Suspense, useLayoutEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useUi } from '@/store/ui';
import { useMotionEnabled, useHtmlClasses, Ambient, Cursor, Spotlight } from '@/ui/interactions';
import { FilterBar } from '@/components/filters/FilterBar';
import { WakingBanner } from './WakingBanner';
import { Skeleton } from './States';

const NAV = [
  { to: '/overview', label: 'Overview' },
  { to: '/compare', label: 'Compare' },
  { to: '/seasonality', label: 'Seasonality' },
  { to: '/economy', label: 'Economy' },
  { to: '/covid', label: 'COVID recovery' },
];

function Nav() {
  const { pathname, search } = useLocation();
  const root = useRef<HTMLElement>(null);
  const [ind, setInd] = useState({ x: 0, w: 0, show: false });
  useLayoutEffect(() => {
    const measure = () => {
      const a = root.current?.querySelector<HTMLElement>('[aria-current="page"]');
      setInd(a ? { x: a.offsetLeft, w: a.offsetWidth, show: true } : { x: 0, w: 0, show: false });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [pathname]);
  return (
    <nav ref={root} aria-label="Main" className="relative flex items-center gap-1">
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-0.5 w-[100px] origin-left rounded bg-saffron"
        style={{ transform: `translateX(${ind.x}px) scaleX(${ind.w / 100})`, opacity: ind.show ? 1 : 0, transition: 'transform var(--t-base) var(--ease), opacity var(--t-hover)' }}
      />
      {NAV.map((n) => {
        const active = pathname === n.to || (n.to === '/overview' && pathname.startsWith('/state'));
        return (
          <Link
            key={n.to} to={{ pathname: n.to, search }} aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-4 text-sm transition-colors duration-hover ${active ? 'font-medium text-ink' : 'text-muted hover:text-ink'}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function IconButton({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick} className="btn h-9 w-9 !p-0">
      {children}
    </button>
  );
}

export function Header() {
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const motion = useUi((s) => s.motion);
  const setMotion = useUi((s) => s.setMotion);
  const effective = useMotionEnabled();
  const { search } = useLocation();
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-8 px-6">
        <Link to={{ pathname: '/', search }} className="flex items-center gap-2.5" aria-label="Home: India Tourism Dashboard">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-saffron text-bg">
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 12 6 5l3 4 2-2.5L14 12z" fill="currentColor" /></svg>
          </span>
          <span className="text-sm font-semibold tracking-tight">India Tourism <span className="font-normal text-muted">Dashboard</span></span>
        </Link>
        <Nav />
        <div className="ml-auto flex items-center gap-2">
          <IconButton label={motion ? 'Motion effects on (click to turn off)' : 'Motion effects off (click to turn on)'} pressed={motion} onClick={() => setMotion(!motion)}>
            <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={effective ? 'text-teal' : 'text-faint'}>
              <path d="M3 12c3-6 6-6 9 0s6 6 9 0" />{!effective && <path d="M4 20 20 4" />}
            </svg>
          </IconButton>
          <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
            {theme === 'dark' ? (
              <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" /></svg>
            )}
          </IconButton>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 mx-auto mt-6 max-w-[1600px] px-6 pb-8 text-xs text-faint">
      <p>
        <span className="font-medium text-marigold">Synthetic demo data.</span> Every figure comes from the project's synthetic dataset, not official statistics.
        Map boundaries are derived from a public Census-2011 district map and are not the official Survey of India file.
      </p>
    </footer>
  );
}

function PageFallback() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-6 py-5">
      <div className="grid grid-cols-5 gap-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-[520px]" />
    </div>
  );
}

export function Layout() {
  useHtmlClasses();
  const { pathname } = useLocation();
  return (
    <div className="relative min-h-screen">
      <Ambient />
      <Spotlight />
      <Cursor />
      <div className="relative z-10">
        <WakingBanner />
        <Header />
        {pathname !== '/' && <FilterBar />}
        <main id="main">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
        <Footer />
      </div>
    </div>
  );
}
