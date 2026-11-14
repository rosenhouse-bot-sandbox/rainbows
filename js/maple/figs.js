// The two small pictures in the panel: the light that comes back from the leaf, by wavelength, and
// the foot of the leaf stalk cut lengthwise. Both are drawn from the same model as the main picture.
import { returned, bandTable, wavelengthRGB, encode, NS, nm, NM0, NM1, PIG, css, clamp, smooth, mix, leafRGB, colourName, rgbOf } from './model.js?v=a18ea26b';

const spec = new Float64Array(NS);
// Size the canvas for the screen's pixels and return a context that draws in CSS pixels.
function prep(cv, H) {
  const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(cv.clientWidth || cv.parentElement.clientWidth || 336);
  if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  return { ctx, W, H };
}
const at = (tab, l) => { const f = clamp((l - NM0) / (NM1 - NM0)) * (NS - 1), i = Math.min(NS - 2, Math.floor(f)); return mix(tab[i], tab[i + 1], f - i); };

// Returns the words for the caption: where the light comes back, and what colour that looks.
export function drawSpectrum(cv, p, ink) {
  const { ctx, W, H } = prep(cv, 100), strip = Math.round(H * 0.24), top = strip + 8;
  returned(p, spec);
  for (let x = 0; x < W; x++) {                            // top: each wavelength, as bright as the share of it that comes back
    const l = NM0 + (NM1 - NM0) * x / (W - 1), c = wavelengthRGB(l), r = at(spec, l) / 0.6;
    ctx.fillStyle = css([encode(c[0] * r * 1.5), encode(c[1] * r * 1.5), encode(c[2] * r * 1.5)]);
    ctx.fillRect(x, 0, 1, strip);
  }
  ctx.fillStyle = 'rgba(234,240,255,.05)'; ctx.fillRect(0, top, W, H - top);
  const amt = { chl: p.chl, car: p.car, anth: p.anth }, hgt = H - top - 2;
  for (const k of ['anth', 'car', 'chl']) {               // below: how strongly each pigment absorbs, for the amount present now
    const tab = bandTable(k);
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) ctx.lineTo(x, H - 1 - Math.min(1, at(tab, NM0 + (NM1 - NM0) * x / W) * amt[k] / 3.4) * hgt);
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = css(ink[k], 1, 0.2); ctx.fill();
    ctx.strokeStyle = css(ink[k]); ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  }
  // the band of wavelengths that comes back at more than half the strongest
  let mx = 0; for (let i = 0; i < NS; i++) mx = Math.max(mx, spec[i]);
  let a = -1, b = -1, best = [0, 0];
  for (let i = 0; i <= NS; i++) {
    const on = i < NS && spec[i] >= 0.5 * mx;
    if (on && a < 0) a = i;
    if (!on && a >= 0) { b = i - 1; if (b - a >= best[1] - best[0]) best = [a, b]; a = -1; }
  }
  const lo = Math.round(nm(best[0]) / 10) * 10, hi = Math.round(nm(best[1]) / 10) * 10, name = colourName(leafRGB(p));
  const where = hi >= NM1 ? (lo <= NM0 ? 'at every wavelength we can see' : `at wavelengths longer than ${lo} nm`) : lo <= NM0 ? `at wavelengths shorter than ${hi} nm` : `between ${lo} and ${hi} nm`;
  return `Top: the share of each wavelength that comes back from the leaf. Most comes back ${where}. To the eye that mix is ${name}.`;
}

// The foot of the stalk. absc: how far the separation layer has cut through (0..1). gone: how far the leaf has fallen away.
export function drawStalk(cv, absc, gone, stalkCol) {
  const { ctx, W, H } = prep(cv, 132), c = 12, rows = Math.floor(H / c), mid = (rows - 1) / 2;
  const twigCols = 7, zone = twigCols + 5, cols = Math.floor(W / c), half = 3.4;
  const cell = (x, y, w, h, col, r = 3) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6, r); ctx.fill(); };
  const cork = smooth(absc / 0.55), cut = smooth((absc - 0.3) / 0.7), away = gone * 60;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const d = Math.abs(j - mid), inStalk = d <= half, vein = d < 0.8;
    if (i < twigCols) {                                    // the twig, running up the picture
      const bark = i === 0 || (i === twigCols - 1 && !inStalk);
      cell(i * c, j * c, c, c, i === 3 ? '#b9c48f' : bark ? '#5b4038' : '#7d8a5c'); continue;
    }
    if (!inStalk) continue;
    let x = i * c, col = vein ? '#c3cc98' : css(stalkCol, 0.82);
    if (i < zone - 1) { cell(x, j * c, c, c, vein ? '#b9c48f' : '#8a9662'); continue; }
    if (i === zone - 1) {                                  // the protective layer: its walls fill with cork
      const k = vein ? smooth((absc - 0.6) / 0.4) : cork;
      cell(x, j * c, c, c, css([mix(0.54, 0.55, k), mix(0.59, 0.36, k), mix(0.38, 0.2, k)])); continue;
    }
    if (i === zone) {                                      // the separation layer: small cells whose walls dissolve, from the outside in
      const open = vein ? smooth((absc - 0.9) / 0.1) : smooth((cut - (1 - d / half) * 0.75) / 0.25);
      for (const dy of [0, c / 2]) for (const dx of [0, c / 2]) cell(x + dx + (dx ? open * 2 + away : -open * 1.5), j * c + dy + (dx ? away * 0.5 : 0), c / 2, c / 2, css([0.86, 0.84, 0.6], 1, dx ? 1 - gone : 1), 1.5);
      continue;
    }
    ctx.globalAlpha = 1 - gone;
    const gap = (vein ? smooth((absc - 0.9) / 0.1) : cut) * 2;
    cell(x + gap + away, j * c + away * 0.5, i > zone + 6 && vein ? c : c, c, col);
    ctx.globalAlpha = 1;
  }
}

// ---- why a pigment has its colour: the longer the row of alternating double bonds, the longer the wavelength it takes in ----
// Five real molecules of the carotenoid family, which the plant makes one from the next by adding double bonds
// to the row. `peak` is the wavelength each absorbs most strongly, as measured in solution (to the nearest few nm).
export const CHAIN = [
  { n: 3, name: 'phytoene', peak: 286 }, { n: 5, name: 'phytofluene', peak: 348 }, { n: 7, name: 'ζ-carotene', peak: 400 },
  { n: 9, name: 'neurosporene', peak: 440 }, { n: 11, name: 'lycopene', peak: 472 }];
const bell = (l, m, w) => Math.exp(-0.5 * ((l - m) / w) ** 2);
// Three peaks side by side, as carotenoids have; the same shape as the leaf's own carotenoid band, moved to `peak`.
const chainBand = (l, peak) => 1.5 * bell(l, peak - 26, 13) + 1.9 * bell(l, peak, 13) + 1.7 * bell(l, peak + 30, 12);
const lin = (v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const flat = rgbOf(new Float64Array(NS).fill(1)), UV0 = 250;
export function chainColour(peak) {                         // white light after passing through a layer of the pigment
  for (let i = 0; i < NS; i++) spec[i] = Math.exp(-2.2 * chainBand(nm(i), peak));
  return rgbOf(spec).map((v, i) => encode(clamp(lin(v) / lin(flat[i]))));
}
export function drawChain(cv, n) {
  const m = CHAIN.find((c) => c.n === n) || CHAIN[CHAIN.length - 1], { ctx, W, H } = prep(cv, 96), col = chainColour(m.peak);
  const plain = Math.max(...col) - Math.min(...col) < 0.08;
  // the backbone: 29 bonds in a zigzag; the middle 2n - 1 of them are the row of alternating double and single bonds
  const B = 29, run = 2 * m.n - 1, first = (B - run) / 2, dx = (W - 56) / B, y0 = 22, amp = 7;
  const pt = (i) => [6 + i * dx, y0 + (i % 2 ? -amp : amp)];
  ctx.lineCap = 'round';
  for (let i = 0; i < B; i++) {
    const a = pt(i), b = pt(i + 1), inRun = i >= first && i < first + run, dbl = inRun && (i - first) % 2 === 0;
    ctx.strokeStyle = inRun ? (plain ? 'rgba(234,240,255,.95)' : css(col)) : 'rgba(234,240,255,.32)'; ctx.lineWidth = inRun ? 2 : 1.3;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    if (dbl) { const ox = (b[1] - a[1]), oy = -(b[0] - a[0]), l = Math.hypot(ox, oy), k = 3.4 / l; ctx.beginPath(); ctx.moveTo(a[0] + ox * k, a[1] + oy * k); ctx.lineTo(b[0] + ox * k, b[1] + oy * k); ctx.stroke(); }
  }
  // what light, passed through it, looks like
  ctx.fillStyle = css(col); ctx.beginPath(); ctx.roundRect(W - 38, 6, 34, 34, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(234,240,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
  // below: wavelengths from 250 to 700 nm; those we cannot see are drawn in grey
  const top = 50, sh = H - top, xOf = (l) => (l - UV0) / (NM1 - UV0) * W;
  for (let x = 0; x < W; x++) {
    const l = UV0 + (NM1 - UV0) * x / (W - 1), pass = Math.exp(-2.2 * chainBand(l, m.peak));
    if (l < NM0) { const v = Math.round(18 + 52 * pass); ctx.fillStyle = `rgb(${v},${v},${v + 6})`; }
    else { const c = wavelengthRGB(l); ctx.fillStyle = css([encode(c[0] * pass * 1.5), encode(c[1] * pass * 1.5), encode(c[2] * pass * 1.5)]); }
    ctx.fillRect(x, top, 1, sh);
  }
  ctx.strokeStyle = 'rgba(234,240,255,.9)'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.beginPath();
  for (let x = 0; x <= W; x += 2) { const l = UV0 + (NM1 - UV0) * x / W, y = H - 2 - chainBand(l, m.peak) / 2.1 * (sh - 6); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(234,240,255,.5)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(xOf(NM0), top); ctx.lineTo(xOf(NM0), H); ctx.stroke(); ctx.setLineDash([]);
  const seen = m.peak < NM0 ? 'ultraviolet, which we cannot see' : 'light we see as ' + (m.peak < 450 ? 'violet' : 'blue');
  const looks = plain ? 'All the light we can see passes, so it has no colour.' : `White light that has passed through it looks ${colourName(col)}.`;
  return { n: `${m.n} · ${m.name}`, cap: `With ${m.n} double bonds in a row the electrons shared along the row take in light most strongly near ${m.peak} nm: ${seen}. ${looks} A longer row takes in a longer wavelength. Double bonds outside the row are not drawn.` };
}
