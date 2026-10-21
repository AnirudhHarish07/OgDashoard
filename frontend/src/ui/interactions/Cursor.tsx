import { useEffect, useRef } from 'react';
import { lerp } from './tokens';
import { subscribePointer, pointer } from './pointer';
import { usePointerFx } from './useMotion';

const CLICKABLE = 'a, button, [role="button"], [role="tab"], [role="option"], input, select, summary, label, [data-cursor="hover"]';

/** Custom cursor: a dot that follows exactly plus a ring that trails with lerp easing. */
export function Cursor() {
  const enabled = usePointerFx();
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add('fx-cursor');
    const p = { x: pointer.x, y: pointer.y, rx: pointer.x, ry: pointer.y, scale: 1, target: 1, visible: false };
    let raf = 0;
    const unsub = subscribePointer((s) => {
      p.x = s.x;
      p.y = s.y;
      if (!p.visible) {
        p.visible = true;
        p.rx = s.x;
        p.ry = s.y;
        dot.current?.style.setProperty('opacity', '1');
        ring.current?.style.setProperty('opacity', '1');
      }
      p.target = s.down ? 0.7 : s.target?.closest(CLICKABLE) ? 1.8 : 1;
      if (!s.inside) {
        dot.current?.style.setProperty('opacity', '0');
        ring.current?.style.setProperty('opacity', '0');
        p.visible = false;
      }
    });
    const tick = () => {
      p.rx = lerp(p.rx, p.x, 0.2);
      p.ry = lerp(p.ry, p.y, 0.2);
      p.scale = lerp(p.scale, p.target, 0.25);
      if (dot.current) dot.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
      if (ring.current) ring.current.style.transform = `translate3d(${p.rx}px, ${p.ry}px, 0) translate(-50%, -50%) scale(${p.scale})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
      document.documentElement.classList.remove('fx-cursor');
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <div ref={ring} aria-hidden className="pointer-events-none fixed left-0 top-0 z-[9999] h-9 w-9 rounded-full border border-teal/70 opacity-0 mix-blend-normal" style={{ transition: 'opacity 200ms' }} />
      <div ref={dot} aria-hidden className="pointer-events-none fixed left-0 top-0 z-[9999] h-1.5 w-1.5 rounded-full bg-saffron opacity-0" style={{ transition: 'opacity 200ms' }} />
    </>
  );
}
