// The inverse problem: from a noisy TIRF video of one fusion event, work back to the biology.
//
// A small forward model turns five parameters into the expected photon count in every pixel of
// every frame. Bayes' rule then scores any guess at the parameters by how well it explains the
// photons actually recorded, weighted by how plausible it was beforehand. An ensemble of
// "walkers" explores that score; where they end up is the posterior.
import { rng } from './glx.js';
import { GAP, CAM, optics } from './vitro.js';
import { shape, D, PH } from './profile.js';
import { irmOptics, moment, WELL } from './irm.js';

export const T_TOTAL = 400;                 // ms of video
export const ROI = 24;                      // pixels on a side, centred on the vesicle
const QUENCH = 0.04, LN = Math.log;

// The unknowns. All but the fusion time are positive and uncertain over orders of magnitude,
// so they are handled on a log scale, with log-normal priors (median, geometric spread).
export const PARAMS = [
  { key: 'tf', name: 'Moment of fusion', unit: 'ms', lo: 0, hi: T_TOTAL, digits: 0 },
  { key: 'd', name: 'Vesicle diameter', unit: 'nm', med: 45, gsd: 1.28, lo: 25, hi: 110, log: true, digits: 0 },
  { key: 'n', name: 'pHluorin copies', unit: '', med: 30, gsd: 1.9, lo: 4, hi: 250, log: true, digits: 0 },
  { key: 'tau', name: 'Collapse time', unit: 'ms', med: 30, gsd: 3, lo: 1.5, hi: 600, log: true, digits: 0 },
  { key: 'D', name: 'Tag diffusion', unit: 'µm²/s', med: 0.2, gsd: 3, lo: 0.008, hi: 5, log: true, digits: 2 },
];
export const NP = PARAMS.length;
export const toValue = (i, u) => (PARAMS[i].log ? Math.exp(u) : u);
export const toU = (i, v) => (PARAMS[i].log ? LN(v) : v);

// Pixels at the same distance from the centre always expect the same count, so they can be
// pooled. This is exact for a Poisson likelihood and makes each evaluation several times cheaper.
let R2 = [], MULT = [];
const CLASS = new Int16Array(ROI * ROI);
{
  const seen = new Map();
  for (let j = 0; j < ROI; j++) for (let i = 0; i < ROI; i++) {
    const x = i - ROI / 2 + 0.5, y = j - ROI / 2 + 0.5, r2 = x * x + y * y, key = Math.round(r2 * 4);
    if (!seen.has(key)) { seen.set(key, R2.length); R2.push(r2); MULT.push(0); }
    CLASS[j * ROI + i] = seen.get(key); MULT[seen.get(key)]++;
  }
}
const NB = R2.length;
R2 = Float64Array.from(R2); MULT = Float64Array.from(MULT);

// The model's fusion: the pore opens at the moment of fusion and the vesicle then flattens by a
// fraction c. This is where that puts it on the page's fusion-progress scale, and how wide the
// water-filled pore then is (the neck at the bilayer's midplane, less the two inner leaflets).
export const progressOf = (c) => PH.PORE + 0.02 + (0.98 - PH.PORE) * c;
export const poreWidth = (p, R) => Math.max(0, 2 * (shape(p, R).neck - D));
// Quantities that depend only on vesicle radius and how far it has flattened are tabulated once
// and read back by bilinear interpolation. Column 0 is the docked vesicle; the rest run c = 0..1.
const NRG = 40, NCG = 48, R_LO = PARAMS[1].lo / 2 - 2.4, R_HI = PARAMS[1].hi / 2 - 2.4, COLS = NCG + 2;
function tabulate(fn) {
  const t = new Float64Array(NRG * COLS);
  for (let i = 0; i < NRG; i++) { const R = R_LO + (R_HI - R_LO) * i / (NRG - 1); for (let j = 0; j < COLS; j++) t[i * COLS + j] = fn(j ? progressOf((j - 1) / NCG) : 0.2, R); }
  return t;
}
function look(t, R, c, fused) {
  const x = Math.min(NRG - 1.001, Math.max(0, (R - R_LO) / (R_HI - R_LO) * (NRG - 1))), i = Math.floor(x), fx = x - i;
  if (!fused) return t[i * COLS] * (1 - fx) + t[(i + 1) * COLS] * fx;
  const y = Math.min(NCG - 0.001, Math.max(0, c * NCG)), j = Math.floor(y), fy = y - j, a = i * COLS + 1 + j, b = a + COLS;
  return (t[a] * (1 - fy) + t[a + 1] * fy) * (1 - fx) + (t[b] * (1 - fy) + t[b + 1] * fy) * fx;
}
let PORE_TAB = null; const IRM_TABS = new Map();
function irmTables(lambda) {
  if (!IRM_TABS.has(lambda)) {
    const o = irmOptics(lambda), m = [0, 0];
    // The site's complex strength in the reflection picture (see moment in irm.js), in nm^2.
    IRM_TABS.set(lambda, { re: tabulate((p, R) => moment(o, p, R, m)[0]), im: tabulate((p, R) => moment(o, p, R, m)[1]) });
    if (IRM_TABS.size > 12) IRM_TABS.delete(IRM_TABS.keys().next().value);
  }
  return IRM_TABS.get(lambda);
}

export class Experiment {
  // set: { dt (ms per frame), power (photons per lit tag per ms at full field), angle, prior (width scale),
  //        irm (is the reflection camera recording too), lambda (its wavelength in nm),
  //        focus (where the shared objective is focused: 0 on the fluorescence, 1 on the reflection) }
  constructor(set) {
    this.set = set; this.opt = optics(set.angle);
    this.nf = Math.round(T_TOTAL / set.dt);
    // Background photons per pixel per ms: out-of-focus glow that scales with the laser and with how deep the light reaches.
    this.bg = 0.004 * set.power * (this.opt.tir ? Math.min(2.5, this.opt.depth / 100) : 8) + 0.002;
    // With both cameras on one objective, whichever is not in focus is blurred (see irm.js).
    const io = set.irm ? irmOptics(set.lambda, set.focus || 0) : null;
    this.sp2 = Math.pow(CAM.sigma * (io ? io.blurF : 1) / CAM.nm, 2);
    if (io) { this.hre = new Float64Array(NB); this.him = new Float64Array(NB); for (let c = 0; c < NB; c++) { const r = Math.sqrt(R2[c]) * CAM.nm; this.hre[c] = io.spot([1, 0], r); this.him[c] = -io.spot([0, 1], r); } }
    this.out = new Float64Array(4);
    PORE_TAB = PORE_TAB || tabulate(poreWidth);
    this.irm = set.irm ? irmTables(set.lambda) : null;
    this.sdI = 1 / Math.sqrt(WELL * set.dt);             // shot noise of the reflection picture, as a fraction of the background
  }
  // Width of the fusion pore in nm at time t, for one guess at the unknowns.
  pore(u, t) {
    const fused = t > u[0];
    return fused ? look(PORE_TAB, Math.exp(u[1]) / 2 - 2.4, 1 - Math.exp(-(t - u[0]) / Math.exp(u[3])), true) : 0;
  }
  // Brightness (photons per ms) and blur (variance in pixels^2) of the spot at one instant.
  state(u, t, out) {
    const tf = u[0], R = Math.exp(u[1]) / 2 - 2.4, n = Math.exp(u[2]), tau = Math.exp(u[3]), Dn = Math.exp(u[4]) * 1e3;   // um^2/s -> nm^2/ms
    const o = this.opt, x = R / o.depth;
    // Tags spread over a sphere resting above the glass: average the exponential field over it.
    const pre = o.tir ? o.I0 / 4 * Math.exp(-(GAP + 6 + R) / o.depth) * (x > 1e-4 ? Math.sinh(x) / x : 1) : o.I0 / 4;
    const flat = o.at(GAP - 5);
    let q = QUENCH, E = pre, v = R * R / 3, c = 0;
    if (t > tf) {
      c = 1 - Math.exp(-(t - tf) / tau);                 // how far the vesicle has flattened
      q = 1; E = (1 - c) * pre + c * flat;
      v = (1 - c) * R * R / 3 + c * R * R + 2 * Dn * (t - tf);
    }
    out[0] = n * this.set.power * q * E; out[1] = v / (CAM.nm * CAM.nm); out[2] = c;
    // The reflection camera: how strongly this shape changes the picture, and how wide a spot it makes.
    if (this.irm) { out[3] = look(this.irm.re, R, c, t > tf); out[4] = look(this.irm.im, R, c, t > tf); }
    return out;
  }
  // Expected photons in the whole spot, and its variance, for frame f (averaged over the exposure).
  frame(u, f, out) {
    const dt = this.set.dt, s = this._s || (this._s = new Float64Array(5));
    let A = 0, v = 0, C = 0, vI = 0;
    for (let k = 0; k < 3; k++) { this.state(u, (f + (1 + 2 * k) / 6) * dt, s); A += s[0]; v += s[1]; C += s[3]; vI += s[4]; }
    out[0] = A / 3 * dt; out[1] = this.sp2 + v / 3; out[2] = C / 3; out[3] = vI / 3;
    return out;
  }
  // A video drawn from the model: photon counts per pixel (for display) and pooled by radius.
  simulate(truth, seed) {
    const r = rng(seed), nf = this.nf, img = new Float32Array(nf * ROI * ROI), K = new Float64Array(nf * NB), tot = new Float32Array(nf), o = this.out;
    const pois = (l) => { if (l > 40) return Math.max(0, Math.round(l + Math.sqrt(l) * r.gauss())); let k = 0, p = Math.exp(-l), s = p; const x = r(); while (x > s && k < 200) { k++; p *= l / k; s += p; } return k; };
    for (let f = 0; f < nf; f++) {
      this.frame(truth, f, o);
      const a = o[0] / (2 * Math.PI * o[1]), kk = 1 / (2 * o[1]), b = this.bg * this.set.dt;
      for (let p = 0; p < ROI * ROI; p++) { const c = CLASS[p], k = pois(b + a * Math.exp(-R2[c] * kk)); img[f * ROI * ROI + p] = k; K[f * NB + c] += k; tot[f] += k; }
    }
    this.img = img; this.K = K; this.tot = tot; this.truth = truth;
    if (!this.irm) return;
    // The reflection video, as a fraction of the background brightness. The cell's own static
    // pattern (here 1% of mottle that never changes) sits under every frame; shot noise is added on top.
    const r2 = rng(seed + 101), imgI = new Float32Array(nf * ROI * ROI), KI = new Float64Array(nf * NB), stat = new Float32Array(ROI * ROI);
    for (let p = 0; p < ROI * ROI; p++) stat[p] = 0.01 * r2.gauss();
    for (let f = 0; f < nf; f++) {
      this.frame(truth, f, o);
      for (let p = 0; p < ROI * ROI; p++) { const c = CLASS[p], y = stat[p] + o[2] * this.hre[c] - o[3] * this.him[c] + this.sdI * r2.gauss(); imgI[f * ROI * ROI + p] = y; KI[f * NB + c] += y; }
    }
    this.imgI = imgI; this.KI = KI;
  }
  // Log-likelihood of the first `upto` frames: sum over pixels of k ln(lambda) - lambda.
  // With both = true the reflection video counts as well. Each of its pixels has an unknown
  // brightness of its own that never changes (the cell's static pattern), so only departures from
  // a pixel's average over the frames seen carry information. With Gaussian noise of known size
  // that leaves, per ring of pixels, sum_f m'(f) Y(f) - (pixels / 2) sum_f m'(f)^2, all over the
  // noise variance, where m' is the model's contrast less its own average over those frames.
  logLike(u, upto, both) {
    const o = this.out, K = this.K, b = this.bg * this.set.dt, irm = both && this.irm && upto > 1;
    const m = irm ? this._m || (this._m = new Float64Array(this.nf * NB)) : null;
    let L = 0;
    for (let f = 0; f < upto; f++) {
      this.frame(u, f, o);
      const a = o[0] / (2 * Math.PI * o[1]), kk = 1 / (2 * o[1]), base = f * NB;
      for (let c = 0; c < NB; c++) { const lam = b + a * Math.exp(-R2[c] * kk); L += K[base + c] * LN(lam) - MULT[c] * lam; }
      if (irm) { const hr = this.hre, hi = this.him, cr = o[2], ci = o[3]; for (let c = 0; c < NB; c++) m[base + c] = cr * hr[c] - ci * hi[c]; }
    }
    if (irm) {
      const KI = this.KI; let G = 0;
      for (let c = 0; c < NB; c++) {
        let mean = 0, A = 0, B = 0;
        for (let f = 0; f < upto; f++) mean += m[f * NB + c];
        mean /= upto;
        for (let f = 0; f < upto; f++) { const d = m[f * NB + c] - mean; A += d * KI[f * NB + c]; B += d * d; }
        G += A - 0.5 * MULT[c] * B;
      }
      L += G / (this.sdI * this.sdI);
    }
    return L;
  }
  logPrior(u) {
    if (u[0] < 0 || u[0] > T_TOTAL) return -Infinity;
    let L = 0;
    for (let i = 1; i < NP; i++) {
      const P = PARAMS[i];
      if (u[i] < LN(P.lo) || u[i] > LN(P.hi)) return -Infinity;
      const s = LN(P.gsd) * this.set.prior, z = (u[i] - LN(P.med)) / s; L -= 0.5 * z * z;
    }
    return L;
  }
  drawPrior(r, u) {
    u[0] = r() * T_TOTAL;
    for (let i = 1; i < NP; i++) { const P = PARAMS[i]; do { u[i] = LN(P.med) + LN(P.gsd) * this.set.prior * r.gauss(); } while (u[i] < LN(P.lo) || u[i] > LN(P.hi)); }
    return u;
  }
  // Expected image for a parameter guess (for the "what the model expects" tile).
  expected(u, f, img) {
    const o = this.frame(u, f, this.out), a = o[0] / (2 * Math.PI * o[1]), kk = 1 / (2 * o[1]), b = this.bg * this.set.dt;
    for (let p = 0; p < ROI * ROI; p++) img[p] += b + a * Math.exp(-R2[CLASS[p]] * kk);
  }
  // Expected change in the reflection picture between the first frame and frame f.
  expectedIrm(u, f, img) {
    const o = this.out;
    this.frame(u, 0, o); const r0 = o[2], i0 = o[3];
    this.frame(u, f, o);
    for (let p = 0; p < ROI * ROI; p++) { const c = CLASS[p]; img[p] += (o[2] - r0) * this.hre[c] - (o[3] - i0) * this.him[c]; }
  }
}

// Affine-invariant ensemble sampler (Goodman & Weare's stretch move), with an occasional fresh
// draw from the prior mixed in so the ensemble can widen again when evidence is taken away.
export const WALKERS = 40, KEEP = 300;
export class Sampler {
  // both: score guesses against the reflection video as well as the fluorescence video.
  constructor(exp, seed = 7, both = false) {
    this.both = both; this.r = rng(seed); this.x = []; this.lp = new Float64Array(WALKERS); this.ll = new Float64Array(WALKERS);
    this.hist = new Float32Array(WALKERS * KEEP * NP); this.count = 0; this.head = 0; this.sweeps = 0; this.accepted = 0; this.tried = 0;
    for (let k = 0; k < WALKERS; k++) this.x.push(new Float64Array(NP));
    this.reset(exp);
  }
  // New experiment: start again from the prior.
  reset(exp) { this.exp = exp; this.upto = -1; for (const w of this.x) exp.drawPrior(this.r, w); this.count = 0; this.head = 0; }
  // Evidence changed (more or fewer frames): keep the walkers, rescore them.
  observe(upto) {
    if (upto === this.upto) return;
    this.upto = upto;
    for (let k = 0; k < WALKERS; k++) { this.ll[k] = this.exp.logLike(this.x[k], upto, this.both); this.lp[k] = this.exp.logPrior(this.x[k]); }
    this.count = Math.min(this.count, WALKERS * 4);      // forget most of the old posterior quickly
  }
  sweep() {
    const { r, x, exp } = this, y = this._y || (this._y = new Float64Array(NP));
    for (let k = 0; k < WALKERS; k++) {
      let logq = 0, lpy, lly;
      if (r() < 0.12) {
        exp.drawPrior(r, y); lpy = exp.logPrior(y); lly = exp.logLike(y, this.upto, this.both);
        logq = lly - this.ll[k];                          // independence proposal from the prior
      } else {
        let j = Math.floor(r() * (WALKERS - 1)); if (j >= k) j++;
        const z = Math.pow(1 + r(), 2) / 2;               // z in [1/2, 2], density ~ 1/sqrt(z)
        for (let i = 0; i < NP; i++) y[i] = x[j][i] + z * (x[k][i] - x[j][i]);
        lpy = exp.logPrior(y);
        if (lpy === -Infinity) { this.tried++; continue; }
        lly = exp.logLike(y, this.upto, this.both);
        logq = (NP - 1) * LN(z) + lpy + lly - this.lp[k] - this.ll[k];
      }
      this.tried++;
      if (LN(r() + 1e-300) < logq) { x[k].set(y); this.lp[k] = lpy; this.ll[k] = lly; this.accepted++; }
    }
    // Remember every fourth sweep: successive sweeps are much alike, and a longer memory gives steadier summaries.
    if (++this.sweeps % 4 === 0 || this.count < WALKERS * 8) {
      for (let k = 0; k < WALKERS; k++) { this.hist.set(x[k], this.head * NP); this.head = (this.head + 1) % (WALKERS * KEEP); }
      this.count = Math.min(WALKERS * KEEP, this.count + WALKERS);
    }
  }
  // Run for a time budget; returns sweeps done.
  run(ms) { const t0 = performance.now(); let n = 0; do { this.sweep(); n++; } while (performance.now() - t0 < ms && n < 40); return n; }
  // Recent samples of parameter i, newest last-agnostic (order does not matter for summaries).
  // Summaries are taken over a long memory (thinned to at most `max` samples), which is what keeps them steady.
  column(i, out, max = 3000) {
    const N = WALKERS * KEEP, step = Math.max(1, Math.ceil(this.count / max)); let n = 0;
    for (let s = 0; s < this.count; s += step) out[n++] = this.hist[((this.head - 1 - s + N) % N) * NP + i];
    return n;
  }
  // Whole samples (all parameters together), thinned the same way. Returns how many were written.
  rows(out, max) {
    const N = WALKERS * KEEP, step = Math.max(1, Math.ceil(this.count / max)); let n = 0;
    for (let s = 0; s < this.count; s += step) { const o = ((this.head - 1 - s + N) % N) * NP; for (let i = 0; i < NP; i++) out[n * NP + i] = this.hist[o + i]; n++; }
    return n;
  }
}

export function quantiles(arr, n, qs) {
  const a = Float32Array.from(arr.subarray(0, n)).sort();
  return qs.map((q) => a[Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))]);
}
// How much the data taught us about one parameter, in bits (each bit halves the uncertainty).
// Kullback-Leibler divergence from prior to posterior, treating both as Gaussian on the working scale.
export function bitsLearned(i, col, n, priorScale) {
  let m = 0, v = 0;
  for (let s = 0; s < n; s++) m += col[s]; m /= n;
  for (let s = 0; s < n; s++) v += (col[s] - m) * (col[s] - m); v = Math.max(v / n, 1e-12);
  const P = PARAMS[i];
  if (!P.log) return Math.max(0, LN((P.hi - P.lo) / Math.sqrt(2 * Math.PI * Math.E * v)) / Math.LN2);
  const s0 = LN(P.gsd) * priorScale, d = m - LN(P.med);
  return Math.max(0, (LN(s0 / Math.sqrt(v)) + (v + d * d) / (2 * s0 * s0) - 0.5) / Math.LN2);
}
export { NB };
