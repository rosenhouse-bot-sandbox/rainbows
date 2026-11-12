// The sample graphs, and the reader for the topology file.
//
// A graph here is { n, names, labels, group, groups, edges, loops, repeats }:
//   names[i]   the node's name in the file         labels[i]  a short form drawn inside the node
//   group[i]   index into groups, or -1            edges      [from, to] pairs, each pair once
//   loops      nodes with an edge to themselves    repeats    how many edges repeated an earlier one

export function makeGraph(names, groupOf, pairs, labels) {
  const index = new Map(names.map((s, i) => [s, i]));
  const groups = [], group = names.map((s) => {
    const k = groupOf ? groupOf[s] : undefined;
    if (k === undefined) return -1;
    let gi = groups.indexOf(k);
    if (gi < 0) { gi = groups.length; groups.push(k); }
    return gi;
  });
  const edges = [], loops = [], seen = new Set();
  let repeats = 0;
  for (const [a, b] of pairs) {
    const s = index.get(a), t = index.get(b);
    if (s === undefined || t === undefined) continue;
    if (s === t) { if (!loops.includes(s)) loops.push(s); else repeats++; continue; }
    const key = s * names.length + t;
    if (seen.has(key)) { repeats++; continue; }
    seen.add(key); edges.push([s, t]);
  }
  return { n: names.length, names, labels: labels || names, group, groups, edges, loops, repeats };
}

// "A>B B>C" with optional groups { name: 'A B' }. Nodes are numbered in the order they first appear.
function quick(spec, groups) {
  const pairs = spec.trim().split(/\s+/).map((p) => p.split('>'));
  const names = [];
  for (const p of pairs) for (const s of p) if (!names.includes(s)) names.push(s);
  let groupOf = null;
  if (groups) { groupOf = {}; for (const k of Object.keys(groups)) for (const s of groups[k].split(' ')) groupOf[s] = k; }
  return makeGraph(names, groupOf, pairs);
}

// The topology file: a list of nodes (name, group) and a list of edges (source, dest). This reads
// only that shape, not YAML in general.
export function parseTopology(text) {
  const names = [], groupOf = {}, pairs = [];
  let section = '', item = null;
  const close = () => {
    if (!item) return;
    if (section === 'nodes' && item.name) { if (!names.includes(item.name)) names.push(item.name); if (item.group) groupOf[item.name] = item.group; }
    if (section === 'edges' && item.source && item.dest) pairs.push([item.source, item.dest]);
    item = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    const top = /^(\w+):\s*$/.exec(line);
    if (top) { close(); section = top[1]; continue; }
    const m = /^\s*(-\s+)?([\w-]+):\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    if (m[1]) { close(); item = {}; }
    if (item) item[m[2]] = m[3].replace(/^["']|["']$/g, '');
  }
  close();
  for (const p of pairs) for (const s of p) if (!names.includes(s)) names.push(s);
  // "node-044" is drawn as "44"
  const labels = names.map((s) => { const d = /(\d+)$/.exec(s); return d ? String(Number(d[1])).padStart(2, '0') : s.slice(0, 4); });
  return makeGraph(names, groupOf, pairs, labels);
}

const tree = []; for (let i = 1; i <= 7; i++) tree.push(i + '>' + 2 * i, i + '>' + (2 * i + 1));

export const SAMPLES = [
  { id: 'topology', name: 'Topology file, 55 nodes', url: 'graphs/anonymous-topology.yaml' },
  { id: 'diamond', name: 'Diamond with a shortcut', graph: quick('A>B A>C B>D C>D D>E A>E') },
  { id: 'fan', name: 'Fan out, fan in', graph: quick('R>A R>B R>C R>D R>E R>F R>G A>X B>X C>X D>X D>Y E>Y F>Y G>Y X>Z Y>Z') },
  { id: 'chain', name: 'Chain with shortcuts', graph: quick('A>B B>C C>D D>E E>F F>G G>H A>D B>F C>H A>H') },
  { id: 'cycles', name: 'Cycles', graph: quick('A>B B>C C>D D>A C>E E>F F>C D>G G>H H>B') },
  { id: 'tangle', name: 'Two tangled rows', graph: quick('A>Z A>X B>Y B>U C>Z C>V D>W D>U E>V E>X F>W F>Y') },
  { id: 'tree', name: 'Tree', graph: quick(tree.join(' ')) },
  { id: 'services', name: 'Three groups', graph: quick('CDN>LB LB>Web LB>API Web>API API>Auth API>DB API>Memo API>Queue Queue>Jobs Jobs>DB Auth>DB Auth>Memo',
    { edge: 'CDN LB', app: 'Web API Auth Jobs', data: 'DB Memo Queue' }) },
];
