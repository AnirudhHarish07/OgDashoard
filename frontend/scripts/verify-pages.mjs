// Behaviour checks for the data pages in a real browser. node scripts/verify-pages.mjs [baseUrl]. Needs `npm run dev:mock` + Chromium.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); };
const go = async (path) => { await page.goto(base + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200); };
const opt = (label) => page.evaluate((l) => { const c = Object.values(window.__charts).find((i) => !i.isDisposed() && i.getDom().getAttribute('aria-label') === l); return c?.getOption(); }, label);
const box = async (label) => (await page.locator(`[aria-label="${label}"]`).first().boundingBox());
const hovered = () => page.evaluate(() => window.__ui.getState().hovered);

// ---- Compare ----
await go('/compare');
const rankLabel = (await page.locator('[role="img"][aria-label^="Bar chart of"]').first().getAttribute('aria-label'));
const rb = await box(rankLabel);
await page.mouse.move(rb.x + 260, rb.y + 22, { steps: 4 }); await page.waitForTimeout(300);
const h1 = await hovered();
check('ranking bar hover sets the shared hovered state', !!h1, h1);
await page.mouse.move(5, 5); await page.waitForTimeout(300);
check('hover clears when leaving the chart', (await hovered()) === null);
await page.mouse.move(rb.x + 260, rb.y + 22, { steps: 3 }); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(300);
check('clicking a bar toggles the state into the filter selection', (await page.evaluate(() => window.__filters.getState().states)).length === 1);
await page.evaluate(() => window.__filters.getState().reset());
// race
const yearOut = page.locator('output[for="race-year"]');
const y0 = await yearOut.textContent();
await page.getByRole('button', { name: 'Play' }).click();
await page.waitForTimeout(2600);
const y1 = await yearOut.textContent();
check('bar chart race advances while playing', Number(y1) > Number(y0), `${y0} -> ${y1}`);
await page.getByRole('button', { name: 'Pause' }).click();
const y2 = await yearOut.textContent(); await page.waitForTimeout(1500);
check('pause stops the race', (await yearOut.textContent()) === y2);
await page.locator('#race-year').fill('3'); await page.waitForTimeout(400);
check('year scrubber jumps to a frame', (await yearOut.textContent()) !== y2, await yearOut.textContent());
const raceOpt = await opt('Animated bar chart race of Total visits. Use the play button or the year slider.');
check('race axis uses the API max_value (fixed axis)', raceOpt?.xAxis?.[0]?.max > 7e8, String(raceOpt?.xAxis?.[0]?.max));
// compare card
check('compare table marks leaders with a star (not colour only)', (await page.locator('table td span:has-text("★")').count()) > 5);
await page.getByRole('button', { name: 'Table' }).first().click();
check('table fallback replaces the chart', (await page.locator('table caption.sr-only').first().textContent()).length > 0);
await page.getByRole('button', { name: 'Chart' }).first().click();
// custom selection through the URL
await go('/compare?s=KL,GA');
check('custom 2-state selection is recognised from the URL', (await page.getByText('Your selection.').count()) === 1);
await go('/compare?s=KL');
check('a single state shows a clear hint', (await page.getByText('Select one more state').count()) === 1);

// ---- State page ----
await go('/state/GA');
check('state page renders without animation, with all sections', (await page.locator('[role="img"][aria-label]').count()) >= 7);
check('state KPIs show change direction as text', (await page.locator('[data-testid^="state-kpi-"] .sr-only').count()) > 5);
check('Back to India link goes to the overview', (await page.getByRole('link', { name: 'Back to India' }).getAttribute('href')).startsWith('/overview'));

// ---- Seasonality ----
await go('/seasonality');
const hm = await box('Heatmap of monthly visits by state for 2023');
await page.mouse.move(hm.x + 400, hm.y + 200, { steps: 5 }); await page.waitForTimeout(400);
const hmOpt = await opt('Heatmap of monthly visits by state for 2023');
const bands = hmOpt?.series?.find((s) => s.id === 'heat')?.markArea?.data?.length;
check('heatmap hover highlights its row and column', bands === 2, `bands=${bands}`);
check('heatmap hover also sets the shared hovered state', !!(await hovered()), await hovered());
await page.mouse.move(5, 5); await page.waitForTimeout(300);
check('heatmap highlight clears on leave', ((await opt('Heatmap of monthly visits by state for 2023'))?.series?.find((s) => s.id === 'heat')?.markArea?.data?.length ?? 0) === 0);
await page.getByRole('radio', { name: 'A to Z' }).click(); await page.waitForTimeout(300);
const first = (await opt('Heatmap of monthly visits by state for 2023')).yAxis[0].data[0];
check('heatmap sort A to Z', first === 'Andaman and Nicobar Islands', first);
// the mock festivals sample holds October events only (it was generated with ?month=10), so filter against that
await page.getByRole('button', { name: /^Oct \d+/ }).click(); await page.waitForTimeout(300);
const festOct = await page.locator('ul[aria-label="Festivals"] li').count();
await page.getByRole('button', { name: /^Jan \d+/ }).click(); await page.waitForTimeout(300);
const festJan = await page.locator('ul[aria-label="Festivals"] li').count();
check('festival month buttons filter the list and show an empty state', festOct > 0 && festJan === 0 && (await page.getByText('No festivals listed for this selection.').count()) === 1, `Oct ${festOct}, Jan ${festJan}`);
check('festival bars share the x axis with the curves', (await opt('Line chart of monthly visits by tourism type with festival counts, 2023')).series.some((s) => s.type === 'bar'));

// ---- Economy ----
await go('/economy');
const eLabel = 'Bar chart of Share of state GSDP for';
const eAria = await page.locator(`[role="img"][aria-label^="${eLabel}"]`).first().getAttribute('aria-label');
const before = (await opt(eAria)).series[0].data[0].value;
await page.getByRole('radio', { name: 'Per tourist' }).click(); await page.waitForTimeout(300);
const eAria2 = await page.locator('[role="img"][aria-label^="Bar chart of Revenue per tourist"]').first().getAttribute('aria-label');
const after = (await opt(eAria2)).series[0].data[0].value;
check('economy metric toggle changes the chart data', before !== after, `${before} -> ${after}`);
const dc = await opt('Scatter chart of visits against hotel rooms with capacity thresholds');
check('demand chart has three threshold lines and shape-coded points', dc.series.length === 4 && dc.series[0].data.some((d) => d.symbol === 'diamond'));
check('under-served table lists flagged states', (await page.locator('table caption:text("Under-served states")').count()) === 1);
const occ = await opt('Line chart of hotel occupancy by year, one line per state and a national line');
check('occupancy chart: one line per state plus national, COVID band from the API', occ.series.length > 30 && !!occ.series.at(-1).markArea);

// ---- COVID ----
await go('/covid');
const cAria = await page.locator('[role="img"][aria-label^="Bar chart of recovery vs"]').first().getAttribute('aria-label');
const c1 = await opt(cAria);
check('covid chart ranks fastest first and highlights the top 5', c1.series[0].data[0].itemStyle.color !== c1.series[0].data[10].itemStyle.color);
await page.getByRole('radio', { name: 'Domestic vs foreign' }).click(); await page.waitForTimeout(300);
check('covid split view shows domestic and foreign series', (await opt(cAria)).series.length === 2);

console.log(JSON.stringify({ passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok), total: checks.length, errors: [...new Set(errors)] }, null, 1));
await browser.close();
