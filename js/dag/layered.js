// A layered layout (the Sugiyama method), in the five phases that ELK Layered also uses: break
// cycles, assign layers, order each layer, place the nodes, route the edges. This is written for
// this page and is not ELK's code. Where a phase here is simpler than ELK's, the README says so.
//
// The work is done in two abstract directions: `a` runs along a layer and `c` runs across the
// layers. For "down" a is x and c is y; for "right" they swap.

import { inputGrid, along, bounds } from './common.js';
import { routeOrtho } from './route.js';

export const LAYERED_STAGES = ['input', 'cycles', 'layers', 'order', 'place', 'route'];

// 1. Which edges to turn round so that no cycle is left.
export function breakCycles(g, how) {
  const n = g.n, E = g.edges, rev = E.map(() => false);
  if (how === 'file') { E.forEach(([s, t], i) => { rev[i] = t < s; }); return rev; }
  const out = Array.from({ length: n }, () => []), inn = Array.from({ length: n }, () => []);
  E.forEach(([s, t], i) => { out[s].push(i); inn[t].push(i); });
  if (how === 'dfs') {   // walk along the arrows; an arrow back to a node still being walked closes a cycle
    const state = new Uint8Array(n);
    for (let r = 0; r < n; r++) {
      if (state[r]) continue;
      const stack = [[r, 0]]; state[r] = 1;
      while (stack.length) {
        const top = stack[stack.length - 1], v = top[0];
        if (top[1] >= out[v].length) { state[v] = 2; stack.pop(); continue; }
        const e = out[v][top[1]++], t = E[e][1];
        if (state[t] === 1) rev[e] = true;
        else if (state[t] === 0) { state[t] = 1; stack.push([t, 0]); }
      }
    }
    return rev;
  }
  // greedy (Eades, Lin and Smyth): line the nodes up, taking sinks to the back, sources to the
  // front, and otherwise the node with the most arrows out over arrows in. Arrows that point
  // backwards along the line are turned.
  const gone = new Uint8Array(n), od = out.map((l) => l.length), id = inn.map((l) => l.length), left = [], right = [];
  const take = (v, list) => { gone[v] = 1; list.push(v); for (const e of out[v]) id[E[e][1]]--; for (const e of inn[v]) od[E[e][0]]--; };
  let rest = n;
  while (rest > 0) {
    let moved = true;
    while (moved) {
      moved = false;
      for (let v = 0; v < n; v++) if (!gone[v] && od[v] === 0) { take(v, right); rest--; moved = true; }
      for (let v = 0; v < n; v++) if (!gone[v] && id[v] === 0) { take(v, left); rest--; moved = true; }
    }
    if (rest > 0) {
      let best = -1;
      for (let v = 0; v < n; v++) if (!gone[v] && (best < 0 || od[v] - id[v] > od[best] - id[best])) best = v;
      take(best, left); rest--;
    }
  }
  const rank = new Int32Array(n);
  left.concat(right.reverse()).forEach((v, i) => { rank[v] = i; });
  E.forEach(([s, t], i) => { rev[i] = rank[s] > rank[t]; });
  return rev;
}

// 2. A layer for every node, below everything that points to it.
function topo(n, E) {
  const deg = new Int32Array(n), out = Array.from({ length: n }, () => []);
  for (const [u, v] of E) { deg[v]++; out[u].push(v); }
  const ready = [], order = [];
  for (let v = 0; v < n; v++) if (!deg[v]) ready.push(v);
  while (ready.length) {
    ready.sort((p, q) => p - q);
    const v = ready.shift(); order.push(v);
    for (const w of out[v]) if (--deg[w] === 0) ready.push(w);
  }
  return order;
}
export function assignLayers(n, E, o) {
  const layer = new Int32Array(n), ins = Array.from({ length: n }, () => []), outs = Array.from({ length: n }, () => []);
  for (const [u, v] of E) { ins[v].push(u); outs[u].push(v); }
  const count = [];
  for (const v of topo(n, E)) {
    let l = 0;
    for (const u of ins[v]) l = Math.max(l, layer[u] + 1);
    if (o.lay === 'width') while ((count[l] || 0) >= o.wmax) l++;   // a full layer sends the node one further down
    layer[v] = l; count[l] = (count[l] || 0) + 1;
  }
  if (o.lay === 'tight') {
    // Move a node towards the side where it has more edges, as far as its neighbours allow. Every
    // move shortens the edges in total, so this stops. ELK reaches the true shortest total with the
    // network simplex method; this local search can stop short of it.
    for (let changed = true, it = 0; changed && it < 200; it++) {
      changed = false;
      for (let v = 0; v < n; v++) {
        let lo = -Infinity, hi = Infinity;
        for (const u of ins[v]) lo = Math.max(lo, layer[u] + 1);
        for (const w of outs[v]) hi = Math.min(hi, layer[w] - 1);
        if (outs[v].length > ins[v].length && hi !== Infinity && hi > layer[v]) { layer[v] = hi; changed = true; }
        else if (ins[v].length > outs[v].length && lo !== -Infinity && lo < layer[v]) { layer[v] = lo; changed = true; }
      }
    }
  }
  const used = [...new Set(layer)].sort((p, q) => p - q);   // close up empty layers
  for (let v = 0; v < n; v++) layer[v] = used.indexOf(layer[v]);
  return layer;
}

// 3. Sort each layer by where its neighbours sit in the layer before (then the layer after), and
// keep the ordering with the fewest crossings seen so far.
function crossingsBetween(layers, down, pos) {
  let c = 0;
  for (const l of layers) {
    const pairs = [];
    for (const u of l) for (const v of down[u]) pairs.push([pos[u], pos[v]]);
    for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) if ((pairs[i][0] - pairs[j][0]) * (pairs[i][1] - pairs[j][1]) < 0) c++;
  }
  return c;
}
function sortLayers(first, up, down, passes) {
  const pos = [], cur = first.map((l) => l.slice());
  const index = (l) => l.forEach((v, i) => { pos[v] = i; });
  cur.forEach(index);
  let best = cur.map((l) => l.slice()), bestC = crossingsBetween(cur, down, pos);
  for (let p = 0; p < passes && bestC > 0; p++) {
    const downward = p % 2 === 0, L = cur.length, nb = downward ? up : down;
    for (let k = 1; k < L; k++) {
      const l = downward ? k : L - 1 - k;
      const keyed = cur[l].map((v, i) => { let s = 0; for (const u of nb[v]) s += pos[u]; return { v, i, k: nb[v].length ? s / nb[v].length : i }; });
      keyed.sort((p1, p2) => p1.k - p2.k || p1.i - p2.i);
      cur[l] = keyed.map((q) => q.v); index(cur[l]);
    }
    const c = crossingsBetween(cur, down, pos);
    if (c < bestC) { bestC = c; best = cur.map((l) => l.slice()); }
  }
  return best;
}

// 4. Slide the nodes along their layers until connected nodes line up. Each layer in turn is
// moved to the positions closest to the average of its neighbours that keep the nodes apart and
// in order (isotonic regression). ELK's default here is the Brandes and Köpf method.
function isotonic(y, w) {
  const v = [], wt = [], cnt = [];
  for (let i = 0; i < y.length; i++) {
    v.push(y[i]); wt.push(w[i]); cnt.push(1);
    while (v.length > 1 && v[v.length - 2] > v[v.length - 1]) {
      const b = v.pop(), bw = wt.pop(), bc = cnt.pop(), k = v.length - 1;
      v[k] = (v[k] * wt[k] + b * bw) / (wt[k] + bw); wt[k] += bw; cnt[k] += bc;
    }
  }
  const out = [];
  for (let k = 0; k < v.length; k++) for (let j = 0; j < cnt[k]; j++) out.push(v[k]);
  return out;
}
function align(layers, a, n, up, down, sep) {
  const dummy = (v) => v >= n, pull = (u, v) => (dummy(u) && dummy(v) ? 8 : dummy(u) || dummy(v) ? 2 : 1);
  const relax = (l, useUp, useDown) => {
    const vs = layers[l], y = [], w = [], off = [0];
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (i) off[i] = off[i - 1] + sep(vs[i - 1], v);
      let s = 0, ws = 0;
      if (useUp) for (const u of up[v]) { const k = pull(u, v); s += k * a[u]; ws += k; }
      if (useDown) for (const u of down[v]) { const k = pull(u, v); s += k * a[u]; ws += k; }
      if (ws === 0) { y.push(a[v] - off[i]); w.push(1e-3); } else { y.push(s / ws - off[i]); w.push(ws); }
    }
    const z = isotonic(y, w);
    for (let i = 0; i < vs.length; i++) a[vs[i]] = z[i] + off[i];
  };
  const L = layers.length;
  for (let it = 0; it < 10; it++) {
    for (let l = 1; l < L; l++) relax(l, true, false);
    for (let l = L - 2; l >= 0; l--) relax(l, false, true);
  }
  for (let it = 0; it < 3; it++) for (let l = 0; l < L; l++) relax(l, true, true);
  return a;
}

// One connected piece of the graph, through phases 2 to 5. n nodes, E its edges after turning.
function layoutPiece(n, E, o, S) {
  const lay = Array.from(assignLayers(n, E, o));
  // an edge that passes over layers gets a point (numbered from n up) in each layer it passes
  const chains = E.map(([u, v]) => { const ch = [u]; for (let l = lay[u] + 1; l < lay[v]; l++) { lay.push(l); ch.push(lay.length - 1); } ch.push(v); return ch; });
  const M = lay.length, L = Math.max(...lay) + 1;
  const up = Array.from({ length: M }, () => []), down = Array.from({ length: M }, () => []);
  for (const ch of chains) for (let k = 0; k + 1 < ch.length; k++) { down[ch[k]].push(ch[k + 1]); up[ch[k + 1]].push(ch[k]); }
  const first = Array.from({ length: L }, () => []);
  for (let v = 0; v < M; v++) first[lay[v]].push(v);
  const ordered = sortLayers(first, up, down, o.sweeps);

  const sep = (u, v) => ((u < n ? S.sa[u] : 0) + (v < n ? S.sa[v] : 0)) / 2 + (u < n && v < n ? S.gap : S.gap * 0.55);
  const packed = (layers) => {
    const a = new Float64Array(M);
    for (const l of layers) { let x = 0; l.forEach((v, i) => { if (i) x += sep(l[i - 1], v); a[v] = x; }); for (const v of l) a[v] -= x / 2; }
    return a;
  };
  const a2 = packed(first), a3 = packed(ordered), a4 = align(ordered, a3.slice(), n, up, down, sep);
  let lo = Infinity, hi = -Infinity;
  for (let v = 0; v < M; v++) { lo = Math.min(lo, a4[v]); hi = Math.max(hi, a4[v]); }
  for (let v = 0; v < M; v++) a4[v] -= (lo + hi) / 2;

  // 5. Where each edge leaves and enters its nodes, spread along the node's side in the order of
  // where the edges are going, so that they do not cross at the node.
  const outs = Array.from({ length: n }, () => []), ins = Array.from({ length: n }, () => []);
  chains.forEach((ch, e) => { outs[ch[0]].push(e); ins[ch[ch.length - 1]].push(e); });
  const pOut = new Float64Array(E.length), pIn = new Float64Array(E.length);
  const spread = (list, key, store, v) => {
    list.sort((p, q) => key(p) - key(q));
    const m = list.length, step = m > 1 ? Math.min(8, (S.sa[v] - 12) / (m - 1)) : 0;
    list.forEach((e, k) => { store[e] = a4[v] + (k - (m - 1) / 2) * step; });
  };
  for (let v = 0; v < n; v++) { spread(outs[v], (e) => a4[chains[e][1]], pOut, v); spread(ins[v], (e) => a4[chains[e][chains[e].length - 2]], pIn, v); }

  // the pieces of edge in each gap between layers
  const segs = Array.from({ length: Math.max(0, L - 1) }, () => []);
  chains.forEach((ch, e) => { for (let k = 0; k + 1 < ch.length; k++) segs[lay[ch[k]]].push({ e, k, a1: k === 0 ? pOut[e] : a4[ch[k]], a2: k === ch.length - 2 ? pIn[e] : a4[ch[k + 1]], t: -1 }); });
  const tracks = segs.map(() => 0);
  if (o.rt === 'ortho') {
    // Each piece that moves sideways runs along a track in the gap. Of two pieces, the one whose
    // order gives fewer crossings goes nearer the layer above; pieces that do not overlap share a track.
    const inside = (x, s) => x > Math.min(s.a1, s.a2) + 0.25 && x < Math.max(s.a1, s.a2) - 0.25;
    const cost = (p, q) => (inside(q.a1, p) ? 1 : 0) + (inside(p.a2, q) ? 1 : 0);   // crossings if p is above q
    segs.forEach((list, l) => {
      const need = list.filter((s) => Math.abs(s.a1 - s.a2) > 0.5);
      need.sort((p, q) => cost(p, q) - cost(q, p) || p.a1 - q.a1);
      need.forEach((s, i) => {
        let t = 0;
        for (let j = 0; j < i; j++) { const r = need[j]; if (Math.min(s.a1, s.a2) <= Math.max(r.a1, r.a2) + 5 && Math.min(r.a1, r.a2) <= Math.max(s.a1, s.a2) + 5) t = Math.max(t, r.t + 1); }
        s.t = t; tracks[l] = Math.max(tracks[l], t + 1);
      });
    });
  }
  const thick = new Array(L).fill(0);   // a layer is as thick as its thickest node
  for (let v = 0; v < n; v++) thick[lay[v]] = Math.max(thick[lay[v]], S.sc[v]);
  const top = [0];
  for (let l = 0; l + 1 < L; l++) top.push(top[l] + thick[l] + Math.max(S.layerGap, (tracks[l] + 1) * 7));
  const shift = (top[L - 1] + thick[L - 1]) / 2;
  for (let l = 0; l < L; l++) top[l] -= shift;
  const mid = (l) => top[l] + thick[l] / 2, bot = (l) => top[l] + thick[l];
  const leave = (v) => (v < n ? mid(lay[v]) + S.sc[v] / 2 : bot(lay[v])), enter = (v) => (v < n ? mid(lay[v]) - S.sc[v] / 2 : top[lay[v]]);

  const paths = chains.map((ch, e) => {
        if (o.rt === 'poly') return [[pOut[e], leave(ch[0])], ...ch.slice(1, -1).map((d) => [a4[d], mid(lay[d])]), [pIn[e], enter(ch[ch.length - 1])]];
    const pts = [];
    for (let k = 0; k + 1 < ch.length; k++) {
      const l = lay[ch[k]], s = segs[l].find((q) => q.e === e && q.k === k), P = [s.a1, leave(ch[k])], Q = [s.a2, enter(ch[k + 1])];
      if (o.rt === 'ortho') {
        pts.push(P);
        if (s.t >= 0) { const c = bot(l) + (top[l + 1] - bot(l)) * (s.t + 1) / (tracks[l] + 1); pts.push([s.a1, c], [s.a2, c]); }
        pts.push(Q);
      } else {   // a chain of cubic curves: P, then (control, control, point) for each piece
        if (k === 0) pts.push(P);
        else { const R = pts[pts.length - 1]; pts.push([R[0], R[1] + (P[1] - R[1]) / 3], [R[0], R[1] + (P[1] - R[1]) * 2 / 3], P); }
        const h = (Q[1] - P[1]) / 2;
        pts.push([P[0], P[1] + h], [Q[0], Q[1] - h], Q);
      }
    }
    if (o.rt !== 'ortho') return pts;
    return pts.filter((p, i) => i === 0 || i === pts.length - 1 || !(Math.abs(pts[i - 1][0] - p[0]) < 1e-6 && Math.abs(pts[i + 1][0] - p[0]) < 1e-6));
  });

  let a0 = Infinity, a1 = -Infinity;
  for (const a of [a2, a3, a4]) for (let v = 0; v < M; v++) { const h = v < n ? S.sa[v] / 2 : 0; a0 = Math.min(a0, a[v] - h); a1 = Math.max(a1, a[v] + h); }
  return { n, M, L, lay, chains, a: [a2, a3, a4], top, thick, mid, paths, ext: [a0, a1, top[0], top[L - 1] + thick[L - 1]] };
}

// A whole graph, which may be in several pieces: n nodes of sizes w by h, and its edges. Returns
// each node's centre at the Layers, Sort and Align steps, each edge's line at every step, and
// the size of the whole, centred on (0, 0).
function layoutGraph(n, edges, w, h, o) {
  const down = o.dir !== 'right';
  const rev = breakCycles({ n, edges }, o.cyc);
  const dag = edges.map(([s, t], i) => (rev[i] ? [t, s] : [s, t]));

  // connected pieces, each laid out by itself; nodes with no edge at all go in one block
  const comp = new Int32Array(n).fill(-1), adj = Array.from({ length: n }, () => []);
  for (const [s, t] of edges) { adj[s].push(t); adj[t].push(s); }
  const pieces = [], alone = [];
  for (let r = 0; r < n; r++) {
    if (comp[r] >= 0) continue;
    if (!adj[r].length) { comp[r] = -2; alone.push(r); continue; }
    const id = pieces.length, nodes = [], stack = [r]; comp[r] = id;
    while (stack.length) { const v = stack.pop(); nodes.push(v); for (const x of adj[v]) if (comp[x] < 0) { comp[x] = id; stack.push(x); } }
    nodes.sort((p, q) => p - q);
    pieces.push({ nodes, local: new Map(nodes.map((v, i) => [v, i])), edges: [] });
  }
  dag.forEach(([s], e) => pieces[comp[s]].edges.push(e));
  const blocks = [];
  for (const p of pieces) {
    const S = { sa: p.nodes.map((v) => (down ? w[v] : h[v])), sc: p.nodes.map((v) => (down ? h[v] : w[v])), gap: o.gap, layerGap: o.lgap };
    p.out = layoutPiece(p.nodes.length, p.edges.map((e) => [p.local.get(dag[e][0]), p.local.get(dag[e][1])]), o, S);
    p.S = S;
    const [a0, a1, c0, c1] = p.out.ext;
    blocks.push({ p, w: down ? a1 - a0 : c1 - c0, h: down ? c1 - c0 : a1 - a0 });
  }
  let lone = null;
  if (alone.length) {
    const pad = Math.max(10, o.gap * 0.6), cw = Math.max(...alone.map((v) => w[v])) + pad, ch = Math.max(...alone.map((v) => h[v])) + pad;
    const cols = Math.max(1, Math.round(Math.sqrt(alone.length * 1.3 * ch / cw)));
    lone = { cols, cw, ch, pad, w: Math.min(cols, alone.length) * cw - pad, h: Math.ceil(alone.length / cols) * ch - pad };
    blocks.push(lone);
  }
  // pack the blocks in rows, tallest first, towards the shape of the screen
  const between = Math.max(28, o.gap * 1.6);
  let area = 0, widest = 0;
  for (const b of blocks) { area += (b.w + between) * (b.h + between); widest = Math.max(widest, b.w); }
  const limit = Math.max(widest, Math.sqrt(area * o.aspect) * 1.05);
  const order = blocks.slice().sort((p, q) => q.h - p.h || q.w - p.w);
  let x = 0, y = 0, rowH = 0;
  for (const b of order) {
    if (x > 0 && x + b.w > limit) { x = 0; y += rowH + between; rowH = 0; }
    b.x = x; b.y = y; x += b.w + between; rowH = Math.max(rowH, b.h);
  }
  let W = 0, H = 0;
  for (const b of blocks) { W = Math.max(W, b.x + b.w); H = Math.max(H, b.y + b.h); }
  for (const b of blocks) { b.x -= W / 2; b.y -= H / 2; }

  const at = (b, a, c) => { const [a0, , c0] = b.p.out.ext; return down ? [b.x + a - a0, b.y + c - c0] : [b.x + c - c0, b.y + a - a0]; };
  const pos = [];
  for (let k = 0; k < 3; k++) {
    const P = new Array(n);
    for (const b of blocks) if (b.p) b.p.nodes.forEach((v, i) => { P[v] = at(b, b.p.out.a[k][i], b.p.out.mid(b.p.out.lay[i])); });
    alone.forEach((v, i) => { P[v] = [lone.x + (lone.cw - lone.pad) / 2 + (i % lone.cols) * lone.cw, lone.y + (lone.ch - lone.pad) / 2 + Math.floor(i / lone.cols) * lone.ch]; });
    pos.push(P);
  }
  const where = new Map();   // edge -> its block and its number in that block
  for (const b of blocks) if (b.p) b.p.edges.forEach((e, i) => where.set(e, [b, i]));
  const bands = [];
  let bends = 0, layers = 0;
  for (const b of blocks) if (b.p) {
    const t = b.p.out, [a0, a1] = t.ext;
    bends += t.M - t.n; layers = Math.max(layers, t.L);
    for (let l = 0; l < t.L; l++) { const p = at(b, a0 - 8, t.top[l] - 5), q = at(b, a1 + 8, t.top[l] + t.thick[l] + 5); bands.push({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) }); }
  }
  const points = (e) => where.get(e)[0].p.out.chains[where.get(e)[1]].length;
  // the edge's line at step st (2 Layers, 3 Sort, 4 Align, 5 Route), from its source to its target
  const line = (e, st) => {
    const [b, i] = where.get(e), out = b.p.out, ch = out.chains[i];
    const pts = st < 5 ? ch.map((v) => at(b, out.a[st - 2][v], out.mid(out.lay[v]))) : out.paths[i].map((p) => at(b, p[0], p[1]));
    if (rev[e]) pts.reverse();
    return pts;
  };
  return { W, H, pos, rev, bands, bends, layers, points, line };
}

const moved = (pts, d) => pts.map((p) => [p[0] + d[0], p[1] + d[1]]);

// o.grp 'box' on a graph with groups: each group is laid out by itself and becomes a box, the
// boxes are then laid out as if each were one large node, and edges between boxes are routed last
// around the nodes. ELK can do this in one pass (hierarchyHandling: INCLUDE_CHILDREN), with the
// edges between boxes taking part in the layering inside them. This two-level version cannot.
export function layered(g, o) {
  const N = g.n, kindOf = o.rt === 'curve' ? 'curve' : o.rt === 'ortho' ? 'ortho' : 'poly';
  const pos0 = inputGrid(N, o), snaps = [];
  const finish = (snap) => { snap.bbox = bounds(snap.pos, o, snap.bands.concat(snap.boxes)); snaps.push(snap); };
  if (!(o.grp === 'box' && g.groups.length)) {
    const G = layoutGraph(N, g.edges, new Array(N).fill(o.nodeW), new Array(N).fill(o.nodeH), o);
    for (let st = 0; st < 6; st++) {
      const pos = st < 2 ? pos0 : G.pos[Math.min(st, 4) - 2];
      const edges = g.edges.map(([s, t], e) => ({
        pts: st < 2 ? along(pos[s], pos[t], G.points(e)) : G.line(e, st), kind: st < 5 ? 'line' : kindOf,
        turned: G.rev[e] && st >= 1 && st < 5, mark: G.rev[e] && st >= 1,
      }));
      finish({ pos, edges, boxes: [], bands: st >= 2 ? G.bands : [], dots: st >= 2 && st <= 4 });
    }
    return { stages: LAYERED_STAGES, snaps, facts: { reversed: G.rev.filter(Boolean).length, layers: G.layers, bends: G.bends }, rev: G.rev, grouped: false };
  }

  const K = g.groups.length, pad = 13;
  const members = Array.from({ length: K }, () => []), local = new Int32Array(N);
  g.group.forEach((k, v) => { local[v] = members[Math.max(0, k)].length; members[Math.max(0, k)].push(v); });
  const grp = g.group.map((k) => Math.max(0, k));
  const innerEdges = Array.from({ length: K }, () => []), innerOf = new Int32Array(g.edges.length).fill(-1);
  const between = [], pairOf = new Map(), crossOf = new Int32Array(g.edges.length).fill(-1);
  g.edges.forEach(([s, t], e) => {
    if (grp[s] === grp[t]) { innerOf[e] = innerEdges[grp[s]].length; innerEdges[grp[s]].push([local[s], local[t]]); return; }
    const key = grp[s] * K + grp[t];
    if (!pairOf.has(key)) { pairOf.set(key, between.length); between.push([grp[s], grp[t]]); }
    crossOf[e] = pairOf.get(key);
  });
  const inner = members.map((m, k) => layoutGraph(m.length, innerEdges[k], new Array(m.length).fill(o.nodeW), new Array(m.length).fill(o.nodeH), o));
  const outer = layoutGraph(K, between, inner.map((G) => G.W + 2 * pad), inner.map((G) => G.H + 2 * pad), { ...o, gap: o.gap + 14, lgap: Math.max(o.lgap, 30) });
  const rev = g.edges.map((_, e) => (innerOf[e] >= 0 ? inner[grp[g.edges[e][0]]].rev[innerOf[e]] : outer.rev[crossOf[e]]));

  const place = (st) => { const O = outer.pos[st - 2]; return { O, pos: grp.map((k, v) => [O[k][0] + inner[k].pos[st - 2][local[v]][0], O[k][1] + inner[k].pos[st - 2][local[v]][1]]) }; };
  const end = place(4);
  const boxesAt = (O) => O.map((c, k) => ({ x: c[0] - inner[k].W / 2 - pad, y: c[1] - inner[k].H / 2 - pad, w: inner[k].W + 2 * pad, h: inner[k].H + 2 * pad, k }));
  const cross = [];
  g.edges.forEach((_, e) => { if (innerOf[e] < 0) cross.push(e); });
  const routes = routeOrtho(g, end.pos, boxesAt(end.O), o, cross);
  let bends = 0;
  for (const G of inner) bends += G.bends;
  for (let st = 0; st < 6; st++) {
    const P = st < 2 ? null : place(Math.min(st, 4)), pos = P ? P.pos : pos0;
    const edges = g.edges.map(([s, t], e) => {
      const k = grp[s], i = innerOf[e], flags = { turned: rev[e] && st >= 1 && st < 5, mark: rev[e] && st >= 1 };
      if (i < 0) return st < 5 ? { pts: [pos[s], pos[t]], kind: 'line', ...flags } : { pts: routes[e], kind: 'ortho', ...flags };
      return { pts: st < 2 ? along(pos[s], pos[t], inner[k].points(i)) : moved(inner[k].line(i, st), P.O[k]), kind: st < 5 ? 'line' : kindOf, ...flags };
    });
    const bands = [];
    if (P) inner.forEach((G, k) => { for (const b of G.bands) bands.push({ x: b.x + P.O[k][0], y: b.y + P.O[k][1], w: b.w, h: b.h }); });
    finish({ pos, edges, boxes: P ? boxesAt(P.O) : [], bands, dots: st >= 2 && st <= 4 });
  }
  return { stages: LAYERED_STAGES, snaps, facts: { reversed: rev.filter(Boolean).length, layers: outer.layers, bends }, rev, grouped: true };
}
