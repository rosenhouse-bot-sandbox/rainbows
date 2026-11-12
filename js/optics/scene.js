// A night scene as the sensor records it, for the inset: white stars, two of them close together,
// and a lit window. Every point of the scene is spread into the spot the traced rays make, so a
// soft lens gives soft stars and a lens that separates the wavelengths gives coloured fringes.
// Nothing is blurred by a made-up amount. Brightness is compressed so a faint smear still shows.
//
// A panel is one piece of sensor: `spots` lists, for each kind of light landing there, its colour
// and its `taps` (dx, dy, weight triples in device pixels, weights adding to 1).

const sharp = document.createElement('canvas'), scratch = document.createElement('canvas');

// Positions in thirty-seconds of the inset's height (so 3.2 is a tenth of it) from the top left; the last number is brightness.
const STARS = [[0.5, 0.45, 3], [1.5, 0.3, 1.5], [2.65, 0.55, 3], [0.9, 1.15, 2.5], [1.7, 1.15, 2.5], [0.45, 1.85, 1.5], [2.6, 1.3, 1.2]];
const NARROW = [[0.45, 0.4, 3], [1.15, 0.85, 2], [0.4, 1.45, 2.5], [1.2, 1.45, 2.5], [0.8, 2.1, 1.5]];

// Rings of equal light: `list` is (radius in pixels, weight) pairs for a round spot.
export function ringTaps(list, f) {
  const rays = list.slice().sort((p, q) => p[0] - q[0]), RINGS = 12, taps = [];
  let tot = 0; for (const r of rays) tot += r[1];
  let acc = 0, sum = 0, count = 0;
  for (const [r, wt] of rays) {
    acc += wt; sum += wt * r;
    if (acc >= tot / RINGS - 1e-12 && acc > 0) {
      const rr = sum / acc / f, n = Math.min(24, Math.max(1, Math.round(2 * Math.PI * rr / 1.2)));
      for (let i = 0; i < n; i++) { const t = (i + (count % 2) / 2) / n * 2 * Math.PI; taps.push(Math.round(rr * Math.cos(t)), Math.round(rr * Math.sin(t)), 1 / n); }
      count++; acc = 0; sum = 0;
    }
  }
  for (let i = 2; i < taps.length; i += 3) taps[i] /= count;
  return taps;
}
// An up-and-down smear: `list` is (height in pixels, weight) pairs.
export function sliceTaps(list, f) {
  let tot = 0; for (const r of list) tot += r[1];
  return list.flatMap(([dy, wt]) => [0, Math.round(-dy / f), wt / tot]);
}

// Draw into the box (x, y, w, h: CSS pixels). `f` is the factor to work at reduced size (a wide
// blur has no detail to keep).
export function drawScene(g, x, y, w, h, dpr, f, spots, narrow) {
  const W = Math.max(4, Math.round(w * dpr / f)), H = Math.max(4, Math.round(h * dpr / f)), u = H / 3.2;
  if (sharp.width !== W || sharp.height !== H) { sharp.width = W; sharp.height = H; }
  const s = sharp.getContext('2d', { willReadFrequently: true });
  s.fillStyle = '#000'; s.fillRect(0, 0, W, H);
  const lum = new Float32Array(W * H);
  if (!narrow) {                                   // the window: four lit panes
    s.fillStyle = '#fff';
    for (const [px, py] of [[1.78, 1.85], [2.36, 1.85], [1.78, 2.36], [2.36, 2.36]]) s.fillRect(px * u, py * u, 0.44 * u, 0.4 * u);
    const d = s.getImageData(0, 0, W, H).data;
    for (let i = 0; i < lum.length; i++) lum[i] = d[i * 4] / 255 * 0.75;
    s.fillStyle = '#000'; s.fillRect(0, 0, W, H);
  }
  for (const [px, py, b] of narrow ? NARROW : STARS) {
    s.fillStyle = '#fff'; s.beginPath(); s.arc(px * u, py * u, Math.max(0.9, 0.03 * u), 0, 7); s.fill();
    const r = Math.ceil(0.03 * u) + 2, x0 = Math.max(0, Math.floor(px * u) - r), y0 = Math.max(0, Math.floor(py * u) - r), ww = Math.min(W - x0, 2 * r + 1), hh = Math.min(H - y0, 2 * r + 1);
    if (ww < 1 || hh < 1) continue;
    const d = s.getImageData(x0, y0, ww, hh).data;
    for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) lum[(y0 + j) * W + x0 + i] += d[(j * ww + i) * 4] / 255 * b;
    s.fillStyle = '#000'; s.fillRect(x0, y0, ww, hh);
  }
  const out = new Float32Array(W * H * 3), one = new Float32Array(W * H);
  for (const { rgb, taps } of spots) {
    one.fill(0);
    for (let k = 0; k < taps.length; k += 3) {
      const dx = taps[k], dy = taps[k + 1], wt = taps[k + 2];
      const x0 = Math.max(0, -dx), x1 = Math.min(W, W - dx), y0 = Math.max(0, -dy), y1 = Math.min(H, H - dy);
      for (let yy = y0; yy < y1; yy++) { let o = yy * W + x0, i = (yy + dy) * W + x0 + dx; for (let n = x1 - x0; n > 0; n--) one[o++] += wt * lum[i++]; }
    }
    for (let i = 0, j = 0; i < one.length; i++) { out[j++] += one[i] * rgb[0]; out[j++] += one[i] * rgb[1]; out[j++] += one[i] * rgb[2]; }
  }
  if (scratch.width !== W || scratch.height !== H) { scratch.width = W; scratch.height = H; }
  const sc = scratch.getContext('2d'), img = sc.createImageData(W, H), d = img.data;
  for (let i = 0, j = 0; i < d.length; i += 4) {
    d[i] = 7 + 248 * Math.sqrt(Math.min(1, out[j++])); d[i + 1] = 11 + 244 * Math.sqrt(Math.min(1, out[j++])); d[i + 2] = 24 + 231 * Math.sqrt(Math.min(1, out[j++])); d[i + 3] = 255;
  }
  sc.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(scratch, x, y, w, h);
}
