// Screenshots every administrative view at comparable viewport sizes. Needs Playwright (npm i --no-save playwright).
// Usage: node scripts/ui-audit/capture.mjs <baseUrl> <outDir>   (admin: ada@foreignafrica.org / correct-horse-battery)
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const {chromium} = require('playwright');
const [base, out] = process.argv.slice(2);
mkdirSync(out, {recursive: true});
const sizes = {'1440': {width: 1440, height: 900}, '1366': {width: 1366, height: 768}, tablet: {width: 820, height: 1180}, mobile: {width: 390, height: 844}};
const views = {1440: 'all', 1366: ['login', 'dashboard', 'news', 'editor'], tablet: ['login', 'dashboard', 'news', 'editor', 'media'], mobile: ['login', 'dashboard', 'news', 'editor']};
const browser = await chromium.launch();
const errors = [];
for (const [name, viewport] of Object.entries(sizes)) {
  const ctx = await browser.newContext({viewport, deviceScaleFactor: 1});
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  await page.route(/res\.cloudinary\.com|youtube|ytimg|googleapis/, r => r.abort());
  const want = view => views[name] === 'all' || views[name].includes(view);
  const shot = async view => { if (want(view)) { await page.waitForTimeout(700); await page.screenshot({path: `${out}/${name}-${view}.png`}); } };
  await page.goto(`${base}/admin`);
  await page.waitForSelector('input[type=email]');
  await shot('login');
  await page.fill('input[type=email]', 'ada@foreignafrica.org');
  await page.fill('input[type=password]', 'correct-horse-battery');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.studio-main');
  const first = await page.evaluate(async () => (await (await fetch('/api/staff/content?type=news&pageSize=1')).json()).items[0].id);
  const routes = [['dashboard', '#/'], ['news', '#/content/news'], ['commentaries', '#/content/commentary'], ['pages', '#/content/page'], ['programmes', '#/content/programme'], ['editor', `#/content/news/${first}`], ['media', '#/media'], ['users', '#/users'], ['activity', '#/activity'], ['health', '#/health'], ['settings', '#/settings'], ['hero', '#/site/hero'], ['homepage', '#/site/homepage'], ['terms', '#/terms'], ['submissions', '#/submissions']];
  for (const [view, hash] of routes) {
    if (!want(view)) continue;
    await page.evaluate(h => { window.location.hash = h; }, hash);
    await page.waitForTimeout(600);
    await shot(view);
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
