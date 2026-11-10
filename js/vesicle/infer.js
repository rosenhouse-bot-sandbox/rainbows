// The inverse problem: from a noisy TIRF video of one fusion event, work back to the biology.
//
// A small forward model turns five parameters into the expected photon count in every pixel of
// every frame. Bayes' rule then scores any guess at the parameters by how well it explains the
// photons actually recorded, weighted by how plausible it was beforehand. An ensemble of
// "walkers" explores that score; where they end up is the posterior.
import { rng } from './glx.js';
import { GAP, CAM, optics } from './vitro.js';

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

export class Experiment {
  // set: { dt (ms per frame), power (photons per lit tag per ms at full field), angle, prior (width scale) }
  constructor(set) {
    this.set = set; this.opt = optics(set.angle);
    this.nf = Math.round(T_TOTAL / set.dt);
    // Background photons per pixel per ms: out-of-focus glow that scales with the laser and with how deep the light reaches.
    this.bg = 0.004 * set.power * (this.opt.tir ? Math.min(2.5, this.opt.depth / 100) : 8) + 0.002;
    this.sp2 = Math.pow(CAM.sigma / CAM.nm, 2);
    this.out = new Float64Array(2);
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
    return out;
  }
  // Expected photons in the whole spot, and its variance, for frame f (averaged over the exposure).
  frame(u, f, out) {
    const dt = this.set.dt, s = this._s || (this._s = new Float64Array(3));
    let A = 0, v = 0;
    for (const w of [1 / 6, 0.5, 5 / 6]) { this.state(u, (f + w) * dt, s); A += s[0]; v += s[1]; }
    out[0] = A / 3 * dt; out[1] = this.sp2 + v / 3;
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
  }
  // Log-likelihood of the first `upto` frames: sum over pixels of k ln(lambda) - lambda.
  logLike(u, upto) {
    const o = this.out, K = this.K, b = this.bg * this.set.dt;
    let L = 0;
    for (let f = 0; f < upto; f++) {
      this.frame(u, f, o);
      const a = o[0] / (2 * Math.PI * o[1]), kk = 1 / (2 * o[1]), base = f * NB;
      for (let c = 0; c < NB; c++) { const lam = b + a * Math.exp(-R2[c] * kk); L += K[base + c] * LN(lam) - MULT[c] * lam; }
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
}

// Affine-invariant ensemble sampler (Goodman & Weare's stretch move), with an occasional fresh
// draw from the prior mixed in so the ensemble can widen again when evidence is taken away.
export const WALKERS = 40, KEEP = 60;
export class Sampler {
  constructor(exp, seed = 7) {
    this.r = rng(seed); this.x = []; this.lp = new Float64Array(WALKERS); this.ll = new Float64Array(WALKERS);
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
    for (let k = 0; k < WALKERS; k++) { this.ll[k] = this.exp.logLike(this.x[k], upto); this.lp[k] = this.exp.logPrior(this.x[k]); }
    this.count = Math.min(this.count, WALKERS * 6);      // forget most of the old posterior quickly
  }
  sweep() {
    const { r, x, exp } = this, y = this._y || (this._y = new Float64Array(NP));
    for (let k = 0; k < WALKERS; k++) {
      let logq = 0, lpy, lly;
      if (r() < 0.12) {
        exp.drawPrior(r, y); lpy = exp.logPrior(y); lly = exp.logLike(y, this.upto);
        logq = lly - this.ll[k];                          // independence proposal from the prior
      } else {
        let j = Math.floor(r() * (WALKERS - 1)); if (j >= k) j++;
        const z = Math.pow(1 + r(), 2) / 2;               // z in [1/2, 2], density ~ 1/sqrt(z)
        for (let i = 0; i < NP; i++) y[i] = x[j][i] + z * (x[k][i] - x[j][i]);
        lpy = exp.logPrior(y);
        if (lpy === -Infinity) { this.tried++; continue; }
        lly = exp.logLike(y, this.upto);
        logq = (NP - 1) * LN(z) + lpy + lly - this.lp[k] - this.ll[k];
      }
      this.tried++;
      if (LN(r() + 1e-300) < logq) { x[k].set(y); this.lp[k] = lpy; this.ll[k] = lly; this.accepted++; }
    }
    for (let k = 0; k < WALKERS; k++) { this.hist.set(x[k], this.head * NP); this.head = (this.head + 1) % (WALKERS * KEEP); }
    this.count = Math.min(WALKERS * KEEP, this.count + WALKERS); this.sweeps++;
  }
  // Run for a time budget; returns sweeps done.
  run(ms) { const t0 = performance.now(); let n = 0; do { this.sweep(); n++; } while (performance.now() - t0 < ms && n < 40); return n; }
  // Recent samples of parameter i, newest last-agnostic (order does not matter for summaries).
  column(i, out) { const n = this.count, N = WALKERS * KEEP; for (let s = 0; s < n; s++) out[s] = this.hist[((this.head - 1 - s + N) % N) * NP + i]; return n; }
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
