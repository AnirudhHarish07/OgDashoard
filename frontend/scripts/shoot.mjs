// Visual smoke check: node scripts/shoot.mjs [baseUrl] [outDir]. Needs a running dev server (npm run dev:mock) and Chromium.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'shots';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
mkdirSync(out, { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const centre = async (code) => {
  const b = await page.evaluate((c) => { const el = document.querySelector(`.state-label[data-code="${c}"]`); const r = el?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; }, code);
  return b;
};

await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.mouse.move(900, 400);
await page.waitForTimeout(1600);
await shot('01-home');

await page.goto(base + '/overview', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__map?.loaded(), null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo(0, 250));
await page.waitForTimeout(1500);
await shot('02-overview-map');

const mh = await centre('MH');
if (mh) { await page.mouse.move(mh.x, mh.y, { steps: 6 }); await page.waitForTimeout(700); await shot('03-hover-maharashtra'); }

await page.getByRole('radio', { name: 'Top 10' }).click();
await page.waitForTimeout(1200);
await shot('04-top10');

const mh2 = await centre('MH');
if (mh2) {
  await page.mouse.move(mh2.x, mh2.y, { steps: 4 });
  await page.mouse.click(mh2.x, mh2.y);
  await page.waitForTimeout(4200);
  await shot('05-flyin-detail');
  await page.getByRole('button', { name: 'Back to India' }).click();
  await page.waitForTimeout(2600);
  await shot('06-back-home');
}
await page.getByRole('radio', { name: 'Choropleth' }).click();
await page.getByRole('button', { name: '3D' }).click();
await page.waitForTimeout(1800);
await shot('07-3d');
console.log(JSON.stringify({ errors, url: page.url() }, null, 1));
await browser.close();
