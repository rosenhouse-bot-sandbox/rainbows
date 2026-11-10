// Drawing for the inference view: the recorded video, the forecast fan, and the belief strips.
// Uncertainty is shown three ways: as density (darker where a value is more believable), as
// intervals (the bracket under each strip holds 90% of the belief), and as ensembles (every dot,
// band edge is a quantile of guesses that are still consistent with the evidence).
// Everything drawn is eased toward the sampler's running summary, so the charts glide when the
// evidence changes and hold still when it does not.
import { PARAMS, NP, ROI, T_TOTAL, WALKERS, KEEP, toValue, quantiles, bitsLearned } from './infer.js';

const GOLD = [255, 207, 107], INK = '#EAF0FF', INK3 = '#7C88B0', FORE = [120, 190, 255];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const LN = Math.log;

function fit(cv) {
  const d = Math.min(2, window.devicePixelRatio || 1), w = Math.round(cv.clientWidth * d), h = Math.round(cv.clientHeight * d);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
  return [c, cv.clientWidth, cv.clientHeight];
}
const EASE = 0.16;                           // fraction of the gap closed per redraw
const fmt = (i, v) => (PARAMS[i].digits ? v.toFixed(PARAMS[i].digits) : String(Math.round(v)));

export class Dashboard {
  constructor(el) {
    this.el = el; this.col = new Float32Array(WALKERS * KEEP); this.col2 = new Float32Array(WALKERS * KEEP);
    this.tile = new Float32Array(ROI * ROI);
    this.octx = el.obs.getContext('2d'); this.ectx = el.exp.getContext('2d');
    this.oimg = this.octx.createImageData(ROI, ROI); this.eimg = this.ectx.createImageData(ROI, ROI);
    this.summary = PARAMS.map(() => ({ q: [0, 0, 0], bits: 0 }));
  }

  // Photon counts to the same green scale as the microscope camera.
  paint(ctx, img, data, off, white) {
    const d = img.data;
    for (let i = 0; i < ROI * ROI; i++) {
      const t = Math.pow(Math.min(1, data[off + i] / white), 0.7);
      d[i * 4] = 255 * Math.pow(t, 2.6) * 0.85; d[i * 4 + 1] = 255 * Math.min(1, t * 1.08); d[i * 4 + 2] = 255 * Math.pow(t, 1.9) * 0.55; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  draw(exp, sam, t, showTruth) {
    const nf = exp.nf, dt = exp.set.dt, upto = sam.upto, f = Math.max(0, Math.min(nf - 1, upto - 1));
    const o = new Float64Array(3);
    // Brightest pixel the truth ever produces sets the display scale.
    if (this.scaleFor !== exp) {
      let m = 1; for (let k = 0; k < nf; k++) { exp.frame(exp.truth, k, o); m = Math.max(m, o[0] / (2 * Math.PI * o[1]) + exp.bg * dt); }
      this.white = m * 1.5; this.scaleFor = exp; this.snap = true;      // new experiment: jump, do not glide
    }
    // Tiles: what the camera recorded at this moment, and what the current beliefs expect.
    if (upto > 0) this.paint(this.octx, this.oimg, exp.img, f * ROI * ROI, this.white);
    else { this.octx.fillStyle = '#000'; this.octx.fillRect(0, 0, ROI, ROI); }
    this.tile.fill(0);
    for (const w of sam.x) exp.expected(w, f, this.tile);
    const k = this.snap ? 1 : EASE, T = this.tileS || (this.tileS = new Float32Array(ROI * ROI));
    for (let i = 0; i < ROI * ROI; i++) T[i] += (this.tile[i] / WALKERS - T[i]) * k;
    this.paint(this.ectx, this.eimg, T, 0, this.white);

    this.fan(exp, sam, t, showTruth);
    this.strips(exp, sam, showTruth);
    this.pair(exp, sam, showTruth);
    this.snap = false;
  }

  // Total brightness over time. Dots are recorded frames. The band is the model's belief about the
  // underlying brightness: tight where there is data, and fanning out into a forecast beyond it.
  fan(exp, sam, t, showTruth) {
    const [c, W, H] = fit(this.el.fan), nf = exp.nf, dt = exp.set.dt, bgTot = exp.bg * dt * ROI * ROI, o = new Float64Array(3);
    const padL = 4, padB = 15, X = (ms) => padL + (W - padL - 4) * ms / T_TOTAL;
    const tmp = new Float32Array(WALKERS), e = this.snap ? 1 : EASE;
    if (!this.bands || this.bands.length !== nf) this.bands = Array.from({ length: nf }, () => null);
    const bands = this.bands;
    let max = 1;
    for (let k = 0; k < nf; k++) {
      for (let w = 0; w < WALKERS; w++) tmp[w] = exp.frame(sam.x[w], k, o)[0] + bgTot;
      const q = quantiles(tmp, WALKERS, [0.05, 0.25, 0.5, 0.75, 0.95]);
      if (!bands[k] || this.snap) bands[k] = q; else for (let j = 0; j < 5; j++) bands[k][j] += (q[j] - bands[k][j]) * e;
      if (k < sam.upto) max = Math.max(max, exp.tot[k]);
    }
    for (const b of bands) max = Math.max(max, b[3]);
    this.fanMax = this.snap || !this.fanMax ? max * 1.12 : this.fanMax + (max * 1.12 - this.fanMax) * e;
    max = this.fanMax;
    const Y = (v) => H - padB - (H - padB - 5) * Math.min(v, max) / max;
    const area = (lo, hi, from, to, col) => {
      if (to <= from) return;
      c.beginPath();
      for (let k = from; k < to; k++) c.lineTo(X((k + 0.5) * dt), Y(bands[k][hi]));
      for (let k = to - 1; k >= from; k--) c.lineTo(X((k + 0.5) * dt), Y(bands[k][lo]));
      c.closePath(); c.fillStyle = col; c.fill();
    };
    const seen = Math.max(0, sam.upto), join = Math.max(0, seen - 1);
    area(0, 4, 0, seen, rgba(GOLD, 0.22)); area(1, 3, 0, seen, rgba(GOLD, 0.42));
    area(0, 4, join, nf, rgba(FORE, 0.16)); area(1, 3, join, nf, rgba(FORE, 0.28));
    c.beginPath(); for (let k = 0; k < nf; k++) c.lineTo(X((k + 0.5) * dt), Y(bands[k][2]));
    c.strokeStyle = 'rgba(234,240,255,.75)'; c.lineWidth = 1.2; c.stroke();
    if (showTruth) {
      c.beginPath(); for (let k = 0; k < nf; k++) c.lineTo(X((k + 0.5) * dt), Y(exp.frame(exp.truth, k, o)[0] + bgTot));
      c.setLineDash([3, 3]); c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
    }
    c.fillStyle = INK;
    for (let k = 0; k < seen; k++) { c.beginPath(); c.arc(X((k + 0.5) * dt), Y(exp.tot[k]), nf > 50 ? 1.4 : 2, 0, 7); c.fill(); }
    // Playhead, and a time axis.
    c.strokeStyle = 'rgba(234,240,255,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(t), 2); c.lineTo(X(t), H - padB); c.stroke();
    c.fillStyle = INK3; c.font = '10px JetBrains Mono, monospace'; c.textBaseline = 'alphabetic';
    for (const ms of [0, 100, 200, 300, 400]) { c.textAlign = ms === 0 ? 'left' : ms === 400 ? 'right' : 'center'; c.fillText(ms + (ms === 400 ? ' ms' : ''), X(ms), H - 3); }
  }

  // One strip per unknown. Grey is what we assumed beforehand, gold is what we believe now.
  strips(exp, sam, showTruth) {
    const [c, W, H] = fit(this.el.strips), rowH = H / NP, compact = rowH < 34, bins = 72, hist = new Float32Array(bins);
    const priorScale = exp.set.prior;
    for (let i = 0; i < NP; i++) {
      const P = PARAMS[i], y0 = i * rowH, top = y0 + (compact ? 13 : 17), bot = y0 + rowH - (compact ? 5 : 8), h = bot - top;
      const lo = P.log ? LN(P.lo) : P.lo, hi = P.log ? LN(P.hi) : P.hi, X = (u) => (u - lo) / (hi - lo) * W;
      const n = sam.column(i, this.col);
      // Posterior histogram, lightly smoothed.
      hist.fill(0);
      for (let s = 0; s < n; s++) { const b = Math.floor((this.col[s] - lo) / (hi - lo) * bins); if (b >= 0 && b < bins) hist[b]++; }
      const E = this.ease || (this.ease = PARAMS.map(() => ({ h: new Float32Array(bins), q: null, bits: 0 }))), ei = E[i], e = this.snap ? 1 : EASE;
      let peak = 1e-9; const sm = ei.h;
      for (let b = 0; b < bins; b++) { const v = (0.25 * (hist[b - 1] || 0) + 0.5 * hist[b] + 0.25 * (hist[b + 1] || 0)) / Math.max(1, n); sm[b] += (v - sm[b]) * e; peak = Math.max(peak, sm[b]); }
      // Prior: a flat line for the fusion time, a bell on the working scale for the rest.
      c.beginPath(); c.moveTo(0, bot);
      const s0 = P.log ? LN(P.gsd) * priorScale : 0, ph = h * 0.5;
      for (let px = 0; px <= W; px += 3) { const u = lo + (hi - lo) * px / W, d = P.log ? Math.exp(-0.5 * Math.pow((u - LN(P.med)) / s0, 2)) : 0.55; c.lineTo(px, bot - ph * d); }
      c.lineTo(W, bot); c.closePath(); c.fillStyle = 'rgba(160,172,205,.16)'; c.fill(); c.strokeStyle = 'rgba(160,172,205,.5)'; c.lineWidth = 1; c.stroke();
      // Posterior: a heat strip (opacity follows density) with the density curve drawn over it.
      const bw = W / bins;
      for (let b = 0; b < bins; b++) if (sm[b] > peak * 0.004) { c.fillStyle = rgba(GOLD, 0.08 + 0.5 * sm[b] / peak); c.fillRect(b * bw, bot - h * sm[b] / peak, bw + 0.6, h * sm[b] / peak); }
      c.beginPath(); for (let b = 0; b < bins; b++) c.lineTo((b + 0.5) * bw, bot - h * sm[b] / peak); c.strokeStyle = rgba(GOLD, 0.95); c.lineWidth = 1.3; c.stroke();
      // 90% interval and median.
      const qn = n ? quantiles(this.col, n, [0.05, 0.5, 0.95]) : [lo, (lo + hi) / 2, hi];
      if (!ei.q || this.snap) ei.q = qn; else for (let j = 0; j < 3; j++) ei.q[j] += (qn[j] - ei.q[j]) * e;
      const q = ei.q;
      c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath();
      c.moveTo(X(q[0]), bot + 3.5); c.lineTo(X(q[2]), bot + 3.5); c.moveTo(X(q[0]), bot + 1); c.lineTo(X(q[0]), bot + 6); c.moveTo(X(q[2]), bot + 1); c.lineTo(X(q[2]), bot + 6); c.stroke();
      c.fillStyle = INK; c.beginPath(); c.arc(X(q[1]), bot + 3.5, 2.6, 0, 7); c.fill();
      if (showTruth) {
        const x = X(exp.truth[i]);
        c.strokeStyle = '#fff'; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(x, top - 2); c.lineTo(x, bot); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x, top - 1); c.lineTo(x - 4, top - 7); c.lineTo(x + 4, top - 7); c.closePath(); c.fill();
      }
      // Words: name, best estimate with its range, and how many bits the video has taught us.
      ei.bits += ((n ? bitsLearned(i, this.col, n, priorScale) : 0) - ei.bits) * e;
      const bits = ei.bits, S = this.summary[i];
      S.q = q.map((u) => toValue(i, u)); S.bits = bits;
      c.textBaseline = 'alphabetic'; c.font = `${compact ? 10.5 : 12}px 'Source Sans 3', sans-serif`;
      c.textAlign = 'left'; c.fillStyle = '#AAB6D6'; c.fillText(P.name, 0, y0 + (compact ? 9 : 11));
      c.textAlign = 'right'; c.fillStyle = INK; c.font = `${compact ? 10 : 11}px JetBrains Mono, monospace`;
      c.fillText(`${fmt(i, S.q[1])}${P.unit ? ' ' + P.unit : ''}  ${fmt(i, S.q[0])}–${fmt(i, S.q[2])}  ·  ${bits.toFixed(1)} bits`, W, y0 + (compact ? 9 : 11));
    }
  }

  // The two unknowns that most trade off against each other, as a cloud of still-plausible pairs.
  pair(exp, sam, showTruth) {
    const cv = this.el.pair; if (!cv.clientWidth) return;
    if (sam.count < WALKERS * 4) { fit(cv); return; }
    // Pick the most correlated pair (re-chosen only occasionally, so the plot does not flicker).
    if (this.snap) this.pick = null;
    if (!this.pick || sam.sweeps - this.pickAt > 2000) {
      let best = -1, n = 0; const m = [], sd = [], cols = [];
      for (let i = 0; i < NP; i++) { const col = new Float32Array(3100); n = sam.column(i, col); let a = 0, v = 0; for (let s = 0; s < n; s++) a += col[s]; a /= n; for (let s = 0; s < n; s++) v += (col[s] - a) ** 2; m.push(a); sd.push(Math.sqrt(v / n) || 1e-9); cols.push(col); }
      for (let i = 0; i < NP; i++) for (let j = i + 1; j < NP; j++) { let r = 0; for (let s = 0; s < n; s++) r += (cols[i][s] - m[i]) * (cols[j][s] - m[j]); r = Math.abs(r / n / sd[i] / sd[j]); if (r > best) { best = r; this.pick = [i, j, r]; } }
      this.pickAt = sam.sweeps;
    }
    const [i, j] = this.pick, [c, W, H] = fit(cv), pad = 16, GX = 34, GY = 20, e = this.snap || this.pairFor !== i * 9 + j ? 1 : EASE;
    const m = sam.column(i, this.col); sam.column(j, this.col2);
    const qa = quantiles(this.col, m, [0.01, 0.99]), qb = quantiles(this.col2, m, [0.01, 0.99]);
    const ex = (q) => { const d = (q[1] - q[0]) * 0.25 + 1e-6; return [q[0] - d, q[1] + d]; }, ta = ex(qa), tb = ex(qb);
    // The window and the density both ease, so the cloud drifts instead of shimmering.
    if (e === 1) { this.ra = ta; this.rb = tb; this.grid = new Float32Array(GX * GY); this.pairFor = i * 9 + j; }
    else for (let k = 0; k < 2; k++) { this.ra[k] += (ta[k] - this.ra[k]) * e; this.rb[k] += (tb[k] - this.rb[k]) * e; }
    const ra = this.ra, rb = this.rb, g = new Float32Array(GX * GY);
    for (let s2 = 0; s2 < m; s2++) { const gx = Math.floor((this.col[s2] - ra[0]) / (ra[1] - ra[0]) * GX), gy = Math.floor((this.col2[s2] - rb[0]) / (rb[1] - rb[0]) * GY); if (gx >= 0 && gx < GX && gy >= 0 && gy < GY) g[gy * GX + gx] += 1 / m; }
    let peak = 1e-9;
    for (let k = 0; k < GX * GY; k++) { this.grid[k] += (g[k] - this.grid[k]) * e; peak = Math.max(peak, this.grid[k]); }
    const X = (u) => pad + (W - pad - 4) * (u - ra[0]) / (ra[1] - ra[0]), Y = (u) => H - pad - (H - pad - 4) * (u - rb[0]) / (rb[1] - rb[0]);
    const cw = (W - pad - 4) / GX, chh = (H - pad - 4) / GY;
    for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) { const v = this.grid[gy * GX + gx] / peak; if (v > 0.02) { c.fillStyle = rgba(GOLD, 0.06 + 0.8 * Math.pow(v, 0.7)); c.fillRect(pad + gx * cw, H - pad - (gy + 1) * chh, cw + 0.5, chh + 0.5); } }
    if (showTruth) { const x = X(exp.truth[i]), y = Y(exp.truth[j]); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 5, y); c.moveTo(x, y - 5); c.lineTo(x, y + 5); c.stroke(); }
    c.fillStyle = INK3; c.font = "10.5px 'Source Sans 3', sans-serif"; c.textBaseline = 'alphabetic';
    c.textAlign = 'right'; c.fillText(PARAMS[i].name + ' →', W - 2, H - 3);
    c.save(); c.translate(10, 4); c.rotate(-Math.PI / 2); c.textAlign = 'right'; c.fillText(PARAMS[j].name + ' →', 0, 0); c.restore();
    this.pairText = `${PARAMS[i].name} and ${PARAMS[j].name.toLowerCase()} trade off: a wrong guess at one can be covered by the other.`;
  }
}
