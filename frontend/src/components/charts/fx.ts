/** Shared chart hover effects (ECharts option fragments) so every chart behaves the same way. */
import type { useChartTheme } from './EChart';

type T = ReturnType<typeof useChartTheme>;

/** Hovered bar rises (offset glow) while the others dim. */
export const barFx = (t: T) => ({
  emphasis: { focus: 'self' as const, itemStyle: { shadowBlur: 20, shadowColor: t.teal, shadowOffsetY: -5, borderColor: t.ink, borderWidth: 1 } },
  blur: { itemStyle: { opacity: 0.28 } },
});

/** Heatmap: the hovered cell enlarges (heavier border + glow); the row and column highlight is added by the page. */
export const heatmapFx = (t: T) => ({
  emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 2, shadowBlur: 16, shadowColor: t.saffron } },
  blur: { itemStyle: { opacity: 0.55 } },
});

export const scatterFx = (t: T) => ({
  emphasis: { focus: 'self' as const, scale: 1.45, itemStyle: { shadowBlur: 18, shadowColor: t.saffron, borderColor: t.ink, borderWidth: 1.5 } },
  blur: { itemStyle: { opacity: 0.25 } },
});

/** Dashed crosshair guide line for line charts. */
export const crosshair = (t: T) => ({ type: 'line' as const, lineStyle: { color: t.saffron, type: 'dashed' as const, width: 1.2 }, label: { show: false } });

/** Which data item to highlight for a hovered state code (pure, tested). */
export function highlightPlan(codes: (string | null)[], hovered: string | null): { dataIndex: number | null } {
  if (!hovered) return { dataIndex: null };
  const i = codes.indexOf(hovered);
  return { dataIndex: i >= 0 ? i : null };
}
