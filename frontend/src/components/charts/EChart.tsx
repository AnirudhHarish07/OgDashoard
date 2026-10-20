import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { AriaComponent, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useUi } from '@/store/ui';
import { CHART_PALETTE } from '@/lib/colour';

echarts.use([BarChart, HeatmapChart, LineChart, PieChart, ScatterChart, AriaComponent, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

export interface ChartHandle {
  dataUrl: () => string | undefined;
  instance: () => echarts.ECharts | null;
}

export function cssRgb(name: string, alpha?: number): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().split(/\s+/).join(',');
  return alpha == null ? `rgb(${raw})` : `rgba(${raw},${alpha})`;
}

/** Theme-aware colours for chart options. Re-read whenever the theme changes. */
export function useChartTheme() {
  const theme = useUi((s) => s.theme);
  return {
    theme,
    ink: cssRgb('ink'), muted: cssRgb('muted'), faint: cssRgb('faint'), line: cssRgb('line'), lineSoft: cssRgb('line', 0.5),
    surface: cssRgb('surface'), bg: cssRgb('bg'), teal: cssRgb('teal'), saffron: cssRgb('saffron'), marigold: cssRgb('marigold'), indigo: cssRgb('indigo'),
    palette: CHART_PALETTE[theme],
  };
}

export function tooltipBase(t: ReturnType<typeof useChartTheme>) {
  return {
    backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, padding: [10, 12],
    textStyle: { color: t.ink, fontSize: 12, fontFamily: 'Inter Variable, Inter, system-ui, sans-serif' },
    extraCssText: 'border-radius:10px;box-shadow:0 10px 30px -10px rgba(0,0,0,.5);backdrop-filter:blur(6px);',
    confine: true,
  };
}

interface Props {
  option: EChartsCoreOption;
  height: number | string;
  ariaLabel: string;
  onEvents?: Record<string, (params: unknown) => void>;
  className?: string;
}

export const EChart = forwardRef<ChartHandle, Props>(function EChart({ option, height, ariaLabel, onEvents, className = '' }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const events = useRef(onEvents);
  events.current = onEvents;

  useImperativeHandle(ref, () => ({
    instance: () => chart.current,
    dataUrl: () => chart.current?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: cssRgb('surface') }),
  }));

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.setOption({ backgroundColor: 'transparent', textStyle: { fontFamily: 'Inter Variable, Inter, system-ui, sans-serif' }, ...option }, { notMerge: true });
    c.off('click');
    c.off('mouseover');
    c.off('mouseout');
    c.off('globalout');
    for (const name of ['click', 'mouseover', 'mouseout', 'globalout']) c.on(name, (p: unknown) => events.current?.[name]?.(p));
  }, [option]);

  return <div ref={el} role="img" aria-label={ariaLabel} className={className} style={{ height, width: '100%' }} />;
});
