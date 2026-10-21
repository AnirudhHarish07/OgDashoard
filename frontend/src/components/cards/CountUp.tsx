import { useEffect, useRef } from 'react';
import { groupIndian, splitDisplay } from '@/lib/format';
import { ease } from '@/ui/interactions/tokens';
import { useMotionEnabled } from '@/ui/interactions/useMotion';

/** Animates the number inside a display string ("287.0 Cr", "+14.4%") the first time it scrolls into view. */
export function CountUp({ display, className = '', duration = 1200 }: { display: string; className?: string; duration?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  const motion = useMotionEnabled();
  useEffect(() => {
    const node = el.current;
    const parts = splitDisplay(display);
    if (!node) return;
    node.textContent = display;
    if (!parts || !motion) { done.current = true; return; }
    const fmt = (v: number) => parts.prefix + (parts.grouped ? groupIndian(v, parts.decimals) : v.toFixed(parts.decimals)) + parts.suffix;
    let raf = 0;
    const run = () => {
      done.current = true;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        node.textContent = t < 1 ? fmt(parts.value * ease(t)) : display;
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    if (done.current) return;
    node.textContent = fmt(0);
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) { io.disconnect(); run(); } }, { threshold: 0.4 });
    io.observe(node);
    return () => { io.disconnect(); cancelAnimationFrame(raf); node.textContent = display; };
  }, [display, motion, duration]);
  return <span ref={el} className={`num ${className}`} aria-label={display}>{display}</span>;
}
