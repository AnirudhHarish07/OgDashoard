import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sample } from './helpers';

const GET_ENDPOINTS: [string, string][] = [
  ['/api/health', 'health'], ['/api/filters', 'filters'], ['/api/sources', 'sources'], ['/api/geo/states', 'geo_states'],
  ['/api/overview/kpis', 'overview_kpis'], ['/api/overview/trend', 'overview_trend'], ['/api/rankings', 'rankings_top10_foreign'],
  ['/api/rankings/race', 'rankings_race'], ['/api/compare', 'compare_kl_ga_rj'], ['/api/scatter', 'scatter'],
  ['/api/seasonality/heatmap', 'seasonality_heatmap'], ['/api/seasonality/by-type', 'seasonality_by_type'], ['/api/festivals', 'festivals_october'],
  ['/api/economy', 'economy'], ['/api/infrastructure/demand-capacity', 'infrastructure_demand_capacity'],
  ['/api/infrastructure/occupancy-trend', 'infrastructure_occupancy_trend'], ['/api/covid/recovery', 'covid_recovery'],
  ['/api/forecast', 'forecast_national'], ['/api/anomalies', 'anomalies'], ['/api/insights', 'insights_national'],
];

describe('API client in mock mode (samples/)', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_USE_MOCKS', 'true'); });
  afterEach(() => vi.unstubAllEnvs());

  it.each(GET_ENDPOINTS)('%s serves the real sample response', async (path, file) => {
    const { apiGet } = await import('@/api/client');
    const got = (await apiGet(path as never)) as { data: unknown; meta: { synthetic_share: number; data_sources: string[] } };
    expect(got).toEqual(sample(file));
    expect(typeof got.meta.synthetic_share).toBe('number');
    // health and sources describe the system itself, so they carry no dataset rows (and no data_source)
    if (!['/api/health', '/api/sources'].includes(path)) expect(got.meta.data_sources.length).toBeGreaterThan(0);
  });
  it('picks the right map and forecast variants', async () => {
    const { mockGet } = await import('@/api/mocks');
    expect(await mockGet('/api/map', { metric: 'growth_pct' })).toEqual(sample('map_growth_pct'));
    expect(await mockGet('/api/map', { metric: 'revenue' })).toEqual(sample('map_total_visits'));
    expect(await mockGet('/api/forecast', { state: 'KL' })).toEqual(sample('forecast_kerala_revenue'));
    expect(await mockGet('/api/insights', { state: 'KL' })).toEqual(sample('insights_state_kl'));
  });
  it('serves state detail and the ask response', async () => {
    const { apiGetState, apiAsk } = await import('@/api/client');
    expect(await apiGetState('GA')).toEqual(sample('state_detail_ga'));
    expect(await apiGetState('LA')).toEqual(sample('state_detail_la_2018_no_data'));
    expect(await apiAsk('top 5 states for foreign tourists in 2023')).toEqual(sample('ask_top5_foreign'));
  });
  it('samples have the fields the UI reads (contract check)', () => {
    const kpis = sample<{ data: { kpis: { key: string; display: string; direction: string; is_synthetic: boolean }[] } }>('overview_kpis');
    expect(kpis.data.kpis.map((k) => k.key)).toEqual(['total_domestic', 'total_foreign', 'revenue', 'yoy_growth', 'top_state']);
    const map = sample<{ data: { states: Record<string, unknown>[] } }>('map_total_visits');
    for (const k of ['state_code', 'value', 'display', 'rank', 'is_top10', 'color_bucket', 'yoy_change', 'height', 'is_synthetic']) expect(map.data.states[0]).toHaveProperty(k);
    const geo = sample<{ features: { properties: Record<string, unknown> }[] }>('geo_states');
    for (const k of ['state_code', 'centroid', 'bbox', 'small_state']) expect(geo.features[0].properties).toHaveProperty(k);
    expect(map.data.states.filter((s) => s.is_top10)).toHaveLength(10);
  });
});

describe('API client against a backend', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_USE_MOCKS', 'false'); vi.stubEnv('VITE_API_URL', 'http://api.test'); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('builds URLs with filters and skips empty values', async () => {
    const { buildUrl } = await import('@/api/client');
    expect(buildUrl('/api/map', { metric: 'revenue', year: 2024, states: '', region: undefined, include_synthetic: true })).toBe('http://api.test/api/map?metric=revenue&year=2024&include_synthetic=true');
  });
  it('returns parsed JSON and sends the query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(sample('overview_kpis')), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiGet } = await import('@/api/client');
    const r = await apiGet('/api/overview/kpis', { year: 2024, include_synthetic: true });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/overview/kpis?year=2024&include_synthetic=true');
    expect(r).toEqual(sample('overview_kpis'));
  });
  it('turns the backend error body into an ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(sample('error_unknown_state')), { status: 404 })));
    const { apiGetState, ApiError } = await import('@/api/client');
    const err = await apiGetState('ZZ').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'state_not_found' });
  });
  it('shows the "waking up the server" state when the first request is slow, then clears it', async () => {
    vi.useFakeTimers();
    const { useUi } = await import('@/store/ui'); // same module instance the client uses after resetModules
    let resolve!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((r) => { resolve = r; })));
    const { apiGet } = await import('@/api/client');
    const p = apiGet('/api/health');
    await vi.advanceTimersByTimeAsync(2900);
    expect(useUi.getState().waking).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(useUi.getState().waking).toBe(true);
    resolve(new Response(JSON.stringify(sample('health')), { status: 200 }));
    await p;
    expect(useUi.getState().waking).toBe(false);
  });
  it('builds the CSV export URL', async () => {
    const { exportUrl } = await import('@/api/client');
    expect(exportUrl('map', { metric: 'total_visits', year: 2024 })).toBe('http://api.test/api/export?view=map&format=csv&metric=total_visits&year=2024');
  });
});
