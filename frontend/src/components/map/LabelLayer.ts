import type { Map as MlMap } from 'maplibre-gl';

export interface LabelFeature { code: string; name: string; lon: number; lat: number; small: boolean }
export interface LabelRow { display: string | null; rank: number | null; isTop10: boolean }

interface L extends LabelFeature {
  el: HTMLDivElement; name$: HTMLSpanElement; val$: HTMLSpanElement; badge$: HTMLSpanElement;
  leader: HTMLDivElement; w: number; h: number; hidden: boolean; dx: number; dy: number; len: number; angle: number;
  x: number; y: number;
}

const CENTRE = { lon: 82, lat: 23 };
const LEADER = 46;

/** HTML labels at each state's centroid. Big states: always (collision-culled). Small states (API flag): a dot, and the
 *  label with a leader line only on hover/focus/selection, so nothing overlaps. Positions use transform only. */
export class LabelLayer {
  private items: L[] = [];
  private active: string | null = null;
  private selected: string | null = null;
  private dimmed = false;
  private showRank = false;
  private onHover: (code: string | null) => void;
  private onPick: (code: string) => void;
  private offRender: () => void;

  constructor(private map: MlMap, private host: HTMLElement, features: LabelFeature[], cb: { onHover: (c: string | null) => void; onPick: (c: string) => void }) {
    this.onHover = cb.onHover;
    this.onPick = cb.onPick;
    this.items = features.map((f) => this.create(f));
    const render = () => this.position();
    const settle = () => this.layout();
    map.on('render', render);
    map.on('moveend', settle);
    map.on('resize', settle);
    this.offRender = () => { map.off('render', render); map.off('moveend', settle); map.off('resize', settle); };
  }

  private create(f: LabelFeature): L {
    const dirX = f.lon - CENTRE.lon, dirY = -(f.lat - CENTRE.lat);
    const angle = Math.atan2(dirY || 0.001, dirX || 0.001);
    const el = document.createElement('div');
    el.className = 'state-label';
    el.dataset.code = f.code;
    el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;will-change:transform;transition:opacity 200ms var(--ease);white-space:nowrap;text-align:center;line-height:1.15;';
    const badge$ = document.createElement('span');
    badge$.style.cssText = 'display:none;margin-right:4px;min-width:14px;height:14px;padding:0 3px;border-radius:99px;background:rgb(var(--saffron));color:rgb(var(--bg));font:700 9px/14px inherit;vertical-align:1px;';
    const name$ = document.createElement('span');
    name$.textContent = f.name;
    name$.style.cssText = 'font-weight:600;font-size:10.5px;color:rgb(var(--ink));text-shadow:0 0 3px rgb(var(--bg)),0 0 6px rgb(var(--bg));';
    const val$ = document.createElement('span');
    val$.style.cssText = 'display:block;font-size:10px;color:rgb(var(--muted));font-variant-numeric:tabular-nums;text-shadow:0 0 3px rgb(var(--bg)),0 0 6px rgb(var(--bg));';
    const row = document.createElement('div');
    row.append(badge$, name$);
    el.append(row, val$);
    const leader = document.createElement('div');
    leader.style.cssText = `position:absolute;left:0;top:0;height:0;width:${LEADER}px;border-top:1px solid rgb(var(--ink)/.55);transform-origin:0 0;pointer-events:none;opacity:0;transition:opacity 200ms var(--ease);will-change:transform;`;
    const dot = document.createElement('div');
    if (f.small) {
      dot.style.cssText = 'position:absolute;left:0;top:0;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:99px;background:rgb(var(--ink));border:2px solid rgb(var(--bg));box-shadow:0 0 0 1px rgb(var(--ink)/.6);pointer-events:auto;cursor:pointer;';
      dot.addEventListener('mouseenter', () => this.onHover(f.code));
      dot.addEventListener('mouseleave', () => this.onHover(null));
      dot.addEventListener('click', () => this.onPick(f.code));
      dot.dataset.dot = f.code;
    }
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;left:0;top:0;';
    wrapper.append(...(f.small ? [leader, dot] : []), el);
    this.host.append(wrapper);
    // `el` is moved by transform; wrapper holds the dot/leader (also transform-positioned)
    return { ...f, el, name$, val$, badge$, leader, w: 0, h: 0, hidden: false, dx: Math.cos(angle) * LEADER, dy: Math.sin(angle) * LEADER, len: LEADER, angle, x: 0, y: 0, wrapper } as L & { wrapper: HTMLDivElement };
  }

  setData(rows: Map<string, LabelRow>, showRank: boolean): void {
    this.showRank = showRank;
    for (const it of this.items) {
      const r = rows.get(it.code);
      it.val$.textContent = r?.display ?? '';
      const b = it.badge$;
      if (showRank && r?.isTop10 && r.rank != null) { b.textContent = String(r.rank); b.style.display = 'inline-block'; } else b.style.display = 'none';
      it.w = it.el.offsetWidth; it.h = it.el.offsetHeight;
    }
    this.layout();
  }

  setActive(code: string | null): void { this.active = code; this.layout(); }
  setSelected(code: string | null, dim: boolean): void { this.selected = code; this.dimmed = dim; this.layout(); }
  /** Zoom factor of the map vs the home view decides whether detail (value line) is shown. */
  private detail(): boolean { return this.map.getZoom() >= 4.3 || this.dimmed; }

  position(): void {
    for (const it of this.items) {
      const p = this.map.project([it.lon, it.lat]);
      it.x = p.x; it.y = p.y;
      const w = (it as L & { wrapper: HTMLDivElement }).wrapper;
      if (it.small) {
        const isOn = it.code === this.active || it.code === this.selected;
        const lx = p.x + it.dx, ly = p.y + it.dy;
        it.el.style.transform = `translate3d(${lx}px, ${ly}px, 0) translate(-50%, -50%)`;
        it.leader.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${it.angle}rad)`;
        const dot = w.querySelector<HTMLElement>('[data-dot]');
        if (dot) dot.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        it.leader.style.opacity = isOn ? '1' : '0';
      } else {
        it.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
      }
    }
  }

  /** Greedy collision culling: highest priority first, hide anything that overlaps an accepted label. */
  layout(): void {
    const detail = this.detail();
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const order = [...this.items].sort((a, b) => this.prio(a) - this.prio(b));
    for (const it of order) {
      if (!it.w) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; }
      it.val$.style.display = detail || it.code === this.active || it.code === this.selected ? 'block' : 'none';
      const focus = it.code === this.active || it.code === this.selected;
      let show: boolean;
      if (it.small) show = focus;
      else if (this.dimmed) show = focus;
      else {
        const w = it.w + 6, h = (detail ? it.h : 14) + 4;
        const box = { x0: it.x - w / 2, y0: it.y - h / 2, x1: it.x + w / 2, y1: it.y + h / 2 };
        const clash = boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
        show = focus || !clash;
        if (show) boxes.push(box);
      }
      it.hidden = !show;
      it.el.style.opacity = show ? '1' : '0';
      it.el.style.zIndex = focus ? '5' : '1';
    }
    this.position();
  }

  private prio(it: L): number {
    if (it.code === this.active || it.code === this.selected) return -1;
    const r = Number(it.badge$.textContent);
    if (this.showRank && r) return r;
    return 20 + (it.small ? 100 : 0) + it.name$.textContent!.length * 0.01;
  }

  /** Visible (non-culled) label text, used by tests and the live region. */
  visibleCodes(): string[] { return this.items.filter((i) => !i.hidden).map((i) => i.code); }

  destroy(): void {
    this.offRender();
    this.items.forEach((i) => (i as L & { wrapper: HTMLDivElement }).wrapper.remove());
    this.items = [];
  }
}
