// WCAG A/AA audit with axe-core on every page in both themes. node scripts/a11y.mjs [baseUrl]. Needs `npm run dev:mock`.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const base = process.argv[2] ?? 'http://localhost:5173';
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const routes = ['/', '/overview', '/compare', '/state/GA', '/seasonality', '/economy', '/covid'];
const out = [];
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => localStorage.setItem('itd.theme', t), theme);
  const page = await ctx.newPage();
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: 'networkidle' });
    if (r === '/overview') await page.waitForFunction(() => window.__map?.loaded(), null, { timeout: 60000 });
    await page.waitForTimeout(1800);
    await page.addScriptTag({ path: axePath });
    const res = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, ex: v.nodes.slice(0, 3).map((n) => ({ t: n.target.join(' ').slice(0, 90), why: (n.any[0]?.message ?? n.all[0]?.message ?? n.none[0]?.message ?? '').slice(0, 140) })) }));
    });
    out.push({ theme, route: r, violations: res });
  }
  await ctx.close();
}
const total = out.reduce((n, o) => n + o.violations.length, 0);
for (const o of out) if (o.violations.length) console.log(`\n[${o.theme}] ${o.route}`, JSON.stringify(o.violations, null, 0).slice(0, 1800));
console.log(`\nAUDIT: ${out.length} page/theme combinations, ${total} violation groups`);
await browser.close();
