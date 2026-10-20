import { useEffect, useRef } from 'react';
import { useUi } from '@/store/ui';
import { subscribePointer } from './pointer';
import { lerp } from './tokens';
import { usePointerFx, useMotionEnabled } from './useMotion';

interface P { x: number; y: number; vx: number; vy: number; r: number; a: number }

/** Faint drifting glow + sparse particles on one canvas behind every page, pulled gently toward the cursor. */
export function Ambient() {
  const motion = useMotionEnabled();
  const fx = usePointerFx();
  const theme = useUi((s) => s.theme);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !motion) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let w = 0, h = 0, raf = 0, last = performance.now();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const count = 46;
    const parts: P[] = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, r: 0.6 + Math.random() * 1.6, a: 0.15 + Math.random() * 0.35,
    }));
    const target = { x: w / 2, y: h / 2 };
    const glow = { x: w / 2, y: h / 2 };
    const unsub = fx ? subscribePointer((s) => { target.x = s.x; target.y = s.y; }) : () => {};
    const dark = theme === 'dark';
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const tt = now / 1000;
      // when no pointer fx, the glow just drifts slowly
      const gx = fx ? target.x : w / 2 + Math.sin(tt * 0.15) * w * 0.25;
      const gy = fx ? target.y : h / 2 + Math.cos(tt * 0.12) * h * 0.2;
      glow.x = lerp(glow.x, gx, 0.02);
      glow.y = lerp(glow.y, gy, 0.02);
      ctx.clearRect(0, 0, w, h);
      const g1 = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, Math.max(w, h) * 0.55);
      g1.addColorStop(0, dark ? 'rgba(45,212,191,0.07)' : 'rgba(13,125,116,0.07)');
      g1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);
      const g2x = w - glow.x * 0.6, g2y = h - glow.y * 0.6;
      const g2 = ctx.createRadialGradient(g2x, g2y, 0, g2x, g2y, Math.max(w, h) * 0.5);
      g2.addColorStop(0, dark ? 'rgba(255,153,51,0.055)' : 'rgba(194,90,5,0.06)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = dark ? '#ffd7a8' : '#7c5a2a';
      for (const p of parts) {
        const dx = glow.x - p.x, dy = glow.y - p.y;
        const d = Math.hypot(dx, dy) + 1;
        p.vx += (dx / d) * 3 * dt;
        p.vy += (dy / d) * 3 * dt;
        p.vx *= 0.995;
        p.vy *= 0.995;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        ctx.globalAlpha = p.a * (dark ? 1 : 0.7);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [motion, fx, theme]);

  if (!motion) {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: 'radial-gradient(60% 50% at 20% 10%, rgb(var(--teal) / 0.06), transparent), radial-gradient(50% 40% at 90% 90%, rgb(var(--saffron) / 0.05), transparent)' }}
      />
    );
  }
  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
