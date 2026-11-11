#!/usr/bin/env node
// Smooth-interaction tests for the Rainbows page (/v2/).
//
//   node tests/smooth/run.mjs               run everything (about a quarter of an hour)
//   node tests/smooth/run.mjs --quick       a short pass over every kind of check
//   node tests/smooth/run.mjs --only drop   only scenarios whose name matches (a regular expression)
//   node tests/smooth/run.mjs --analyze     re-read the traces of the last run and rebuild the report
//   --jobs N (browsers at once, default 3)  --dpr X (device pixel ratio, default 0.5)  --list
//   --keep  leave the last run's traces in place (with --only: rerun a few scenarios, report on all)
//   --deep  when a NaN or infinity turns up in a render target, name the draw call that wrote it (slow)
//
// The page is driven the way a person drives it (a real pointer dragging real sliders, real presses)
// but on a clock that only moves when the test says: one frame per step of input, however slow the
// software renderer is. Every frame is sampled: the picture, what was sent to WebGL, the layout of
// the panel, the labels, the page's state. analyze.mjs then looks for anything that did not change
// smoothly. See README.md here for what it can and cannot catch.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { scenarios } from './scenarios.mjs';
import { analyze, writeReport } from './analyze.mjs';

const here = import.meta.dirname, root = path.resolve(here, '../..'), out = path.join(here, 'out');
const args = process.argv.slice(2), flag = n => args.includes('--' + n), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const JOBS = +opt('jobs', 3), DPR = +opt('dpr', 0.5), only = opt('only', null) && new RegExp(opt('only'), 'i');

if (!flag('analyze')) {
  let chromium;
  try { chromium = createRequire(import.meta.url)('playwright').chromium; }
  catch { try { chromium = createRequire('/opt/node-tools/')('playwright').chromium; } catch { console.error('Playwright is not installed. Install it outside the repository: npm install -g playwright && npx playwright install chromium'); process.exit(2); } }

  if (!flag('keep')) fs.rmSync(out, { recursive: true, force: true });      // --keep: rerun some scenarios and report on them with the rest of the last run
  fs.mkdirSync(path.join(out, 'traces'), { recursive: true });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const srv = http.createServer((q, s) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p); if (!f.startsWith(root)) { s.writeHead(403); return s.end(); }
    fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); s.end(d); } });
  }).listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const VIEW = { desk: { width: 960, height: 600 }, phone: { width: 390, height: 844 } };

  // ---------- what a scenario can do ----------
  class Hand {
    constructor(page, sc, dir) { this.page = page; this.sc = sc; this.dir = dir; this.dt = sc.dt ?? 1 / 60; this.samples = []; this.pending = null; this.checks = []; this.marks = {}; this.errors = []; }
    // one frame of the page, sampled; `tag` says what the test was doing
    async frame(tag = 'idle', drag = null) {
      const s = await this.page.evaluate(ms => window.__smooth.step(ms), this.dt * 1000);
      const i = this.samples.length;
      fs.writeFileSync(path.join(this.dir, String(i).padStart(5, '0') + '.jpg'), Buffer.from(s.jpg, 'base64')); delete s.jpg;
      s.i = i; s.tag = tag; s.dt = this.dt; if (drag) s.drag = drag; if (this.pending) { s.ev = this.pending; this.pending = null; }
      this.samples.push(s);
      return s;
    }
    async frames(n, tag = 'idle') { let s; for (let i = 0; i < n; i++) s = await this.frame(tag); return s; }
    // frames until the flight between scales is over (and a little longer)
    async land(tag = 'flight', max = 700, after = 6) {
      let n = 0; for (; n < max; n++) { const s = await this.frame(tag); if (!s.tr && n > 1) break; }
      if (n >= max) this.errors.push(`the flight had not ended after ${max} frames`);
      await this.frames(after, tag + ': arrived');
    }
    event(what, more = {}) { this.pending = { ...this.pending, ...more, what: this.pending ? this.pending.what + ' + ' + what : what }; }
    async box(sel) {
      const r = await this.page.evaluate(q => { const el = document.querySelector(q); if (!el || !el.getClientRects().length) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, min: +el.min, max: +el.max, step: +el.step, value: +el.value }; }, sel);
      if (!r) throw new Error(`nothing to press at ${sel}`);
      return r;
    }
    // a real press, at the middle of the control as it is now
    async click(sel, frames = 0, tag) {
      const b = await this.box(sel);
      await this.page.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await this.page.mouse.down(); await this.page.mouse.up();
      this.event(`press ${sel}`, { sel });
      if (frames) await this.frames(frames, tag ?? `after ${sel}`);
    }
    // press a slider's thumb at value a and drag to value b, one frame per step. The pointer's path is
    // fixed when the drag starts, as a hand's is: if the slider moves under it, the value will show it.
    async drag(id, a, b, steps, tag) {
      const g = await this.box('#' + id), T = 18, y = g.y + g.h / 2;
      a = a ?? g.min; b = b ?? g.max;
      const x = v => g.x + T / 2 + (g.w - T) * (v - g.min) / (g.max - g.min);
      await this.page.mouse.move(x(a), y); await this.page.mouse.down();
      this.event(`take hold of the ${id} slider`, { sel: '#' + id });
      await this.frame(tag ?? `drag ${id}`, { id, want: a, tol: 1.5 * g.step + (g.max - g.min) / (g.w - T) });
      for (let k = 1; k <= steps; k++) {
        const v = a + (b - a) * k / steps;
        await this.page.mouse.move(x(v), y);
        await this.frame(tag ?? `drag ${id}`, { id, want: v, tol: 1.5 * g.step + (g.max - g.min) / (g.w - T), step: Math.abs(b - a) / steps });
      }
      await this.page.mouse.up();
    }
    // drag across the 3D view (to look around), one frame per step
    async look(dx, dy, steps, tag = 'look around') {
      const v = this.page.viewportSize(), p = await this.page.evaluate(() => { const r = window.__rainbows, w = innerWidth >= 900; const pr = document.getElementById('panel').getBoundingClientRect(); return w ? [(pr.right + innerWidth) / 2, innerHeight / 2] : [innerWidth / 2, pr.top / 2]; });
      await this.page.mouse.move(p[0], p[1]); await this.page.mouse.down();
      for (let k = 1; k <= steps; k++) { await this.page.mouse.move(p[0] + dx * k / steps, p[1] + dy * k / steps); await this.frame(tag); }
      await this.page.mouse.up(); void v;
    }
    async wheel(dy, steps, tag = 'scroll to zoom') { for (let k = 0; k < steps; k++) { await this.page.mouse.wheel(0, dy); await this.frame(tag); } }
    async key(k, frames = 0, tag) { await this.page.keyboard.press(k); this.event(`key ${k}`); if (frames) await this.frames(frames, tag ?? `after key ${k}`); }
    async resize(name, frames = 0) { await this.page.setViewportSize(VIEW[name]); this.event(`resize to ${name}`, { resize: true }); if (frames) await this.frames(frames, `after resize to ${name}`); }
    async state() { return this.page.evaluate(() => ({ ...window.__rainbows.S, busy: window.__rainbows.busy })); }
    // remember this frame; same() later says the page should by then look and be exactly as it was
    mark(name) { this.marks[name] = this.samples.length - 1; }
    same(name, what) { this.checks.push({ kind: 'same', a: this.marks[name], b: this.samples.length - 1, what }); }
    expect(ok, what) { if (!ok) this.errors.push(what); }
  }

  async function runOne(browser, sc) {
    const dir = path.join(out, 'frames', sc.name.replace(/[^a-z0-9]+/gi, '-')); fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: VIEW[sc.view ?? 'desk'], deviceScaleFactor: DPR, reducedMotion: sc.reduced ? 'reduce' : 'no-preference', hasTouch: false });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());      // web fonts arrive whenever they like; the test uses the fallbacks
    if (flag('deep')) await ctx.addInitScript(() => { window.__smoothDeep = true; });      // read the render target back after every draw (slow)
    await ctx.addInitScript({ path: path.join(here, 'inject.js') });
    const page = await ctx.newPage(), h = new Hand(page, sc, dir);
    page.on('pageerror', e => h.errors.push('page error: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) h.errors.push('console error: ' + m.text()); });
    const t0 = Date.now();
    try {
      await page.goto(`${base}/v2/#${sc.hash ?? ''}`);
      await page.waitForFunction(() => window.__smooth?.ready(), null, { timeout: 120000, polling: 100 });
      if (sc.paused) await h.click('#pause');
      await page.evaluate(() => window.__smooth.skip(4, 1000 / 60));
      await sc.run(h);
    } catch (e) { h.errors.push('the scenario stopped: ' + String(e.message).split('\n')[0]); }
    await ctx.close();
    const trace = { name: sc.name, group: sc.group, route: sc.route, view: sc.view ?? 'desk', reduced: !!sc.reduced, hash: sc.hash, dir: path.relative(out, dir), samples: h.samples, checks: h.checks, errors: h.errors, secs: (Date.now() - t0) / 1000 };
    fs.writeFileSync(path.join(out, 'traces', path.basename(dir) + '.json'), JSON.stringify(trace));
    return trace;
  }

  // ---------- ask the page what it has ----------
  const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  async function discover() {
    const browser = await launch(), ctx = await browser.newContext({ viewport: VIEW.desk, deviceScaleFactor: DPR });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript({ path: path.join(here, 'inject.js') });
    const page = await ctx.newPage();
    await page.goto(`${base}/v2/`);
    await page.waitForFunction(() => window.__smooth?.ready(), null, { timeout: 120000, polling: 100 });
    const model = await page.evaluate(async () => {
      const r = window.__rainbows, buttons = [...document.querySelectorAll('#stages button')], stages = [];
      const hashOf = async () => { await new Promise(f => setTimeout(f, 400)); return Object.fromEntries(new URLSearchParams(location.hash.slice(1))); };
      const vis = el => el.getClientRects().length > 0;
      for (let i = 0; i < buttons.length; i++) {
        r.S.stage = i; r.syncUI();
        const st = { name: buttons[i].textContent.split('·')[0].trim(), sliders: [], range: {}, hashKey: {}, segs: {}, checks: [] };
        for (const el of document.querySelectorAll('.ctl input[type=range]')) if (vis(el)) { st.sliders.push(el.id); st.range[el.id] = { min: +el.min, max: +el.max, step: +el.step || 1 }; }
        for (const el of document.querySelectorAll('.ctl .seg button')) if (vis(el)) { const [k, v] = Object.entries(el.dataset)[0]; (st.segs[k] ??= []).push(v); }
        for (const el of document.querySelectorAll('.ctl input[type=checkbox]')) if (vis(el)) st.checks.push(el.id);
        const h0 = await hashOf(); st.id = h0.s;
        for (const id of st.sliders) {      // which word in the address bar is this slider?
          const g = st.range[id], was = r.S[id]; if (typeof was !== 'number') continue;
          r.S[id] = g.min + g.step * Math.round(0.37 * (g.max - g.min) / g.step); r.syncUI();
          const h1 = await hashOf(); for (const k in h1) if (h1[k] !== h0[k] && k !== 's') st.hashKey[id] = k;
          r.S[id] = was; r.syncUI();
        }
        stages.push(st);
      }
      return { stages };
    });
    for (const st of model.stages) {      // how long a frame of each scale takes here
      await page.goto(`${base}/v2/#s=${st.id}`); await page.reload();
      await page.waitForFunction(() => window.__smooth?.ready(), null, { timeout: 120000, polling: 100 });
      await page.evaluate(() => window.__smooth.skip(3, 16.7));
      const t = Date.now(); for (let i = 0; i < 4; i++) await page.evaluate(() => window.__smooth.step(16.7));
      st.frameMs = (Date.now() - t) / 4;
    }
    await browser.close();
    return model;
  }
  const model = await discover();
  fs.writeFileSync(path.join(out, 'model.json'), JSON.stringify(model, null, 1));
  console.log('found: ' + model.stages.map(st => `${st.name} [${st.sliders.join(' ')}] ${st.frameMs.toFixed(0)} ms`).join(' · '));
  let list = scenarios(model, { quick: flag('quick') });
  if (only) list = list.filter(s => only.test(s.name));
  if (flag('list')) { for (const s of list) console.log(`${String(Math.round(s.cost ?? 0)).padStart(5)} s  ${s.name}`); process.exit(0); }
  console.log(`${list.length} scenarios, about ${(list.reduce((a, s) => a + (s.cost ?? 0), 0) / 60 / Math.min(JOBS, 2)).toFixed(0)} minutes`);

  const queue = [...list].sort((a, b) => (b.cost ?? 1) - (a.cost ?? 1)); let done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
    const browser = await launch();
    for (let sc; (sc = queue.shift());) {
      const tr = await runOne(browser, sc);
      console.log(`[${++done}/${list.length}] ${sc.name}: ${tr.samples.length} frames in ${tr.secs.toFixed(0)} s${tr.errors.length ? '  !! ' + tr.errors[0] : ''}`);
    }
    await browser.close();
  }));
  srv.close();
  console.log(`ran in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}

// ---------- analysis and report ----------
const traces = fs.readdirSync(path.join(out, 'traces')).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(out, 'traces', f), 'utf8')));
const result = analyze(traces);
await writeReport(result, traces, out);
console.log('\n' + fs.readFileSync(path.join(out, 'report.md'), 'utf8').split('\n## Every finding')[0]);
console.log(`Report: ${path.relative(process.cwd(), path.join(out, 'report.html'))} (pictures), report.md (text), contact.png (worst offenders)`);
process.exit(result.findings.some(f => f.level === 'fail') ? 1 : 0);
