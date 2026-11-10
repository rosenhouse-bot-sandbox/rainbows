// Vesicle fusion: page state, camera, input and the frame loop.
import { perspective, lookAt, sstep } from './glx.js';
import { Scene } from './scene.js';
import { PH } from './profile.js';
import { INFO } from './info.js';
import { Camera, CAM, optics, THETA_MAX, LAMBDA_EX, LAMBDA_EM, EV, GAP } from './vitro.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = matchMedia('(max-width: 899px)');

const STAGES = [
  { at: 0, name: 'Docked', title: 'Docked and loaded',
    body: 'A synaptic vesicle packed with glutamate waits a few nanometres above the cell membrane. Half-zipped SNARE proteins hold it there, ready to fire.',
    vitro: 'The vesicle waits just above the membrane, about 50 nanometres over the glass. Its pHluorin tags sit in acid and stay dark, so the camera sees almost nothing.' },
  { at: PH.CA, name: 'Trigger', title: 'Calcium pulls the trigger',
    body: 'A nerve impulse opens calcium channels. Calcium binds synaptotagmin, and the SNAREs zip shut toward their anchors, forcing the two membranes into contact.',
    vitro: 'Calcium enters and the SNAREs zip shut, pulling the vesicle down into the brighter part of the evanescent field. The tags are still quenched.' },
  { at: PH.STALK, name: 'Hemifusion', title: 'The facing layers merge',
    body: 'The near halves of the two bilayers join in an hourglass stalk. Their lipids start to mix, but the far layers are intact and the contents stay sealed.' },
  { at: PH.PORE, name: 'Pore opens', title: 'A fusion pore opens',
    body: 'The far layers give way and a channel barely two nanometres across connects the vesicle to the outside. The first glutamate slips through.',
    vitro: 'A pore two nanometres wide opens. Protons rush out, the pH inside jumps from 5.5 to 7.4, and every pHluorin lights up at once: a flash on the camera.' },
  { at: PH.DILATE, name: 'Release', title: 'The pore widens',
    body: 'The neck dilates and glutamate pours into the 20-nanometre cleft. It reaches receptors on the next cell in microseconds, and their channels open.',
    vitro: 'The neck dilates and glutamate pours into the thin layer of medium over the glass. The glowing tags slide down toward the glass, where the laser field is strongest.' },
  { at: PH.OMEGA, name: 'Collapse', title: 'The vesicle flattens',
    body: 'Membrane tension pulls the vesicle flat. Its lipids spread into the cell membrane, and the spent SNARE complexes, now in one membrane, drift away.',
    vitro: 'The vesicle flattens into the cell membrane. Tagged synaptobrevin drifts outward with the lipids, and the spot on the camera spreads and dims.' },
  { at: PH.MERGED, name: 'Merged', title: 'One membrane',
    body: 'The vesicle is gone and its lipids keep mixing with their neighbours. The cell will pull SNAREs apart for reuse and pinch off new vesicles nearby.',
    vitro: 'The vesicle is gone. Its tags keep spreading until the spot fades into the background, which is how a fusion event is told apart from a vesicle that just arrives.' },
];
const LABELS = Object.fromEntries(Object.entries(INFO).map(([id, v]) => [id, v.label]));
LABELS.cleft = 'Synaptic cleft, 20 nm'; LABELS.gap = `Medium, ${GAP} nm`; LABELS.coverslip = 'Coverslip, 0.17 mm';
LABELS.objective = 'Objective, 100×, NA 1.49'; LABELS.laser = '488 nm laser in'; LABELS.emission = '510 nm fluorescence to camera';
LABELS.dish = 'Glass-bottom dish, 35 mm'; LABELS.neigh = 'Other vesicles, some fusing';
const FAR = new Set(['reserve', 'mito', 'psd']);

const st = {
  p: +params.get('p') || 0, diam: +params.get('d') || 42,
  az: params.has('az') ? +params.get('az') : 24, el: params.has('el') ? +params.get('el') : 9,
  dist: +params.get('dist') || 165, cut: params.has('cut') ? +params.get('cut') : 110,
  vitro: params.get('mode') === 'vitro', angle: +params.get('angle') || 68,
  play: false, spin: !reduced && !params.has('still'), labels: !params.has('nolabels'), hi: 0,
};

// The view is mirrored into the address bar after '#', so any state can be bookmarked or shared.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const HASH = {
  mode: [() => (st.vitro ? 'vitro' : 'vivo'), (v) => { st.vitro = v === 'vitro'; }],
  p: [() => +st.p.toFixed(3), (v) => { st.p = clamp(+v || 0, 0, 1); }],
  size: [() => st.diam, (v) => { st.diam = clamp(Math.round(+v) || 42, 30, 90); }],
  angle: [() => +st.angle.toFixed(1), (v) => { st.angle = clamp(+v || 68, 50, 79); }],
  cut: [() => Math.round(st.cut), (v) => { st.cut = clamp(+v || 0, 0, 180); }],
  orbit: [() => +st.az.toFixed(1), (v) => { st.az = ((+v || 0) % 360 + 360) % 360; }],
  tilt: [() => +st.el.toFixed(1), (v) => { st.el = clamp(+v || 0, -85, 88); }],
  dist: [() => +st.dist.toPrecision(3), (v) => { st.dist = clamp(+v || 165, 38, 1.6e8); }],
  labels: [() => (st.labels ? 1 : 0), (v) => { st.labels = v !== '0'; }],
};
let wroteHash = '';
function readHash() {
  const h = location.hash.slice(1);
  if (!h || h === wroteHash) return false;
  const q = new URLSearchParams(h);
  for (const [k, [, set]] of Object.entries(HASH)) if (q.has(k)) set(q.get(k));
  st.spin = false; st.play = false;
  return true;
}
const hashNow = () => Object.entries(HASH).filter(([k]) => k !== 'angle' || st.vitro).map(([k, [get]]) => k + '=' + get()).join('&');
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const h = hashNow();
    if (h === wroteHash) return;
    wroteHash = h;
    try { history.replaceState(null, '', '#' + h); } catch (e) { /* sandboxed frames may refuse; the Copy link button still works */ }
  }, 300);
}
const fromLink = readHash();

let gl, scene;
try {
  gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('no webgl2');
  scene = new Scene(gl);
} catch (e) {
  console.error(e);
  $('fail').hidden = false;
  throw e;
}
let quality = +params.get('q') || (phone.matches || navigator.maxTouchPoints > 1 ? 0.5 : 0.85);
scene.setQuality(quality);

// ---- controls ------------------------------------------------------------------------------------
// The distance slider is logarithmic. In vitro it runs on out to the whole microscope stage.
const maxDist = () => (st.vitro ? 1.6e8 : 836);
const zoomToDist = (v) => 38 * Math.pow(maxDist() / 38, v / 1000), distToZoom = (d) => 1000 * Math.log(d / 38) / Math.log(maxDist() / 38);
const fmtLen = (nm) => (nm < 1000 ? Math.round(nm) + ' nm' : nm < 1e6 ? +(nm / 1e3).toPrecision(2) + ' µm' : +(nm / 1e6).toPrecision(2) + ' mm');
const fill = (el) => el.style.setProperty('--v', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
let stageIdx = -1; const shown = {};
function syncUI() {
  writeHash();
  // Only touch the DOM when a value has actually changed; this runs every frame during playback.
  const set = (id, v, text) => {
    if (shown[id] === text + v) return; shown[id] = text + v;
    const el = $(id); if (document.activeElement !== el || !el.matches(':active')) el.value = v;
    fill(el); $(id + 'V').textContent = text;
  };
  set('prog', st.p * 1000, Math.round(st.p * 100) + '%');
  set('size', st.diam, st.diam + ' nm');
  set('cut', st.cut, st.cut ? Math.round(st.cut) + '°' : 'off');
  set('orbit', st.az, Math.round(st.az) + '°');
  set('tilt', st.el, Math.round(st.el) + '°');
  set('zoom', distToZoom(st.dist), fmtLen(st.dist));
  if (st.vitro) {
    const o = optics(st.angle);
    set('angle', st.angle, st.angle.toFixed(1) + '°');
    const note = o.tir
      ? `Past the critical angle of ${o.crit.toFixed(1)}°: total internal reflection. The field falls to 1/e every ${Math.round(o.depth)} nm.`
      : `Below the critical angle of ${o.crit.toFixed(1)}°: the beam refracts into the cell and lights all of it.`;
    if (shown.note !== note) { shown.note = note; $('angleNote').textContent = note; $('pipInfo').textContent = o.tir ? `TIRF, ${Math.round(o.depth)} nm deep` : 'No TIRF: background'; }
  }
  const pl = st.play ? 'Pause' : st.p > 0.995 ? 'Replay the fusion' : 'Play the fusion';
  if (shown.play !== pl) { shown.play = pl; $('play').setAttribute('aria-pressed', st.play); $('play').setAttribute('aria-label', pl); }
  let i = 0; while (i < STAGES.length - 1 && st.p >= STAGES[i + 1].at) i++;
  if (i !== stageIdx) {
    const first = stageIdx < 0; stageIdx = i;
    const apply = () => {
      $('stageNo').textContent = `Stage ${i + 1} of ${STAGES.length}`; $('stageTime').textContent = STAGES[i].name;
      $('capTitle').textContent = STAGES[i].title; $('capBody').textContent = (st.vitro && STAGES[i].vitro) || STAGES[i].body;
      $('cap').classList.remove('swap');
    };
    if (first || reduced) apply(); else { $('cap').classList.add('swap'); setTimeout(apply, 180); }
    [...$('ticks').children].forEach((t, k) => t.classList.toggle('on', k <= i));
  }
}
STAGES.forEach((s) => { const t = document.createElement('i'); t.style.left = (s.at * 100) + '%'; $('ticks').append(t); });

const stopSpin = () => { st.spin = false; $('spin').checked = false; };
$('prog').addEventListener('input', (e) => { st.p = e.target.value / 1000; st.play = false; syncUI(); });
$('size').addEventListener('input', (e) => { st.diam = +e.target.value; syncUI(); });
$('cut').addEventListener('input', (e) => { st.cut = +e.target.value; syncUI(); });
$('orbit').addEventListener('input', (e) => { st.az = +e.target.value; stopSpin(); syncUI(); });
$('tilt').addEventListener('input', (e) => { st.el = +e.target.value; syncUI(); });
$('zoom').addEventListener('input', (e) => { st.dist = zoomToDist(+e.target.value); syncUI(); });
$('angle').max = Math.floor(THETA_MAX * 10) / 10;
$('angle').addEventListener('input', (e) => { st.angle = +e.target.value; syncUI(); });
function setMode(vitro) {
  st.vitro = vitro; st.dist = Math.min(st.dist, maxDist());
  document.body.classList.toggle('vitro', vitro);
  $('modeVivo').setAttribute('aria-pressed', !vitro); $('modeVitro').setAttribute('aria-pressed', vitro);
  $('pip').hidden = !vitro; $('ctl-angle').hidden = !vitro; $('keyVitro').hidden = !vitro; $('keyVivo').hidden = vitro;
  $('sub').textContent = vitro ? 'watched on a TIRF microscope' : 'how a synapse releases its signal';
  stageIdx = -1; for (const k in shown) delete shown[k];
  syncUI();
}
$('modeVivo').addEventListener('click', () => setMode(false));
$('modeVitro').addEventListener('click', () => setMode(true));
$('energy').textContent = `Excitation ${LAMBDA_EX} nm, ${EV(LAMBDA_EX).toFixed(2)} eV per photon. Emission ${LAMBDA_EM} nm, ${EV(LAMBDA_EM).toFixed(2)} eV. The difference is lost as heat in the protein.`;
$('spin').addEventListener('change', (e) => { st.spin = e.target.checked; });
$('lab').addEventListener('change', (e) => { st.labels = e.target.checked; $('labels').classList.toggle('off', !st.labels); writeHash(); });
$('share').addEventListener('click', async () => {
  const url = location.origin + location.pathname + '#' + hashNow(), b = $('share');
  try { await navigator.clipboard.writeText(url); b.textContent = 'Link copied'; }
  catch (e) { prompt('Copy this link', url); }
  setTimeout(() => { b.textContent = 'Copy link to this view'; }, 1800);
});
addEventListener('hashchange', () => { if (readHash()) { $('spin').checked = st.spin; $('lab').checked = st.labels; $('labels').classList.toggle('off', !st.labels); setMode(st.vitro); } });
// Pointing at an entry in the colour key picks those molecules out in the scene; a click holds it.
let hiHeld = 0;
for (const li of document.querySelectorAll('.key li[data-cat]')) {
  const cat = +li.dataset.cat;
  const show = () => { st.hi = cat; }, hide = () => { st.hi = hiHeld; };
  li.addEventListener('mouseenter', show); li.addEventListener('mouseleave', hide);
  li.addEventListener('focus', show); li.addEventListener('blur', hide);
  const toggle = () => {
    hiHeld = hiHeld === cat ? 0 : cat; st.hi = hiHeld;
    for (const o of document.querySelectorAll('.key li[data-cat]')) o.setAttribute('aria-pressed', +o.dataset.cat === hiHeld);
  };
  li.addEventListener('click', toggle);
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
}
$('play').addEventListener('click', () => { if (!st.play && st.p > 0.995) st.p = 0; st.play = !st.play; syncUI(); });
$('moreBtn').addEventListener('click', () => {
  const open = $('panel').classList.toggle('open');
  $('moreBtn').setAttribute('aria-expanded', open);
});
$('spin').checked = st.spin; $('lab').checked = st.labels; $('labels').classList.toggle('off', !st.labels);

// Drag to orbit, pinch or wheel to zoom.
const pointers = new Map(); let pinch = 0;
const hideHint = () => $('hint').classList.add('gone');
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId); if (!prev) return;
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 1) {
    st.az = ((st.az - (e.clientX - prev[0]) * 0.35) % 360 + 360) % 360;
    st.el = Math.max(-85, Math.min(88, st.el + (e.clientY - prev[1]) * 0.3));
    stopSpin(); hideHint();
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) st.dist = Math.max(38, Math.min(maxDist(), st.dist * pinch / d));
    pinch = d; hideHint();
  }
  syncUI();
});
const drop = (e) => { pointers.delete(e.pointerId); pinch = 0; };
canvas.addEventListener('pointerup', drop); canvas.addEventListener('pointercancel', drop);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); st.dist = Math.max(38, Math.min(maxDist(), st.dist * Math.exp(e.deltaY * 0.0012))); hideHint(); syncUI(); }, { passive: false });
setTimeout(hideHint, 9000);

// ---- camera --------------------------------------------------------------------------------------
const cam = { view: new Float32Array(16), proj: new Float32Array(16), basis: {}, eye: [0, 0, 0], target: [0, 0, 0], w: 1, h: 1, ox: 0, oy: 0, dist: 150 };
let dpr = 1, focusY = 8;
function resize() {
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.6e6 / (cw * ch)) * 1.0) * (params.get('dpr') ? +params.get('dpr') / (window.devicePixelRatio || 1) : 1);
  const w = Math.max(2, Math.round(cw * dpr)), h = Math.max(2, Math.round(ch * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  cam.w = w; cam.h = h;
  // Centre the subject in the part of the screen the panel leaves free.
  const r = $('panel').getBoundingClientRect();
  if (phone.matches) { cam.ox = 0; cam.oy = Math.min(0.62, r.height / ch); }
  else { cam.ox = r.right / cw; cam.oy = 0; }
}
new ResizeObserver(resize).observe($('panel')); addEventListener('resize', resize); resize();

function setCamera() {
  const az = st.az * Math.PI / 180, el = st.el * Math.PI / 180, ce = Math.cos(el);
  focusY += (scene.focusY - focusY) * 0.08;
  // Pulled far back, aim lower so the dish and the objective beneath it share the frame.
  const ty = focusY - 0.2 * st.dist * sstep(5.6, 7.0, Math.log10(st.dist));
  cam.target = [0, ty, 0]; cam.dist = st.dist;
  cam.eye = [st.dist * ce * Math.sin(az), ty + st.dist * Math.sin(el), st.dist * ce * Math.cos(az)];
  lookAt(cam.view, cam.eye, cam.target, cam.basis);
  // Fit the subject to the free area, whichever of its dimensions is tighter.
  const cw = canvas.clientWidth, ch = canvas.clientHeight, f = 1 / Math.tan(17 * Math.PI / 180);
  const p11 = f * Math.min(ch * (1 - cam.oy), cw * (1 - cam.ox) * 1.12) / ch, p00 = p11 * ch / cw;
  perspective(cam.proj, p00, p11, Math.max(1.5, st.dist * 0.04), st.dist * 40 + 6000, cam.ox, cam.oy);
}

// ---- labels and scale bar ------------------------------------------------------------------------
const tags = {};
let hoverTag = false;
for (const [id, text] of Object.entries(LABELS)) {
  const t = document.createElement('div'); t.className = 'tag' + (FAR.has(id) ? ' far' : '');
  const sp = document.createElement('span'); sp.textContent = text; t.append(sp);
  // Hover card (desktop): a sentence or two, and a way out to read more.
  const pop = document.createElement('div'); pop.className = 'pop';
  const h = document.createElement('b'), d = document.createElement('p'), a = document.createElement('a');
  h.textContent = INFO[id].label; d.textContent = INFO[id].detail;
  a.href = INFO[id].url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Read more on Wikipedia';
  pop.append(h, d, a); t.append(pop);
  t.addEventListener('mouseenter', () => { hoverTag = true; t.classList.toggle('up', t.getBoundingClientRect().top > innerHeight - 230); });
  t.addEventListener('mouseleave', () => { hoverTag = false; });
  $('labels').append(t); tags[id] = t;
}
function placeLabels() {
  if (hoverTag) return;
  const V = cam.view, P = cam.proj, cw = canvas.clientWidth, ch = canvas.clientHeight, pr = $('panel').getBoundingClientRect();
  const taken = [];
  const live = new Set(scene.labels.map((L) => L.id));
  for (const id in tags) if (!live.has(id) && tags[id]._on) { tags[id]._on = false; tags[id].classList.remove('on'); }
  for (const L of scene.labels) {
    const t = tags[L.id]; let on = false;
    const txt = scene.labelText[L.id];
    if (txt && t._txt !== txt) { t._txt = txt; t.firstChild.textContent = txt; t._w = 0; }
    if (L.q && st.dist >= (L.min || 0) && st.dist <= (L.max || 6000) && (L.free || scene.visible(L.q, cam.eye))) {
      const [x, y, z] = L.q;
      const vx = V[0] * x + V[4] * y + V[8] * z + V[12], vy = V[1] * x + V[5] * y + V[9] * z + V[13], vz = V[2] * x + V[6] * y + V[10] * z + V[14];
      if (vz < -2) {
        const sx = ((P[0] * vx + P[8] * vz) / -vz * 0.5 + 0.5) * cw, sy = (0.5 - (P[5] * vy + P[9] * vz) / -vz * 0.5) * ch;
        const wd = (t._w || (t._w = t.offsetWidth)) + 10, pp = st.vitro ? pipRect : null,
          hidden = (phone.matches ? sy > pr.top - 14 : sx < pr.right + 8) || (pp && sx + wd > pp.left && sx < pp.right && sy > pp.top - 10 && sy < pp.bottom + 10);
        on = sx > 4 && sx + wd < cw && sy > 64 && sy < ch - 10 && !hidden
          && !taken.some((b) => sx < b[0] + b[2] && sx + wd > b[0] && Math.abs(sy - b[1]) < 19);   // earlier labels win
        if (on) { taken.push([sx - 8, sy, wd + 8]); t.style.transform = `translate(${sx.toFixed(1)}px,${(sy - 9).toFixed(1)}px)`; }
      }
    }
    if (t._on !== on) { t._on = on; t.classList.toggle('on', on); }
  }
  const pxPerNm = canvas.clientHeight / 2 * cam.proj[5] / st.dist;
  const nice = [2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7].find((n) => n * pxPerNm > 56) || 5e7;
  const bar = (nice * pxPerNm).toFixed(0) + 'px';
  if (shown.bar !== bar + nice) { shown.bar = bar + nice; $('scaleLine').style.width = bar; $('scaleText').textContent = fmtLen(nice); }
}

// ---- the microscope camera (in vitro) -------------------------------------------------------------
const camera = new Camera($('cam'), $('trace'));
let pipRect = $('pip').getBoundingClientRect(), camTick = 0, curveKey = '', curve = null, curveAt = 0;
function drawCamera(now) {
  const o = scene.opt, reshuffle = now - camTick > 85;
  if (reshuffle) camTick = now;
  // Other docked vesicles are in the field too, tags quenched; deeper light means more haze.
  // Brightness is scaled so a fully lit vesicle resting on the glass would just saturate.
  const W = 5.5 / 36, emit = scene.emit.map((e) => [e[0], e[1], e[2] * W]);
  for (const [x, z, rad] of scene.docked) emit.push([x, z, 36 * 0.04 * W * o.at(GAP + rad + 6)]);
  for (const e of scene.emitN) emit.push([e[0], e[1], e[2] * W, e[3]]);
  const bg = 0.035 + 0.05 * (o.I0 / 4) * Math.min(o.depth, 2600) / 100;
  camera.render(emit, bg, reshuffle);
  const key = st.diam + '|' + st.angle;
  if (key !== curveKey && now - curveAt > 160) { curveKey = key; curveAt = now; curve = scene.fluorCurve(st.diam / 2 - 2.4); }
  if (curve) camera.drawTrace(curve, st.p);
  if (reshuffle) pipRect = $('pip').getBoundingClientRect();
}
$('pipBar').style.width = (1000 / (CAM.px * CAM.nm) * 100) + '%';
$('pipNote').textContent = `Every vesicle near the glass shows up, blurred to ${Math.round(CAM.fwhm)} nm by diffraction. Ours is at the centre; the trace follows it.`;

// ---- frame loop ----------------------------------------------------------------------------------
const maxFrames = +params.get('frames') || 0; let drawn = 0;
let last = performance.now(), clock = 0, slow = 0, frames = 0, shownGlu = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
  if (!reduced || st.play) clock += dt;
  if (st.play) {
    st.p = Math.min(1, st.p + dt / 26);
    if (st.p >= 1) st.play = false;
    syncUI();
  }
  if (st.spin && !pointers.size && !hoverTag) { st.az = (st.az + dt * 3.2) % 360; syncUI(); }
  scene.update(st, clock);
  if (scene.glutamate !== shownGlu) {
    shownGlu = scene.glutamate;
    $('sizeNote').textContent = `Holds about ${(Math.round(shownGlu / 50) * 50).toLocaleString('en')} glutamate molecules at 150 mM`;
  }
  setCamera();
  scene.draw(cam, st, clock);
  if (st.labels) placeLabels();
  if (st.vitro) drawCamera(now);
  // If the device cannot keep up, thin the lipids (each one is then drawn a little larger).
  if (++frames > 30 && !params.has('q')) {
    slow = slow * 0.95 + dt * 0.05;
    if (slow > 0.034 && frames > 90 && quality > 0.22) { quality *= 0.7; scene.setQuality(quality); frames = 0; slow = 0; }
  }
  if (++drawn === maxFrames) { document.documentElement.dataset.done = '1'; return; }   // ?frames=N stops the loop, for still captures
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { frames = 0; slow = 0; last = performance.now(); });
setMode(st.vitro);
if (fromLink) { $('spin').checked = st.spin; $('lab').checked = st.labels; $('labels').classList.toggle('off', !st.labels); syncUI(); }
if (!reduced && !fromLink && !params.has('p') && !params.has('still')) setTimeout(() => { if (st.p === 0) { st.play = true; syncUI(); } }, 1400);
requestAnimationFrame(frame);
