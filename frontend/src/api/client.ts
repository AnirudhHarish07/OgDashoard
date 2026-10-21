import type { AskResponse } from './types';
import type { paths } from './schema';
import { useUi } from '@/store/ui';

export type GetPath = { [P in keyof paths]: paths[P] extends { get: unknown } ? P : never }[keyof paths];
export type GetResponse<P extends GetPath> = paths[P] extends { get: { responses: { 200: { content: { 'application/json': infer R } } } } } ? R : never;
export type Query = Record<string, string | number | boolean | undefined | null>;

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.DEV ? 'http://localhost:8000' : '');

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export function buildUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return `${API_URL}${path}${s ? `?${s}` : ''}`;
}

// "Waking up the server": if the first request is still pending after ~3 s, tell the user.
let everResponded = false;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let inflight = 0;
function begin() {
  inflight++;
  if (!everResponded && !wakeTimer) wakeTimer = setTimeout(() => useUi.getState().setWaking(true), 3000);
}
function end(ok: boolean) {
  inflight--;
  if (ok) {
    everResponded = true;
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeTimer = null;
    useUi.getState().setWaking(false);
  } else if (inflight === 0 && !everResponded && wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
    useUi.getState().setWaking(false);
  }
}

async function parse(res: Response) {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'http_error', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return body;
}

async function request<T>(run: () => Promise<T>): Promise<T> {
  begin();
  try {
    const v = await run();
    end(true);
    return v;
  } catch (e) {
    // an ApiError means the server answered, so it is awake
    end(e instanceof ApiError);
    throw e;
  }
}

export function apiGet<P extends GetPath>(path: P, query?: Query, signal?: AbortSignal): Promise<GetResponse<P>> {
  return request(async () => {
    if (USE_MOCKS) {
      const { mockGet } = await import('./mocks');
      return (await mockGet(path, query)) as GetResponse<P>;
    }
    return (await parse(await fetch(buildUrl(path, query), { signal }))) as GetResponse<P>;
  });
}

export function apiGetState(code: string, query?: Query, signal?: AbortSignal): Promise<GetResponse<'/api/states/{code}'>> {
  return request(async () => {
    if (USE_MOCKS) {
      const { mockGet } = await import('./mocks');
      return (await mockGet('/api/states/{code}', { ...query, code })) as GetResponse<'/api/states/{code}'>;
    }
    return (await parse(await fetch(buildUrl(`/api/states/${encodeURIComponent(code)}`, query), { signal }))) as GetResponse<'/api/states/{code}'>;
  });
}

export function apiAsk(question: string): Promise<AskResponse> {
  return request(async () => {
    if (USE_MOCKS) {
      const { mockGet } = await import('./mocks');
      return (await mockGet('/api/ask', { question })) as AskResponse;
    }
    const res = await fetch(buildUrl('/api/ask'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
    return (await parse(res)) as AskResponse;
  });
}

/** URL for a CSV download via /api/export (includes is_synthetic and data_source columns). */
export function exportUrl(view: string, query: Query): string {
  return buildUrl('/api/export', { view, format: 'csv', ...query });
}
