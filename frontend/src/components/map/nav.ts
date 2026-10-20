export interface Pt { code: string; lon: number; lat: number }
export type Dir = 'left' | 'right' | 'up' | 'down';

/** Keyboard navigation between states: the nearest state whose direction from the current one is within ~65 degrees of the arrow. */
export function nextState(current: string | null, dir: Dir, pts: Pt[]): string | null {
  if (!pts.length) return null;
  const cur = pts.find((p) => p.code === current);
  if (!cur) {
    const cx = pts.reduce((a, p) => a + p.lon, 0) / pts.length, cy = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
    return [...pts].sort((a, b) => Math.hypot(a.lon - cx, a.lat - cy) - Math.hypot(b.lon - cx, b.lat - cy))[0].code;
  }
  const want = { right: [1, 0], left: [-1, 0], up: [0, 1], down: [0, -1] }[dir];
  let best: { code: string; score: number } | null = null;
  for (const p of pts) {
    if (p.code === cur.code) continue;
    const dx = p.lon - cur.lon, dy = p.lat - cur.lat, d = Math.hypot(dx, dy);
    if (d === 0) continue;
    const cos = (dx * want[0] + dy * want[1]) / d;
    if (cos < 0.42) continue;
    const score = d * (2 - cos);
    if (!best || score < best.score) best = { code: p.code, score };
  }
  return best?.code ?? current;
}
