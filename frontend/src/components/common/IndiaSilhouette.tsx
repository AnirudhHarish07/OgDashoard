import { useMemo } from 'react';
import type { GeoCollection } from '@/api/types';

type Ring = number[][];

function rings(geom: { type?: unknown; coordinates?: unknown }): Ring[] {
  const c = geom.coordinates as unknown;
  if (geom.type === 'Polygon') return c as Ring[];
  if (geom.type === 'MultiPolygon') return (c as Ring[][]).flat();
  return [];
}

/** Build SVG path data from the API's own geometry (equirectangular, cos-latitude corrected). No hard-coded shapes. */
export function useSilhouette(geo: GeoCollection | undefined) {
  return useMemo(() => {
    if (!geo) return null;
    const all = geo.features.map((f) => rings(f.geometry as { type?: unknown; coordinates?: unknown }));
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const rs of all) for (const r of rs) for (const [x, y] of r) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const k = Math.cos((((miny + maxy) / 2) * Math.PI) / 180);
    const w = (maxx - minx) * k, h = maxy - miny, s = 1000 / Math.max(w, h);
    const paths = all.map((rs) =>
      rs.map((r) => 'M' + r.map(([x, y]) => `${((x - minx) * k * s).toFixed(1)} ${((maxy - y) * s).toFixed(1)}`).join('L') + 'Z').join(''),
    );
    return { paths, width: w * s, height: h * s };
  }, [geo]);
}

export function IndiaSilhouette({ geo, className = '' }: { geo: GeoCollection | undefined; className?: string }) {
  const s = useSilhouette(geo);
  if (!s) return null;
  const d = s.paths.join('');
  return (
    <svg aria-hidden viewBox={`0 0 ${s.width} ${s.height}`} className={className} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="sil-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--saffron))" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="rgb(var(--marigold))" stopOpacity="0.55" />
          <stop offset="1" stopColor="rgb(var(--teal))" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <path d={d} fill="url(#sil-fill)" stroke="rgb(var(--bg))" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Per-state SVG paths from the same geometry, for lightweight maps that don't need WebGL. */
export function useStatePaths(geo: GeoCollection | undefined) {
  return useMemo(() => {
    if (!geo) return null;
    const all = geo.features.map((f) => rings(f.geometry as { type?: unknown; coordinates?: unknown }));
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const rs of all) for (const r of rs) for (const [x, y] of r) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const k = Math.cos((((miny + maxy) / 2) * Math.PI) / 180);
    const w = (maxx - minx) * k, h = maxy - miny, s = 1000 / Math.max(w, h);
    const states = geo.features.map((f, i) => ({
      code: f.properties.state_code, name: f.properties.state_name,
      d: all[i].map((r) => 'M' + r.map(([x, y]) => `${((x - minx) * k * s).toFixed(1)} ${((maxy - y) * s).toFixed(1)}`).join('L') + 'Z').join(''),
    }));
    return { states, width: w * s, height: h * s };
  }, [geo]);
}
