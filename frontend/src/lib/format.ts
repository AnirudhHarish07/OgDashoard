/** Shared Indian-number formatting (lakh / crore). Backend display strings are preferred; these are the fallback. */

type Num = number | null | undefined;

const isNum = (v: Num): v is number => typeof v === 'number' && Number.isFinite(v);

/** 12345678 -> "1,23,45,678" */
export function groupIndian(n: number, decimals = 0): string {
  const fixed = Math.abs(n).toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  let out = whole;
  if (whole.length > 3) {
    let head = whole.slice(0, -3);
    const tail = whole.slice(-3);
    const parts: string[] = [];
    while (head.length > 2) {
      parts.unshift(head.slice(-2));
      head = head.slice(0, -2);
    }
    if (head) parts.unshift(head);
    out = [...parts, tail].join(',');
  }
  const neg = n < 0 && Number(fixed) !== 0 ? '-' : '';
  return neg + out + (frac ? `.${frac}` : '');
}

const scaled = (x: number) => (Math.abs(x) < 10 ? x.toFixed(2) : x.toFixed(1));

/** Visit counts: "21.9 Cr", "3.05 L", "45,210". */
export function formatCount(v: Num): string | null {
  if (!isNum(v)) return null;
  const a = Math.abs(v);
  if (a >= 1e7) return `${scaled(v / 1e7)} Cr`;
  if (a >= 1e5) return `${scaled(v / 1e5)} L`;
  return groupIndian(v);
}

/** Money already in INR crore: "₹9,714 Cr", "₹10.3 L Cr". */
export function formatCrore(v: Num): string | null {
  if (!isNum(v)) return null;
  if (Math.abs(v) >= 1e5) return `₹${scaled(v / 1e5)} L Cr`;
  return `₹${groupIndian(v)} Cr`;
}

/** Money in INR: "₹2,536". */
export function formatRupees(v: Num): string | null {
  return isNum(v) ? `₹${groupIndian(v)}` : null;
}

export function formatPct(v: Num, signed = false): string | null {
  if (!isNum(v)) return null;
  return signed ? `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(1)}%` : `${v.toFixed(1)}%`;
}

export function formatNumber(v: Num, decimals = 0): string | null {
  return isNum(v) ? groupIndian(v, decimals) : null;
}

export type MapMetric = 'domestic_visits' | 'foreign_visits' | 'total_visits' | 'revenue' | 'growth_pct' | 'visits_per_1000_people';

export function formatMetric(metric: string, v: Num): string | null {
  switch (metric) {
    case 'revenue':
      return formatCrore(v);
    case 'growth_pct':
      return formatPct(v, true);
    case 'visits_per_1000_people':
      return formatNumber(v);
    default:
      return formatCount(v);
  }
}

/** Prefer the backend display string; fall back to the formatter; finally "n/a". */
export function preferDisplay(display: string | null | undefined, value: Num, fallback: (v: number) => string | null = (v) => formatCount(v)): string {
  if (display) return display;
  if (isNum(value)) return fallback(value) ?? 'n/a';
  return 'n/a';
}

/** First segment of a long data_source string, e.g. "SYNTHETIC". */
export function shortSource(source: string | null | undefined): string {
  if (!source) return 'unknown';
  const head = source.split(':')[0].trim();
  const via = /src\/\w+\.py/.exec(source)?.[0];
  return via ? `${head} (${via})` : head;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Split a display string like "₹10.3 L Cr" / "+14.4%" into prefix, number, suffix for count-up animation. */
export function splitDisplay(display: string): { prefix: string; value: number; decimals: number; suffix: string; grouped: boolean } | null {
  const m = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/.exec(display);
  if (!m) return null;
  const raw = m[2];
  const value = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  return { prefix: m[1], value, decimals, suffix: m[3], grouped: raw.includes(',') };
}
