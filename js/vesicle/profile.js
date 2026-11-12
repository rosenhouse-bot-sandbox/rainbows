// Geometry of the fusing membrane.
//
// The bilayer midplane is a surface of revolution made of three analytic pieces: a spherical cap
// (the vesicle), a toroidal fillet (the neck) and the flat plasma membrane. One angle, theta,
// carries the whole event: at theta = pi the cap is a complete sphere resting above the plane,
// at pi/2 it is an omega figure with a wide-open neck, and at 0 it has flattened into the plane.
//
// Each leaflet is the midplane offset by +/-D (the depth of its headgroups). Offsetting the neck
// inward makes the cytoplasmic leaflets meet first (the hemifusion stalk of the Kozlov-Markin
// model) while the far leaflets are still two separate, dimpled sheets. They meet later, and
// that is the moment the pore opens. Nothing is special-cased: the stalk, the hemifusion state
// and the pore all fall out of clipping the offset curves at the axis.
//
// Lipids ride on the surface by "area coordinate": the membrane area enclosed between the top
// of the vesicle and the lipid. Area is conserved, so as the vesicle flattens, its lipids pour
// through the neck and the surrounding membrane is pushed outward by exactly the right amount.
import { sstep } from './glx.js';

export const D = 1.9;          // nm, midplane to headgroup centres
export const RHO0 = 3.2;       // nm, meridional radius of the neck when it first forms
export const CLEFT = 20;       // nm, midplane to midplane across the synaptic cleft
export const TABW = 2048;      // samples per lookup row
export const BAREA = Math.PI * 30 * 30;   // nm^2 of plasma membrane covered by the second row
// Before it docks the vesicle has to get there. Progress runs from -ARRIVE up to 0 while it comes
// down the last APPROACH nanometres; from 0 on, everything is as before.
export const ARRIVE = 0.2, APPROACH = 120;
// The arrival has two parts. First the vesicle wanders by Brownian motion, drifting down; then,
// CAPTURE of the way from docking and REACH nanometres up, a tether on the active zone catches it,
// which quiets the wandering, and reels it in. The wander is a fixed sum of sines so that the
// slider always shows the same path; only its up-and-down part is drawn.
export const CAPTURE = 0.42, REACH = 42;
const wander = (u) => 0.5 * Math.sin(33.3 * u + 1.1) + 0.3 * Math.sin(55.9 * u + 4.0) + 0.2 * Math.sin(89.2 * u + 2.3);
export const PH = { CA: 0.10, STALK: 0.22, PORE: 0.36, DILATE: 0.50, OMEGA: 0.70, MERGED: 0.92 };
const PI = Math.PI, NC = 220, NF = 160;

export function shape(p, R) {
  let n;                       // radius of the neck measured at the midplane; negative before contact
  if (p < PH.CA) n = -RHO0;
  else if (p < PH.STALK) n = -RHO0 + (RHO0 - D) * sstep(PH.CA, PH.STALK, p);
  else if (p < PH.PORE) n = -D + 2 * D * sstep(PH.STALK, PH.PORE, p);
  else n = D + 1.6 * sstep(PH.PORE, PH.DILATE, p);
  const u = Math.min(1, Math.max(0, -p / ARRIVE));
  const approachBase = u > CAPTURE ? REACH + (APPROACH - REACH) * sstep(CAPTURE, 1, u) : REACH * sstep(0, CAPTURE, u);
  const jitter = wander(u) * (16 * sstep(CAPTURE - 0.04, CAPTURE + 0.1, u) + 4 * sstep(0.02, 0.2, u));
  const approach = u > 0 ? Math.max(0, approachBase + jitter) : 0;   // height still to come down before docking
  const extra = approach + 5 * (1 - sstep(0, PH.CA, p));   // plus the docking gap that the SNAREs close
  const th50 = PI - Math.asin((D + 1.6 + RHO0) / (R + RHO0));
  let theta, rho = RHO0;
  if (p <= PH.DILATE) theta = PI - Math.asin(Math.max(0, n + RHO0) / (R + RHO0));
  else {
    const t = (p - PH.DILATE) / (1 - PH.DILATE);
    theta = Math.max(1e-3, th50 * (1 - sstep(0, 1, Math.pow(t, 0.8))));
    const g = Math.min(1, (th50 - theta) / (th50 - PI / 2));
    rho = RHO0 + Math.min(4.5, R * 0.22) * sstep(0, 1, g);
  }
  // Past the omega stage the cap keeps its area and spreads, so its radius of curvature grows.
  const Rc = theta >= PI / 2 ? R : R / Math.sqrt(1 - Math.cos(theta));
  const c = (Rc + rho) * Math.sin(theta), h = rho - (Rc + rho) * Math.cos(theta);
  return { p, R, theta, rho, Rc, c, h, extra, approach, approachBase, tethered: u <= CAPTURE, neck: c - rho };
}

function poly() { return { r: [], y: [], nr: [], ny: [], a: [0] }; }
function push(P, r, y, nr, ny) {
  const k = P.r.length;
  if (k) P.a.push(P.a[k - 1] + PI * (P.r[k - 1] + r) * Math.hypot(r - P.r[k - 1], y - P.y[k - 1]));
  P.r.push(r); P.y.push(y); P.nr.push(nr); P.ny.push(ny);
}
// Sample one leaflet (offset o from the midplane) as one or two polylines with cumulative area.
function leaflet(S, o) {
  const sg = o > 0 ? 1 : -1, Rs = S.Rc + o, rf = S.rho - o;
  const fused = S.c >= rf - 1e-9;
  const A = poly();
  const lift = fused ? 0 : S.extra;
  for (let i = 0; i <= NC; i++) {
    const al = S.theta * i / NC, s = Math.sin(al), co = Math.cos(al);
    push(A, Rs * s, S.h + lift + Rs * co, sg * s, sg * co);
  }
  const fil = (P, from, to, dy) => {
    for (let i = 1; i <= NF; i++) {
      const ps = from + (to - from) * i / NF, s = Math.sin(ps), co = Math.cos(ps);
      push(P, Math.max(0, S.c - rf * s), S.rho + dy - rf * co, sg * s, sg * co);
    }
  };
  if (fused) { fil(A, S.theta, 0, 0); return { fused, o, sg, A, B: null }; }
  const q = Math.min(1, S.c / rf), psA = Math.asin(q), psB = PI - psA;
  if (psB < S.theta) fil(A, S.theta, psB, lift);
  const B = poly();
  push(B, 0, S.rho - rf * Math.cos(psA), sg * Math.sin(psA), sg * Math.cos(psA));
  if (psA > 1e-6) fil(B, psA, 0, 0);
  return { fused, o, sg, A, B };
}
// Point on a polyline at cumulative area a; past its end the membrane is flat.
function at(P, L, a, out, k, hint) {
  const n = P.r.length, end = P.a[n - 1];
  if (a > end) {       // strictly past it: the last sample of a free vesicle is its own pole, not the plane
    out[k] = Math.sqrt(P.r[n - 1] * P.r[n - 1] + (a - end) / PI); out[k + 1] = L.o; out[k + 2] = 0; out[k + 3] = L.sg;
    return n - 1;
  }
  let i = hint;
  while (i < n - 2 && P.a[i + 1] < a) i++;
  const w = P.a[i + 1] - P.a[i], t = w > 0 ? (a - P.a[i]) / w : 0;
  // Interpolate r^2 rather than r: exact on a cone, and it keeps the poles round.
  out[k] = Math.sqrt(P.r[i] * P.r[i] + (P.r[i + 1] * P.r[i + 1] - P.r[i] * P.r[i]) * t);
  out[k + 1] = P.y[i] + (P.y[i + 1] - P.y[i]) * t;
  out[k + 2] = P.nr[i] + (P.nr[i + 1] - P.nr[i]) * t;
  out[k + 3] = P.ny[i] + (P.ny[i + 1] - P.ny[i]) * t;
  return i;
}

// Full state for a given progress and vesicle radius, including the lookup table the GPU reads:
// four rows of (r, y, normal r, normal y), two per leaflet. Row A spans the vesicle's own area,
// row B the first BAREA of plasma membrane beyond it; further out the membrane is a plane.
export function compute(p, R, tab) {
  const S = shape(p, R);
  S.tab = tab || new Float32Array(TABW * 4 * 4);
  S.Av = [4 * PI * (R + D) * (R + D), 4 * PI * (R - D) * (R - D)];
  S.fused = [false, false]; S.rW = [0, 0];
  for (let leaf = 0; leaf < 2; leaf++) {
    const L = leaflet(S, leaf ? -D : D), Av = S.Av[leaf];
    S.fused[leaf] = L.fused;
    const A1 = L.A.a[L.A.a.length - 1];
    let o = leaf * 2 * TABW * 4, hint = 0;
    for (let i = 0; i < TABW; i++) hint = at(L.A, L, (L.fused ? Av : A1) * i / (TABW - 1), S.tab, o + i * 4, hint);
    o += TABW * 4; hint = 0;
    const PB = L.fused ? L.A : L.B, base = L.fused ? Av : 0;
    for (let i = 0; i < TABW; i++) hint = at(PB, L, base + BAREA * i / (TABW - 1), S.tab, o + i * 4, hint);
    S.rW[leaf] = S.tab[o + (TABW - 1) * 4];
  }
  return S;
}

// Same lookup the vertex shader does, for placing proteins. Writes position and normal into out[0..5].
export function surf(S, leaf, a, phi, out) {
  const Av = S.Av[leaf], cs = Math.cos(phi), sn = Math.sin(phi), T = S.tab;
  let r, y, nr, ny;
  const row = (rw, t) => {
    const i = Math.min(TABW - 2, Math.floor(t)), f = t - i, k = (rw * TABW + i) * 4;
    r = T[k] + (T[k + 4] - T[k]) * f; y = T[k + 1] + (T[k + 5] - T[k + 1]) * f;
    nr = T[k + 2] + (T[k + 6] - T[k + 2]) * f; ny = T[k + 3] + (T[k + 7] - T[k + 3]) * f;
  };
  if (a < Av) row(leaf * 2, Math.max(0, a) / Av * (TABW - 1));
  else if (a - Av < BAREA) row(leaf * 2 + 1, (a - Av) / BAREA * (TABW - 1));
  else { r = Math.sqrt(S.rW[leaf] * S.rW[leaf] + (a - Av - BAREA) / PI); y = leaf ? -D : D; nr = 0; ny = leaf ? -1 : 1; }
  const l = Math.hypot(nr, ny) || 1;
  out[0] = r * cs; out[1] = y; out[2] = r * sn; out[3] = nr / l * cs; out[4] = ny / l; out[5] = nr / l * sn;
  return out;
}

// Midplane profile as a fixed-length list of [r, y] points, for sketching a vesicle's outline
// cheaply. Every outline has the same number of points, so two can be joined into a band.
export function outline(p, R) {
  const S = shape(p, R), pts = [], lift = S.neck < -D ? S.extra : 0;
  for (let i = 0; i <= 26; i++) { const a = S.theta * i / 26; pts.push(S.Rc * Math.sin(a), S.h + lift + S.Rc * Math.cos(a)); }
  for (let i = 1; i <= 14; i++) {
    const ps = S.theta * (1 - i / 14), r = S.c - S.rho * Math.sin(ps);
    pts.push(Math.max(0, r), S.rho - S.rho * Math.cos(ps) + (ps > Math.PI / 2 ? lift : 0));
  }
  pts.push(Math.max(S.c, 0) + 0.5 * R, 0);
  return pts;
}
