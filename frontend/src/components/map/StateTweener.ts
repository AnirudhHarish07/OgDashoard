import type { Map as MlMap } from 'maplibre-gl';
import { rgbToHex, type RGB } from '@/lib/colour';

interface S { r: number; g: number; b: number; h: number; op: number; hv: number }
export interface Target { fill?: RGB; h?: number; op?: number; hv?: number }

/** Smoothly animates per-state feature-state (fill colour, extrusion height, opacity, hover) so a year change
 *  recolours over ~500ms and hover lifts in ~200ms. Animates by exponential approach, one rAF loop for all states. */
export class StateTweener {
  private cur = new Map<string, S>();
  private tgt = new Map<string, S>();
  private raf = 0;
  private last = 0;
  constructor(private map: MlMap, private source = 'states', public animate = true) {}

  set(code: string, t: Target): void {
    const prev = this.tgt.get(code);
    const next: S = prev
      ? { ...prev }
      : { r: 40, g: 50, b: 68, h: 0, op: 1, hv: 0 };
    if (t.fill) [next.r, next.g, next.b] = t.fill;
    if (t.h != null) next.h = t.h;
    if (t.op != null) next.op = t.op;
    if (t.hv != null) next.hv = t.hv;
    this.tgt.set(code, next);
    if (!this.cur.has(code)) this.cur.set(code, { ...next });
  }

  get(code: string): S | undefined {
    return this.tgt.get(code);
  }

  /** Start animating toward the targets (or snap if animation is off). */
  commit(): void {
    if (!this.animate) {
      this.cur.forEach((_, code) => this.cur.set(code, { ...(this.tgt.get(code) as S) }));
      this.cur.forEach((s, code) => this.write(code, s));
      return;
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    const dt = Math.min(64, now - this.last);
    this.last = now;
    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    const kc = k(120), kh = k(45);
    let moving = false;
    this.cur.forEach((c, code) => {
      const t = this.tgt.get(code) as S;
      c.r += (t.r - c.r) * kc; c.g += (t.g - c.g) * kc; c.b += (t.b - c.b) * kc;
      c.h += (t.h - c.h) * kc; c.op += (t.op - c.op) * kc; c.hv += (t.hv - c.hv) * kh;
      const done = Math.abs(t.r - c.r) + Math.abs(t.g - c.g) + Math.abs(t.b - c.b) < 1.2 && Math.abs(t.h - c.h) < 0.004 && Math.abs(t.op - c.op) < 0.01 && Math.abs(t.hv - c.hv) < 0.01;
      if (done) Object.assign(c, t); else moving = true;
      this.write(code, c);
    });
    this.raf = moving ? requestAnimationFrame(this.tick) : 0;
  };

  private write(code: string, s: S): void {
    try {
      this.map.setFeatureState({ source: this.source, id: code }, { fill: rgbToHex([s.r, s.g, s.b]), h: s.h, op: s.op, hv: s.hv });
    } catch {
      /* source not ready yet: the next commit will write it */
    }
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
