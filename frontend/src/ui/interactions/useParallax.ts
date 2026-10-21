import { useEffect, type RefObject } from 'react';
import { subscribePointer } from './pointer';
import { lerp } from './tokens';
import { usePointerFx } from './useMotion';

/** Multi-layer parallax: children with data-depth="0.5" translate by pointer offset * depth (px). */
export function useParallax(container: RefObject<HTMLElement>, maxShift = 36): void {
  const enabled = usePointerFx();
  useEffect(() => {
    const root = container.current;
    if (!root || !enabled) return;
    const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-depth]'));
    const state = layers.map(() => ({ x: 0, y: 0 }));
    const t = { x: 0, y: 0 };
    let raf = 0;
    const loop = () => {
      let moving = false;
      layers.forEach((l, i) => {
        const d = Number(l.dataset.depth ?? 0);
        const s = state[i];
        s.x = lerp(s.x, t.x * d * maxShift, 0.08);
        s.y = lerp(s.y, t.y * d * maxShift, 0.08);
        if (Math.abs(s.x - t.x * d * maxShift) > 0.05 || Math.abs(s.y - t.y * d * maxShift) > 0.05) moving = true;
        l.style.transform = `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0)`;
      });
      raf = moving ? requestAnimationFrame(loop) : 0;
    };
    const unsub = subscribePointer((p) => {
      t.x = p.nx;
      t.y = p.ny;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsub();
      layers.forEach((l) => (l.style.transform = ''));
    };
  }, [container, enabled, maxShift]);
}
