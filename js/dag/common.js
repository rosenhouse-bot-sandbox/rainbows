// Shared by both layouts: the picture of the input, a seeded random number, and the measurements
// read out in the panel. Lengths are in the page's own units; a node is `nodeW` by `nodeH` of them.

export function rng(seed) {   // mulberry32
  let a = (seed | 0) + 0x6D2B79F5;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The input: every node on a grid, in the order the file lists them.
export function inputGrid(n, o) {
  const cw = o.nodeW + 26, ch = o.nodeH + 30;
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * o.aspect * ch / cw))));
  const rows = Math.ceil(n / cols), pos = [];
  for (let i = 0; i < n; i++) pos.push([((i % cols) - (cols - 1) / 2) * cw, (Math.floor(i / cols) - (rows - 1) / 2) * ch]);
  return pos;
}

// k points evenly along the straight line from a to b (k >= 2)
export function along(a, b, k) {
  const out = [];
  for (let i = 0; i < k; i++) { const f = i / (k - 1); out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
  return out;
}

export function bounds(pos, o, extra) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pos) { x0 = Math.min(x0, p[0] - o.nodeW / 2); x1 = Math.max(x1, p[0] + o.nodeW / 2); y0 = Math.min(y0, p[1] - o.nodeH / 2); y1 = Math.max(y1, p[1] + o.nodeH / 2); }
  for (const b of extra || []) { x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w); y0 = Math.min(y0, b.y); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// An edge as straight pieces: curves are cut into short chords.
export function flatten(e) {
  if (e.kind !== 'curve') return e.pts;
  const out = [e.pts[0]], p = e.pts;
  for (let i = 0; i + 3 < p.length; i += 3) {
    for (let k = 1; k <= 8; k++) {
      const t = k / 8, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([a * p[i][0] + b * p[i + 1][0] + c * p[i + 2][0] + d * p[i + 3][0], a * p[i][1] + b * p[i + 1][1] + c * p[i + 2][1] + d * p[i + 3][1]]);
    }
  }
  return out;
}

function cross(a, b, c, d) {   // do the open segments ab and cd cross at one point inside both?
  const d1x = b[0] - a[0], d1y = b[1] - a[1], d2x = d[0] - c[0], d2y = d[1] - c[1];
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((c[0] - a[0]) * d2y - (c[1] - a[1]) * d2x) / den, u = ((c[0] - a[0]) * d1y - (c[1] - a[1]) * d1x) / den;
  const e = 1e-6;
  return t > e && t < 1 - e && u > e && u < 1 - e;
}

// What the panel reports about a drawing: how many times two edges cross, and the summed length
// of the edges, both measured from the lines as drawn.
export function measure(edges) {
  const lines = edges.map(flatten);
  let length = 0, crossings = 0;
  const box = lines.map((l) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of l) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return [x0, y0, x1, y1]; });
  for (const l of lines) for (let i = 1; i < l.length; i++) length += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = box[i], B = box[j];
    if (A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1]) continue;
    const a = lines[i], b = lines[j];
    for (let p = 1; p < a.length; p++) for (let q = 1; q < b.length; q++) if (cross(a[p - 1], a[p], b[q - 1], b[q])) crossings++;
  }
  return { crossings, length };
}

// Straight-line crossings between node centres, for the search's score.
export function straightCrossings(edges, x, y) {
  let c = 0;
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i], ax = x[a], ay = y[a], bx = x[b], by = y[b];
    for (let j = i + 1; j < edges.length; j++) {
      const [p, q] = edges[j];
      if (p === a || p === b || q === a || q === b) continue;
      const d1 = (bx - ax) * (y[p] - ay) - (by - ay) * (x[p] - ax), d2 = (bx - ax) * (y[q] - ay) - (by - ay) * (x[q] - ax);
      if (d1 * d2 >= 0) continue;
      const d3 = (x[q] - x[p]) * (ay - y[p]) - (y[q] - y[p]) * (ax - x[p]), d4 = (x[q] - x[p]) * (by - y[p]) - (y[q] - y[p]) * (bx - x[p]);
      if (d3 * d4 < 0) c++;
    }
  }
  return c;
}

// ---- edge labels ----
// A label is { x, y, w, h, text }, with (x, y) its centre.

// The point a fraction f of the way along a line of straight pieces, and which piece it is on.
export function pointAlong(pts, f) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = total * f;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (left <= len || i === pts.length - 1) { const t = len ? left / len : 0; return { p: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t], i: i - 1 }; }
    left -= len;
  }
  return { p: pts[0].slice(), i: 0 };
}

// What this page's own layouts do: each label at the middle of its edge, and nothing more.
export function midLabels(edges, sizes) {
  return edges.map((e, k) => { const { p } = pointAlong(flatten(e), 0.5); return { x: p[0], y: p[1], w: sizes[k].w, h: sizes[k].h, text: sizes[k].text, e: k }; });
}

// How many labels lie over a node or over another label.
export function labelsCovered(labels, pos, o) {
  const hit = new Uint8Array(labels.length), over = (a, bx, by, bw, bh) => Math.abs(a.x - bx) < (a.w + bw) / 2 - 0.5 && Math.abs(a.y - by) < (a.h + bh) / 2 - 0.5;
  labels.forEach((a, i) => {
    for (const p of pos) if (over(a, p[0], p[1], o.nodeW, o.nodeH)) { hit[i] = 1; break; }
    for (let j = i + 1; j < labels.length; j++) if (over(a, labels[j].x, labels[j].y, labels[j].w, labels[j].h)) { hit[i] = 1; hit[j] = 1; }
  });
  return hit.reduce((n, v) => n + v, 0);
}
