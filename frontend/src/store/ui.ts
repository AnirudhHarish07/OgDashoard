import { create } from 'zustand';
import type { Theme } from '@/lib/colour';

const LS = { theme: 'itd.theme', motion: 'itd.motion' };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: setting just won't persist */
  }
}

function initialTheme(): Theme {
  const saved = read(LS.theme);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark';
}

interface UiState {
  theme: Theme;
  /** user preference; the effective value also depends on prefers-reduced-motion (see useMotionEnabled) */
  motion: boolean;
  /** state code hovered anywhere (map, bar, table row, scatter point) */
  hovered: string | null;
  /** state code the page is cross-filtered to */
  crossFilter: string | null;
  /** true when the first API request has been pending for more than ~3 s */
  waking: boolean;
  /** the "Ask the data" drawer */
  askOpen: boolean;
  setAskOpen: (open: boolean) => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setMotion: (m: boolean) => void;
  setHovered: (code: string | null) => void;
  setCrossFilter: (code: string | null) => void;
  setWaking: (w: boolean) => void;
}

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme(),
  motion: read(LS.motion) !== 'off',
  hovered: null,
  crossFilter: null,
  waking: false,
  askOpen: false,
  setAskOpen: (askOpen) => set({ askOpen }),
  setTheme: (theme) => {
    write(LS.theme, theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setMotion: (motion) => {
    write(LS.motion, motion ? 'on' : 'off');
    set({ motion });
  },
  setHovered: (hovered) => {
    if (get().hovered !== hovered) set({ hovered });
  },
  setCrossFilter: (crossFilter) => set({ crossFilter }),
  setWaking: (waking) => set({ waking }),
}));
