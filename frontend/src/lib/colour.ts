/** Colour scales. Choropleth and top-10 use deliberately different hues; neutral is for everything else. */

export type RGB = [number, number, number];
export type Theme = 'dark' | 'light';

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = ([r, g, b]: RGB): string =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Piecewise-linear ramp through stops, t in 0..1. */
export function ramp(stops: string[], t: number): RGB {
  const rgb = stops.map(hexToRgb);
  const x = Math.max(0, Math.min(1, t)) * (rgb.length - 1);
  const i = Math.min(rgb.length - 2, Math.floor(x));
  return mix(rgb[i], rgb[i + 1], x - i);
}

const SEQ: Record<Theme, string[]> = {
  dark: ['#16333b', '#1d5a63', '#2a8c8c', '#56c2b3', '#a8efd6'],
  light: ['#e2f3f0', '#a9dcd3', '#5cb9ae', '#238f8f', '#0c5058'],
};
const DIV: Record<Theme, string[]> = {
  dark: ['#e0561a', '#8a5a44', '#3b4458', '#2a8c8c', '#7be0cc'],
  light: ['#b9400d', '#e5a98a', '#e4e7ee', '#7fcdc1', '#0f6e6e'],
};
/** rank 1 (darkest) -> rank 10 (lightest) */
const TOP10: Record<Theme, [string, string]> = {
  dark: ['#c2410c', '#ffe3bd'],
  light: ['#9a3412', '#fdba74'],
};
export const NEUTRAL: Record<Theme, string> = { dark: '#2a3344', light: '#d3d9e4' };
export const NO_DATA: Record<Theme, string> = { dark: '#1c2331', light: '#e9edf4' };

export const SEQ_CLASSES = 7;

export function quantileBreaks(values: number[], k = SEQ_CLASSES): number[] {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return [];
  const out: number[] = [];
  for (let i = 1; i < k; i++) out.push(v[Math.min(v.length - 1, Math.floor((i * v.length) / k))]);
  return out;
}
export function classIndex(value: number, breaks: number[]): number {
  let i = 0;
  while (i < breaks.length && value >= breaks[i]) i++;
  return i;
}

export function seqColour(theme: Theme, cls: number, k = SEQ_CLASSES): string {
  return rgbToHex(ramp(SEQ[theme], k <= 1 ? 1 : cls / (k - 1)));
}
export function divColour(theme: Theme, value: number, maxAbs: number): string {
  const t = maxAbs > 0 ? Math.max(-1, Math.min(1, value / maxAbs)) : 0;
  return rgbToHex(ramp(DIV[theme], (t + 1) / 2));
}
export function top10Colour(theme: Theme, rank: number): string {
  return rgbToHex(mix(hexToRgb(TOP10[theme][0]), hexToRgb(TOP10[theme][1]), (Math.max(1, Math.min(10, rank)) - 1) / 9));
}

/** Accessible categorical palette (colour-blind safe ordering), used by charts. */
export const CHART_PALETTE: Record<Theme, string[]> = {
  dark: ['#5eead4', '#fbbf24', '#818cf8', '#fb923c', '#f472b6', '#a3e635', '#38bdf8', '#e879f9'],
  light: ['#0f766e', '#b45309', '#4338ca', '#c2410c', '#be185d', '#4d7c0f', '#0369a1', '#a21caf'],
};
