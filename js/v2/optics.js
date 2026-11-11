// The physics behind every scale of Rainbows v2. Wavelengths in nanometres, angles in radians
// unless a name says "deg".
//
// One model of water runs through the whole experience: a single Lorentz oscillator (bound
// electrons with an ultraviolet resonance). Its refractive index
//     n² = 1 + A λ² / (λ² − λ0²)
// is fitted to measured values for water at 20 °C (1.3428 at 404.7 nm, 1.3300 at 706.5 nm; it then
// gives 1.3327 at 589.3 nm against a measured 1.3330). The same oscillator sets the bending in the
// drop, the colours in the sky, and the energy stored in molecules in the final view.

export const SELL_A = 0.75323;          // oscillator strength
export const SELL_C = 0.010171;         // λ0² in µm²
export const LAM0 = Math.sqrt(SELL_C) * 1000;   // resonance wavelength, ≈ 100.9 nm (far ultraviolet)
export const nWater = l => { const L = l * l * 1e-6; return Math.sqrt(1 + SELL_A * L / (L - SELL_C)); };
export const N_AIR = 1.0;               // air is 1.0003; the difference is far below what is drawn

// ---- colour ----
// CIE 1931 colour matching functions (Wyman, Sloan & Shirley 2013 analytic fit).
const g = (l, m, s1, s2) => { const t = (l - m) / (l < m ? s1 : s2); return Math.exp(-0.5 * t * t); };
export function cieXYZ(l) {
  return [
    1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
    0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
    1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8)];
}
export const xyzToRGB = ([X, Y, Z]) => [
  3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
// Display colour (linear RGB, brightest channel 1) of a single wavelength. Pure spectral colours lie
// outside what a screen can show, so each is moved toward white just far enough to fit.
// Beyond the visible band (used by the last stage) the colour fades to a pale ultraviolet tint.
export function wlRGB(l) {
  const lv = Math.max(l, 400);
  let c = xyzToRGB(cieXYZ(Math.min(lv, 645)));   // the fit's far-red tail drifts; hue is constant there anyway
  const lo = Math.min(c[0], c[1], c[2]);
  if (lo < 0) c = c.map(x => x - lo);
  const hi = Math.max(c[0], c[1], c[2]) || 1;
  c = c.map(x => x / hi);
  if (l < 400) { const t = Math.min(1, (400 - l) / 150); c = [c[0] + (0.75 - c[0]) * t, c[1] + (0.7 - c[1]) * t, c[2] + (1 - c[2]) * t]; }
  return c;
}
export const cssRGB = (c, a = 1) => `rgba(${c.map(x => Math.round(255 * Math.pow(Math.min(1, Math.max(0, x)), 1 / 2.2))).join(',')},${a})`;

// A set of wavelengths whose display colours add up to white: sunlight, for drawing.
export function spectrumSet(list) {
  const cols = list.map(wlRGB), sum = [0, 0, 0];
  cols.forEach(c => { sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; });
  return list.map((l, i) => ({ l, n: nWater(l), col: cols[i], part: cols[i].map((x, k) => x / sum[k]) }));
}

// ---- Fresnel ----
// Power reflectances for light meeting a flat boundary from index n1 into n2 at cos(angle) = ci.
// s: electric field across the plane of incidence; p: in it.
export function fresnel(n1, n2, ci) {
  const s2 = (n1 / n2) ** 2 * (1 - ci * ci);
  if (s2 >= 1) return { Rs: 1, Rp: 1, tir: true };
  const ct = Math.sqrt(1 - s2);
  const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct), rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
  return { rs, rp, Rs: rs * rs, Rp: rp * rp, ct, tir: false };
}
// Amplitude reflection coefficient r for light meeting a flat boundary at thetaI, below the critical
// angle. For s it is the coefficient of E; for p, of the magnetic field, which is the component that
// stays a scalar. In both cases the transmitted amplitude is 1 + r.
export function fresnelAmp(n1, n2, thetaI, pol) {
  const ci = Math.cos(thetaI), si = Math.sin(thetaI);
  const q = Math.sqrt(Math.max(0, n2 * n2 - n1 * n1 * si * si));          // n2 cos θt
  const a = pol === 'p' ? n2 * n2 * ci : n1 * ci, b = pol === 'p' ? n1 * q : q;
  const r = (a - b) / (a + b);
  return { r, R: r * r, thetaT: Math.atan2(n1 * si, q) };
}
export const criticalAngle = n => Math.asin(1 / n);
export const brewsterInside = n => Math.atan(1 / n);

// ---- the drop ----
// Rays in the plane z = 0. The drop is the unit circle; sunlight travels along +x; y is "up".
const refract2 = (I, N, eta) => {          // N points against I
  const c = -(I[0] * N[0] + I[1] * N[1]), k = 1 - eta * eta * (1 - c * c);
  if (k < 0) return null;
  const a = eta * c - Math.sqrt(k);
  return [eta * I[0] + a * N[0], eta * I[1] + a * N[1]];
};
const reflect2 = (I, N) => { const d = 2 * (I[0] * N[0] + I[1] * N[1]); return [I[0] - d * N[0], I[1] - d * N[1]]; };

// Trace one ray with impact parameter b (−1..1) through a drop of index n, following `bounces`
// internal reflections. Returns:
//   hits   the points where it meets the surface (hits[0] is the entry)
//   I      power in each internal leg, hits[j] → hits[j+1], for unpolarised sunlight of power 1
//   outs   every ray that leaves: {at: hit index, dir, I, Is, Ip, order}
//          order −1 = reflected off the outside, 0 = straight through the back,
//          1 = one internal reflection (the primary bow), 2 = two (the secondary bow)
export function traceDrop(b, n, bounces = 2) {
  const h0 = [-Math.sqrt(1 - b * b), b];
  const F = fresnel(1, n, Math.sqrt(1 - b * b));
  const Ts = 1 - F.Rs, Tp = 1 - F.Rp;
  const hits = [h0], I = [], outs = [];
  outs.push({ at: 0, dir: reflect2([1, 0], h0), I: 0.5 * (F.Rs + F.Rp), Is: 0.5 * F.Rs, Ip: 0.5 * F.Rp, order: -1 });
  let d = refract2([1, 0], h0, 1 / n), q = h0, is = 0.5 * Ts, ip = 0.5 * Tp;
  for (let j = 0; j <= bounces; j++) {
    I.push(is + ip);
    const t = -2 * (q[0] * d[0] + q[1] * d[1]);
    q = [q[0] + d[0] * t, q[1] + d[1] * t]; hits.push(q);
    const out = refract2(d, [-q[0], -q[1]], n);
    outs.push({ at: j + 1, dir: out, I: is * Ts + ip * Tp, Is: is * Ts, Ip: ip * Tp, order: j });
    d = reflect2(d, [-q[0], -q[1]]); is *= F.Rs; ip *= F.Rp;
  }
  return { hits, I, outs, inc: Math.asin(Math.abs(b)), refr: Math.asin(Math.abs(b) / n), R: 0.5 * (F.Rs + F.Rp), Rs: F.Rs, Rp: F.Rp };
}
// Where in the sky outgoing light appears to come from, as an angle (radians) from the antisolar
// point. Light travelling along `dir` is seen by looking along −dir; the antisolar point lies along +x.
export const antisolarAngle = dir => Math.acos(Math.min(1, Math.max(-1, -dir[0])));

// Total deviation of a ray after k internal reflections, and the bow it makes.
export const deviation = (b, n, k) => { const i = Math.asin(b), r = Math.asin(b / n); return k * Math.PI + 2 * i - 2 * (k + 1) * r; };
export const bowB = (n, k = 1) => Math.sqrt(1 - (n * n - 1) / (k * (k + 2)));     // impact parameter of the least-deviated ray
export function bowAngle(n, k = 1) {     // radians from the antisolar point
  const D = deviation(bowB(n, k), n, k);
  return k === 1 ? Math.PI - D : D - Math.PI;
}
// Wavelength whose primary bow sits at a given angle from the antisolar point (or null outside the band).
export function wavelengthAt(angle) {
  let lo = 380, hi = 720;
  if (angle < bowAngle(nWater(lo)) || angle > bowAngle(nWater(hi))) return null;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (bowAngle(nWater(m)) < angle) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---- the sky ----
// Brightness of rain-scattered sunlight against angle from the antisolar point, as linear RGB.
// Geometric optics with Fresnel losses for both polarisations: rays reflected from the outside of the
// drops, the primary bow (one internal reflection) and the secondary (two), summed over the visible
// spectrum and blurred by the half-degree disc of the Sun. Returns a table from deg0 to deg1.
export function bowTable(N = 1024, deg0 = 20, deg1 = 70) {
  const BIN = 0.05, NB = Math.round(180 / BIN);
  const xyz = new Float64Array(NB * 3), M = 6000;
  for (let l = 384; l <= 716; l += 8) {
    const n = nWater(l), cm = cieXYZ(l), h = new Float64Array(NB);
    for (let j = 0; j < M; j++) {
      const b = (j + 0.5) / M, ci = Math.sqrt(1 - b * b), F = fresnel(1, n, ci);
      const Ts = 1 - F.Rs, Tp = 1 - F.Rp, w = b / M;                         // area of the annulus
      const i = Math.asin(b), r = Math.asin(b / n);
      const put = (D, I) => {
        let a = (Math.PI - D) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; if (a > Math.PI) a = 2 * Math.PI - a;
        const k = Math.min(NB - 1, Math.floor(a * 180 / Math.PI / BIN)); h[k] += I * w;
      };
      put(Math.PI - 2 * i, 0.5 * (F.Rs + F.Rp));
      put(Math.PI + 2 * i - 4 * r, 0.5 * (Ts * F.Rs * Ts + Tp * F.Rp * Tp));
      put(2 * Math.PI + 2 * i - 6 * r, 0.5 * (Ts * F.Rs * F.Rs * Ts + Tp * F.Rp * F.Rp * Tp));
    }
    for (let k = 0; k < NB; k++) {
      const v = h[k] / Math.sin((k + 0.5) * BIN * Math.PI / 180);            // per unit solid angle
      xyz[k * 3] += v * cm[0]; xyz[k * 3 + 1] += v * cm[1]; xyz[k * 3 + 2] += v * cm[2];
    }
  }
  // blur by the Sun's disc (0.53° across): a chord-length weighted kernel
  const rad = 0.265 / BIN, K = Math.ceil(rad), ker = [];
  let ks = 0;
  for (let d = -K; d <= K; d++) { const w = Math.sqrt(Math.max(0, 1 - (d / rad) ** 2)); ker.push(w); ks += w; }
  const out = new Float32Array(N * 4);
  let peak = 0;
  for (let x = 0; x < N; x++) {
    const k0 = Math.round((deg0 + (deg1 - deg0) * x / (N - 1)) / BIN);
    const s = [0, 0, 0];
    for (let d = -K; d <= K; d++) { const k = Math.min(NB - 1, Math.max(0, k0 + d)), w = ker[d + K] / ks; s[0] += xyz[k * 3] * w; s[1] += xyz[k * 3 + 1] * w; s[2] += xyz[k * 3 + 2] * w; }
    const c = xyzToRGB(s);
    for (let j = 0; j < 3; j++) { out[x * 4 + j] = Math.max(0, c[j]); peak = Math.max(peak, c[j]); }
    out[x * 4 + 3] = 1;
  }
  for (let x = 0; x < N; x++) for (let j = 0; j < 3; j++) out[x * 4 + j] /= peak;
  return { data: out, N, deg0, deg1 };
}
export function sampleBow(tab, deg) {
  const x = Math.min(tab.N - 1, Math.max(0, Math.round((deg - tab.deg0) / (tab.deg1 - tab.deg0) * (tab.N - 1))));
  return [tab.data[x * 4], tab.data[x * 4 + 1], tab.data[x * 4 + 2]];
}

// ---- energy in the wave ----
// A light wave in the Lorentz medium, split into where its energy sits (time-averaged, as fractions
// of the total): the electric field, the magnetic field, and the bound electrons (stretch and motion).
// The energy moves at (energy flow)/(energy density), which here equals the group velocity.
export function energySplit(l) {
  const n2 = 1 + SELL_A * l * l * 1e-6 / (l * l * 1e-6 - SELL_C), n = Math.sqrt(n2);
  const x = (LAM0 / l) ** 2;                         // (ω/ω0)²
  const pot = (n2 - 1) / (1 - x), kin = pot * x;     // in units of ¼ε0E²
  const tot = 1 + n2 + pot + kin;
  return { n, electric: 1 / tot, magnetic: n2 / tot, stretch: pot / tot, motion: kin / tot, matter: (pot + kin) / tot,
    vPhase: 1 / n, vEnergy: 2 * n / tot, response: 1 / (1 - x), x };
}
// Phase delay (degrees) added by one layer of water molecules about 0.31 nm thick.
export const lagPerLayerDeg = l => (nWater(l) - 1) * 0.31 / l * 360;
