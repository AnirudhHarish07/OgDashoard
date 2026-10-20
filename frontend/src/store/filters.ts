import { create } from 'zustand';

export type VisitorType = 'all' | 'domestic' | 'foreign';

export interface FilterValues {
  /** null = "use the dataset's bound" (years come from /api/filters, never hard-coded) */
  yearFrom: number | null;
  yearTo: number | null;
  year: number | null;
  states: string[];
  region: string | null;
  tourismType: string | null;
  visitorType: VisitorType;
}

export const DEFAULT_FILTERS: FilterValues = {
  yearFrom: null, yearTo: null, year: null, states: [], region: null, tourismType: null, visitorType: 'all',
};

interface FilterActions {
  setYearRange: (from: number | null, to: number | null) => void;
  setYear: (y: number | null) => void;
  setStates: (codes: string[]) => void;
  toggleState: (code: string) => void;
  setRegion: (r: string | null) => void;
  setTourismType: (t: string | null) => void;
  setVisitorType: (v: VisitorType) => void;
  hydrate: (v: Partial<FilterValues>) => void;
  reset: () => void;
}

export const useFilters = create<FilterValues & FilterActions>((set) => ({
  ...DEFAULT_FILTERS,
  setYearRange: (yearFrom, yearTo) =>
    set((s) => {
      const year = s.year != null && yearFrom != null && yearTo != null ? Math.min(Math.max(s.year, yearFrom), yearTo) : s.year;
      return { yearFrom, yearTo, year };
    }),
  setYear: (year) => set({ year }),
  setStates: (states) => set({ states }),
  toggleState: (code) => set((s) => ({ states: s.states.includes(code) ? s.states.filter((c) => c !== code) : [...s.states, code] })),
  setRegion: (region) => set({ region }),
  setTourismType: (tourismType) => set({ tourismType }),
  setVisitorType: (visitorType) => set({ visitorType }),
  hydrate: (v) => set((s) => ({ ...s, ...v })),
  reset: () => set({ ...DEFAULT_FILTERS }),
}));

export const selectFilterValues = (s: FilterValues & FilterActions): FilterValues => ({
  yearFrom: s.yearFrom, yearTo: s.yearTo, year: s.year, states: s.states, region: s.region,
  tourismType: s.tourismType, visitorType: s.visitorType,
});
