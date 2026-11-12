// An eye chart as the eye in the picture sees it. The chart is laid out at its true size on the
// retina (a 20/20 letter is five minutes of arc tall), then every point of it is spread into the
// spot that the traced rays make there. Nothing is blurred by a made-up amount.

const ROWS = [[200, 'E'], [100, 'FP'], [50, 'TOZ'], [30, 'LPED'], [20, 'PECFD']];
const TALL = 1.42;                        // the chart's height over its width
export const CHART_ASPECT = TALL;

let mask = null;                          // the sharp chart: 1 where there is ink
function sharp(W, H, upp, umPerArcmin) {
  if (mask && mask.W === W && mask.H === H && mask.upp === upp) return mask;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  const top = 5 * 10 * umPerArcmin;       // the 20/200 letter, in µm
  let y = 0.12 * top;
  for (const [line, letters] of ROWS) {
    const h = 5 * line / 20 * umPerArcmin / upp;                     // letter height in pixels
    x.font = `700 ${(h / 0.716).toFixed(2)}px Arial, Helvetica, sans-serif`;
    y += h * upp;
    [...letters].forEach((ch, i) => x.fillText(ch, W / 2 + (i - (letters.length - 1) / 2) * 1.9 * h, y / upp));
    y += 0.45 * h * upp + 0.05 * top;
  }
  const d = x.getImageData(0, 0, W, H).data, a = new Float32Array(W * H);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255;
  return (mask = { W, H, upp, a, small: new Map() });
}

// The sharp chart averaged down by a whole factor f: a wide blur has no fine detail to keep.
function shrunk(m, f) {
  if (f === 1) return { w: m.W, h: m.H, a: m.a };
  if (m.small.has(f)) return m.small.get(f);
  const w = Math.ceil(m.W / f), h = Math.ceil(m.H / f), a = new Float32Array(w * h), n = new Float32Array(w * h);
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) { const j = (y / f | 0) * w + (x / f | 0); a[j] += m.a[y * m.W + x]; n[j]++; }
  for (let j = 0; j < a.length; j++) a[j] /= n[j];
  const out = { w, h, a }; m.small.set(f, out); return out;
}

const scratch = document.createElement('canvas');

// Draw the chart into the box (x, y, w, h: CSS pixels) of context g. `hits` is the tally's list of
// (distance from the centre of the spot in mm, weight) pairs for the rays that reached the retina.
export function drawChart(g, x, y, w, h, dpr, hits, umPerArcmin) {
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  const upp = 5 * 10 * umPerArcmin * 2.3 / W;                        // µm of retina per pixel
  const m = sharp(W, H, upp, umPerArcmin);
  // the spot as rings of equal light
  const rays = [];
  let tot = 0;
  for (let i = 0; i < hits.length; i += 2) { rays.push([Math.abs(hits[i]) * 1000 / upp, hits[i + 1]]); tot += hits[i + 1]; }
  rays.sort((p, q) => p[0] - q[0]);
  const RINGS = 12, rings = [];
  let acc = 0, sum = 0, cut = tot / RINGS, r2 = 0;
  for (const [r, wt] of rays) {
    acc += wt; sum += wt * r; r2 += wt * r * r;
    if (acc >= cut - 1e-12) { rings.push(sum / acc); acc = 0; sum = 0; }
  }
  const f = Math.min(8, Math.max(1, Math.round(Math.sqrt(r2 / (tot || 1)) / 4)));
  const s = shrunk(m, f), out = new Float32Array(s.w * s.h);
  let count = 0;
  const taps = [];
  rings.forEach((r, j) => {
    const rr = r / f, n = Math.min(20, Math.max(1, Math.round(2 * Math.PI * rr / 1.2)));
    for (let i = 0; i < n; i++) { const t = (i + (j % 2) / 2) / n * 2 * Math.PI; taps.push(Math.round(rr * Math.cos(t)), Math.round(rr * Math.sin(t)), 1 / n); }
    count++;
  });
  for (let k = 0; k < taps.length; k += 3) {
    const dx = taps[k], dy = taps[k + 1], wt = taps[k + 2] / count;
    const x0 = Math.max(0, -dx), x1 = Math.min(s.w, s.w - dx), y0 = Math.max(0, -dy), y1 = Math.min(s.h, s.h - dy);
    for (let yy = y0; yy < y1; yy++) { let o = yy * s.w + x0, i = (yy + dy) * s.w + x0 + dx; for (let xx = x0; xx < x1; xx++) out[o++] += wt * s.a[i++]; }
  }
  if (scratch.width !== s.w || scratch.height !== s.h) { scratch.width = s.w; scratch.height = s.h; }
  const sc = scratch.getContext('2d'), img = sc.createImageData(s.w, s.h), d = img.data;
  for (let i = 0; i < out.length; i++) {
    const ink = count ? Math.min(1, out[i]) : 0.5;                   // no light reaches the retina: plain grey
    d[i * 4] = 244 - 226 * ink; d[i * 4 + 1] = 241 - 223 * ink; d[i * 4 + 2] = 232 - 212 * ink; d[i * 4 + 3] = 255;
  }
  sc.putImageData(img, 0, 0);
  g.save();
  g.beginPath(); g.roundRect(x, y, w, h, 8); g.clip();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(scratch, x, y, w, h);
  g.restore();
}
