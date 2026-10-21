// End-to-end check against the real backend (serves frontend/dist). node scripts/e2e-live.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:8000';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 200)); });
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) problems.push(`${r.status()} ${r.url().replace(base, '')}`); });
const routes = ['/', '/overview', '/compare', '/state/GA', '/state/MH', '/seasonality', '/economy', '/covid', '/overview?yf=2019&yt=2023&r=South'];
for (const r of routes) {
  await page.goto(base + r, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const text = (await page.textContent('body')) ?? '';
  const bad = /Something went wrong|Couldn.t load|isn.t available/i.test(text);
  console.log(r.padEnd(40), bad ? 'ERROR STATE SHOWN' : 'ok', 'overflowX', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  if (bad) problems.push('error state on ' + r);
}
console.log(problems.length ? 'PROBLEMS:\n' + [...new Set(problems)].join('\n') : 'NO PROBLEMS');
await browser.close();
process.exit(problems.length ? 1 : 0);
