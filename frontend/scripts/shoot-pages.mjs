// Full-page screenshots of the data pages + console errors. node scripts/shoot-pages.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'shots';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 240)}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const pages = [['compare', '/compare'], ['state-ga', '/state/GA'], ['seasonality', '/seasonality'], ['economy', '/economy'], ['covid', '/covid']];
const report = {};
for (const [name, path] of pages) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  report[name] = await page.evaluate(() => ({
    charts: document.querySelectorAll('[role="img"][aria-label]').length,
    skeletons: document.querySelectorAll('.skeleton').length,
    alerts: [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent.slice(0, 80)),
    h1: document.querySelector('h1')?.textContent,
    height: document.documentElement.scrollHeight,
  }));
  await page.screenshot({ path: `${out}/p-${name}.png`, fullPage: true });
}
console.log(JSON.stringify({ report, errors: [...new Set(errors)] }, null, 1));
await browser.close();
