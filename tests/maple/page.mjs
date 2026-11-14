// Opens the Japanese maple page at a desktop and a phone size (and the phone again with reduced
// motion), then:
//  - presses every scale button, both "Zoom into" buttons and Play, and works both sliders with the keyboard;
//  - sweeps the Zoom slider end to end at five dates and the Season slider end to end at every scale,
//    one small step at a time, and compares each picture with the one before. A step that changes
//    the picture far more than its neighbours do is reported as a jump;
//  - checks that neither slider nor the Play button moves or changes size at any point of either sweep.
// Fails on a console error, a jump, a control that moved, a blank picture, or a panel wider than the screen.
//
//   node tests/maple/page.mjs            # needs Node 22 and Playwright, installed outside the repository
//   node tests/maple/page.mjs --shots    # also writes pictures of each scale to tests/maple/out/
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
let chromium;
for (const from of [import.meta.url, '/opt/node-tools/', process.execPath]) { try { chromium = createRequire(from)('playwright').chromium; break; } catch { /* try the next place */ } }
if (!chromium) { console.error('Playwright is not installed. Install it outside the repository: npm install -g playwright && npx playwright install chromium'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/maple/`;
const shots = process.argv.includes('--shots'), out = path.join(import.meta.dirname, 'out');
if (shots) fs.mkdirSync(out, { recursive: true });

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const browser = await chromium.launch();

// In the page: a small copy of the picture, as numbers.
const SNAP = () => { const c = document.getElementById('view'), s = window.__snap || (window.__snap = document.createElement('canvas')); s.width = 64; s.height = 40; const x = s.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0, 64, 40); return Array.from(x.getImageData(0, 0, 64, 40).data); };
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; };
const spread = (a) => { let lo = 255, hi = 0; for (let i = 0; i < a.length; i += 4) { const v = a[i] + a[i + 1] + a[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };

for (const [name, width, height, motion] of [['desktop', 1280, 800, 'no-preference'], ['phone', 390, 844, 'no-preference'], ['phone, reduced motion', 390, 844, 'reduce']]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion, hasTouch: width < 600 });
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.goto(base);
  await page.waitForFunction(() => window.__maple && document.getElementById('capTitle').textContent);
  const state = () => page.evaluate(() => ({ ...window.__maple.st, busy: window.__maple.busy }));
  const idle = () => page.waitForFunction(() => !window.__maple.busy, null, { timeout: 30000 });
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const put = async (id, v) => { await page.$eval('#' + id, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await frame(); };
  const boxes = () => page.evaluate(() => ['zoom', 'season', 'play'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(','); }).join(' | '));
  const fits = async (when) => { const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('panel').scrollWidth, document.getElementById('panel').clientWidth]); if (w[0] > width || w[1] > w[2]) fail(`${name}: wider than the screen ${when}`); };

  // starting: the year plays by itself unless the visitor asked for reduced motion
  await page.waitForTimeout(1800);
  let s = await state();
  if (motion === 'reduce' ? s.play : !s.play) fail(`${name}: the year ${motion === 'reduce' ? 'played by itself with reduced motion' : 'did not start playing'}`);
  await page.click('#play'); await frame();
  if (motion !== 'reduce') { if ((await state()).play) fail(`${name}: Play did not pause`); if (await page.getAttribute('#play', 'aria-label') !== 'Play the year') fail(`${name}: the Play button's name did not change back`); }
  else { if (!(await state()).play) fail(`${name}: Play did not start the year when pressed`); await page.click('#play'); }

  // every scale button; with reduced motion the change is immediate
  const stops = await page.$$('#stops button');
  if (stops.length !== 4) fail(`${name}: expected four scales, found ${stops.length}`);
  await put('season', 520);
  for (let i = stops.length - 1; i >= 0; i--) {
    await stops[i].click();
    if (motion === 'reduce') { await frame(); if (Math.abs((await state()).z - i) > 1e-6) fail(`${name}: with reduced motion the zoom did not go straight to scale ${i}`); }
    await idle(); await frame();
    s = await state();
    if (Math.abs(s.z - i) > 1e-6) fail(`${name}: scale button ${i} left the zoom at ${s.z}`);
    if (spread(await page.evaluate(SNAP)) < 30) fail(`${name}: nothing drawn at scale ${i}`);
    await fits(`at scale ${i}`);
    if (shots) await page.screenshot({ path: path.join(out, `${name.replace(/\W+/g, '-')}-${i}.png`) });
    const shownWhere = await page.$eval('#whereCtl', (e) => !e.hidden);
    if (shownWhere !== (i >= 2)) fail(`${name}: "Zoom into" is ${shownWhere ? 'shown' : 'hidden'} at scale ${i}`);
  }
  // the two places to look inside the cell
  await stops[3].click(); await idle(); await frame();
  const before = await page.evaluate(SNAP);
  await page.click('[data-where=vacuole]'); await idle(); await frame();
  if ((await state()).where !== 'vacuole' || diff(before, await page.evaluate(SNAP)) < 2) fail(`${name}: "The vacuole" did not change the picture`);
  if ((await page.textContent('#capBody')).includes('chloroplast membrane')) fail(`${name}: the caption still describes the membrane`);
  await page.click('[data-where=membrane]'); await idle(); await frame();
  if (diff(before, await page.evaluate(SNAP)) > 1) fail(`${name}: going to the vacuole and back did not return to the same picture`);

  // keyboard: both sliders and Play
  await put('zoom', 1); await page.focus('#zoom'); await page.keyboard.press('ArrowRight'); await frame();
  if (!((await state()).z > 1)) fail(`${name}: the arrow key did not move the Zoom slider`);
  await page.focus('#season'); await page.keyboard.press('ArrowRight'); await frame();
  if (Math.abs((await state()).s - 0.521) > 1e-6) fail(`${name}: the arrow key did not move the Season slider`);
  await page.focus('#play'); await page.keyboard.press('Space'); await page.waitForTimeout(300);
  if (!((await state()).s > 0.521)) fail(`${name}: Space on Play did not move the year on`);
  await page.keyboard.press('Space');
  if (!(await page.getAttribute('#zoom', 'aria-valuetext')) || !/\d+ \w+/.test(await page.getAttribute('#season', 'aria-valuetext'))) fail(`${name}: a slider has no spoken value`);

  // sweeps: no jumps in the picture, and no control moves
  const home = await boxes();
  // The whole sweep runs inside the page, one step per frame; it returns each step's change and whether a control moved.
  const sweep = async (id, from, to, step, what) => {
    const r = await page.evaluate(async ([id, from, to, step, home]) => {
      const el = document.getElementById(id), c = document.getElementById('view'), s = document.createElement('canvas'); s.width = 64; s.height = 40;
      const x = s.getContext('2d', { willReadFrequently: true }), d = []; let prev = null, moved = null;
      const boxes = () => ['zoom', 'season', 'play'].map((i) => { const r = document.getElementById(i).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(','); }).join(' | ');
      for (let v = from; step > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += step) {
        el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        x.drawImage(c, 0, 0, 64, 40); const pic = x.getImageData(0, 0, 64, 40).data;
        if (prev) { let t = 0; for (let i = 0; i < pic.length; i += 4) t += Math.abs(pic[i] - prev[i]) + Math.abs(pic[i + 1] - prev[i + 1]) + Math.abs(pic[i + 2] - prev[i + 2]); d.push([t / (pic.length / 4) / 3, v]); }
        prev = pic;
        if (moved === null && boxes() !== home) moved = v;
      }
      return { d, moved };
    }, [id, from, to, step, home]);
    if (r.moved !== null) fail(`${name}: a slider or Play moved during ${what}, at ${id} = ${r.moved}`);
    const d = r.d;
    if (d.length < 20) fail(`${name}: ${what} took only ${d.length} steps`);
    for (let i = 0; i < d.length; i++) {
      const near = d.slice(Math.max(0, i - 6), i + 7).map((x) => x[0]).sort((a, b) => a - b), med = near[Math.floor(near.length / 2)];
      if (d[i][0] > 9 && d[i][0] > 5 * med + 4) fail(`${name}: the picture jumps during ${what}, at ${id} = ${d[i][1].toFixed(3)} (changed ${d[i][0].toFixed(1)}, neighbours ${med.toFixed(1)})`);
    }
    console.log(`  ${name}: ${what}: ${d.length} steps, largest change ${Math.max(...d.map((x) => x[0])).toFixed(1)}`);
  };
  if (name !== 'phone') {                                   // the phone without reduced motion draws the same pictures as with it
    for (const season of [40, 300, 520, 700, 990]) { await put('season', season); await sweep('zoom', 0, 3, 0.0075, `a zoom in at season ${season / 1000}`); }
    await put('season', 700); await sweep('zoom', 3, 0, -0.0075, 'a zoom out');
    for (const z of [0, 1, 2, 3]) { await put('zoom', z); await sweep('season', 0, 1000, 4, `the year at scale ${z}`); }
    await page.click('[data-where=vacuole]'); await idle();
    await put('zoom', 3); await sweep('season', 0, 1000, 4, 'the year in the vacuole'); await sweep('zoom', 3, 2, -0.0075, 'a zoom out from the vacuole');
  }
  await fits('at the end');
  await page.close();
}
await browser.close(); server.close();
console.log(fails ? `${fails} failed` : 'page: all checks passed');
process.exit(fails ? 1 : 0);
