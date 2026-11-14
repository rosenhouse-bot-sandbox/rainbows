// Inside the leaf: the leaf cut through its thickness and seen from the cut edge, one of its cells,
// the chloroplasts in that cell, and the pigment molecules. Drawn about the point the camera zooms
// into (the middle of one cell), in micrometres for cells and nanometres for molecules.
//
// What is simplified, and said so on the page:
//  - cells are drawn with regular shapes; a cell's other contents (nucleus, mitochondria) are left out;
//  - molecules are flat skeleton diagrams without hydrogen atoms, the proteins and fats that hold
//    chlorophyll and carotenoids in the membrane are left out, and so is water;
//  - anthocyanin is drawn far more crowded than it is: a real view this size would usually hold none.
import { leafRGB, css, clamp, smooth, mix } from './model.js?v=1ce981fb';

const hash = (i, j) => { let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// The leaf cut through its thickness, in micrometres. y is up; (0,0) is the middle of the tall cell
// the camera closes on. From the top: upper skin, tall cells, loose cells with air between, lower skin.
export const SEC = { top: 35, skin: 21.5, tall: 41, wide: 11, pitch: 12.4, loose: -27, lower: -91, bottom: -101, vein: [92, -53, 21], veinEvery: 390, pore: 47.5, poreEvery: 76 };
const PLASTID = [3.85, 0];                                                               // the followed chloroplast: on the right-hand wall, half-way up
// The two places the Molecules scale can look, in metres from the cell's centre.
export const TARGETS = { membrane: [PLASTID[0] * 1e-6, PLASTID[1] * 1e-6], vacuole: [0, 0] };
// Between the Leaf and Tissue scales the leaf is cut and tipped back, as one solid, until its cut face
// is seen square on. Where that happens depends only on the zoom (um: CSS pixels per micrometre):
// first the near piece slides away (gap, in pixels), then the rest tips (cs, sn: cosine and sine of the tip).
export const TURN = { from: 0.4, slide: 0.36, depth: 2500 };                   // depth: micrometres of leaf kept behind the cut
// atTissue: the zoom of the Tissue scale on this screen; the tipping is over a little before it.
export function turnOf(um, Y, H, atTissue) {
  const to = atTissue * 0.8, from = Math.min(TURN.from, to / 3);
  if (um <= from) return null;
  const u = clamp(Math.log(um / from) / Math.log(to / from)), th = Math.PI / 2 * smooth((u - TURN.slide) / (1 - TURN.slide));
  const sn = Math.sin(th), cs = u >= 1 ? 0 : Math.cos(th);
  return { cs, sn, Y, Ye: Y - um * SEC.top * sn, gap: smooth(u / TURN.slide) * (H - Y + 2), far: um * TURN.depth, done: u >= 1 };
}
const AIR = '#0a0f20';
const GRANUM = 0.24;                                                                     // micrometres: radius of one stack of membranes

// ---- molecules, in nanometres ---------------------------------------------------------------
const pol = (r, deg) => [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180)];
function chlorophyll() {
  const ring = [], rest = [], tail = [], mg = [];
  for (let q = 0; q < 4; q++) {
    const t = q * 90, N = pol(0.205, t), a1 = pol(0.3, t + 23), a2 = pol(0.3, t - 23), b1 = pol(0.425, t + 9.3), b2 = pol(0.425, t - 9.3), meso = pol(0.342, t + 45), next = pol(0.3, t + 90 - 23);
    ring.push([N, a1], [N, a2], [a1, b1], [a2, b2], [b1, b2], [a1, meso], [meso, next]);
    mg.push([[0, 0], N]);
    if (q !== 0) rest.push([b2, pol(0.56, t - 11)]);
    rest.push([b1, pol(0.56, t + 11)]);
  }
  const x = pol(0.5, 225 + 22); rest.push([pol(0.342, 225), x], [x, pol(0.425, 270 - 9.3)], [x, pol(0.63, 250)]);     // the fifth ring
  let p = pol(0.425, -9.3), dir = -24 * Math.PI / 180;                                                                   // the tail, 20 carbons long
  for (let i = 0; i < 21; i++) {
    const s = i % 2 ? 1 : -1, n = [p[0] + 0.121 * Math.cos(dir) - s * 0.07 * Math.sin(dir), p[1] + 0.121 * Math.sin(dir) + s * 0.07 * Math.cos(dir)];
    tail.push([p, n]);
    if (i > 4 && i % 4 === 1) tail.push([n, [n[0] - s * -0.12 * Math.sin(dir), n[1] + s * -0.12 * Math.cos(dir)]]);
    p = n; dir += 0.035 * Math.sin(i * 0.7);
  }
  return { ring, rest, tail, mg };
}
const hex = (cx, cy, rot = 30, r = 0.14) => Array.from({ length: 6 }, (_, i) => [cx + r * Math.cos((rot + 60 * i) * Math.PI / 180), cy + r * Math.sin((rot + 60 * i) * Math.PI / 180)]);
const around = (v) => v.map((p, i) => [p, v[(i + 1) % v.length]]);
function carotene() {
  const chain = [], dbl = [], rest = [], n = 19, x0 = -n * 0.121 / 2;
  let p = [x0, 0.035];
  for (let i = 0; i < n; i++) {
    const q = [x0 + (i + 1) * 0.121, i % 2 ? 0.035 : -0.035];
    chain.push([p, q]);
    if (i % 2 === 0) { const o = i % 4 ? 0.03 : -0.03; dbl.push([[p[0] + 0.02, p[1] + o + (i % 4 ? 0 : 0.0)], [q[0] - 0.02, q[1] + o]]); }
    if (i === 3 || i === 7 || i === 11 || i === 15) rest.push([q, [q[0], q[1] + (i % 2 ? 0.13 : -0.13)]]);
    p = q;
  }
  for (const s of [-1, 1]) {
    const end = s < 0 ? [x0, 0.035] : p, c = [end[0] + s * 0.14, end[1]], h = hex(c[0], c[1], 0);
    rest.push(...around(h));
    dbl.push([[h[s < 0 ? 1 : 2][0], h[1][1] - 0.03], [h[s < 0 ? 2 : 1][0] , h[1][1] - 0.03]]);
    const far = h[s < 0 ? 3 : 0]; rest.push([far, [far[0] + s * 0.09, far[1] + 0.09]], [far, [far[0] + s * 0.09, far[1] - 0.09]]);
  }
  return { chain, dbl, rest };
}
function cyanidin() {
  const d = 0.14 * Math.sqrt(3), A = hex(0, 0), C = hex(d, 0), ring = [...around(A), ...around(C).filter((_, i) => i !== 2)], rest = [], dots = [];
  const c2 = C[5], dirB = -30 * Math.PI / 180, bc = [c2[0] + 0.285 * Math.cos(dirB), c2[1] + 0.285 * Math.sin(dirB)], B = hex(bc[0], bc[1]);
  ring.push([c2, B[2]], ...around(B));
  dots.push(C[4]);                                                                       // the oxygen in the middle ring
  const oh = (v, deg, to = rest) => { const e = [v[0] + 0.125 * Math.cos(deg * Math.PI / 180), v[1] + 0.125 * Math.sin(deg * Math.PI / 180)]; to.push([v, e]); dots.push(e); return e; };
  oh(A[2], 150); oh(A[4], 270); oh(B[0], 30); oh(B[5], -30);
  const o3 = oh(C[0], 30), gc = [o3[0] + 0.265 * Math.cos(Math.PI / 6), o3[1] + 0.265 * Math.sin(Math.PI / 6)], G = hex(gc[0], gc[1]);
  rest.push([o3, G[3]], ...around(G)); dots.push(G[4]);
  oh(G[0], 30); oh(G[1], 90); oh(G[2], 150);
  const ch2 = [G[5][0] + 0.13 * Math.cos(-Math.PI / 6), G[5][1] + 0.13 * Math.sin(-Math.PI / 6)]; rest.push([G[5], ch2]); oh(ch2, -90);
  const m = [d / 2 + 0.25, 0.1];                                                         // centre it
  const sh = (l) => l.map(([a, b]) => [[a[0] - m[0], a[1] - m[1]], [b[0] - m[0], b[1] - m[1]]]);
  return { ring: sh(ring), rest: sh(rest), dots: dots.map((p) => [p[0] - m[0], p[1] - m[1]]) };
}
const path = (list) => { const p = new Path2D(); for (const [a, b] of list) { p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); } return p; };

export function makeMicro() {
  const chl = chlorophyll(), car = carotene(), cya = cyanidin();
  const M = {
    chlRing: path(chl.ring), chlRest: path(chl.rest), chlTail: path(chl.tail), chlMg: path(chl.mg),
    carChain: path([...car.chain, ...car.dbl]), carRest: path(car.rest),
    cyaRing: path(cya.ring), cyaRest: path(cya.rest), cyaDots: cya.dots,
  };
  // the colours the three pigments are drawn in: what each looks like on its own, from the same model as the leaf
  const INK = { chl: leafRGB({ chl: 1, car: 0, anth: 0 }, 1, 2.4), car: leafRGB({ chl: 0, car: 1.3, anth: 0 }, 1, 1.9), anth: leafRGB({ chl: 0, car: 0, anth: 1 }, 1, 2.3) };
  const GREY = [0.62, 0.66, 0.7];
  const plast = { chl: 0, car: 0, anth: 0 }, vac = { chl: 0, car: 0, anth: 0 };

  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); };
  const WALL = 'rgba(236,244,224,.42)', CYTO = 'rgba(214,238,204,.13)', CLEAR = 'rgba(225,235,225,.08)';
  // The colours of one cell's parts for given pigments. share: how much of the leaf's anthocyanin this kind of cell makes.
  function tones(p, share) {
    plast.chl = p.chl; plast.car = p.car; vac.anth = p.anth * share;
    const vc = leafRGB(vac, 1.25, 1.9), a = vac.anth;
    return { body: css(leafRGB(plast, 2.0, 1.9)), dot: css(leafRGB(plast, 3.4, 1.6)), vacA: css(vc, 1.08, 0.07 + 0.85 * a), vacB: css(vc, 0.86, 0.04 + 0.88 * a), chl: p.chl, size: mix(0.7, 1, smooth(p.chl * 1.6)) };
  }
  // One chloroplast, its long side along a wall. rot turns it; the stacks of membrane inside show as dots from close by.
  function plastid(ctx, x, y, rot, size, t, um, main, seed) {
    ctx.fillStyle = t.body; ctx.beginPath(); ctx.ellipse(x, y, 1.2 * size, 2.45 * size, rot, 0, 7); ctx.fill();
    if (um * 4 * size < 46) return;
    const fade = clamp((um * 4 * size - 46) / 50), c = Math.cos(rot), s = Math.sin(rot);
    ctx.fillStyle = t.dot;
    for (let k = 0; k < 15; k++) {
      const first = main && k === 0, th = first ? -1 : 0.06 + 0.9 * hash(k * 7 + seed, 11 + seed * 3), on = clamp((t.chl - th) / 0.12);
      if (on <= 0) continue;
      const u = first ? 0 : (hash(k, seed * 5 + 1) - 0.5) * 1.8, v = first ? 0 : (hash(k + 40, seed * 5 + 2) - 0.5) * 4.2;
      if ((u / 0.95) ** 2 + (v / 2.15) ** 2 > 1 || (!first && main && Math.hypot(u, v) < 0.55)) continue;
      ctx.globalAlpha *= fade * on;
      ctx.beginPath(); ctx.arc(x + size * (u * c - v * s), y + size * (u * s + v * c), first ? GRANUM : 0.17 * size, 0, 7); ctx.fill();
      ctx.globalAlpha /= fade * on;
    }
  }
  const vacFill = (ctx, t, x0, y0, x1, y1) => { const g = ctx.createLinearGradient(x0, y1, x1, y0); g.addColorStop(0, t.vacA); g.addColorStop(1, t.vacB); return g; };

  // The cut leaf. pigAt(days): the followed leaf's pigments that many days earlier.
  function section(ctx, um, x0, x1, pigAt) {
    const S = SEC, lw = Math.max(0.22, 0.8 / um), simple = um < 1.5;
    const veinNear = (x) => S.vein[0] + Math.round((x - S.vein[0]) / S.veinEvery) * S.veinEvery;
    const poreNear = (x) => S.pore + Math.round((x - S.pore) / S.poreEvery) * S.poreEvery;
    const T = [], tone = (x, share) => {                    // cells beside a vein run a few days behind
      const b = Math.round(clamp(1 - Math.abs(x - veinNear(x)) / 75) * 3), key = b + (share < 0.5 ? 4 : 0);
      return T[key] || (T[key] = tones(pigAt(-2.5 * b), share));
    };
    ctx.lineWidth = lw; ctx.strokeStyle = WALL;
    // upper skin: one layer of clear cells under a waxy film
    for (let i = Math.floor(x0 / 21) - 1; i <= Math.ceil(x1 / 21); i++) {
      const a = i * 21 + (hash(i, 5) - 0.5) * 6, b = (i + 1) * 21 + (hash(i + 1, 5) - 0.5) * 6;
      rr(ctx, a + 0.3, S.skin + 0.4, b - a - 0.6, S.top - S.skin - 0.8, 3.5); ctx.fillStyle = CLEAR; ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,240,.55)'; ctx.lineWidth = Math.max(0.7, 1 / um); ctx.beginPath(); ctx.moveTo(x0, S.top); ctx.lineTo(x1, S.top); ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = WALL;
    // tall cells, side by side
    for (let i = Math.floor(x0 / S.pitch) - 1; i <= Math.ceil(x1 / S.pitch) + 1; i++) {
      const main = i === 0, cx = i * S.pitch, h = main ? S.tall : S.tall - 3 * hash(i, 77), top = S.skin - 0.6, t = tone(cx, 1), w = S.wide;
      rr(ctx, cx - w / 2, top - h, w, h, 4.5); ctx.fillStyle = CYTO; ctx.fill(); ctx.stroke();
      rr(ctx, cx - 2.2, top - h + 3, 4.4, h - 6, 2.2); ctx.fillStyle = vacFill(ctx, t, cx - 2.5, top - h, cx + 2.5, top); ctx.fill();
      if (simple) { ctx.fillStyle = t.body; ctx.fillRect(cx - w / 2 + 0.6, top - h + 2.5, 2.3, h - 5); ctx.fillRect(cx + w / 2 - 2.9, top - h + 2.5, 2.3, h - 5); continue; }
      const mid = top - h / 2;
      for (const side of [1, -1]) for (let j = 0; j < 7; j++) plastid(ctx, cx + side * PLASTID[0], main ? (j - 3) * 5.6 : mid + (j - 3) * 5.6 * h / S.tall + (hash(i * 9 + j, side) - 0.5) * 1.2, 0, t.size, t, um, main && side === 1 && j === 3, i * 10 + j + (side > 0 ? 5 : 0));
    }
    // loose cells with air between them; fewer chloroplasts, and little anthocyanin
    for (let r = 0; r < 5; r++) for (let i = Math.floor(x0 / 17) - 1; i <= Math.ceil(x1 / 17) + 1; i++) {
      if (hash(i * 3 + 1, r * 7 + 2) < 0.26) continue;
      const cx = (i + (r & 1) * 0.5) * 17 + (hash(i, r + 30) - 0.5) * 6, cy = S.loose - 5 - r * 13 + (hash(i + 60, r) - 0.5) * 5, rad = 5.6 + 2.4 * hash(i - 7, r + 3);
      const v = veinNear(cx); if (Math.hypot(cx - v, cy - S.vein[1]) < S.vein[2] + rad - 1) continue;
      if (cy < -70 && Math.abs(cx - poreNear(cx)) < 11) continue;                        // the air chamber above each pore
      const t = tone(cx, 0.2);
      ctx.beginPath(); ctx.ellipse(cx, cy, rad * (1.05 + 0.2 * hash(i, r + 9)), rad * 0.92, hash(i + 4, r) * 3, 0, 7); ctx.fillStyle = CYTO; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, rad * 0.5, 0, 7); ctx.fillStyle = vacFill(ctx, t, cx - rad * 0.5, cy - rad * 0.5, cx + rad * 0.5, cy + rad * 0.5); ctx.fill();
      if (simple) { ctx.save(); ctx.strokeStyle = t.body; ctx.lineWidth = 1.9 * t.size; ctx.beginPath(); ctx.ellipse(cx, cy, rad - 1.8, (rad - 1.8) * 0.9, 0, 0, 7); ctx.stroke(); ctx.restore(); continue; }   // from far off its chloroplasts run together into a ring
      const n = 5, a0 = hash(i, r + 21) * 6.283;
      for (let k = 0; k < n; k++) { const a = a0 + k * 6.283 / n; plastid(ctx, cx + (rad - 1.8) * Math.cos(a), cy + (rad - 1.8) * 0.9 * Math.sin(a), a, t.size * 0.82, t, um, false, i * 13 + r * 5 + k); }
    }
    // a vein, cut across: water pipes (thick walls) above, sugar pipes (small) below, inside a ring of cells
    for (let v = veinNear(x0); v <= x1 + S.vein[2]; v += S.veinEvery) {
      const [, vy, vr] = S.vein;
      ctx.beginPath(); ctx.arc(v, vy, vr - 4, 0, 7); ctx.fillStyle = 'rgba(20,26,22,.9)'; ctx.fill();
      for (let k = 0; k < 12; k++) { const a = k * 6.283 / 12; ctx.beginPath(); ctx.arc(v + (vr - 5) * Math.cos(a), vy + (vr - 5) * Math.sin(a), 4.6, 0, 7); ctx.fillStyle = CLEAR; ctx.fill(); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(232,222,180,.6)'; ctx.lineWidth = Math.max(0.9, lw);
      for (let k = 0; k < 7; k++) { const a = 0.5 + k * 0.36, d = k % 2 ? 4.2 : 9; ctx.beginPath(); ctx.arc(v + d * Math.cos(a), vy + 1 + d * Math.sin(a) * 0.9, 2.7 - 0.25 * (k % 3), 0, 7); ctx.stroke(); }
      ctx.lineWidth = lw; ctx.strokeStyle = WALL; ctx.fillStyle = 'rgba(190,214,170,.45)';
      for (let k = 0; k < 16; k++) { const a = 3.45 + (k % 8) * 0.35, d = k < 8 ? 4.5 : 8.6; ctx.beginPath(); ctx.arc(v + d * Math.cos(a), vy - 1.5 + d * Math.sin(a) * 0.85, 1.55, 0, 7); ctx.fill(); }
    }
    // lower skin, with pores: each a gap between two small cells that hold chloroplasts
    const t0 = tone(1e9, 0);
    for (let i = Math.floor(x0 / 19) - 1; i <= Math.ceil(x1 / 19); i++) {
      const a = i * 19, pore = Math.abs(a + 9.5 - poreNear(a + 9.5)) < 1;
      if (!pore) { rr(ctx, a + 0.3, S.bottom + 0.4, 18.4, S.lower - S.bottom - 0.8, 3); ctx.fillStyle = CLEAR; ctx.fill(); ctx.stroke(); continue; }
      rr(ctx, a + 0.3, S.bottom + 0.4, 4.6, S.lower - S.bottom - 0.8, 2.5); ctx.fillStyle = CLEAR; ctx.fill(); ctx.stroke();
      rr(ctx, a + 14.1, S.bottom + 0.4, 4.6, S.lower - S.bottom - 0.8, 2.5); ctx.fill(); ctx.stroke();
      for (const side of [1, -1]) { const gx = a + 9.5 + side * 2.9, gy = S.bottom + 4.2; ctx.beginPath(); ctx.ellipse(gx, gy, 1.9, 3.6, 0, 0, 7); ctx.fillStyle = CYTO; ctx.fill(); ctx.stroke(); if (!simple) { ctx.fillStyle = t0.body; ctx.beginPath(); ctx.arc(gx, gy + 1.3, 0.8, 0, 7); ctx.arc(gx, gy - 1.3, 0.8, 0, 7); ctx.fill(); } }
    }
  }

  function molecules(ctx, kn, X0, Y0, cam, where, p, alpha) {
    // kn: CSS pixels per nanometre. (X0, Y0): where this field's own origin falls on screen.
    const pitch = 2.9, i0 = Math.floor(-X0 / kn / pitch) - 1, i1 = Math.ceil((cam.W - X0) / kn / pitch) + 1, j0 = Math.floor((Y0 - cam.H) / kn / pitch) - 1, j1 = Math.ceil(Y0 / kn / pitch) + 1;
    const small = kn < 16, lw = (w) => w / kn;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const h = hash(i * 3 + 1, j * 5 + 2), th = 0.04 + 0.92 * hash(i + 77, j - 19), rot = hash(i - 5, j + 13) * 6.283;
      const x = (i + (hash(i, j + 3) - 0.5) * 0.45) * pitch, y = (j + (hash(i + 9, j) - 0.5) * 0.45) * pitch, c = Math.cos(rot), s = Math.sin(rot), m = kn * cam.dpr;
      const set = () => ctx.setTransform(m * c, -m * s, -m * s, -m * c, (X0 + kn * x) * cam.dpr, (Y0 - kn * y) * cam.dpr);
      if (where === 'membrane') {
        if (i === 0 && j === 0 ? false : h > 0.9) continue;
        if (h < 0.66 || (i === 0 && j === 0)) {
          // chlorophyll. b runs from 0 (whole) to 1 (taken apart): magnesium out, tail off, ring opened and no longer absorbing
          const b = clamp((th - p.chl) / 0.1), a = alpha * (1 - smooth((b - 0.55) / 0.45));
          if (a <= 0.01) continue;
          set();
          const ink = [0, 1, 2].map((q) => mix(INK.chl[q], GREY[q], smooth((b - 0.3) / 0.4)));
          ctx.globalAlpha = a * 0.22; ctx.strokeStyle = css(ink); ctx.lineWidth = lw(7); ctx.stroke(M.chlRing);
          ctx.globalAlpha = a; ctx.lineWidth = lw(small ? 1.3 : 2.4); ctx.stroke(M.chlRing);
          if (small) continue;
          ctx.lineWidth = lw(1.3); ctx.globalAlpha = a * 0.75; ctx.stroke(M.chlRest);
          const tail = 1 - smooth((b - 0.2) / 0.3), mg = 1 - smooth(b / 0.3);
          if (tail > 0) { ctx.globalAlpha = a * 0.85 * tail; ctx.stroke(M.chlTail); }
          if (mg > 0) { ctx.globalAlpha = a * 0.5 * mg; ctx.lineWidth = lw(1); ctx.stroke(M.chlMg); ctx.globalAlpha = a * mg; ctx.fillStyle = '#f2fbe6'; ctx.beginPath(); ctx.arc(0, 0, 0.075, 0, 7); ctx.fill(); }
        } else {
          const a = alpha * clamp((p.car - th * 0.9) / 0.08);
          if (a <= 0.01) continue;
          set(); ctx.strokeStyle = css(INK.car);
          ctx.globalAlpha = a * 0.22; ctx.lineWidth = lw(7); ctx.stroke(M.carChain);
          ctx.globalAlpha = a; ctx.lineWidth = lw(small ? 1.3 : 2.2); ctx.stroke(M.carChain);
          if (!small) { ctx.globalAlpha = a * 0.7; ctx.lineWidth = lw(1.3); ctx.stroke(M.carRest); }
        }
      } else {
        if (h > 0.8) continue;
        const a = alpha * clamp((p.anth - th) / 0.07);
        if (a <= 0.01) continue;
        set(); ctx.strokeStyle = css(INK.anth);
        ctx.globalAlpha = a * 0.22; ctx.lineWidth = lw(7); ctx.stroke(M.cyaRing);
        ctx.globalAlpha = a; ctx.lineWidth = lw(small ? 1.3 : 2.4); ctx.stroke(M.cyaRing);
        if (small) continue;
        ctx.globalAlpha = a * 0.75; ctx.lineWidth = lw(1.3); ctx.stroke(M.cyaRest);
        ctx.fillStyle = '#ffd9d2'; ctx.beginPath(); for (const d of M.cyaDots) { ctx.moveTo(d[0] + 0.034, d[1]); ctx.arc(d[0], d[1], 0.034, 0, 7); } ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // pigAt(days): the followed leaf's pigments that many days earlier. X, Y: where the middle of the
  // followed cell falls on screen. centre: the camera's middle, in metres from there. turn: see turnOf.
  function draw(ctx, cam, pigAt, X, Y, centre, turn) {
    if (!turn) return;
    const um = cam.k * 1e-6, { W, H, dpr } = cam, p = pigAt(0);                           // um: CSS pixels per micrometre
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (turn.done) { ctx.fillStyle = AIR; ctx.fillRect(0, 0, W, H); }                    // the air outside the leaf
    if (turn.sn > 0.004) {
      // the cut face of the leaf, which comes into view as the leaf is tipped back
      const top = Math.round(turn.Ye * dpr) / dpr, tall = um * (SEC.top - SEC.bottom) * turn.sn;
      ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, tall); ctx.clip();
      ctx.fillStyle = '#0b100f'; ctx.fillRect(0, top, W, tall);                          // the air inside the leaf
      ctx.setTransform(um * dpr, 0, 0, -um * turn.sn * dpr, X * dpr, Y * dpr);
      section(ctx, um, -X / um - 30, (W - X) / um + 30, pigAt);
      ctx.restore();
    }
    // molecules: in a stack of chloroplast membrane, or in the water of the vacuole
    const kn = cam.k * 1e-9, ma = smooth((kn - 7) / 16);
    if (ma <= 0) return;
    const T = TARGETS.membrane, inMembrane = Math.hypot(centre[0] - T[0], centre[1] - T[1]) < GRANUM * 1e-6;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 0.82 * ma; ctx.fillStyle = inMembrane ? '#07100c' : '#0d090c'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    if (inMembrane) molecules(ctx, kn, X + cam.k * T[0], Y - cam.k * T[1], cam, 'membrane', p, ma);
    else if (Math.hypot(centre[0], centre[1]) < 2.4e-6) molecules(ctx, kn, X, Y, cam, 'vacuole', p, ma);
  }
  return { draw, INK };
}
