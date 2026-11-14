// Opens the Japanese maple page at a desktop and a phone size (and the phone again with reduced
// motion, and held sideways), then:
//  - presses every scale button, both "Zoom into" buttons and Play, and works both sliders with the keyboard;
//  - sweeps the Zoom slider end to end at five dates and the Season slider end to end at every scale,
//    one small step at a time, and compares each picture with the one before. A step that changes
//    the picture far more than its neighbours do is reported as a jump;
//  - checks that the zoom and the date never move in the same frame;
//  - checks that neither slider nor the Play button moves or changes size at any point of either sweep.
// Fails on a console error, a jump, a control that moved, a blank picture, or a panel wider than the screen.
//
//   node tests/maple/page.mjs            # needs Node 22 and Playwright, installed outside the repository
//   node tests/maple/page.mjs --shots    # also writes pictures of each scale to tests/maple/out/
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { stamp } from './stamp.mjs';

{ const r = stamp(true); if (r.stale.length) { console.error(`The version stamp is out of date in: ${r.stale.join(', ')}. Run: node tests/maple/stamp.mjs`); process.exit(1); } }

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
// The picture is WebGL. Without a graphics card Chromium draws it in software, which these switches allow.
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// In the page: a small copy of the picture, as numbers.
const SNAP = () => { const c = document.getElementById('view'), s = window.__snap || (window.__snap = document.createElement('canvas')); s.width = 64; s.height = 40; const x = s.getContext('2d', { willReadFrequently: true }); window.__maple.redraw(); x.drawImage(c, 0, 0, 64, 40); return Array.from(x.getImageData(0, 0, 64, 40).data); };
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; };
const spread = (a) => { let lo = 255, hi = 0; for (let i = 0; i < a.length; i += 4) { const v = a[i] + a[i + 1] + a[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };

for (const [name, width, height, motion] of [['desktop', 1280, 800, 'no-preference'], ['phone', 390, 844, 'no-preference'], ['phone, reduced motion', 390, 844, 'reduce'], ['phone held sideways', 844, 390, 'no-preference']]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion, hasTouch: width < 600 });
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.goto(base);
  await page.waitForFunction(() => window.__maple && document.getElementById('capTitle').textContent, null, { timeout: 60000 });
  await page.evaluate(() => window.__maple.res(0.25));         // a quarter of the pixels each way: drawn in software, the full picture takes seconds a frame
  const state = () => page.evaluate(() => ({ ...window.__maple.st, busy: window.__maple.busy }));
  // Drawn in software a frame takes a second or two and a flight minutes, so most flights are ended at once; one real flight is watched below.
  const idle = async () => { await page.evaluate(() => window.__maple.settle()); await page.waitForFunction(() => !window.__maple.busy, null, { timeout: 240000 }); };
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const put = async (id, v) => { await page.$eval('#' + id, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await frame(); };
  const boxes = () => page.evaluate(() => ['zoom', 'season', 'play'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(','); }).join(' | '));
  const fits = async (when) => { const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('panel').scrollWidth, document.getElementById('panel').clientWidth]); if (w[0] > width || w[1] > w[2]) fail(`${name}: wider than the screen ${when}`); };

  // starting: the year plays by itself unless the visitor asked for reduced motion
  if (motion === 'reduce') await page.waitForTimeout(1800); else await page.waitForFunction(() => window.__maple.st.play, null, { timeout: 20000 }).catch(() => {});
  let s = await state();
  if (motion === 'reduce' ? s.play : !s.play) fail(`${name}: the year ${motion === 'reduce' ? 'played by itself with reduced motion' : 'did not start playing'}`);
  await page.click('#play'); await frame();
  if (motion !== 'reduce') { if ((await state()).play) fail(`${name}: Play did not pause`); if (await page.getAttribute('#play', 'aria-label') !== 'Play the year') fail(`${name}: the Play button's name did not change back`); }
  else { if (!(await state()).play) fail(`${name}: Play did not start the year when pressed`); await page.click('#play'); }

  // every scale button; with reduced motion the change is immediate
  const stops = await page.$$('#stops button');
  if (stops.length !== 5) fail(`${name}: expected five scales, found ${stops.length}`);
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
    if (shownWhere !== (i >= 3)) fail(`${name}: "Zoom into" is ${shownWhere ? 'shown' : 'hidden'} at scale ${i}`);
  }
  // at Molecules: light arrives by itself (not with reduced motion) and has its own switch; the chain slider works
  await stops[4].click(); await idle(); await frame();
  if (await page.$eval('#lightCtl', (e) => e.hidden) || await page.$eval('#figChain', (e) => e.hidden)) fail(`${name}: the light switch or the chain slider is hidden at Molecules`);
  { const on = await page.$eval('#light', (e) => e.checked);
    if (on !== (motion !== 'reduce')) fail(`${name}: "Light arriving" starts ${on ? 'on' : 'off'}`);
    const a = await page.evaluate(SNAP); await page.waitForTimeout(motion === 'reduce' ? 700 : 6000); const moved = diff(a, await page.evaluate(SNAP));
    if (motion !== 'reduce' && moved === 0) fail(`${name}: no light is moving at Molecules`);
    if (motion === 'reduce' && moved !== 0) fail(`${name}: the picture moves by itself with reduced motion`);
    if (on) await page.click('#light');
    const b = await page.evaluate(SNAP); await page.waitForTimeout(500);
    if (diff(b, await page.evaluate(SNAP)) !== 0) fail(`${name}: the picture still moves with "Light arriving" switched off`);
    const caps = new Set();
    for (const n of [3, 5, 7, 9, 11]) { await put('chain', n); caps.add(await page.textContent('#chainCap')); if (!(await page.textContent('#chainV')).startsWith(n + ' ')) fail(`${name}: the chain slider does not show ${n}`); }
    if (caps.size !== 5) fail(`${name}: the chain slider's text did not change at every step`);
    await fits('with the chain slider shown'); }
  // the two places to look inside the cell
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
  await page.focus('#play'); await page.keyboard.press('Space'); await page.waitForTimeout(2500);
  if (!((await state()).s > 0.521)) fail(`${name}: Space on Play did not move the year on`);
  await page.keyboard.press('Space');
  if (!(await page.getAttribute('#zoom', 'aria-valuetext')) || !/\d+ \w+/.test(await page.getAttribute('#season', 'aria-valuetext'))) fail(`${name}: a slider has no spoken value`);

  // the zoom and the date never move in the same frame: press Play, then fly between scales, move the Zoom slider and change where the cell is looked into
  if (name === 'desktop') {
    await put('season', 300); await put('zoom', 1);
    await page.evaluate(() => { const m = window.__maple, d = m.drawn; let z = d.z, s = d.s; window.__both = 0; window.__watch = true; const tick = () => { if (d.z !== z && d.s !== s) window.__both++; z = d.z; s = d.s; if (window.__watch) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await page.click('#play'); await page.waitForTimeout(700);
    await stops[3].click(); await page.waitForTimeout(150);
    const s0 = (await state()).s;
    await page.waitForTimeout(1200);
    s = await state();
    if (s.s !== s0) fail(`${name}: the year moved on during a flight between scales`);
    await page.waitForFunction(() => window.__maple.st.z === 3, null, { timeout: 600000 }); await page.waitForTimeout(4000);
    if (!((await state()).s > s0)) fail(`${name}: the year did not go on after the flight ended`);
    await page.focus('#zoom'); for (let i = 0; i < 8; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(40); }
    await page.click('[data-where=vacuole]'); await page.waitForTimeout(300); await page.click('[data-where=membrane]');
    await stops[1].click(); await page.waitForTimeout(500); await put('season', 400); await page.waitForTimeout(100); await put('season', 410);
    await page.waitForFunction(() => window.__maple.st.z === 1, null, { timeout: 600000 });
    const both = await page.evaluate(() => { window.__watch = false; return window.__both; });
    if (both) fail(`${name}: the zoom and the date moved together in ${both} frames`);
    if ((await state()).play) fail(`${name}: moving the Season slider did not pause the year`);
    if (!(await page.$eval('#oops', (e) => e.hidden))) fail(`${name}: the "could not be drawn" notice is showing`);
  }

  // sweeps: no jumps in the picture, and no control moves
  const home = await boxes();
  // The whole sweep runs inside the page, one step per frame; it returns each step's change and whether a control moved.
  const sweep = async (id, from, to, step, what) => {
    const r = await page.evaluate(async ([id, from, to, step, home]) => {
      const el = document.getElementById(id), c = document.getElementById('view'), s = document.createElement('canvas'); s.width = 64; s.height = 40;
      const x = s.getContext('2d', { willReadFrequently: true }), d = []; let prev = null, moved = null, n = 0;
      const boxes = () => ['zoom', 'season', 'play'].map((i) => { const r = document.getElementById(i).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(','); }).join(' | ');
      for (let v = from; step > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += step) {
        el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
        if (n++ % 10 === 0) await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));   // the panel is brought up to date in a frame; the picture is drawn here directly
        window.__maple.redraw(); x.drawImage(c, 0, 0, 64, 40); const pic = x.getImageData(0, 0, 64, 40).data;
        if (prev) { let t = 0; for (let i = 0; i < pic.length; i += 4) t += Math.abs(pic[i] - prev[i]) + Math.abs(pic[i + 1] - prev[i + 1]) + Math.abs(pic[i + 2] - prev[i + 2]); d.push([t / (pic.length / 4) / 3, v]); }
        prev = pic;
        if (n % 10 === 1 && moved === null && boxes() !== home) moved = v;
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
  if (name === 'desktop' || motion === 'reduce') {                                   // the phone without reduced motion draws the same pictures as with it
    const full = name === 'desktop';                                                  // drawn in software each step is slow, so the phone does a shorter round
    for (const season of full ? [300, 700] : [520]) { await put('season', season); await sweep('zoom', 0, 4, 0.02, `a zoom in at season ${season / 1000}`); }
    for (const z of full ? [0, 1, 2, 3, 4] : [0, 2]) { await put('zoom', z); await sweep('season', 0, 960, 10, `the year at scale ${z}`); await sweep('season', 960, 1000, 1, `the leaf's fall at scale ${z}`); }
    { }
    await page.click('[data-where=vacuole]'); await idle();
    await put('zoom', 4); if (full) await sweep('season', 0, 1000, 10, 'the year in the vacuole'); await sweep('zoom', 4, 3, -0.02, 'a zoom out from the vacuole');
  }
  if (name === 'desktop') {                                                           // the graphics card can drop the picture at any time; the page must draw it again
    await put('zoom', 1);
    await page.evaluate(async () => { const gl = document.getElementById('view').getContext('webgl2'), x = gl.getExtension('WEBGL_lose_context'); x.loseContext(); setTimeout(() => x.restoreContext(), 300); });
    await page.waitForTimeout(1200); await page.waitForFunction(() => window.__maple && document.getElementById('capTitle').textContent, null, { timeout: 60000 }); await frame();
    if (spread(await page.evaluate(SNAP)) < 30) fail(`${name}: nothing drawn after the graphics context was lost and restored`);
  }
  await fits('at the end');
  await page.close();
}
await browser.close(); server.close();
console.log(fails ? `${fails} failed` : 'page: all checks passed');
process.exit(fails ? 1 : 0);
