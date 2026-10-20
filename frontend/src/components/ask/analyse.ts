/** Works out how to draw a /api/ask result: which column is the label, which are values, whether there is a time axis. */
import { formatCount, formatCrore, formatPct, groupIndian } from '@/lib/format';

export type Row = Record<string, unknown>;
export interface Shape { cat: string | null; time: string | null; nums: string[]; code: string | null }

const TIME = ['year', 'month', 'date'];

export function analyse(columns: string[], rows: Row[]): Shape {
  const isNum = (c: string) => rows.length > 0 && rows.every((r) => r[c] == null || typeof r[c] === 'number');
  const time = columns.find((c) => TIME.includes(c.toLowerCase())) ?? null;
  const nums = columns.filter((c) => isNum(c) && c !== time);
  const strings = columns.filter((c) => !isNum(c) && c !== time);
  const code = columns.includes('state_code') ? 'state_code' : null;
  const cat = strings.find((c) => c === 'state_name') ?? strings.find((c) => c !== 'state_code') ?? strings[0] ?? null;
  return { cat, time, nums, code };
}

/** Format a cell using the column name as a hint (Indian lakh/crore for counts and money). */
export function formatCell(col: string, v: unknown): string {
  if (v == null) return 'n/a';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v !== 'number') return String(v);
  const c = col.toLowerCase();
  if (/(^|_)(year|month)$/.test(c)) return String(v);
  if (/(visits|footfall|rooms|employment|homestays|operators|hotels|population)/.test(c) && !/(per_|share|pct|rate)/.test(c)) return formatCount(v) ?? String(v);
  if (/(revenue|forex|gsdp)/.test(c) && !/(per_|share|pct)/.test(c)) return formatCrore(v) ?? String(v);
  if (/(pct|percent|share|rate|growth)/.test(c)) return formatPct(v) ?? String(v);
  return Number.isInteger(v) ? groupIndian(v) : groupIndian(v, 2);
}

export const labelOf = (col: string) => col.replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase());
