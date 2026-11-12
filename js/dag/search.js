// A layout by search, standing in for TALA. This is not TALA's code and not its algorithm. (TALA
// was closed source until September 2026 and is now MPL-2.0, shipped inside D2 from v0.9.0.) This
// shares only the outline its makers describe: it is not tied to layers, it treats containers
// (boxes of nodes) as first-class, it draws edges as horizontal and vertical runs, and it runs
// several seeds and keeps the layout that scores best.
//
// Here: nodes sit on a grid inside their group's box, and the boxes sit on a grid of their own.
// A try starts from a random arrangement and swaps two nodes, or two boxes, again and again,
// keeping a swap when the score drops (and, early on, sometimes when it does not). The score adds
// edge length, bends, crossings and edges that point against the chosen direction. Several tries
// are made from different seeds and the lowest score is kept.

import { rng, inputGrid, bounds, straightCrossings } from './common.js';
import { routeOrtho } from './route.js';

export const SEARCH_STAGES = ['input', 'boxes', 'search', 'route'];
const done = new WeakMap();

export function gridSearch(g, o) {
  const N = g.n, boxed = g.groups.length > 0, K = boxed ? g.groups.length : 1, down = o.dir !== 'right';
  const grp = g.group.map((k) => (boxed ? Math.max(0, k) : 0));
  const members = Array.from({ length: K }, () => []);
  grp.forEach((k, v) => members[k].push(v));
  const cw = o.nodeW + o.gap, ch = o.nodeH + o.gap, pad = boxed ? 13 : 0, between = boxed ? Math.max(24, o.gap + 6) : 0;

  // grid sizes: a box is a little wider than tall; a graph with no groups gets spare cells to move into
  const cols = [], rows = [];
  for (let k = 0; k < K; k++) {
    const n = members[k].length, cells = boxed ? n : n * 2;
    const c = Math.max(1, Math.min(cells, Math.ceil(Math.sqrt(cells * (boxed ? 1.4 : o.aspect) * ch / cw))));
    cols.push(c); rows.push(Math.max(1, Math.ceil(cells / c)));
  }
  const oc = Math.max(1, Math.min(K, Math.ceil(Math.sqrt(K * o.aspect * 0.8)))), or = Math.ceil(K / oc);

  const X = new Float64Array(N), Y = new Float64Array(N), bx = new Float64Array(K), by = new Float64Array(K), bw = new Float64Array(K), bh = new Float64Array(K);
  // Turn an arrangement into coordinates. Empty rows and columns take no room.
  const cu = cols.map((c) => new Int32Array(c)), ru = rows.map((r) => new Int32Array(r));
  const colW = new Float64Array(oc), rowH = new Float64Array(or), colX = new Float64Array(oc), rowY = new Float64Array(or);
  function geom(st) {
    for (let k = 0; k < K; k++) {
      const C = cols[k], R = rows[k], cell = st.cell[k], uc = cu[k], ur = ru[k];
      uc.fill(0); ur.fill(0);
      for (let i = 0; i < cell.length; i++) if (cell[i] >= 0) { uc[i % C] = 1; ur[(i / C) | 0] = 1; }
      let nc = 0, nr = 0;
      for (let c = 0; c < C; c++) { const u = uc[c]; uc[c] = nc; nc += u; }
      for (let r = 0; r < R; r++) { const u = ur[r]; ur[r] = nr; nr += u; }
      for (let i = 0; i < cell.length; i++) { const v = cell[i]; if (v >= 0) { X[v] = pad + uc[i % C] * cw + o.nodeW / 2; Y[v] = pad + ur[(i / C) | 0] * ch + o.nodeH / 2; } }
      bw[k] = nc * cw - o.gap + 2 * pad; bh[k] = nr * ch - o.gap + 2 * pad;
    }
    colW.fill(0); rowH.fill(0);
    for (let i = 0; i < st.outer.length; i++) { const k = st.outer[i]; if (k >= 0) { const c = i % oc, r = (i / oc) | 0; if (bw[k] > colW[c]) colW[c] = bw[k]; if (bh[k] > rowH[r]) rowH[r] = bh[k]; } }
    let x = 0, y = 0;
    for (let c = 0; c < oc; c++) { colX[c] = x; if (colW[c]) x += colW[c] + between; }
    for (let r = 0; r < or; r++) { rowY[r] = y; if (rowH[r]) y += rowH[r] + between; }
    for (let i = 0; i < st.outer.length; i++) { const k = st.outer[i]; if (k >= 0) { const c = i % oc, r = (i / oc) | 0; bx[k] = colX[c] + (colW[c] - bw[k]) / 2; by[k] = rowY[r] + (rowH[r] - bh[k]) / 2; } }
    for (let v = 0; v < N; v++) { X[v] += bx[grp[v]]; Y[v] += by[grp[v]]; }
  }
  const E = g.edges, flowW = o.flow * 0.5, crossW = o.cross * 14;
  function score(st, withCrossings) {
    geom(st);
    let s = 0;
    for (const [a, b] of E) {
      const dx = Math.abs(X[a] - X[b]), dy = Math.abs(Y[a] - Y[b]);
      s += dx + dy + (dx > 1 && dy > 1 ? 30 : 0);
      if (flowW) s += flowW * Math.max(0, down ? Y[a] - Y[b] + ch : X[a] - X[b] + cw);
    }
    if (withCrossings && crossW) s += crossW * straightCrossings(E, X, Y);
    return s;
  }
  const fileOrder = () => ({
    cell: members.map((m, k) => { const c = new Int32Array(cols[k] * rows[k]).fill(-1); m.forEach((v, i) => { c[i] = v; }); return c; }),
    outer: (() => { const c = new Int32Array(oc * or).fill(-1); for (let k = 0; k < K; k++) c[k] = k; return c; })(),
  });
  const copy = (st) => ({ cell: st.cell.map((c) => c.slice()), outer: st.outer.slice() });
  const shuffle = (arr, rand) => { for (let i = arr.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0, t = arr[i]; arr[i] = arr[j]; arr[j] = t; } };

  function attempt(seed) {
    const rand = rng(seed * 7919 + 13), st = fileOrder();
    st.cell.forEach((c) => shuffle(c, rand)); shuffle(st.outer, rand);
    let cur = score(st, false);
    const swapOnce = (temp, full) => {
      let arr;
      if (K > 1 && rand() < 0.2) arr = st.outer;
      else { arr = st.cell[grp[(rand() * N) | 0]]; if (arr.length < 2) return; }
      const i = (rand() * arr.length) | 0; let j = (rand() * (arr.length - 1)) | 0; if (j >= i) j++;
      if (arr[i] < 0 && arr[j] < 0) return;
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      const next = score(st, full), d = next - cur;
      if (d <= 0 || (temp > 0 && rand() < Math.exp(-d / temp))) cur = next;
      else { arr[j] = arr[i]; arr[i] = t; }
    };
    const n1 = Math.min(5000, 250 + 45 * N);
    for (let i = 0; i < n1; i++) swapOnce(60 * Math.pow(1 / 60, i / n1), false);   // cooling: fewer uphill swaps as it goes
    cur = score(st, true);
    if (crossW) { const n2 = 60 + 5 * N; for (let i = 0; i < n2; i++) swapOnce(0, true); }
    return { st, score: score(st, true) };
  }

  // A try depends only on its seed and these settings, so it is kept and not run twice.
  const key = [o.nodeW, o.nodeH, o.gap, o.dir, o.aspect, o.flow, o.cross].join(' ');
  let memo = done.get(g);
  if (!memo || memo.key !== key) done.set(g, memo = { key, tries: new Map() });
  const tries = [];
  let best = 0;
  for (let t = 0; t < o.tries; t++) {
    const seed = o.seed + t;
    if (!memo.tries.has(seed)) memo.tries.set(seed, attempt(seed));
    tries.push(memo.tries.get(seed)); if (tries[t].score < tries[best].score) best = t;
  }

  const picture = (st) => {
    geom(st);
    const pos = [], boxes = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let v = 0; v < N; v++) { x0 = Math.min(x0, X[v]); x1 = Math.max(x1, X[v]); y0 = Math.min(y0, Y[v]); y1 = Math.max(y1, Y[v]); }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (let v = 0; v < N; v++) pos.push([X[v] - mx, Y[v] - my]);
    if (boxed) for (let k = 0; k < K; k++) boxes.push({ x: bx[k] - mx, y: by[k] - my, w: bw[k], h: bh[k], k });
    return { pos, boxes };
  };
  const straight = (pos) => E.map(([s, t]) => ({ pts: [pos[s], pos[t]], kind: 'line', turned: false, mark: false }));
  const pos0 = inputGrid(N, o), start = picture(fileOrder()), end = picture(tries[best].st);
  const routes = routeOrtho(g, end.pos, end.boxes, o);
  const snaps = [
    { pos: pos0, edges: straight(pos0), boxes: [] },
    { pos: start.pos, edges: straight(start.pos), boxes: start.boxes },
    { pos: end.pos, edges: straight(end.pos), boxes: end.boxes },
    { pos: end.pos, edges: routes.map((pts) => ({ pts, kind: 'ortho', turned: false, mark: false })), boxes: end.boxes },
  ];
  for (const s of snaps) { s.bands = []; s.dots = false; s.bbox = bounds(s.pos, o, s.boxes); }
  return { stages: SEARCH_STAGES, snaps, facts: { tries: tries.map((t) => Math.round(t.score)), best, firstScore: Math.round(score(fileOrder(), true)) }, thumbs: tries.map((t) => picture(t.st).pos) };
}
