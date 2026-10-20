import { useEffect, type RefObject } from 'react';
import { subscribePointer } from './pointer';
import { lerp } from './tokens';
import { usePointerFx } from './useMotion';

/** Magnetic button: pulls toward the cursor when it comes within `radius` px. */
export function useMagnetic(ref: RefObject<HTMLElement>, strength = 0.35, radius = 90): void {
  const enabled = usePointerFx();
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const cur = { x: 0, y: 0 };
    const tgt = { x: 0, y: 0 };
    let raf = 0;
    const loop = () => {
      cur.x = lerp(cur.x, tgt.x, 0.18);
      cur.y = lerp(cur.y, tgt.y, 0.18);
      el.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`;
      if (Math.abs(cur.x - tgt.x) > 0.05 || Math.abs(cur.y - tgt.y) > 0.05) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const unsub = subscribePointer((p) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = p.x - cx, dy = p.y - cy;
      const near = Math.hypot(dx, dy) < radius + Math.max(r.width, r.height) / 2;
      tgt.x = near ? dx * strength : 0;
      tgt.y = near ? dy * strength : 0;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsub();
      el.style.transform = '';
    };
  }, [ref, enabled, strength, radius]);
}
