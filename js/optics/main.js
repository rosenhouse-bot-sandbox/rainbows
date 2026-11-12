// Optics workshop: the page. It owns the settings, asks levels.js to trace them, draws the bench
// on a 2D canvas and keeps the panel's numbers in step. Nothing moves unless the player moves it,
// with one exception: the match flares for four seconds when it lights, and then holds still. With
// reduced motion switched on it is simply alight.

import { LEVELS, run } from './levels.js';
import { drawChart, CHART_ASPECT } from './chart.js';
import { WHITE } from './glass.js';

const $ = (id) => document.getElementById(id);
const cv = $('view'), g = cv.getContext('2d');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const S = { i: 0, p: {}, out: null, held: null };
const settings = LEVELS.map((l) => Object.fromEntries(l.params.map((q) => [q.id, q.value])));
let solved = new Set();
try { solved = new Set(JSON.parse(localStorage.getItem('optics.solved') || '[]')); } catch { /* private mode: play without saving */ }
const save = () => { try { localStorage.setItem('optics.solved', JSON.stringify([...solved])); } catch { /* as above */ } };

// ── panel ──────────────────────────────────────────────────────────────────────────────────────
const navBtns = LEVELS.map((l, i) => {
  const b = el('button'); b.type = 'button';
  b.append(el('i'), el('span', '', l.nav), el('span', 'visually-hidden', ''));
  b.addEventListener('click', () => { if (unlocked(i)) go(i); });
  $('levels').append(b);
  return b;
});
let inputs = {}, meterEls = [];

// A challenge opens only when every one before it has been solved.
const unlocked = (i) => LEVELS.slice(0, i).every((l) => solved.has(l.id));

function go(i, quiet) {
  i = clamp(i, 0, LEVELS.length - 1);
  while (!unlocked(i)) i--;
  S.i = i;
  const L = LEVELS[S.i];
  S.p = settings[S.i];
  $('eyebrow').textContent = `Challenge ${S.i + 1} of ${LEVELS.length}`;
  $('capTitle').textContent = L.title;
  $('capTask').textContent = L.task;
  $('capBody').textContent = L.brief;
  $('scaleText').textContent = L.scale;
  $('status').textContent = '';

  const box = $('controls'); box.replaceChildren(); inputs = {};
  for (const q of L.params) {
    if (q.options) {                               // a choice: one button each
      const id = 'p-' + q.id, wrap = el('div', 'ctl'), lab = el('span', 'lab', q.label), seg = el('div', 'seg');
      lab.id = id + '-lab'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-labelledby', lab.id);
      const btns = q.options.map((name, i) => {
        const b = el('button', '', name); b.type = 'button'; b.id = id + '-' + i;
        b.addEventListener('click', () => { S.p[q.id] = i; update(); });
        seg.append(b); return b;
      });
      wrap.append(lab, seg); box.append(wrap);
      inputs[q.id] = { btns, q };
      continue;
    }
    const id = 'p-' + q.id, wrap = el('div', 'ctl'), lab = el('div', 'lab'), label = el('label', '', q.label), val = el('b');
    label.htmlFor = id; val.setAttribute('aria-hidden', 'true'); lab.append(label, val);
    const inp = el('input'); inp.type = 'range'; inp.id = id; inp.min = q.min; inp.max = q.max; inp.step = q.step; inp.value = S.p[q.id];
    inp.addEventListener('input', () => { S.p[q.id] = +inp.value; update(); });
    wrap.append(lab, inp); box.append(wrap);
    inputs[q.id] = { inp, val, q };
  }
  const key = $('key'); key.replaceChildren();
  const rows = [...L.key];
  for (const [cls, text] of rows) { const li = el('li'); li.append(el('i', cls), el('span', '', text)); key.append(li); }
  $('meters').replaceChildren(); meterEls = [];

  if (!quiet) { try { history.replaceState(null, '', '#l=' + L.id); } catch { /* sandboxed frame */ } }
  $('panel').scrollTop = 0;
  S.lit = undefined; S.fx = null;            // arriving at a challenge is not lighting the match
  update();
  if (S.out.b.handles.length) { const li = el('li'); li.append(el('i', 'k-knob'), el('span', '', 'Knob: drag it')); key.prepend(li); }
  paintNav();
  layout();
}

// On a phone the bench gets the height its shape needs at full width and the sheet takes the rest,
// but never less than it takes to show every control without scrolling (while the bench can spare it).
function layout() {
  const root = document.documentElement;
  if (WIDE.matches) { root.style.removeProperty('--sheet'); return; }
  const L = LEVELS[S.i], w = window.innerWidth, h = window.innerHeight, [bx0, by0, bx1, by1] = L.bounds;
  // the eye chart, or the magnified spot, takes a column on the left; the bench gets the rest of the width
  const top = TOP, free = w - 20 - (L.aside ? 104 : S.out.b.spot ? INSET + 8 : 0);
  const want = Math.max(free / (bx1 - bx0) * (by1 - by0), L.aside ? 96 * CHART_ASPECT : S.out.b.spot ? INSET : 0);
  const panel = $('panel'), need = $('controls').getBoundingClientRect().bottom - panel.getBoundingClientRect().top + panel.scrollTop + 14;
  const sheet = clamp(Math.max(h - top - want - 12, need), h * 0.3, h - top - Math.min(want, 120) - 12);
  root.style.setProperty('--sheet', Math.round(sheet) + 'px');
}
const WIDE = window.matchMedia('(min-width:900px)'), TOP = 62, INSET = 92;

function paintNav() {
  navBtns.forEach((b, i) => {
    const done = solved.has(LEVELS[i].id);
    b.classList.toggle('done', done);
    const shut = !unlocked(i);
    b.classList.toggle('locked', shut); b.setAttribute('aria-disabled', String(shut));
    b.lastChild.textContent = done ? ' (solved)' : shut ? ' (locked: solve the ones before it)' : '';
    if (i === S.i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  });
  const done = solved.has(LEVELS[S.i].id);
  $('again').hidden = !done;
  $('prev').setAttribute('aria-disabled', String(S.i === 0));
  const last = S.i === LEVELS.length - 1;
  $('next').setAttribute('aria-disabled', String(last || !done));   // no going on until this one is solved
  $('next').classList.toggle('primary', done && !last);
}

// Recompute and redraw. Called on every change; the trace takes about a millisecond.
function update() {
  const L = LEVELS[S.i];
  S.out = run(L, S.p);
  const lit = S.out.score.solved;
  if (lit && S.lit === false && !REDUCE.matches) S.fx = { t0: performance.now() };
  if (!lit) S.fx = null;
  if (lit !== S.lit && S.lit !== undefined) $('status').textContent = lit ? 'Goal met. Submit your design.' : '';
  S.lit = lit;
  $('submit').hidden = !lit;                  // the button is there only while the goal is met
  $('panel').classList.toggle('ready', lit);  // room at the foot of the sheet, so the button covers nothing
  const { score, b } = S.out;
  for (const k in inputs) {
    const { inp, val, q, btns } = inputs[k], v = S.p[k];
    if (btns) { btns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === v))); continue; }
    if (+inp.value !== v) inp.value = v;
    inp.style.setProperty('--v', ((v - q.min) / (q.max - q.min) * 100).toFixed(2) + '%');
    const text = q.show(v, b);
    val.textContent = text; inp.setAttribute('aria-valuetext', text);
  }
  const box = $('meters');
  box.classList.toggle('two', score.meters.length > 1);
  score.meters.forEach((m, i) => {
    let e = meterEls[i];
    if (!e) {
      const root = el('div', 'meter'), lab = el('div', 'lab'), name = el('span'), val = el('b'), track = el('div', 'track'), zone = el('u'), fill = el('i'), note = el('small');
      const met = el('span', 'visually-hidden');
      lab.append(name, val); track.append(zone, fill); root.append(lab, track, note, met); box.append(root);
      e = meterEls[i] = { root, name, val, track, zone, fill, note, met };
    }
    const pct = (v) => (clamp(isFinite(v) ? v : 1, 0, 1) * 100).toFixed(1) + '%';
    e.track.classList.toggle('range', !!m.range);
    let ok;
    if (m.range) {                                 // a marker on a scale, with the goal as a band
      const r = m.range, at = (v) => (v - r.min) / (r.max - r.min);
      ok = m.ok;
      e.zone.style.left = pct(at(r.lo)); e.zone.style.width = pct(at(r.hi) - at(r.lo));
      e.fill.style.width = ''; e.fill.style.left = pct(at(r.value));
    } else {                                       // a bar that fills toward the goal
      const frac = clamp(isFinite(m.frac) ? m.frac : 0, 0, 1);
      ok = m.ok ?? frac >= 1;
      e.fill.style.left = ''; e.fill.style.width = pct(ok ? 1 : Math.min(frac, 0.97));
    }
    e.name.textContent = m.label; e.val.textContent = m.text;
    e.root.classList.toggle('ok', ok);
    // the words never change length, so the card never changes height: green says it is met
    e.note.textContent = 'Goal: ' + m.goal; e.met.textContent = ok ? ' (met)' : '';
  });
  const dl = $('rows'); dl.replaceChildren();
  for (const [k, v] of score.rows) dl.append(el('dt', '', k), el('dd', '', v));
  invalidate();
}

// Meeting the goal only offers the Submit button. Pressing it is what wins the challenge, and
// opens the note about what was built.
const won = $('won');
function note() {
  const L = LEVELS[S.i], last = S.i === LEVELS.length - 1;
  $('wonTitle').textContent = L.title;
  $('learned').textContent = L.learned;
  $('wonNext').hidden = last;
  if (!won.open) won.showModal();
}
$('submit').addEventListener('click', () => {
  if (!S.out.score.solved) return;
  solved.add(LEVELS[S.i].id); save(); paintNav(); note();
});
$('again').addEventListener('click', note);
$('wonStay').addEventListener('click', () => won.close());
$('wonNext').addEventListener('click', () => { won.close(); if (S.i < LEVELS.length - 1) go(S.i + 1); });

$('prev').addEventListener('click', () => { if (S.i > 0) go(S.i - 1); });
$('next').addEventListener('click', () => { if (S.i < LEVELS.length - 1 && solved.has(LEVELS[S.i].id)) go(S.i + 1); });
$('reset').addEventListener('click', () => {
  for (const q of LEVELS[S.i].params) S.p[q.id] = q.value;
  update();
});
const REDUCE = window.matchMedia('(prefers-reduced-motion:reduce)');

// ── view: world units to screen ────────────────────────────────────────────────────────────────
const V = { k: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0, box: [0, 0, 0, 0] };
function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const pr = $('panel').getBoundingClientRect(), wide = WIDE.matches;
  // the part of the screen the panel leaves free
  const x0 = wide ? pr.right + 20 : 10, x1 = w - (wide ? 20 : 10), y0 = wide ? 64 : TOP, y1 = wide ? h - 48 : pr.top - 12;
  let x0s = x0, x1s = x1, aside = null;
  if (LEVELS[S.i].aside) {                  // a column kept clear of the bench, for the eye chart
    const cw = wide ? Math.min(190, (x1 - x0) * 0.22) : 96, ch = cw * CHART_ASPECT, cy = (y0 + y1) / 2 - ch / 2;
    if (wide) { aside = [x1 - cw, cy, cw, ch]; x1s = x1 - cw - 16; } else { aside = [x0, cy, cw, ch]; x0s = x0 + cw + 8; }
  } else if (S.out.b.spot && !wide) x0s = x0 + INSET + 8;      // on a phone the magnified spot sits beside the bench
  const [bx0, by0, bx1, by1] = LEVELS[S.i].bounds;
  const k = Math.max(0.01, Math.min((x1s - x0s) / (bx1 - bx0), (y1 - y0) / (by1 - by0)));
  Object.assign(V, { k, dpr, w, h, box: [x0, y0, x1, y1], aside,
    ox: (x0s + x1s) / 2 - k * (bx0 + bx1) / 2, oy: (y0 + y1) / 2 + k * (by0 + by1) / 2 });
}
const sx = (x) => V.ox + V.k * x, sy = (y) => V.oy - V.k * y;
const wx = (px) => (px - V.ox) / V.k, wy = (py) => (V.oy - py) / V.k;

let queued = false;
function invalidate() { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; draw(); }); } }

// ── drawing ────────────────────────────────────────────────────────────────────────────────────
const INK = '234,240,255', LIGHT = '#ffb13b';
const FLARE = 4;                       // seconds the match flares before the flame holds still
function line(x0, y0, x1, y1) { g.beginPath(); g.moveTo(sx(x0), sy(y0)); g.lineTo(sx(x1), sy(y1)); g.stroke(); }

const ITEMS = {
  axis() { g.strokeStyle = `rgba(${INK},.13)`; g.lineWidth = 1; g.setLineDash([2, 6]); const [x0, , x1] = LEVELS[S.i].bounds; line(x0, 0, x1, 0); g.setLineDash([]); },
  rail(o) { g.strokeStyle = `rgba(${INK},.3)`; g.lineWidth = 3; g.lineCap = 'round'; line(o.x0, o.y, o.x1, o.y); },
  post(o) { g.strokeStyle = `rgba(${INK},.3)`; g.lineWidth = 2; line(o.x, o.y0, o.x, o.y1); },
  ground() { g.strokeStyle = `rgba(${INK},.3)`; g.lineWidth = 2; line(-400, 0, 400, 0); },
  glass(o) {
    g.beginPath();
    for (let i = 0; i < o.outline.length; i += 2) g[i ? 'lineTo' : 'moveTo'](sx(o.outline[i]), sy(o.outline[i + 1]));
    g.closePath();
    g.fillStyle = o.flint ? 'rgba(170,230,190,.24)' : 'rgba(150,195,255,.2)'; g.fill();
    g.strokeStyle = o.flint ? 'rgba(200,245,215,.85)' : 'rgba(205,228,255,.85)'; g.lineWidth = 1.5; g.lineJoin = 'round'; g.stroke();
  },
  match(o, lit) {
    g.strokeStyle = '#b89a6a'; g.lineWidth = Math.max(2, V.k * 1.1); g.lineCap = 'round';
    line(o.x + o.r, -o.r, o.x + o.r + 5, -19);
    const r = Math.max(3, V.k * o.r), cx = sx(o.x) + r, cy = sy(0);
    if (!lit) { g.fillStyle = '#e8553d'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); return; }
    // t: seconds since it caught. Past the flare (or with reduced motion) the flame holds still.
    const t = S.fx ? Math.min(FLARE, (performance.now() - S.fx.t0) / 1000) : FLARE;
    const u = Math.min(1, t / 0.45), grow = 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;      // overshoots, then settles
    const live = Math.max(0, 1 - t / FLARE) ** 1.5;                                        // how much flicker is left
    const H = V.k * 17 * grow * (1 + 0.1 * live * Math.sin(t * 23)), W = V.k * 3.6 * (1 + 0.12 * live * Math.sin(t * 17 + 1));
    const sway = W * 0.9 * live * Math.sin(t * 11);
    g.save(); g.globalCompositeOperation = 'lighter';
    const halo = H * 1.5, gr = g.createRadialGradient(cx, cy - H * 0.3, 0, cx, cy - H * 0.3, halo);
    gr.addColorStop(0, 'rgba(255,170,60,.5)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy - H * 0.3, halo, 0, 7); g.fill();
    if (t < 0.3) {                                                    // the flash as it catches
      const f = t / 0.3; g.fillStyle = `rgba(255,244,214,${(0.9 * (1 - f)).toFixed(3)})`;
      g.beginPath(); g.arc(cx, cy, r + H * 0.9 * Math.sqrt(f), 0, 7); g.fill();
    }
    if (S.fx) for (let i = 0; i < 22; i++) {                           // sparks, the same every time
      const h1 = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1, h2 = Math.abs(Math.sin(i * 78.233) * 12345.678) % 1, h3 = Math.abs(Math.sin(i * 39.425) * 9876.543) % 1;
      const life = 0.55 + 0.9 * h3, a = t / life;
      if (a >= 1) continue;
      const ang = -Math.PI / 2 + (h1 - 0.5) * 3.6, v = V.k * (38 + 70 * h2), reach = (1 - (1 - a) ** 2) * life * 0.6;
      const px = cx + Math.cos(ang) * v * reach, py = cy + Math.sin(ang) * v * reach + V.k * 16 * a * a - V.k * 6 * a;
      g.fillStyle = `rgba(255,${(200 + 40 * h2) | 0},${(120 * (1 - a)) | 0},${(1 - a).toFixed(3)})`;
      g.beginPath(); g.arc(px, py, Math.max(1, V.k * 0.42 * (1 - 0.5 * a)), 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    const tongue = (w, h, s, fill) => {
      g.beginPath(); g.moveTo(cx, cy + r * 0.9);
      g.bezierCurveTo(cx - w * 1.7, cy - h * 0.1, cx - w * 0.55 + s * 0.4, cy - h * 0.62, cx + s, cy - h);
      g.bezierCurveTo(cx + w * 0.55 + s * 0.4, cy - h * 0.62, cx + w * 1.7, cy - h * 0.1, cx, cy + r * 0.9);
      g.fillStyle = fill; g.fill();
    };
    tongue(W, H, sway, 'rgba(255,106,26,.92)');
    tongue(W * 0.66, H * 0.72, sway * 0.7, '#ffc13d');
    tongue(W * 0.34, H * 0.42, sway * 0.4, '#fff6dc');
    g.fillStyle = '#3a2618'; g.beginPath(); g.arc(cx, cy, r * 0.8, 0, 7); g.fill();          // the head, charring
    g.restore();
  },
  eye(o, lit) {
    const a = Math.atan2(o.hj, o.cx - o.xj);              // half-angle the cornea takes out of the eyeball
    g.beginPath(); g.arc(sx(o.cx), sy(0), V.k * o.RB, Math.PI + a, Math.PI - a); 
    const ac = Math.atan2(o.hj, o.RC - o.xj);
    g.arc(sx(o.RC), sy(0), V.k * o.RC, Math.PI - ac, Math.PI + ac);
    g.closePath();
    g.fillStyle = 'rgba(150,195,255,.1)'; g.fill();
    g.strokeStyle = 'rgba(205,228,255,.75)'; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = '#8792b8'; g.lineWidth = 3; g.lineCap = 'butt';
    line(o.xj, o.pupil, o.xj, o.hj); line(o.xj, -o.pupil, o.xj, -o.hj);
    // the retina: the back of the eyeball
    g.strokeStyle = lit ? '#6fe3a1' : '#e8553d'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.arc(sx(o.cx), sy(0), V.k * o.RB, -0.75, 0.75); g.stroke();
  },
  iris(o) { g.strokeStyle = '#8792b8'; g.lineWidth = 4; g.lineCap = 'butt'; line(o.x, o.open, o.x, o.h); line(o.x, -o.open, o.x, -o.h); },
  sensor(o, lit) {
    const y = o.y || 0;
    g.fillStyle = 'rgba(135,146,184,.35)'; g.fillRect(sx(o.x), sy(y + o.h + 1.5), V.k * 3.5, V.k * (2 * o.h + 3));
    g.strokeStyle = lit ? '#6fe3a1' : '#e8553d'; g.lineWidth = 3; g.lineCap = 'butt'; line(o.x, y - o.h, o.x, y + o.h);
  },
  tower(o, lit, m) {
    // The boiler glows by how much of the mirrors' light is landing on it: dull red with none,
    // brighter with each mirror that finds it, white-hot with all three.
    const f = Math.min(1, m.viaShare), mix = (a, b) => Math.round(a + (b - a) * f);
    g.fillStyle = 'rgba(135,146,184,.3)'; g.fillRect(sx(o.x), sy(o.y1), V.k * o.w, V.k * o.y1);
    g.fillStyle = `rgb(${mix(150, 255)},${mix(58, 244)},${mix(44, 208)})`; g.fillRect(sx(o.x) - 1.5, sy(o.y1), V.k * o.w + 1.5, V.k * (o.y1 - o.y0));
    if (f > 0.01) {
      const cx = sx(o.x + o.w / 2), cy = sy((o.y0 + o.y1) / 2), r = V.k * (12 + 30 * f);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, `rgba(255,${mix(150, 215)},${mix(70, 130)},${(0.25 + 0.55 * f).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,120,30,0)');
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.restore();
    }
  },
  heliostat(o) {
    g.strokeStyle = `rgba(${INK},.3)`; g.lineWidth = 2; line(o.px, 0, o.px, o.py);
    g.strokeStyle = '#cfe4ff'; g.lineWidth = 3.5; g.lineCap = 'round'; line(o.m.ax, o.m.ay, o.m.bx, o.m.by);
  },
};

function draw() {
  fit();
  const { b, paths, score, m } = S.out, lit = score.solved;
  g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  g.clearRect(0, 0, V.w, V.h);
  g.lineCap = 'butt'; g.setLineDash([]);
  for (const o of b.items) if (o.t === 'axis' || o.t === 'ground' || o.t === 'rail' || o.t === 'post') ITEMS[o.t](o, lit, m);
  // the light, added up where rays overlap
  g.globalCompositeOperation = 'lighter'; g.lineWidth = 1.4; g.lineJoin = 'round';
  const tints = new Map();                       // rays of one colour are stroked together
  paths.forEach((p, i) => { const rgb = b.draw[i].rgb, key = rgb ? `rgb(${rgb})` : LIGHT; if (!tints.has(key)) tints.set(key, []); tints.get(key).push(p); });
  for (const [tint, list] of tints) for (const pass of ['absorbed', 'target']) {
    g.strokeStyle = tint; g.globalAlpha = pass === 'target' ? 0.85 : 0.4;
    g.beginPath();
    for (const p of list) {
      if ((p.end === 'target') !== (pass === 'target')) continue;
      for (let i = 0; i < p.pts.length; i += 2) g[i ? 'lineTo' : 'moveTo'](sx(p.pts[i]), sy(p.pts[i + 1]));
    }
    g.stroke();
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  for (const o of b.items) if (!(o.t === 'axis' || o.t === 'ground' || o.t === 'rail' || o.t === 'post')) ITEMS[o.t](o, lit, m);
  // knobs: the things a finger can move
  for (const h of b.handles) for (const [kx, ky] of h.knobs) {
    const on = S.held && S.held.h.param === h.param;
    g.beginPath(); g.arc(sx(kx), sy(ky), on ? 8 : 6, 0, 7);
    g.fillStyle = `rgba(${INK},.2)`; g.fill();
    g.beginPath(); g.arc(sx(kx), sy(ky), on ? 5 : 4, 0, 7);
    g.fillStyle = `rgb(${INK})`; g.fill();
  }
  if (b.spot) inset(b.spot, m, lit);
  if (b.chart && V.aside) {
    const [ax, ay, aw, ah] = V.aside;
    drawChart(g, ax, ay, aw, ah, V.dpr, m.hits, b.chart.umPerArcmin);
    g.strokeStyle = lit ? '#6fe3a1' : `rgba(${INK},.25)`; g.lineWidth = lit ? 2 : 1; g.beginPath(); g.roundRect(ax, ay, aw, ah, 8); g.stroke();
  }
  if (S.fx && performance.now() - S.fx.t0 < FLARE * 1000) invalidate();
}

// The spot the light makes on the target, magnified. On the axis of a round lens the spot is
// round: a ray that lands u from the centre stands for a ring of that radius.
function inset(spot, m, lit) {
  const wide = WIDE.matches, size = wide ? 132 : INSET, x = wide ? V.box[2] - size : V.box[0], y = wide ? (spot.low ? V.box[3] - size : V.box[1]) : (V.box[1] + V.box[3] - size) / 2;
  const half = spot.goal * 1.6, k = size / 2 / half, cx = x + size / 2, cy = y + size / 2;
  g.save();
  g.beginPath(); g.roundRect(x, y, size, size, 10); g.fillStyle = spot.slices ? 'rgb(7,11,24)' : 'rgba(7,11,24,.8)'; g.fill();
  g.strokeStyle = `rgba(${INK},.25)`; g.lineWidth = 1; g.stroke(); g.clip();
  // Light per unit area against radius, in rings one pixel wide. Full brightness is what all the
  // light would give spread evenly over the goal circle; the square root compresses the rest so a
  // wide blur still shows.
  const n = Math.ceil(size * 0.72), rg = spot.goal / 2 * k;
  if (spot.slices) {
    // Off the axis the spot is not round, and only an up-and-down slice of each beam is traced. So
    // each direction of light is drawn as that slice: a strip, bright where the rays land, centred
    // on the middle of its own light. The dashed marks are that direction's goal.
    spot.slices.forEach((sl, c) => {
      const G = m.groups[c], px = x + size * (c + 0.5) / spot.slices.length, gy = sl.goal / 2 * k, sw = size * 0.16;
      if (G && G.w) {
        // Neighbouring rays share out the light between where they land, so a wide smear is drawn
        // as a smear and not as a row of dots.
        const bins = new Float64Array(size), mid = G.u / G.w;
        let last = null;
        for (let i = 0; i < m.hits.length; i += 3) {
          if (m.hits[i + 2] !== c) continue;
          const r = size / 2 - (m.hits[i] - mid) * k;                      // up on the sensor is up in the inset
          if (last !== null) {
            const lo = Math.min(last, r), hi = Math.max(lo + 1, Math.max(last, r)), each = m.hits[i + 1] / (hi - lo);
            for (let q = Math.max(0, Math.floor(lo)); q < Math.min(size, hi); q++) bins[q] += each * (Math.min(hi, q + 1) - Math.max(lo, q));
          }
          last = r;
        }
        const gr = g.createLinearGradient(0, y, 0, y + size);
        for (let r = 0; r < size; r++) gr.addColorStop((r + 0.5) / size, `rgba(${sl.rgb},${clamp(Math.sqrt(bins[r] / G.w * 2 * gy), 0, 1).toFixed(3)})`);
        g.fillStyle = gr; g.fillRect(px - sw / 2, y, sw, size);
      }
      g.strokeStyle = lit ? '#6fe3a1' : `rgba(${INK},.8)`; g.setLineDash([3, 3]); g.lineWidth = 1.25;
      for (const d of [-gy, gy]) { g.beginPath(); g.moveTo(px - sw * 1.1, cy + d); g.lineTo(px + sw * 1.1, cy + d); g.stroke(); }
      g.setLineDash([]);
    });
    g.strokeStyle = `rgba(${INK},.15)`; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, y + 8); g.lineTo(cx, y + size - 8); g.stroke();
    g.restore();
    return;
  }
  const chan = [];                                // one profile per colour of light traced
  for (let i = 0; i < m.hits.length; i += 3) {
    const c = m.hits[i + 2], C = chan[c] || (chan[c] = { bins: new Float64Array(n + 1), tot: 0 }), r = Math.abs(m.hits[i]) * k;
    C.tot += m.hits[i + 1]; if (r < n) C.bins[Math.floor(r)] += m.hits[i + 1];
  }
  for (const C of chan) for (let pass = 0; C && pass < 3; pass++) {            // the rays are a sample: smooth the gaps between them
    let prev = C.bins[0];
    for (let r = 0; r < n; r++) { const here = C.bins[r]; C.bins[r] = (prev + 2 * here + C.bins[r + 1]) / 4; prev = here; }
  }
  const level = (C, r) => (C && C.tot ? clamp(Math.sqrt(C.bins[r] / C.tot * rg * rg / (2 * r + 1)), 0, 1) : 0);
  if (chan.length) {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, n);
    for (let r = 0; r < n; r++) {
      let col;
      if (chan.length === 1) col = `rgba(255,190,90,${level(chan[0], r).toFixed(3)})`;
      else {                                       // white light: add the colours up
        let R = 0, G = 0, B = 0;
        chan.forEach((C, c) => { const a = level(C, r), q = WHITE[c].rgb; R += a * q[0]; G += a * q[1]; B += a * q[2]; });
        col = `rgb(${Math.min(255, R) | 0},${Math.min(255, G) | 0},${Math.min(255, B) | 0})`;
      }
      gr.addColorStop((r + 0.5) / n, col);
    }
    g.fillStyle = gr; g.fillRect(x, y, size, size);
  }
  g.strokeStyle = lit ? '#6fe3a1' : `rgba(${INK},.8)`; g.setLineDash([3, 3]); g.lineWidth = 1.25;
  g.beginPath(); g.arc(cx, cy, spot.goal / 2 * k, 0, 7); g.stroke(); g.setLineDash([]);
  // scale bar: the goal's own width, so the number is the model's
  const bar = spot.goal * k;
  g.strokeStyle = `rgba(${INK},.8)`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 8, y + size - 9); g.lineTo(x + 8 + bar, y + size - 9); g.stroke();
  g.fillStyle = `rgba(${INK},.8)`; g.font = '500 10px "JetBrains Mono", ui-monospace, Menlo, monospace'; g.textBaseline = 'alphabetic';
  g.fillText((spot.goal * spot.per).toFixed(0) + ' ' + spot.unit, x + 8, y + size - 14);
  g.restore();
}

// ── dragging on the picture ────────────────────────────────────────────────────────────────────
function pick(e) {
  const r = cv.getBoundingClientRect(), X = wx(e.clientX - r.left), Y = wy(e.clientY - r.top);
  let best = null, bd = Infinity;
  for (const h of S.out.b.handles) { const d = h.hit(X, Y, V.k); if (d < bd) { bd = d; best = h; } }
  return { h: best, X, Y };
}
function snap(q, v) { return clamp(+(Math.round((v - q.min) / q.step) * q.step + q.min).toFixed(6), q.min, q.max); }

cv.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || S.held) return;
  const { h, X, Y } = pick(e);
  if (!h) return;
  e.preventDefault();
  S.held = { h, id: e.pointerId, c: h.start(X, Y, S.p[h.param], V.k) };
  cv.setPointerCapture(e.pointerId);
  cv.classList.add('held'); invalidate();
});
cv.addEventListener('pointermove', (e) => {
  if (!S.held) {
    const { h } = pick(e);
    cv.classList.toggle('ew', !!h && h.cursor === 'ew'); cv.classList.toggle('ns', !!h && h.cursor === 'ns');
    return;
  }
  if (e.pointerId !== S.held.id) return;
  const { X, Y } = pick(e), q = LEVELS[S.i].params.find((x) => x.id === S.held.h.param);
  const v = snap(q, S.held.h.move(X, Y, S.held.c));
  if (v !== S.p[q.id]) { S.p[q.id] = v; update(); }
});
const drop = (e) => {
  if (!S.held || e.pointerId !== S.held.id) return;
  S.held = null; cv.classList.remove('held'); invalidate();
};
cv.addEventListener('pointerup', drop);
cv.addEventListener('pointercancel', drop);
cv.addEventListener('lostpointercapture', drop);

// ── start ──────────────────────────────────────────────────────────────────────────────────────
new ResizeObserver(() => { layout(); invalidate(); }).observe(cv);
new ResizeObserver(invalidate).observe($('panel'));
const fromHash = () => { const id = /(?:^|[#&])l=([a-z]+)/.exec(location.hash); return id ? Math.max(0, LEVELS.findIndex((l) => l.id === id[1])) : 0; };
window.addEventListener('hashchange', () => { const i = fromHash(); if (i !== S.i) go(i); });
go(fromHash(), true);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(invalidate);

// For tests: the state, and where things are on screen.
window.__optics = { S, LEVELS, solved, toScreen: (x, y) => [sx(x), sy(y)], update };
