import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartOpt, json, renderApp, stubBackend } from './app';
import { sample } from './helpers';
import { useUi } from '@/store/ui';
import { toCsv } from '@/lib/csv';
import { analyse, formatCell } from '@/components/ask/analyse';
import { describeError } from '@/components/ask/AskDrawer';
import { ApiError } from '@/api/client';
import { anomalyList, anomalyMarkPoint } from '@/components/charts/anomaly';
import { ExportMenu } from '@/components/charts/ExportMenu';

vi.mock('@/components/charts/EChart', async (orig) => {
  const actual = await orig<typeof import('@/components/charts/EChart')>();
  const { forwardRef, useImperativeHandle } = await import('react');
  const EChart = forwardRef(function EChartStub(props: { option: unknown; ariaLabel: string }, ref) {
    useImperativeHandle(ref, () => ({ dataUrl: () => undefined, instance: () => null }));
    return <div role="img" data-testid="echart" aria-label={props.ariaLabel} data-option={JSON.stringify(props.option)} />;
  });
  return { ...actual, EChart };
});

import { AskDrawer } from '@/components/ask/AskDrawer';
import { ForecastSection } from '@/components/state/ForecastSection';
import { TrendSection } from '@/components/state/sections';
import type { StateDetail } from '@/api/types';

afterEach(() => vi.unstubAllGlobals());
const askBody = () => sample<{ data: { rows: Record<string, unknown>[] } }>('ask_top5_foreign');
const openAsk = () => { act(() => { useUi.setState({ askOpen: true }); }); };
const ask = async (text: string) => {
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
};
const askErr = (status: number, code: string, message = 'x') => (u: URL) => (u.pathname === '/api/ask' ? json(status, { error: { code, message, details: null } }) : undefined);

describe('Ask the data: states', () => {
  beforeEach(() => stubBackend());
  it('empty: shows example questions and a disabled Ask button', () => {
    renderApp(<AskDrawer />); openAsk();
    const dlg = screen.getByRole('dialog', { name: 'Ask the data' });
    expect(dlg).toHaveAttribute('data-state', 'empty');
    expect(within(dlg).getAllByRole('button').filter((b) => b.className.includes('chip')).length).toBeGreaterThanOrEqual(5);
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
  });
  it('typing: validates the length and enables Ask', () => {
    renderApp(<AskDrawer />);
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'ab' } });
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('data-state', 'typing');
    expect(screen.getByText('At least 3 characters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'top 5 states' } });
    expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'x'.repeat(520) } });
    expect(screen.getByText(/Too long/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
  });
  it('loading then result: posts the question, shows a loading state, renders a bar chart and the SQL', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const h = stubBackend([(u) => (u.pathname === '/api/ask' ? (undefined) : undefined)]);
    const real = h.fetch.getMockImplementation() as (i: string | URL, init?: RequestInit) => Promise<Response>;
    h.fetch.mockImplementation(async (i: string | URL, init?: RequestInit) => { if (String(i).includes('/api/ask')) await gate; return real(i, init); });
    renderApp(<AskDrawer />); openAsk();
    await ask('top 5 states for foreign tourists in 2023');
    expect(await screen.findByText(/Writing a query and running it/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'loading');
    const post = h.fetch.mock.calls.find((c) => String(c[0]).includes('/api/ask')) as [string, RequestInit];
    expect(post[1].method).toBe('POST');
    expect(JSON.parse(post[1].body as string)).toEqual({ question: 'top 5 states for foreign tourists in 2023' });
    release();
    const res = await screen.findByTestId('ask-result');
    expect(res).toHaveAttribute('data-chart-type', 'bar');
    const opt = await chartOpt('Bar chart of Foreign visits by State name');
    expect(opt.yAxis.data).toEqual(askBody().data.rows.map((r) => r.state_name));
    expect(screen.getByTestId('ask-sql').textContent).toMatch(/SELECT/);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'result');
    expect(screen.getByText('Recent')).toBeInTheDocument();
  });
  it.each([
    ['line', { columns: ['year', 'total'], rows: [2019, 2020, 2021].map((y) => ({ year: y, total: y })) }, 'Line chart of Total by Year'],
    ['map', { columns: ['state_code', 'state_name', 'v'], rows: [{ state_code: 'KL', state_name: 'Kerala', v: 3 }, { state_code: 'GA', state_name: 'Goa', v: 5 }] }, null],
    ['table', { columns: ['name', 'type'], rows: [{ name: 'A', type: 'x' }] }, null],
  ])('renders a %s result', async (type, extra, chart) => {
    const body = sample<{ data: object; meta: object }>('ask_top5_foreign');
    stubBackend([(u) => (u.pathname === '/api/ask' ? json(200, { ...body, data: { ...body.data, ...extra, chart_type: type, row_count: extra.rows.length, truncated: false } }) : undefined)]);
    renderApp(<AskDrawer />); openAsk();
    await ask('something');
    const res = await screen.findByTestId('ask-result');
    expect(res).toHaveAttribute('data-chart-type', type);
    if (chart) await chartOpt(chart);
    if (type === 'map') expect(await screen.findByRole('group', { name: /Map of V by state/ })).toBeInTheDocument();
    if (type === 'table') expect(within(res).getByRole('table')).toBeInTheDocument();
  });
  it('falls back to a table when the columns cannot support the requested chart', async () => {
    const body = sample<{ data: object; meta: object }>('ask_top5_foreign');
    stubBackend([(u) => (u.pathname === '/api/ask' ? json(200, { ...body, data: { ...body.data, chart_type: 'line', columns: ['name'], rows: [{ name: 'A' }], row_count: 1 } }) : undefined)]);
    renderApp(<AskDrawer />); openAsk();
    await ask('something');
    expect(await screen.findByTestId('ask-result')).toHaveAttribute('data-chart-type', 'table');
  });
  it.each([
    [503, 'ai_not_configured', /isn't switched on/, false],
    [422, 'sql_rejected', /safe query/, false],
    [408, 'query_timeout', /too long/, true],
    [502, 'ai_error', /AI service/, true],
  ])('error %i %s is explained in plain language', async (status, code, text, retry) => {
    stubBackend([askErr(status as number, code as string, 'boom')]);
    renderApp(<AskDrawer />); openAsk();
    await ask('top 5 states');
    expect(await screen.findByRole('alert')).toHaveTextContent(text as RegExp);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'error');
    expect(!!screen.queryByRole('button', { name: 'Try again' })).toBe(retry);
  });
  it('a retryable error can be retried', async () => {
    let fail = true;
    const h = stubBackend([(u) => (u.pathname === '/api/ask' && fail ? json(502, { error: { code: 'ai_error', message: 'down', details: null } }) : undefined)]);
    renderApp(<AskDrawer />); openAsk();
    await ask('top 5 states');
    fail = false;
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByTestId('ask-result');
    expect(h.calls.filter((u) => u.pathname === '/api/ask')).toHaveLength(2);
  });
  it('network failure says the server can not be reached', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toMatchObject({ title: "Can't reach the server", retry: true });
    expect(describeError(new ApiError(500, 'internal_error', 'x')).retry).toBe(true);
  });
  it('Escape closes the drawer and an example question runs on click', async () => {
    stubBackend();
    renderApp(<AskDrawer />); openAsk();
    fireEvent.click(screen.getByRole('button', { name: 'top 5 states for foreign tourists in 2023' }));
    await screen.findByTestId('ask-result');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useUi.getState().askOpen).toBe(false);
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Ask result helpers', () => {
  it('works out the label, time, value and code columns', () => {
    const rows = [{ state_code: 'KL', state_name: 'Kerala', year: 2023, foreign_visits: 5 }];
    expect(analyse(['state_code', 'state_name', 'year', 'foreign_visits'], rows)).toEqual({ cat: 'state_name', time: 'year', nums: ['foreign_visits'], code: 'state_code' });
  });
  it('formats by column with Indian units', () => {
    expect(formatCell('foreign_visits', 21_900_000)).toBe('2.19 Cr');
    expect(formatCell('tourism_revenue_cr', 9714)).toBe('₹9,714 Cr');
    expect(formatCell('occupancy_rate', 63.1)).toBe('63.1%');
    expect(formatCell('year', 2023)).toBe('2023');
    expect(formatCell('x', null)).toBe('n/a');
  });
});

describe('CSV export', () => {
  it('always includes is_synthetic and data_source and escapes values', () => {
    const csv = toCsv([{ a: 'x,y', b: 1 }, { a: 'q"r', b: 2, is_synthetic: false }], 'SYNTHETIC: src');
    expect(csv.split('\n')[0]).toBe('a,b,is_synthetic,data_source');
    expect(csv).toContain('"x,y",1,true,SYNTHETIC: src');
    expect(csv).toContain('"q""r",2,false,SYNTHETIC: src');
    expect(toCsv([], undefined)).toBe('is_synthetic,data_source\n');
  });
  it('export menu: server CSV link when a view exists, client CSV otherwise, PNG, and a disabled state', () => {
    const { unmount } = render(<ExportMenu view="map" params={{ metric: 'revenue', year: 2024 }} onPng={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getByRole('menuitem', { name: /CSV/ })).toHaveAttribute('href', expect.stringContaining('/api/export?view=map&format=csv&metric=revenue&year=2024'));
    expect(screen.getByRole('menuitem', { name: 'PNG image' })).toBeInTheDocument();
    unmount();
    const created: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { created.push(b); return 'blob:x'; }, revokeObjectURL: () => undefined }));
    render(<ExportMenu csv={{ name: 'x', rows: [{ a: 1 }], source: 'S' }} />);
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /CSV/ }));
    expect(created).toHaveLength(1);
  });
});

describe('forecast', () => {
  it('draws history, a dashed forecast, a confidence band and marks the COVID years as excluded', async () => {
    const { calls } = stubBackend();
    renderApp(<ForecastSection code="KL" />);
    const opt = await chartOpt('Line chart of total visits history');
    const d = sample<{ data: { history: { year: number }[]; forecast: { year: number; value: number; lower: number; upper: number }[] } }>('forecast_kerala_revenue').data;
    const names = opt.series.map((s: { name: string }) => s.name);
    expect(names).toEqual(['History', 'Confidence band', 'Confidence band', 'Forecast (model projection)']);
    expect(opt.series[3].lineStyle.type).toBe('dashed');
    expect(opt.xAxis.data).toEqual([...d.history, ...d.forecast].map((p) => String(p.year)));
    const band = opt.series[2].data.slice(-d.forecast.length);
    expect(band).toEqual(d.forecast.map((f) => f.upper - f.lower));
    expect(opt.series[0].markArea.label.formatter).toBe('Excluded from training');
    const req = calls.find((u) => u.pathname === '/api/forecast') as URL;
    expect(req.searchParams.get('state')).toBe('KL');
    expect(req.searchParams.get('years')).toBe('3');
    expect(screen.getByText(/separately from the synthetic flag/)).toBeInTheDocument();
    expect(screen.getByText(/ARIMA/)).toBeInTheDocument();
  });
  it('changing metric and horizon sends new requests', async () => {
    const { calls } = stubBackend();
    renderApp(<ForecastSection code="KL" />);
    await chartOpt('Line chart of total visits history');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revenue' } });
    fireEvent.click(screen.getByRole('radio', { name: '2 years' }));
    await waitFor(() => { const u = calls.filter((c) => c.pathname === '/api/forecast').at(-1) as URL; expect(u.searchParams.get('metric')).toBe('revenue'); expect(u.searchParams.get('years')).toBe('2'); });
  });
  it('explains when there is not enough history instead of drawing nothing', async () => {
    const b = sample<{ data: object; meta: object }>('forecast_national');
    stubBackend([(u) => (u.pathname === '/api/forecast' ? json(200, { ...b, data: { ...b.data, model: null, forecast: [], notes: ['not_available: fewer than 4 usable years after excluding 2020-2021'] } }) : undefined)]);
    renderApp(<ForecastSection code="LA" />);
    expect(await screen.findByText('No forecast available')).toBeInTheDocument();
    expect(screen.getAllByText(/fewer than 4 usable years/).length).toBeGreaterThan(0);
  });
});

describe('anomaly flags', () => {
  const a = sample<{ data: { anomalies: import('@/api/types').Anomaly[] } }>('anomalies').data.anomalies;
  const t = { ink: '#fff', saffron: '#f90', indigo: '#88f', muted: '#999', faint: '#777' } as never;
  it('builds ▲ / ▼ markers with the triggering values in the tooltip', () => {
    const mp = anomalyMarkPoint(t, a.slice(0, 3), () => 100, 'SYNTHETIC: x');
    expect(mp.data).toHaveLength(3);
    for (const [i, p] of mp.data.entries()) {
      expect(p.symbolRotate).toBe(a[i].kind === 'drop' ? 180 : 0);
      expect(p.coord[0]).toBe(String(a[i].year));
    }
    const html = mp.tooltip.formatter({ data: mp.data[0] });
    expect(html).toContain(a[0].value_display);
    expect(html).toContain(a[0].previous_display);
    expect(html).toContain(String(a[0].z_score));
    expect(anomalyList(a.slice(0, 2))).toMatch(/[▲▼] [A-Z]{2} \d{4}, [▲▼]/);
  });
  it('skips anomalies with no y value', () => {
    expect(anomalyMarkPoint(t, a.slice(0, 3), () => null, undefined).data).toHaveLength(0);
  });
  it('the state trend chart puts flagged years on the domestic line and lists them as text', async () => {
    const { calls } = stubBackend();
    const detail = sample<{ data: StateDetail; meta: { data_sources: string[] } }>('state_detail_ga');
    renderApp(<TrendSection d={detail.data} src={detail.meta.data_sources[0]} code="GA" params={{}} />);
    const opt = await chartOpt('Line chart of domestic and foreign visits', (o) => o.series[0].markPoint?.data?.length > 0);
    expect(opt.series[0].markPoint.data.length).toBeGreaterThan(0);
    const req = calls.find((u) => u.pathname === '/api/anomalies') as URL;
    expect(req.searchParams.get('states')).toBe('GA');
    expect(await screen.findByText(/unusually strong year/)).toBeInTheDocument();
  });
});

describe('global shortcut', () => {
  it('Ctrl+K toggles Ask the data from any page, and "/" does too outside inputs', async () => {
    const { Layout } = await import('@/components/common/Layout');
    stubBackend();
    useUi.setState({ askOpen: false });
    const { MemoryRouter, Routes, Route } = await import('react-router-dom');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/x']}><Routes><Route element={<Layout />}><Route path="x" element={<div>page</div>} /></Route></Routes></MemoryRouter></QueryClientProvider>);
    act(() => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
    expect(useUi.getState().askOpen).toBe(true);
    act(() => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
    expect(useUi.getState().askOpen).toBe(false);
    act(() => { fireEvent.keyDown(window, { key: '/' }); });
    expect(useUi.getState().askOpen).toBe(true);
    const box = screen.getByLabelText('Your question');
    useUi.setState({ askOpen: false });
    act(() => { fireEvent.keyDown(box, { key: '/' }); });
    expect(useUi.getState().askOpen).toBe(false); // typing a slash in a field must not toggle the drawer
  });
});
