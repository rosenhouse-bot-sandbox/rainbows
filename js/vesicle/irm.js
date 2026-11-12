// Interference reflection microscopy (IRM): a second camera on the same objective.
//
// Light of one colour comes straight up through the objective. About 0.4% of it reflects off the
// glass-medium boundary, and that reflection is the reference wave. Anything above the glass whose
// refractive index differs from its surroundings scatters a much weaker wave back, and the camera
// records the two added together. The scattered wave has travelled up to the scatterer and back,
// so its phase is 4 pi n z / lambda: the picture depends on height in nanometres, not on any dye.
//
// The scattered wave is worked out in the first Born approximation, which is good here because
// every index step is small. A volume dV at height z whose squared index differs by d(n^2) from
// the undisturbed cell contributes
//     dE = i k0 / (2 n) * d(n^2) * exp(2 i k0 n z) * dV * (amplitude blur of the microscope)
// Integrated over a flat film this reproduces the Fresnel thin-film reflection, and over a
// half-space the Fresnel coefficient of a single boundary, so membranes, the vesicle interior and
// the medium under the cell are all handled by one rule.
//
// What scatters: the lipid bilayer (index 1.48, 4 nm thick) against cytoplasm (1.36), and the
// watery inside of the vesicle (taken as 1.335, like the medium) against that same cytoplasm.
// These two have opposite signs, so a large vesicle scatters less than its membrane alone would.
//
// One objective serves both cameras, and no lens focuses every colour at the same depth. See
// focalShift and pupil below for what that does to each picture.
import { shape, D, ARRIVE } from './profile.js';
import { N_GLASS, N_CELL, NA, GAP, CAM, LENS_Y, GLASS_TOP, LAMBDA_EM } from './vitro.js';
import { rng } from './glx.js';

export const N_MEDIUM = 1.335, N_LIPID = 1.48, MEM = 4;     // medium and vesicle interior; bilayer; its thickness in nm
export const IRM = { lambda: 630, min: 560, max: 720 };     // nm; above 560 it stays clear of the pHluorin emission band
export const WELL = 2e4;                                    // photoelectrons per pixel per millisecond from the reference wave
export const SHOW_MS = 10;                                  // exposure of one displayed frame
export const SPAN_DIFF = 0.015;                             // the same, when a baseline frame has been subtracted
export const SPAN = 0.035;                                  // the display's full grey range is -SPAN .. +SPAN of the background
const PI = Math.PI;

// ---- one objective, two colours ------------------------------------------------------------------
// Axial chromatic aberration. An apochromat brings three colours to exactly the same focus (here
// the classic 436, 546 and 656 nm lines) and wanders a little in between. The simplest curve with
// that property is a cubic through the three, scaled so the largest error between the outer lines
// is APO.peak. Real objectives differ in detail; this one is illustrative, not a maker's data.
export const APO = { lines: [436, 546, 656], peak: 100 };   // nm
const cubic = (l) => (l - APO.lines[0]) * (l - APO.lines[1]) * (l - APO.lines[2]);
let cubicMax = 0; for (let l = APO.lines[0]; l <= APO.lines[2]; l++) cubicMax = Math.max(cubicMax, Math.abs(cubic(l)));
export const focalShift = (nm) => -APO.peak * cubic(nm) / cubicMax;      // nm; positive is deeper into the sample

// Bessel function J0 (Abramowitz and Stegun 9.4.1 and 9.4.3, good to about 1e-7).
function J0(x) {
  x = Math.abs(x);
  if (x < 3) { const t = x * x / 9; return 1 + t * (-2.2499997 + t * (1.2656208 + t * (-0.3163866 + t * (0.0444479 + t * (-0.0039444 + t * 0.00021))))); }
  const t = 3 / x;
  const f = 0.79788456 + t * (-0.00000077 + t * (-0.0055274 + t * (-0.00009512 + t * (0.00137237 + t * (-0.00072805 + t * 0.00014476)))));
  const th = x - 0.78539816 + t * (-0.04166397 + t * (-0.00003954 + t * (0.00262573 + t * (-0.00054125 + t * (-0.00029333 + t * 0.00013558)))));
  return f * Math.cos(th) / Math.sqrt(x);
}
// The microscope's blur for a wave's amplitude, from its pupil: every direction the objective
// accepts (rho = 0 on the axis to 1 at the edge of the aperture) adds in, and when the camera is
// focused dz away from the object the steeper directions fall behind in phase by
//     k n dz ( sqrt(1 - (rho NA / n)^2) - 1 )
// measured against the axial direction, which is the one the reference wave travels in. Returns
// the complex blur h(r) in nm^-2, tabulated by radius; its integral over the image is 1 whatever
// the focus, so defocus moves contrast between the centre and the rings without removing any.
export const PSF_DR = 10, PSF_N = 126;                                   // nm per sample; out to 1.25 um
const NRHO = 120;
export function pupil(lambda, dz) {
  const re = new Float64Array(PSF_N), im = new Float64Array(PSF_N), s = NA / N_GLASS, kd = 2 * PI * N_GLASS * dz / lambda, q = 2 * PI * NA / lambda;
  const cr = new Float64Array(NRHO), ci = new Float64Array(NRHO);
  for (let j = 0; j < NRHO; j++) { const rho = (j + 0.5) / NRHO, ph = kd * (Math.sqrt(1 - rho * rho * s * s) - 1), w = rho / NRHO * q * NA / lambda; cr[j] = Math.cos(ph) * w; ci[j] = Math.sin(ph) * w; }
  for (let i = 0; i < PSF_N; i++) {
    let a = 0, b = 0; const x = q * i * PSF_DR / NRHO;
    for (let j = 0; j < NRHO; j++) { const J = J0(x * (j + 0.5)); a += cr[j] * J; b += ci[j] * J; }
    re[i] = a; im[i] = b;
  }
  return { re, im };
}
const at = (t, r) => { const x = r / PSF_DR, i = Math.floor(x); return i >= PSF_N - 1 ? 0 : t[i] + (t[i + 1] - t[i]) * (x - i); };

// focus: where the shared objective is focused, from 0 (on the fluorescence) to 1 (on the reflection).
export function irmOptics(lambda, focus = 0) {
  const k0 = 2 * PI / lambda;
  // The undisturbed stack: glass, GAP of medium, the flat cell membrane, cytoplasm.
  const rGM = (N_GLASS - N_MEDIUM) / (N_GLASS + N_MEDIUM), rMC = (N_MEDIUM - N_CELL) / (N_MEDIUM + N_CELL);
  const film = k0 * MEM * (N_LIPID * N_LIPID - N_CELL * N_CELL) / (2 * N_CELL), ph = 2 * k0 * N_MEDIUM * GAP;
  const re = rGM + rMC * Math.cos(ph) - film * Math.sin(ph), im = rMC * Math.sin(ph) + film * Math.cos(ph);
  // The two colours focus `apart` nm from each other; the focus setting shares that out.
  const apart = focalShift(lambda) - focalShift(LAMBDA_EM), dz = apart * (1 - focus), dzF = -apart * focus;
  const h = pupil(lambda, dz), h0 = pupil(lambda, 0), f = pupil(LAMBDA_EM, dzF), f0 = pupil(LAMBDA_EM, 0);
  // Fluorescence adds as intensity: its blur keeps its light but spreads, by the drop in its peak (the Strehl ratio).
  const strehl = (f.re[0] * f.re[0] + f.im[0] * f.im[0]) / (f0.re[0] * f0.re[0]);
  // Height markers. To this camera a small piece of membrane at height z above the glass (inside
  // the cell) changes the brightness in proportion to cos(psi0 + kz (z - GAP)): brightest where
  // that phase is a whole number of turns, darkest half a turn away, repeating every lambda / 2n.
  const kz = 2 * k0 * N_CELL, wr = Math.cos(ph) * re + Math.sin(ph) * im, wi = Math.sin(ph) * re - Math.cos(ph) * im, psi0 = Math.atan2(wr, -wi);
  const first = (target) => GAP + ((((target - psi0) % (2 * PI)) + 2 * PI) % (2 * PI)) / kz;
  let half = 0; while (half < PSF_N - 1 && h0.re[half] > h0.re[0] / 2) half++;
  return { lambda, focus, k0, kz, psi0, bright: first(0), dark: first(PI), re, im, I: re * re + im * im, glass: rGM * rGM, fringe: lambda / (2 * N_CELL), apart, dz, dzF,
    h, peak: h0.re[0], fwhm: 2 * half * PSF_DR, strehl, blurF: 1 / Math.sqrt(strehl),
    // Contrast at radius r (nm) from the centre of a spot with complex strength c (see moment).
    spot: (c, r) => c[0] * at(h.re, r) - c[1] * at(h.im, r) };
}

// How strongly one fusion site changes the picture at progress p for a vesicle of midplane radius
// R. The site is far smaller than the blur, so it is treated as a point with one complex strength
// c = out[0] + i out[1], in nm^2: the picture's fractional change at radius r is Re(c h(r)). In
// focus h is real, and out[0] is the spot's contrast times its area (negative is darker).
const NC = 96, NF = 64;
export function moment(o, p, R, out) {
  const S = shape(p, R), lift = S.neck < -D ? S.extra : 0;
  const dLip = (N_LIPID * N_LIPID - N_CELL * N_CELL) * MEM, dLum = N_MEDIUM * N_MEDIUM - N_CELL * N_CELL;
  const kz = 2 * o.k0 * N_CELL, ph0 = 2 * o.k0 * N_MEDIUM * GAP;
  let qr = 0, qi = 0, r0 = 0, y0 = 0, first = true;
  const step = (r, y) => {
    if (!first && (r > 0 || r0 > 0)) {
      const rm = (r + r0) / 2, ym = (y + y0) / 2, ri = Math.max(0, rm - MEM / 2);
      const shell = dLip * 2 * PI * rm * Math.hypot(r - r0, y - y0);    // membrane: area times thickness
      const lumen = dLum * PI * ri * ri * (y0 - y);                      // watery volume enclosed at this height
      const c = Math.cos(ph0 + kz * ym), s = Math.sin(ph0 + kz * ym);
      qr += (shell + lumen) * c; qi += (shell + lumen) * s;
    }
    r0 = r; y0 = y; first = false;
  };
  for (let i = 0; i <= NC; i++) { const a = S.theta * i / NC; step(S.Rc * Math.sin(a), S.h + lift + S.Rc * Math.cos(a)); }
  for (let i = 1; i <= NF; i++) {
    const ps = S.theta * (1 - i / NF);
    step(Math.max(0, S.c - S.rho * Math.sin(ps)), S.rho - S.rho * Math.cos(ps) + (ps > PI / 2 ? lift : 0));
  }
  // The disc of flat membrane that the neck has replaced is no longer there.
  if (S.c > 0) { const hole = dLip * PI * S.c * S.c; qr -= hole * Math.cos(ph0); qi -= hole * Math.sin(ph0); }
  // Scattered wave M = i k0 / (2 n) * q; picture = |reference + M * blur|^2, to first order in M.
  const g = o.k0 / (2 * N_CELL), mr = -g * qi, mi = g * qr;
  out[0] = 2 * (o.re * mr + o.im * mi) / o.I;
  out[1] = 2 * (o.re * mi - o.im * mr) / o.I;
  return out;
}

// A rough screen colour for a wavelength in the range of the slider.
export function hue(nm) {
  const t = Math.min(1, Math.max(0, (nm - 560) / 85)), dim = 1 - 0.45 * Math.min(1, Math.max(0, (nm - 660) / 60));
  return [1.0 * dim, (0.92 - 0.82 * t) * dim, 0.08 * dim];
}
export const css = (c) => `rgb(${c.map((v) => Math.round(255 * v)).join(',')})`;

// ---- the second camera ---------------------------------------------------------------------------
// Same sensor geometry as the fluorescence camera (65 nm pixels, the same field), shown in grey
// after dividing by the brightness of the undisturbed background.
export class IrmCamera {
  constructor(canvas, zoom, trace) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.zctx = zoom.getContext('2d'); this.trace = trace; this.tctx = trace.getContext('2d');
    this.img = this.ctx.createImageData(CAM.px, CAM.px); this.f = new Float32Array(CAM.px * CAM.px);
    this.noise = new Float32Array(CAM.px * CAM.px); this.r = rng(57);
  }
  // The noise-free picture of a set of spots, as fractional change from the background.
  // spots: [[x, z, strength (real part), strength (imaginary part)]...], as returned by moment
  field(o, spots, f) {
    const n = CAM.px, half = n / 2;
    f.fill(0);
    const R = Math.ceil(PSF_N * PSF_DR / CAM.nm), c = [0, 0];
    for (const [x, z, cr, ci] of spots) {
      const cx = x / CAM.nm + half - 0.5, cy = z / CAM.nm + half - 0.5;
      if (cx < -R || cy < -R || cx > n + R || cy > n + R) continue;
      c[0] = cr; c[1] = ci;
      for (let j = Math.max(0, Math.floor(cy - R)); j <= Math.min(n - 1, Math.ceil(cy + R)); j++)
        for (let i = Math.max(0, Math.floor(cx - R)); i <= Math.min(n - 1, Math.ceil(cx + R)); i++)
          f[j * n + i] += o.spot(c, CAM.nm * Math.hypot(i - cx, j - cy));
    }
    return f;
  }
  // Keep a baseline picture (the field before our vesicle arrived), to subtract from later ones. It was one exposure
  // like any other, so it carries its own shot noise, which then sits in every subtracted picture.
  reference(o, spots) {
    const n = CAM.px * CAM.px;
    if (!this.ref) { this.ref = new Float32Array(n); this.refNoise = new Float32Array(n); const r = rng(58); for (let i = 0; i < n; i++) this.refNoise[i] = r.gauss(); }
    this.field(o, spots, this.ref); this.drawn = false;
  }
  // subtract: show the change since the baseline frame (see reference) in place of the picture itself.
  render(o, spots, reshuffle, subtract) {
    if (!reshuffle && this.drawn) return;                              // like the other camera: one new picture per exposure
    this.drawn = true;
    const n = CAM.px, f = this.field(o, spots, this.f);
    if (reshuffle) for (let i = 0; i < n * n; i++) this.noise[i] = this.r.gauss();
    const d = this.img.data, sd = 1 / Math.sqrt(WELL * SHOW_MS);       // shot noise of the reference wave
    const span = subtract ? SPAN_DIFF : SPAN, ref = subtract ? this.ref : null, rn = this.refNoise;
    for (let i = 0; i < n * n; i++) {
      const v = ref ? f[i] - ref[i] + (this.noise[i] - rn[i]) * sd : f[i] + this.noise[i] * sd;
      const g = 255 * Math.min(1, Math.max(0, 0.5 + v / (2 * span)));
      d[i * 4] = g; d[i * 4 + 1] = g * 0.97; d[i * 4 + 2] = g * 0.93; d[i * 4 + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
    const z = CAM.zoom, off = (n - z) / 2; this.zctx.drawImage(this.canvas, off, off, z, z, 0, 0, z, z);
  }
  // curve: contrast at the centre of our spot against progress (a fraction of the background).
  drawTrace(curve, p, col) {
    const c = this.tctx, w = this.trace.width, h = this.trace.height, n = curve.length;
    let lo = 0, hi = 0; for (const v of curve) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = (hi - lo || 1e-6) * 0.12; lo -= pad; hi += pad;
    const X = (i) => 4 + (w - 6) * i / (n - 1), Y = (v) => h - 4 - (h - 8) * (v - lo) / (hi - lo);
    c.clearRect(0, 0, w, h);
    c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(n - 1), Y(0)); c.setLineDash([5, 5]); c.lineWidth = 1.5; c.strokeStyle = 'rgba(234,240,255,.4)'; c.stroke(); c.setLineDash([]);
    c.beginPath(); curve.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
    c.lineWidth = 2; c.strokeStyle = col; c.stroke();
    const fi = p * (n - 1), i0 = Math.min(n - 2, Math.floor(fi)), v = curve[i0] + (curve[i0 + 1] - curve[i0]) * (fi - i0);
    c.beginPath(); c.moveTo(X(fi), 0); c.lineTo(X(fi), h); c.lineWidth = 1; c.strokeStyle = 'rgba(234,240,255,.35)'; c.stroke();
    c.beginPath(); c.arc(X(fi), Y(v), 3.5, 0, 2 * PI); c.fillStyle = '#EAF0FF'; c.fill();
    c.beginPath(); c.moveTo(1, 0); c.lineTo(1, h - 1); c.lineTo(w, h - 1); c.lineWidth = 2; c.strokeStyle = 'rgba(234,240,255,.45)'; c.stroke();
  }
}

// The reflection light's path at the scale of the bench: straight up the axis of the objective and
// back down the same way, in the same form as the laser's segments in vitro.js.
export function irmBeam(lambda) {
  return [{ a: [0, LENS_Y - 70e6, 0], b: [0, GLASS_TOP, 0], w: 30e3, c: hue(lambda), k: 0.8 }];
}

// Contrast at the centre of the spot for a whole event, arrival included, for the trace.
export function contrastCurve(o, R, n = 260) {
  const out = [], m = [0, 0];
  for (let i = 0; i < n; i++) out.push(o.spot(moment(o, -ARRIVE + (1 + ARRIVE) * i / (n - 1), R, m), 0));
  return out;
}
