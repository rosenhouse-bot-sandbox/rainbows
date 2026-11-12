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
import { shape, D } from './profile.js';
import { N_GLASS, N_CELL, NA, GAP, CAM, LENS_Y, GLASS_TOP } from './vitro.js';
import { rng } from './glx.js';

export const N_MEDIUM = 1.335, N_LIPID = 1.48, MEM = 4;     // medium and vesicle interior; bilayer; its thickness in nm
export const IRM = { lambda: 630, min: 560, max: 720 };     // nm; above 560 it stays clear of the pHluorin emission band
export const WELL = 2e4;                                    // photoelectrons per pixel per millisecond from the reference wave
export const SHOW_MS = 10;                                  // exposure of one displayed frame
export const SPAN = 0.015;                                  // the display's full grey range is -SPAN .. +SPAN of the background
const PI = Math.PI;

export function irmOptics(lambda) {
  const k0 = 2 * PI / lambda;
  // The undisturbed stack: glass, GAP of medium, the flat cell membrane, cytoplasm.
  const rGM = (N_GLASS - N_MEDIUM) / (N_GLASS + N_MEDIUM), rMC = (N_MEDIUM - N_CELL) / (N_MEDIUM + N_CELL);
  const film = k0 * MEM * (N_LIPID * N_LIPID - N_CELL * N_CELL) / (2 * N_CELL), ph = 2 * k0 * N_MEDIUM * GAP;
  const re = rGM + rMC * Math.cos(ph) - film * Math.sin(ph), im = rMC * Math.sin(ph) + film * Math.cos(ph);
  const sigmaA = Math.SQRT2 * 0.21 * lambda / NA;           // blur of the wave's amplitude: sqrt(2) wider than of an intensity
  return { lambda, k0, re, im, I: re * re + im * im, glass: rGM * rGM, sigmaA, fwhm: 2.355 * sigmaA, fringe: lambda / (2 * N_CELL) };
}

// How strongly, and how widely, one fusion site changes the picture at progress p for a vesicle of
// midplane radius R. Returns out[0]: the contrast integrated over the image plane, in nm^2 (the
// spot's fractional change in brightness times its area; negative is darker), and out[1]: the
// variance in nm^2 that the site's own width adds to the blur.
const NC = 96, NF = 64;
export function moment(o, p, R, out) {
  const S = shape(p, R), lift = S.neck < -D ? S.extra : 0;
  const dLip = (N_LIPID * N_LIPID - N_CELL * N_CELL) * MEM, dLum = N_MEDIUM * N_MEDIUM - N_CELL * N_CELL;
  const kz = 2 * o.k0 * N_CELL, ph0 = 2 * o.k0 * N_MEDIUM * GAP;
  let qr = 0, qi = 0, wsum = 0, w2 = 0, r0 = 0, y0 = 0, first = true;
  const step = (r, y) => {
    if (!first && (r > 0 || r0 > 0)) {
      const rm = (r + r0) / 2, ym = (y + y0) / 2, ri = Math.max(0, rm - MEM / 2);
      const shell = dLip * 2 * PI * rm * Math.hypot(r - r0, y - y0);    // membrane: area times thickness
      const lumen = dLum * PI * ri * ri * (y0 - y);                      // watery volume enclosed at this height
      const c = Math.cos(ph0 + kz * ym), s = Math.sin(ph0 + kz * ym);
      qr += (shell + lumen) * c; qi += (shell + lumen) * s;
      const a = Math.abs(shell), b = Math.abs(lumen);
      wsum += a + b; w2 += a * rm * rm / 2 + b * ri * ri / 4;
    }
    r0 = r; y0 = y; first = false;
  };
  for (let i = 0; i <= NC; i++) { const a = S.theta * i / NC; step(S.Rc * Math.sin(a), S.h + lift + S.Rc * Math.cos(a)); }
  for (let i = 1; i <= NF; i++) {
    const ps = S.theta * (1 - i / NF);
    step(Math.max(0, S.c - S.rho * Math.sin(ps)), S.rho - S.rho * Math.cos(ps) + (ps > PI / 2 ? lift : 0));
  }
  // The disc of flat membrane that the neck has replaced is no longer there.
  if (S.c > 0) { const hole = dLip * PI * S.c * S.c; qr -= hole * Math.cos(ph0); qi -= hole * Math.sin(ph0); wsum += hole; w2 += hole * S.c * S.c / 4; }
  // Scattered wave M = i k0 / (2 n) * q; picture = |reference + M * blur|^2, to first order in M.
  const g = o.k0 / (2 * N_CELL), mr = -g * qi, mi = g * qr;
  out[0] = 2 * (o.re * mr + o.im * mi) / o.I;
  out[1] = wsum > 0 ? w2 / wsum : 0;
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
  // spots: [[x, z, contrast moment in nm^2, extra variance in nm^2]...]
  render(o, spots, reshuffle) {
    if (!reshuffle && this.drawn) return;                              // like the other camera: one new picture per exposure
    this.drawn = true;
    const n = CAM.px, f = this.f, half = n / 2, px2 = CAM.nm * CAM.nm;
    f.fill(0);
    for (const [x, z, c, w] of spots) {
      const v = (o.sigmaA * o.sigmaA + w) / px2, a = c / px2 / (2 * PI * v), k = 1 / (2 * v), R = Math.ceil(Math.sqrt(v) * 3.5);
      const cx = x / CAM.nm + half - 0.5, cy = z / CAM.nm + half - 0.5;
      if (cx < -R || cy < -R || cx > n + R || cy > n + R) continue;
      for (let j = Math.max(0, Math.floor(cy - R)); j <= Math.min(n - 1, Math.ceil(cy + R)); j++)
        for (let i = Math.max(0, Math.floor(cx - R)); i <= Math.min(n - 1, Math.ceil(cx + R)); i++)
          f[j * n + i] += a * Math.exp(-((i - cx) * (i - cx) + (j - cy) * (j - cy)) * k);
    }
    if (reshuffle) for (let i = 0; i < n * n; i++) this.noise[i] = this.r.gauss();
    const d = this.img.data, sd = 1 / Math.sqrt(WELL * SHOW_MS);       // shot noise of the reference wave
    for (let i = 0; i < n * n; i++) {
      const g = 255 * Math.min(1, Math.max(0, 0.5 + (f[i] + this.noise[i] * sd) / (2 * SPAN)));
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

// Contrast at the centre of the spot for a whole event, for the trace.
export function contrastCurve(o, R, n = 72) {
  const out = [], m = [0, 0];
  for (let i = 0; i < n; i++) { moment(o, i / (n - 1), R, m); out.push(m[0] / (2 * PI * (o.sigmaA * o.sigmaA + m[1]))); }
  return out;
}
