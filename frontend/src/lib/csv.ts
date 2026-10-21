/** Client-side CSV for charts that have no /api/export view. Always includes is_synthetic and data_source columns. */
function cell(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], source: string | undefined): string {
  if (!rows.length) return 'is_synthetic,data_source\n';
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'is_synthetic' && k !== 'data_source');
  const cols = [...keys, 'is_synthetic', 'data_source'];
  const lines = rows.map((r) => [...keys.map((k) => cell(r[k])), cell(r.is_synthetic ?? true), cell(source ?? '')].join(','));
  return [cols.join(','), ...lines].join('\n') + '\n';
}

export function downloadText(text: string, filename: string, mime = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
