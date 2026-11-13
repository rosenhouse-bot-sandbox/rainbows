// The real engines. ELK is elkjs (ELK compiled to JavaScript); TALA is inside D2's WebAssembly
// build, @d2lang/d2. Both are loaded from a CDN only when asked for, and each gives only its
// finished layout, so there are no steps to play: the picture goes from the input to the result.
//
// This file turns the page's graph and settings into each engine's input, and each engine's
// answer back into the page's picture. The engines themselves are not in this repository.

import { inputGrid, bounds, pointAlong } from './common.js';

export const ELK_URL = 'https://cdn.jsdelivr.net/npm/elkjs@0.12.1/lib/elk.bundled.js';
export const D2_URL = 'https://cdn.jsdelivr.net/npm/@d2lang/d2@0.1.34/dist/browser/index.js';
export const REAL_STAGES = ['input', 'real'];

const boxed = (g, o) => g.groups.length > 0 && o.grp === 'box';

// ---- ELK ----
export function elkInput(g, o) {
  const pad = 13, opts = {
    'elk.algorithm': 'layered',
    'elk.direction': o.dir === 'right' ? 'RIGHT' : 'DOWN',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.spacing.nodeNode': String(o.gap),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(o.lgap),
    'elk.layered.cycleBreaking.strategy': { greedy: 'GREEDY', dfs: 'DEPTH_FIRST', file: 'MODEL_ORDER' }[o.cyc],
    'elk.layered.layering.strategy': { longest: 'LONGEST_PATH', tight: 'NETWORK_SIMPLEX', width: 'COFFMAN_GRAHAM' }[o.lay],
    'elk.layered.layering.coffmanGraham.layerBound': String(o.wmax),
    'elk.layered.crossingMinimization.strategy': o.sweeps > 0 ? 'LAYER_SWEEP' : 'NONE',
    'elk.layered.thoroughness': String(Math.max(1, o.sweeps)),
    'elk.edgeRouting': { ortho: 'ORTHOGONAL', poly: 'POLYLINE', curve: 'SPLINES' }[o.rt],
    'elk.aspectRatio': String(o.aspect),
    'elk.padding': `[top=${pad},left=${pad},bottom=${pad},right=${pad}]`,
  };
  const node = (v) => ({ id: 'n' + v, width: o.nodeW, height: o.nodeH });
  let children;
  if (boxed(g, o)) {
    children = g.groups.map((_, k) => ({ id: 'g' + k, layoutOptions: opts, children: [] }));
    g.group.forEach((k, v) => children[Math.max(0, k)].children.push(node(v)));
  } else children = g.names.map((_, v) => node(v));
  return { id: 'root', layoutOptions: { ...opts, 'elk.padding': '[top=0,left=0,bottom=0,right=0]' }, children, edges: g.edges.map(([s, t], e) => ({ id: 'e' + e, sources: ['n' + s], targets: ['n' + t], labels: o.labels ? [{ id: 'l' + e, text: o.labels[e].text, width: o.labels[e].w, height: o.labels[e].h }] : [] })) };
}
export function elkPicture(g, o, out) {
  const origin = new Map([['root', [0, 0]]]), pos = new Array(g.n), boxes = [], edges = new Array(g.edges.length), labels = [];
  const walk = (node, ox, oy) => {
    for (const c of node.children || []) {
      const x = ox + c.x, y = oy + c.y;
      origin.set(c.id, [x, y]);
      if (c.id[0] === 'n') pos[Number(c.id.slice(1))] = [x + c.width / 2, y + c.height / 2];
      else boxes.push({ x, y, w: c.width, h: c.height, k: Number(c.id.slice(1)) });
      walk(c, x, y);
    }
  };
  walk(out, 0, 0);
  // an edge's points are measured from the corner of the node that holds it
  const collect = (node) => {
    for (const e of node.edges || []) {
      const [ox, oy] = origin.get(e.container || node.id) || [0, 0], i = Number(e.id.slice(1)), pts = [];
      for (const s of e.sections || []) { pts.push(s.startPoint, ...(s.bendPoints || []), s.endPoint); }
      const p = pts.map((q) => [q.x + ox, q.y + oy]);
      for (const l of e.labels || []) if (l.x !== undefined) labels.push({ x: l.x + ox + l.width / 2, y: l.y + oy + l.height / 2, w: l.width, h: l.height, text: l.text, e: i });
      const curve = o.rt === 'curve' && p.length >= 4 && (p.length - 1) % 3 === 0;
      if (p.length >= 2) edges[i] = { pts: p, kind: curve ? 'curve' : o.rt === 'ortho' ? 'ortho' : 'poly', turned: false, mark: false };
    }
    for (const c of node.children || []) collect(c);
  };
  collect(out);
  return centre(g, { pos, edges, boxes, labels });
}

// ---- TALA, through D2 ----
// The graph as D2 text. Names are the page's own (n0, g0), and a label is quoted with its quotes
// and backslashes escaped, so nothing from the file is read as D2.
export function d2Source(g, o) {
  const q = (s) => '"' + String(s).replace(/[\\"$\n\r]/g, ' ') + '"';
  const seeds = []; for (let i = 0; i < o.tries; i++) seeds.push(o.seed + i);
  const lines = ['vars: { d2-config: { data: { tala-seeds: [' + seeds.join('; ') + '] } } }', 'direction: ' + (o.dir === 'right' ? 'right' : 'down')];
  const node = (v) => `n${v}: ${q(g.labels[v])} { width: ${o.nodeW}; height: ${o.nodeH} }`;
  const id = (v) => (g.groups.length ? 'g' + Math.max(0, g.group[v]) + '.' : '') + 'n' + v;
  if (g.groups.length) g.groups.forEach((_, k) => { lines.push(`g${k}: "" {`); g.group.forEach((x, v) => { if (Math.max(0, x) === k) lines.push('  ' + node(v)); }); lines.push('}'); });
  else for (let v = 0; v < g.n; v++) lines.push(node(v));
  g.edges.forEach(([s, t], e) => lines.push(id(s) + ' -> ' + id(t) + (o.labels ? ': ' + q(o.labels[e].text) + ' { style.font-size: 10 }' : '')));
  return lines.join('\n') + '\n';
}
export function d2Picture(g, o, diagram) {
  const pos = new Array(g.n), boxes = [], edges = new Array(g.edges.length), labels = [], num = (id) => Number(id.split('.').pop().slice(1));
  for (const s of diagram.shapes) {
    const leaf = s.id.split('.').pop();
    if (leaf[0] === 'n') pos[num(s.id)] = [s.pos.x + s.width / 2, s.pos.y + s.height / 2];
    else boxes.push({ x: s.pos.x, y: s.pos.y, w: s.width, h: s.height, k: num(s.id) });
  }
  const want = new Map(g.edges.map(([s, t], e) => [s * g.n + t, e]));
  for (const c of diagram.connections) {
    const e = want.get(num(c.src) * g.n + num(c.dst));
    if (e === undefined) continue;
    edges[e] = { pts: c.route.map((p) => [p.x, p.y]), kind: 'ortho', turned: false, mark: false };
    if (c.label && c.labelPosition) labels.push({ ...d2Label(edges[e].pts, c), e });
  }
  return centre(g, { pos, edges, boxes, labels });
}

// Where D2 puts a label on a route: a named position (a quarter, half or three quarters of the way
// along, or a free fraction), on the line or to one side of it. This follows GetPointOnRoute in
// D2's lib/label.
function d2Label(pts, c) {
  const name = c.labelPosition, w = c.labelWidth, h = c.labelHeight;
  const f = name.startsWith('UNLOCKED') ? c.labelPercentage : name.endsWith('LEFT') ? 0.25 : name.endsWith('RIGHT') ? 0.75 : 0.5;
  const { p, i } = pointAlong(pts, f);
  if (!name.includes('MIDDLE')) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, side = name.includes('TOP') ? -1 : 1;
    p[0] += side * (a[1] - b[1]) / len * (1 + 5 + w / 2); p[1] += side * (b[0] - a[0]) / len * (1 + 5 + h / 2);   // half the stroke, D2's padding, half the label
  }
  return { x: p[0], y: p[1], w, h, text: c.label };
}

function centre(g, pic) {
  for (let v = 0; v < g.n; v++) if (!pic.pos[v]) throw new Error('The engine returned no place for ' + g.names[v]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pic.pos) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  for (const p of pic.pos) { p[0] -= mx; p[1] -= my; }
  for (const e of pic.edges) if (e) for (const p of e.pts) { p[0] -= mx; p[1] -= my; }
  for (const b of pic.boxes) { b.x -= mx; b.y -= my; }
  for (const l of pic.labels) { l.x -= mx; l.y -= my; }
  // an edge the engine gave no path for is drawn straight
  g.edges.forEach(([s, t], e) => { if (!pic.edges[e]) pic.edges[e] = { pts: [pic.pos[s].slice(), pic.pos[t].slice()], kind: 'line', turned: false, mark: false }; });
  pic.boxes.sort((a, b) => a.k - b.k);
  return pic;
}

// The two pictures the page moves between: the input, and the engine's result.
export function realLayout(g, o, pic, waiting) {
  const pos0 = inputGrid(g.n, o);
  const input = () => ({ pos: pos0, edges: g.edges.map(([s, t]) => ({ pts: [pos0[s], pos0[t]], kind: 'line', turned: false, mark: false })), boxes: [] });
  const snaps = [input(), waiting ? input() : { pos: pic.pos, edges: pic.edges, boxes: pic.boxes, labels: pic.labels }];
  for (const s of snaps) { s.bands = []; s.dots = false; s.labels = s.labels || []; s.bbox = bounds(s.pos, o, s.boxes.concat(s.labels.map((l) => ({ x: l.x - l.w / 2, y: l.y - l.h / 2, w: l.w, h: l.h })))); }
  return { stages: REAL_STAGES, snaps, facts: {}, real: true, waiting: !!waiting };
}

// ---- loading (in the browser) ----
let elk = null, d2 = null;
function loadElk() {
  if (!elk) elk = new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = ELK_URL; s.crossOrigin = 'anonymous';
    s.onload = () => (globalThis.ELK ? ok(new globalThis.ELK()) : bad(new Error('ELK did not start')));
    s.onerror = () => { elk = null; bad(new Error('ELK could not be loaded')); };
    document.head.append(s);
  });
  return elk;
}
function loadD2() {
  if (!d2) d2 = import(D2_URL).then((m) => new m.D2(), (e) => { d2 = null; throw e; });
  return d2;
}
// Stop a TALA run that is no longer wanted: its worker is shut down and a new one starts next time.
export function cancelD2() { const old = d2; d2 = null; if (old) old.then((x) => x.dispose && x.dispose(), () => {}); }
export async function runReal(g, o) {
  if (o.m === 'layered') return realLayout(g, o, elkPicture(g, o, await (await loadElk()).layout(elkInput(g, o))));
  const out = await (await loadD2()).compile(d2Source(g, o), { layout: 'tala' });
  return realLayout(g, o, d2Picture(g, o, out.diagram));
}
