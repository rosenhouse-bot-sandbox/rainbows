// Moves every slider of every Optics workshop challenge through every one of its values, at a
// desktop size and two phone sizes, and fails if anything in the panel or the bench changes place or
// size on the way: a number that gains a digit and wraps, a row of the readout that comes and goes,
// a card that grows. Where a challenge has a choice (a glass), the sweep is repeated for each option.
//
//   node tests/optics/layout.mjs         # needs Node 22 and Playwright, installed outside the repository
//
// What is allowed to change: the text of a number, the fill of a bar, the marker on a scale, and
// the Submit button coming and going (it is fixed to the screen and pushes nothing).

import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname, root = path.resolve(here, '../..');
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
const base = `http://localhost:${server.address().port}`;

// Runs in the page: sweep one slider and report the first place each thing moved.
function sweep(sliderId) {
  const o = window.__optics, panel = document.getElementById('panel');
  const things = () => {
    const out = {}, add = (name, e) => { const r = e.getBoundingClientRect(); out[name] = [r.left, r.top + panel.scrollTop * panel.contains(e), r.width, r.height]; };
    add('panel', panel);
    document.querySelectorAll('.cap, #capBody, #meters, #controls, .step, #rows, #key').forEach((e) => add(e.id || e.className, e));
    document.querySelectorAll('.meter').forEach((e, i) => { add('bar card ' + (i + 1), e); add('bar ' + (i + 1), e.querySelector('.track')); add('bar note ' + (i + 1), e.querySelector('small')); });
    document.querySelectorAll('.ctl').forEach((e, i) => { add('control ' + (i + 1), e); const inp = e.querySelector('input, .seg'); if (inp) add('control ' + (i + 1) + ' input', inp); });
    document.querySelectorAll('#rows dt').forEach((e, i) => add('readout row ' + (i + 1), e));
    out['readout rows'] = [document.querySelectorAll('#rows dt').length, 0, 0, 0];
    const [x0, y0, x1, y1] = o.LEVELS[o.S.i].bounds, a = o.toScreen(x0, y1), b = o.toScreen(x1, y0);
    out.bench = [a[0], a[1], b[0] - a[0], b[1] - a[1]];
    return out;
  };
  const inp = document.getElementById(sliderId), min = +inp.min, max = +inp.max, step = +inp.step, start = inp.value;
  const set = (v) => { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); };
  set(min);
  const base = things(), moved = {};
  const n = Math.round((max - min) / step);
  for (let i = 0; i <= 2 * n; i++) {                       // up, then back down
    const v = +(min + step * (i <= n ? i : 2 * n - i)).toFixed(6);
    set(v);
    const now = things();
    for (const k of new Set([...Object.keys(base), ...Object.keys(now)])) {
      if (moved[k]) continue;
      const p = base[k], q = now[k];
      if (!p || !q) { moved[k] = { at: v, what: p ? 'went away' : 'appeared' }; continue; }
      const d = q.map((x, j) => x - p[j]);
      if (d.some((x) => Math.abs(x) > 0.5)) moved[k] = { at: v, what: `moved by x ${d[0].toFixed(1)}, y ${d[1].toFixed(1)}, w ${d[2].toFixed(1)}, h ${d[3].toFixed(1)}` };
    }
  }
  set(start);
  return { steps: 2 * n + 1, moved };
}

const fails = [];
let steps = 0;
const browser = await chromium.launch();
for (const [name, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true], ['short phone', { width: 390, height: 700 }, true]]) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${base}/optics/`);
  const ids = await page.evaluate(() => window.__optics.LEVELS.map((l) => l.id));
  await page.evaluate((all) => localStorage.setItem('optics.solved', JSON.stringify(all)), ids);   // every challenge open
  for (const id of ids) {
    await page.goto(`${base}/optics/#l=${id}`); await page.reload();
    await page.waitForFunction(() => window.__optics && window.__optics.S.out);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const params = await page.evaluate(() => window.__optics.LEVELS[window.__optics.S.i].params.map((q) => ({ id: q.id, options: q.options ? q.options.length : 0 })));
    const choice = params.find((q) => q.options);
    for (let opt = 0; opt < (choice ? choice.options : 1); opt++) {
      if (choice) await page.evaluate((b) => document.getElementById(b).click(), `p-${choice.id}-${opt}`);
      for (const q of params.filter((x) => !x.options)) {
        const r = await page.evaluate(sweep, 'p-' + q.id);
        steps += r.steps;
        for (const [thing, m] of Object.entries(r.moved)) {
          const msg = `${name} / ${id}${choice ? ' / option ' + (opt + 1) : ''} / slider "${q.id}" at ${m.at}: ${thing} ${m.what}`;
          fails.push(msg); console.log('FAIL ' + msg);
        }
      }
    }
  }
  await ctx.close();
}
await browser.close(); server.close();
console.log(fails.length ? `\n${fails.length} thing(s) moved, over ${steps} slider steps` : `\nNothing moved: ${steps} slider steps across every challenge, on desktop and two phone sizes.`);
process.exit(fails.length ? 1 : 0);
