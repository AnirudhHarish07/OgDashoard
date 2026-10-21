import { describe, expect, it } from 'vitest';
import type { MapState } from '@/api/types';
import { NEUTRAL, hexToRgb, rgbToHex, top10Colour, quantileBreaks, classIndex } from '@/lib/colour';
import { nextState, type Pt } from '@/components/map/nav';
import { buildLegend, computeVis } from '@/components/map/scales';
import { sample } from './helpers';

const rows = sample<{ data: { states: MapState[] } }>('map_total_visits').data.states;
const lum = (hex: string) => { const [r, g, b] = hexToRgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

describe('top-10 colouring', () => {
  const codes = rows.map((r) => r.state_code);
  const vis = computeVis(rows, codes, { metric: 'total_visits', mode: 'top10', theme: 'dark' });
  it('colours exactly the API top 10 and leaves the rest neutral', () => {
    const top = rows.filter((r) => r.is_top10);
    expect(top).toHaveLength(10);
    for (const r of rows) {
      const hex = rgbToHex(vis.get(r.state_code)!.fill);
      if (r.is_top10) expect(hex).not.toBe(NEUTRAL.dark);
      else expect(hex).toBe(NEUTRAL.dark);
    }
  });
  it('rank 1 is the darkest and rank 10 the lightest', () => {
    for (const theme of ['dark', 'light'] as const) {
      const l = Array.from({ length: 10 }, (_, i) => lum(top10Colour(theme, i + 1)));
      expect([...l].sort((a, b) => a - b)).toEqual(l);
    }
  });
  it('legend has ten rank swatches plus neutral', () => {
    const lg = buildLegend(rows, { metric: 'total_visits', mode: 'top10', theme: 'dark' });
    expect(lg.swatches).toHaveLength(11);
    expect(lg.swatches[0].label).toBe('1');
    expect(lg.swatches[10].label).toBe('Other');
  });
  it('heights come from the API normalised value', () => {
    const maxRow = rows.reduce((a, b) => ((a.height ?? 0) > (b.height ?? 0) ? a : b));
    expect(vis.get(maxRow.state_code)!.h).toBe(1);
  });
});

describe('choropleth', () => {
  it('uses a quantile scale for skewed values and a diverging scale for growth', () => {
    const b = quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(b).toHaveLength(6);
    expect(classIndex(0, b)).toBe(0);
    expect(classIndex(100, b)).toBe(6);
    const growth = sample<{ data: { states: MapState[] } }>('map_growth_pct').data.states;
    const lg = buildLegend(growth, { metric: 'growth_pct', mode: 'choropleth', theme: 'dark' });
    expect(lg.kind).toBe('diverging');
    expect(lg.swatches[2].label).toBe('+0.0%');
  });
  it('states with no value get the no-data colour (not a misleading one)', () => {
    const growth = sample<{ data: { states: MapState[] } }>('map_growth_pct').data.states;
    const none = growth.find((s) => s.value == null);
    expect(none).toBeTruthy();
    const vis = computeVis(growth, [none!.state_code], { metric: 'growth_pct', mode: 'choropleth', theme: 'dark' });
    expect(rgbToHex(vis.get(none!.state_code)!.fill)).toBe('#1c2331');
  });
});

describe('keyboard navigation between states', () => {
  const pts: Pt[] = [
    { code: 'C', lon: 80, lat: 20 }, { code: 'N', lon: 80, lat: 28 }, { code: 'S', lon: 80, lat: 10 },
    { code: 'E', lon: 90, lat: 20 }, { code: 'W', lon: 70, lat: 20 },
  ];
  it('moves in the arrow direction to the nearest state', () => {
    expect(nextState('C', 'up', pts)).toBe('N');
    expect(nextState('C', 'down', pts)).toBe('S');
    expect(nextState('C', 'right', pts)).toBe('E');
    expect(nextState('C', 'left', pts)).toBe('W');
  });
  it('stays put at the edge and starts at the centre when nothing is hovered', () => {
    expect(nextState('N', 'up', pts)).toBe('N');
    expect(nextState(null, 'right', pts)).toBe('C');
    expect(nextState('C', 'up', [])).toBeNull();
  });
});
