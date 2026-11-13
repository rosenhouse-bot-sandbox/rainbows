// Inside the leaf: the cells seen from above through the leaf's clear outer layer, the chloroplasts
// in one cell, and the pigment molecules. Drawn about the point the camera zooms into (the centre of
// one cell), in micrometres for cells and nanometres for molecules.
//
// What is simplified, and said so on the page:
//  - cells are drawn as circles in one layer; the cell's other contents (nucleus, mitochondria) are left out;
//  - molecules are flat skeleton diagrams without hydrogen atoms, the proteins and fats that hold
//    chlorophyll and carotenoids in the membrane are left out, and so is water;
//  - anthocyanin is drawn far more crowded than it is: a real view this size would usually hold none.
import { leafRGB, css, clamp, smooth, mix } from './model.js';

const hash = (i, j) => { let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export const CELL = { r: 6, pitch: 12.7, vac: 3.3, plastids: 6, ring: 4.25 };          // micrometres
const A0 = 0.35;                                                                         // where the followed chloroplast sits round the cell
// The two places the Molecules scale can look, in metres from the cell's centre.
export const TARGETS = { membrane: [CELL.ring * Math.cos(A0) * 1e-6, CELL.ring * Math.sin(A0) * 1e-6], vacuole: [0, 0] };
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

  function cell(ctx, cx, cy, r, rot, p, px, isMain) {
    // p: this cell's pigments. px: CSS pixels per micrometre.
    ctx.fillStyle = 'rgba(232,240,214,.24)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(236,244,224,.42)'; ctx.lineWidth = Math.max(0.22, 0.8 / px); ctx.stroke();
    vac.anth = p.anth;
    const vr = CELL.vac * r / CELL.r, vc = leafRGB(vac, 1.25, 1.9);
    const g = ctx.createRadialGradient(cx - vr * 0.3, cy + vr * 0.3, vr * 0.1, cx, cy, vr);
    g.addColorStop(0, css(vc, 1.08, 0.2 + 0.72 * p.anth)); g.addColorStop(1, css(vc, 0.86, 0.12 + 0.8 * p.anth));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, vr, 0, 7); ctx.fill();
    plast.chl = p.chl; plast.car = p.car;
    const body = css(leafRGB(plast, 2.3, 1.55)), size = mix(0.7, 1, smooth(p.chl * 1.6)) * r / CELL.r, n = CELL.plastids, ringR = CELL.ring * r / CELL.r;
    for (let i = 0; i < n; i++) {
      const a = rot + i * 2 * Math.PI / n, x = cx + ringR * Math.cos(a), y = cy + ringR * Math.sin(a);
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, y, 1.08 * size, 1.8 * size, a, 0, 7); ctx.fill();
      if (px * 4 * size < 46) continue;
      // the stacks of membrane, seen end on as dots
      const fade = clamp((px * 4 * size - 46) / 50), dot = css(leafRGB(plast, 3.4, 1.5));
      ctx.fillStyle = dot;
      for (let k = 0; k < 15; k++) {
        const main = isMain && i === 0 && k === 0, th = main ? -1 : 0.06 + 0.9 * hash(k * 7 + i, 11 + i * 3), on = clamp((p.chl - th) / 0.12);
        if (on <= 0) continue;
        const u = main ? 0 : (hash(k, i * 5 + 1) - 0.5) * 1.5, v = main ? 0 : (hash(k + 40, i * 5 + 2) - 0.5) * 3, e = (u / 0.86) ** 2 + (v / 1.55) ** 2;
        if (e > 1 || (!main && isMain && i === 0 && Math.hypot(u, v) < 0.55)) continue;
        ctx.globalAlpha = fade * on;
        ctx.beginPath(); ctx.arc(x + size * (u * Math.cos(a) - v * Math.sin(a)), y + size * (u * Math.sin(a) + v * Math.cos(a)), main ? GRANUM : 0.17 * size, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
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

  // p: the followed leaf's pigments. X, Y: where the cell's centre falls on screen. centre: the
  // camera's middle, in metres from the cell's centre. leafCol: the leaf's colour at this point.
  function draw(ctx, cam, p, X, Y, centre, leafCol) {
    const um = cam.k * 1e-6, a = smooth((um - 0.5) / 1.1);                               // CSS pixels per micrometre
    if (a <= 0) return;
    const { W, H, dpr } = cam, P = CELL.pitch, rowH = P * 0.866;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = a * 0.66; ctx.fillStyle = '#060a0c'; ctx.fillRect(0, 0, W, H);      // the spaces between cells, darker
    ctx.globalAlpha = a;
    ctx.setTransform(um * dpr, 0, 0, -um * dpr, X * dpr, Y * dpr);
    const j0 = Math.floor((Y - H) / um / rowH) - 1, j1 = Math.ceil(Y / um / rowH) + 1, i0 = Math.floor(-X / um / P) - 1, i1 = Math.ceil((W - X) / um / P) + 1;
    const q = { chl: 0, car: 0, anth: 0 };
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const main = i === 0 && j === 0, jx = main ? 0 : (hash(i, j) - 0.5) * 1.1, jy = main ? 0 : (hash(j, i + 50) - 0.5) * 1.1;
      const cx = (i + (j & 1) * 0.5) * P + jx, cy = j * rowH + jy, r = main ? CELL.r : CELL.r * (0.9 + 0.13 * hash(i + 7, j + 3));
      if (um * r < 3.2) { ctx.fillStyle = leafCol; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); continue; }
      const d = main ? 0 : (hash(i - 3, j + 8) - 0.5) * 0.2;                             // neighbouring cells are not quite in step
      q.chl = clamp(p.chl * (1 + d)); q.car = p.car; q.anth = clamp(p.anth * (1 - d * 1.5));
      cell(ctx, cx, cy, r, main ? A0 : hash(i, j + 21) * 6.283, q, um, main);
    }
    ctx.globalAlpha = 1;
    // molecules: in a stack of chloroplast membrane, or in the water of the vacuole
    const kn = cam.k * 1e-9, ma = smooth((kn - 7) / 16);
    if (ma <= 0) return;
    const T = TARGETS.membrane, inMembrane = Math.hypot(centre[0] - T[0], centre[1] - T[1]) < GRANUM * 1e-6;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 0.82 * ma; ctx.fillStyle = inMembrane ? '#07100c' : '#0d090c'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    if (inMembrane) molecules(ctx, kn, X + cam.k * T[0], Y - cam.k * T[1], cam, 'membrane', p, ma);
    else if (Math.hypot(centre[0], centre[1]) < CELL.vac * 1e-6) molecules(ctx, kn, X, Y, cam, 'vacuole', p, ma);
  }
  return { draw, INK };
}
