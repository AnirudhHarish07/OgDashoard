import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class RO extends IO {}
(globalThis as unknown as { IntersectionObserver: typeof IO }).IntersectionObserver = IO;
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
