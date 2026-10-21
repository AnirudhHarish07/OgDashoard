import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { sampleFor } from '@/api/mocks';
import { useFilters } from '@/store/filters';
import { useUi } from '@/store/ui';
import { sample } from './helpers';

export type Override = (url: URL) => Response | undefined;

export interface Harness { calls: URL[]; fetch: ReturnType<typeof vi.fn> }

/** Stubs fetch so every endpoint answers with its real sample (filters ignored), unless an override returns a Response. */
export function stubBackend(overrides: Override[] = []): Harness {
  const calls: URL[] = [];
  const fn = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    for (const o of overrides) {
      const r = o(url);
      if (r) return r;
    }
    const m = /^\/api\/states\/([^/]+)$/.exec(url.pathname);
    const name = sampleFor(m ? '/api/states/{code}' : url.pathname, Object.fromEntries([...url.searchParams, ...(m ? [['code', m[1]]] : [])]));
    return new Response(JSON.stringify(sample(name)), { status: 200 });
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fetch: fn };
}

export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

/** jsdom does not load styles/tokens.css, so give the charts' colour lookups real values. */
function setTokens() {
  const t: Record<string, string> = { bg: '9 13 24', surface: '16 22 38', line: '44 56 82', ink: '233 237 245', muted: '161 172 193', faint: '118 129 152', saffron: '255 153 51', teal: '45 212 191', marigold: '251 191 36', indigo: '129 140 248' };
  for (const [k, v] of Object.entries(t)) document.documentElement.style.setProperty(`--${k}`, v);
}

export function renderApp(ui: ReactElement, { path = '/', route = '*' }: { path?: string; route?: string } = {}) {
  setTokens();
  useFilters.getState().reset();
  useUi.setState({ hovered: null, crossFilter: null, waking: false, motion: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Options captured by the stubbed EChart (see tests/pages.test.tsx), keyed by aria-label prefix. */
export function chartOption(prefix: string): Record<string, any> | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const el = [...document.querySelectorAll('[data-testid="echart"]')].find((e) => (e.getAttribute('aria-label') ?? '').startsWith(prefix));
  return el ? JSON.parse(el.getAttribute('data-option') ?? 'null') : null;
}

/** Waits (retrying) until a chart with this aria-label prefix has rendered, then returns its option. */
export async function chartOpt(prefix: string, ready: (o: Record<string, any>) => boolean = () => true): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return waitFor(() => {
    const o = chartOption(prefix);
    if (!o || !ready(o)) throw new Error(`chart "${prefix}" not ready`);
    return o;
  });
}
