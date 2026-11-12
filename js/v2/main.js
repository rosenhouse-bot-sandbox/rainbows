// Rainbows v2: state, the fenced-in camera, the zoom between scales, and the controls.
import { createEngine, makeView, project, slerp, V, DEG, clamp, lerp, sstep } from './gl.js';
import * as O from './optics.js';
import orbit from './stages/orbit.js';
import rain from './stages/rain.js';
import drop, { eyeAngle, bowTrack, crossAngle, CROSSINGS } from './stages/drop.js';
import surface, { presetAngle, maxAngle } from './stages/surface.js';
import atoms from './stages/atoms.js';

const STAGES = [orbit, rain, drop, surface, atoms];
const RAIN = STAGES.indexOf(rain), DROP = STAGES.indexOf(drop), SURFACE = STAGES.indexOf(surface), ATOMS = STAGES.indexOf(atoms);
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

// What is drawn: the same state, except that the colour glides to the slider's value over a few
// frames, so a jump of the slider is a fade and not a cut. Text and the address bar use S itself.
let D = null;
const S = {
  stage: 0, mode: 'ray', focus: 'both',
  sun: 14, bowpos: 0.5, exag: false, second: false,
  cross: 'enter', theta: 59.4, pol: 's', lambda: 550, tilt: 59.4, bfield: false,
};

// ---------- address bar ----------
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const st = STAGES.findIndex(s => s.id === q.get('s') || s.aliases?.includes(q.get('s'))); if (st >= 0) S.stage = st;      // aliases: links made when a scale had another name
  if (['ray', 'wave'].includes(q.get('m'))) S.mode = q.get('m');
  if (['sun', 'both', 'eye'].includes(q.get('f'))) S.focus = q.get('f');
  if (CROSSINGS.includes(q.get('x'))) { S.cross = q.get('x'); }
  const num = (k, a, b, d) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? clamp(v, a, b) : d; };
  S.sun = num('sun', 0, 50, S.sun); S.lambda = num('nm', 250, 700, S.lambda); S.bowpos = num('bow', -0.8, 1.6, S.bowpos);
  S.tilt = num('tilt', 0, 75, S.tilt);
  S.theta = q.has('a') ? num('a', 0, maxAngle(S), presetAngle(S)) : presetAngle(S);
  if (q.get('p') === 'p') S.pol = 'p';
  S.exag = q.get('wide') === '1'; S.second = q.get('two') === '1'; S.bfield = q.get('b') === '1';
}
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const q = new URLSearchParams({ s: STAGES[S.stage].id, m: S.mode, f: S.focus, sun: S.sun, nm: S.lambda });
    if (S.stage === DROP) { q.set('bow', S.bowpos); if (S.exag) q.set('wide', 1); if (S.second) q.set('two', 1); }
    if (S.stage === ATOMS) { q.set('tilt', S.tilt); if (S.bfield) q.set('b', 1); }
    if (S.stage === SURFACE || S.stage === ATOMS) { q.set('x', S.cross); q.set('a', S.theta); q.set('p', S.pol); }      // (the Molecules scale keeps what the Surface above it was set to)
    history.replaceState(null, '', '#' + q);
  }, 300);
}

// ---------- cameras: one per stage, each with hard limits so you cannot get lost ----------
const cams = STAGES.map(s => ({ ...s.cam, gy: s.cam.yaw, gp: s.cam.pitch, gd: s.cam.dist }));
let cssW = 1, cssH = 1, offX = 0, offY = 0, wide = false;
let offXg = null, offYg = 0;       // where the optical centre is heading: it glides there when the panel changes size

// The resting camera of a stage, in that stage's own coordinates. Besides the usual view it carries
// the point it is looking at (tgt) and how far away that is (d).
function viewFor(i, time) {
  const st = STAGES[i], c = cams[i];
  const aspectFix = clamp(1.15 * cssH / (cssW * (1 - offX)), 1, 3);   // pull back when the free area is narrow
  const sway = RM.matches || paused ? 0 : Math.sin(time * 0.23 + (i === ATOMS ? SURFACE : i)) * (c.sway ?? 0.035);      // (Molecules drifts in step with Surface: one camera)
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
    // a narrow screen backs the camera off; a scene with the whole sky in it (widen) opens its lens out instead
    const yaw = c.yaw + sway, d = c.dist * (c.widen ? 1 : aspectFix), fo = c.widen ? Math.min(2 * Math.atan(Math.tan(fov / 2) * aspectFix ** 0.5), 2.3) : fov;
    const pitch = c.minY == null ? c.pitch : Math.max(c.pitch, Math.asin(clamp((c.minY - tgt[1]) / d, -1, 1)));      // never below the ground
    // A stage may be drawn in axes that are tilted in the world (the Surface scale's follow the drop's
    // skin): its camera is still set in the world's, so it stays upright, and is then turned into them.
    const turn = st.camFrame ? st.camFrame(S) : a => a;
    const dir = turn([Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]);
    v = makeView(V.mad(tgt, dir, d), V.mul(dir, -1), fo, R.W, R.H, d * 0.02, d * 60 + 50, offX, offY, turn([0, 1, 0]));
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
// A flight is between two neighbouring scales, hi and hi + 1. tr.q is how far along it the camera is
// (0 at the shallower scale, 1 at the deeper one), tr.dir which way it is heading and tr.v how fast q
// is changing. Everything drawn mid-flight depends on q alone, so a flight can turn round anywhere.
let tr = null, queued = null, hopping = false;       // tr: {hi, q, dir, v, dur}
const DIVE = 4.5;    // seconds for the move between scales
const TURN = 0.3;    // seconds, roughly, to slow down and set off the other way
// Changing which crossing the Surface scale shows is a flight too: out along the same path until the
// whole drop is in view, round the drop to the new crossing, and back in. `phi` is where round the
// drop the Surface scene sits just now; it follows S.cross, moving only while the camera is far out.
let phi = null;
const HOP = 2.8;     // seconds a crossing hop would take to fly the whole way between the two scales
const HOP_OUT = 0.24;      // how far out it goes (as tr.q): the drop fills about a third of the view
const dest = () => tr ? tr.hi + (tr.dir > 0 ? 1 : 0) : S.stage;      // the scale the camera is flying to
const heading = () => queued ?? dest();                               // the scale it will end up at
function go(to) {
  to = clamp(to, 0, STAGES.length - 1);
  if (tr) {
    // A press made mid-flight. Back the way we came: slow, stop and reverse from right here.
    // Further on: finish this flight and carry on from there.
    if ((to - dest()) * tr.dir < 0) { tr.dir = -tr.dir; tr.rev = true; tr.capWait = 0.25; }
    queued = to === dest() ? null : to;
    syncNav();
    return;
  }
  if (to === S.stage) return;
  // a jump of several scales passes through each one in turn, more briskly
  const far = Math.abs(to - S.stage) > 1;
  if (far) { queued = to; to = S.stage + Math.sign(to - S.stage); }
  ready(to);
  // going deeper, set the next scene to match the thing being entered
  if (to === ATOMS && S.stage === SURFACE && S.cross === 'enter') S.tilt = Math.min(75, S.theta);
  // The Surface and Molecules scales are one place seen from one direction: the camera keeps the way
  // it is facing from the one to the other, so the flight between them is straight in or out, with no turn.
  if ((to === ATOMS && S.stage === SURFACE) || (to === SURFACE && S.stage === ATOMS)) {
    const a = cams[S.stage], b = cams[to], l = STAGES[to].cam.lim;
    b.yaw = b.gy = clamp(a.gy, l.yaw[0], l.yaw[1]); b.pitch = b.gp = clamp(a.gp, l.pitch[0], l.pitch[1]);
  }
  // a bigger change of scale takes longer
  const hiS = Math.min(S.stage, to), M = STAGES[hiS].embed(S), span = Math.abs(Math.log(cams[hiS + 1].dist * M.s / cams[hiS].dist));
  const dir = to > S.stage ? 1 : -1, dur = RM.matches ? 0.7 : (far || hopping ? 0.55 : 1) * clamp(DIVE + 0.3 * span, DIVE, 8.5);
  tr = { hi: hiS, q: dir > 0 ? 0 : 1, dir, v: dir / dur, dur, capWait: 0 };
  // the marked drop keeps falling during the flight: set the Drop scene to where it will be on arrival
  if (to === DROP && S.stage === RAIN) { tr.was = { bowpos: S.bowpos, exag: S.exag }; const th = STAGES[RAIN].embed(S, paused ? 0 : tr.dur).theta, a0 = O.bowAngle(O.nWater(400)), a1 = O.bowAngle(O.nWater(700)); S.bowpos = clamp((th - a0) / (a1 - a0), -0.8, 1.6); S.exag = false; tr.fromRain = true; }
  hopping = far;
  $('labels').classList.add('off');
  syncNav();
}
// Zoom in and Zoom out step from where the camera will end up, so a second press mid-flight means "one
// more", and the opposite press takes the last one back.
const step = d => go(heading() + d);
function syncNav() {
  const h = heading();
  $('prev').setAttribute('aria-disabled', String(h === 0)); $('next').setAttribute('aria-disabled', String(h === STAGES.length - 1));
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
  if (key === 'cross') S.theta = presetAngle(S);      // the camera keeps its own angle on the surface
  syncUI();
}));
const sliders = {
  sun: v => `${v.toFixed(1)}°`,
  bowpos: () => `${(eyeAngle(S) / DEG).toFixed(1)}°`,
  theta: v => `${v.toFixed(1)}°`,
  tilt: v => `${v.toFixed(1)}°`,
  lambda: v => `${Math.round(v)} nm`,
};
$('bowpos').style.setProperty('--spec', bowTrack(+$('bowpos').min, +$('bowpos').max));
for (const id in sliders) $(id).addEventListener('input', e => { S[id] = parseFloat(e.target.value); syncUI(true); });
// While a slider is held, the words above it stay as they are: a caption that changed length mid-drag
// would move the slider out from under the pointer. They catch up on release. (The keyboard is not a hold.)
let held = false;
const letGo = () => { if (held) { held = false; syncUI(); } };
for (const id in sliders) { $(id).addEventListener('pointerdown', () => { held = true; }); $(id).addEventListener('change', letGo); }
window.addEventListener('pointerup', letGo); window.addEventListener('pointercancel', letGo);
for (const id of ['exag', 'second', 'bfield']) $(id).addEventListener('change', e => { S[id] = e.target.checked; syncUI(); });
$('prev').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));
$('resetView').addEventListener('click', resetView);
const setPaused = p => { paused = p; $('pause').textContent = p ? 'Play' : 'Pause'; };
$('pause').addEventListener('click', () => setPaused(!paused));
function resetView() { const c = cams[S.stage], d = STAGES[S.stage].cam; c.gy = d.yaw; c.gp = d.pitch; c.gd = d.dist; }

let lastCap = '';
// The caption keeps the height of the longest thing it can say at this scale, so that a press which
// changes the words never moves the controls under it out from under the pointer. Every setting of
// the buttons and tick boxes is tried, and each slider along its travel, in a hidden copy.
let capKey = '', fontsIn = 0;
function reserveCaption(st) {
  const cap = $('cap'), w = cap.clientWidth, key = [S.stage, w, fontsIn].join();
  if (key === capKey || !w) return;
  capKey = key;
  const groups = [], texts = new Map();
  for (const k in segs) if (st.controls.includes(k)) groups.push([k, [...new Set([...document.querySelectorAll(`[data-${k}]`)].map(b => b.dataset[k]))]]);
  for (const k of ['exag', 'second', 'bfield']) if (st.controls.includes(k)) groups.push([k, [false, true]]);
  const add = o => { const c = st.caption(Object.assign(Object.create(S), o)); texts.set(c.title + '\n' + c.body, c); };
  const walk = (i, o) => { if (i === groups.length) return add(o); for (const v of groups[i][1]) walk(i + 1, { ...o, [groups[i][0]]: v }); };
  walk(0, {});
  for (const id in sliders) if (st.controls.includes(id)) { const el = $(id); for (let j = 0; j <= 8; j++) add({ [id]: +el.min + (el.max - el.min) * j / 8 }); }
  const probe = cap.cloneNode(true);
  for (const el of [probe, ...probe.querySelectorAll('[id]')]) el.removeAttribute('id');
  probe.removeAttribute('aria-live'); probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;min-height:0;width:${w}px`;
  $('panel').appendChild(probe);
  const t = probe.querySelector('h2'), b = probe.querySelector('p'); let h = 0;
  for (const c of texts.values()) { t.textContent = c.title; b.textContent = c.body; h = Math.max(h, probe.offsetHeight); }
  probe.remove();
  cap.style.minHeight = h + 'px';
}
document.fonts?.addEventListener?.('loadingdone', () => { fontsIn++; if (R) syncUI(); });
// The numbers under the controls never shrink while a scale is on show: a row that wraps or a line
// that comes and goes would otherwise resize the panel, and on a phone move everything in it.
let roKey = '', roMin = 0;
$('readout').addEventListener('toggle', () => { roMin = 0; holdReadout(); }, true);      // opening or closing a section is a change of size that was asked for
function holdReadout() {
  const ro = $('readout'), key = [S.stage, ro.clientWidth].join();
  if (key !== roKey) { roKey = key; roMin = 0; }
  ro.style.minHeight = '';
  roMin = Math.max(roMin, ro.offsetHeight);
  ro.style.minHeight = roMin ? roMin + 'px' : '';
}
function syncUI(light) {
  const st = STAGES[S.stage];
  $('lambda').min = st.lambdaMin ?? 400;
  $('theta').max = maxAngle(S); S.theta = Math.min(S.theta, maxAngle(S));
  S.lambda = clamp(S.lambda, st.lambdaMin ?? 400, 700);
  const lmin = +$('lambda').min;
  $('lambda').style.setProperty('--spec', lmin < 400
    ? `linear-gradient(90deg,#3a3350,#8a7cd0 ${(400 - lmin) / (700 - lmin) * 100 - 6}%,#7b2cff ${(400 - lmin) / (700 - lmin) * 100}%,#3b5bff,#00b0d8,#3ccf5a,#f2d41d,#ff7a1a,#e8202b)` : '');
  for (const id in sliders) {
    const el = $(id), txt = sliders[id](S[id]); el.value = S[id]; $(id + 'V').textContent = txt; el.setAttribute('aria-valuetext', txt);
    el.style.setProperty('--v', ((S[id] - el.min) / (el.max - el.min) * 100) + '%');
  }
  $('exag').checked = S.exag; $('second').checked = S.second; $('bfield').checked = S.bfield;
  for (const key in segs) document.querySelectorAll(`[data-${key}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[key] === S[key])));
  document.querySelectorAll('.ctl').forEach(el => { el.hidden = !st.controls.includes(el.dataset.c); });
  [...nav.children].forEach((b, i) => b.setAttribute('aria-current', String(i === S.stage)));
  syncNav();
  $('scaleText').textContent = st.scaleNote || '';
  reserveCaption(st);
  const cap = st.caption(S), ck = S.stage + cap.title + cap.body;
  if (ck !== lastCap && !held) {       // the caption is a live region: only touch it when it really changes
    $('stageNo').textContent = `Scale ${S.stage + 1} of ${STAGES.length}`; $('stageScale').textContent = st.scale;
    $('capTitle').textContent = cap.title; $('capBody').textContent = cap.body; lastCap = ck;
    document.title = `${st.name} | Rainbows`;
  }
  const open = [...$('readout').querySelectorAll('details[open]')].map(d => d.dataset.k);      // rebuilt below: keep what was opened
  $('readout').innerHTML = st.readout ? st.readout(S) : '';
  for (const d of $('readout').querySelectorAll('details')) d.open = open.includes(d.dataset.k);
  holdReadout();
  $('hint').textContent = wide ? (st.hint || 'Drag to look around · scroll to zoom') + ' · or arrow keys, + and −' : (st.hintSmall || 'Drag to look around · pinch to zoom');
  writeHash();
}

function layout() {
  const was = wide;
  cssW = window.innerWidth; cssH = window.innerHeight; wide = cssW >= 900;
  const pr = $('panel').getBoundingClientRect();
  const first = offXg === null;
  offXg = wide ? (pr.right + 8) / cssW : 0;
  offYg = wide ? 0 : clamp((cssH - pr.top) / cssH, 0, 0.5) * 0.92;
  if (first || RM.matches || was !== wide) { offX = offXg; offY = offYg; }
  if (R && inited.size) reserveCaption(STAGES[S.stage]);      // the caption's width may have changed
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
  if (k === 'PageDown' || k === ']') step(1);
  else if (k === 'PageUp' || k === '[') step(-1);
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
    if (L.color && el.dataset.c !== L.color) { el.dataset.c = L.color; el.style.setProperty('--c', L.color); }
    el.style.transform = `translate(${s[0].toFixed(1)}px,${s[1].toFixed(1)}px) translate(0,-50%)`;
    el.style.display = ''; n++;
  }
  for (let i = n; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

// ---------- frame loop ----------
// Test hooks. dbg.hold freezes a transition at a given point along its direction of travel. dbg.dt
// replaces the clock: each frame then advances by dbg.dt seconds while dbg.steps lasts, and not at all after.
const dbg = {};
let last = 0, time = 0, scale = 1, slow = 0, fast = 0, readoutClock = 0;
const dprCap = () => Math.min(window.devicePixelRatio || 1, 2);
function frame(now) {
  requestAnimationFrame(frame);
  if (lost) return;
  const dt = dbg.dt != null ? (dbg.steps-- > 0 ? dbg.dt : 0) : Math.min(0.05, (now - last) / 1000 || 0.016), raw = now - last; last = now;
  if (!paused) time += dt;
  // keep the frame rate: draw fewer pixels on slow machines
  if (raw > 30) { if (++slow > 20 && scale > 0.5) { scale = Math.max(0.5, scale * 0.85); slow = 0; } fast = 0; }
  else if (raw < 18) { slow = 0; if (++fast > 240 && scale < 1) { scale = Math.min(1, scale / 0.85); fast = 0; } }
  R.resize(cssW, cssH, dprCap(), scale);

  D ??= Object.assign(Object.create(S), { lambda: S.lambda, cross: S.cross, theta: S.theta });
  // ---- which crossing the Surface scale is at ----
  {
    const goal = crossAngle(S.cross), near3 = tr?.hi === DROP;
    phi ??= goal;
    if (RM.matches || !(near3 || (!tr && S.stage === SURFACE))) phi = goal;       // nothing to fly: change over at once
    const gap = goal - phi, far = Math.abs(gap) > 0.12;
    if (far && !tr) { ready(DROP); tr = { hi: DROP, q: 1, dir: 1, v: 0, dur: HOP, capWait: 0, hop: true }; $('labels').classList.add('off'); }
    else if (far && near3 && tr.dir > 0) tr.hop = true;       // already flying in: go back out and round first
    if (tr?.hop) tr.out = far;
    if (gap) {
      // round the drop while the camera is far out; the last little way is too small to see from anywhere
      const go = far ? 1 - sstep(HOP_OUT + 0.05, HOP_OUT + 0.3, tr.q) : 1;
      const step = Math.sign(gap) * Math.min(Math.abs(gap), go * dt * Math.min(1.9, 0.25 + 4.5 * Math.abs(gap)));
      phi = Math.abs(gap) < 1e-4 ? goal : phi + step;
    }
    S.crossPhi = phi;
    // The scene drawn is the crossing the camera is nearest, so it changes over while far too small to see.
    const at = CROSSINGS.reduce((b, c) => Math.abs(crossAngle(c) - phi) < Math.abs(crossAngle(b) - phi) ? c : b);
    if (at === S.cross) { D.cross = at; D.theta = S.theta; }
    else if (at !== D.cross) { D.cross = at; D.theta = presetAngle(D); }
  }
  { const gap = S.lambda - D.lambda; D.lambda = RM.matches || Math.abs(gap) < 0.05 ? S.lambda : D.lambda + gap * (1 - Math.exp(-dt * 9)); }
  if (offXg !== null) { const k = 1 - Math.exp(-dt * 5); offX += (offXg - offX) * k; offY += (offYg - offY) * k; }
  for (const c of cams) { const k = 1 - Math.exp(-dt * 9); c.yaw += (c.gy - c.yaw) * k; c.pitch += (c.gp - c.pitch) * k; c.dist += (c.gd - c.dist) * k; }

  let mix = 0, labelView;
  if (tr) {
    // The move between two scales is one camera flight through one world, played forward to go deeper
    // and backward to come out, and able to turn round part-way: the speed along it eases over to the
    // new direction, so the camera slows, stops and sets off back from where it is. The deeper scene sits inside the shallower one at its true place, size
    // and orientation (each stage's embed), so both are drawn from the same camera and line up. The
    // camera's distance to where it is going shrinks at a steady rate; the deeper scene shows through
    // a soft round opening exactly as big as it appears from that distance.
    const still = RM.matches;         // reduced motion: a plain cross-fade in place of the flight
    // A crossing hop heads out, easing to a stop at HOP_OUT, until the scene has gone round the drop.
    if (tr.hop && tr.dir < 0) tr.hop = false;       // Zoom out pressed part-way: carry on out to the Drop scale
    const want = (tr.hop && tr.out ? -clamp((tr.q - HOP_OUT) / 0.15, -1, 1) : tr.dir) / tr.dur;
    tr.v = still ? want : want + (tr.v - want) * Math.exp(-dt / TURN);
    tr.q = clamp(tr.q + tr.v * dt, 0, 1);
    const deeper = tr.dir > 0, hi = tr.hi, lo = hi + 1;
    const q = dbg.hold != null ? (deeper ? dbg.hold : 1 - dbg.hold) : tr.q, E = q * q * q * (q * (q * 6 - 15) + 10);      // progress toward the deeper scale
    // The words change over a little before half-way to wherever the camera is now heading.
    tr.capWait = Math.max(0, tr.capWait - dt);
    const to = dest(), show = (deeper ? q : 1 - q) >= 0.45 ? to : 2 * hi + 1 - to;
    if (show !== S.stage && !tr.capWait && !tr.hop) { S.stage = show; syncUI(); }
    // (its text and controls fade out just before that, and back in after: the panel keeps the flight's time)
    $('panel').classList.toggle('swap', !tr.hop && S.stage !== to && (deeper ? q : 1 - q) >= 0.45 - 0.4 / tr.dur);
    // After a turn-round on the way into a marked drop, the drop has fallen further than first planned:
    // ease the Drop scene to where it will now be on arrival.
    if (tr.fromRain && tr.rev && deeper && !still) {
      const th = STAGES[RAIN].embed(S, paused ? 0 : (1 - tr.q) * tr.dur).theta, a0 = O.bowAngle(O.nWater(400)), a1 = O.bowAngle(O.nWater(700));
      S.bowpos += (clamp((th - a0) / (a1 - a0), -0.8, 1.6) - S.bowpos) * (1 - Math.exp(-dt * 6));
    }
    const vA = viewFor(hi, time), vB = viewFor(lo, time);
    let hole, vHi = vA, vLo = vB;
    if (still) hole = { c: [0.5, 0.5], r: 9, alpha: 0, floor: sstep(0, 1, q), soft: 0.3 };      // (no opening at all: with one, the deeper scene showed at full strength from the first frame, a cut and not a fade)
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
    const rush = still ? 0 : Math.sin(Math.PI * q) ** 2 * Math.min(1, Math.abs(tr.v) * tr.dur);      // none while stopped to turn round
    // Scenes that are light on a dark ground (the drop and below) are laid over the scene they sit in:
    // their light adds to it through the opening, and only as `cover` rises does the larger scene give
    // way to the smaller one's own backdrop: late, once the opening has grown past the edges of the
    // screen. So there is never a dark disc with something inside it.
    hole.cover = still || !STAGES[lo].overlay ? 1 : sstep(0.7, 1, E);
    // R.zoom tells both scenes how far the flight between them has gone, so each can ease out what only
    // it shows and the two can agree on what they share.
    R.zoom = { k: E, pair: hi, from: STAGES[hi].id, lo: false, cover: hole.cover };
    R.begin(0, vHi, 1); STAGES[hi].draw(R, D, time, dt);
    R.zoom = { k: E, pair: hi, from: STAGES[hi].id, lo: true, cover: hole.cover };
    R.dive = still ? null : { k: E, M: tr.M };      // lets the deeper scene bring its own detail in gradually
    R.begin(1, vLo, 1); STAGES[lo].draw(R, D, time, dt); R.dive = null; R.zoom = null;
    labelView = S.stage === hi ? vHi : vLo;      // labels stay with the scale the panel is showing, and change over with it, unseen
    const a = STAGES[hi], b = STAGES[lo];
    R.present(hole, time, lerp(a.bloom, b.bloom, mix) * (1 + 0.2 * rush), lerp(a.exposure, b.exposure, mix), 0.04 * rush * (tr.rushy ?? 0));
    if (deeper ? tr.q >= 1 && !(tr.hop && tr.out) : tr.q <= 0) {
      const done = to;
      if (tr.was && done === RAIN) Object.assign(S, tr.was);      // turned back before reaching the drop: nothing about it was changed
      tr = null; S.stage = done; syncUI(); $('panel').classList.remove('swap');
      if (queued !== null && queued !== done) { const q = queued; queued = null; go(q); } else { queued = null; hopping = false; $('labels').classList.remove('off'); }
    }
  } else {
    labelView = viewFor(S.stage, time);
    R.begin(0, labelView, 1); STAGES[S.stage].draw(R, D, time, dt);
    R.present(null, time, STAGES[S.stage].bloom, STAGES[S.stage].exposure);
  }
  const st = STAGES[S.stage];
  drawLabels(st.labels ? st.labels(D, labelView) : [], labelView);
  if (st.liveReadout && (readoutClock += dt) > 0.25 && !tr) { readoutClock = 0; $('readout').innerHTML = st.readout(S); holdReadout(); }
}

if (!R) { $('fail').hidden = false; }
else {
  try {
    readHash();
    ready(S.stage);
    layout(); syncUI(); setPaused(paused);
    window.addEventListener('hashchange', () => { const was = S.stage; readHash(); const to = S.stage; S.stage = was; syncUI(); go(to); });
    requestAnimationFrame(frame);
    // compile the other scales one at a time, between frames, so start-up is not one long task
    const yieldToMain = () => globalThis.scheduler?.yield ? scheduler.yield() : new Promise(r => setTimeout(r, 0));
    (async () => { for (let i = 0; i < STAGES.length; i++) { await yieldToMain(); ready(i); } })().catch(console.error);
    window.__rainbows = { S, go, syncUI, cams, R, dbg, get busy() { return !!tr; }, get tr() { return tr; } };
  } catch (err) {
    console.error(err);
    $('fail').hidden = false;
    $('fail').querySelector('p').textContent = 'The 3D view could not start on this device (' + String(err.message || err).split('\n')[0] + ').';
  }
}
