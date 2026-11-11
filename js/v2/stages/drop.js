// Stage 4: one raindrop, traced in three dimensions.
// The drop is a unit sphere at the origin; sunlight travels along +x. Every ray stays in the plane
// that holds it and the drop's axis, so a ray is traced in 2D (optics.traceDrop) and then turned
// about the axis by its azimuth.
import { V, DEG, rng, modelTRS, lerp, sstep } from '../gl.js';
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
// The slider's track, painted with what each position sends the eye: faint white inside the bow, the
// colour whose bow passes through the eye across it, and next to nothing outside. `lo` and `hi` are
// the slider's ends; the stops are measured between the centres of the thumb's end positions.
export function bowTrack(lo, hi, thumb = 18) {
  const a0 = O.bowAngle(O.nWater(400)), a1 = O.bowAngle(O.nWater(700)), stops = [];
  const at = t => `calc(${thumb / 2}px + (100% - ${thumb}px) * ${((t - lo) / (hi - lo)).toFixed(4)})`;
  stops.push(`rgba(234,240,255,.3) ${at(-0.12)}`);
  for (let i = 0; i <= 12; i++) { const t = i / 12; stops.push(`${O.cssRGB(O.wlRGB(O.wavelengthAt(lerp(a0, a1, t))))} ${at(t)}`); }
  stops.push(`rgba(234,240,255,.08) ${at(1.1)}`);
  return `linear-gradient(90deg,${stops.join(',')})`;
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
// Where the rainbow ray meets the drop's surface, as an angle round the drop in the plane of the ray:
// it enters, and each later crossing is the same step further round.
export const CROSSINGS = ['enter', 'back', 'exit'];
const CROSS_AT = (() => { const t = O.traceDrop(O.bowB(N_MID), N_MID, 1); return CROSSINGS.map((_, i) => Math.atan2(t.hits[0][1], t.hits[0][0]) - i * (Math.PI - 2 * t.refr)); })();
export const crossAngle = c => CROSS_AT[Math.max(0, CROSSINGS.indexOf(c))];
const OWN = { '-1': 1, 0: 0, 1: 2, 2: 3 };       // first leg a branch does not share with an earlier one

const PH_SPEED = 2.4;      // photon speed along its route, drop radii per second
let prog = null, cache = null, cacheKey = '', photons = [], photonKey = '';
const A = [0, 0, 0], B = [0, 0, 0];
const rand = rng(11);

function build(S) {
  const orders = S.second ? 2 : 1, thetaE = eyeAngle(S);
  const c = { thetaE, fan: [], cone: [], disc: [], eye: [], eyeCum: [], eyeCol: [0, 0, 0], desc: null };
  for (const sp of SPEC) {
    const n = nEff(sp, S);
    for (let j = 0; j < 20; j++) c.fan.push({ sp, phi: 0, tr: O.traceDrop((j + 0.5) / 20 * 0.995, n, orders) });
    const bd = O.bowB(n);
    for (let a = 0; a < 30; a++) c.cone.push({ sp, phi: (a + 0.5) / 30 * 2 * Math.PI, tr: O.traceDrop(bd, n, orders) });
    for (const b of [0.25, 0.5, 0.7, 0.86, 0.96]) for (let a = 0; a < 10; a++)
      c.disc.push({ sp, phi: (a + (b * 7 % 1)) / 10 * 2 * Math.PI, tr: O.traceDrop(b, n, orders) });
  }
  // rays that leave within the Sun's half-width of the eye's direction, for a fine set of colours.
  // The Sun is a disc, so a ray counts by how much of the disc could have sent it (the chord at its
  // offset): the light reaching the eye then fades out at the bow's edge instead of stopping dead.
  const tol = (S.exag ? 0.8 : 0.3) * DEG, M = 260;
  for (const sp of SPEC_EYE) {
    const n = nEff(sp, S);
    for (let j = 0; j < M; j++) {
      const b = (j + 0.5) / M, tr = O.traceDrop(b, n, 1), out = tr.outs[2];
      const d = (O.antisolarAngle(out.dir) - thetaE) / tol;
      if (Math.abs(d) < 1) {
        const w = out.I * b * Math.sqrt(1 - d * d);
        c.eye.push({ sp, phi: 0, tr, b, w }); c.eyeCum.push((c.eyeCum.at(-1) ?? 0) + w);
        for (let k = 0; k < 3; k++) c.eyeCol[k] += sp.part[k] * w;
      }
    }
  }
  const m = Math.max(...c.eyeCol, 1e-9);
  // how much of the full beam still comes this way: 1 through the bow, falling to 0 just outside it
  c.share = sstep(0, 1, Math.min(1, (c.eyeCum.at(-1) ?? 0) / 1.5));
  c.eyeLevel = c.share * Math.min(1, 0.2 + m / 0.0047);
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

// ---- the drop as the Rain scale shows it ----
// From metres away a drop is a glint, the cone of colour it throws back, and the one ray that finds
// the eye. Rain draws exactly this for each marked drop, and this scene draws it again around itself
// while the camera flies between the two, so every line carries straight on across the join.
const FAR = 180;      // how far the cone is drawn, in drop radii
let farRays = null;
// h: the marked drop (its colour and brightness at the eye); toEye: the far end of the ray to the eye;
// gain dims the lines and glint dims the glow that stands in for the drop itself;
// xf places a point of this scene in the caller's world, where one drop radius is `unit` long.
export function drawFar(R, S, h, toEye, gain = 1, glint = gain, xf = p => p, unit = 1) {
  farRays ??= SPEC.flatMap(sp => {
    const tr = O.traceDrop(O.bowB(sp.n), sp.n, 1), out = tr.outs.find(o => o.order === 1), p = tr.hits[out.at];
    return Array.from({ length: 30 }, (_, a) => { const phi = (a + 0.5) / 30 * 2 * Math.PI; return { col: sp.part, p: rot(p, phi), q: rot([p[0] + out.dir[0] * FAR, p[1] + out.dir[1] * FAR], phi) }; });
  });
  const f = S.focus, aC = (f === 'eye' ? 0.12 : f === 'sun' ? 1 : 0.6) * h.fade * gain, aE = (f === 'sun' ? 0.15 : 1) * h.fade * gain;
  for (const r of farRays) R.seg(xf(r.p), xf(r.q), r.col, 0.7 * aC, 1.2, 0);
  const o = xf([0, 0, 0]);
  R.seg(o, toEye, h.col, (0.25 + 0.75 * h.level) * aE, 2.4);
  R.pt(o, [0.8, 0.9, 1], 0.7 * h.fade * glint, 6 * unit);
  R.pt(o, h.col, h.level * aE / gain * glint, 20 * unit);
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

// A photon keeps the random numbers that chose its route (ph.r), so when a control changes the model
// under it, it can be put on the matching route of the new model and carry on from where it was.
function route(ph, S) {
  const c = cache, orders = S.second ? 2 : 1, r = ph.r;
  let br, sp, phi;
  ph.dim = S.focus === 'eye' && r[3] >= c.share;
  if (S.focus === 'eye' && !ph.dim) {
    // the rays that reach the eye, each as likely as the light it carries
    const u = r[0] * c.eyeCum.at(-1);
    let lo = 0, hi = c.eye.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c.eyeCum[m] < u) lo = m + 1; else hi = m; }
    const e = c.eye[lo];
    sp = e.sp; phi = (r[1] - 0.5) * 0.12; br = branch(e.tr, nEff(sp, S), 1);
  } else if (S.focus === 'eye') {
    // past the bow's edge less and less is sent this way: the rest show the light that comes back,
    // all of it passing inside
    sp = SPEC[Math.floor(r[0] * SPEC.length)];
    const n = nEff(sp, S);
    phi = (r[1] - 0.5) * 0.12; br = branch(O.traceDrop(Math.sqrt(r[2]) * 0.995, n, 1), n, 1);
  } else {
    sp = SPEC[Math.floor(r[0] * SPEC.length)];
    const n = nEff(sp, S), tr = O.traceDrop(Math.sqrt(r[2]) * 0.995, n, orders);
    phi = r[1] * 2 * Math.PI;
    let u = r[3], order = orders;
    for (const out of tr.outs) { if (u < out.I) { order = out.order; break; } u -= out.I; }
    br = branch(tr, n, order);
  }
  ph.br = br; ph.sp = sp; ph.phi = phi; ph.end = br.L[br.L.length - 1];
}
// A photon that ran off its route by `over` starts a new one. A few frames' worth is carried onto the
// new route, so the source emits evenly whatever the frame rate. More than that means nobody was
// watching (another scale, the wave view, a hidden tab) or its route was changed under it: starting
// all of those at the source together would send them off as one clump, so each is put somewhere along
// its new route instead, as the stream would have been had it kept running.
function spawn(ph, S, T, over) {
  ph.r = [rand(), rand(), rand(), rand()];
  route(ph, S);
  const l = over <= 0.3 && over < ph.end ? over : rand() * ph.end;
  ph.t0 = T - l / PH_SPEED;
  return l;
}

export default {
  id: 'drop', name: 'Drop', scale: '1 mm', modes: true, focus: true,
  controls: ['mode', 'focus', 'bowpos', 'exag', 'second'],
  bloom: 1.0, exposure: 1.0,
  overlay: true,      // light on a dark ground: laid over the scale above during the flight in
  cam: { type: 'orbit', target: [-0.5, -0.95, 0], yaw: 0.2, pitch: 0.15, dist: 13.5, fov: 34,
    lim: { yaw: [-1.25, 1.25], pitch: [-0.6, 1.0], dist: [4.5, 17] } },
  // The Surface scene is a patch of this drop's skin, a thousandth of its radius across, tangent to the
  // sphere where the rainbow ray crosses it (S.crossPhi, or else the crossing S.cross names), with the
  // light arriving from the right direction: the ray always travels the same way round the drop, so
  // the patch's x axis is the tangent in that sense at every crossing and anywhere between two.
  embed(S) {
    const a = S.crossPhi ?? crossAngle(S.cross), Y = [Math.cos(a), Math.sin(a), 0];
    return { o: Y, s: 1e-3, X: [Y[1], -Y[0], 0], Y, Z: [0, 0, 1] };
  },

  caption(S) {
    if (S.focus === 'eye') return { title: 'The few rays that reach you',
      body: 'Only light leaving in exactly your direction counts. Rays that enter near one particular height all leave at almost the same angle, so they pile up there: that crowding is the bow. Slide the drop through the bow and a different colour piles up toward you. Inside the bow the colours that pile up further out still send a little light, so they mix toward white; outside it almost none comes your way, and the light that returns passes you by.' };
    if (S.focus === 'sun') return { title: 'Where all the sunlight goes',
      body: 'Sunlight covers the whole face of the drop. About 6% glances off the front and 89% goes straight out through the back. Only about 5% reflects once inside and comes back out, crowded onto a hollow cone that opens 42° out from the line back toward the Sun.' };
    return S.mode === 'wave'
      ? { title: 'One wave, folded by a sphere',
        body: 'Each line is a crest. In water the crests travel at three-quarters of their speed in air, so they bunch up and the front bends. After one reflection the front folds over on itself; the fold is where light is concentrated, and it leaves the drop 42° from the way back to the Sun.' }
      : { title: 'Bent, reflected, and bent again',
        body: 'Light bends as it enters, reflects off the back, and bends again as it leaves toward you. The back is not a perfect mirror: the light meets it at 40°, short of the 49° needed for total reflection, so most of it escapes there. Each wavelength bends by a slightly different amount.' };
  },

  readout(S) {
    const c = ensure(S), t = c.desc, d = x => (x / DEG).toFixed(1) + '°';
    const lam = (() => { if (S.exag) return null; return O.wavelengthAt(c.thetaE); })();
    const seen = lam ? `${Math.round(lam)} nm` : (S.bowpos < 0 ? 'faint white (inside the bow)' : S.bowpos > 1 ? (c.share > 0.02 ? 'the last of the red' : 'almost nothing (outside)') : 'shown on the eye marker');
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
  h = sqrt(h); vec3 n1 = normalize(ro + rd*(-b-h)), n2 = normalize(ro + rd*(-b+h));      // (seen from metres away, rounding would push these off the sphere)
  vec3 sun = vec3(-1.0, 0.0, 0.0);
  float f1 = pow(clamp(1.0-dot(n1,-rd), 0.0, 1.0), 3.0);
  vec3 col = vec3(0.30,0.52,0.95)*(0.035 + 0.55*f1);
  col += vec3(1.0,0.95,0.85)*pow(max(dot(reflect(rd,n1), sun),0.0), 90.0)*2.5;          // the Sun's glint
  col += vec3(0.5,0.7,1.0)*pow(max(dot(reflect(rd,-n2), -sun),0.0), 30.0)*0.25;         // light gathered at the back
  col += vec3(0.25,0.4,0.7)*0.05*smoothstep(0.0, 2.0, 2.0*h);
  o = vec4(col*uFade*uBody, 0.0); }`);
  },

  draw(R, S, T) {
    const c = ensure(S), key = cacheKey, f = S.focus, wave = S.mode === 'wave';
    // Flying in from the rain (R.dive.k runs 0 to 1), the scene starts as the drop the Rain scale drew,
    // and everything only this scale shows fades in on the way: `near` is how much of it is there yet.
    const dive = R.dive, near = dive ? sstep(0.4, 0.97, dive.k) : 1, far = dive?.M.hero ? 1 - sstep(0.6, 1, dive.k) : 0;
    backdrop(R, T, [0.012, 0.02, 0.045], [0.004, 0.006, 0.014], [0.12, 0.09, 0.05], [-1, 0, 0]);

    const e = [-Math.cos(c.thetaE), -Math.sin(c.thetaE), 0];
    // reference lines: the axis back toward the Sun, and the angle to the eye
    R.seg([0, 0, 0], [-4.6, 0, 0], [0.6, 0.7, 1], 0.28, 1.2, 0.05);
    R.seg([0, 0, 0], V.mul(e, EYE_DIST - 0.5), [0.6, 0.7, 1], 0.16, 1.2);
    R.arc([0, 0, 0], [-1, 0, 0], [0, -1, 0], 2.2, 0, c.thetaE, [0.7, 0.8, 1], 0.5, 1.4, 24);
    R.flushLines({ dash: [0.22, 0, 0.55], gain: near });
    // the normal at the back, with the angle of incidence
    const hb = c.desc.hits[1];
    R.seg(V.mul([hb[0], hb[1], 0], 0.45), V.mul([hb[0], hb[1], 0], 1.5), [0.7, 0.8, 1], 0.4, 1.2);
    eyeGlyph(R, eyeAt(c), [0, 0, 1], [-e[1], e[0], 0], 0.4, f === 'sun' ? [0.5, 0.5, 0.5] : c.eyeCol.map(x => x * c.eyeLevel + 0.08), f === 'sun' ? 0.4 : 1);
    R.flushLines({ gain: near }); R.flushPoints({ gain: near });
    if (far * (R.zoom?.cover ?? 1) > 0) {
      const t = dive.M.theta;
      // the rain scene still shows through until this one covers it (R.zoom.cover), and it draws these
      // same lines: scale ours by the cover so that the two together always make one set
      const cov = R.zoom?.cover ?? 1;
      drawFar(R, S, dive.M.hero, V.mul([-Math.cos(t), -Math.sin(t), 0], dive.M.eyeDist), far * cov, (1 - sstep(0.25, 0.8, dive.k)) * cov);
      R.flushLines(); R.flushPoints({ minPx: 2 });
    }

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
        for (const r of c.fan) drawRay(R, r, lerp(0.16, 0.07, c.share), ghost, 1.1);
        const a = Math.min(0.9, 9 / Math.max(6, c.eye.length)) * c.share;
        const show = { inc: 1, leg: 2.4, legs: 2, '-1': 0, 0: 0, 1: 4, 2: 0 };
        for (const r of c.eye) drawRay(R, r, a, show, 1.7);
      }
      R.flushLines({ gain: near });
      // photons: each one is a single colour and takes one route, chosen with the Fresnel odds
      const pk = key + f;
      if (photons.length === 0) for (let i = 0; i < 460; i++) photons.push({});
      const fresh = pk !== photonKey; photonKey = pk;
      for (const ph of photons) {
        if (!ph.br) spawn(ph, S, T, Infinity); else if (fresh) route(ph, S);
        let l = (T - ph.t0) * PH_SPEED;
        if (l > ph.end) l = spawn(ph, S, T, l - ph.end);
        const p = pointAt(ph.br, l); if (!p) continue;
        R.pt(rot(p, ph.phi), ph.sp.col, ph.dim ? 0.45 : f === 'eye' ? 0.9 : 0.6, 0.036);
      }
      // On the way to or from the Surface scale the photons stay the dots they are from here, instead
      // of swelling into discs as the camera closes on them: that scale's own photons take over from them.
      R.flushPoints({ minPx: 1.3, gain: near, maxPx: R.zoom?.from === 'drop' ? 6 : undefined });
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
      R.flushLines({ keep: true, gain: near });
      R.flushLines({ model: modelTRS([0, 0, 0], 1, Math.PI / 2), gain: 0.3 * near });
    }

    const gl = R.gl;
    gl.useProgram(prog.p); R.setRayUniforms(prog, T); gl.uniform1f(prog.u.uBody, 1);
    R.fullscreen(prog, 'add');
  },
};
