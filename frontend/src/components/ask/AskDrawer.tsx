import { useMutation } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ApiError, apiAsk } from '@/api/client';
import type { AskResponse } from '@/api/types';
import { Skeleton } from '@/components/common/States';
import { useUi } from '@/store/ui';

const AskResult = lazy(() => import('./AskResult'));

const EXAMPLES = [
  'top 5 states for foreign tourists in 2023',
  'how did Goa\'s total visits change each year?',
  'which states have the most UNESCO sites?',
  'average hotel occupancy by region in 2024',
  'monthly visits in Kerala in 2023',
  'foreign visits by state in 2024 as a map',
];
const MIN = 3, MAX = 500;

export function describeError(e: unknown): { title: string; message: string; retry: boolean } {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'ai_not_configured':
        return { title: 'Ask the data isn\'t switched on', message: 'This feature needs an Anthropic API key on the server (ANTHROPIC_API_KEY). Everything else in the dashboard works without it.', retry: false };
      case 'sql_rejected':
        return { title: 'I couldn\'t turn that into a safe query', message: 'Try rephrasing, and ask about states, years, visits, revenue, hotels, attractions or festivals.', retry: false };
      case 'query_timeout':
        return { title: 'That query took too long', message: 'Try a narrower question, such as one state or one year.', retry: true };
      case 'ai_error':
        return { title: 'The AI service had a problem', message: e.message, retry: true };
      case 'validation_error':
        return { title: 'Check your question', message: `Questions need ${MIN} to ${MAX} characters.`, retry: false };
      default:
        return { title: 'Something went wrong', message: e.message, retry: e.status >= 500 };
    }
  }
  return { title: 'Can\'t reach the server', message: 'Check that the backend is running, then try again.', retry: true };
}

/** "Ask the data": natural-language question -> POST /api/ask -> chart, map or table, with the SQL used. */
export function AskDrawer() {
  const open = useUi((s) => s.askOpen);
  const setOpen = useUi((s) => s.setAskOpen);
  const [q, setQ] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const input = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<Element | null>(null);
  const m = useMutation<AskResponse, unknown, string>({ mutationFn: (question) => apiAsk(question) });
  const text = q.trim();
  const valid = text.length >= MIN && text.length <= MAX;

  useEffect(() => {
    if (open) {
      opener.current = document.activeElement;
      setTimeout(() => input.current?.focus(), 50);
    } else if (opener.current instanceof HTMLElement) {
      opener.current.focus();
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, setOpen]);

  const submit = (question: string) => {
    const t = question.trim();
    if (t.length < MIN || t.length > MAX || m.isPending) return;
    setQ(t);
    setHistory((h) => [t, ...h.filter((x) => x !== t)].slice(0, 5));
    m.mutate(t);
  };
  const err = m.isError ? describeError(m.error) : null;
  const state = m.isPending ? 'loading' : m.isError ? 'error' : m.isSuccess ? 'result' : text ? 'typing' : 'empty';

  return (
    <aside
      role="dialog" aria-label="Ask the data" aria-hidden={!open} data-state={state}
      className="card fixed bottom-4 right-4 top-[72px] z-[80] flex w-[560px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden"
      style={{ transform: open ? 'translate3d(0,0,0)' : 'translate3d(calc(100% + 24px),0,0)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'transform var(--t-base) var(--ease), opacity var(--t-base) var(--ease)' }}
      ref={(el) => { el?.toggleAttribute('inert', !open); }}
    >
      <header className="flex items-center justify-between border-b border-line/70 px-4 py-3">
        <div><h2 className="text-sm font-semibold">Ask the data</h2><p className="text-xs text-muted">Ask in plain English. Claude writes a read-only query on the dataset and shows the answer.</p></div>
        <button type="button" className="btn !h-8 !w-8 !p-0" aria-label="Close" onClick={() => setOpen(false)}><svg aria-hidden width="12" height="12" viewBox="0 0 12 12"><path d="m1 1 10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.6" /></svg></button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        <form onSubmit={(e) => { e.preventDefault(); submit(q); }}>
          <label htmlFor="ask-q" className="sr-only">Your question</label>
          <textarea
            id="ask-q" ref={input} value={q} rows={2} maxLength={MAX + 50} placeholder="e.g. top 5 states for foreign tourists in 2023"
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(q); } }}
            className="field w-full resize-none !text-sm" aria-describedby="ask-hint"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span id="ask-hint" className={`text-[11px] ${text.length > MAX ? 'text-bad' : 'text-faint'}`}>{text.length > MAX ? `Too long (${text.length}/${MAX})` : text.length > 0 && text.length < MIN ? `At least ${MIN} characters` : 'Enter to ask, Shift+Enter for a new line'}</span>
            <button type="submit" className="btn border-teal/60 bg-teal/15" disabled={!valid || m.isPending} style={{ opacity: valid && !m.isPending ? 1 : 0.5 }}>{m.isPending ? 'Asking' : 'Ask'}</button>
          </div>
        </form>

        {state === 'empty' && (
          <section aria-label="Example questions">
            <p className="label mb-1.5">Try one of these</p>
            <div className="flex flex-wrap gap-2">{EXAMPLES.map((x) => <button key={x} type="button" className="chip text-left" onClick={() => submit(x)}>{x}</button>)}</div>
            <p className="mt-3 text-[11px] text-faint">Answers come from the synthetic dataset only. The SQL is shown with every result.</p>
          </section>
        )}

        {state === 'loading' && (
          <div role="status" aria-live="polite" className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-muted"><span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-teal border-t-transparent" />Writing a query and running it on the dataset</p>
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {err && (
          <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 p-4">
            <p className="text-sm font-semibold">{err.title}</p>
            <p className="mt-1 text-sm text-muted">{err.message}</p>
            {err.retry && <button type="button" className="btn mt-3" onClick={() => submit(q)}>Try again</button>}
          </div>
        )}

        {m.isSuccess && state === 'result' && (
          <Suspense fallback={<Skeleton className="h-64 w-full" />}><AskResult resp={m.data} /></Suspense>
        )}

        {history.length > 0 && state !== 'loading' && (
          <section aria-label="Recent questions"><p className="label mb-1.5">Recent</p>
            <div className="flex flex-wrap gap-2">{history.map((h) => <button key={h} type="button" className="chip text-left" onClick={() => submit(h)}>{h}</button>)}</div></section>
        )}
      </div>
    </aside>
  );
}
