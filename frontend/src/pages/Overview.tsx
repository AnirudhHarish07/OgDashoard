import { lazy, Suspense } from 'react';
import { useKpis } from '@/api/hooks';
import { KpiCard } from '@/components/cards/KpiCard';
import { InsightCards } from '@/components/cards/InsightCards';
import { TrendChart } from '@/components/charts/TrendChart';
import { QueryBoundary, Skeleton } from '@/components/common/States';
import { useUi } from '@/store/ui';

const HeroMap = lazy(() => import('@/components/map/HeroMap'));
const ORDER = ['total_domestic', 'total_foreign', 'revenue', 'yoy_growth', 'top_state'];

function KpiRow() {
  const q = useKpis();
  return (
    <section aria-label="Key figures" className="grid grid-cols-5 gap-4">
      <QueryBoundary query={q} skeleton={<>{ORDER.map((k) => <Skeleton key={k} className="h-[132px]" />)}</>} isEmpty={(d) => d.data.kpis.every((k) => k.value == null)} emptyHint="No key figures for these filters.">
        {(r) => <>{ORDER.map((key) => r.data.kpis.find((k) => k.key === key)).filter((k) => !!k).map((k) => <KpiCard key={k.key} kpi={k} previousYear={r.data.previous_year} highlight={k.key === 'top_state'} />)}</>}
      </QueryBoundary>
    </section>
  );
}

export default function Overview() {
  const cross = useUi((s) => s.crossFilter);
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-6 py-5">
      <KpiRow />
      <Suspense fallback={<Skeleton className="h-[640px] w-full" />}>
        <HeroMap />
      </Suspense>
      <div className="grid grid-cols-5 gap-5">
        <div className="col-span-3"><TrendChart /></div>
        <div className="col-span-2"><InsightCards state={cross} /></div>
      </div>
    </div>
  );
}
