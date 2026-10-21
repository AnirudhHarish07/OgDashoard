import { escapeHtml, shortSource } from '@/lib/format';
import { syntheticBadgeHtml } from '@/components/common/SyntheticBadge';
import type { useChartTheme } from './EChart';

/** Tooltip body used by every chart: exact value rows, the data source, and the synthetic badge. */
export function tip(t: ReturnType<typeof useChartTheme>, o: { title: string; titleExtra?: string; synthetic?: boolean; rows: [string, string | null | undefined][]; source?: string; note?: string }): string {
  const rows = o.rows
    .map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:18px"><span style="color:${t.muted}">${escapeHtml(k)}</span><b style="font-variant-numeric:tabular-nums">${escapeHtml(v ?? 'n/a')}</b></div>`)
    .join('');
  return `<div style="min-width:190px"><div style="font-weight:600;margin-bottom:4px">${escapeHtml(o.title)}${o.titleExtra ?? ''}${o.synthetic ? syntheticBadgeHtml : ''}</div>${rows}${
    o.note ? `<div style="margin-top:4px;font-size:10.5px;color:${t.muted}">${escapeHtml(o.note)}</div>` : ''
  }${o.source ? `<div style="margin-top:4px;font-size:10.5px;color:${t.faint}">Source: ${escapeHtml(shortSource(o.source))}</div>` : ''}</div>`;
}
