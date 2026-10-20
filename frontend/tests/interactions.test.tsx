import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightPlan } from '@/components/charts/fx';
import { Header } from '@/components/common/Layout';
import { useUi } from '@/store/ui';
import { Ambient, Cursor, Spotlight, cubicBezier, ease, subscribePointer, useMagnetic, useMotionEnabled, usePointerFx, useTilt } from '@/ui/interactions';
import { pointerStats } from '@/ui/interactions/pointer';
import { useSharedHover } from '@/ui/interactions/useSharedHover';

/** jsdom has no matchMedia: emulate a laptop (fine pointer, hover) with optional prefers-reduced-motion. */
function media({ reduce = false, fine = true } = {}) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('prefers-reduced-motion') ? reduce : q.includes('pointer: fine') || q.includes('hover: hover') ? fine : false,
    media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined,
    onchange: null, dispatchEvent: () => false,
  }));
}
const move = (x: number, y: number, target: Element | Window = window) => fireEvent(target, new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
const frames = (ms = 60) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

beforeEach(() => {
  media();
  useUi.setState({ motion: true, theme: 'dark', hovered: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('motion tokens', () => {
  it('uses one easing curve: ease-out, monotonic, anchored at 0 and 1', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.1)).toBeGreaterThan(0.1);
    expect(ease(0.5)).toBeGreaterThan(0.75);
    let prev = 0;
    for (let i = 1; i <= 20; i++) { const v = ease(i / 20); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    expect(cubicBezier(0, 0, 1, 1)(0.37)).toBeCloseTo(0.37, 3); // linear sanity check
  });
});

describe('shared pointer tracker', () => {
  it('throttles to one update per frame and delivers the latest position', async () => {
    const calls: [number, number][] = [];
    const off = subscribePointer((p) => calls.push([p.x, p.y]));
    for (let i = 1; i <= 25; i++) move(i, i * 2);
    expect(calls.length).toBe(0); // nothing synchronous
    await frames();
    expect(calls).toEqual([[25, 50]]);
    off();
  });
  it('ignores touch pointers', async () => {
    const calls: number[] = [];
    const off = subscribePointer((p) => calls.push(p.x));
    const ev = new MouseEvent('pointermove', { clientX: 99, clientY: 9 });
    Object.defineProperty(ev, 'pointerType', { value: 'touch' });
    fireEvent(window, ev);
    await frames();
    expect(calls).toEqual([]);
    off();
  });
  it('attaches global listeners only while someone is subscribed', () => {
    expect(pointerStats()).toEqual({ subscribers: 0, attached: false });
    const a = subscribePointer(() => undefined);
    const b = subscribePointer(() => undefined);
    expect(pointerStats()).toEqual({ subscribers: 2, attached: true });
    a();
    expect(pointerStats().attached).toBe(true);
    b();
    expect(pointerStats()).toEqual({ subscribers: 0, attached: false });
  });
});

describe('motion on/off', () => {
  function Probe() {
    return <p data-testid="p">{String(useMotionEnabled())}/{String(usePointerFx())}</p>;
  }
  it('is on with the toggle on and no OS preference', () => {
    render(<Probe />);
    expect(screen.getByTestId('p')).toHaveTextContent('true/true');
  });
  it('turns off with the in-app toggle', () => {
    useUi.setState({ motion: false });
    render(<Probe />);
    expect(screen.getByTestId('p')).toHaveTextContent('false/false');
  });
  it('turns off with prefers-reduced-motion', () => {
    media({ reduce: true });
    render(<Probe />);
    expect(screen.getByTestId('p')).toHaveTextContent('false/false');
  });
  it('keeps simple motion but disables pointer effects without a mouse', () => {
    media({ fine: false });
    render(<Probe />);
    expect(screen.getByTestId('p')).toHaveTextContent('true/false');
  });
});

describe('Cursor', () => {
  it('renders dot + ring, hides the native cursor, and cleans up on unmount', () => {
    const { container, unmount } = render(<Cursor />);
    expect(container.querySelectorAll('div[aria-hidden]').length).toBe(2);
    expect(document.documentElement.classList.contains('fx-cursor')).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains('fx-cursor')).toBe(false);
    expect(pointerStats().subscribers).toBe(0);
  });
  it('ring grows over clickable elements and shrinks on click', async () => {
    const { container } = render(<><Cursor /><button>go</button></>);
    const ring = container.querySelector<HTMLElement>('div[aria-hidden]')!;
    const scale = () => Number(/scale\(([\d.]+)\)/.exec(ring.style.transform)?.[1] ?? 1);
    move(100, 100, document.body);
    await frames(350);
    expect(scale()).toBeCloseTo(1, 1);
    move(120, 120, screen.getByRole('button'));
    await frames(450);
    expect(scale()).toBeGreaterThan(1.5);
    fireEvent(window, new MouseEvent('pointerdown'));
    await frames(450);
    expect(scale()).toBeLessThan(1);
  });
  it.each([['toggle off', () => useUi.setState({ motion: false })], ['reduced motion', () => media({ reduce: true })], ['no mouse', () => media({ fine: false })]])(
    'is absent with %s', (_n, setup) => {
      setup();
      const { container } = render(<Cursor />);
      expect(container).toBeEmptyDOMElement();
      expect(document.documentElement.classList.contains('fx-cursor')).toBe(false);
    },
  );
});

describe('Spotlight and Ambient', () => {
  it('spotlight is dark-theme only and motion only', () => {
    const { container, rerender } = render(<Spotlight />);
    expect(container.firstChild).not.toBeNull();
    useUi.setState({ theme: 'light' });
    rerender(<Spotlight />);
    expect(container).toBeEmptyDOMElement();
    useUi.setState({ theme: 'dark', motion: false });
    rerender(<Spotlight />);
    expect(container).toBeEmptyDOMElement();
  });
  it('ambient is a canvas with motion and a static gradient without', () => {
    const { container, rerender } = render(<Ambient />);
    expect(container.querySelector('canvas')).not.toBeNull();
    useUi.setState({ motion: false });
    rerender(<Ambient />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
  it('releases the pointer listener on unmount', () => {
    const { unmount } = render(<><Spotlight /><Ambient /></>);
    unmount();
    expect(pointerStats().subscribers).toBe(0);
  });
});

describe('tilt and magnetic', () => {
  function Tilt() {
    const ref = useRef<HTMLDivElement>(null);
    useTilt(ref, 8);
    return <div ref={ref} data-testid="card"><span data-sheen /></div>;
  }
  const rect = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) };
  it('tilts at most 8 degrees toward the pointer and resets on leave', async () => {
    render(<Tilt />);
    const card = screen.getByTestId('card');
    card.getBoundingClientRect = () => rect as DOMRect;
    fireEvent(card, new MouseEvent('pointermove', { clientX: 200, clientY: 0, bubbles: true }));
    await frames(40);
    const m = /rotateX\((-?[\d.]+)deg\) rotateY\((-?[\d.]+)deg\)/.exec(card.style.transform)!;
    expect(Number(m[1])).toBeCloseTo(8, 1);
    expect(Number(m[2])).toBeCloseTo(8, 1);
    expect(Math.abs(Number(m[1]))).toBeLessThanOrEqual(8);
    expect((card.querySelector('[data-sheen]') as HTMLElement).style.opacity).toBe('1');
    fireEvent(card, new MouseEvent('pointerleave'));
    expect(card.style.transform).toBe('');
  });
  it('does nothing when motion is off', async () => {
    useUi.setState({ motion: false });
    render(<Tilt />);
    const card = screen.getByTestId('card');
    card.getBoundingClientRect = () => rect as DOMRect;
    fireEvent(card, new MouseEvent('pointermove', { clientX: 150, clientY: 20, bubbles: true }));
    await frames(40);
    expect(card.style.transform).toBe('');
  });
  it('removes its listeners on unmount', () => {
    const { unmount } = render(<Tilt />);
    const card = screen.getByTestId('card');
    const spy = vi.spyOn(card, 'removeEventListener');
    unmount();
    expect(spy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(spy).toHaveBeenCalledWith('pointerleave', expect.any(Function));
  });
  it('magnetic button is pulled toward a near pointer, not a far one', async () => {
    function Mag() {
      const ref = useRef<HTMLButtonElement>(null);
      useMagnetic(ref, 0.5, 80);
      return <button ref={ref}>x</button>;
    }
    render(<Mag />);
    const b = screen.getByRole('button');
    b.getBoundingClientRect = () => ({ ...rect, left: 100, top: 100, right: 300, bottom: 200, width: 200, height: 100 }) as DOMRect;
    move(260, 150); // 60px right of centre (200,150): inside the radius
    await frames(300);
    expect(Number(/translate3d\((-?[\d.]+)px/.exec(b.style.transform)![1])).toBeGreaterThan(20);
    move(1200, 700); // far away
    await frames(400);
    expect(Math.abs(Number(/translate3d\((-?[\d.]+)px/.exec(b.style.transform)![1]))).toBeLessThan(1);
  });
});

describe('navigation hover indicator', () => {
  beforeEach(() => {
    // jsdom has no layout: give each link a position by its index
    const links = ['Overview', 'Compare', 'Seasonality', 'Economy', 'COVID recovery'];
    Object.defineProperty(HTMLElement.prototype, 'offsetLeft', { configurable: true, get() { return Math.max(0, links.indexOf((this as HTMLElement).textContent ?? '')) * 100; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 80; } });
  });
  it('slides to the hovered link and returns to the active page', () => {
    render(<MemoryRouter initialEntries={['/overview']}><Header /></MemoryRouter>);
    const ind = screen.getByTestId('nav-indicator');
    expect(ind.style.transform).toContain('translateX(0px)');
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Seasonality' }));
    expect(ind.style.transform).toContain('translateX(200px)');
    fireEvent.mouseLeave(screen.getByRole('navigation', { name: 'Main' }));
    expect(ind.style.transform).toContain('translateX(0px)');
  });
  it('the header motion toggle flips the preference and persists it', () => {
    render(<MemoryRouter><Header /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Motion effects on/ }));
    expect(useUi.getState().motion).toBe(false);
    expect(localStorage.getItem('itd.motion')).toBe('off');
    fireEvent.click(screen.getByRole('button', { name: /Motion effects off/ }));
    expect(useUi.getState().motion).toBe(true);
  });
});

describe('shared hover', () => {
  function Row({ code }: { code: string }) {
    const { highlighted, dimmed, bind } = useSharedHover(code);
    return <li {...bind} tabIndex={0} data-testid={code} data-hl={highlighted} data-dim={dimmed}>{code}</li>;
  }
  it('hovering one component highlights the state in every other and dims the rest', () => {
    render(<ul><Row code="KL" /><Row code="KL" /><Row code="GA" /></ul>);
    const [a, b] = screen.getAllByTestId('KL');
    fireEvent.mouseEnter(a);
    expect(a.dataset.hl).toBe('true');
    expect(b.dataset.hl).toBe('true'); // a different component showing the same state
    expect(screen.getByTestId('GA').dataset.dim).toBe('true');
    fireEvent.mouseLeave(a);
    expect(useUi.getState().hovered).toBeNull();
    expect(screen.getByTestId('GA').dataset.dim).toBe('false');
  });
  it('keyboard focus behaves like hover', () => {
    render(<ul><Row code="KL" /></ul>);
    fireEvent.focus(screen.getByTestId('KL'));
    expect(useUi.getState().hovered).toBe('KL');
    fireEvent.blur(screen.getByTestId('KL'));
    expect(useUi.getState().hovered).toBeNull();
  });
  it('maps a hovered state to the chart item to highlight', () => {
    expect(highlightPlan(['MH', 'TN', 'UP'], 'TN')).toEqual({ dataIndex: 1 });
    expect(highlightPlan(['MH', 'TN'], 'KL')).toEqual({ dataIndex: null });
    expect(highlightPlan(['MH'], null)).toEqual({ dataIndex: null });
  });
});
