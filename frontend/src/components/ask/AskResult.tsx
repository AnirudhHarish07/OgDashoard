import { useMemo, useRef, useState } from 'react';
import type { AskResponse } from '@/api/types';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable } from '@/components/charts/DataTable';
import { EChart, tooltipBase, useChartTheme, type ChartHandle } from '@/components/charts/EChart';
import { barFx, crosshair } from '@/components/charts/fx';
import { tip } from '@/components/charts/tip';
import { Select } from '@/components/filters/controls';
import { analyse, formatCell, labelOf, type Row } from './analyse';
import { MiniMap } from './MiniMap';

function BarView({ rows, cat, val, code, src }: { rows: Row[]; cat: string; val: string; code: string | null; src: string | undefined }) {
  const t = useChartTheme();
  const chart = useRef<ChartHandle>(null);
  const codes = useMemo(() => rows.map((r) => (code ? String(r[code]) : null)), [rows, code]);
  const option = useMemo(() => ({
    grid: { left: 150, right: 90, top: 8, bottom: 24 },
    tooltip: { ...tooltipBase(t), trigger: 'item', formatter: (p: { dataIndex: number }) => tip(t, { title: String(rows[p.dataIndex][cat]), synthetic: true, source: src, rows: [[labelOf(val), formatCell(val, rows[p.dataIndex][val])]] }) },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, hideOverlap: true, formatter: (v: number) => formatCell(val, v) } },
    yAxis: { type: 'category', inverse: true, data: rows.map((r) => String(r[cat])), axisTick: { show: false }, axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.ink, width: 140, overflow: 'truncate' } },
    series: [{ type: 'bar', barWidth: '60%', barMaxWidth: 30, data: rows.map((r, i) => ({ value: r[val], itemStyle: { color: t.palette[0], borderRadius: [0, 4, 4, 0], opacity: i < 1 ? 1 : 0.9 } })), label: { show: true, position: 'right', color: t.ink, fontSize: 11, formatter: (p: { dataIndex: number }) => formatCell(val, rows[p.dataIndex][val]) }, ...barFx(t) }],
  }), [rows, cat, val, src, t]);
  return <EChart ref={chart} option={option} height={Math.max(220, rows.length * 34 + 40)} hoverCodes={code ? codes : undefined} ariaLabel={`Bar chart of ${labelOf(val)} by ${labelOf(cat)}`} />;
}

function LineView({ rows, time, cat, val, src }: { rows: Row[]; time: string; cat: string | null; val: string; src: string | undefined }) {
  const t = useChartTheme();
  const xs = useMemo(() => [...new Set(rows.map((r) => r[time] as number | string))].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)))), [rows, time]);
  const groups = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of rows) g.set(cat ? String(r[cat]) : labelOf(val), [...(g.get(cat ? String(r[cat]) : labelOf(val)) ?? []), r]);
    return [...g.entries()];
  }, [rows, cat, val]);
  const option = useMemo(() => ({
    grid: { left: 70, right: 20, top: 34, bottom: 28 },
    legend: groups.length > 1 ? { top: 0, textStyle: { color: t.muted }, icon: 'roundRect', type: 'scroll' } : undefined,
    tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: crosshair(t), formatter: (ps: { seriesName: string; value: unknown; axisValue: string }[]) => tip(t, { title: String(ps[0].axisValue), synthetic: true, source: src, rows: ps.map((p) => [p.seriesName, formatCell(val, p.value)] as [string, string]) }) },
    xAxis: { type: 'category', data: xs.map(String), boundaryGap: false, axisLabel: { color: t.muted }, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: t.lineSoft } }, axisLabel: { color: t.muted, formatter: (v: number) => formatCell(val, v) } },
    series: groups.map(([name, rs], i) => ({ name, type: 'line', smooth: 0.2, symbolSize: 6, emphasis: { focus: 'series' }, lineStyle: { width: 2.5, color: t.palette[i % t.palette.length] }, itemStyle: { color: t.palette[i % t.palette.length] },
      data: xs.map((x) => (rs.find((r) => r[time] === x)?.[val] ?? null)) })),
  }), [xs, groups, val, time, src, t]);
  return <EChart option={option} height={320} ariaLabel={`Line chart of ${labelOf(val)} by ${labelOf(time)}`} />;
}

export default function AskResult({ resp }: { resp: AskResponse }) {
  const d = resp.data;
  const rows = d.rows as Row[];
  const shape = useMemo(() => analyse(d.columns, rows), [d.columns, rows]);
  const [valCol, setValCol] = useState<string | null>(null);
  const val = valCol && shape.nums.includes(valCol) ? valCol : shape.nums[0] ?? null;
  const src = resp.meta.data_sources[0];
  const chart = useRef<ChartHandle>(null);

  // chart_type comes from the backend (already checked against the result shape); fall back to a table if the columns don't support it
  let type = d.chart_type;
  if (type === 'bar' && !(shape.cat && val)) type = 'table';
  if (type === 'line' && !(shape.time && val)) type = 'table';
  if (type === 'map' && !(shape.code && val)) type = 'table';
  const cols = d.columns.map((c) => ({ key: c, label: labelOf(c), align: (shape.nums.includes(c) ? 'right' : 'left') as 'left' | 'right', render: (r: Row) => formatCell(c, r[c]) }));
  const table = <DataTable caption={d.title || 'Query result'} rows={rows} columns={cols} rowCode={(r) => (shape.code ? String(r[shape.code]) : null)} maxHeight={360} />;
  const synthetic = resp.meta.synthetic_share > 0;
  return (
    <div className="space-y-2" data-testid="ask-result" data-chart-type={type}>
      <ChartCard
        title={d.title || 'Result'} subtitle={d.explanation} chart={chart} synthetic={synthetic}
        csv={{ name: 'ask-result', source: src, rows }}
        controls={shape.nums.length > 1 && (type === 'bar' || type === 'line' || type === 'map') ? <Select label="Metric" allLabel="" value={val} onChange={(v) => v && setValCol(v)} options={shape.nums.map((c) => ({ value: c, label: labelOf(c) }))} /> : undefined}
        table={type === 'table' ? undefined : table}
        footer={<span>{d.row_count} row{d.row_count === 1 ? '' : 's'}{d.truncated ? ' (truncated to the row limit)' : ''} from {d.tables_used.join(', ')}. Shown as a {type}.</span>}
      >
        {type === 'bar' && shape.cat && val && <BarView rows={rows} cat={shape.cat} val={val} code={shape.code} src={src} />}
        {type === 'line' && shape.time && val && <LineView rows={rows} time={shape.time} cat={shape.cat} val={val} src={src} />}
        {type === 'map' && shape.code && val && <MiniMap rows={rows} code={shape.code} value={val} />}
        {type === 'table' && (rows.length ? table : <p className="p-4 text-sm text-muted" role="status">The query ran but returned no rows.</p>)}
      </ChartCard>
      <details className="card px-3 py-2 text-sm">
        <summary className="cursor-pointer select-none text-muted hover:text-ink">SQL used</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-raised p-3 text-xs leading-relaxed text-ink" data-testid="ask-sql">{d.sql}</pre>
        <p className="mt-1 text-[11px] text-faint">Generated by Claude from the dataset schema, then checked by the server (single read-only SELECT on dataset tables, row limit, timeout) before it ran.</p>
      </details>
    </div>
  );
}
