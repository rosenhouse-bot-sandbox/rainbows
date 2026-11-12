// Lays out every sample graph with both methods over a spread of settings, without a browser, and
// fails if a layout breaks a rule that must always hold:
//   - every coordinate is a number, and no two nodes overlap in the finished picture
//   - layered: once the chosen edges are turned, no cycle is left, and every edge runs forward
//     through the layers (turned edges run backward)
//   - a routed edge starts on its source's border and ends on its target's
//   - the same settings give the same layout twice (the search is seeded, not random)
//
//   node tests/dag/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { SAMPLES, parseTopology } from '../../js/dag/graphs.js';
import { layered, breakCycles } from '../../js/dag/layered.js';
import { gridSearch } from '../../js/dag/search.js';
import { measure } from '../../js/dag/common.js';

const root = path.resolve(import.meta.dirname, '../..');
const graphs = SAMPLES.map((s) => [s.id, s.graph || parseTopology(fs.readFileSync(path.join(root, 'dag', s.url), 'utf8'))]);
let fails = 0, runs = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const base = { nodeW: 44, nodeH: 26, aspect: 1.4, gap: 22, dir: 'down', cyc: 'greedy', lay: 'longest', wmax: 4, sweeps: 6, lgap: 44, rt: 'ortho', seed: 1, tries: 2, flow: 3, cross: 5 };

function common(tag, g, o, out) {
  runs++;
  for (const [i, snap] of out.snaps.entries()) {
    for (const p of snap.pos) if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return fail(`${tag}: stage ${i} has a node without a place`);
    for (const e of snap.edges) for (const p of e.pts) if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return fail(`${tag}: stage ${i} has an edge without a path`);
    if (snap.edges.length !== g.edges.length) return fail(`${tag}: stage ${i} draws ${snap.edges.length} of ${g.edges.length} edges`);
  }
  const last = out.snaps[out.snaps.length - 1], pos = last.pos;
  for (let a = 0; a < g.n; a++) for (let b = a + 1; b < g.n; b++) if (Math.abs(pos[a][0] - pos[b][0]) < o.nodeW - 0.01 && Math.abs(pos[a][1] - pos[b][1]) < o.nodeH - 0.01) return fail(`${tag}: ${g.names[a]} and ${g.names[b]} overlap`);
  const onBorder = (p, c) => { const dx = Math.abs(p[0] - c[0]), dy = Math.abs(p[1] - c[1]); return dx <= o.nodeW / 2 + 0.6 && dy <= o.nodeH / 2 + 0.6 && (Math.abs(dx - o.nodeW / 2) < 0.6 || Math.abs(dy - o.nodeH / 2) < 0.6); };
  g.edges.forEach(([s, t], e) => { const p = last.edges[e].pts; if (!onBorder(p[0], pos[s]) || !onBorder(p[p.length - 1], pos[t])) fail(`${tag}: edge ${g.names[s]} to ${g.names[t]} does not join its nodes`); });
  const m = measure(last.edges);
  if (!Number.isFinite(m.length)) fail(`${tag}: length is not a number`);
}

for (const [id, g] of graphs) {
  for (const cyc of ['greedy', 'dfs', 'file']) {
    const rev = breakCycles(g, cyc), deg = new Int32Array(g.n), out = Array.from({ length: g.n }, () => []);
    g.edges.forEach(([s, t], i) => { const [u, v] = rev[i] ? [t, s] : [s, t]; out[u].push(v); deg[v]++; });
    const ready = []; let seen = 0;
    for (let v = 0; v < g.n; v++) if (!deg[v]) ready.push(v);
    while (ready.length) { const v = ready.pop(); seen++; for (const w of out[v]) if (--deg[w] === 0) ready.push(w); }
    if (seen !== g.n) fail(`${id}: a cycle is left after "${cyc}"`);
    for (const lay of ['longest', 'tight', 'width']) for (const rt of ['ortho', 'poly', 'curve']) for (const dir of ['down', 'right']) for (const sweeps of [0, 6]) for (const gap of [8, 22, 60]) {
      const o = { ...base, cyc, lay, rt, dir, sweeps, gap, wmax: 3 }, tag = `${id} layered ${cyc}/${lay}/${rt}/${dir}/${sweeps}/${gap}`;
      const r = layered(g, o);
      common(tag, g, o, r);
      const pos = r.snaps[4].pos, ax = dir === 'down' ? 1 : 0;
      g.edges.forEach(([s, t], e) => { if ((pos[t][ax] - pos[s][ax]) * (r.rev[e] ? -1 : 1) <= 0) fail(`${tag}: edge ${g.names[s]} to ${g.names[t]} does not run forward`); });
    }
  }
  for (const dir of ['down', 'right']) for (const seed of [1, 7]) for (const gap of [8, 22, 60]) for (const flow of [0, 10]) for (const aspect of [0.6, 1.8]) {
    const o = { ...base, dir, seed, gap, flow, aspect }, tag = `${id} search ${dir}/${seed}/${gap}/${flow}/${aspect}`;
    const r = gridSearch(g, o);
    common(tag, g, o, r);
    if (JSON.stringify(gridSearch(g, o).snaps[3].pos) !== JSON.stringify(r.snaps[3].pos)) fail(`${tag}: two runs differ`);
  }
}
const topo = graphs[0][1];
if (topo.n !== 55 || topo.edges.length !== 62 || topo.loops.length !== 1 || topo.repeats !== 2 || topo.groups.length !== 9) fail(`topology file read as ${topo.n} nodes, ${topo.edges.length} edges, ${topo.loops.length} loops, ${topo.repeats} repeats, ${topo.groups.length} groups`);
console.log(`${runs} layouts, ${fails} failures`);
process.exit(fails ? 1 : 0);
