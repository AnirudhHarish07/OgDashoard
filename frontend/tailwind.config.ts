import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), raised: v('raised'), line: v('line'),
        ink: v('ink'), muted: v('muted'), faint: v('faint'),
        saffron: v('saffron'), teal: v('teal'), marigold: v('marigold'), indigo: v('indigo'),
        good: v('good'), bad: v('bad'),
      },
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      transitionTimingFunction: { dash: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      transitionDuration: { hover: '200ms', base: '500ms' },
      borderRadius: { card: '14px' },
    },
  },
  plugins: [],
} satisfies Config;
