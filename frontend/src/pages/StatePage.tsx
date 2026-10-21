import { useLocation, useParams, Link } from 'react-router-dom';
import { useStateDetail } from '@/api/hooks';
import { ApiError } from '@/api/client';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState, Skeleton } from '@/components/common/States';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import { ForecastSection } from '@/components/state/ForecastSection';
import { BackLink, HotelInfra, KpiGrid, ProfileCard, RankHistory, SeasonalitySection, SourceCountries, TopAttractions, TrendSection } from '@/components/state/sections';
import { useFilters } from '@/store/filters';

/** Direct-URL drill-down (deep link, no animation). The Overview map opens the same data in a side panel. */
export default function StatePage() {
  const { code = '' } = useParams();
  const { search } = useLocation();
  const upper = code.toUpperCase();
  const q = useStateDetail(upper);
  const year = useFilters((s) => s.year);
  const d = q.data?.data;
  const src = q.data?.meta.data_sources[0];
  const notFound = q.error instanceof ApiError && q.error.status === 404;
  if (notFound) {
    return (
      <div className="mx-auto max-w-[1600px] px-6 py-10">
        <div className="card p-10 text-center" role="alert"><h1 className="text-xl font-semibold">No state with code "{upper}"</h1>
          <p className="mt-2 text-sm text-muted">Check the code, or pick a state from the map.</p><div className="mt-4"><BackLink search={search} /></div></div>
      </div>
    );
  }
  const params = { year: year ?? undefined, include_synthetic: true };
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-6 py-5">
      <PageHeader
        title={d ? d.profile.state_name : upper}
        subtitle={d ? <span className="inline-flex items-center gap-2">{d.profile.region} · {d.year} <SyntheticBadge compact /></span> : undefined}
        right={<div className="flex gap-2"><Link to={{ pathname: '/compare', search: search }} className="btn text-sm">Compare</Link><BackLink search={search} /></div>}
      />
      {q.isError && !d && <div className="card"><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>}
      {!d && !q.isError && (
        <div className="space-y-4"><div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      )}
      {d && (
        <>
          <div className="grid grid-cols-4 gap-5">
            <ProfileCard d={d} />
            <div className="col-span-3"><KpiGrid d={d} /></div>
          </div>
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2"><TrendSection d={d} src={src} code={upper} params={params} /></div>
            <SourceCountries d={d} src={src} code={upper} params={params} />
          </div>
          <div className="grid grid-cols-2 gap-5">
            <TopAttractions d={d} src={src} code={upper} params={params} />
            <HotelInfra d={d} src={src} code={upper} params={params} />
          </div>
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2"><SeasonalitySection d={d} src={src} code={upper} params={params} /></div>
            <RankHistory d={d} src={src} code={upper} params={params} />
          </div>
          <ForecastSection code={upper} />
        </>
      )}
    </div>
  );
}
