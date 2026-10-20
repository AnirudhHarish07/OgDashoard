import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiGet, apiGetState, type GetPath, type GetResponse, type Query } from './client';
import { useFilters, type FilterValues } from '@/store/filters';
import { useUi } from '@/store/ui';

export type ParamMode = 'year' | 'range' | 'none';

export function buildParams(f: FilterValues, cross: string | null, mode: ParamMode, useCross: boolean, bounds?: { first: number; last: number }): Query {
  const p: Query = { visitor_type: f.visitorType, include_synthetic: true };
  if (mode === 'year') p.year = f.year ?? bounds?.last;
  if (mode === 'range') {
    p.year_from = f.yearFrom ?? bounds?.first;
    p.year_to = f.yearTo ?? bounds?.last;
  }
  const states = useCross && cross ? [cross] : f.states;
  if (states.length) p.states = states.join(',');
  if (f.region) p.region = f.region;
  if (f.tourismType) p.tourism_type = f.tourismType;
  return p;
}

/** Dataset year bounds, from /api/filters (never hard-coded). */
export function useFiltersMeta() {
  return useQuery({ queryKey: ['filters'], queryFn: ({ signal }) => apiGet('/api/filters', undefined, signal), staleTime: Infinity });
}

export function useBounds(): { first: number; last: number } | null {
  const years = useFiltersMeta().data?.data.years;
  return years?.length ? { first: years[0], last: years[years.length - 1] } : null;
}

/** The active filters resolved against the dataset bounds. */
export function useResolved() {
  const f = useFilters();
  const bounds = useBounds();
  return {
    ready: bounds != null,
    bounds,
    yearFrom: f.yearFrom ?? bounds?.first ?? null,
    yearTo: f.yearTo ?? bounds?.last ?? null,
    year: f.year ?? f.yearTo ?? bounds?.last ?? null,
  };
}

interface Opts { mode?: ParamMode; crossFilter?: boolean; extra?: Query; enabled?: boolean }

/** Generic GET hook: active filters (and optionally the map cross-filter) are applied to every call. */
export function useEndpoint<P extends GetPath>(path: P, opts: Opts = {}): UseQueryResult<GetResponse<P>> & { params: Query } {
  const { mode = 'none', crossFilter = true, extra, enabled = true } = opts;
  const f = useFilters();
  const cross = useUi((s) => s.crossFilter);
  const bounds = useBounds();
  const params = { ...buildParams(f, cross, mode, crossFilter, bounds ?? undefined), ...extra };
  const q = useQuery({
    queryKey: [path, params],
    queryFn: ({ signal }) => apiGet(path, params, signal),
    enabled: enabled && (mode === 'none' || bounds != null),
    placeholderData: (prev) => prev,
  });
  return Object.assign(q, { params }) as UseQueryResult<GetResponse<P>> & { params: Query };
}

export const useGeo = () =>
  useQuery({ queryKey: ['geo'], queryFn: ({ signal }) => apiGet('/api/geo/states', undefined, signal), staleTime: Infinity });

export const useKpis = () => useEndpoint('/api/overview/kpis', { mode: 'year' });
export const useTrend = () => useEndpoint('/api/overview/trend', { mode: 'none' });
export const useInsights = (state?: string | null) => useEndpoint('/api/insights', { mode: 'year', extra: state ? { state } : undefined });
/** The map shows every state: filters apply, the click cross-filter does not. */
export const useMapData = (metric: string) => useEndpoint('/api/map', { mode: 'year', crossFilter: false, extra: { metric } });

export function useStateDetail(code: string | null) {
  const f = useFilters();
  const bounds = useBounds();
  const year = f.year ?? f.yearTo ?? bounds?.last;
  return useQuery({
    queryKey: ['state', code, year],
    queryFn: ({ signal }) => apiGetState(code as string, { year, include_synthetic: true }, signal),
    enabled: !!code && year != null,
    placeholderData: (prev) => prev,
  });
}

// ---- comparison ----------------------------------------------------------------------------------
export const useRankings = (metric: string, order: 'top' | 'bottom', n = 10) =>
  useEndpoint('/api/rankings', { mode: 'year', crossFilter: false, extra: { metric, order, n } });
export const useRace = (metric: string, n = 10) => useEndpoint('/api/rankings/race', { mode: 'range', crossFilter: false, extra: { metric, n } });
export const useScatter = () => useEndpoint('/api/scatter', { mode: 'year', crossFilter: false });
/** Compare needs exactly 2-3 states; `states` is passed explicitly and replaces the filter selection. */
export function useCompare(codes: string[]) {
  const ok = codes.length >= 2 && codes.length <= 3;
  return useEndpoint('/api/compare', { mode: 'year', crossFilter: false, enabled: ok, extra: { states: codes.join(',') } });
}

// ---- seasonality ----------------------------------------------------------------------------------
export const useHeatmap = () => useEndpoint('/api/seasonality/heatmap', { mode: 'year', crossFilter: false });
export const useByType = () => useEndpoint('/api/seasonality/by-type', { mode: 'year', crossFilter: false });
export const useFestivals = () => useEndpoint('/api/festivals', { mode: 'none', crossFilter: false });

// ---- economy / infrastructure / covid --------------------------------------------------------------
export const useEconomy = () => useEndpoint('/api/economy', { mode: 'year', crossFilter: false });
export const useDemandCapacity = () => useEndpoint('/api/infrastructure/demand-capacity', { mode: 'year', crossFilter: false });
export const useOccupancy = () => useEndpoint('/api/infrastructure/occupancy-trend', { mode: 'range', crossFilter: false });
export const useCovid = () => useEndpoint('/api/covid/recovery', { mode: 'year', crossFilter: false });
