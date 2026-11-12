// In vitro mode: the cell sits on a glass-bottom dish over a TIRF microscope.
// This file holds the optics, the bench-scale geometry (dish, coverslip, oil, objective, cells)
// and the simulated camera image. Units are nanometres, like the rest of the scene.
import { rng } from './glx.js';

export const N_GLASS = 1.518, N_CELL = 1.36;         // coverslip / immersion oil, and watery cytoplasm
export const LAMBDA_EX = 488, LAMBDA_EM = 510;       // nm: argon-line laser, pHluorin emission peak
export const NA = 1.49, F_OBJ = 2e6;                 // 100x TIRF objective, 2 mm focal length
export const GAP = 40;                               // nm of medium between the cell and the glass
export const UM = 1e3, MM = 1e6;
export const CELL = { x: 3400, z: -2100, r: 9500 };  // our cell's footprint on the glass
export const SPOT = 15000;                           // nm, 1/e half-width of the laser footprint (wider along the beam)
export const spot = (x, z) => Math.exp(-(x * x * 0.25 + z * z) / (2 * SPOT * SPOT));
export const domeY = (x, z) => { const r = Math.hypot(x - CELL.x, z - CELL.z) / CELL.r; return r >= 1 ? 0 : CELL.r * (0.62 * Math.pow(1 - r * r, 0.8) + 0.035 * (1 - r)); };
export const GLASS_TOP = -GAP, GLASS_BOT = -GAP - 170 * UM, LENS_Y = GLASS_BOT - 120 * UM;
export const THETA_MAX = Math.asin(NA / N_GLASS) * 180 / Math.PI;   // steepest ray the objective can deliver
export const EV = (nm) => 1239.84 / nm;              // photon energy in electron-volts
const PI = Math.PI, D0 = 2;

// What the laser does at the glass-water boundary for a given angle of incidence (s-polarised).
export function optics(deg) {
  const th = deg * PI / 180, s = Math.sin(th), c = Math.cos(th), n = N_CELL / N_GLASS;
  const o = { deg, th, crit: Math.asin(n) * 180 / PI, kx: 2 * PI * N_GLASS * s / LAMBDA_EX, ky: 2 * PI * N_GLASS * c / LAMBDA_EX };
  if (s > n) {
    // Total internal reflection. Nothing propagates into the cell, but an evanescent field
    // leaks across the boundary and dies away exponentially with height.
    o.tir = true;
    o.depth = LAMBDA_EX / (4 * PI * Math.sqrt(N_GLASS * N_GLASS * s * s - N_CELL * N_CELL));
    o.I0 = 4 * c * c / (1 - n * n);                  // intensity at the surface, relative to the incoming beam
    o.delta = Math.atan2(Math.sqrt(s * s - n * n), c);
    o.r = 1; o.kyMed = 0; o.thT = PI / 2;
  } else {
    // Below the critical angle the beam simply refracts into the cell and lights all of it.
    const ct = Math.sqrt(1 - (s / n) * (s / n));
    o.tir = false; o.depth = Infinity;
    o.r = (c - n * ct) / (c + n * ct); o.I0 = (1 + o.r) * (1 + o.r);
    o.delta = 0; o.kyMed = 2 * PI * N_CELL * ct / LAMBDA_EX; o.thT = Math.acos(ct);
  }
  o.at = (h) => o.I0 / 4 * (o.tir ? Math.exp(-Math.max(0, h) / o.depth) : 1);   // normalised so the brightest possible is 1
  return o;
}

// ---- bench-scale geometry ------------------------------------------------------------------------
// Surface of revolution from a profile of [radius, height, colour]; flat-shaded per band.
function lathe(profile, seg = 72, out = []) {
  for (let k = 0; k < profile.length - 1; k++) {
    const [r0, y0, c] = profile[k], [r1, y1] = profile[k + 1];
    const dr = r1 - r0, dy = y1 - y0, l = Math.hypot(dr, dy) || 1, nr = dy / l, ny = -dr / l;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 2 * PI, a1 = (i + 1) / seg * 2 * PI;
      const v = (r, y, a) => out.push(r * Math.cos(a), y, r * Math.sin(a), nr * Math.cos(a), ny, nr * Math.sin(a), c[0], c[1], c[2], c[3] === undefined ? 1 : c[3]);
      v(r0, y0, a0); v(r1, y1, a0); v(r1, y1, a1); v(r0, y0, a0); v(r1, y1, a1); v(r0, y0, a1);
    }
  }
  return out;
}

export function buildBench(gl) {
  const mesh = (data, inst) => {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    [[0, 3, 0], [1, 3, 12], [2, 4, 24]].forEach(([loc, size, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 40, off); });
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(inst || [0, 0, 0, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
    return { vao, n: data.length / 10, inst: inst ? inst.length / 4 : 1 };
  };
  const B = {};
  // The objective: a 100x/1.49 oil-immersion TIRF lens, about 28 mm across and 45 mm long.
  const steel = [0.70, 0.72, 0.76], dark = [0.13, 0.14, 0.17], brass = [0.62, 0.52, 0.30], Y = LENS_Y;
  B.objective = mesh(lathe([
    [0, Y, [0.30, 0.42, 0.50]], [1.7 * MM, Y, steel], [2.3 * MM, Y - 0.5 * MM, steel], [4.4 * MM, Y - 2.6 * MM, steel], [8.2 * MM, Y - 7.0 * MM, steel],
    [10.2 * MM, Y - 8.0 * MM, dark], [10.2 * MM, Y - 9.4 * MM, [0.93, 0.93, 0.90]], [10.2 * MM, Y - 11.4 * MM, dark],   // white band: 100x
    [10.2 * MM, Y - 13.2 * MM, steel], [12.6 * MM, Y - 14.0 * MM, dark], [12.6 * MM, Y - 22.5 * MM, steel], [11.6 * MM, Y - 23.2 * MM, steel],
    [11.6 * MM, Y - 39.5 * MM, brass], [10.2 * MM, Y - 40.2 * MM, brass], [10.2 * MM, Y - 45 * MM, dark], [0, Y - 45 * MM, dark],
  ]));
  B.oil = mesh(lathe([[0, GLASS_BOT - 3 * UM, [0.95, 0.80, 0.35, 0.16]], [2.6 * MM, GLASS_BOT - 3 * UM, [0.95, 0.80, 0.35, 0.16]], [2.9 * MM, (GLASS_BOT + Y) / 2, [0.95, 0.80, 0.35, 0.16]], [2.1 * MM, Y + 3 * UM, [0.95, 0.80, 0.35, 0.16]]], 48));
  const glass = [0.72, 0.86, 0.95, 0.05];
  B.coverslip = mesh(lathe([[11 * MM, GLASS_TOP, glass], [11 * MM, GLASS_BOT, glass], [0, GLASS_BOT, glass]]));
  const ps = [0.85, 0.90, 0.95, 0.13];
  B.dish = mesh(lathe([[10 * MM, GLASS_TOP + 0.9 * MM, ps], [10 * MM, GLASS_TOP, ps], [10 * MM, GLASS_BOT, ps], [17.5 * MM, GLASS_BOT, ps], [17.5 * MM, 10 * MM, ps], [16.7 * MM, 10 * MM, ps], [16.7 * MM, GLASS_TOP + 0.9 * MM, ps], [10 * MM, GLASS_TOP + 0.9 * MM, ps]]));
  const med = [0.95, 0.55, 0.62, 0.10];
  B.medium = mesh(lathe([[0, 3.6 * MM, med], [16.7 * MM, 3.6 * MM, med]]));
  // Cells: low domes spread on the glass. The first is ours; the rest are neighbours in the culture.
  const cellCol = [0.34, 0.57, 0.80, 0.24], prof = [];
  for (let i = 0; i <= 14; i++) { const r = i / 14; prof.push([r, 0.62 * Math.pow(1 - r * r, 0.8) + 0.035 * (1 - r), cellCol]); }
  const r = rng(41), inst = [CELL.x, D0, CELL.z, CELL.r], nuc = [[CELL.x, 3.3 * UM, CELL.z, 2.9 * UM]];
  let guard = 0;
  const placed = [[CELL.x, CELL.z, CELL.r]];
  while (placed.length < 420 && guard++ < 20000) {
    const a = r() * 2 * PI, rr = Math.pow(r(), 0.7) * 1.9 * MM, x = rr * Math.cos(a), z = rr * Math.sin(a), s = (7 + r() * 5) * UM;
    if (placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < q[2] + s + 2 * UM)) continue;
    placed.push([x, z, s]); inst.push(x, D0, z, s); nuc.push([x, s * 0.35, z, s * 0.3]);
  }
  B.cells = mesh(lathe(prof, 28), inst);
  B.nuclei = nuc;
  // Fluorescence collected by the objective: a cone up to the NA limit, then a collimated beam.
  const em = [0.25, 1.0, 0.35, 1];
  B.emission = mesh(lathe([[0, GLASS_TOP, em], [1.45 * MM, Y, em], [NA * F_OBJ, Y - 3.2 * MM, em], [NA * F_OBJ, Y - 70 * MM, em]], 40));
  return B;
}

// Path of the laser through the objective to the glass surface and back, as line segments.
export function beamPath(o) {
  const t = Math.tan(o.th), x1 = (GLASS_TOP - LENS_Y) * t, x2 = F_OBJ * N_GLASS * Math.sin(o.th);
  const ex = [0.10, 0.72, 1.0], w = 30 * UM, seg = [];
  const leg = (sx, k) => {
    seg.push({ a: [sx * x2, LENS_Y - 70 * MM, 0], b: [sx * x2, LENS_Y - 3.2 * MM, 0], w, c: ex, k });
    seg.push({ a: [sx * x2, LENS_Y - 3.2 * MM, 0], b: [sx * x1, LENS_Y, 0], w, c: ex, k });
    seg.push({ a: [sx * x1, LENS_Y, 0], b: [0, GLASS_TOP, 0], w, c: ex, k });
  };
  leg(-1, 1); leg(1, o.r * o.r);                       // in, and the reflection
  if (!o.tir) seg.push({ a: [0, GLASS_TOP, 0], b: [Math.sin(o.thT) * 600 * UM, GLASS_TOP + Math.cos(o.thT) * 600 * UM, 0], w, c: ex, k: 1 - o.r * o.r });
  return seg;
}

// ---- the camera image ----------------------------------------------------------------------------
// What a camera behind the objective records: every fluorophore becomes a diffraction-limited
// blur about 175 nm wide, sampled by 65 nm pixels, with photon shot noise on top.
// zoom: side, in pixels, of the central crop shown magnified in the second display.
// photons: how many photons a pixel collects in one frame at brightness 1 (a fully lit vesicle on
// the glass peaks near 180); read: the sensor's read noise in electrons, added to every pixel.
export const CAM = { px: 128, zoom: 24, nm: 65, sigma: 0.21 * LAMBDA_EM / NA, fwhm: 0.51 * LAMBDA_EM / NA, photons: 80, read: 1.5 };
export class Camera {
  constructor(canvas, trace, zoom) {
    this.canvas = canvas; this.zctx = zoom ? zoom.getContext('2d') : null;
    this.ctx = canvas.getContext('2d'); this.img = this.ctx.createImageData(CAM.px, CAM.px);
    this.f = new Float32Array(CAM.px * CAM.px); this.trace = trace; this.tctx = trace.getContext('2d');
    this.r = rng(99); this.curve = null; this.count = new Int32Array(CAM.px * CAM.px); this.peak = 0;
  }
  // emit: [[x, z, brightness, spread]...] in nm, where spread is how far a vesicle's tags have
  // wandered (it widens the blur and lowers the peak); bg: out-of-focus background.
  // Returns without drawing unless a new frame is due: the picture only changes once per exposure.
  render(emit, bg, reshuffle) {
    if (!reshuffle && this.drawn) return;
    this.drawn = true;
    const n = CAM.px, f = this.f, s = CAM.sigma / CAM.nm, half = n / 2;
    f.fill(bg);
    for (const [x, z, b0, spread] of emit) {
      if (b0 < 1e-4) continue;
      const sw = spread ? Math.hypot(s, spread / CAM.nm) : s, k = 1 / (2 * sw * sw), b = b0 * s * s / (sw * sw);
      const cx = x / CAM.nm + half - 0.5, cy = z / CAM.nm + half - 0.5, R = Math.min(20, Math.ceil(sw * 3.5));
      if (cx < -R || cy < -R || cx > n + R || cy > n + R) continue;
      for (let j = Math.max(0, Math.floor(cy - R)); j <= Math.min(n - 1, Math.ceil(cy + R)); j++)
        for (let i = Math.max(0, Math.floor(cx - R)); i <= Math.min(n - 1, Math.ceil(cx + R)); i++)
          f[j * n + i] += b * Math.exp(-((i - cx) * (i - cx) + (j - cy) * (j - cy)) * k);
    }
    // One exposure. Light arrives as whole photons, so each pixel records a Poisson-distributed
    // count around its expected value (shot noise), plus a little read noise from the sensor.
    const d = this.img.data, r = this.r, G = CAM.photons, z0 = (n - CAM.zoom) / 2, z1 = z0 + CAM.zoom;
    let peak = 0;
    for (let i = 0; i < n * n; i++) {
      const lam = f[i] * G;
      let c = 0;
      if (lam < 30) { const L = Math.exp(-lam); for (let q = r(); q > L; q *= r()) c++; }
      else c = Math.round(lam + Math.sqrt(lam) * r.gauss());
      c = Math.max(0, Math.round(c + CAM.read * r.gauss()));
      this.count[i] = c;
      const x = i % n, y = (i - x) / n;
      if (c > peak && x >= z0 && x < z1 && y >= z0 && y < z1) peak = c;
      const t = Math.pow(Math.min(1, c / (2.3 * G)), 0.72);
      d[i * 4] = 255 * Math.pow(t, 2.6) * 0.85; d[i * 4 + 1] = 255 * Math.min(1, t * 1.08); d[i * 4 + 2] = 255 * Math.pow(t, 1.9) * 0.55; d[i * 4 + 3] = 255;
    }
    this.peak = peak;
    this.ctx.putImageData(this.img, 0, 0);
    // The second display is the middle of the very same frame, magnified: no new information.
    if (this.zctx) this.zctx.putImageData(this.img, -z0, -z0, z0, z0, CAM.zoom, CAM.zoom);
  }
  // curve: fluorescence at the fusion site against progress; p marks where we are.
  drawTrace(curve, p) {
    const c = this.tctx, w = this.trace.width, h = this.trace.height, n = curve.length;
    const max = Math.max(1e-6, ...curve) * 1.12, X = (i) => 4 + (w - 6) * i / (n - 1), Yv = (v) => h - 5 - (h - 10) * v / max;
    c.clearRect(0, 0, w, h);
    c.beginPath(); curve.forEach((v, i) => (i ? c.lineTo(X(i), Yv(v)) : c.moveTo(X(i), Yv(v))));
    c.lineWidth = 2; c.strokeStyle = 'rgba(110,255,140,.95)'; c.stroke();
    c.lineTo(X(n - 1), h); c.lineTo(X(0), h); c.closePath(); c.fillStyle = 'rgba(110,255,140,.13)'; c.fill();
    const fi = p * (n - 1), i0 = Math.min(n - 2, Math.floor(fi)), v = curve[i0] + (curve[i0 + 1] - curve[i0]) * (fi - i0);
    c.beginPath(); c.moveTo(X(fi), 0); c.lineTo(X(fi), h); c.lineWidth = 1; c.strokeStyle = 'rgba(234,240,255,.35)'; c.stroke();
    c.beginPath(); c.arc(X(fi), Yv(v), 3.5, 0, 2 * PI); c.fillStyle = '#EAF0FF'; c.fill();
    // The axes: intensity up the left edge, time along the bottom.
    c.beginPath(); c.moveTo(1, 0); c.lineTo(1, h - 1); c.lineTo(w, h - 1); c.lineWidth = 2; c.strokeStyle = 'rgba(234,240,255,.45)'; c.stroke();
  }
}
