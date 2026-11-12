// What the screen shows in the candle challenges. The candle is drawn at the size and place the
// traced light gives it (from where the light of its tip and of its foot lands), then every point
// of it is spread into the spot that the traced rays make. Nothing is blurred by a made-up amount.
// Only the brightness is adjusted: it is compressed, so a dim picture can still be seen.

const sharp = document.createElement('canvas'), scratch = document.createElement('canvas');

// `m` is the tally (hits as (height on the screen, weight, group) triples; groups 0 and 1 are the
// tip and the foot). `pic` gives the candle's half height, the screen's half height (both mm) and
// the share of the light the hole lets through.
export function drawPicture(g, x, y, w, h, dpr, m, pic) {
  const A = m.groups[0], B = m.groups[1], ok = A && B && A.w && B.w;
  const ca = ok ? A.u / A.w : 0, cb = ok ? B.u / B.w : 0, mag = (ca - cb) / (2 * pic.tip), mid = (ca + cb) / 2;
  // the spot, as rings of equal light about the middle of each point's light
  const rays = [];
  let tot = 0, r2 = 0;
  const full = Math.round(h * dpr) / (2 * pic.half);                  // device pixels per mm of screen
  if (ok) for (let i = 0; i < m.hits.length; i += 3) {
    const r = Math.abs(m.hits[i] - (m.hits[i + 2] ? cb : ca)) * full, wt = m.hits[i + 1];
    rays.push([r, wt]); tot += wt; r2 += wt * r * r;
  }
  rays.sort((p, q) => p[0] - q[0]);
  const f = Math.min(10, Math.max(1, Math.round(Math.sqrt(r2 / (tot || 1)) / 5)));   // a wide blur needs fewer pixels
  const W = Math.max(8, Math.round(w * dpr / f)), H = Math.max(8, Math.round(h * dpr / f)), S = full / f;
  const RINGS = 12, taps = [];
  let acc = 0, sum = 0, count = 0;
  for (const [r, wt] of rays) {
    acc += wt; sum += wt * r;
    if (acc >= tot / RINGS - 1e-12) {
      const rr = sum / acc / f, n = Math.min(24, Math.max(1, Math.round(2 * Math.PI * rr / 1.2)));
      for (let i = 0; i < n; i++) { const t = (i + (count % 2) / 2) / n * 2 * Math.PI; taps.push(Math.round(rr * Math.cos(t)), Math.round(rr * Math.sin(t)), 1 / n); }
      count++; acc = 0; sum = 0;
    }
  }
  // the sharp picture: wax lit by its own flame, and the flame
  if (sharp.width !== W || sharp.height !== H) { sharp.width = W; sharp.height = H; }
  const s = sharp.getContext('2d', { willReadFrequently: true });
  s.setTransform(1, 0, 0, 1, 0, 0); s.fillStyle = '#000'; s.fillRect(0, 0, W, H);
  if (ok && Math.abs(mag) * S < 0.7) {
    // too far off to have a shape at this scale: a dot, drawn just big enough to see
    s.fillStyle = 'rgb(255,214,140)'; s.beginPath(); s.arc(W / 2, H / 2 - mid * S, Math.max(1, 1.7 * dpr / f), 0, 7); s.fill();
  } else if (ok) {
    s.setTransform(mag * S, 0, 0, -mag * S, W / 2, H / 2 - mid * S);           // candle millimetres to pixels; a negative `mag` turns it over
    const T = pic.tip;
    s.fillStyle = 'rgb(120,104,80)'; s.fillRect(-2.6, -T, 5.2, T + 3.2);
    s.fillStyle = 'rgb(255,170,60)';
    s.beginPath(); s.moveTo(0, T); s.bezierCurveTo(1.2, T - 2.5, 2.3, T - 4.2, 2.3, T - 5.2); s.arc(0, T - 5.2, 2.3, 0, Math.PI, true); s.bezierCurveTo(-2.3, T - 4.2, -1.2, T - 2.5, 0, T); s.fill();
    s.fillStyle = 'rgb(255,244,200)';
    s.beginPath(); s.ellipse(0, T - 5, 1.1, 2, 0, 0, 7); s.fill();
  }
  const src = s.getImageData(0, 0, W, H).data, lin = new Float32Array(W * H * 3), out = new Float32Array(W * H * 3);
  for (let i = 0, j = 0; i < src.length; i += 4) { lin[j++] = (src[i] / 255) ** 2; lin[j++] = (src[i + 1] / 255) ** 2; lin[j++] = (src[i + 2] / 255) ** 2; }
  for (let k = 0; k < taps.length; k += 3) {
    const dx = taps[k], dy = taps[k + 1], wt = taps[k + 2] / count;
    const x0 = Math.max(0, -dx), x1 = Math.min(W, W - dx), y0 = Math.max(0, -dy), y1 = Math.min(H, H - dy);
    for (let yy = y0; yy < y1; yy++) { let o = (yy * W + x0) * 3, i = ((yy + dy) * W + x0 + dx) * 3; for (let n = (x1 - x0) * 3; n > 0; n--) out[o++] += wt * lin[i++]; }
  }
  if (scratch.width !== W || scratch.height !== H) { scratch.width = W; scratch.height = H; }
  const sc = scratch.getContext('2d'), img = sc.createImageData(W, H), d = img.data, gain = pic.light ** 0.6;
  for (let i = 0, j = 0; i < d.length; i += 4) {
    d[i] = 14 + 241 * Math.sqrt(Math.min(1, out[j++] * gain)); d[i + 1] = 17 + 238 * Math.sqrt(Math.min(1, out[j++] * gain)); d[i + 2] = 30 + 225 * Math.sqrt(Math.min(1, out[j++] * gain)); d[i + 3] = 255;
  }
  sc.putImageData(img, 0, 0);
  g.save();
  g.beginPath(); g.roundRect(x, y, w, h, 8); g.clip();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(scratch, x, y, w, h);
  g.restore();
}
