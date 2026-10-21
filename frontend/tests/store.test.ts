import { beforeEach, describe, expect, it } from 'vitest';
import { buildParams } from '@/api/hooks';
import { DEFAULT_FILTERS, selectFilterValues, useFilters } from '@/store/filters';
import { useUi } from '@/store/ui';
import { filtersToSearch, searchToState } from '@/store/url';

beforeEach(() => {
  useFilters.getState().reset();
  useUi.setState({ hovered: null, crossFilter: null, waking: false });
});

describe('filter store', () => {
  it('starts with no hard-coded years (they come from /api/filters)', () => {
    expect(useFilters.getState().yearFrom).toBeNull();
    expect(useFilters.getState().year).toBeNull();
  });
  it('toggles states and clamps the focus year into the range', () => {
    const s = useFilters.getState();
    s.toggleState('KL');
    s.toggleState('GA');
    s.toggleState('KL');
    expect(useFilters.getState().states).toEqual(['GA']);
    s.setYear(2025);
    s.setYearRange(2018, 2020);
    expect(useFilters.getState().year).toBe(2020);
    s.setYear(2016);
    s.setYearRange(2018, 2020);
    expect(useFilters.getState().year).toBe(2018);
  });
  it('resets to defaults', () => {
    const s = useFilters.getState();
    s.setRegion('South');
    s.setVisitorType('foreign');
    s.setTourismType('beach');
    s.reset();
    expect(selectFilterValues(useFilters.getState())).toEqual(DEFAULT_FILTERS);
  });
});

describe('URL sync', () => {
  it('round-trips every filter plus the cross-filter', () => {
    const f = { yearFrom: 2018, yearTo: 2024, year: 2022, states: ['KL', 'GA'], region: 'South', tourismType: 'beach', visitorType: 'foreign' as const };
    const search = filtersToSearch(f, 'KL');
    expect(search).toBe('?yf=2018&yt=2024&y=2022&s=KL%2CGA&r=South&t=beach&v=foreign&x=KL');
    expect(searchToState(search)).toEqual({ filters: f, cross: 'KL' });
  });
  it('omits defaults so clean URLs stay clean', () => {
    expect(filtersToSearch(DEFAULT_FILTERS, null)).toBe('');
    expect(searchToState('')).toEqual({ filters: DEFAULT_FILTERS, cross: null });
  });
  it('ignores junk values', () => {
    const { filters, cross } = searchToState('?yf=abc&v=hacker&s=kl,,ga&x=ka');
    expect(filters.yearFrom).toBeNull();
    expect(filters.visitorType).toBe('all');
    expect(filters.states).toEqual(['KL', 'GA']);
    expect(cross).toBe('KA');
  });
});

describe('API parameters', () => {
  const f = { ...DEFAULT_FILTERS, states: ['KL', 'GA'], region: 'South', tourismType: 'beach', visitorType: 'domestic' as const, yearFrom: 2016, yearTo: 2020, year: 2019 };
  const bounds = { first: 2015, last: 2025 };
  it('always sends visitor_type and include_synthetic (the synthetic toggle was removed)', () => {
    const p = buildParams(DEFAULT_FILTERS, null, 'none', true);
    expect(p).toMatchObject({ visitor_type: 'all', include_synthetic: true });
  });
  it('sends a single year or a range, falling back to dataset bounds', () => {
    expect(buildParams(f, null, 'year', true, bounds)).toMatchObject({ year: 2019 });
    expect(buildParams(f, null, 'range', true, bounds)).toMatchObject({ year_from: 2016, year_to: 2020 });
    expect(buildParams(DEFAULT_FILTERS, null, 'year', true, bounds).year).toBe(2025);
    expect(buildParams(DEFAULT_FILTERS, null, 'range', true, bounds)).toMatchObject({ year_from: 2015, year_to: 2025 });
  });
  it('applies states, region and tourism type', () => {
    expect(buildParams(f, null, 'none', true)).toMatchObject({ states: 'KL,GA', region: 'South', tourism_type: 'beach', visitor_type: 'domestic' });
  });
  it('cross-filter overrides the state selection for charts but not for the map', () => {
    expect(buildParams(f, 'MH', 'year', true, bounds).states).toBe('MH');
    expect(buildParams(f, 'MH', 'year', false, bounds).states).toBe('KL,GA');
  });
});

describe('shared hover and cross-filter state', () => {
  it('one hovered state is visible to every subscriber', () => {
    const seen: (string | null)[] = [];
    const off = useUi.subscribe((s) => seen.push(s.hovered));
    useUi.getState().setHovered('KL');
    useUi.getState().setHovered('KL'); // same value: no extra notification
    useUi.getState().setHovered(null);
    off();
    expect(seen).toEqual(['KL', null]);
  });
  it('cross-filter can be set and removed', () => {
    useUi.getState().setCrossFilter('GA');
    expect(useUi.getState().crossFilter).toBe('GA');
    useUi.getState().setCrossFilter(null);
    expect(useUi.getState().crossFilter).toBeNull();
  });
  it('persists theme and motion preferences', () => {
    useUi.getState().setTheme('light');
    useUi.getState().setMotion(false);
    expect(localStorage.getItem('itd.theme')).toBe('light');
    expect(localStorage.getItem('itd.motion')).toBe('off');
    useUi.getState().setTheme('dark');
    useUi.getState().setMotion(true);
  });
});
