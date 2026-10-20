import { useEffect, type RefObject } from 'react';
import { usePointerFx } from './useMotion';
import { clamp } from './tokens';

/** 3D tilt (max ~8deg) with a light sheen. Put a child with `data-sheen` inside the element for the highlight. */
export function useTilt(ref: RefObject<HTMLElement>, max = 8): void {
  const enabled = usePointerFx();
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const sheen = el.querySelector<HTMLElement>('[data-sheen]');
    let raf = 0;
    let pending: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      if (!pending) return;
      const r = el.getBoundingClientRect();
      const px = clamp((pending.clientX - r.left) / r.width, 0, 1);
      const py = clamp((pending.clientY - r.top) / r.height, 0, 1);
      el.style.transform = `perspective(900px) rotateX(${((0.5 - py) * 2 * max).toFixed(2)}deg) rotateY(${((px - 0.5) * 2 * max).toFixed(2)}deg) translateZ(0)`;
      if (sheen) {
        sheen.style.opacity = '1';
        sheen.style.transform = `translate3d(${(px - 0.5) * 60}%, ${(py - 0.5) * 60}%, 0)`;
      }
      pending = null;
    };
    const move = (e: PointerEvent) => {
      pending = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const leave = () => {
      pending = null;
      el.style.transform = '';
      if (sheen) sheen.style.opacity = '0';
    };
    el.style.transition = 'transform 220ms var(--ease)';
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', leave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.style.transform = '';
      el.style.transition = '';
    };
  }, [ref, enabled, max]);
}
