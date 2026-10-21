import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** A real backend response saved by scripts/generate_samples.py (vitest runs with cwd = frontend/). */
export function sample<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), '../samples', `${name}.json`), 'utf8')) as T;
}
