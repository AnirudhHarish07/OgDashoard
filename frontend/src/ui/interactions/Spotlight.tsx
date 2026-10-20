import { useEffect, useRef } from 'react';
import { useUi } from '@/store/ui';
import { subscribePointer } from './pointer';
import { lerp } from './tokens';
import { usePointerFx } from './useMotion';

/** Dark theme only: a soft light circle that follows the cursor (moved with transform, not repainted). */
export function Spotlight() {
  const enabled = usePointerFx();
  const dark = useUi((s) => s.theme === 'dark');
  const el = useRef<HTMLDivElement>(null);
  const on = enabled && dark;

  useEffect(() => {
    if (!on) return;
    const t = { x: window.innerWidth / 2, y: window.innerHeight / 2, cx: window.innerWidth / 2, cy: window.innerHeight / 2 };
    let raf = 0;
    const unsub = subscribePointer((s) => {
      t.x = s.x;
      t.y = s.y;
    });
    const tick = () => {
      t.cx = lerp(t.cx, t.x, 0.12);
      t.cy = lerp(t.cy, t.y, 0.12);
      if (el.current) el.current.style.transform = `translate3d(${t.cx - 320}px, ${t.cy - 320}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [on]);

  if (!on) return null;
  return (
    <div
      ref={el}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[1] h-[640px] w-[640px] rounded-full will-change-transform"
      style={{ background: 'radial-gradient(circle, rgb(255 190 120 / 0.075) 0%, rgb(255 190 120 / 0.03) 35%, transparent 65%)' }}
    />
  );
}
