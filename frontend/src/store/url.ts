import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEFAULT_FILTERS, selectFilterValues, useFilters, type FilterValues, type VisitorType } from './filters';
import { useUi } from './ui';

/** Filters <-> URL query params so every view is shareable. */
const KEYS = { yearFrom: 'yf', yearTo: 'yt', year: 'y', states: 's', region: 'r', tourismType: 't', visitorType: 'v', cross: 'x' } as const;

export function filtersToSearch(f: FilterValues, cross: string | null): string {
  const p = new URLSearchParams();
  if (f.yearFrom != null) p.set(KEYS.yearFrom, String(f.yearFrom));
  if (f.yearTo != null) p.set(KEYS.yearTo, String(f.yearTo));
  if (f.year != null) p.set(KEYS.year, String(f.year));
  if (f.states.length) p.set(KEYS.states, f.states.join(','));
  if (f.region) p.set(KEYS.region, f.region);
  if (f.tourismType) p.set(KEYS.tourismType, f.tourismType);
  if (f.visitorType !== 'all') p.set(KEYS.visitorType, f.visitorType);
  if (cross) p.set(KEYS.cross, cross);
  const s = p.toString();
  return s ? `?${s}` : '';
}

const int = (v: string | null): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

export function searchToState(search: string): { filters: FilterValues; cross: string | null } {
  const p = new URLSearchParams(search);
  const v = p.get(KEYS.visitorType);
  const visitorType: VisitorType = v === 'domestic' || v === 'foreign' ? v : 'all';
  const codes = (p.get(KEYS.states) ?? '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  return {
    filters: {
      ...DEFAULT_FILTERS,
      yearFrom: int(p.get(KEYS.yearFrom)), yearTo: int(p.get(KEYS.yearTo)), year: int(p.get(KEYS.year)),
      states: codes, region: p.get(KEYS.region) || null, tourismType: p.get(KEYS.tourismType) || null, visitorType,
    },
    cross: p.get(KEYS.cross)?.toUpperCase() || null,
  };
}

/** Mount once inside the Router. Hydrates the stores from the URL, then mirrors store changes back to it. */
export function useUrlSync(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const ready = useRef(false);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    const { filters, cross } = searchToState(window.location.search);
    useFilters.getState().hydrate(filters);
    useUi.getState().setCrossFilter(cross);
    ready.current = true;
    const write = () => {
      if (!ready.current) return;
      const search = filtersToSearch(selectFilterValues(useFilters.getState()), useUi.getState().crossFilter);
      if (search !== window.location.search) navigate({ pathname: pathRef.current, search }, { replace: true });
    };
    const u1 = useFilters.subscribe(write);
    const u2 = useUi.subscribe((s, prev) => {
      if (s.crossFilter !== prev.crossFilter) write();
    });
    write();
    return () => {
      u1();
      u2();
    };
  }, [navigate]);

  // keep the query string when moving between pages
  useEffect(() => {
    if (!ready.current) return;
    const search = filtersToSearch(selectFilterValues(useFilters.getState()), useUi.getState().crossFilter);
    if (search !== location.search) navigate({ pathname: location.pathname, search }, { replace: true });
  }, [location.pathname, location.search, navigate]);
}
