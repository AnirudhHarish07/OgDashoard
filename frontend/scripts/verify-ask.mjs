// Browser checks for Ask the data, forecast, anomaly flags and export. node scripts/verify-ask.mjs [baseUrl]. Needs `npm run dev:mock`.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
const dlg = () => page.getByRole('dialog', { name: 'Ask the data' });
const state = () => dlg().getAttribute('data-state');

await page.goto(base + '/compare', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
check('drawer is closed and hidden from assistive tech at first', (await page.locator('aside[aria-label="Ask the data"]').getAttribute('aria-hidden')) === 'true');
await page.getByRole('button', { name: /Ask the data/ }).first().click();
await page.waitForTimeout(700);
check('header button opens the drawer in its empty state', (await state()) === 'empty');
check('the question box is focused', await page.evaluate(() => document.activeElement?.id === 'ask-q'));
check('example questions are offered', (await dlg().locator('button.chip').count()) >= 5);
await page.screenshot({ path: 'shots/10-ask-empty.png' });
await page.getByLabel('Your question').fill('ab');
check('typing state with validation hint', (await state()) === 'typing' && (await page.getByText('At least 3 characters').count()) === 1);
await page.getByLabel('Your question').fill('');
check('clearing the box returns to the empty state', (await state()) === 'empty');
await dlg().locator('button.chip', { hasText: 'top 5 states for foreign tourists' }).click();
await page.getByTestId('ask-result').waitFor({ timeout: 10000 });
check('an example runs and renders a bar chart result', (await page.getByTestId('ask-result').getAttribute('data-chart-type')) === 'bar');
check('result state', (await state()) === 'result');
await page.getByText('SQL used').click();
const sql = await page.getByTestId('ask-sql').textContent();
check('the SQL used is shown in a collapsible panel', /SELECT/i.test(sql ?? ''), (sql ?? '').slice(0, 40));
await page.getByRole('button', { name: 'Table' }).last().click();
check('result has a table fallback', (await dlg().locator('table').count()) === 1);
await page.screenshot({ path: 'shots/11-ask-result.png' });
await page.keyboard.press('Escape'); await page.waitForTimeout(700);
check('Escape closes the drawer', (await page.locator('aside[aria-label="Ask the data"]').getAttribute('aria-hidden')) === 'true');
check('focus returns to the button that opened it', await page.evaluate(() => /Ask the data/.test(document.activeElement?.textContent ?? '')));
await page.keyboard.press('Control+k'); await page.waitForTimeout(600);
check('Ctrl+K opens it again from any page', (await page.locator('aside[aria-label="Ask the data"]').getAttribute('aria-hidden')) === 'false');
await page.keyboard.press('Control+k'); await page.waitForTimeout(500);

// ---- State page: forecast, anomalies, export ----
await page.goto(base + '/state/GA', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
const opt = (label) => page.evaluate((l) => { const c = Object.values(window.__charts).find((i) => !i.isDisposed() && i.getDom().getAttribute('aria-label')?.startsWith(l)); return c?.getOption(); }, label);
const f = await opt('Line chart of total visits history');
check('forecast chart: history, band and a dashed forecast', f?.series?.map((s) => s.name).join('|') === 'History|Confidence band|Confidence band|Forecast (model projection)' && f.series[3].lineStyle.type === 'dashed');
check('forecast chart marks COVID years as excluded from training', f?.series?.[0]?.markArea?.data?.length === 1);
const tr = await opt('Line chart of domestic and foreign visits');
check('anomaly markers on the domestic line', (tr?.series?.[0]?.markPoint?.data?.length ?? 0) > 0, String(tr?.series?.[0]?.markPoint?.data?.length));
check('anomalies are also listed as text with a legend', (await page.getByText(/unusually strong year/).count()) >= 1);
const forecastCard = page.locator('section[aria-label="Forecast"]');
await forecastCard.getByRole('button', { name: /Export/ }).click();
check('forecast export offers PNG and a CSV entry', (await page.getByRole('menuitem', { name: 'PNG image' }).count()) === 1 && (await page.getByRole('menuitem', { name: /CSV/ }).count()) === 1);
await page.keyboard.press('Escape');
const src = page.locator('section[aria-label="Top foreign source countries"]');
await src.getByRole('button', { name: /Export/ }).click();
const csvItem = page.getByRole('menuitem', { name: /CSV/ });
const dl = page.waitForEvent('download', { timeout: 4000 }).catch(() => null);
await csvItem.click();
const download = await dl;
if (download) {
  const text = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  check('client CSV download includes is_synthetic and data_source columns', text.split('\n')[0].endsWith('is_synthetic,data_source'), text.split('\n')[0]);
} else check('client CSV download works', false, 'no download event');
await page.screenshot({ path: 'shots/12-state-forecast.png', fullPage: true });

console.log(JSON.stringify({ passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok), total: checks.length, errors: [...new Set(errors)] }, null, 1));
await browser.close();
