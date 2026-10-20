/** One shared pointermove listener for the whole app, rAF-throttled. Touch pointers are ignored. */
export interface PointerState {
  x: number;
  y: number;
  /** -1..1 relative to the viewport centre */
  nx: number;
  ny: number;
  inside: boolean;
  down: boolean;
  target: Element | null;
}
type Listener = (p: PointerState) => void;

export const pointer: PointerState = { x: 0, y: 0, nx: 0, ny: 0, inside: false, down: false, target: null };
const listeners = new Set<Listener>();
let raf = 0;
let dirty = false;
let attached = false;

function flush() {
  raf = 0;
  if (!dirty) return;
  dirty = false;
  listeners.forEach((l) => l(pointer));
}
function schedule() {
  dirty = true;
  if (!raf) raf = requestAnimationFrame(flush);
}
function onMove(e: PointerEvent) {
  if (e.pointerType === 'touch') return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.nx = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.ny = (e.clientY / window.innerHeight) * 2 - 1;
  pointer.inside = true;
  pointer.target = e.target instanceof Element ? e.target : null;
  schedule();
}
function onDown(e: PointerEvent) {
  if (e.pointerType === 'touch') return;
  pointer.down = true;
  schedule();
}
function onUp() {
  pointer.down = false;
  schedule();
}
function onLeave() {
  pointer.inside = false;
  schedule();
}

function attach() {
  if (attached) return;
  attached = true;
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
}
function detach() {
  if (!attached) return;
  attached = false;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerdown', onDown);
  window.removeEventListener('pointerup', onUp);
  document.documentElement.removeEventListener('pointerleave', onLeave);
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

/** Subscribe to throttled pointer updates; returns an unsubscribe that also removes the global listeners when unused. */
export function subscribePointer(fn: Listener): () => void {
  listeners.add(fn);
  attach();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) detach();
  };
}
