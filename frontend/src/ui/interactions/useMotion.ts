import { useEffect, useState } from 'react';
import { useUi } from '@/store/ui';

function useMedia(query: string, initial = false): boolean {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : initial));
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Motion effects are on only if the in-app toggle is on AND the OS does not ask for reduced motion. */
export function useMotionEnabled(): boolean {
  const pref = useUi((s) => s.motion);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  return pref && !reduced;
}

/** Pointer-driven effects (cursor, tilt, spotlight, parallax) also need a real mouse. */
export function usePointerFx(): boolean {
  const motion = useMotionEnabled();
  const fine = useMedia('(hover: hover) and (pointer: fine)', true);
  return motion && fine;
}

/** Keeps <html> classes in sync (theme, no-motion). Mount once. */
export function useHtmlClasses(): void {
  const theme = useUi((s) => s.theme);
  const motion = useMotionEnabled();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.classList.toggle('no-motion', !motion);
  }, [motion]);
}
