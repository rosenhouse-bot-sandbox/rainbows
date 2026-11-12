// Optics workshop: the page. It owns the settings, asks levels.js to trace them, draws the bench
// on a 2D canvas and keeps the panel's numbers in step. Nothing moves unless the player moves it,
// so there is no animation clock and nothing to pause.

import { LEVELS, run } from './levels.js';

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
  b.addEventListener('click', () => go(i));
  $('levels').append(b);
  return b;
});
let inputs = {}, meterEls = [];

function go(i, quiet) {
  S.i = clamp(i, 0, LEVELS.length - 1);
  const L = LEVELS[S.i];
  S.p = settings[S.i];
  $('eyebrow').textContent = `Challenge ${S.i + 1} of ${LEVELS.length}`;
  $('capTitle').textContent = L.title;
  $('capBody').textContent = L.brief;
  $('scaleText').textContent = L.scale;
  $('learned').textContent = L.learned;
  $('status').textContent = '';

  const box = $('controls'); box.replaceChildren(); inputs = {};
  for (const q of L.params) {
    const id = 'p-' + q.id, wrap = el('div', 'ctl'), lab = el('div', 'lab'), label = el('label', '', q.label), val = el('b');
    label.htmlFor = id; val.setAttribute('aria-hidden', 'true'); lab.append(label, val);
    const inp = el('input'); inp.type = 'range'; inp.id = id; inp.min = q.min; inp.max = q.max; inp.step = q.step; inp.value = S.p[q.id];
    inp.addEventListener('input', () => { S.p[q.id] = +inp.value; hintOff(); update(); });
    inp.addEventListener('change', commit);
    wrap.append(lab, inp); box.append(wrap);
    inputs[q.id] = { inp, val, q };
  }
  const key = $('key'); key.replaceChildren();
  const rows = [...L.key];
  for (const [cls, text] of rows) { const li = el('li'); li.append(el('i', cls), el('span', '', text)); key.append(li); }
  $('meters').replaceChildren(); meterEls = [];

  $('hint').classList.remove('gone');
  S.hinted = false;
  if (!quiet) { try { history.replaceState(null, '', '#l=' + L.id); } catch { /* sandboxed frame */ } }
  $('panel').scrollTop = 0;
  update();
  const hasKnob = S.out.b.handles.length > 0;
  $('hint').textContent = L.hint || (hasKnob ? 'Drag the white knobs, or use the sliders' : 'Use the slider in the panel');
  if (hasKnob) { const li = el('li'); li.append(el('i', 'k-knob'), el('span', '', 'Knob: drag it')); key.prepend(li); }
  paintNav();
}

function paintNav() {
  navBtns.forEach((b, i) => {
    const done = solved.has(LEVELS[i].id);
    b.classList.toggle('done', done);
    b.lastChild.textContent = done ? ' (solved)' : '';
    if (i === S.i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  });
  const done = solved.has(LEVELS[S.i].id);
  $('won').hidden = !done;
  $('prev').setAttribute('aria-disabled', String(S.i === 0));
  const last = S.i === LEVELS.length - 1;
  $('next').setAttribute('aria-disabled', String(last));
  $('next').classList.toggle('primary', done && !last);
}

// Recompute and redraw. Called on every change; the trace takes about a millisecond.
function update() {
  const L = LEVELS[S.i];
  S.out = run(L, S.p);
  const { score, b } = S.out;
  for (const k in inputs) {
    const { inp, val, q } = inputs[k], v = S.p[k];
    if (+inp.value !== v) inp.value = v;
    inp.style.setProperty('--v', ((v - q.min) / (q.max - q.min) * 100).toFixed(2) + '%');
    const text = q.show(v, b);
    val.textContent = text; inp.setAttribute('aria-valuetext', text);
  }
  const box = $('meters');
  score.meters.forEach((m, i) => {
    let e = meterEls[i];
    if (!e) {
      const root = el('div', 'meter'), lab = el('div', 'lab'), name = el('span'), val = el('b'), track = el('div', 'track'), fill = el('i'), note = el('small');
      lab.append(name, val); track.append(fill); root.append(lab, track, note); box.append(root);
      e = meterEls[i] = { root, name, val, fill, note };
    }
    const frac = clamp(isFinite(m.frac) ? m.frac : 0, 0, 1), ok = frac >= 1;
    e.name.textContent = m.label; e.val.textContent = m.text;
    e.fill.style.width = (frac * 100).toFixed(1) + '%';
    e.root.classList.toggle('ok', ok);
    e.note.textContent = (ok ? 'Goal met: ' : 'Goal: ') + m.goal;
  });
  const dl = $('rows'); dl.replaceChildren();
  for (const [k, v] of score.rows) dl.append(el('dt', '', k), el('dd', '', v));
  invalidate();
}

// A challenge is won when the goal is met at the moment the player lets go, not in passing.
function commit() {
  const L = LEVELS[S.i];
  if (!S.out.score.solved || solved.has(L.id)) return;
  solved.add(L.id); save(); paintNav();
  $('status').textContent = `Solved: ${L.title}. ${L.learned}`;
  // on a phone the news is below the fold of the sheet: bring its heading up, and no further
  $('won').firstElementChild.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
  invalidate();
}

$('prev').addEventListener('click', () => { if (S.i > 0) go(S.i - 1); });
$('next').addEventListener('click', () => { if (S.i < LEVELS.length - 1) go(S.i + 1); });
$('reset').addEventListener('click', () => {
  for (const q of LEVELS[S.i].params) S.p[q.id] = q.value;
  update();
});
const hintOff = () => { if (!S.hinted) { S.hinted = true; $('hint').classList.add('gone'); } };

// ── view: world units to screen ────────────────────────────────────────────────────────────────
const V = { k: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0, box: [0, 0, 0, 0] };
function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const pr = $('panel').getBoundingClientRect(), wide = window.matchMedia('(min-width:900px)').matches;
  // the part of the screen the panel leaves free
  const x0 = wide ? pr.right + 20 : 10, x1 = w - (wide ? 20 : 10), y0 = wide ? 64 : 84, y1 = wide ? h - 48 : pr.top - 10;
  const [bx0, by0, bx1, by1] = LEVELS[S.i].bounds;
  const k = Math.max(0.01, Math.min((x1 - x0) / (bx1 - bx0), (y1 - y0) / (by1 - by0)));
  Object.assign(V, { k, dpr, w, h, box: [x0, y0, x1, y1],
    ox: (x0 + x1) / 2 - k * (bx0 + bx1) / 2, oy: (y0 + y1) / 2 + k * (by0 + by1) / 2 });
}
const sx = (x) => V.ox + V.k * x, sy = (y) => V.oy - V.k * y;
const wx = (px) => (px - V.ox) / V.k, wy = (py) => (V.oy - py) / V.k;

let queued = false;
function invalidate() { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; draw(); }); } }

// ── drawing ────────────────────────────────────────────────────────────────────────────────────
const INK = '234,240,255', LIGHT = '#ffb13b';
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
    g.fillStyle = 'rgba(150,195,255,.2)'; g.fill();
    g.strokeStyle = 'rgba(205,228,255,.85)'; g.lineWidth = 1.5; g.lineJoin = 'round'; g.stroke();
  },
  match(o, lit) {
    g.strokeStyle = '#b89a6a'; g.lineWidth = Math.max(2, V.k * 1.1); g.lineCap = 'round';
    line(o.x + o.r, -o.r, o.x + o.r + 5, -19);
    const r = Math.max(3, V.k * o.r), cx = sx(o.x) + r, cy = sy(0);
    if (lit) { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * 9); gr.addColorStop(0, 'rgba(255,214,120,.95)'); gr.addColorStop(.25, 'rgba(255,140,40,.55)'); gr.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r * 9, 0, 7); g.fill(); }
    g.fillStyle = lit ? '#fff1c9' : '#e8553d'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
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
    g.fillStyle = 'rgba(135,146,184,.35)'; g.fillRect(sx(o.x), sy(o.h + 1.5), V.k * 3.5, V.k * (2 * o.h + 3));
    g.strokeStyle = lit ? '#6fe3a1' : '#e8553d'; g.lineWidth = 3; g.lineCap = 'butt'; line(o.x, -o.h, o.x, o.h);
  },
  tower(o, lit) {
    g.fillStyle = 'rgba(135,146,184,.3)'; g.fillRect(sx(o.x), sy(o.y1), V.k * o.w, V.k * o.y1);
    g.fillStyle = lit ? '#fff1c9' : '#e8553d'; g.fillRect(sx(o.x) - 1.5, sy(o.y1), V.k * o.w + 1.5, V.k * (o.y1 - o.y0));
    if (lit) { const cx = sx(o.x), cy = sy((o.y0 + o.y1) / 2), r = V.k * 26; const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(255,200,110,.6)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); }
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
  for (const o of b.items) if (o.t === 'axis' || o.t === 'ground' || o.t === 'rail' || o.t === 'post') ITEMS[o.t](o, lit);
  // the light, added up where rays overlap
  g.globalCompositeOperation = 'lighter'; g.strokeStyle = LIGHT; g.lineWidth = 1.4; g.lineJoin = 'round';
  for (const pass of ['absorbed', 'target']) {
    g.globalAlpha = pass === 'target' ? 0.85 : 0.4;
    g.beginPath();
    for (const p of paths) {
      if ((p.end === 'target') !== (pass === 'target')) continue;
      for (let i = 0; i < p.pts.length; i += 2) g[i ? 'lineTo' : 'moveTo'](sx(p.pts[i]), sy(p.pts[i + 1]));
    }
    g.stroke();
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  for (const o of b.items) if (!(o.t === 'axis' || o.t === 'ground' || o.t === 'rail' || o.t === 'post')) ITEMS[o.t](o, lit);
  // knobs: the things a finger can move
  for (const h of b.handles) for (const [kx, ky] of h.knobs) {
    const on = S.held && S.held.h.param === h.param;
    g.beginPath(); g.arc(sx(kx), sy(ky), on ? 8 : 6, 0, 7);
    g.fillStyle = `rgba(${INK},.2)`; g.fill();
    g.beginPath(); g.arc(sx(kx), sy(ky), on ? 5 : 4, 0, 7);
    g.fillStyle = `rgb(${INK})`; g.fill();
  }
  if (b.spot) inset(b.spot, m, lit);
}

// The spot the light makes on the target, magnified. On the axis of a round lens the spot is
// round: a ray that lands u from the centre stands for a ring of that radius.
function inset(spot, m, lit) {
  const wide = V.w >= 900, size = wide ? 132 : 92, x = wide ? V.box[2] - size : V.box[0], y = V.box[1];
  const half = spot.goal * 1.6, k = size / 2 / half, cx = x + size / 2, cy = y + size / 2;
  g.save();
  g.beginPath(); g.roundRect(x, y, size, size, 10); g.fillStyle = 'rgba(7,11,24,.8)'; g.fill();
  g.strokeStyle = `rgba(${INK},.25)`; g.lineWidth = 1; g.stroke(); g.clip();
  // Light per unit area against radius, in rings one pixel wide. Full brightness is what all the
  // light would give spread evenly over the goal circle; the square root compresses the rest so a
  // wide blur still shows.
  const n = Math.ceil(size * 0.72), bins = new Float64Array(n + 1);
  let tot = 0;
  for (let i = 0; i < m.hits.length; i += 2) { tot += m.hits[i + 1]; const r = Math.abs(m.hits[i]) * k; if (r < n) bins[Math.floor(r)] += m.hits[i + 1]; }
  for (let pass = 0; pass < 3; pass++) {            // the rays are a sample: smooth the gaps between them
    let prev = bins[0];
    for (let r = 0; r < n; r++) { const here = bins[r]; bins[r] = (prev + 2 * here + bins[r + 1]) / 4; prev = here; }
  }
  if (tot > 0) {
    const rg = spot.goal / 2 * k, gr = g.createRadialGradient(cx, cy, 0, cx, cy, n);
    for (let r = 0; r < n; r++) {
      const a = clamp(Math.sqrt(bins[r] / tot * rg * rg / (2 * r + 1)), 0, 1);
      gr.addColorStop((r + 0.5) / n, `rgba(255,190,90,${a.toFixed(3)})`);
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
  cv.classList.add('held'); hintOff(); invalidate();
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
  S.held = null; cv.classList.remove('held'); commit(); invalidate();
};
cv.addEventListener('pointerup', drop);
cv.addEventListener('pointercancel', drop);
cv.addEventListener('lostpointercapture', drop);

// ── start ──────────────────────────────────────────────────────────────────────────────────────
new ResizeObserver(invalidate).observe(cv);
new ResizeObserver(invalidate).observe($('panel'));
const fromHash = () => { const id = /(?:^|[#&])l=([a-z]+)/.exec(location.hash); return id ? Math.max(0, LEVELS.findIndex((l) => l.id === id[1])) : 0; };
window.addEventListener('hashchange', () => { const i = fromHash(); if (i !== S.i) go(i, true); });
go(fromHash(), true);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(invalidate);

// For tests: the state, and where things are on screen.
window.__optics = { S, LEVELS, solved, toScreen: (x, y) => [sx(x), sy(y)], update, commit };
