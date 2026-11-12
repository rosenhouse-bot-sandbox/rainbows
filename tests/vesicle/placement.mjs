// Frame-by-frame placement check for the Vesicle fusion scene.
//
//   node tests/vesicle/placement.mjs
//
// Runs the scene without a GPU at every step of fusion progress, for three vesicle sizes, in the
// cell and on glass, and tests every protein ball against the membrane shape. It fails if part of
// a cytoplasmic protein is on the far side of a membrane (in the vesicle's lumen or the cleft), if
// a protein's bulk is pushed into a membrane, or if a pHluorin tag is outside the lumen or lies
// across the axis of a pore too narrow for it. It cannot see anything that is only wrong to the
// eye: colours, timing, or two proteins overlapping each other.
import { Scene } from '../../js/vesicle/scene.js';
import { surf, D, ARRIVE } from '../../js/vesicle/profile.js';

// A stand-in for WebGL: constants are their own names, calls do nothing.
const gl = new Proxy({}, { get: (t, k) => typeof k === 'symbol' ? undefined : /^[A-Z0-9_]+$/.test(k) ? k
  : (...a) => k === 'getShaderParameter' ? true : k === 'getProgramParameter' ? (a[1] === 'ACTIVE_UNIFORMS' ? 0 : true) : k === 'getAttribLocation' ? 0 : {} });
const NAMES = { 3: 'syntaxin', 4: 'SNAP-25', 5: 'synaptobrevin', 6: 'synaptotagmin', 13: 'pHluorin', 14: 'pHluorin', 15: 'proton pump', 16: 'synaptophysin', 17: 'VGLUT', 18: 'Rab3', 19: 'tether' };
// How far a ball may sink into a membrane surface. Synaptotagmin's C2 domains are meant to dip in.
const SINK = { 6: 1.3 }, STEP = 0.005, tmp = new Float64Array(6);
const scene = new Scene(gl);
let findings = 0, frames = 0;

for (const vitro of [false, true]) for (const diam of [30, 42, 70]) {
  for (let i = 0; ; i++) {
    const p = Math.min(1, -ARRIVE + i * STEP);
    scene.update({ p, diam, cut: 0, dist: 165, vitro, angle: 68 }, 1);
    frames++;
    const S = scene.S, d = scene.dynData, L = [[], []];
    for (let leaf = 0; leaf < 2; leaf++) for (let j = 0; j <= 6000; j++) {
      surf(S, leaf, j < 4000 ? S.Av[leaf] * j / 4000 : S.Av[leaf] + Math.PI * Math.pow((j - 4000) / 2000 * 200, 2), 0, tmp);
      L[leaf].push(tmp[0], tmp[1], tmp[3], tmp[4]);
    }
    // Signed distance from one leaflet's headgroups: positive on the side its normal points to.
    const sd = (leaf, r, y) => { const q = L[leaf]; let best = 1e9, s = 0; for (let k = 0; k < q.length; k += 4) { const dx = r - q[k], dy = y - q[k + 1], dd = dx * dx + dy * dy; if (dd < best) { best = dd; s = dx * q[k + 2] + dy * q[k + 3]; } } return s; };
    const bad = new Map();
    for (let b = 0; b < scene.dyn.n; b++) {
      const k = b * 8, cat = Math.floor(d[k + 7] / 8), rad = d[k + 3];
      if (!NAMES[cat]) continue;
      const tag = (cat === 13 || cat === 14) && Math.abs(rad - 1.15) < 0.01;
      if ((cat === 13 || cat === 14) && !tag) continue;                    // glows, not molecules
      const r = Math.hypot(d[k], d[k + 2]), y = d[k + 1], cyto = sd(0, r, y), lumen = sd(1, r, y);
      let why = null;
      if (tag) {
        if (cyto > 0.4 && lumen < 0) why = 'is on the cytoplasmic side';
        else if (lumen > 0 && lumen < rad - 0.75) why = 'is pushed into the membrane';
        else if (r < rad - 0.3 && y > -D && y < S.hV) why = 'lies across the axis of the pore';
      } else if (cat === 5 && rad < 0.35 && lumen < 1.3 && cyto < 0) continue;    // the stem that carries the tag
      else if (lumen > 0.4 && cyto < 0) why = 'is on the lumen or cleft side';
      else if (rad >= 0.9 && cyto > 0.05 && cyto < rad - (SINK[cat] || 0.9)) why = 'is pushed into a membrane';
      if (why) { const key = NAMES[cat] + ' ' + why; bad.set(key, (bad.get(key) || 0) + 1); }
    }
    for (const [key, n] of bad) { findings++; if (findings <= 40) console.log(`${vitro ? 'on glass' : 'in cell'}, ${diam} nm, progress ${p.toFixed(3)}: ${key} (${n} balls)`); }
    if (p >= 1) break;
  }
}
console.log(`${frames} frames checked, ${findings} findings`);
process.exit(findings ? 1 : 0);
