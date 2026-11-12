// Vesicle fusion: page state, camera, input and the frame loop.
import { perspective, lookAt, sstep } from './glx.js';
import { Scene } from './scene.js';
import { PH } from './profile.js';
import { INFO } from './info.js';
import { Experiment, Sampler, PARAMS, T_TOTAL, quantiles, progressOf } from './infer.js';
import { IrmCamera, irmOptics, moment, contrastCurve, hue, css, IRM, SPAN, WELL, N_MEDIUM, N_LIPID } from './irm.js';
import { Dashboard } from './inferui.js';
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
// The story the inference view tells, keyed to milliseconds since the (hidden) moment of fusion.
const INF_STAGES = [
  { at: -1e9, name: 'Before', title: 'Nothing has happened yet',
    body: 'Only a dim, quenched spot. The beliefs on the right are still the priors: what the literature would let us assume before seeing this video. The gold band in the scene is where the membrane could be.',
    irm: 'Only a dim, quenched spot, and a reflection picture that is not changing. The cell has a static pattern of its own, so a picture that stays the same tells us nothing yet. The beliefs are still the priors.' },
  { at: 0, name: 'The flash', title: 'The flash pins the moment',
    body: 'Brightness jumps when the pore opens. Within two frames the moment of fusion is known to a few milliseconds, and the number of tags follows from how bright the flash is.' },
  { at: 25, name: 'Settling', title: 'The shape of the rise',
    body: 'As the vesicle flattens its tags sink into brighter light. How fast that happens says how quickly it collapsed. Size is harder: a bigger vesicle with fewer tags looks much the same.',
    irm: 'The reflection picture starts to change as the vesicle flattens. How large the change is depends on the size of the vesicle and not on its tags, and how fast it happens follows the pore as it widens.' },
  { at: 120, name: 'Spreading', title: 'Spreading reveals diffusion',
    body: 'The spot widens as tagged synaptobrevin drifts away, and every extra frame sharpens the diffusion estimate. The blue fan is the forecast for frames not yet seen.',
    irm: 'The spot widens as the tags drift away, which gives diffusion. The green outlines are what the fluorescence video alone would allow: compare them with the gold for vesicle size, collapse time and pore width.' },
];
const FAR = new Set(['reserve', 'mito', 'psd']);

const st = {
  p: +params.get('p') || 0, diam: +params.get('d') || 42,
  az: params.has('az') ? +params.get('az') : 24, el: params.has('el') ? +params.get('el') : 9,
  dist: +params.get('dist') || 165, cut: params.has('cut') ? +params.get('cut') : 110,
  vitro: params.get('mode') === 'vitro', angle: +params.get('angle') || 68,
  play: false, spin: !reduced && !params.has('still'), labels: !params.has('nolabels'), hi: 0,
  infer: params.get('mode') === 'infer', t: +params.get('t') || 0, power: 1.5, dt: 10, prior: 1, seed: 1, truth: false,
  irm: false, lambda: IRM.lambda,
};
if (st.infer) st.vitro = true;
const modeName = () => (st.infer ? 'infer' : st.vitro ? 'vitro' : 'vivo');

// The view is mirrored into the address bar after '#', so any state can be bookmarked or shared.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const HASH = {
  mode: [() => modeName(), (v) => { st.infer = v === 'infer'; st.vitro = v !== 'vivo'; }],
  t: [() => Math.round(st.t), (v) => { st.t = clamp(+v || 0, 0, T_TOTAL); }],
  power: [() => st.power, (v) => { st.power = clamp(+v || 1.5, 0.1, 5); }],
  frame: [() => st.dt, (v) => { st.dt = clamp(Math.round((+v || 10) / 5) * 5, 5, 40); }],
  prior: [() => st.prior, (v) => { st.prior = clamp(+v || 1, 0.5, 2); }],
  seed: [() => st.seed, (v) => { st.seed = Math.max(1, Math.round(+v) || 1); }],
  truth: [() => (st.truth ? 1 : 0), (v) => { st.truth = v === '1'; }],
  p: [() => +st.p.toFixed(3), (v) => { st.p = clamp(+v || 0, 0, 1); }],
  size: [() => st.diam, (v) => { st.diam = clamp(Math.round(+v) || 42, 30, 90); }],
  angle: [() => +st.angle.toFixed(1), (v) => { st.angle = clamp(+v || 68, 50, 79); }],
  irm: [() => (st.irm ? 1 : 0), (v) => { st.irm = v === '1'; }],
  wl: [() => st.lambda, (v) => { st.lambda = clamp(Math.round((+v || IRM.lambda) / 5) * 5, IRM.min, IRM.max); }],
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
const INF_KEYS = new Set(['t', 'power', 'frame', 'prior', 'seed', 'truth']);
const VITRO_KEYS = new Set(['angle', 'irm', 'wl']);
const hashNow = () => Object.entries(HASH).filter(([k]) => (!VITRO_KEYS.has(k) || st.vitro) && (k !== 'wl' || st.irm) && (st.infer ? k !== 'p' : !INF_KEYS.has(k))).map(([k, [get]]) => k + '=' + get()).join('&');
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
  if (st.infer) set('prog', st.t / T_TOTAL * 1000, Math.round(st.t) + ' ms'); else set('prog', st.p * 1000, Math.round(st.p * 100) + '%');
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
    if (st.irm) {
      set('wl', st.lambda, st.lambda + ' nm');
      const key = st.lambda + '|' + st.diam;
      if (shown.wl !== key) {
        shown.wl = key;
        // Every number here is read from the model: the fringe spacing, the blur, and the docked vesicle's contrast.
        const io = irmOptics(st.lambda), m = moment(io, 0, st.diam / 2 - 2.4, [0, 0]), c = 100 * m[0] / (2 * Math.PI * (io.sigmaA * io.sigmaA + m[1]));
        $('wlNote').textContent = `Brightness repeats every ${Math.round(io.fringe)} nm of height. Blur ${Math.round(io.fwhm)} nm. A docked ${st.diam} nm vesicle is ${Math.abs(c).toFixed(2)}% ${c < 0 ? 'darker' : 'brighter'} than the background.`;
        const col = css(hue(st.lambda));
        $('wl').style.setProperty('--irm', col); $('keyIrmDot').style.setProperty('--c', col);
        $('keyIrmText').textContent = `${st.lambda} nm reflection light`; $('irmHead').textContent = `Reflection ${st.lambda} nm`;
      }
    }
  }
  if (st.infer) {
    set('power', st.power, st.power.toFixed(1) + ' photons/ms');
    set('frameT', st.dt, `${st.dt} ms, ${Math.round(T_TOTAL / st.dt)} frames`);
    set('prior', st.prior, st.prior < 0.8 ? 'confident' : st.prior > 1.3 ? 'vague' : 'textbook');
  }
  const pl = st.play ? 'Pause' : (st.infer ? st.t > T_TOTAL - 2 : st.p > 0.995) ? 'Replay' : st.infer ? 'Play the video' : 'Play the fusion';
  if (shown.play !== pl) { shown.play = pl; $('play').setAttribute('aria-pressed', st.play); $('play').setAttribute('aria-label', pl); }
  const SG = st.infer ? INF_STAGES : STAGES, pos = st.infer ? st.t - truthOf(st.seed)[0] : st.p;
  let i = 0; while (i < SG.length - 1 && pos >= SG[i + 1].at) i++;
  if (i !== stageIdx) {
    const first = stageIdx < 0; stageIdx = i;
    const apply = () => {
      $('stageNo').textContent = `${st.infer ? 'Evidence' : 'Stage'} ${i + 1} of ${SG.length}`; $('stageTime').textContent = SG[i].name;
      $('capTitle').textContent = SG[i].title; $('capBody').textContent = (st.infer && st.irm && SG[i].irm) || (st.vitro && SG[i].vitro) || SG[i].body;
      $('cap').classList.remove('swap');
    };
    if (first || reduced) apply(); else { $('cap').classList.add('swap'); setTimeout(apply, 180); }
    [...$('ticks').children].forEach((t, k) => t.classList.toggle('on', k <= i));
  }
}
STAGES.forEach((s) => { const t = document.createElement('i'); t.style.left = (s.at * 100) + '%'; $('ticks').append(t); });

const stopSpin = () => { st.spin = false; $('spin').checked = false; };
$('prog').addEventListener('input', (e) => { if (st.infer) st.t = e.target.value / 1000 * T_TOTAL; else st.p = e.target.value / 1000; st.play = false; syncUI(); });
$('size').addEventListener('input', (e) => { st.diam = +e.target.value; syncUI(); });
$('cut').addEventListener('input', (e) => { st.cut = +e.target.value; syncUI(); });
$('orbit').addEventListener('input', (e) => { st.az = +e.target.value; stopSpin(); syncUI(); });
$('tilt').addEventListener('input', (e) => { st.el = +e.target.value; syncUI(); });
$('zoom').addEventListener('input', (e) => { st.dist = zoomToDist(+e.target.value); syncUI(); });
$('angle').max = Math.floor(THETA_MAX * 10) / 10;
$('angle').addEventListener('input', (e) => { st.angle = +e.target.value; syncUI(); });
// The second camera is optional. Switching it on widens the camera panel to two columns, and in
// the inference view adds its video to the evidence.
$('wl').min = IRM.min; $('wl').max = IRM.max;
function applyIrm() {
  const on = st.irm && st.vitro;
  $('irm').checked = st.irm; $('ctl-wl').hidden = !st.irm; $('irmCol').hidden = !on; $('keyIrm').hidden = !on; $('keyAlone').hidden = !on;
  $('pip').classList.toggle('dual', on); $('inf').classList.toggle('dual', on); document.body.classList.toggle('irm', on);
  for (const t of document.querySelectorAll('.irmTile')) t.hidden = !on;
  $('obsCap').textContent = on ? 'TIRF' : 'Recorded'; $('expectCap').textContent = on ? 'Expected' : 'Model expects';
  $('pipNote').textContent = on
    ? `Left: fluorescence. Right: ${st.lambda} nm light reflected by the glass, mixed with the far weaker light scattered back by the membranes above it. Mid-grey is the bare background; black and white are ${(SPAN * 100).toFixed(1)}% below and above it. Every vesicle near the glass shows, lit tags or not. A real cell would add a static mottle of its own, left out here.`
    : `Top: the whole lit field, with every vesicle near the glass blurred to ${Math.round(CAM.fwhm)} nm by diffraction. Below: the boxed centre, magnified on our vesicle. Each square is one ${CAM.nm} nm camera pixel, and the grain is shot noise: light arrives as whole photons, a random number in each pixel each frame.`;
}
$('irm').addEventListener('change', (e) => { st.irm = e.target.checked; applyIrm(); stageIdx = -1; delete shown.wl; syncUI(); resize(); pipRect = $(st.infer ? 'inf' : 'pip').getBoundingClientRect(); });
$('wl').addEventListener('input', (e) => { st.lambda = +e.target.value; applyIrm(); syncUI(); });
function setMode(mode) {
  const infer = mode === 'infer', vitro = mode !== 'vivo';
  st.infer = infer; st.vitro = vitro; st.dist = Math.min(st.dist, maxDist()); st.play = false;
  document.body.classList.toggle('vitro', vitro); document.body.classList.toggle('infer', infer);
  for (const [id, m] of [['modeVivo', 'vivo'], ['modeVitro', 'vitro'], ['modeInfer', 'infer']]) $(id).setAttribute('aria-pressed', m === mode);
  $('pip').hidden = !vitro || infer; $('inf').hidden = !infer; $('ctl-infer').hidden = !infer; $('ticks').hidden = infer;
  $('ctl-angle').hidden = !vitro; $('ctl-irm').hidden = !vitro; applyIrm(); $('keyVitro').hidden = !vitro; $('keyVivo').hidden = vitro; $('keyInfer').hidden = !infer;
  $('sub').textContent = infer ? 'working back from the video' : vitro ? 'watched on a TIRF microscope' : 'how a synapse releases its signal';
  $('progL').textContent = infer ? 'Video time' : 'Fusion progress'; $('sizeL').textContent = infer ? 'True vesicle diameter' : 'Vesicle diameter';
  $('truth').checked = st.truth;
  stageIdx = -1; for (const k in shown) delete shown[k];
  syncUI();
  resize(); pipRect = $(infer ? 'inf' : 'pip').getBoundingClientRect();
}
for (const [id, m] of [['modeVivo', 'vivo'], ['modeVitro', 'vitro'], ['modeInfer', 'infer']]) $(id).addEventListener('click', () => {
  setMode(m);
  if (m === 'infer' && !reduced) { st.t = 0; st.play = true; syncUI(); }     // start the video from the top
});
$('energy').textContent = `Excitation ${LAMBDA_EX} nm, ${EV(LAMBDA_EX).toFixed(2)} eV per photon. Emission ${LAMBDA_EM} nm, ${EV(LAMBDA_EM).toFixed(2)} eV. The difference is lost as heat in the protein.`;
$('spin').addEventListener('change', (e) => { st.spin = e.target.checked; });
$('lab').addEventListener('change', (e) => { st.labels = e.target.checked; $('labels').classList.toggle('off', !st.labels); writeHash(); });
$('share').addEventListener('click', async () => {
  const url = location.origin + location.pathname + '#' + hashNow(), b = $('share');
  try { await navigator.clipboard.writeText(url); b.textContent = 'Link copied'; }
  catch (e) { prompt('Copy this link', url); }
  setTimeout(() => { b.textContent = 'Copy link to this view'; }, 1800);
});
addEventListener('hashchange', () => { if (readHash()) { $('spin').checked = st.spin; $('lab').checked = st.labels; $('labels').classList.toggle('off', !st.labels); setMode(modeName()); } });
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
$('play').addEventListener('click', () => {
  if (!st.play && st.infer && st.t > T_TOTAL - 2) st.t = 0;
  if (!st.play && !st.infer && st.p > 0.995) st.p = 0;
  st.play = !st.play; syncUI();
});
$('power').addEventListener('input', (e) => { st.power = +e.target.value; syncUI(); });
$('frameT').addEventListener('input', (e) => { st.dt = +e.target.value; syncUI(); });
$('prior').addEventListener('input', (e) => { st.prior = +e.target.value; syncUI(); });
$('newEvent').addEventListener('click', () => { st.seed++; st.t = 0; st.play = !reduced; syncUI(); });
$('truth').addEventListener('change', (e) => { st.truth = e.target.checked; writeHash(); });
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
  // The inference view adds a second panel (right on desktop, top on phones) to steer clear of.
  const q = st.infer ? $('inf').getBoundingClientRect() : null;
  if (phone.matches) { const bot = Math.min(0.62, r.height / ch), top = q ? q.bottom / ch : 0; cam.ox = 0; cam.fw = 1; cam.oy = bot - top; cam.fh = Math.max(0.15, 1 - bot - top); }
  else { const q2 = q || (st.irm && st.vitro ? $('pip').getBoundingClientRect() : null), left = r.right / cw, right = q2 ? (cw - q2.left) / cw : 0; cam.ox = left - right; cam.fw = Math.max(0.2, 1 - left - right); cam.oy = 0; cam.fh = 1; }
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
  const p11 = f * Math.min(ch * cam.fh, cw * cam.fw * 1.12) / ch, p00 = p11 * ch / cw;
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
const camera = new Camera($('cam'), $('trace'), $('camZoom'));
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
  if (reshuffle) $('pipPeak').textContent = camera.peak;
  const key = st.diam + '|' + st.angle;
  if (key !== curveKey && now - curveAt > 160) { curveKey = key; curveAt = now; curve = scene.fluorCurve(st.diam / 2 - 2.4); }
  if (curve) camera.drawTrace(curve, st.p);
  if (st.irm) drawIrm(reshuffle);
  if (reshuffle) pipRect = $('pip').getBoundingClientRect();
}
// The reflection camera looks at the same field. Each vesicle near the glass is a faint spot whose
// contrast comes from its membrane shape at this moment; vesicles that never fuse are worked out once.
const irmCam = new IrmCamera($('irmCam'), $('irmZoom'), $('irmTrace'));
let irmO = null, irmStill = null, irmKey = '', irmSpots = [], irmCurve = null, irmCurveKey = '';
function drawIrm(reshuffle) {
  const R = st.diam / 2 - 2.4, half = CAM.px * CAM.nm / 2 + 400, m = [0, 0];
  const inField = (x, z) => Math.abs(x) < half && Math.abs(z) < half;
  if (!irmO || irmO.lambda !== st.lambda) {
    irmO = irmOptics(st.lambda); irmKey = '';
    irmStill = [];
    for (const [x, z, rad] of scene.docked) if (inField(x, z)) { moment(irmO, 0, rad - 2, m); irmStill.push([x, z, m[0], m[1]]); }
    for (const nb of scene.neigh) if (nb.off === null && inField(nb.x, nb.z)) { moment(irmO, 0, nb.rad - 2, m); irmStill.push([nb.x, nb.z, m[0], m[1]]); }
  }
  const key = st.p.toFixed(4) + '|' + st.diam;
  if (key !== irmKey) {
    irmKey = key; irmSpots = irmStill.slice();
    moment(irmO, st.p, R, m); irmSpots.push([0, 0, m[0], m[1]]);
    for (const nb of scene.neigh) if (nb.off !== null && inField(nb.x, nb.z)) { moment(irmO, clamp(st.p + nb.off, 0, 1), nb.rad - 2, m); irmSpots.push([nb.x, nb.z, m[0], m[1]]); }
  }
  irmCam.render(irmO, irmSpots, reshuffle);
  const ck = st.diam + '|' + st.lambda;
  if (ck !== irmCurveKey) { irmCurveKey = ck; irmCurve = contrastCurve(irmO, R); }
  irmCam.drawTrace(irmCurve, st.p, 'rgba(234,240,255,.95)');
}
$('irmBar').style.width = (1000 / (CAM.px * CAM.nm) * 100) + '%'; $('irmZoomBar').style.width = (500 / (CAM.zoom * CAM.nm) * 100) + '%';
{ const b = $('irmBox').style, e = (CAM.px - CAM.zoom) / 2 / CAM.px * 100 + '%'; b.left = b.right = b.top = b.bottom = e; }
$('pipBar').style.width = (1000 / (CAM.px * CAM.nm) * 100) + '%';
$('zoomBar').style.width = (500 / (CAM.zoom * CAM.nm) * 100) + '%';
{ const b = $('pipBox').style, e = (CAM.px - CAM.zoom) / 2 / CAM.px * 100 + '%'; b.left = b.right = b.top = b.bottom = e; }

// ---- inference (third view) ----------------------------------------------------------------------
// The hidden truth for a given event. The diameter comes from the size slider; the rest are drawn
// once per event, so that "New event" gives a fresh puzzle.
function truthOf(seed) {
  const r = (k) => { const v = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  const g = (k) => Math.sqrt(-2 * Math.log(r(k) + 1e-9)) * Math.cos(6.2832 * r(k + 0.5));
  return [110 + 90 * r(1), Math.log(st.diam), Math.log(30) + 0.4 * g(2), Math.log(30) + 0.7 * g(3), Math.log(0.2) + 0.7 * g(4)];
}
// The maths summary. Prior values are read from the model so the text cannot drift from the code.
for (const P of PARAMS) {
  const li = document.createElement('li');
  li.textContent = P.log ? `${P.name}: ${P.med} ${P.unit} ×/÷ ${P.gsd}` : `${P.name}: anywhere in the ${T_TOTAL} ms of video, equally likely`;
  $('mathPriors').append(li);
}
for (const t of [
  `Reference wave: the ${(irmOptics(IRM.lambda).glass * 100).toFixed(2)}% of the light that the glass reflects where it meets the medium.`,
  `Refractive indices: lipid ${N_LIPID}, vesicle interior and medium ${N_MEDIUM}, cytoplasm 1.36.`,
  `Noise: ${WELL.toLocaleString('en')} photoelectrons per pixel per millisecond, so σ is ${(100 / Math.sqrt(WELL * 10)).toFixed(2)}% in a 10 ms frame.`,
]) { const li = document.createElement('li'); li.textContent = t; $('mathIrm').append(li); }
$('mathBtn').addEventListener('click', () => { st.play = false; syncUI(); $('math').showModal(); $('math').scrollTop = 0; });
$('mathClose').addEventListener('click', () => $('math').close());
$('math').addEventListener('click', (e) => { if (e.target === $('math')) $('math').close(); });   // a click on the backdrop
const dash = new Dashboard({ obs: $('obs'), exp: $('expect'), obs2: $('obs2'), exp2: $('expect2'), fan: $('fan'), pore: $('pore'), strips: $('strips'), pair: $('pair') });
let samplerT = null;         // with the reflection camera on: a second sampler that sees the fluorescence video only
let exper = null, sampler = null, expKey = '', viewDiam = 42, diamAt = 0, infTick = 0, goal = null;
const belief = { p: [0.2, 0.2, 0.2, 0.2, 0.2], R: [20, 20, 20, 20, 20], sp: [80, 80, 80, 80, 80], fused: 0, ready: false };
const rowBuf = new Float32Array(1300 * 5), qP = new Float32Array(1300), qR = new Float32Array(1300), qS = new Float32Array(1300);
function runInference(now, dt) {
  const key = [st.dt, st.power, st.angle, st.prior, st.seed, st.diam, st.irm ? st.lambda : 0].join('|');
  if (key !== expKey) {
    expKey = key;
    exper = new Experiment({ dt: st.dt, power: st.power, angle: st.angle, prior: st.prior, irm: st.irm, lambda: st.lambda });
    exper.simulate(truthOf(st.seed), st.seed * 7 + 3);
    if (sampler) { sampler.both = st.irm; sampler.reset(exper); } else sampler = new Sampler(exper, 7, st.irm);
    if (!st.irm) samplerT = null; else if (samplerT) samplerT.reset(exper); else samplerT = new Sampler(exper, 11, false);
    belief.ready = false; goal = null;
  }
  const upto = Math.min(exper.nf, Math.floor(st.t / st.dt + 1e-6)), budget = phone.matches ? 5 : 7;
  sampler.observe(upto); sampler.run(samplerT ? budget * 0.7 : budget);
  if (samplerT) { samplerT.observe(upto); samplerT.run(budget * 0.55); }
  // Summarise the posterior from the sampler's long memory rather than from where the walkers
  // happen to be this instant, and ease everything on screen toward that summary. The picture
  // then moves when the evidence moves, not with every step of the sampler.
  if (infTick % 3 === 0 || !belief.ready) {
    const n = sampler.rows(rowBuf, 1200), s3 = new Float64Array(5);
    if (n >= 40) {
      let fused = 0;
      for (let s = 0; s < n; s++) {
        const u = rowBuf.subarray(s * 5, s * 5 + 5); exper.state(u, st.t, s3);
        const f = st.t > u[0]; fused += f;
        qP[s] = f ? progressOf(s3[2]) : 0.2; qR[s] = Math.exp(u[1]) / 2 - 2.4; qS[s] = Math.sqrt(s3[1]) * CAM.nm;
      }
      const Q = [0.05, 0.25, 0.5, 0.75, 0.95];
      goal = { p: quantiles(qP, n, Q), R: quantiles(qR, n, Q), sp: quantiles(qS, n, Q), fused: fused / n };
    }
  }
  if (goal) {
    const k = belief.ready ? 1 - Math.exp(-dt / 0.5) : 1;
    for (const key of ['p', 'R', 'sp']) for (let i = 0; i < 5; i++) belief[key][i] += (goal[key][i] - belief[key][i]) * k;
    belief.fused += (goal.fused - belief.fused) * k; belief.ready = true;
  }
  // The solid vesicle is the middle estimate. Resizing it rebuilds its lipids, so only do that for a real, settled change.
  const d = 2 * (belief.R[2] + 2.4);
  if (Math.abs(d - viewDiam) >= 2 && now - diamAt > 800) { viewDiam = Math.min(90, Math.max(30, Math.round(d))); diamAt = now; }
  if (++infTick % 3 === 0) {
    dash.draw(exper, sampler, st.t, st.truth, samplerT);
    if (dash.poreText && shown.pore !== dash.poreText) { shown.pore = dash.poreText; $('poreInfo').textContent = dash.poreText; }
    const fr = `frame ${sampler.upto} of ${exper.nf}`;
    if (shown.fr !== fr) { shown.fr = fr; $('infFrames').textContent = fr; }
    if (dash.pairText && shown.pt !== dash.pairText) { shown.pt = dash.pairText; $('pairNote').textContent = dash.pairText; }
    if (infTick % 40 === 0) pipRect = $('inf').getBoundingClientRect();
  }
  const B = belief;
  return Object.assign({}, st, { p: B.p[2], diam: viewDiam, belief: {
    tall: { p: B.p[0], R: B.R[4] }, low: { p: B.p[4], R: B.R[0] }, tall2: { p: B.p[1], R: B.R[3] }, low2: { p: B.p[3], R: B.R[1] },
    mid: { p: B.p[2], R: B.R[2] }, sp: B.sp, fused: B.fused } });
}

// ---- frame loop ----------------------------------------------------------------------------------
const maxFrames = +params.get('frames') || 0; let drawn = 0;
let last = performance.now(), clock = 0, slow = 0, frames = 0, shownGlu = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
  if (!reduced || st.play) clock += dt;
  if (st.play) {
    if (st.infer) { st.t = Math.min(T_TOTAL, st.t + dt * T_TOTAL / 24); if (st.t >= T_TOTAL) st.play = false; }
    else { st.p = Math.min(1, st.p + dt / 26); if (st.p >= 1) st.play = false; }
    syncUI();
  }
  if (st.spin && !pointers.size && !hoverTag) { st.az = (st.az + dt * 3.2) % 360; syncUI(); }
  const view = st.infer ? runInference(now, dt) : st;
  scene.update(view, clock);
  if (scene.glutamate !== shownGlu) {
    shownGlu = scene.glutamate;
    $('sizeNote').textContent = `Holds about ${(Math.round(shownGlu / 50) * 50).toLocaleString('en')} glutamate molecules at 150 mM`;
  }
  setCamera();
  scene.draw(cam, view, clock);
  if (st.labels) placeLabels();
  if (st.vitro && !st.infer) drawCamera(now);
  // If the device cannot keep up, thin the lipids (each one is then drawn a little larger).
  if (++frames > 30 && !params.has('q')) {
    slow = slow * 0.95 + dt * 0.05;
    if (slow > 0.034 && frames > 90 && quality > 0.22) { quality *= 0.7; scene.setQuality(quality); frames = 0; slow = 0; }
  }
  if (++drawn === maxFrames) { document.documentElement.dataset.done = '1'; return; }   // ?frames=N stops the loop, for still captures
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { frames = 0; slow = 0; last = performance.now(); });
setMode(modeName());
if (fromLink) { $('spin').checked = st.spin; $('lab').checked = st.labels; $('labels').classList.toggle('off', !st.labels); syncUI(); }
if (!reduced && !fromLink && !params.has('p') && !params.has('t') && !params.has('still')) setTimeout(() => { if (st.p === 0 && st.t === 0) { st.play = true; syncUI(); } }, 1400);
requestAnimationFrame(frame);
