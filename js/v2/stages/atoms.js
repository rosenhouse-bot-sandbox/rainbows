// Stage 6: why each colour is slowed by a different amount. Not to scale: in real water there are
// about a thousand layers of molecules in one wavelength; here each drawn layer stands for hundreds.
//
// The model is the Lorentz oscillator that gives optics.nWater: each molecule's electron cloud is held
// by a spring that rings at an ultraviolet frequency ω0, and light at ω drives it with amplitude
// ∝ 1/(ω0² − ω²). The surface is the plane x = 0, with water at x > 0; light arrives at an angle you set.
import { V, DEG, rng } from '../gl.js';
import * as O from '../optics.js';
import { backdrop } from './common.js';

const NL = 9, DX = 0.95, X1 = 0.55, AMP = 1.3, SI = 8.2, ST = 9.6, SR = 4.6, W = 2.3, YF = -3.0, XB = 8.6, ZB = 7.2;
const lamD = l => 3.2 * l / 550;                 // drawn vacuum wavelength, scene units
let mols = [];
const WHITE = [0.82, 0.88, 1.0], BCOL = [0.35, 0.75, 1.0];

// The exact plane-wave solution for light arriving at an angle with its electric field along y
// (across the plane of the bend, which is the floor of the scene). Fresnel gives r and t.
function setup(S, T) {
  const l = S.lambda, n = O.nWater(l), th = Math.min(75, S.tilt) * DEG;
  const si = Math.sin(th), ci = Math.cos(th), sT = si / n, cT = Math.sqrt(1 - sT * sT);
  const k0 = 2 * Math.PI / lamD(l), wT = k0 * 2.1 * T, r = (ci - n * cT) / (ci + n * cT), t = 1 + r;
  return { l, n, th, thT: Math.asin(sT), k0, wT, r, t,
    di: [ci, 0, -si], dt: [cT, 0, -sT], dr: [-ci, 0, -si],          // directions of travel
    bi: [si, 0, ci], bt: [sT, 0, cT], br: [si, 0, -ci],             // the magnetic field's direction, k × E
    inWater: p => t * Math.cos(n * k0 * (cT * p[0] - sT * p[2]) - wT) };
}
const pct = x => (x * 100).toFixed(1) + '%';

export default {
  id: 'atoms', name: 'Molecules', scale: '1 nm', scaleNote: 'not to scale: see the note', modes: false, focus: false,
  controls: ['tilt', 'lambda'], lambdaMin: 250, bloom: 1.0, exposure: 1.0,
  cam: { type: 'orbit', target: [1.0, -1.2, -0.3], yaw: 0.3, pitch: 0.7, dist: 32, fov: 34,
    lim: { yaw: [-0.3, 1.35], pitch: [0.04, 1.05], dist: [15, 40] } },

  caption(S) {
    return S.lambda < 400
      ? { title: 'Toward the ultraviolet, the pull grows fast',
        body: 'Water\'s electrons ring naturally at an ultraviolet frequency, near 100 nm. The closer the light comes to that note, the harder it swings them, the more of the wave\'s energy sits in the molecules at any moment, and the slower the light goes.' }
      : { title: 'Why violet is slowed more than red',
        body: 'The light\'s electric field pushes the electron cloud of every water molecule back and forth. Each layer of swinging charge sends out its own faint wave, a quarter-cycle late, and adding that to the light sets the whole wave back a little. Violet is closer than red to the ultraviolet note at which these electrons ring, so it swings them harder, is set back more by each layer, and travels slower. Arriving at an angle, one side of each crest reaches the water first and is held back first, so the crest swings round: that is the bend, and violet swings further.' };
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
<dl><dt>Arrives at, continues at</dt><dd>${Math.min(75, S.tilt).toFixed(1)}° → ${(Math.asin(Math.sin(Math.min(75, S.tilt) * DEG) / e.n) / DEG).toFixed(1)}°</dd>
<dt>Refractive index</dt><dd>${e.n.toFixed(4)}</dd>
<dt>Crests travel at</dt><dd>${e.vPhase.toFixed(4)} c</dd>
<dt>Energy travels at</dt><dd>${e.vEnergy.toFixed(4)} c</dd>
<dt>Electron swing, against a slow push</dt><dd>× ${e.response.toFixed(3)}</dd>
<dt>Real layers per drawn layer</dt><dd>about ${Math.round(DX / (lamD(l) / e.n) * (l / e.n) / 0.31 / 10) * 10}</dd></dl>`;
  },
  labels(S) {
    const c = setup(S, 0), at = (d, k, up = 0, b = null, kb = 0) => { const p = V.mul(d, k); if (b) { p[0] += b[0] * kb; p[2] += b[2] * kb; } p[1] += up; return p; };
    const m = molPos(mols[3], c);
    const mid = (a, b) => V.norm(V.add(a, b));
    return [
      { p: [-5.5, 3.0, 5.5], text: 'Air', cls: 'big' }, { p: [1.2, 3.0, -6.2], text: 'Water', cls: 'big' },
      { p: at(c.di, -5.4, AMP + 0.3), text: 'Electric field' },
      { p: at(c.di, -3.4, 0, c.bi, AMP + 0.3), text: 'Magnetic field', cls: 'far' },
      { p: at(c.di, ST * 0.82, 0.4), text: 'Path and crests if the light had kept its speed', cls: 'note' },
      { p: at(c.dt, ST * 0.9, YF + 0.1, c.bt, W * 0.6), text: 'Crests, drawn on the floor', cls: 'far' },
      { p: [m[0], m[1] - 0.3, m[2]], text: 'Electron cloud, pushed against the field', cls: 'far' },
      { p: at(mid(c.di, [1, 0, 0]), -2.7, YF), text: (c.th / DEG).toFixed(1) + '°', cls: 'num' },
      { p: at(mid(c.dt, [1, 0, 0]), 2.9, YF), text: (c.thT / DEG).toFixed(1) + '°', cls: 'num' },
    ];
  },

  init() {
    const r = rng(7);
    for (let j = 0; j < NL; j++) for (let k = 0; k < 9; k++) {
      let y, u; do { y = (r() * 2 - 1) * 2.6; u = (r() * 2 - 1) * 2.3; } while (Math.abs(y) < 0.55 && Math.abs(u) < 0.55);
      mols.push({ x: X1 + j * DX + (r() - 0.5) * 0.3, y, u });
    }
  },

  draw(R, S, T) {
    const c = setup(S, T), col = O.wlRGB(c.l), e = O.energySplit(c.l), lam = lamD(c.l);
    backdrop(R, T, [0.012, 0.016, 0.04], [0.003, 0.004, 0.012], [0.02, 0.05, 0.12], [1, 0, 0]);

    // the surface (the plane x = 0) and the body of water behind it
    for (let i = -6; i <= 6; i++) R.seg([0, -3.0, i * ZB / 6], [0, 3.0, i * ZB / 6], BCOL, 0.1, 1.0);
    for (let i = -3; i <= 3; i++) R.seg([0, i, -ZB], [0, i, ZB], BCOL, i === -3 ? 0.4 : 0.1, 1.0);
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) R.seg([0, sy * 3, sz * ZB], [XB, sy * 3, sz * ZB], BCOL, 0.28, 1.2, 0.02);
    R.flushLines();
    // the perpendicular to the surface, on the floor, and the two angles measured from it
    R.seg([-4.5, YF, 0], [5.5, YF, 0], WHITE, 0.5, 1.2);
    R.flushLines({ dash: [0.3, 0, 0.5] });
    R.arc([0, YF, 0], [-1, 0, 0], [0, 0, 1], 2.0, 0, c.th, WHITE, 0.6, 1.3, 20);
    R.arc([0, YF, 0], [1, 0, 0], [0, 0, -1], 2.2, 0, c.thT, WHITE, 0.6, 1.3, 20);

    // crests, drawn on the floor: lines of equal phase across the beam. They meet at the surface.
    // In the water they sit closer together, so to stay joined they must turn.
    const crests = (d, b, step, s0, s1, half, keepWater, colr, alpha) => {
      const ph = ((c.wT / (2 * Math.PI)) % 1 + 1) % 1;
      for (let m = Math.ceil(s0 / step - ph); (m + ph) * step <= s1; m++) {
        const s = (m + ph) * step;
        let ax = d[0] * s - b[0] * half, az = d[2] * s - b[2] * half, bx = d[0] * s + b[0] * half, bz = d[2] * s + b[2] * half;
        const ina = keepWater ? ax >= 0 : ax <= 0, inb = keepWater ? bx >= 0 : bx <= 0;
        if (!ina && !inb) continue;
        if (ina !== inb) { const t = ax / (ax - bx), cz = az + (bz - az) * t; if (ina) { bx = 0; bz = cz; } else { ax = 0; az = cz; } }
        const fade = Math.min(1, (s - s0) / 1.5, (s1 - s) / 1.5);
        R.seg([ax, YF, az], [bx, YF, bz], colr, alpha * fade, 1.8);
      }
    };
    const halfT = W * Math.cos(c.thT) / Math.cos(c.th), reach = W * Math.tan(c.th);
    crests(c.di, c.bi, lam, -SI, reach, W, false, col, 0.75);
    crests(c.dt, c.bt, lam / c.n, -halfT * Math.tan(c.thT), ST, halfT, true, col, 0.75);
    R.flushLines();
    // the beam's path on the floor, where the two angles are measured
    const fl = (d, k) => [d[0] * k, YF, d[2] * k];
    R.seg(fl(c.di, -SI), [0, YF, 0], col, 0.15, 1.6, 0.8); R.seg([0, YF, 0], fl(c.dt, ST), col, 0.8, 1.6, 0.15);
    R.flushLines();
    crests(c.di, c.bi, lam, -reach, ST * 0.85, W, true, WHITE, 0.28);
    R.seg([0, YF, 0], fl(c.di, ST * 0.85), WHITE, 0.45, 1.2, 0.05);
    R.seg([0, 0, 0], V.mul(c.di, ST * 0.85), WHITE, 0.4, 1.2, 0.05);
    R.flushLines({ dash: [0.3, 0, 0.5] });

    // the wave along each ray: electric field up-down, magnetic field across, in step
    const ribbon = (d, b, s0, s1, k, amp, bamp, alpha, free) => {
      let pe = null, pb = null, i = 0;
      for (let s = s0; s <= s1; s += 0.07, i++) {
        const f = Math.cos(k * s - c.wT), edge = Math.min(1, (s - s0) / 1.2 + (s0 === 0 ? 1 : 0), (s1 - s) / 0.9) * alpha;
        const o = [d[0] * s, 0, d[2] * s], E = [o[0], AMP * amp * f, o[2]], B = [o[0] + b[0] * AMP * bamp * f, 0, o[2] + b[2] * AMP * bamp * f];
        if (free) { if (pe) R.seg(pe, E, WHITE, 0.4 * edge, 1.3); pe = E; continue; }
        if (pe) { R.seg(pe, E, col, 0.95 * edge, 2.6); R.seg(pb, B, BCOL, 0.5 * edge, 1.8); }
        if (i % 3 === 0) { R.seg(o, E, col, 0.3 * edge, 1.1); R.seg(o, B, BCOL, 0.16 * edge, 1.0); }
        pe = E; pb = B;
      }
    };
    R.seg(V.mul(c.di, -SI), [0, 0, 0], WHITE, 0.2, 1.1); R.seg([0, 0, 0], V.mul(c.dt, ST), WHITE, 0.2, 1.1);
    ribbon(c.di, c.bi, -SI, 0, c.k0, 1, 1, 1);
    ribbon(c.dt, c.bt, 0, ST, c.n * c.k0, c.t, c.n * c.t, 1);
    ribbon(c.dr, c.br, 0, SR, c.k0, c.r, c.r, 0.55);                 // the small part that reflects
    R.flushLines();
    ribbon(c.di, c.bi, 0, ST * 0.85, c.k0, 1, 1, 1, true);          // the wave as it would be without the water
    R.flushLines({ dash: [0.3, 0, 0.5] });

    // molecules, in layers parallel to the surface: a fixed core and an electron cloud displaced against the field
    const swing = 0.3 * e.response / c.t;
    for (const m of mols) {
      const p = molPos(m, c), Ex = c.inWater(p), dy = -swing * Ex, stored = Ex * Ex / (c.t * c.t);
      R.pt(p, [1.0, 0.45, 0.35], 0.6, 0.12);
      const q = [p[0], p[1] + dy, p[2]];
      R.pt(q, [0.3, 0.55, 1.0], 0.16 + 0.1 * stored, 0.42);
      R.pt(q, [1.0, 0.72, 0.3], 0.3 * stored * (e.matter / 0.23), 0.3);
      R.seg(p, q, [1.0, 0.72, 0.3], 0.8, 1.6);
    }
    R.flushPoints(); R.flushLines();
  },
};
// molecules follow the refracted beam, so they stay in the light at any angle and colour
function molPos(m, c) { return [m.x, m.y, -Math.tan(c.thT) * m.x + m.u]; }
