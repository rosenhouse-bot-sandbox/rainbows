// The two small pictures in the panel: the light that comes back from the leaf, by wavelength, and
// the foot of the leaf stalk cut lengthwise. Both are drawn from the same model as the main picture.
import { returned, bandTable, wavelengthRGB, encode, NS, nm, NM0, NM1, PIG, css, clamp, smooth, mix, leafRGB, colourName } from './model.js';

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
