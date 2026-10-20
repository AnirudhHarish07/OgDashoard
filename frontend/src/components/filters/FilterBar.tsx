import { useCallback } from 'react';
import { useFiltersMeta } from '@/api/hooks';
import { useFilters } from '@/store/filters';
import { useUi } from '@/store/ui';
import { MultiSelect, RangeSlider, Segmented, Select } from './controls';
import { Skeleton } from '@/components/common/States';

/** Persistent filter bar: backed by the filters store, mirrored to URL params (see store/url.ts). */
export function FilterBar() {
  const meta = useFiltersMeta();
  const f = useFilters();
  const cross = useUi((s) => s.crossFilter);
  const setCross = useUi((s) => s.setCrossFilter);
  const setHovered = useUi((s) => s.setHovered);
  const setRange = f.setYearRange;
  const commit = useCallback((a: number, b: number) => setRange(a, b), [setRange]);
  const d = meta.data?.data;
  const crossName = d?.states.find((s) => s.state_code === cross)?.state_name ?? cross;
  const dirty = f.yearFrom != null || f.yearTo != null || f.year != null || f.states.length > 0 || f.region || f.tourismType || f.visitorType !== 'all' || cross;

  return (
    <div className="sticky top-14 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md" role="region" aria-label="Filters">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-end gap-x-5 gap-y-3 px-6 py-3">
        {!d ? (
          <Skeleton className="h-10 w-full max-w-3xl" />
        ) : (
          <>
            <RangeSlider min={d.years[0]} max={d.years[d.years.length - 1]} from={f.yearFrom ?? d.years[0]} to={f.yearTo ?? d.years[d.years.length - 1]} onChange={commit} />
            <MultiSelect
              label="States / UTs" allLabel="All states" selected={f.states}
              options={d.states.map((s) => ({ value: s.state_code, label: s.state_name, hint: s.state_code }))}
              onToggle={f.toggleState} onClear={() => f.setStates([])}
            />
            <Select label="Region" allLabel="All regions" value={f.region} onChange={f.setRegion} options={d.regions.map((r) => ({ value: r, label: r }))} />
            <Select label="Tourism type" allLabel="All types" value={f.tourismType} onChange={f.setTourismType} options={d.tourism_types.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} />
            <Segmented label="Visitors" value={f.visitorType} onChange={f.setVisitorType} options={[{ value: 'all', label: 'All' }, { value: 'domestic', label: 'Domestic' }, { value: 'foreign', label: 'Foreign' }]} />
            {cross && (
              <div className="flex flex-col gap-1">
                <span className="label">Cross-filter</span>
                <span className="chip border-saffron/60">
                  <span className="font-medium">{crossName}</span>
                  <button type="button" aria-label={`Remove cross-filter ${crossName}`} className="grid h-4 w-4 place-items-center rounded-full text-muted hover:bg-line hover:text-ink" onClick={() => { setCross(null); setHovered(null); }}>
                    <svg aria-hidden width="9" height="9" viewBox="0 0 9 9"><path d="m1 1 7 7M8 1 1 8" stroke="currentColor" strokeWidth="1.5" /></svg>
                  </button>
                </span>
              </div>
            )}
            <button type="button" className="btn ml-auto" disabled={!dirty} style={{ opacity: dirty ? 1 : 0.5 }} onClick={() => { f.reset(); setCross(null); }}>Reset</button>
          </>
        )}
      </div>
    </div>
  );
}
