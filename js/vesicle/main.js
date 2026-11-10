// Vesicle fusion: page state, camera, input and the frame loop.
import { perspective, lookAt, sstep } from './glx.js';
import { Scene } from './scene.js';
import { PH } from './profile.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = matchMedia('(max-width: 899px)');

const STAGES = [
  { at: 0, name: 'Docked', title: 'Docked and loaded',
    body: 'A synaptic vesicle packed with glutamate waits a few nanometres above the cell membrane. Half-zipped SNARE proteins hold it there, ready to fire.' },
  { at: PH.CA, name: 'Trigger', title: 'Calcium pulls the trigger',
    body: 'A nerve impulse opens calcium channels. Calcium binds synaptotagmin, and the SNAREs zip shut toward their anchors, forcing the two membranes into contact.' },
  { at: PH.STALK, name: 'Hemifusion', title: 'The facing layers merge',
    body: 'The near halves of the two bilayers join in an hourglass stalk. Their lipids start to mix, but the far layers are intact and the contents stay sealed.' },
  { at: PH.PORE, name: 'Pore opens', title: 'A fusion pore opens',
    body: 'The far layers give way and a channel barely two nanometres across connects the vesicle to the outside. The first glutamate slips through.' },
  { at: PH.DILATE, name: 'Release', title: 'The pore widens',
    body: 'The neck dilates and glutamate pours into the 20-nanometre cleft. It reaches receptors on the next cell in microseconds, and their channels open.' },
  { at: PH.OMEGA, name: 'Collapse', title: 'The vesicle flattens',
    body: 'Membrane tension pulls the vesicle flat. Its lipids spread into the cell membrane, and the spent SNARE complexes, now in one membrane, drift away.' },
  { at: PH.MERGED, name: 'Merged', title: 'One membrane',
    body: 'The vesicle is gone and its lipids keep mixing with their neighbours. The cell will pull SNAREs apart for reuse and pinch off new vesicles nearby.' },
];
const LABELS = {
  vesicle: 'Synaptic vesicle', stalk: 'Hemifusion stalk', pore: 'Fusion pore', glutamate: 'Glutamate',
  snare: 'SNARE complex', syt: 'Synaptotagmin', channel: 'Calcium channel', receptor: 'AMPA receptor',
  pre: 'Presynaptic membrane', cleft: 'Synaptic cleft, 20 nm', post: 'Postsynaptic membrane',
  psd: 'Postsynaptic density', reserve: 'Reserve vesicles', mito: 'Mitochondrion',
};
const FAR = new Set(['reserve', 'mito', 'psd']);

const st = {
  p: +params.get('p') || 0, diam: +params.get('d') || 42,
  az: params.has('az') ? +params.get('az') : 24, el: params.has('el') ? +params.get('el') : 9,
  dist: +params.get('dist') || 165, cut: params.has('cut') ? +params.get('cut') : 110,
  play: false, spin: !reduced && !params.has('still'), labels: !params.has('nolabels'),
};

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
const zoomToDist = (v) => 38 * Math.pow(22, v / 1000), distToZoom = (d) => 1000 * Math.log(d / 38) / Math.log(22);
const fill = (el) => el.style.setProperty('--v', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
let stageIdx = -1; const shown = {};
function syncUI() {
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
  set('zoom', distToZoom(st.dist), Math.round(st.dist) + ' nm');
  const pl = st.play ? 'Pause' : st.p > 0.995 ? 'Replay the fusion' : 'Play the fusion';
  if (shown.play !== pl) { shown.play = pl; $('play').setAttribute('aria-pressed', st.play); $('play').setAttribute('aria-label', pl); }
  let i = 0; while (i < STAGES.length - 1 && st.p >= STAGES[i + 1].at) i++;
  if (i !== stageIdx) {
    const first = stageIdx < 0; stageIdx = i;
    const apply = () => {
      $('stageNo').textContent = `Stage ${i + 1} of ${STAGES.length}`; $('stageTime').textContent = STAGES[i].name;
      $('capTitle').textContent = STAGES[i].title; $('capBody').textContent = STAGES[i].body;
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
$('spin').addEventListener('change', (e) => { st.spin = e.target.checked; });
$('lab').addEventListener('change', (e) => { st.labels = e.target.checked; $('labels').classList.toggle('off', !st.labels); });
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
    if (pinch) st.dist = Math.max(38, Math.min(836, st.dist * pinch / d));
    pinch = d; hideHint();
  }
  syncUI();
});
const drop = (e) => { pointers.delete(e.pointerId); pinch = 0; };
canvas.addEventListener('pointerup', drop); canvas.addEventListener('pointercancel', drop);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); st.dist = Math.max(38, Math.min(836, st.dist * Math.exp(e.deltaY * 0.0012))); hideHint(); syncUI(); }, { passive: false });
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
  cam.target = [0, focusY, 0]; cam.dist = st.dist;
  cam.eye = [st.dist * ce * Math.sin(az), focusY + st.dist * Math.sin(el), st.dist * ce * Math.cos(az)];
  lookAt(cam.view, cam.eye, cam.target, cam.basis);
  // Fit the subject to the free area, whichever of its dimensions is tighter.
  const cw = canvas.clientWidth, ch = canvas.clientHeight, f = 1 / Math.tan(17 * Math.PI / 180);
  const p11 = f * Math.min(ch * (1 - cam.oy), cw * (1 - cam.ox) * 1.12) / ch, p00 = p11 * ch / cw;
  perspective(cam.proj, p00, p11, Math.max(1.5, st.dist * 0.04), st.dist + 6000, cam.ox, cam.oy);
}

// ---- labels and scale bar ------------------------------------------------------------------------
const tags = {};
for (const [id, text] of Object.entries(LABELS)) {
  const t = document.createElement('div'); t.className = 'tag' + (FAR.has(id) ? ' far' : '');
  const s = document.createElement('span'); s.textContent = text; t.append(s); $('labels').append(t); tags[id] = t;
}
function placeLabels() {
  const V = cam.view, P = cam.proj, cw = canvas.clientWidth, ch = canvas.clientHeight, pr = $('panel').getBoundingClientRect();
  const taken = [];
  for (const L of scene.labels) {
    const t = tags[L.id]; let on = false;
    if (L.q && scene.visible(L.q, cam.eye)) {
      const [x, y, z] = L.q;
      const vx = V[0] * x + V[4] * y + V[8] * z + V[12], vy = V[1] * x + V[5] * y + V[9] * z + V[13], vz = V[2] * x + V[6] * y + V[10] * z + V[14];
      if (vz < -2) {
        const sx = ((P[0] * vx + P[8] * vz) / -vz * 0.5 + 0.5) * cw, sy = (0.5 - (P[5] * vy + P[9] * vz) / -vz * 0.5) * ch;
        const wd = (t._w || (t._w = t.offsetWidth)) + 10, hidden = phone.matches ? sy > pr.top - 14 : sx < pr.right + 8;
        on = sx > 4 && sx + wd < cw && sy > 64 && sy < ch - 10 && !hidden
          && !taken.some((b) => sx < b[0] + b[2] && sx + wd > b[0] && Math.abs(sy - b[1]) < 19);   // earlier labels win
        if (on) { taken.push([sx - 8, sy, wd + 8]); t.style.transform = `translate(${sx.toFixed(1)}px,${(sy - 9).toFixed(1)}px)`; }
      }
    }
    if (t._on !== on) { t._on = on; t.classList.toggle('on', on); }
  }
  const pxPerNm = canvas.clientHeight / 2 * cam.proj[5] / st.dist;
  const nice = [2, 5, 10, 20, 50, 100, 200].find((n) => n * pxPerNm > 56) || 500;
  const bar = (nice * pxPerNm).toFixed(0) + 'px';
  if (shown.bar !== bar + nice) { shown.bar = bar + nice; $('scaleLine').style.width = bar; $('scaleText').textContent = nice + ' nm'; }
}

// ---- frame loop ----------------------------------------------------------------------------------
const maxFrames = +params.get('frames') || 0; let drawn = 0;
let last = performance.now(), clock = 0, slow = 0, frames = 0, shownGlu = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!reduced || st.play) clock += dt;
  if (st.play) {
    st.p = Math.min(1, st.p + dt / 26);
    if (st.p >= 1) st.play = false;
    syncUI();
  }
  if (st.spin && !pointers.size) { st.az = (st.az + dt * 3.2) % 360; syncUI(); }
  scene.update(st, clock);
  if (scene.glutamate !== shownGlu) {
    shownGlu = scene.glutamate;
    $('sizeNote').textContent = `Holds about ${(Math.round(shownGlu / 50) * 50).toLocaleString('en')} glutamate molecules at 150 mM`;
  }
  setCamera();
  scene.draw(cam, st, clock);
  if (st.labels) placeLabels();
  // If the device cannot keep up, thin the lipids (each one is then drawn a little larger).
  if (++frames > 30 && !params.has('q')) {
    slow = slow * 0.95 + dt * 0.05;
    if (slow > 0.034 && frames > 90 && quality > 0.22) { quality *= 0.7; scene.setQuality(quality); frames = 0; slow = 0; }
  }
  if (++drawn === maxFrames) { document.documentElement.dataset.done = '1'; return; }   // ?frames=N stops the loop, for still captures
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { frames = 0; slow = 0; last = performance.now(); });
syncUI();
if (!reduced && !params.has('p') && !params.has('still')) setTimeout(() => { if (st.p === 0) { st.play = true; syncUI(); } }, 1400);
requestAnimationFrame(frame);
