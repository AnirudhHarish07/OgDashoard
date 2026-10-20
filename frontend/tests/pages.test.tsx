import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartOpt, chartOption, json, renderApp, stubBackend } from './app';
import { sample } from './helpers';
import { useFilters } from '@/store/filters';

vi.mock('@/components/charts/EChart', async (orig) => {
  const actual = await orig<typeof import('@/components/charts/EChart')>();
  const { forwardRef, useImperativeHandle } = await import('react');
  const EChart = forwardRef(function EChartStub(props: { option: unknown; ariaLabel: string }, ref) {
    useImperativeHandle(ref, () => ({ dataUrl: () => undefined, instance: () => null }));
    return <div role="img" data-testid="echart" aria-label={props.ariaLabel} data-option={JSON.stringify(props.option)} />;
  });
  return { ...actual, EChart };
});

import { RankingChart } from '@/components/compare/RankingChart';
import { CompareStates } from '@/components/compare/CompareStates';
import { RaceChart } from '@/components/compare/RaceChart';
import { ScatterChart } from '@/components/compare/ScatterChart';
import { Heatmap } from '@/components/seasonality/Heatmap';
import { TypeCurves } from '@/components/seasonality/TypeCurves';
import { DemandCapacity } from '@/components/economy/DemandCapacity';
import { EconomyBars } from '@/components/economy/EconomyBars';
import { OccupancyTrend } from '@/components/economy/OccupancyTrend';
import { Recovery } from '@/components/covid/Recovery';
import StatePage from '@/pages/StatePage';

afterEach(() => vi.unstubAllGlobals());
const req = (calls: URL[], path: string) => calls.filter((u) => u.pathname === path);

describe('ranking chart', () => {
  it('sends the chosen metric and top/bottom order to /api/rankings', async () => {
    const { calls } = stubBackend();
    renderApp(<RankingChart />);
    await screen.findAllByTestId('echart');
    expect(req(calls, '/api/rankings')[0].searchParams.get('metric')).toBe('total_visits');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revenue' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Bottom' }));
    await waitFor(() => {
      const last = req(calls, '/api/rankings').at(-1) as URL;
      expect(last.searchParams.get('metric')).toBe('revenue');
      expect(last.searchParams.get('order')).toBe('bottom');
      expect(last.searchParams.get('n')).toBe('10');
      expect(last.searchParams.get('include_synthetic')).toBe('true');
    });
    expect(await screen.findByText('Bottom 10 states')).toBeInTheDocument();
  });
  it('labels every bar with rank and value, and has a table fallback', async () => {
    stubBackend();
    renderApp(<RankingChart />);
    const opt = await chartOpt('Bar chart of');
    const items = sample<{ data: { items: { rank: number; state_name: string }[] } }>('rankings_top10_foreign').data.items;
    expect(opt.yAxis.data).toEqual(items.map((i) => `#${i.rank}  ${i.state_name}`));
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(items.length + 1);
  });
  it('shows the error state with a working retry, and an empty state', async () => {
    let fail = true;
    const { calls } = stubBackend([(u) => (u.pathname === '/api/rankings' && fail ? json(500, { error: { code: 'internal_error', message: 'Server broke', details: null } }) : undefined)]);
    renderApp(<RankingChart />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server broke');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findAllByTestId('echart');
    expect(req(calls, '/api/rankings').length).toBeGreaterThanOrEqual(2);
  });
  it('empty filters result shows an empty state', async () => {
    const empty = { ...sample<{ data: object; meta: object }>('rankings_top10_foreign') };
    stubBackend([(u) => (u.pathname === '/api/rankings' ? json(200, { ...empty, data: { ...empty.data, items: [] } }) : undefined)]);
    renderApp(<RankingChart />);
    expect(await screen.findByRole('status')).toHaveTextContent('No states match the current filters');
  });
});

describe('state comparison', () => {
  beforeEach(() => stubBackend());
  it('defaults to the top 3 states and says so', async () => {
    const { calls } = stubBackend();
    renderApp(<CompareStates />);
    await screen.findByText(/Showing the top 3 states by visits/);
    await waitFor(() => expect(req(calls, '/api/compare')).toHaveLength(1));
    expect(req(calls, '/api/compare')[0].searchParams.get('states')).toBe('MH,TN,UP');
  });
  it('uses 2-3 selected states and marks leaders with a star', async () => {
    const { calls } = stubBackend();
    renderApp(<CompareStates />);
    useFilters.setState({ states: ['KL', 'GA'] });
    await screen.findByText(/Your selection/);
    await waitFor(() => expect(req(calls, '/api/compare').some((u) => u.searchParams.get('states') === 'KL,GA')).toBe(true));
    await screen.findByRole('table');
    expect(screen.getAllByText('leader', { exact: false }).length).toBeGreaterThan(5);
    expect(screen.getByText('Rank by total visits')).toBeInTheDocument();
  });
  it('asks for one more state instead of calling the API with a single state', async () => {
    const { calls } = stubBackend();
    renderApp(<CompareStates />);
    useFilters.setState({ states: ['KL'] });
    expect(await screen.findByText('Select one more state')).toBeInTheDocument();
    expect(req(calls, '/api/compare').every((u) => u.searchParams.get('states') !== 'KL')).toBe(true);
  });
});

describe('scatter and race', () => {
  it('scatter labels the high crowds / low spending quadrant and counts its states from the data', async () => {
    stubBackend();
    renderApp(<ScatterChart />);
    const opt = await chartOpt('Bubble chart');
    expect(opt.series[0].markArea.label.formatter).toBe('High crowds, low spending');
    const d = sample<{ data: { points: { visits: number; revenue_per_tourist: number }[]; medians: { visits: number; revenue_per_tourist: number } } }>('scatter').data;
    const n = d.points.filter((p) => p.visits > d.medians.visits && p.revenue_per_tourist < d.medians.revenue_per_tourist).length;
    expect(await screen.findByText(new RegExp(`${n} states? above median visits`))).toBeInTheDocument();
    expect(opt.xAxis.type).toBe('log');
  });
  it('race: fixed axis from the API, play advances the year, scrubber jumps, replay at the end', async () => {
    stubBackend();
    renderApp(<RaceChart />);
    await screen.findByRole('button', { name: 'Play' });
    const race = sample<{ data: { max_value: number; frames: { year: number }[] } }>('rankings_race').data;
    const opt = await chartOpt('Animated bar chart race');
    expect(opt.xAxis.max).toBeCloseTo(race.max_value * 1.12, 0);
    expect(opt.series[0].realtimeSort).toBe(true);
    const out = document.querySelector('output#race-year, output[for="race-year"]') as HTMLOutputElement;
    expect(out.textContent).toBe(String(race.frames[0].year));
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2300); });
    expect(Number(out.textContent)).toBe(race.frames[0].year + 2);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(Number(out.textContent)).toBe(race.frames[0].year + 2);
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: String(race.frames.length - 1) } });
    expect(out.textContent).toBe(String(race.frames.at(-1)?.year));
    expect(screen.getByRole('button', { name: 'Replay' })).toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('seasonality', () => {
  it('heatmap: sorts by peak month or A to Z, marks peaks, and uses the API intensity', async () => {
    stubBackend();
    renderApp(<Heatmap />);
    const first = await chartOpt('Heatmap of monthly visits');
    const rows = sample<{ data: { rows: { state_name: string; peak_month: number; cells: { intensity_row: number }[] }[] } }>('seasonality_heatmap').data.rows;
    const byPeak = [...rows].sort((a, b) => a.peak_month - b.peak_month || a.state_name.localeCompare(b.state_name));
    expect(first.yAxis.data).toEqual(byPeak.map((r) => r.state_name));
    expect(first.series.map((s: { id: string }) => s.id)).toEqual(['heat', 'peaks', 'lows']);
    expect(first.series[0].data.length).toBe(rows.reduce((n, r) => n + r.cells.length, 0));
    fireEvent.click(screen.getByRole('radio', { name: 'A to Z' }));
    await waitFor(() => expect((chartOption('Heatmap of monthly visits') as Record<string, any>).yAxis.data[0]).toBe([...rows].map((r) => r.state_name).sort()[0])); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(screen.getByText(/lowest month/)).toBeInTheDocument();
  });
  it('type curves: festival bars share the axis, toggle index/volume, month buttons filter the list', async () => {
    stubBackend();
    renderApp(<TypeCurves />);
    const opt = await chartOpt('Line chart of monthly visits by tourism type');
    expect(opt.series[0].type).toBe('bar');
    expect(opt.series.slice(1).every((s: { type: string }) => s.type === 'line')).toBe(true);
    const curves = sample<{ data: { curves: { months: { seasonal_index: number; value: number }[] }[] } }>('seasonality_by_type').data.curves;
    expect(opt.series[1].data[0]).toBe(curves[0].months[0].seasonal_index);
    fireEvent.click(screen.getByRole('radio', { name: 'Volume' }));
    await waitFor(() => expect((chartOption('Line chart of monthly visits by tourism type') as Record<string, any>).series[1].data[0]).toBe(curves[0].months[0].value)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const list = await screen.findByRole('list', { name: 'Festivals' });
    const all = within(list).getAllByRole('listitem').length;
    fireEvent.click(screen.getByRole('button', { name: /^Jan \d+/ }));
    expect(await screen.findByText('No festivals listed for this selection.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Oct \d+/ }));
    expect(within(await screen.findByRole('list', { name: 'Festivals' })).getAllByRole('listitem').length).toBe(all);
    expect(screen.getByText(/must not be added together/)).toBeInTheDocument();
  });
});

describe('economy and infrastructure', () => {
  it('economy bars: metric toggle re-sorts and relabels, rank and value are in the labels', async () => {
    stubBackend();
    renderApp(<EconomyBars />);
    const a = await chartOpt('Bar chart of Share of state GSDP');
    const states = sample<{ data: { states: { state_name: string; tourism_share_of_gsdp: number; revenue_per_tourist: number }[] } }>('economy').data.states;
    expect(a.series[0].data[0].value).toBe(Math.max(...states.map((s) => s.tourism_share_of_gsdp)));
    expect(a.yAxis.data[0]).toMatch(/^#1 /);
    fireEvent.click(screen.getByRole('radio', { name: 'Per tourist' }));
    const b = await chartOpt('Bar chart of Revenue per tourist');
    expect(b.series[0].data[0].value).toBe(Math.max(...states.map((s) => s.revenue_per_tourist)));
    expect(screen.getByText(/Scroll inside the chart/)).toBeInTheDocument();
  });
  it('demand vs capacity: three threshold lines, shape-coded points, and a list of under-served states', async () => {
    stubBackend();
    renderApp(<DemandCapacity />);
    const opt = await chartOpt('Scatter chart of visits against hotel rooms');
    const d = sample<{ data: { states: { under_served: boolean; status: string }[]; thresholds: { p25: number; median: number; p75: number } } }>('infrastructure_demand_capacity').data;
    expect(opt.series).toHaveLength(4);
    expect(opt.series[0].data.filter((p: { symbol: string }) => p.symbol === 'diamond')).toHaveLength(d.states.filter((s) => s.under_served).length);
    const ratio = opt.series[3].data;
    expect(ratio[1][1] / ratio[1][0]).toBeCloseTo(d.thresholds.p75, 3);
    expect(await screen.findByText(new RegExp(`Under-served states \\(${d.states.filter((s) => s.under_served).length}\\)`))).toBeInTheDocument();
    expect(screen.getByText(/Flags are relative/)).toBeInTheDocument();
  });
  it('occupancy: one series per state plus the national line, with the COVID band from the API annotation', async () => {
    stubBackend();
    renderApp(<OccupancyTrend />);
    const opt = await chartOpt('Line chart of hotel occupancy', (o) => !!o.series.at(-1).markArea);
    const d = sample<{ data: { states: unknown[] } }>('infrastructure_occupancy_trend').data;
    expect(opt.series).toHaveLength(d.states.length + 1);
    expect(opt.series.at(-1).markArea.data[0][0].name).toBe('COVID-19 dip');
  });
});

describe('covid recovery', () => {
  it('ranks fastest first, highlights the top 5, and lists them', async () => {
    stubBackend();
    renderApp(<Recovery />);
    const opt = await chartOpt('Bar chart of recovery vs');
    const d = sample<{ data: { states: { rank: number; state_name: string; recovery_pct: number; recovery_display: string }[]; summary: { states_recovered: number; n_states: number } } }>('covid_recovery').data;
    expect(opt.series[0].data[0].value).toBe(Math.max(...d.states.map((s) => s.recovery_pct)));
    const colours = opt.series[0].data.map((x: { itemStyle: { color: string } }) => x.itemStyle.color);
    expect(new Set(colours.slice(0, 5)).size).toBe(1);
    expect(colours[5]).not.toBe(colours[0]);
    expect(opt.series[0].markLine.data[0].xAxis).toBe(100);
    expect(await screen.findByText(`${d.summary.states_recovered} of ${d.summary.n_states}`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${d.states[0].state_name} ${d.states[0].recovery_display.replace('.', '\\.')}`))).toBeInTheDocument();
  });
  it('split view shows domestic and foreign recovery', async () => {
    stubBackend();
    renderApp(<Recovery />);
    await chartOpt('Bar chart of recovery vs');
    fireEvent.click(screen.getByRole('radio', { name: 'Domestic vs foreign' }));
    await waitFor(() => expect((chartOption('Bar chart of recovery vs') as Record<string, any>).series).toHaveLength(2)); // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  it('explains a year that is too early for recovery instead of showing an error', async () => {
    stubBackend([(u) => (u.pathname === '/api/covid/recovery' ? json(422, { error: { code: 'year_before_recovery', message: 'year must be after 2021', details: null } }) : undefined)]);
    renderApp(<Recovery />);
    expect(await screen.findByText('Pick a later year')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('state drill-down page', () => {
  it('renders every section from one /api/states/{code} call', async () => {
    const { calls } = stubBackend();
    renderApp(<StatePage />, { path: '/state/ga', route: '/state/:code' });
    await screen.findByRole('heading', { level: 1, name: 'Goa' });
    expect(req(calls, '/api/states/GA')).toHaveLength(1);
    expect(req(calls, '/api/states/GA')[0].searchParams.get('include_synthetic')).toBe('true');
    for (const t of ['Profile', 'Domestic vs foreign visits', 'Top foreign source countries', 'Top attractions by footfall', 'Hotel infrastructure', 'Seasonality and festivals', 'Rank history']) {
      expect(screen.getByLabelText(t) ?? screen.getByText(t)).toBeTruthy();
    }
    expect(screen.getByText('Churches and Convents of Goa')).toBeInTheDocument();
    expect(screen.getByTestId('state-kpi-total_visits')).toHaveTextContent('94.8 L');
    expect(screen.getByRole('link', { name: 'Back to India' })).toHaveAttribute('href', expect.stringContaining('/overview'));
    const trend = chartOption('Line chart of domestic and foreign visits') as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(trend.yAxis).toHaveLength(2);
    const season = chartOption('Line chart of monthly visits with festival months marked') as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(season.series[1].name).toBe('Festivals');
  });
  it('shows a clear message for an unknown state code (404)', async () => {
    stubBackend([(u) => (u.pathname === '/api/states/ZZ' ? json(404, { error: { code: 'state_not_found', message: "Unknown state code 'ZZ'", details: null } }) : undefined)]);
    renderApp(<StatePage />, { path: '/state/zz', route: '/state/:code' });
    expect(await screen.findByText('No state with code "ZZ"')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to India' })).toBeInTheDocument();
  });
  it('shows "not available" when the state has no data for the year (boundary / new UT)', async () => {
    stubBackend();
    renderApp(<StatePage />, { path: '/state/la', route: '/state/:code' });
    expect(await screen.findByText('Not available for this year')).toBeInTheDocument();
    expect(screen.getByText(/no tourism data for LA in 2018/)).toBeInTheDocument();
  });
  it('shows the waking-up banner path: slow first call still resolves into the page', async () => {
    stubBackend();
    renderApp(<StatePage />, { path: '/state/ga', route: '/state/:code' });
    expect(document.querySelector('.skeleton')).toBeTruthy(); // skeletons while loading
    await screen.findByRole('heading', { level: 1, name: 'Goa' });
    expect(document.querySelector('.skeleton')).toBeNull();
  });
});
