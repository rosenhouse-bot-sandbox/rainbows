// Rainbows v2: state, the fenced-in camera, the zoom between scales, and the controls.
import { createEngine, makeView, project, slerp, V, DEG, clamp, lerp, sstep } from './gl.js';
import * as O from './optics.js';
import orbit from './stages/orbit.js';
import sky from './stages/sky.js';
import rain from './stages/rain.js';
import drop, { eyeAngle } from './stages/drop.js';
import surface, { presetAngle } from './stages/surface.js';
import atoms from './stages/atoms.js';

const STAGES = [orbit, sky, rain, drop, surface, atoms];
const $ = id => document.getElementById(id);
const canvas = $('view');
const R = createEngine(canvas);

// Fonts load without holding up the 3D view; system fonts show until they arrive.
document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', referrerPolicy: 'no-referrer',
  href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@400;500&display=swap' }));

// People who ask for less motion get no camera drift and no flying zoom, and start paused.
const RM = matchMedia('(prefers-reduced-motion: reduce)');
let paused = RM.matches, lost = false;
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
canvas.addEventListener('webglcontextrestored', () => location.reload());      // the view is in the address bar, so a reload restores it

const S = {
  stage: 0, mode: 'ray', focus: 'both',
  sun: 14, bowpos: 0.5, exag: false, second: false,
  cross: 'enter', theta: 59.4, pol: 's', lambda: 550, tilt: 59.4,
};

// ---------- address bar ----------
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const st = STAGES.findIndex(s => s.id === q.get('s')); if (st >= 0) S.stage = st;
  if (['ray', 'wave'].includes(q.get('m'))) S.mode = q.get('m');
  if (['sun', 'both', 'eye'].includes(q.get('f'))) S.focus = q.get('f');
  if (['enter', 'back', 'exit', 'tir'].includes(q.get('x'))) { S.cross = q.get('x'); }
  const num = (k, a, b, d) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? clamp(v, a, b) : d; };
  S.sun = num('sun', 0, 50, S.sun); S.lambda = num('nm', 250, 700, S.lambda); S.bowpos = num('bow', -0.8, 1.6, S.bowpos);
  S.tilt = num('tilt', 0, 75, S.tilt);
  S.theta = q.has('a') ? num('a', 0, 85, S.theta) : presetAngle(S);
  if (q.get('p') === 'p') S.pol = 'p';
  S.exag = q.get('wide') === '1'; S.second = q.get('two') === '1';
}
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const q = new URLSearchParams({ s: STAGES[S.stage].id, m: S.mode, f: S.focus, sun: S.sun, nm: S.lambda });
    if (S.stage === 3) { q.set('bow', S.bowpos); if (S.exag) q.set('wide', 1); if (S.second) q.set('two', 1); }
    if (S.stage === 5) q.set('tilt', S.tilt);
    if (S.stage === 4) { q.set('x', S.cross); q.set('a', S.theta); q.set('p', S.pol); }
    history.replaceState(null, '', '#' + q);
  }, 300);
}

// ---------- cameras: one per stage, each with hard limits so you cannot get lost ----------
const cams = STAGES.map(s => ({ ...s.cam, gy: s.cam.yaw, gp: s.cam.pitch, gd: s.cam.dist }));
let cssW = 1, cssH = 1, offX = 0, offY = 0, wide = false;

// The resting camera of a stage, in that stage's own coordinates. Besides the usual view it carries
// the point it is looking at (tgt) and how far away that is (d).
function viewFor(i, time) {
  const st = STAGES[i], c = cams[i];
  const aspectFix = clamp(1.15 * cssH / (cssW * (1 - offX)), 1, 3);   // pull back when the free area is narrow
  const sway = RM.matches || paused ? 0 : Math.sin(time * 0.23 + i) * (c.sway ?? 0.035);
  const fov = c.fov * DEG;
  let v;
  if (c.type === 'look') {
    // stand at a fixed spot and turn your head; "dist" steps back out of your own eyes
    const yaw = c.yaw + sway, pitch = c.pitch, back = c.dist;
    const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const eye = V.add(c.eyePos, [-f[0] * back + 0.2 * back, 0.1 * back, -f[2] * back]);
    const fz = Math.min(2 * Math.atan(Math.tan(fov / 2) * aspectFix ** 0.5), 2.3);
    v = makeView(eye, f, fz, R.W, R.H, 0.05, 20000, offX, offY);
    v.d = 12; v.tgt = V.mad(eye, f, 12);
  } else {
    const tgt = typeof c.target === 'function' ? c.target(S) : c.target;
    const yaw = c.yaw + sway, d = c.dist * aspectFix;
    const dir = [Math.sin(yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(yaw) * Math.cos(c.pitch)];
    v = makeView(V.mad(tgt, dir, d), V.mul(dir, -1), fov, R.W, R.H, d * 0.02, d * 60 + 50, offX, offY);
    v.d = d; v.tgt = tgt;
  }
  v.fov = 2 * Math.atan(1 / v.p11);
  return v;
}
// A camera at any pose, for stage i, looking at something about d away.
function poseView(i, eye, f, up, fov, d) {
  const look = cams[i].type === 'look';
  return makeView(eye, f, fov, R.W, R.H, look ? Math.max(0.05, d * 0.004) : d * 0.02, look ? Math.max(20000, d * 60) : d * 60 + 50, offX, offY, up);
}

// ---------- transitions ----------
const inited = new Set();
function ready(i) { if (!inited.has(i)) { inited.add(i); STAGES[i].init(R, S); } }
let tr = null, queued = null, hopping = false;       // tr: {from, to, t}
const DIVE = 4.5;    // seconds for the move between scales
function go(to) {
  to = clamp(to, 0, STAGES.length - 1);
  if (tr) { queued = to; return; }      // remember a press made mid-flight and go there next
  if (to === S.stage) return;
  // a jump of several scales passes through each one in turn, more briskly
  const far = Math.abs(to - S.stage) > 1;
  if (far) { queued = to; to = S.stage + Math.sign(to - S.stage); }
  ready(to);
  // going deeper, set the next scene to match the thing being entered
  if (to === 3 && S.stage === 2) { const th = STAGES[2].embed(S).theta, a0 = O.bowAngle(O.nWater(400)), a1 = O.bowAngle(O.nWater(700)); S.bowpos = clamp((th - a0) / (a1 - a0), -0.8, 1.6); S.exag = false; }
  if (to === 5 && S.stage === 4 && S.cross === 'enter') S.tilt = Math.min(75, S.theta);
  // a bigger change of scale takes longer
  const hiS = Math.min(S.stage, to), M = STAGES[hiS].embed(S), span = Math.abs(Math.log(cams[hiS + 1].dist * M.s / cams[hiS].dist));
  tr = { from: S.stage, to, t: 0, dur: RM.matches ? 0.7 : (far || hopping ? 0.55 : 1) * clamp(DIVE + 0.3 * span, DIVE, 8.5) };
  hopping = far;
  $('labels').classList.add('off');
  $('cap').classList.add('swap');
  setTimeout(() => { S.stage = to; syncUI(); $('cap').classList.remove('swap'); }, tr.dur * 450);
}

// ---------- UI ----------
const nav = $('stages');
STAGES.forEach((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = `<i></i><span>${s.name}<span class="visually-hidden"> · ${s.scale}</span></span>`;
  b.addEventListener('click', () => go(i));
  nav.appendChild(b);
});
const segs = { focus: 'focus', mode: 'mode', cross: 'cross', pol: 'pol' };
for (const key in segs) document.querySelectorAll(`[data-${key}]`).forEach(b => b.addEventListener('click', () => {
  S[key] = b.dataset[key];
  if (key === 'cross') { S.theta = presetAngle(S); resetView(); }
  syncUI();
}));
const sliders = {
  sun: v => `${v.toFixed(1)}°`,
  bowpos: () => `${(eyeAngle(S) / DEG).toFixed(1)}°`,
  theta: v => `${v.toFixed(1)}°`,
  tilt: v => `${v.toFixed(1)}°`,
  lambda: v => `${Math.round(v)} nm`,
};
for (const id in sliders) $(id).addEventListener('input', e => { S[id] = parseFloat(e.target.value); syncUI(true); });
for (const id of ['exag', 'second']) $(id).addEventListener('change', e => { S[id] = e.target.checked; syncUI(); });
$('prev').addEventListener('click', () => go((tr ? tr.to : S.stage) - 1));
$('next').addEventListener('click', () => go((tr ? tr.to : S.stage) + 1));
$('resetView').addEventListener('click', resetView);
const setPaused = p => { paused = p; $('pause').textContent = p ? 'Play' : 'Pause'; };
$('pause').addEventListener('click', () => setPaused(!paused));
function resetView() { const c = cams[S.stage], st = STAGES[S.stage], d = st.camGoal ? st.camGoal(S) : st.cam; c.gy = d.yaw; c.gp = d.pitch; c.gd = d.dist; }

let lastCap = '';
function syncUI(light) {
  const st = STAGES[S.stage];
  $('lambda').min = st.lambdaMin ?? 400;
  S.lambda = clamp(S.lambda, st.lambdaMin ?? 400, 700);
  const lmin = +$('lambda').min;
  $('lambda').style.setProperty('--spec', lmin < 400
    ? `linear-gradient(90deg,#3a3350,#8a7cd0 ${(400 - lmin) / (700 - lmin) * 100 - 6}%,#7b2cff ${(400 - lmin) / (700 - lmin) * 100}%,#3b5bff,#00b0d8,#3ccf5a,#f2d41d,#ff7a1a,#e8202b)` : '');
  for (const id in sliders) {
    const el = $(id), txt = sliders[id](S[id]); el.value = S[id]; $(id + 'V').textContent = txt; el.setAttribute('aria-valuetext', txt);
    el.style.setProperty('--v', ((S[id] - el.min) / (el.max - el.min) * 100) + '%');
  }
  $('exag').checked = S.exag; $('second').checked = S.second;
  for (const key in segs) document.querySelectorAll(`[data-${key}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[key] === S[key])));
  document.querySelectorAll('.ctl').forEach(el => { el.hidden = !st.controls.includes(el.dataset.c); });
  [...nav.children].forEach((b, i) => b.setAttribute('aria-current', String(i === S.stage)));
  $('prev').setAttribute('aria-disabled', String(S.stage === 0)); $('next').setAttribute('aria-disabled', String(S.stage === STAGES.length - 1));
  $('scaleText').textContent = st.scaleNote || '';
  const cap = st.caption(S), ck = S.stage + cap.title + cap.body;
  if (ck !== lastCap) {       // the caption is a live region: only touch it when it really changes
    $('stageNo').textContent = `Scale ${S.stage + 1} of ${STAGES.length}`; $('stageScale').textContent = st.scale;
    $('capTitle').textContent = cap.title; $('capBody').textContent = cap.body; lastCap = ck;
    document.title = `${st.name} | Rainbows`;
  }
  $('readout').innerHTML = st.readout ? st.readout(S) : '';
  $('hint').textContent = wide ? (st.hint || 'Drag to look around · scroll to zoom') + ' · or arrow keys, + and −' : (st.hintSmall || 'Drag to look around · pinch to zoom');
  writeHash();
}

function layout() {
  cssW = window.innerWidth; cssH = window.innerHeight; wide = cssW >= 900;
  const pr = $('panel').getBoundingClientRect();
  offX = wide ? (pr.right + 8) / cssW : 0;
  offY = wide ? 0 : clamp((cssH - pr.top) / cssH, 0, 0.5) * 0.92;
}
window.addEventListener('resize', layout);
new ResizeObserver(layout).observe($('panel'));

// ---------- pointer, wheel and keyboard ----------
const ptrs = new Map(); let pinch = 0, touched = false;
const lim = () => STAGES[S.stage].cam.lim;
function nudge(dy, dp, dz) {
  const c = cams[S.stage], l = lim();
  c.gy = clamp(c.gy + dy, l.yaw[0], l.yaw[1]); c.gp = clamp(c.gp + dp, l.pitch[0], l.pitch[1]);
  c.gd = c.type === 'look' ? clamp((c.gd + 0.8) * dz - 0.8, l.dist[0], l.dist[1]) : clamp(c.gd * dz, l.dist[0], l.dist[1]);
  if (!touched) { touched = true; $('hint').classList.add('gone'); }
}
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
  const look = cams[S.stage].type === 'look';
  if (ptrs.size === 1) nudge((look ? 1 : -1) * dx * 0.005, (look ? -1 : 1) * dy * 0.005, 1);
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) nudge(0, 0, pinch / d); pinch = d;
  }
});
const up = e => { ptrs.delete(e.pointerId); pinch = 0; };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
canvas.addEventListener('wheel', e => { e.preventDefault(); nudge(0, 0, Math.exp(clamp(e.deltaY, -120, 120) * 0.0018)); }, { passive: false });
canvas.addEventListener('dblclick', resetView);
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;      // leave browser zoom and shortcuts alone
  const k = e.key;
  if (k === 'PageDown' || k === ']') go(S.stage + 1);
  else if (k === 'PageUp' || k === '[') go(S.stage - 1);
  else if (document.activeElement === canvas || document.activeElement === document.body) {
    if (k === 'ArrowLeft') nudge(-0.08, 0, 1); else if (k === 'ArrowRight') nudge(0.08, 0, 1);
    else if (k === 'ArrowUp') nudge(0, 0.06, 1); else if (k === 'ArrowDown') nudge(0, -0.06, 1);
    else if (k === '+' || k === '=') nudge(0, 0, 0.9); else if (k === '-') nudge(0, 0, 1.1);
    else if (k === '0') resetView(); else return;
    e.preventDefault();
  }
});

// ---------- labels ----------
const labelBox = $('labels'), tagPool = [];
function drawLabels(list, view) {
  let n = 0;
  for (const L of list) {
    const s = project(view, L.p, cssW, cssH);
    if (!s || s[0] < -40 || s[0] > cssW + 40 || s[1] < 30 || s[1] > cssH) continue;
    if (wide ? s[0] < offX * cssW - 20 : s[1] > cssH * (1 - offY / 0.92) - 8) continue;      // under the panel
    let el = tagPool[n];
    if (!el) { el = document.createElement('div'); el.appendChild(document.createElement('span')); labelBox.appendChild(el); tagPool.push(el); }
    const cls = 'tag ' + (L.cls || '');
    if (el.className !== cls) el.className = cls;
    if (el.firstChild.textContent !== L.text) el.firstChild.textContent = L.text;
    el.style.transform = `translate(${s[0].toFixed(1)}px,${s[1].toFixed(1)}px) translate(0,-50%)`;
    el.style.display = ''; n++;
  }
  for (let i = n; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

// ---------- frame loop ----------
const dbg = {};       // test hook: dbg.hold freezes a transition at a given point
let last = 0, time = 0, scale = 1, slow = 0, fast = 0, readoutClock = 0;
const dprCap = () => Math.min(window.devicePixelRatio || 1, 2);
function frame(now) {
  requestAnimationFrame(frame);
  if (lost) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016), raw = now - last; last = now;
  if (!paused) time += dt;
  // keep the frame rate: draw fewer pixels on slow machines
  if (raw > 30) { if (++slow > 20 && scale > 0.5) { scale = Math.max(0.5, scale * 0.85); slow = 0; } fast = 0; }
  else if (raw < 18) { slow = 0; if (++fast > 240 && scale < 1) { scale = Math.min(1, scale / 0.85); fast = 0; } }
  R.resize(cssW, cssH, dprCap(), scale);

  for (const c of cams) { const k = 1 - Math.exp(-dt * 9); c.yaw += (c.gy - c.yaw) * k; c.pitch += (c.gp - c.pitch) * k; c.dist += (c.gd - c.dist) * k; }

  let mix = 0, labelView;
  if (tr) {
    // The move between two scales is one camera flight through one world, played forward to go deeper
    // and backward to come out. The deeper scene sits inside the shallower one at its true place, size
    // and orientation (each stage's embed), so both are drawn from the same camera and line up. The
    // camera's distance to where it is going shrinks at a steady rate; the deeper scene shows through
    // a soft round opening exactly as big as it appears from that distance.
    const still = RM.matches;         // reduced motion: a plain cross-fade in place of the flight
    tr.t = Math.min(1, tr.t + dt / tr.dur);
    const p = dbg.hold ?? tr.t, deeper = tr.to > tr.from, hi = Math.min(tr.from, tr.to), lo = hi + 1;
    const q = deeper ? p : 1 - p, E = q * q * q * (q * (q * 6 - 15) + 10);      // progress toward the deeper scale
    const vA = viewFor(hi, time), vB = viewFor(lo, time);
    let hole, vHi = vA, vLo = vB;
    if (still) hole = { c: [0.5, 0.5], r: 9, alpha: 1, floor: sstep(0, 1, q), soft: 0.3 };
    else {
      const M = tr.M = STAGES[hi].embed(S);
      const out = a => V.add(M.o, V.mul(turn(M, a), M.s)), turn = (m, a) => [m.X[0] * a[0] + m.Y[0] * a[1] + m.Z[0] * a[2], m.X[1] * a[0] + m.Y[1] * a[1] + m.Z[1] * a[2], m.X[2] * a[0] + m.Y[2] * a[1] + m.Z[2] * a[2]];
      const back = a => [V.dot(a, M.X), V.dot(a, M.Y), V.dot(a, M.Z)];
      // where the deeper camera rests, in the shallower scene's coordinates
      const tB = out(vB.tgt), eyeB = out(vB.eye), dB = vB.d * M.s, rhoA = V.len(V.sub(vA.eye, tB));
      const rho = Math.exp(lerp(Math.log(rhoA), Math.log(dB), E));
      tr.rushy = clamp(Math.abs(Math.log(rhoA / dB)) / 4 - 0.25, 0, 1);      // no speed smear when the scale hardly changes
      const eye = V.mad(tB, slerp(V.norm(V.sub(vA.eye, tB)), V.norm(V.sub(eyeB, tB)), E), rho);
      const f = slerp(vA.f, V.norm(V.sub(tB, eye)), sstep(0, 0.4, E));
      const up = V.norm(V.lerp(vA.u, turn(M, vB.u), sstep(0.15, 0.85, E)));
      const fov = 2 * Math.atan(lerp(Math.tan(vA.fov / 2), Math.tan(vB.fov / 2), E));
      vHi = poseView(hi, eye, f, up, fov, rho);
      vLo = poseView(lo, V.mul(back(V.sub(eye, M.o)), 1 / M.s), back(f), back(up), fov, rho / M.s);
      const sp = project(vHi, tB, 1, 1) || [0.5 + offX / 2, 0.5 - offY / 2];
      const size = (STAGES[lo].extent ? STAGES[lo].extent * M.s : dB) / rho;      // 1 when the deeper scene fills its usual frame
      hole = { c: [sp[0], 1 - sp[1]], r: Math.min(9, 1.25 * size), alpha: sstep(0.03, 0.45, E), floor: sstep(0.82, 1, E), soft: 0.6 };
    }
    mix = sstep(0.3, 0.8, E);
    const rush = still ? 0 : Math.sin(Math.PI * p) ** 2;
    R.begin(0, vHi, 1); STAGES[hi].draw(R, S, time, dt);
    R.begin(1, vLo, 1); STAGES[lo].draw(R, S, time, dt);
    labelView = deeper ? vLo : vHi;
    const a = STAGES[hi], b = STAGES[lo];
    R.present(hole, time, lerp(a.bloom, b.bloom, mix) * (1 + 0.2 * rush), lerp(a.exposure, b.exposure, mix), 0.04 * rush * (tr.rushy ?? 0));
    if (tr.t >= 1) {
      const done = tr.to; tr = null; S.stage = done;
      if (queued !== null && queued !== done) { const q = queued; queued = null; go(q); } else { queued = null; hopping = false; $('labels').classList.remove('off'); }
    }
  } else {
    labelView = viewFor(S.stage, time);
    R.begin(0, labelView, 1); STAGES[S.stage].draw(R, S, time, dt);
    R.present(null, time, STAGES[S.stage].bloom, STAGES[S.stage].exposure);
  }
  const st = STAGES[tr ? tr.to : S.stage];
  drawLabels(st.labels ? st.labels(S, labelView) : [], labelView);
  if (st.liveReadout && (readoutClock += dt) > 0.25 && !tr) { readoutClock = 0; $('readout').innerHTML = st.readout(S); }
}

if (!R) { $('fail').hidden = false; }
else {
  try {
    readHash();
    ready(S.stage);
    STAGES.forEach((st, i) => { if (st.camGoal) { const g = st.camGoal(S), c = cams[i]; c.yaw = c.gy = g.yaw; c.pitch = c.gp = g.pitch; c.dist = c.gd = g.dist; } });
    layout(); syncUI(); setPaused(paused);
    window.addEventListener('hashchange', () => { const was = S.stage; readHash(); const to = S.stage; S.stage = was; syncUI(); go(to); });
    requestAnimationFrame(frame);
    // compile the other scales one at a time, between frames, so start-up is not one long task
    const yieldToMain = () => globalThis.scheduler?.yield ? scheduler.yield() : new Promise(r => setTimeout(r, 0));
    (async () => { for (let i = 0; i < STAGES.length; i++) { await yieldToMain(); ready(i); } })().catch(console.error);
    window.__rainbows = { S, go, syncUI, cams, R, dbg, get busy() { return !!tr; } };
  } catch (err) {
    console.error(err);
    $('fail').hidden = false;
    $('fail').querySelector('p').textContent = 'The 3D view could not start on this device (' + String(err.message || err).split('\n')[0] + ').';
  }
}
