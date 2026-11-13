// The season, a leaf's pigments, and the colour those pigments give. Everything the page draws or
// prints comes from here. No DOM, so Node can test it (tests/maple/model.mjs).
//
// What is real and what is illustrative:
//  - Day length is the standard formula for the latitude below.
//  - The dates are typical for a Japanese maple in Kyoto. One tree in one year differs by weeks.
//  - Pigment amounts are smooth curves with the right order of events and roughly the right
//    durations, as fractions of the leaf's own summer (or peak) amount. They are not measurements.
//  - Absorption bands are a few Gaussians each, placed on the bands measured in leaves.
//  - Colour is computed: light that comes back = exp(-absorbance), weighted by the eye's colour
//    matching functions (the CIE 1931 observer, in the fit of Wyman, Sloan and Shirley, 2013).

export const LAT = 35;                    // degrees north (Kyoto)
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const mix = (a, b, t) => a + (b - a) * t;

// The Season slider runs 0..1. Summer, when little changes, is given less of it than autumn.
const KNOTS = [[0, 84], [0.2, 125], [0.35, 293], [0.78, 334], [1, 354]];   // slider value, day of the year
export const DAY_START = KNOTS[0][1], DAY_END = KNOTS[KNOTS.length - 1][1];
export function dayOf(s) {
  s = clamp(s);
  for (let i = 1; i < KNOTS.length; i++) if (s <= KNOTS[i][0]) return mix(KNOTS[i - 1][1], KNOTS[i][1], (s - KNOTS[i - 1][0]) / (KNOTS[i][0] - KNOTS[i - 1][0]));
  return DAY_END;
}
export function seasonOf(day) {
  for (let i = 1; i < KNOTS.length; i++) if (day <= KNOTS[i][1]) return mix(KNOTS[i - 1][0], KNOTS[i][0], (day - KNOTS[i - 1][1]) / (KNOTS[i][1] - KNOTS[i - 1][1]));
  return 1;
}
const MONTHS = [['January', 31], ['February', 28], ['March', 31], ['April', 30], ['May', 31], ['June', 30], ['July', 31], ['August', 31], ['September', 30], ['October', 31], ['November', 30], ['December', 31]];
export function dateOf(day) {             // day 1 = 1 January, not a leap year
  let d = Math.max(1, Math.min(365, Math.floor(day)));
  for (const [name, n] of MONTHS) { if (d <= n) return { d, month: name, text: d + ' ' + name }; d -= n; }
  return { d: 31, month: 'December', text: '31 December' };
}
// Hours between sunrise and sunset, by geometry alone (no bending of light by the air).
export function dayLength(day, lat = LAT) {
  const decl = -23.44 * Math.cos(2 * Math.PI * (day + 10) / 365) * Math.PI / 180;
  const c = clamp(-Math.tan(lat * Math.PI / 180) * Math.tan(decl), -1, 1);
  return 2 * Math.acos(c) * 12 / Math.PI;
}

// The tree's year in five parts, by slider value. Used for the ticks and the captions.
export const PHASES = [
  { id: 'spring', name: 'Spring', at: 0 },
  { id: 'summer', name: 'Summer', at: 0.2 },
  { id: 'turning', name: 'Turning', at: seasonOf(301) },
  { id: 'red', name: 'Red', at: seasonOf(321) },
  { id: 'fall', name: 'Leaf fall', at: 0.78 },
];
export const phaseAt = (s) => { let k = 0; for (let i = 0; i < PHASES.length; i++) if (s >= PHASES[i].at - 1e-9) k = i; return k; };

// One leaf's timetable. `sun` is 0 for a leaf deep in the crown, 1 for one in full sun.
// `r1`, `r2` are that leaf's own random numbers in 0..1.
export const FOCUS = { bud: 86, d0: 303, sun: 1, drop: 351.5, land: 354 };
export function timetable(sun, r1, r2) {
  const d0 = 313 - 13 * sun + (r1 - 0.5) * 6;                 // the day it stops renewing chlorophyll
  const drop = Math.min(350.4, d0 + 22 + r2 * 16);            // the day it falls
  return { bud: 85 + r1 * 11, d0, sun: 0.12 + 0.88 * sun, drop, land: drop + FALL_DAYS };
}
export const FALL_DAYS = 2.5;             // a fall is spread over this much of the slider so that it can be seen

export function pigments(day, L) {
  const grow = smooth((day - L.bud) / 26);                    // leaf blade, from folded in the bud to full size
  const green = smooth((day - L.bud - 3) / 42);               // chlorophyll is still being made after the blade is full size
  const sen = day - L.d0;
  const chl = (0.3 + 0.7 * green) * (1 - smooth(sen / 23));
  const car = (0.42 + 0.58 * green) * (1 - 0.45 * smooth((sen - 5) / 34));   // carotenoids go too, but later and not all
  const anth = L.sun * smooth((sen - 1) / 20);
  const absc = smooth((day - (L.drop - 22)) / 22);            // how far the separation layer has cut across the stalk
  return { size: 0.07 + 0.93 * grow, chl, car, anth, absc, fall: clamp((day - L.drop) / (L.land - L.drop)) };
}

// ---- light ---------------------------------------------------------------------------------
export const NM0 = 400, NM1 = 700, NSTEP = 5, NS = (NM1 - NM0) / NSTEP + 1;
export const nm = (i) => NM0 + i * NSTEP;
const g = (l, mu, s) => Math.exp(-0.5 * ((l - mu) / s) ** 2);
const g2 = (l, mu, s1, s2) => g(l, mu, l < mu ? s1 : s2);
// Absorbance of each pigment at its full amount, as the page draws it. Peaks as measured in leaves:
// chlorophyll a and b together near 440 and 675 nm; carotenoids 425 to 480 nm; cyanidin 3-glucoside
// in the vacuole near 530 nm.
export const BANDS = {
  chl: (l) => 2.6 * g(l, 438, 20) + 1.5 * g(l, 468, 14) + 1.0 * g(l, 622, 27) + 0.9 * g(l, 650, 11) + 2.6 * g(l, 677, 14) + 0.5,
  car: (l) => 1.5 * g(l, 426, 13) + 1.9 * g(l, 452, 13) + 1.7 * g(l, 482, 12) + 0.25 * g2(l, 400, 10, 60),
  anth: (l) => 2.8 * g2(l, 532, 36, 30) + 0.5 * g2(l, 440, 40, 30),
};
export const PIG = ['chl', 'car', 'anth'];
const TAB = {};
for (const k of PIG) { TAB[k] = new Float64Array(NS); for (let i = 0; i < NS; i++) TAB[k][i] = BANDS[k](nm(i)); }
export const bandTable = (k) => TAB[k];
// CIE 1931 colour matching functions (Wyman, Sloan and Shirley 2013, the multi-lobe fit)
const CX = new Float64Array(NS), CY = new Float64Array(NS), CZ = new Float64Array(NS);
let sumY = 0;
for (let i = 0; i < NS; i++) {
  const l = nm(i);
  CX[i] = 1.056 * g2(l, 599.8, 37.9, 31.0) + 0.362 * g2(l, 442.0, 16.0, 26.7) - 0.065 * g2(l, 501.1, 20.4, 26.2);
  CY[i] = 0.821 * g2(l, 568.8, 46.9, 40.5) + 0.286 * g2(l, 530.9, 16.3, 31.1);
  CZ[i] = 1.217 * g2(l, 437.0, 11.8, 36.0) + 0.681 * g2(l, 459.0, 26.0, 13.8);
  sumY += CY[i];
}
// Cell walls and other colourless-looking material absorb a little, more toward short wavelengths.
const TISSUE = new Float64Array(NS); for (let i = 0; i < NS; i++) TISSUE[i] = 0.45 * Math.exp(-(nm(i) - 400) / 70);
const TOP = 0.6;
// Fraction of the light at each wavelength that comes back from a leaf (or a part of one) holding
// these amounts. `skin` is light reflected at the surface before it meets any pigment.
export function returned(p, out = new Float64Array(NS), depth = 1, skin = 0.035) {
  const a = TAB.chl, b = TAB.car, c = TAB.anth, k1 = p.chl * depth * 1.25, k2 = p.car * depth * 1.5, k3 = p.anth * depth * 2.5;
  for (let i = 0; i < NS; i++) out[i] = skin + (TOP - skin) * Math.exp(-(k1 * a[i] + k2 * b[i] + k3 * c[i] + TISSUE[i]));
  return out;
}
const enc = (v) => { v = clamp(v); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; };
// sRGB (0..1 each) of light with this spectrum, the illuminant taken as equal at every wavelength.
export function rgbOf(spec, gain = 1) {
  let X = 0, Y = 0, Z = 0;
  for (let i = 0; i < NS; i++) { X += spec[i] * CX[i]; Y += spec[i] * CY[i]; Z += spec[i] * CZ[i]; }
  X *= gain / sumY; Y *= gain / sumY; Z *= gain / sumY;
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  const lo = Math.min(r, gg, b);                 // outside what a screen can show: move toward grey of the same brightness
  if (lo < 0) { const t = Y / (Y - lo); r = Y + (r - Y) * t; gg = Y + (gg - Y) * t; b = Y + (b - Y) * t; }
  const hi = Math.max(r, gg, b); if (hi > 1) { r /= hi; gg /= hi; b /= hi; }
  return [enc(r), enc(gg), enc(b)];
}
const tmp = new Float64Array(NS);
export const GAIN = 1.75;                  // the leaf is drawn lit from behind, brighter than its surroundings
export function leafRGB(p, depth = 1, gain = GAIN) { return rgbOf(returned(p, tmp, depth), gain); }
export const css = (c, k = 1, a = 1) => `rgba(${Math.round(255 * clamp(c[0] * k))},${Math.round(255 * clamp(c[1] * k))},${Math.round(255 * clamp(c[2] * k))},${a})`;

// The colour of light of a single wavelength, as nearly as a screen can show it.
export function wavelengthRGB(l) {
  const X = 1.056 * g2(l, 599.8, 37.9, 31.0) + 0.362 * g2(l, 442.0, 16.0, 26.7) - 0.065 * g2(l, 501.1, 20.4, 26.2);
  const Y = 0.821 * g2(l, 568.8, 46.9, 40.5) + 0.286 * g2(l, 530.9, 16.3, 31.1);
  const Z = 1.217 * g2(l, 437.0, 11.8, 36.0) + 0.681 * g2(l, 459.0, 26.0, 13.8);
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  const lo = Math.min(r, gg, b); if (lo < 0) { r -= lo; gg -= lo; b -= lo; }
  const k = 0.62;
  return [r * k, gg * k, b * k];                 // linear; the caller scales and encodes
}
export const encode = enc;

// What a person would call this colour. From the computed colour's hue, not from the season.
export function colourName(c) {
  const mx = Math.max(...c), mn = Math.min(...c), d = mx - mn;
  if (d < 0.08) return mx > 0.6 ? 'pale' : 'grey-brown';
  let h = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 14 || h >= 335) return 'red';
  if (h < 27) return 'orange-red';
  if (h < 42) return 'orange';
  if (h < 58) return 'yellow';
  if (h < 76) return 'yellow-green';
  if (h < 170) return 'green';
  return h < 260 ? 'blue-green' : 'purple-red';
}
// The wavelength that comes back most strongly, and where the middle of what comes back lies.
export function peakReturned(spec) { let k = 0; for (let i = 1; i < NS; i++) if (spec[i] > spec[k]) k = i; return nm(k); }
