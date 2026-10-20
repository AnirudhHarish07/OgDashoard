// Browser check of the motion system. node scripts/verify-motion.mjs [baseUrl]. Needs `npm run dev:mock` and Chromium.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args });
const results = {};
const errors = [];

const dom = (page) => page.evaluate(() => ({
  cursorClass: document.documentElement.classList.contains('fx-cursor'),
  noMotion: document.documentElement.classList.contains('no-motion'),
  ambientCanvas: !!document.querySelector('canvas[aria-hidden]'),
  fixedBlobs: [...document.querySelectorAll('div[aria-hidden]')].filter((d) => getComputedStyle(d).position === 'fixed').length,
}));

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page };
}

// 1) default: effects on, nav indicator follows hover
{
  const { ctx, page } = await open();
  await page.goto(base + '/overview', { waitUntil: 'networkidle' });
  await page.mouse.move(700, 300, { steps: 5 });
  await page.waitForTimeout(400);
  results.default = await dom(page);
  const ind = () => page.getByTestId('nav-indicator').evaluate((e) => e.style.transform);
  const before = await ind();
  await page.getByRole('link', { name: 'Seasonality' }).hover();
  await page.waitForTimeout(350);
  const hovered = await ind();
  await page.mouse.move(700, 400);
  await page.waitForTimeout(350);
  results.navIndicator = { active: before, hovered, back: await ind(), slid: before !== hovered };
  await page.getByRole('link', { name: 'Seasonality' }).hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/09-nav-hover.png', clip: { x: 0, y: 0, width: 1000, height: 70 } });
  await ctx.close();
}

// 2) in-app motion toggle off: effects disappear, state click opens the panel without the 2s fly-in
{
  const { ctx, page } = await open();
  await page.goto(base + '/overview', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__map?.loaded(), null, { timeout: 60000 });
  await page.getByRole('button', { name: /Motion effects on/ }).click();
  await page.waitForTimeout(300);
  results.toggleOff = await dom(page);
  results.toggleOff.persisted = await page.evaluate(() => localStorage.getItem('itd.motion'));
  const mh = await page.evaluate(() => { const r = document.querySelector('.state-label[data-code="MH"]')?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.evaluate(() => window.scrollTo(0, 250));
  await page.waitForTimeout(500);
  const mh2 = await page.evaluate(() => { const r = document.querySelector('.state-label[data-code="MH"]')?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const t0 = Date.now();
  await page.mouse.click(mh2.x, mh2.y);
  await page.getByRole('button', { name: 'Back to India' }).waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('aside[aria-label="State details"]')).opacity === '1', null, { timeout: 5000 });
  results.toggleOff.panelOpenMs = Date.now() - t0;
  results.toggleOff.pitchAfter = await page.evaluate(() => window.__map.getPitch());
  await ctx.close();
  void mh;
}

// 3) OS prefers-reduced-motion: same, and the setting survives a reload
{
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.mouse.move(600, 300, { steps: 4 });
  await page.waitForTimeout(500);
  results.reducedMotion = await dom(page);
  await ctx.close();
}
{
  const { ctx, page } = await open();
  await page.addInitScript(() => localStorage.setItem('itd.motion', 'off'));
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  results.persistedAfterReload = await dom(page);
  await ctx.close();
}

// 4) frame cost of the effects on the Opening page (no WebGL there): rAF intervals while the pointer moves
for (const label of ['effectsOn', 'effectsOff']) {
  const { ctx, page } = await open();
  if (label === 'effectsOff') await page.addInitScript(() => localStorage.setItem('itd.motion', 'off'));
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.__dt = []; let last = performance.now(); const f = (n) => { window.__dt.push(n - last); last = n; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  for (let i = 0; i < 120; i++) { await page.mouse.move(200 + (i * 9) % 1000, 200 + Math.sin(i / 8) * 250 + 250); await page.waitForTimeout(12); }
  const dt = await page.evaluate(() => window.__dt.slice(5));
  dt.sort((a, b) => a - b);
  const pct = (p) => +dt[Math.min(dt.length - 1, Math.floor(dt.length * p))].toFixed(1);
  results['frames_' + label] = { frames: dt.length, median_ms: pct(0.5), p95_ms: pct(0.95), max_ms: +dt[dt.length - 1].toFixed(1) };
  await ctx.close();
}

// 5) listeners are released when leaving a page with effects (SPA navigation to a placeholder page and back)
{
  const { ctx, page } = await open();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Compare' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('link', { name: 'Home: India Tourism Dashboard' }).click();
  await page.waitForTimeout(600);
  results.afterNavigation = await dom(page);
  await ctx.close();
}

console.log(JSON.stringify({ results, errors }, null, 1));
await browser.close();
