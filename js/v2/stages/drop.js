// Stage 4: one raindrop, traced in three dimensions.
// The drop is a unit sphere at the origin; sunlight travels along +x. Every ray stays in the plane
// that holds it and the drop's axis, so a ray is traced in 2D (optics.traceDrop) and then turned
// about the axis by its azimuth.
import { V, DEG, rng, modelTRS, lerp } from '../gl.js';
import * as O from '../optics.js';
import { vis, backdrop, eyeGlyph } from './common.js';

const SPEC = O.spectrumSet([430, 470, 510, 550, 590, 630, 670]);
const SPEC3 = O.spectrumSet([450, 545, 640]);
const SPEC_EYE = O.spectrumSet([410, 430, 450, 470, 490, 510, 530, 550, 570, 590, 610, 630, 650, 670, 690]);
const N_MID = O.nWater(550);
const X0 = -4.6, EXT = 5.0, EYE_DIST = 4.6;
const rot = (p, phi) => [p[0], p[1] * Math.cos(phi), p[1] * Math.sin(phi)];

const nEff = (sp, S) => S.exag ? N_MID + (sp.n - N_MID) * 5 : sp.n;
// The eye's direction: `bowpos` 0 puts the drop on the violet edge of the bow, 1 on the red edge.
export function eyeAngle(S) {
  const a0 = O.bowAngle(nEff({ n: O.nWater(400) }, S)), a1 = O.bowAngle(nEff({ n: O.nWater(700) }, S));
  return lerp(a0, a1, S.bowpos);
}

// One route through the drop as a polyline with the optical path length to each corner.
function branch(tr, n, order) {
  const out = tr.outs.find(o => o.order === order);
  const P = [[X0, tr.hits[0][1]]], L = [0], I = [1];
  for (let k = 0; k <= out.at; k++) {
    const q = tr.hits[k], p = P[P.length - 1];
    L.push(L[L.length - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]) * (k === 0 ? 1 : n));
    P.push(q); I.push(k < out.at ? tr.I[k] : out.I);
  }
  const q = tr.hits[out.at];
  P.push([q[0] + out.dir[0] * EXT, q[1] + out.dir[1] * EXT]); L.push(L[L.length - 1] + EXT);
  return { P, L, I, order, theta: O.antisolarAngle(out.dir) };
}
function pointAt(br, l) {
  const L = br.L;
  for (let k = 0; k + 1 < L.length; k++) if (l <= L[k + 1]) {
    const t = (l - L[k]) / (L[k + 1] - L[k]), a = br.P[k], b = br.P[k + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, k];
  }
  return null;
}
const OWN = { '-1': 1, 0: 0, 1: 2, 2: 3 };       // first leg a branch does not share with an earlier one

let prog = null, cache = null, cacheKey = '', photons = [], photonKey = '';
const A = [0, 0, 0], B = [0, 0, 0];
const rand = rng(11);

function build(S) {
  const orders = S.second ? 2 : 1, thetaE = eyeAngle(S);
  const c = { thetaE, fan: [], cone: [], disc: [], eye: [], eyeCol: [0, 0, 0], desc: null };
  for (const sp of SPEC) {
    const n = nEff(sp, S);
    for (let j = 0; j < 20; j++) c.fan.push({ sp, phi: 0, tr: O.traceDrop((j + 0.5) / 20 * 0.995, n, orders) });
    const bd = O.bowB(n);
    for (let a = 0; a < 30; a++) c.cone.push({ sp, phi: (a + 0.5) / 30 * 2 * Math.PI, tr: O.traceDrop(bd, n, orders) });
    for (const b of [0.25, 0.5, 0.7, 0.86, 0.96]) for (let a = 0; a < 10; a++)
      c.disc.push({ sp, phi: (a + (b * 7 % 1)) / 10 * 2 * Math.PI, tr: O.traceDrop(b, n, orders) });
  }
  // rays that leave within the Sun's half-width of the eye's direction, for a fine set of colours
  const tol = (S.exag ? 0.8 : 0.3) * DEG, M = 260;
  for (const sp of SPEC_EYE) {
    const n = nEff(sp, S);
    for (let j = 0; j < M; j++) {
      const b = (j + 0.5) / M, tr = O.traceDrop(b, n, 1), out = tr.outs[2];
      if (Math.abs(O.antisolarAngle(out.dir) - thetaE) < tol) {
        c.eye.push({ sp, phi: 0, tr, b });
        for (let k = 0; k < 3; k++) c.eyeCol[k] += sp.part[k] * out.I * b;
      }
    }
  }
  const m = Math.max(...c.eyeCol, 1e-9);
  c.eyeLevel = Math.min(1, 0.2 + m / 0.006);
  c.eyeCol = c.eyeCol.map(x => x / m);
  c.desc = O.traceDrop(O.bowB(nEff(SPEC[3], S)), nEff(SPEC[3], S), 2);
  // dense fans for drawing wavefronts
  c.fronts = SPEC3.map(sp => {
    const n = nEff(sp, S), rays = [];
    for (let j = 0; j < 120; j++) {
      const b = ((j + 0.5) / 120 * 2 - 1) * 0.992, tr = O.traceDrop(b, n, orders), br = {};
      for (let o = -1; o <= orders; o++) br[o] = branch(tr, n, o);
      rays.push(br);
    }
    return { sp, n, rays };
  });
  return c;
}

// The eye is drawn on the beam that leaves toward it (in reality it is hundreds of metres away).
function eyeAt(c) { const q = c.desc.hits[2]; return [q[0] - Math.cos(c.thetaE) * EYE_DIST, q[1] - Math.sin(c.thetaE) * EYE_DIST, 0]; }

function ensure(S) {
  const key = [S.bowpos, S.exag, S.second].join();
  if (key !== cacheKey) { cache = build(S); cacheKey = key; }
  return cache;
}

function drawRay(R, ray, alpha, show, w = 1.5) {
  const { tr, phi, sp } = ray, col = sp.part, h = tr.hits;
  R.seg(rot([X0, h[0][1]], phi), rot(h[0], phi), col, alpha * show.inc * 0.25, w, alpha * show.inc);
  const legs = Math.min(tr.I.length, show.legs);
  for (let k = 0; k < legs; k++) R.seg(rot(h[k], phi), rot(h[k + 1], phi), col, alpha * vis(tr.I[k]) * show.leg, w);
  for (const out of tr.outs) {
    const s = show[out.order]; if (!s) continue;
    const a = alpha * vis(out.I) * s, p = h[out.at], len = out.order === 1 ? EXT : EXT * 0.62;
    R.seg(rot(p, phi), rot([p[0] + out.dir[0] * len, p[1] + out.dir[1] * len], phi), col, a, w, a * 0.08);
  }
}

function spawn(ph, S, T, stagger) {
  const c = cache, orders = S.second ? 2 : 1;
  let br, sp, phi;
  if (S.focus === 'eye' && c.eye.length) {
    const e = c.eye[Math.floor(rand() * c.eye.length)];
    sp = e.sp; phi = (rand() - 0.5) * 0.12; br = branch(e.tr, nEff(sp, S), 1);
  } else {
    sp = SPEC[Math.floor(rand() * SPEC.length)];
    const n = nEff(sp, S), tr = O.traceDrop(Math.sqrt(rand()) * 0.995, n, orders);
    phi = rand() * 2 * Math.PI;
    let u = rand(), order = orders;
    for (const out of tr.outs) { if (u < out.I) { order = out.order; break; } u -= out.I; }
    br = branch(tr, n, order);
  }
  ph.br = br; ph.sp = sp; ph.phi = phi; ph.end = br.L[br.L.length - 1];
  ph.t0 = T - (stagger ? rand() * ph.end / 2.4 : 0);
}

export default {
  id: 'drop', name: 'Drop', scale: '1 mm', modes: true, focus: true,
  controls: ['mode', 'focus', 'bowpos', 'exag', 'second'],
  bloom: 1.0, exposure: 1.0,
  cam: { type: 'orbit', target: [-0.5, -0.95, 0], yaw: 0.2, pitch: 0.15, dist: 13.5, fov: 34,
    lim: { yaw: [-1.25, 1.25], pitch: [-0.6, 1.0], dist: [4.5, 17] } },
  // the crossing the next scale is set to show: where the rainbow ray enters, meets the back, or leaves
  portal: S => { const h = O.traceDrop(O.bowB(N_MID), N_MID, 1).hits[S.cross === 'enter' ? 0 : S.cross === 'exit' ? 2 : 1]; return [h[0], h[1], 0]; },

  caption(S) {
    if (S.focus === 'eye') return { title: 'The few rays that reach you',
      body: 'Only light leaving in exactly your direction counts. Rays that enter near one particular height all leave at almost the same angle, so they pile up there: that crowding is the bow. Slide the drop through the bow and a different colour piles up toward you.' };
    if (S.focus === 'sun') return { title: 'Where all the sunlight goes',
      body: 'Sunlight covers the whole face of the drop. About 6% glances off the front and 89% goes straight out through the back. Only about 5% reflects once inside and comes back out, crowded onto a hollow cone that opens 42° out from the line back toward the Sun.' };
    return S.mode === 'wave'
      ? { title: 'One wave, folded by a sphere',
        body: 'Each line is a crest. In water the crests travel at three-quarters of their speed in air, so they bunch up and the front bends. After one reflection the front folds over on itself; the fold is where light is concentrated, and it leaves the drop 42° from the way back to the Sun.' }
      : { title: 'Bent, reflected, and bent again',
        body: 'Light bends as it enters, reflects off the back, and bends again as it leaves toward you. The back is not a perfect mirror: the light meets it at 40°, short of the 49° needed for total reflection, so most of it escapes there. Each colour bends by a slightly different amount.' };
  },

  readout(S) {
    const c = ensure(S), t = c.desc, d = x => (x / DEG).toFixed(1) + '°';
    const lam = (() => { if (S.exag) return null; return O.wavelengthAt(c.thetaE); })();
    const seen = lam ? `${Math.round(lam)} nm` : (S.bowpos < 0 ? 'faint white (inside the bow)' : S.bowpos > 1 ? 'almost nothing (outside)' : 'shown on the eye marker');
    const out = k => (t.outs[k].I * 100).toFixed(k === 3 ? 1 : 1) + '%';
    return `<dl>
<dt>This drop sits</dt><dd>${d(c.thetaE)} from the antisolar point</dd>
<dt>It sends your eye</dt><dd>${seen}</dd>
<dt>Green ray enters at</dt><dd>${d(t.inc)}, bends to ${d(t.refr)}</dd>
<dt>Critical angle</dt><dd>${d(O.criticalAngle(N_MID))} (never reached)</dd>
<dt>Off the front</dt><dd>${out(0)}</dd>
<dt>Out through the back</dt><dd>${out(1)}</dd>
<dt>Primary bow</dt><dd>${out(2)}, ${(t.outs[2].Is / t.outs[2].I * 100).toFixed(0)}% polarised</dd>
<dt>Secondary bow</dt><dd>${out(3)}</dd></dl>`;
  },

  labels(S) {
    const c = cache; if (!c) return [];
    const e = [-Math.cos(c.thetaE), -Math.sin(c.thetaE), 0], h = c.desc.hits;
    const L = [
      { p: [X0 + 0.6, 1.25, 0], text: 'Sunlight' },
      { p: V.mad(eyeAt(c), e, 0.6), text: 'To your eye, far away', cls: 'strong' },
      { p: V.mad([0, 0, 0], V.norm([-Math.cos(c.thetaE / 2), -Math.sin(c.thetaE / 2), 0]), 2.5), text: (c.thetaE / DEG).toFixed(1) + '°', cls: 'num' },
      { p: [-3.9, 0.12, 0], text: 'Straight back toward the Sun', cls: 'far' },
    ];
    if (S.focus !== 'eye') L.push({ p: [h[1][0] + 0.9, h[1][1] - 0.5, 0], text: 'About 89% leaves here', cls: 'far' });
    L.push({ p: [h[1][0] + 0.05, h[1][1], 0], text: `Meets the back at ${(c.desc.refr / DEG).toFixed(0)}°, under the ${(O.criticalAngle(N_MID) / DEG).toFixed(0)}° critical angle: a partial mirror`, cls: 'note' });
    if (S.second && S.focus !== 'eye') { const o = c.desc.outs[3], q = h[3]; L.push({ p: [q[0] + o.dir[0] * 2.6, q[1] + o.dir[1] * 2.6, 0], text: 'Second reflection: the outer bow', cls: 'far' }); }
    return L;
  },

  init(R) {
    prog = R.rayProgram(`
uniform float uBody;
void main(){ vec3 ro = uEye, rd = rayDir();
  float b = dot(ro, rd), c = dot(ro, ro)-1.0, h = b*b-c;
  if(h < 0.0){ o = vec4(0.0); return; }
  h = sqrt(h); vec3 n1 = ro + rd*(-b-h), n2 = ro + rd*(-b+h);
  vec3 sun = vec3(-1.0, 0.0, 0.0);
  float f1 = pow(1.0-max(dot(n1,-rd),0.0), 3.0);
  vec3 col = vec3(0.30,0.52,0.95)*(0.035 + 0.55*f1);
  col += vec3(1.0,0.95,0.85)*pow(max(dot(reflect(rd,n1), sun),0.0), 90.0)*2.5;          // the Sun's glint
  col += vec3(0.5,0.7,1.0)*pow(max(dot(reflect(rd,-n2), -sun),0.0), 30.0)*0.25;         // light gathered at the back
  col += vec3(0.25,0.4,0.7)*0.05*smoothstep(0.0, 2.0, 2.0*h);
  o = vec4(col*uFade*uBody, 0.0); }`);
  },

  draw(R, S, T) {
    const c = ensure(S), key = cacheKey, f = S.focus, wave = S.mode === 'wave';
    backdrop(R, T, [0.012, 0.02, 0.045], [0.004, 0.006, 0.014], [0.12, 0.09, 0.05], [-1, 0, 0]);

    const e = [-Math.cos(c.thetaE), -Math.sin(c.thetaE), 0];
    // reference lines: the axis back toward the Sun, and the angle to the eye
    R.seg([0, 0, 0], [-4.6, 0, 0], [0.6, 0.7, 1], 0.28, 1.2, 0.05);
    R.seg([0, 0, 0], V.mul(e, EYE_DIST - 0.5), [0.6, 0.7, 1], 0.16, 1.2);
    R.arc([0, 0, 0], [-1, 0, 0], [0, -1, 0], 2.2, 0, c.thetaE, [0.7, 0.8, 1], 0.5, 1.4, 24);
    R.flushLines({ dash: [0.22, 0, 0.55] });
    // the normal at the back, with the angle of incidence
    const hb = c.desc.hits[1];
    R.seg(V.mul([hb[0], hb[1], 0], 0.45), V.mul([hb[0], hb[1], 0], 1.5), [0.7, 0.8, 1], 0.4, 1.2);
    eyeGlyph(R, eyeAt(c), [0, 0, 1], [-e[1], e[0], 0], 0.4, f === 'sun' ? [0.5, 0.5, 0.5] : c.eyeCol.map(x => x * c.eyeLevel + 0.08), f === 'sun' ? 0.4 : 1);
    R.flushLines(); R.flushPoints();

    if (!wave) {
      const k = 0.62;       // rays sit under the photons
      if (f === 'both') {
        const show = { inc: 0.55, leg: 1, legs: S.second ? 3 : 2, '-1': 0.25, 0: 0.4, 1: 1.25, 2: 0.9 };
        for (const r of c.fan) drawRay(R, r, 0.5 * k, show);
        const cone = { inc: 0.0, leg: 0.5, legs: 2, '-1': 0, 0: 0, 1: 1, 2: 0 };
        for (const r of c.cone) drawRay(R, r, 0.42 * k, cone, 1.2);
      } else if (f === 'sun') {
        const show = { inc: 0.7, leg: 1, legs: S.second ? 3 : 2, '-1': 0.9, 0: 0.9, 1: 1.1, 2: 0.9 };
        for (const r of c.disc) drawRay(R, r, 0.36 * k, show, 1.3);
        for (const r of c.cone) drawRay(R, r, 0.3 * k, { inc: 0, leg: 0.4, legs: 2, '-1': 0, 0: 0, 1: 1, 2: 0 }, 1.2);
      } else {
        const ghost = { inc: 0.5, leg: 1, legs: 2, '-1': 0, 0: 0.25, 1: 0.6, 2: 0 };
        for (const r of c.fan) drawRay(R, r, 0.07, ghost, 1.1);
        const a = Math.min(0.9, 9 / Math.max(6, c.eye.length));
        const show = { inc: 1, leg: 2.4, legs: 2, '-1': 0, 0: 0, 1: 4, 2: 0 };
        for (const r of c.eye) drawRay(R, r, a, show, 1.7);
      }
      R.flushLines();
      // photons: each one is a single colour and takes one route, chosen with the Fresnel odds
      const pk = key + f;
      if (photons.length === 0) for (let i = 0; i < 460; i++) photons.push({});
      const fresh = pk !== photonKey; photonKey = pk;
      for (const ph of photons) {
        if (fresh || !ph.br) spawn(ph, S, T, true);
        let l = (T - ph.t0) * 2.4;
        if (l > ph.end) { spawn(ph, S, T, false); l = 0; }
        const p = pointAt(ph.br, l); if (!p) continue;
        R.pt(rot(p, ph.phi), ph.sp.col, f === 'eye' ? 0.9 : 0.6, 0.036);
      }
      R.flushPoints({ minPx: 1.3 });
    } else {
      // crests: points of equal optical path length, joined across neighbouring rays
      const SP = 0.42, phase = (T * 0.55) % 1, orders = S.second ? 2 : 1, tolE = (S.exag ? 2.4 : 1.1) * DEG;
      for (const set of c.fronts) {
        const col = set.sp.part, rays = set.rays, nR = rays.length;
        for (let o = -1; o <= orders; o++) {
          const gain = f === 'eye' ? (o === 1 ? 2.6 : 0.05) : f === 'sun' ? 1 : (o === 1 ? 1.3 : o === 0 ? 0.55 : o === -1 ? 0.5 : 1);
          const own = (f === 'eye' && o === 1) ? 0 : OWN[o];
          const Lmax = rays[nR >> 1][o].L[rays[nR >> 1][o].L.length - 1] + 1.5;
          for (let l = phase * SP; l < Lmax; l += SP) {
            let pk = -1, pa = 0; A[2] = B[2] = 0;
            for (let j = 0; j < nR; j++) {
              const br = rays[j][o], L = br.L;
              let k = own; while (k + 1 < L.length && l > L[k + 1]) k++;
              if (l < L[k] || k + 1 >= L.length) { pk = -1; continue; }
              const t = (l - L[k]) / (L[k + 1] - L[k]), p0 = br.P[k], p1 = br.P[k + 1];
              B[0] = p0[0] + (p1[0] - p0[0]) * t; B[1] = p0[1] + (p1[1] - p0[1]) * t;
              let a = vis(br.I[k]) * gain;
              if (k === L.length - 2) a *= Math.max(0, 1 - (l - L[k]) / EXT);       // fade as it leaves
              if (f === 'eye' && o === 1) { const d = (br.theta - c.thetaE) / tolE; a *= Math.exp(-d * d) * (j >= nR / 2 ? 1 : 0); }
              if (pk === k && (a > 0.004 || pa > 0.004)) R.seg(A, B, col, pa * 0.7, 1.4, a * 0.7);
              A[0] = B[0]; A[1] = B[1]; pk = k; pa = a;
            }
          }
        }
      }
      R.flushLines({ keep: true });
      R.flushLines({ model: modelTRS([0, 0, 0], 1, Math.PI / 2), gain: 0.3 });
    }

    const gl = R.gl;
    gl.useProgram(prog.p); R.setRayUniforms(prog, T); gl.uniform1f(prog.u.uBody, 1);
    R.fullscreen(prog, 'add');
  },
};
