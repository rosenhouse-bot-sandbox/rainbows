// Graph layout: the page. It runs one of the two layouts, keeps the picture of each step, and
// moves the drawing between them. The canvas shows nodes and edges; every word and number is in
// the panel beside it.

import { SAMPLES, parseTopology } from './graphs.js';
import { layered } from './layered.js';
import { gridSearch } from './search.js';
import { measure, midLabels, labelsCovered } from './common.js';
import { runReal, cancelD2, realLayout } from './real.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view'), ctx = canvas.getContext('2d');
const still = matchMedia('(prefers-reduced-motion: reduce)');
const NODE_H = 26;
const GROUP = ['#7aa2ff', '#5fd4c4', '#f2c94c', '#c792ea', '#8bd46e', '#ff9ecb', '#e8a15a', '#6ec6ff', '#b9c27a'];
const LABEL_FONT = '10px "Source Sans 3", "Segoe UI", Roboto, sans-serif';
const PLAIN = '#9fb4ff', EDGE = '#aab6d6', TURNED = '#ff5d73', INK = '#eaf0ff';

// What can be set. Each is read from the address after # and written back to it.
const CONTROLS = [
  { id: 'eng', stage: 0, label: 'Engine', options: [['own', 'Step by step'], ['real', '']] },
  { id: 'cyc', m: 'layered', stage: 1, label: 'Edges to turn', options: [['greedy', 'Greedy'], ['dfs', 'Depth first'], ['file', 'File order']] },
  { id: 'grp', m: 'layered', stage: 2, label: 'Groups', options: [['box', 'Boxes'], ['colour', 'Colour only']], only: () => graph && graph.groups.length > 0 },
  { id: 'lay', m: 'layered', stage: 2, label: 'Layer for each node', options: [['longest', 'Longest path'], ['tight', 'Short edges'], ['width', 'Width limit']] },
  { id: 'wmax', m: 'layered', stage: 2, label: 'Most nodes in a layer', min: 1, max: 10, only: () => P.lay === 'width' },
  { id: 'sw', m: 'layered', stage: 3, label: 'Sorting passes', min: 0, max: 10 },
  { id: 'seed', m: 'search', stage: 2, label: 'Seed', min: 1, max: 40 },
  { id: 'tries', m: 'search', stage: 2, label: 'Tries', min: 1, max: 12 },
  { id: 'flow', m: 'search', own: true, stage: 2, label: () => 'Point edges ' + P.dir, min: 0, max: 10 },
  { id: 'cross', m: 'search', own: true, stage: 2, label: 'Avoid crossings', min: 0, max: 10 },
  { id: 'rt', m: 'layered', stage: 5, label: 'Edge shape', options: [['ortho', 'Right angles'], ['poly', 'Straight'], ['curve', 'Curved']] },
  { id: 'gap', stage: { layered: 4, search: 2 }, label: 'Space between nodes', min: 8, max: 60, only: () => !(P.eng === 'real' && P.m === 'search') },
  { id: 'lgap', m: 'layered', stage: 4, label: 'Space between layers', min: 20, max: 100 },
  { id: 'dir', stage: { layered: 2, search: 2 }, label: 'Direction', options: [['down', 'Down'], ['right', 'Right']] },
  { id: 'lab', stage: { layered: 5, search: 3 }, label: 'Edge labels', options: [['off', 'Off'], ['on', 'Source to target']] },
];
const P = { g: 'topology', m: 'layered', eng: 'own', grp: 'box', cyc: 'greedy', lay: 'longest', wmax: 4, sw: 6, seed: 1, tries: 3, flow: 3, cross: 5, rt: 'ortho', gap: 22, lgap: 44, dir: 'down', lab: 'off' };
const STAGE_NAME = { input: 'Input', cycles: 'Turn', layers: 'Layers', order: 'Sort', place: 'Align', route: 'Route', boxes: 'Group', search: 'Search', real: 'Result' };
const NOTE = {
  layered: 'The five steps of ELK Layered, written again for this page. This is not ELK’s own code.',
  search: 'Not TALA’s code. Real TALA first finds trees, hubs, clusters and layered parts, then places and routes. This simpler search keeps its outline: boxes, seeded tries, the best score, right-angle edges.',
};

const REAL_NAME = { layered: 'Real ELK', search: 'Real TALA · 11 MB' };
const REAL_NOTE = {
  layered: 'This is the real ELK: elkjs 0.12.1, loaded from jsDelivr. It gives the finished layout only, not the steps.',
  search: 'This is the real TALA, inside D2’s WebAssembly build (@d2lang/d2 0.1.34), loaded from jsDelivr. It gives the finished layout only.',
};
let toEnd = false, job = 0, working = '', workT = 0, workTimer = 0, tookS = 0, wait = 0;
let graph = null, layout = null, stage = 0, q = 0, mix = 1, from = null, shown = null;
let playing = false, dwell = 0, hot = -1, dirty = false, raf = 0, lastT = 0, view = { s: 1, tx: 0, ty: 0 }, lastAspect = 0;
const graphs = new Map();

// ---- the address ----
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (SAMPLES.some((s) => s.id === h.get('g'))) P.g = h.get('g');
  if (h.get('m') === 'layered' || h.get('m') === 'search') P.m = h.get('m');
  for (const c of CONTROLS) {
    const v = h.get(c.id);
    if (v === null) continue;
    if (c.options) { if (c.options.some((o) => o[0] === v)) P[c.id] = v; }
    else if (/^\d+$/.test(v)) P[c.id] = Math.min(c.max, Math.max(c.min, Number(v)));
  }
  return /^\d$/.test(h.get('st') || '') ? Number(h.get('st')) : -1;
}
function writeHash() {
  const h = new URLSearchParams({ g: P.g, m: P.m, st: String(stage) });
  for (const c of CONTROLS) if (!c.m || c.m === P.m) h.set(c.id, String(P[c.id]));
  history.replaceState(null, '', '#' + h.toString());
}

// ---- layout ----
function area() {   // the part of the screen the panel leaves free
  const W = innerWidth, H = innerHeight, r = $('panel').getBoundingClientRect();
  return W >= 900 ? { x: r.right + 20, y: 20, w: Math.max(50, W - r.right - 40), h: H - 40 } : { x: 12, y: 62, w: W - 24, h: Math.max(50, r.top - 72) };
}
function compute(glide) {
  if (!graph) return;
  const a = area();
  lastAspect = Math.round(a.w / a.h * 8) / 8;
  const longest = Math.max(...graph.labels.map((s) => s.length));
  const o = { ...P, sweeps: P.sw, nodeW: Math.max(44, longest * 8 + 22), nodeH: NODE_H, aspect: Math.min(3, Math.max(0.4, lastAspect)) };
  if (P.lab === 'on') {   // each edge's label, with the room its text takes
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = LABEL_FONT;
    o.labels = graph.edges.map(([s, t]) => { const text = graph.labels[s] + ' to ' + graph.labels[t]; return { text, w: Math.ceil(ctx.measureText(text).width) + 6, h: 14 }; });
    ctx.restore();
  }
  const same = layout && layout.graph === graph && shown;
  if (P.eng === 'real') {
    // Ask the engine, and keep showing what is on screen until it answers (or the input, if nothing is).
    if (!same || !layout.real) { const pos = realLayout(graph, o, { pos: [], edges: [], boxes: [] }, true); use(pos, o, same && glide); stage = q = 0; }
    clearTimeout(wait); wait = setTimeout(() => ask(o), working ? 0 : 200);
    panel(); kick(); return;
  }
  stopReal();
  use(P.m === 'layered' ? layered(graph, o) : gridSearch(graph, o), o, same && glide);
}
function use(next, o, glide) {
  layout = next; layout.o = o; layout.graph = graph; layout.stats = [];
  // This page's own layouts do not place labels: each goes at the middle of its finished edge.
  for (const s of layout.snaps) if (!s.labels) s.labels = [];
  if (o.labels && !layout.real) { const end = layout.snaps[layout.snaps.length - 1]; end.labels = midLabels(end.edges, o.labels); }
  const last = layout.snaps.length - 1;
  if (toEnd) { stage = last; toEnd = false; }
  if (stage > last) { stage = last; q = last; }
  if (glide && shown && !still.matches) { from = shown; mix = 0; } else mix = 1;
  panel(); kick();
}
// ---- the real engines ----
function stopReal() { job++; clearTimeout(wait); if (working === 'search') cancelD2(); working = ''; clearInterval(workTimer); }
async function ask(o) {
  const id = ++job, g = graph;
  if (working === 'search') cancelD2();   // a TALA run can take many seconds; do not wait for one nobody wants
  working = P.m; workT = performance.now();
  clearInterval(workTimer); workTimer = setInterval(panel, 500);
  panel();
  try {
    const next = await runReal(g, o);
    if (id !== job) return;
    working = ''; clearInterval(workTimer); tookS = (performance.now() - workT) / 1000;
    use(next, o, true); stage = 1; if (still.matches || !shown) q = 1;
    panel(); kick();
    $('status').textContent = 'The layout is ready.';
  } catch (e) {
    if (id !== job) return;
    working = ''; clearInterval(workTimer);
    P.eng = 'own'; stage = 99; compute(false); q = stage; panel();
    $('status').textContent = $('methodNote').textContent = 'The real engine could not be loaded or failed on this graph. Showing the step-by-step version.';
  }
}
const stats = (i) => layout.stats[i] || (layout.stats[i] = { ...measure(layout.snaps[i].edges), covered: labelsCovered(layout.snaps[i].labels, layout.snaps[i].pos, layout.o) });

function setGraph(id, keepStage) {
  P.g = id; $('graph').value = id; hot = -1;
  const take = (g) => { if (P.g !== id) return; graph = g; shown = null; compute(false); if (!keepStage && P.eng === 'own') go(layout.snaps.length - 1, true); panel(); };
  const s = SAMPLES.find((x) => x.id === id);
  if (s.graph) return take(s.graph);
  if (graphs.has(id)) return take(graphs.get(id));
  fetch(s.url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
    .then((t) => { graphs.set(id, parseTopology(t)); take(graphs.get(id)); })
    .catch(() => { $('status').textContent = 'The file could not be loaded. Showing another graph.'; setGraph('diamond'); });
}

// ---- steps ----
function go(s, jump) {
  stage = Math.max(0, Math.min(layout.snaps.length - 1, s));
  if (jump || still.matches) q = stage;
  dwell = 0; panel(); kick();
}
function setPlaying(on) {
  playing = on; dwell = 0;
  $('play').textContent = on ? 'Pause' : 'Play the steps';
  if (on) { if (stage >= layout.snaps.length - 1) go(0, true); kick(); }
}

// ---- the panel ----
function caption(id) {
  const g = graph, f = layout.facts, n = (k, one, many) => k + ' ' + (k === 1 ? one : many);
  const down = P.dir === 'down';
  switch (id) {
    case 'input': {
      let t = 'The nodes in the order the file lists them. Each arrow is an edge: it points from one node to another.';
      if (g.repeats || g.loops.length) t += ' Left out of the count: ' + [g.repeats ? n(g.repeats, 'edge that repeats', 'edges that repeat') + ' an earlier one' : '', g.loops.length ? n(g.loops.length, 'edge', 'edges') + ' from a node to itself' : ''].filter(Boolean).join(', and ') + '.';
      return t;
    }
    case 'cycles': return f.reversed
      ? 'A cycle is a route along the arrows that comes back to where it began. ' + (f.reversed === 1 ? 'One arrow is' : f.reversed + ' arrows are') + ' turned round, drawn in red, so that no cycle is left.'
      : 'A cycle is a route along the arrows that comes back to where it began. This graph has none, so no arrow is turned.';
    case 'layers': if (layout.grouped) return 'A layer is one ' + (down ? 'row' : 'column') + '. Inside each group’s box, a node goes in a layer after every node that points to it. The boxes are then put in layers the same way, each as one large node.';
      return 'A layer is one ' + (down ? 'row' : 'column') + '. Each node goes in a layer after every node that points to it. An edge that passes over a layer gets a dot in it' + (f.bends ? ': ' + n(f.bends, 'dot', 'dots') + ' here.' : '; here no edge does.');
    case 'order': { const a = stats(2).crossings, b = stats(3).crossings; return 'Each layer is sorted so that a node sits near the nodes it joins in the next layer. Crossings ' + (a === b ? 'stay at ' + a : 'go from ' + a + ' to ' + b) + '.'; }
    case 'place': if (layout.grouped) return 'Nodes slide along their layer, and boxes along theirs, keeping their order, until joined ones line up.';
      return 'Nodes slide along their layer, keeping their order, until joined nodes line up and edges run straight.';
    case 'route': return (P.lab === 'on' ? 'Each label is put at the middle of its edge; this page’s code does not move it clear of anything. ' : '') + (P.m === 'layered'
      ? (layout.grouped ? 'Edges inside a box are drawn through their dots. Edges between boxes are routed last, at right angles around the nodes.' : 'Each edge is drawn through its dots.') + (f.reversed ? ' Turned arrows point their true way again, still in red.' : '')
      : 'Each edge takes the cheapest path of horizontal and vertical runs. A path pays for its length, its bends and any box it cuts through, and may not pass through a node.');
    case 'real': return (P.lab === 'on' ? 'The engine chose where each label goes. ' : '') + (P.m === 'layered'
      ? 'What ELK itself gives for this graph and these settings.' + (g.groups.length && P.grp === 'box' ? ' Its boxes are laid out together with their contents, in one pass.' : '')
      : 'What TALA itself gives: the lowest penalty of ' + n(P.tries, 'seed', 'seeds') + '.');
    case 'boxes': return g.groups.length
      ? 'The file puts each node in a group. Each group gets a box, and boxes and nodes sit on grids in file order.'
      : 'The nodes sit on a grid in file order, with spare cells to move into.';
    case 'search': return 'Two nodes' + (g.groups.length ? ', or two boxes,' : '') + ' swap places, and the swap is kept if the score drops. The score adds up edge length, bends and crossings. Lowest of ' + n(f.tries.length, 'try', 'tries') + ': ' + f.tries[f.best] + ', down from ' + f.firstScore + '.';
  }
  return '';
}
function panel() {
  if (!layout) return;
  const ids = layout.stages, nav = $('stages');
  if (nav.dataset.m !== ids.join()) {
    nav.dataset.m = ids.join(); nav.textContent = '';
    ids.forEach((id, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.append(document.createElement('i'), document.createTextNode(STAGE_NAME[id]));
      b.addEventListener('click', () => { setPlaying(false); go(i); });
      nav.append(b);
    });
  }
  [...nav.children].forEach((b, i) => { b.classList.toggle('done', i < stage); if (i === stage) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  for (const b of $('method').children) b.setAttribute('aria-pressed', String(b.dataset.v === P.m));
  $('methodNote').textContent = working ? 'Working: ' + Math.round((performance.now() - workT) / 1000) + ' s. ' + (working === 'search' ? 'On a graph this size TALA can take 10 s or more for each seed.' : '') : P.eng === 'real' ? REAL_NOTE[P.m] : NOTE[P.m];
  $('links-layered').hidden = P.m !== 'layered'; $('links-search').hidden = P.m !== 'search';
  $('eyebrow').textContent = 'Step ' + (stage + 1) + ' of ' + ids.length;
  $('capTitle').textContent = STAGE_NAME[ids[stage]];
  $('capText').textContent = caption(ids[stage]);
  $('graphFacts').textContent = graph.n + ' nodes · ' + graph.edges.length + ' edges' + (graph.groups.length ? ' · ' + graph.groups.length + ' groups' : '');
  const st = stats(stage), f = layout.facts;
  meter(0, 'Crossings', st.crossings);
  if (P.lab === 'on') meter(1, 'Labels covered', layout.snaps[stage].labels.length ? st.covered : '…');
  else meter(1, 'Edge length', Math.round(st.length / layout.o.nodeW));
  if (layout.real) meter(2, 'Seconds', working || stage === 0 ? '…' : tookS.toFixed(1));
  else if (P.m === 'layered') meter(2, 'Turned edges', stage >= 1 ? f.reversed : 0, stage >= 1 && f.reversed > 0);
  else meter(2, 'Score', stage >= 2 ? f.tries[f.best] : f.firstScore);
  for (const c of CONTROLS) {
    const row = $('ctl-' + c.id);
    row.hidden = !!(c.m && c.m !== P.m) || !!(c.only && !c.only()) || !!(c.own && P.eng === 'real');
    if (c.id === 'eng') row.querySelector('[data-v=real]').textContent = REAL_NAME[P.m];
    row.querySelector('.name').textContent = typeof c.label === 'function' ? c.label() : c.label;
    if (c.options) for (const b of row.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === P[c.id]));
    else { const inp = row.querySelector('input'); inp.value = P[c.id]; inp.style.setProperty('--v', (P[c.id] - c.min) / (c.max - c.min) * 100 + '%'); row.querySelector('b').textContent = P[c.id]; }
  }
  $('prev').setAttribute('aria-disabled', String(stage === 0));
  $('next').setAttribute('aria-disabled', String(stage === ids.length - 1));
  thumbs(); pick(); writeHash();
}
function meter(i, name, value, turned) {
  const box = $('meters');
  while (box.children.length <= i) { const d = document.createElement('div'); d.className = 'meter'; d.append(document.createElement('span'), document.createElement('b')); box.append(d); }
  const d = box.children[i];
  d.classList.toggle('turned', !!turned);
  d.firstChild.textContent = name; d.lastChild.textContent = String(value);
}
function pick() {
  let t = '';
  if (hot >= 0 && graph) {
    const out = graph.edges.filter((e) => e[0] === hot).length, inn = graph.edges.filter((e) => e[1] === hot).length;
    t = graph.names[hot] + ' · ' + out + ' out · ' + inn + ' in' + (graph.group[hot] >= 0 ? ' · ' + graph.groups[graph.group[hot]] : '');
  }
  $('pick').textContent = t;
}
// One small picture per try of the search, with its score; the kept one is outlined.
function thumbs() {
  const box = $('tries'), on = P.m === 'search' && layout.thumbs;
  box.hidden = !on;
  if (!on) return;
  const T = layout.thumbs, f = layout.facts;
  while (box.children.length > T.length) box.lastChild.remove();
  while (box.children.length < T.length) { const fig = document.createElement('figure'); fig.append(document.createElement('canvas'), document.createElement('figcaption')); box.append(fig); }
  T.forEach((pos, i) => {
    const fig = box.children[i], c = fig.firstChild, k = c.getContext('2d');
    fig.classList.toggle('best', i === f.best);
    fig.lastChild.textContent = String(f.tries[i]);
    c.width = 120; c.height = 90;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pos) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const s = Math.min(104 / Math.max(1, x1 - x0), 74 / Math.max(1, y1 - y0)), X = (p) => 60 + (p[0] - (x0 + x1) / 2) * s, Y = (p) => 45 + (p[1] - (y0 + y1) / 2) * s;
    k.strokeStyle = 'rgba(170,182,214,.45)'; k.lineWidth = 1; k.beginPath();
    for (const [a, b] of graph.edges) { k.moveTo(X(pos[a]), Y(pos[a])); k.lineTo(X(pos[b]), Y(pos[b])); }
    k.stroke();
    const r = Math.max(1.6, Math.min(5, 26 / Math.sqrt(graph.n)));
    pos.forEach((p, v) => { k.fillStyle = colour(v); k.beginPath(); k.arc(X(p), Y(p), r, 0, 7); k.fill(); });
  });
}
const colour = (v) => (graph.group[v] >= 0 ? GROUP[graph.group[v] % GROUP.length] : PLAIN);

function buildControls() {
  const sel = $('graph');
  for (const s of SAMPLES) { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; sel.append(o); }
  sel.addEventListener('change', () => { setPlaying(false); setGraph(sel.value); });
  for (const b of $('method').children) b.addEventListener('click', () => {
    if (P.m === b.dataset.v) return;
    setPlaying(false); P.m = b.dataset.v; P.eng = 'own'; stage = 99; compute(true); q = stage; panel();
  });
  const box = $('controls');
  for (const c of CONTROLS) {
    const row = document.createElement('div'); row.className = 'ctl'; row.id = 'ctl-' + c.id;
    const lab = document.createElement('div'); lab.className = 'lab';
    const changed = () => {
      const s = typeof c.stage === 'object' ? c.stage[P.m] : c.stage;
      setPlaying(false);
      if (c.id === 'eng') toEnd = true;
      else if (P.eng === 'own' && stage < s) go(s);   // show the step this setting acts on
      dirty = true; panel(); kick();
    };
    if (c.options) {
      const name = document.createElement('span'); name.className = 'name'; name.id = 'lab-' + c.id; lab.append(name);
      const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-labelledby', name.id);
      for (const [v, text] of c.options) { const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.textContent = text; b.addEventListener('click', () => { if (P[c.id] !== v) { P[c.id] = v; changed(); } }); seg.append(b); }
      row.append(lab, seg);
    } else {
      const name = document.createElement('label'); name.className = 'name'; name.htmlFor = 'in-' + c.id;
      lab.append(name, document.createElement('b'));
      const inp = document.createElement('input'); inp.type = 'range'; inp.id = 'in-' + c.id; inp.min = c.min; inp.max = c.max; inp.step = 1;
      inp.addEventListener('input', () => { P[c.id] = Number(inp.value); changed(); });
      row.append(lab, inp);
    }
    if (c.id === 'eng') { lab.classList.add('visually-hidden'); $('methodNote').before(row); } else box.append(row);
  }
  $('prev').addEventListener('click', () => { setPlaying(false); go(stage - 1); });
  $('next').addEventListener('click', () => { setPlaying(false); go(stage + 1); });
  $('play').addEventListener('click', () => setPlaying(!playing));
}

// ---- drawing ----
const mixBox = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f, h: a.h + (b.h - a.h) * f });
const mixPts = (a, b, f) => a.map((p, k) => [p[0] + (b[k][0] - p[0]) * f, p[1] + (b[k][1] - p[1]) * f]);
const ease = (t) => t * t * (3 - 2 * t);

function trace(pts, kind) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  if (kind === 'curve') for (let i = 1; i + 2 < pts.length; i += 3) ctx.bezierCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i + 2][0], pts[i + 2][1]);
  else if (kind === 'ortho') {
    for (let i = 1; i < pts.length - 1; i++) {
      const r = Math.min(6, Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / 2, Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) / 2);
      ctx.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  } else for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
// The arrowhead at the end of a → b. For an edge drawn centre to centre, b is first pulled back to the node's border.
function head(a, b, size, centre) {
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  dx /= len; dy /= len;
  let tx = b[0], ty = b[1];
  if (centre) {
    const o = layout.o, back = Math.min(Math.abs(dx) > 1e-9 ? o.nodeW / 2 / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? o.nodeH / 2 / Math.abs(dy) : Infinity, len);
    tx -= dx * back; ty -= dy * back;
  }
  ctx.beginPath(); ctx.moveTo(tx, ty);
  ctx.lineTo(tx - dx * size - dy * size * 0.45, ty - dy * size + dx * size * 0.45);
  ctx.lineTo(tx - dx * size + dy * size * 0.45, ty - dy * size - dx * size * 0.45);
  ctx.closePath(); ctx.fill();
}
function edge(e, pts, alpha, i, size) {
  if (alpha <= 0.004) return;
  const [s, t] = graph.edges[i], lit = hot >= 0 && (s === hot || t === hot);
  ctx.globalAlpha = alpha * (hot < 0 ? 0.62 : lit ? 1 : 0.16);
  ctx.strokeStyle = ctx.fillStyle = e.mark ? TURNED : lit ? INK : EDGE;
  ctx.lineWidth = (lit ? 1.9 : 1.2) / view.s;
  trace(pts, e.kind);
  const n = pts.length, centre = e.kind === 'line';
  if (e.turned) head(pts[1], pts[0], size, centre); else head(pts[n - 2], pts[n - 1], size, centre);
}
function rounded(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

function draw() {
  const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!layout) return;
  const S = layout.snaps, o = layout.o, i = Math.min(S.length - 1, Math.floor(q)), A = S[i], B = S[Math.min(S.length - 1, i + 1)], f = ease(q - i);
  let pos = f === 0 || A.pos === B.pos ? A.pos : mixPts(A.pos, B.pos, f), bb = mixBox(A.bbox, B.bbox, f);
  const m = mix < 1 && from ? ease(mix) : 1;
  if (m < 1) { pos = mixPts(from.pos, pos, m); bb = mixBox(from.bb, bb, m); }
  shown = { pos, bb };
  const a = area(), s = Math.min(a.w / (bb.w + 24), a.h / (bb.h + 24), 1.7);
  view = { s, tx: a.x + a.w / 2 - (bb.x + bb.w / 2) * s, ty: a.y + a.h / 2 - (bb.y + bb.h / 2) * s };
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * view.tx, dpr * view.ty);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // layers
  const layer = (snap, alpha) => { if (!snap.bands.length || alpha <= 0) return; ctx.globalAlpha = alpha * m; ctx.fillStyle = 'rgba(234,240,255,.045)'; for (const b of snap.bands) { rounded(b.x, b.y, b.w, b.h, 9); ctx.fill(); } };
  if (A.bands === B.bands) layer(A, 1);
  else if (A.bands.length && A.bands.length === B.bands.length) layer({ bands: A.bands.map((b, k) => mixBox(b, B.bands[k], f)) }, 1);
  else { layer(A, 1 - f); layer(B, f); }
  // boxes
  const box = (b, alpha) => { const c = GROUP[b.k % GROUP.length]; ctx.globalAlpha = alpha * 0.07; ctx.fillStyle = c; rounded(b.x, b.y, b.w, b.h, 12); ctx.fill(); ctx.globalAlpha = alpha * 0.55; ctx.strokeStyle = c; ctx.lineWidth = 1.1 / s; ctx.stroke(); };
  if (A.boxes.length && B.boxes.length) A.boxes.forEach((b, k) => box({ ...mixBox(b, B.boxes[k], f), k: b.k }, m));
  else { A.boxes.forEach((b) => box(b, (1 - f) * m)); B.boxes.forEach((b) => box(b, f * m)); }

  // edges
  const size = Math.max(6.5, 5 / s);
  if (m < 1) { ctx.globalAlpha = (1 - m) * 0.5; ctx.strokeStyle = EDGE; ctx.lineWidth = 1.2 / s; ctx.beginPath(); for (const [u, v] of graph.edges) { ctx.moveTo(pos[u][0], pos[u][1]); ctx.lineTo(pos[v][0], pos[v][1]); } ctx.stroke(); }
  const fade = m * m;
  A.edges.forEach((ea, k) => {
    const eb = B.edges[k];
    if (f === 0) edge(ea, ea.pts, fade, k, size);
    else if (ea.kind === 'line' && eb.kind === 'line' && ea.pts.length === eb.pts.length && ea.turned === eb.turned && ea.mark === eb.mark) edge(ea, mixPts(ea.pts, eb.pts, f), fade, k, size);
    else if (ea.kind === 'line' && eb.kind === 'line' && ea.pts.length === eb.pts.length) { const p = mixPts(ea.pts, eb.pts, f); edge(ea, p, fade * (1 - f), k, size); edge(eb, p, fade * f, k, size); }
    else { edge(ea, ea.pts, fade * (1 - f), k, size); edge(eb, eb.pts, fade * f, k, size); }
  });
  // the dots that hold an edge's place in a layer
  const dots = ((A.dots ? 1 - f : 0) + (B.dots ? f : 0)) * fade;
  if (dots > 0.01) {
    ctx.globalAlpha = dots * (hot < 0 ? 0.9 : 0.3); ctx.fillStyle = EDGE;
    A.edges.forEach((ea, k) => { const eb = B.edges[k]; if (ea.kind !== 'line' || ea.pts.length < 3) return; const p = eb.kind === 'line' && eb.pts.length === ea.pts.length ? mixPts(ea.pts, eb.pts, f) : ea.pts; for (let j = 1; j < p.length - 1; j++) { ctx.beginPath(); ctx.arc(p[j][0], p[j][1], Math.max(2.4, 2 / s), 0, 7); ctx.fill(); } });
  }
  // an edge from a node to itself
  ctx.lineWidth = 1.2 / s;
  for (const v of graph.loops) { ctx.globalAlpha = hot < 0 || hot === v ? 0.62 : 0.16; ctx.strokeStyle = EDGE; ctx.beginPath(); ctx.arc(pos[v][0] + o.nodeW / 2, pos[v][1] - o.nodeH / 2, 8, -Math.PI, Math.PI / 2); ctx.stroke(); }

  // edge labels: a plate where the label sits, and its text when that is large enough to read
  const plates = (snap, alpha) => {
    if (!snap.labels.length || alpha <= 0.01) return;
    const read = 10 * s >= 5.5;
    ctx.font = LABEL_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    snap.labels.forEach((l) => {
      const [u, v] = graph.edges[l.e] || [], lit = hot >= 0 && (u === hot || v === hot), dim = hot >= 0 && !lit;
      ctx.globalAlpha = alpha * (dim ? 0.25 : 0.92); ctx.fillStyle = '#131b33'; rounded(l.x - l.w / 2, l.y - l.h / 2, l.w, l.h, 3); ctx.fill();
      ctx.globalAlpha = alpha * (dim ? 0.2 : 0.7); ctx.strokeStyle = lit ? INK : EDGE; ctx.lineWidth = 0.7 / s; ctx.stroke();
      if (read) { ctx.globalAlpha = alpha * (dim ? 0.3 : 1); ctx.fillStyle = INK; ctx.fillText(l.text, l.x, l.y + 0.5); }
    });
  };
  if (A.labels === B.labels) plates(A, fade); else { plates(A, fade * (1 - f)); plates(B, fade * f); }

  // nodes
  const near = hot >= 0 ? new Set([hot]) : null;
  if (near) for (const [u, v] of graph.edges) { if (u === hot) near.add(v); if (v === hot) near.add(u); }
  const text = 11.5 * s >= 6.2;
  ctx.font = '500 11.5px "JetBrains Mono", ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let v = 0; v < graph.n; v++) {
    const c = colour(v), x = pos[v][0] - o.nodeW / 2, y = pos[v][1] - o.nodeH / 2, dim = near && !near.has(v);
    ctx.globalAlpha = 1; ctx.fillStyle = '#0a1022'; rounded(x, y, o.nodeW, o.nodeH, 7); ctx.fill();
    ctx.globalAlpha = dim ? 0.1 : v === hot ? 0.5 : 0.24; ctx.fillStyle = c; ctx.fill();
    ctx.globalAlpha = dim ? 0.3 : 1; ctx.strokeStyle = v === hot ? INK : c; ctx.lineWidth = Math.max(1, 1 / s) * (v === hot ? 2 : 1.2); ctx.stroke();
    if (text) { ctx.fillStyle = INK; ctx.globalAlpha = dim ? 0.35 : 0.95; ctx.fillText(graph.labels[v], pos[v][0], pos[v][1] + 0.5); }
  }
  ctx.globalAlpha = 1;
}

function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function tick(t) {
  raf = 0;
  const dt = lastT ? Math.min(50, t - lastT) : 16; lastT = t;
  if (dirty) { dirty = false; compute(true); }
  let busy = false;
  if (mix < 1) { mix = Math.min(1, mix + dt / 420); busy = true; }
  if (q !== stage) { const step = dt / 700 * Math.max(1, Math.abs(stage - q) * 0.8); q = Math.abs(stage - q) <= step ? stage : q + Math.sign(stage - q) * step; busy = true; }
  else if (playing) {
    dwell += dt;
    if (dwell > (still.matches ? 1500 : 700)) { if (stage < layout.snaps.length - 1) go(stage + 1); else { setPlaying(false); $('status').textContent = 'The steps have finished.'; } }
    busy = playing;
  }
  draw();
  if (busy || dirty) kick(); else lastT = 0;
}

// ---- picking out a node ----
function nodeAt(cx, cy) {
  if (!shown) return -1;
  const x = (cx - view.tx) / view.s, y = (cy - view.ty) / view.s, o = layout.o, slack = Math.max(0, 9 / view.s - o.nodeH / 2);
  for (let v = graph.n - 1; v >= 0; v--) if (Math.abs(x - shown.pos[v][0]) <= o.nodeW / 2 + slack && Math.abs(y - shown.pos[v][1]) <= o.nodeH / 2 + slack) return v;
  return -1;
}
function setHot(v) { if (v === hot) return; hot = v; pick(); if (v >= 0) $('status').textContent = $('pick').textContent; kick(); }
canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') setHot(nodeAt(e.clientX, e.clientY)); });
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setHot(-1); });
canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { const v = nodeAt(e.clientX, e.clientY); setHot(v === hot ? -1 : v); } });
canvas.addEventListener('keydown', (e) => {
  if (!graph) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { setHot((hot + 1) % graph.n); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { setHot((hot + graph.n - 1 + (hot < 0 ? 1 : 0)) % graph.n); e.preventDefault(); }
  else if (e.key === 'Escape') setHot(-1);
});

addEventListener('resize', () => { const a = area(); if (layout && Math.round(a.w / a.h * 8) / 8 !== lastAspect) compute(false); kick(); });
addEventListener('hashchange', () => { const st = readHash(); setGraph(P.g, true); if (st >= 0) go(st, true); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(kick);

buildControls();
{ const a = area(); if (a.w > a.h * 1.05) P.dir = 'right'; }   // start with the direction that fits the screen
const first = readHash();
if (first >= 0) stage = q = first; else stage = q = 99;
setGraph(P.g, true);
