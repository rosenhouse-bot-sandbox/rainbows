// Stage 6: why each colour is slowed by a different amount. Not to scale: in real water there are
// about a thousand layers of molecules in one wavelength; here each drawn layer stands for hundreds.
//
// The model is the Lorentz oscillator that gives optics.nWater: each molecule's electron cloud is held
// by a spring that rings at an ultraviolet frequency ω0, and light at ω drives it with amplitude
// ∝ 1/(ω0² − ω²). Light meets the surface head-on here (normal incidence), travelling along +x.
import { V, DEG, rng } from '../gl.js';
import * as O from '../optics.js';
import { backdrop } from './common.js';

const NL = 10, DX = 0.95, X1 = 0.55, AMP = 1.35, XMIN = -8.5, XMAX = X1 + NL * DX + 0.4;
const lamD = l => 4.2 * l / 550;                 // drawn vacuum wavelength, scene units
let mols = [];
const WHITE = [0.82, 0.88, 1.0], BCOL = [0.35, 0.75, 1.0];

function fields(l, T) {
  const n = O.nWater(l), k0 = 2 * Math.PI / lamD(l), w = k0 * 2.1, r = (1 - n) / (1 + n), t = 2 / (1 + n);
  return { n, k0, r, t,
    E: x => x < 0 ? Math.cos(k0 * x - w * T) + r * Math.cos(-k0 * x - w * T) : t * Math.cos(n * k0 * x - w * T),
    B: x => x < 0 ? Math.cos(k0 * x - w * T) - r * Math.cos(-k0 * x - w * T) : n * t * Math.cos(n * k0 * x - w * T),
    free: x => Math.cos(k0 * x - w * T) };
}
const pct = x => (x * 100).toFixed(1) + '%';

export default {
  id: 'atoms', name: 'Molecules', scale: '1 nm', scaleNote: 'not to scale: see the note', modes: false, focus: false,
  controls: ['lambda'], lambdaMin: 250, bloom: 1.0, exposure: 1.0,
  cam: { type: 'orbit', target: [1.2, 0, 0], yaw: 0.5, pitch: 0.26, dist: 23, fov: 34,
    lim: { yaw: [-0.25, 1.2], pitch: [-0.15, 0.85], dist: [13, 29] } },

  caption(S) {
    return S.lambda < 400
      ? { title: 'Toward the ultraviolet, the pull grows fast',
        body: 'Water\'s electrons ring naturally at an ultraviolet frequency, near 100 nm. The closer the light comes to that note, the harder it swings them, the more of the wave\'s energy sits in the molecules at any moment, and the slower the light goes.' }
      : { title: 'Why violet is slowed more than red',
        body: 'The light\'s electric field pushes the electron cloud of every water molecule back and forth. Each layer of swinging charge sends out its own faint wave, a quarter-cycle late, and adding that to the light sets the whole wave back a little. Violet is closer than red to the ultraviolet note at which these electrons ring, so it swings them harder, is set back more by each layer, and travels slower. That is the entire reason the colours separate.' };
  },
  readout(S) {
    const l = S.lambda, e = O.energySplit(l), lag = O.lagPerLayerDeg(l), col = O.cssRGB(O.wlRGB(l));
    const C = { el: col, st: '#f7b04d', mo: '#ff6b5e', mg: '#58b8ff' };
    const bar = (name, parts) => `<div class="bar"><span>${name}</span><div>${parts.map(([w, c]) => `<i style="width:${(w * 100).toFixed(2)}%;background:${c}"></i>`).join('')}</div></div>`;
    const lag1000 = lag * 1000, a = -lag1000 * DEG;
    const x2 = 48 + 34 * Math.cos(a), y2 = 48 - 34 * Math.sin(a);
    return `<div class="energy"><h3>Where the wave's energy is</h3>
${bar('Air', [[0.5, C.el], [0.5, C.mg]])}
${bar('Water', [[e.electric, C.el], [e.stretch, C.st], [e.motion, C.mo], [e.magnetic, C.mg]])}
<div class="keyrow"><span><i style="background:${C.el}"></i>electric field ${pct(e.electric)}</span><span><i style="background:${C.st}"></i>stretched molecules ${pct(e.stretch)}</span><span><i style="background:${C.mo}"></i>moving electrons ${pct(e.motion)}</span><span><i style="background:${C.mg}"></i>magnetic field ${pct(e.magnetic)}</span></div>
<p>In air the energy is half electric and half magnetic, and all of it travels. In water, part of the electric half is held in molecules being stretched. Energy parked in matter is going nowhere, so the wave as a whole moves slower. Nearer the ultraviolet, more is parked.</p></div>
<div class="phasor"><svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="34" fill="none" stroke="rgba(234,240,255,.18)"/>
<line x1="48" y1="48" x2="82" y2="48" stroke="rgba(234,240,255,.45)" stroke-width="2" stroke-dasharray="3 3"/>
<path d="M ${48 + 20} 48 A 20 20 0 ${lag1000 > 180 ? 1 : 0} 1 ${48 + 20 * Math.cos(a)} ${48 - 20 * Math.sin(a)}" fill="none" stroke="${col}" stroke-width="1.5"/>
<line x1="48" y1="48" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="3" stroke-linecap="round"/></svg>
<p>Each layer of molecules, 0.31 nm thick, sets the wave back by <b>${lag.toFixed(4)}°</b>. After 1000 layers it is <b>${lag1000.toFixed(0)}°</b> behind where it would have been (dashed). Red: ${(O.lagPerLayerDeg(700) * 1000).toFixed(0)}°. Violet: ${(O.lagPerLayerDeg(400) * 1000).toFixed(0)}°.</p></div>
<dl><dt>Refractive index</dt><dd>${e.n.toFixed(4)}</dd>
<dt>Crests travel at</dt><dd>${e.vPhase.toFixed(4)} c</dd>
<dt>Energy travels at</dt><dd>${e.vEnergy.toFixed(4)} c</dd>
<dt>Electron swing, against a slow push</dt><dd>× ${e.response.toFixed(3)}</dd>
<dt>Real layers per drawn layer</dt><dd>about ${Math.round(DX / (lamD(l) / e.n) * (l / e.n) / 0.31 / 10) * 10}</dd></dl>`;
  },
  labels(S) {
    const n = O.nWater(S.lambda);
    return [
      { p: [-7.6, 2.9, 0], text: 'Air', cls: 'big' }, { p: [1.0, 2.9, 0], text: 'Water', cls: 'big' },
      { p: [-5.2, AMP + 0.25, 0], text: 'Electric field' },
      { p: [-4.2, 0, AMP + 0.2], text: 'Magnetic field', cls: 'far' },
      { p: [XMAX + 0.2, 0.9, 0], text: 'Where the crests would be at full speed', cls: 'note' },
      { p: [mols[3].x, mols[3].y - 0.25, mols[3].z], text: 'Electron cloud, pushed against the field', cls: 'far' },
    ];
  },

  init() {
    const r = rng(7);
    for (let j = 0; j < NL; j++) for (let k = 0; k < 8; k++) {
      let y, z; do { y = (r() * 2 - 1) * 2.7; z = (r() * 2 - 1) * 2.4; } while (Math.abs(y) < 0.5 && Math.abs(z) < 0.5);
      mols.push({ x: X1 + j * DX + (r() - 0.5) * 0.3, y, z });
    }
  },

  draw(R, S, T) {
    const l = S.lambda, F = fields(l, T), col = O.wlRGB(l), e = O.energySplit(l);
    backdrop(R, T, [0.012, 0.016, 0.04], [0.003, 0.004, 0.012], [0.02, 0.05, 0.12], [1, 0, 0]);

    // the surface and the body of water
    for (let i = -4; i <= 4; i++) {
      R.seg([0, -3.2, i * 0.7], [0, 3.2, i * 0.7], BCOL, 0.14, 1.1); R.seg([0, i * 0.8, -2.8], [0, i * 0.8, 2.8], BCOL, 0.14, 1.1);
    }
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) R.seg([0, sy * 3.2, sz * 2.8], [XMAX, sy * 3.2, sz * 2.8], BCOL, 0.3, 1.2, 0.02);
    R.seg([XMIN, 0, 0], [XMAX + 0.6, 0, 0], WHITE, 0.22, 1.1);
    R.flushLines();

    // the wave: electric field up-down, magnetic field side to side, in step
    const STEP = 0.07; let pe = null, pb = null, pf = null, i = 0;
    for (let x = XMIN; x <= XMAX; x += STEP, i++) {
      const edge = Math.min(1, (x - XMIN) / 1.2, (XMAX - x) / 0.8);
      const E = [x, AMP * F.E(x), 0], B = [x, 0, AMP * F.B(x)];
      if (pe) { R.seg(pe, E, col, 0.95 * edge, 2.6); R.seg(pb, B, BCOL, 0.5 * edge, 1.8); }
      if (i % 3 === 0) { R.seg([x, 0, 0], E, col, 0.3 * edge, 1.1); R.seg([x, 0, 0], B, BCOL, 0.16 * edge, 1.0); }
      pe = E; pb = B;
    }
    R.flushLines();
    // the wave as it would be without the water, for comparison
    for (let x = 0; x <= XMAX; x += STEP) {
      const p = [x, AMP * F.free(x), 0];
      if (pf) R.seg(pf, p, WHITE, 0.4, 1.3); pf = p;
    }
    R.flushLines({ dash: [0.3, 0, 0.5] });

    // molecules: a fixed core and an electron cloud displaced against the field
    const swing = 0.3 * e.response / F.t;
    for (const m of mols) {
      const Ex = F.E(m.x), dy = -swing * Ex, stored = Ex * Ex;
      R.pt([m.x, m.y, m.z], [1.0, 0.45, 0.35], 0.6, 0.12);
      R.pt([m.x, m.y + dy, m.z], [0.3, 0.55, 1.0], 0.16 + 0.1 * stored, 0.42);
      R.pt([m.x, m.y + dy, m.z], [1.0, 0.72, 0.3], 0.3 * stored * (e.matter / 0.23), 0.3);
      R.seg([m.x, m.y, m.z], [m.x, m.y + dy, m.z], [1.0, 0.72, 0.3], 0.8, 1.6);
    }
    R.flushPoints(); R.flushLines();
  },
};
