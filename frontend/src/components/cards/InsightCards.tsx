import { useInsights } from '@/api/hooks';
import { useUi } from '@/store/ui';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import type { InsightCard } from '@/api/types';

function Card({ c }: { c: InsightCard }) {
  const setHovered = useUi((s) => s.setHovered);
  const code = c.state_codes[0] ?? null;
  return (
    <article
      className="card group p-3.5 transition-transform duration-hover hover:-translate-y-0.5"
      onMouseEnter={() => code && setHovered(code)} onMouseLeave={() => code && setHovered(null)}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="label !text-saffron">{c.title}</h3>
        <span className="flex items-center gap-1.5">
          {c.text_source === 'claude' && <span className="rounded-full border border-indigo/50 px-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-indigo" title="Sentence phrased by Claude from computed facts">AI</span>}
          <SyntheticBadge show={c.synthetic_based} compact />
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-snug text-ink">{c.text}</p>
    </article>
  );
}

export function InsightCards({ state }: { state?: string | null }) {
  const q = useInsights(state);
  const note = q.data?.meta.notes.find((n) => /ANTHROPIC_API_KEY|AI phrasing/.test(n));
  return (
    <section aria-label="Insights" className="flex h-full flex-col">
      <div className="mb-2 flex items-end justify-between">
        <h2 className="text-sm font-semibold">Insights</h2>
        <span className="text-[11px] text-faint">{q.data?.data.phrasing === 'claude' ? 'Phrased by Claude from computed facts' : 'Computed from the dataset'}</span>
      </div>
      <QueryBoundary query={q} isEmpty={(d) => d.data.cards.length === 0} emptyHint="No insights for this selection." skeleton={<div className="grid gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>}>
        {(r) => (
          <>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{r.data.cards.slice(0, 8).map((c) => <Card key={c.id} c={c} />)}</div>
            {note && <p className="mt-2 text-[11px] text-faint">{note}</p>}
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
