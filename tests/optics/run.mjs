// Plays every challenge of the Optics workshop through a real browser, once with a mouse at a
// desktop size and once with a finger at a phone size, and fails if a challenge cannot be won, if
// a knob does not follow the pointer, if a control is off the screen when a challenge opens, if
// Submit shows at the wrong time, or if the page logs an error. A last pass opens every challenge
// on a short phone screen and checks the controls again.
//
//   node tests/optics/run.mjs            # needs Node 22 and Playwright, installed outside the repository
//
// Screenshots of each challenge, before and after, go to tests/optics/out/ (not committed).

import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname, root = path.resolve(here, '../..'), out = path.join(here, 'out');
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { try { chromium = createRequire('/opt/node-tools/')('playwright').chromium; } catch { try { chromium = createRequire(process.execPath)('playwright').chromium; } catch { console.error('Playwright is not installed. Install it outside the repository: npm install -g playwright && npx playwright install chromium'); process.exit(2); } } }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
fs.mkdirSync(out, { recursive: true });

// What to do in each challenge: choices to click, sliders to set by keyboard, then knobs to drag
// (from a world point; `rev` when the value rises as the pointer goes left). The values are a known solution; the test checks the page agrees.
const PLAYS = {
  burn: { keys: { c: 15 }, drags: [{ param: 'x', at: [-50, -21], to: -61 }] },
  specs: { keys: { P: -4.5 }, drags: [] },
  camera: { keys: { q: 0.7 }, drags: [{ param: 'D', at: [-6, 12], to: 12.8 }] },
  colour: { clicks: { glass: 0 }, keys: { c: 11.5 }, drags: [] },
  doublet: { clicks: { glass: 1 }, keys: { c1: 45.5, c: -2 }, drags: [] },
  wide: { keys: { q: -2.25 }, drags: [{ param: 'xi', at: [-6, -21], to: -11.5 }] },
  tower: { keys: {}, drags: [{ param: 't0', at: [22, -6], to: 3.5 }, { param: 't1', at: [64, -6], to: -2 }, { param: 't2', at: [106, -6], to: -10.75 }] },
};

// When a challenge opens, every control must be on the screen and inside the visible part of the panel.
const landing = (page) => page.evaluate(() => {
  const p = document.getElementById('panel').getBoundingClientRect();
  return [...document.querySelectorAll('#controls input, #controls button, .meter')].every((e) => { const r = e.getBoundingClientRect(); return r.top >= p.top - 1 && r.bottom <= Math.min(innerHeight, p.bottom) + 1; });
});

const fails = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log('  FAIL ' + msg); } };

const browser = await chromium.launch();
for (const [name, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = touch ? await ctx.newCDPSession(page) : null;
  const point = async (type, x, y) => {
    if (!touch) { if (type === 'down') { await page.mouse.move(x, y); await page.mouse.down(); } else if (type === 'move') await page.mouse.move(x, y); else await page.mouse.up(); return; }
    await cdp.send('Input.dispatchTouchEvent', { type: { down: 'touchStart', move: 'touchMove', up: 'touchEnd' }[type], touchPoints: type === 'up' ? [] : [{ x, y }] });
  };
  const val = (id) => page.evaluate((k) => window.__optics.S.p[k], id);

  for (const [id, play] of Object.entries(PLAYS)) {
    console.log(`${name}: ${id}`);
    await page.goto(`${base}/optics/#l=${id}`);
    await page.reload();
    await page.waitForFunction(() => window.__optics && window.__optics.S.out);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, `${name}-${id}-start.png`) });
    check(!(await page.evaluate(() => window.__optics.S.out.score.solved)), `${name}/${id}: already solved at the start`);
    check(await page.evaluate(() => document.getElementById('submit').hidden), `${name}/${id}: Submit shows before the goal is met`);
    check(await landing(page), `${name}/${id}: a control is cut off or hidden when the challenge opens`);
    // the bench must sit clear of the panel and inside the screen
    const clear = await page.evaluate(() => {
      const o = window.__optics, [x0, y0, x1, y1] = o.LEVELS[o.S.i].bounds, a = o.toScreen(x0, y1), b = o.toScreen(x1, y0), p = document.getElementById('panel').getBoundingClientRect();
      const wide = innerWidth >= 900;
      return a[0] >= (wide ? p.right : 0) - 0.5 && b[0] <= innerWidth + 0.5 && a[1] >= 0 && b[1] <= (wide ? innerHeight : p.top) + 0.5 && b[0] - a[0] > 200;
    });
    check(clear, `${name}/${id}: the bench is under the panel or off the screen`);

    for (const [k, v] of Object.entries(play.clicks || {})) {  // a choice, pressed where it is on screen
      await (touch ? page.tap(`#p-${k}-${v}`) : page.click(`#p-${k}-${v}`));
      check((await val(k)) === v, `${name}/${id}: could not choose ${k}`);
    }
    for (const [k, v] of Object.entries(play.keys)) {          // keyboard only
      await page.focus('#p-' + k);
      for (let n = 0; n < 400 && Math.abs((await val(k)) - v) > 1e-6; n++) await page.keyboard.press((await val(k)) < v ? 'ArrowRight' : 'ArrowLeft');
      check(Math.abs((await val(k)) - v) < 1e-6, `${name}/${id}: could not set ${k} by keyboard`);
    }
    for (const d of play.drags) {                              // pointer on the picture
      const [x, y] = await page.evaluate((at) => window.__optics.toScreen(at[0], at[1]), d.at);
      const before = await val(d.param);
      await point('down', x, y);
      let px = x, py = y, moved = false;
      for (let n = 0; n < 600; n++) {
        const v = await val(d.param);
        if (Math.abs(v - d.to) < (touch ? 0.3 : 1e-6)) break;       // a finger's events land a step late
        // which way the value goes when the pointer moves right (or up, for the iris)
        const dir = Math.sign(d.to - v) * (d.param === 'D' ? 0 : d.rev ? -1 : 1), dy = d.param === 'D' ? -Math.sign(d.to - v) : 0;
        px += dir; py += dy; moved = true;
        await point('move', px, py);
      }
      check(moved && (await val(d.param)) !== before, `${name}/${id}: dragging the ${d.param} knob did nothing`);
      check(Math.abs((await val(d.param)) - d.to) < 0.6, `${name}/${id}: dragging could not reach ${d.param} = ${d.to} (got ${await val(d.param)})`);
      await point('up', px, py);
    }
    await page.waitForTimeout(200);
    const meters = await page.evaluate(() => [...document.querySelectorAll('.meter')].map((m) => m.textContent));
    console.log('  ' + meters.join(' | '));
    check(await page.evaluate(() => window.__optics.S.out.score.solved), `${name}/${id}: the known solution does not solve it`);
    check(!(await page.evaluate(() => document.getElementById('won').open || window.__optics.solved.has(window.__optics.LEVELS[window.__optics.S.i].id))), `${name}/${id}: counted as solved before Submit was pressed`);
    const sub = page.locator('#submit');
    check(await sub.isVisible(), `${name}/${id}: Submit did not appear when the goal was met`);
    await page.screenshot({ path: path.join(out, `${name}-${id}-goal.png`) });
    await (touch ? sub.tap() : sub.click());
    await page.waitForTimeout(150);
    const said = await page.evaluate(() => ({ open: document.getElementById('won').open, text: document.getElementById('learned').textContent.length, marked: document.querySelector('#levels [aria-current]').classList.contains('done') }));
    check(said.open && said.text > 80 && said.marked, `${name}/${id}: Submit did not open the note or mark the challenge solved`);
    await page.screenshot({ path: path.join(out, `${name}-${id}-solved.png`) });
    await page.keyboard.press('Escape');
    check(!(await page.evaluate(() => document.getElementById('won').open)), `${name}/${id}: the note did not close`);
    // the page must not scroll sideways, and every control must be big enough for the input
    const layout = await page.evaluate(() => ({ wide: document.documentElement.scrollWidth > innerWidth + 1 || document.getElementById('panel').scrollWidth > document.getElementById('panel').clientWidth + 1,
      small: [...document.querySelectorAll('button, input, a.back')].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < (matchMedia('(pointer:coarse)').matches ? 44 : 24) - 0.5; }).map((e) => e.id || e.textContent.trim()) }));
    check(!layout.wide, `${name}/${id}: something overflows sideways`);
    check(!layout.small.length, `${name}/${id}: controls too small: ${layout.small.join(', ')}`);
  }
  check(!errors.length, `${name}: console: ${errors.join(' ; ')}`);
  await ctx.close();
}
{ // a phone with the browser's bars showing
  const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const id of Object.keys(PLAYS)) {
    await page.goto(`${base}/optics/#l=${id}`); await page.reload();
    await page.waitForFunction(() => window.__optics && window.__optics.S.out);
    await page.waitForTimeout(150);
    check(await landing(page), `short phone/${id}: a control is cut off or hidden when the challenge opens`);
    await page.screenshot({ path: path.join(out, `short-${id}-start.png`) });
  }
  await ctx.close();
}
await browser.close(); server.close();
console.log(fails.length ? `\n${fails.length} failure(s)` : '\nAll challenges can be won with mouse, finger and keyboard.');
process.exit(fails.length ? 1 : 0);
