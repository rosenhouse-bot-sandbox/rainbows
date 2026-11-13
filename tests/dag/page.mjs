// Opens the Graph layout page at a desktop and a phone size, chooses every graph with both
// methods, presses every step and every option, moves every slider to both ends, plays the steps,
// and steps through nodes with the keyboard. Fails on a console error, on a panel or page wider
// than the screen, or if the drawing is blank. At the desktop size it also loads the real ELK and
// the real TALA from their CDN and lays out one small graph with each.
//
//   node tests/dag/page.mjs         # needs Node 22 and Playwright, installed outside the repository
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
let chromium;
for (const from of [import.meta.url, '/opt/node-tools/', process.execPath]) { try { chromium = createRequire(from)('playwright').chromium; break; } catch { /* try the next place */ } }
if (!chromium) { console.error('Playwright is not installed. Install it outside the repository: npm install -g playwright && npx playwright install chromium'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.yaml': 'text/yaml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/dag/`;

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const browser = await chromium.launch();
for (const [name, width, height, motion] of [['desktop', 1280, 800, 'no-preference'], ['phone', 390, 844, 'no-preference'], ['phone, reduced motion', 390, 844, 'reduce']]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion, hasTouch: width < 600 });
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.goto(base);
  await page.waitForFunction(() => document.getElementById('graphFacts').textContent.includes('55 nodes'));
  const inked = () => page.evaluate(() => { const c = document.getElementById('view'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 40) n++; return n; });
  const fits = async (when) => { const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('panel').scrollWidth, document.getElementById('panel').clientWidth]); if (w[0] > width || w[1] > w[2]) fail(`${name}: wider than the screen ${when}`); };
  const graphs = await page.$$eval('#graph option', (os) => os.map((o) => o.value));
  for (const g of graphs) for (const m of ['layered', 'search']) {
    await page.selectOption('#graph', g);
    await page.click(`#method [data-v=${m}]`);
    for (const b of await page.$$('#stages button')) { await b.click(); await page.waitForTimeout(30); }
    for (const b of await page.$$('#controls .ctl:not([hidden]) .seg button')) { await b.click(); await page.waitForTimeout(20); }
    for (const id of await page.$$eval('#controls .ctl:not([hidden]) input', (is) => is.map((i) => i.id))) for (const end of ['min', 'max']) {
      await page.$eval('#' + id, (i, e) => { i.value = i[e]; i.dispatchEvent(new Event('input', { bubbles: true })); }, end);
      await page.waitForTimeout(40);
    }
    await fits(`with ${g}, ${m}`);
    if (await inked() < 20) fail(`${name}: nothing drawn with ${g}, ${m}`);
  }
  await page.click('#play');
  await page.waitForFunction(() => document.getElementById('play').textContent !== 'Pause', null, { timeout: 30000 }).catch(() => fail(`${name}: the steps never finished playing`));
  await page.focus('#view');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  if (!(await page.textContent('#pick')).includes(' out ')) fail(`${name}: the arrow keys picked no node`);
  await page.keyboard.press('Escape');
  if ((await page.textContent('#pick')) !== '') fail(`${name}: Escape did not let go of the node`);
  if (name === 'desktop') {
    // The real engines, on a small graph. They come from a CDN, so this part needs the network.
    await page.selectOption('#graph', 'services');
    for (const m of ['layered', 'search']) {
      await page.click(`#method [data-v=${m}]`);
      await page.click('#ctl-eng [data-v=real]');
      await page.waitForFunction(() => /^[0-9]/.test(document.querySelector('#meters .meter:nth-child(3) b').textContent) && document.querySelector('#ctl-eng [data-v=real]').getAttribute('aria-pressed') === 'true', null, { timeout: 120000 }).catch(() => fail(`${name}: the real engine for ${m} gave no layout`));
      await page.waitForTimeout(700);
      if (await inked() < 20) fail(`${name}: nothing drawn by the real engine for ${m}`);
      await fits(`with the real engine for ${m}`);
    }
  }
  await page.close();
}
await browser.close(); server.close();
console.log(fails ? `${fails} failures` : 'Graph layout page: all controls pressed, no failures');
process.exit(fails ? 1 : 0);
