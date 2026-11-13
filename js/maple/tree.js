// The tree: its branches, where each leaf hangs, each leaf's own timetable, and the outline of a
// leaf. Built once from a fixed seed, so every visit shows the same tree. Lengths are in metres;
// x is to the right, y is up, the foot of the trunk is at (0, 0). No DOM.
import { timetable, FOCUS, pigments, mix, smooth, clamp } from './model.js';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- one leaf's outline, in units of its own length: stalk end at (0,0), middle tip at (1,0) ----
export const LOBES = [[0, 1], [40, 0.9], [-40, 0.9], [80, 0.66], [-80, 0.66], [126, 0.34], [-126, 0.34]].map(([deg, len]) => ({ a: deg * Math.PI / 180, len }));
const HALF = 0.165;                                        // a lobe's greatest half-width, as a share of its length
const profile = (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 1.25);
// Points round one lobe. `teeth` > 0 gives the saw-toothed edge.
function lobe(L, n, teeth) {
  const pts = [], c = Math.cos(L.a), s = Math.sin(L.a);
  for (let side = 1; side >= -1; side -= 2) for (let i = 0; i <= n; i++) {
    const t = side > 0 ? i / n : 1 - i / n;
    let w = HALF * L.len * profile(t) + 0.02 * (1 - t);
    if (teeth && t > 0.08 && t < 0.93) { const f = (t * teeth) % 1; w *= 0.95 + 0.13 * (f < 0.75 ? f / 0.75 : (1 - f) / 0.25); }   // each tooth points toward the lobe's tip
    const u = t * L.len;
    pts.push([u * c - side * w * s, u * s + side * w * c]);
  }
  return pts;
}
export const leafShape = {
  tiny: LOBES.map((L) => lobe(L, 3, 0)),
  plain: LOBES.map((L) => lobe(L, 12, 0)),
  toothed: LOBES.map((L) => lobe(L, 176, 22)),
  veins: LOBES.map((L) => [[0, 0], [0.97 * L.len * Math.cos(L.a), 0.97 * L.len * Math.sin(L.a)]]),
  side: LOBES.flatMap((L) => {                             // side veins, running forward from each lobe's middle vein
    const out = [], c = Math.cos(L.a), s = Math.sin(L.a), n = Math.round(9 * L.len);
    for (let i = 1; i <= n; i++) for (const side of [1, -1]) {
      const t = 0.12 + 0.74 * i / (n + 1), u = t * L.len, w = HALF * L.len * profile(Math.min(1, t + 0.1)) * 0.92, f = 0.1 * L.len;
      out.push([[u * c, u * s], [(u + f) * c - side * w * s, (u + f) * s + side * w * c]]);
    }
    return out;
  }),
};
// The point on the leaf that the Cells and Molecules scales look into: on the middle lobe, between two side veins.
export const SPOT = [0.47, 0.062];

// ---- the tree -----------------------------------------------------------------------------------
export function buildTree(seed = 20261113) {
  const R = rng(seed), segs = [], nodes = [], leaves = [];
  const twig = (x, y, a, len, w, z) => {                   // a leafy shoot: pairs of leaves along it and one pair at its end
    const n = 2 + Math.floor(len / 0.075);
    for (let i = 1; i <= n; i++) {
      const t = i / n, nx = x + Math.cos(a) * len * t, ny = y + Math.sin(a) * len * t;
      nodes.push({ x: nx, y: ny, a, w: w * (1 - 0.4 * t), tip: i === n });
      for (const side of [1, -1]) {
        if (R() < 0.22) continue;
        let pa = a + side * (0.75 + 0.5 * R());            // the stalk leaves the twig at about 50 degrees
        const hang = -Math.PI / 2 + (R() - 0.5) * 0.5, d = Math.atan2(Math.sin(hang - pa), Math.cos(hang - pa));
        pa += d * (0.3 + 0.3 * R());                       // and the blade droops
        leaves.push({ nx, ny, pa, pl: 0.018 + 0.016 * R(), ang: pa + d * 0.35 + (R() - 0.5) * 0.5, len: 0.046 + 0.016 * R(), z: clamp(z + (R() - 0.5) * 0.3), r1: R(), r2: R(), r3: R(), r4: R() });
      }
    }
  };
  const TOP = 8, girth = (depth) => 0.0026 * Math.pow(1.72, depth);        // a twig is 2.6 mm thick, the trunk 20 cm
  const grow = (x, y, a, len, depth, z) => {
    const out = Math.cos(a) >= 0 ? 0 : Math.PI, to = depth > 4 ? Math.PI / 2 : out;      // limbs rise, then branches level out into flat layers
    let a2 = a + (R() - 0.5) * 0.7; if (depth < TOP) a2 += Math.atan2(Math.sin(to - a2), Math.cos(to - a2)) * (depth > 4 ? 0.1 : 0.16);
    const mx = x + Math.cos(a) * len * 0.5, my = y + Math.sin(a) * len * 0.5, ex = mx + Math.cos(a2) * len * 0.5, ey = my + Math.sin(a2) * len * 0.5;
    const w = girth(depth), w1 = girth(depth - 0.6);
    segs.push({ x0: x, y0: y, cx: mx, cy: my, x1: ex, y1: ey, w0: w, w1, z });
    if (depth <= 2) twig(mx, my, a2, len * 0.5, w1, z);
    else if (depth <= 5 && R() < 0.75) {                    // a short leafy shoot from the side of an older branch
      const sa = a2 + (R() < 0.5 ? 1 : -1) * (0.6 + 0.6 * R()), sl = 0.16 + 0.2 * R(), sx = mx + Math.cos(sa) * sl, sy = my + Math.sin(sa) * sl;
      segs.push({ x0: mx, y0: my, cx: (mx + sx) / 2, cy: (my + sy) / 2, x1: sx, y1: sy, w0: girth(0.6), w1: girth(0), z });
      twig((mx + sx) / 2, (my + sy) / 2, sa, sl * 0.5 + 0.08, girth(0), clamp(z + (R() - 0.5) * 0.5));
    }
    if (depth === 0) return;
    const kids = depth === TOP ? 4 : R() < (depth > 4 ? 0.35 : 0.1) ? 3 : 2;
    for (let i = 0; i < kids; i++) {
      const f = kids === 1 ? 0 : i / (kids - 1) - 0.5;
      let ca = a2 + f * (depth === TOP ? 1.7 : 1.25) + (R() - 0.5) * 0.45;
      ca = clamp(ca, -0.3, Math.PI + 0.3);
      const d = depth < TOP - 1 && depth > 1 && R() < 0.3 ? depth - 2 : depth - 1;
      grow(ex, ey, ca, depth === TOP ? 0.7 + 0.25 * R() : len * (0.62 + 0.26 * R()), d, depth >= TOP - 2 ? clamp(0.5 + (i % 2 ? 0.32 : -0.32) * (depth === TOP ? 1 : 0.6) + (R() - 0.5) * 0.25) : z);
    }
  };
  grow(0, 0, Math.PI / 2 + 0.05, 0.5, TOP, 0.6);

  // how much sun a leaf gets: 0 deep in the crown, 1 on its outside and top
  let x0 = 1e9, x1 = -1e9, y1 = -1e9, y0 = 1e9;
  for (const l of leaves) { x0 = Math.min(x0, l.nx); x1 = Math.max(x1, l.nx); y0 = Math.min(y0, l.ny); y1 = Math.max(y1, l.ny); }
  const cx = (x0 + x1) / 2, cy = mix(y0, y1, 0.42), rx = (x1 - x0) / 2, ry = y1 - cy;
  for (const l of leaves) {
    const dx = (l.nx - cx) / rx, dy = (l.ny - cy) / (l.ny > cy ? ry : (cy - y0) * 1.5);
    l.sunny = clamp((Math.hypot(dx, dy) - 0.3) / 0.6 + (l.r3 - 0.5) * 0.35);
    l.T = timetable(l.sunny, l.r1, l.r2);
  }

  // the leaf the page follows: at the end of a low twig on the left, hanging clear of the others
  let tip = nodes[0], best = 1e9;
  for (const n of nodes) {
    if (!n.tip || Math.sin(n.a) > 0.5) continue;
    let crowd = 0;                                          // thick branches close by would fill the close-up
    for (const s of segs) if (s.w0 > 0.005 && Math.hypot((s.x0 + s.x1) / 2 - n.x, (s.y0 + s.y1) / 2 - (n.y - 0.05)) < 0.16 + s.w0) crowd++;
    const d = Math.hypot(n.x + 0.6 * rx - cx, n.y - (y0 + 0.3 * (y1 - y0))) + crowd * 0.5;
    if (d < best) { best = d; tip = n; }
  }
  const focus = { nx: tip.x, ny: tip.y, pa: -1.72, pl: 0.034, ang: -1.86, len: 0.064, z: 1, r1: 0.5, r2: 0.5, r3: 0.5, r4: 0.5, sunny: 1, T: FOCUS, focus: true };
  const bx = focus.nx + Math.cos(focus.pa) * focus.pl + Math.cos(focus.ang) * focus.len * 0.45, by = focus.ny + Math.sin(focus.pa) * focus.pl + Math.sin(focus.ang) * focus.len * 0.45;
  const kept = leaves.filter((l) => { const lx = l.nx + Math.cos(l.pa) * l.pl + Math.cos(l.ang) * l.len * 0.45, ly = l.ny + Math.sin(l.pa) * l.pl + Math.sin(l.ang) * l.len * 0.45; return Math.hypot(lx - bx, ly - by) > 0.085; });
  kept.push(focus);
  for (const l of kept) {                                   // where it comes to rest on the lawn
    const sx = l.nx + Math.cos(l.pa) * l.pl, sy = l.ny + Math.sin(l.pa) * l.pl;
    l.gx = l.focus ? sx - 0.35 : sx + (l.r2 - 0.5) * 2.6 + 0.3;
    l.gy = l.focus ? -0.62 : 0.42 - 1.75 * l.r4;            // the lawn is drawn from y = 0.55 (far) down (near)
    l.rest = l.focus ? -2.3 : l.r3 * 6.283;
    l.sx = sx; l.sy = sy;
  }
  kept.sort((a, b) => a.z - b.z);
  return { segs, nodes, leaves: kept, focus, bounds: { x0, x1, y0, y1 } };
}

// Where a leaf is on a given day: on its twig, in the air, or on the lawn. Writes into `o`.
export function place(l, day, o = {}) {
  const p = pigments(day, l.T);
  o.p = p; o.size = p.size;
  const sx = l.nx + Math.cos(l.pa) * l.pl * p.size, sy = l.ny + Math.sin(l.pa) * l.pl * p.size;
  if (p.fall <= 0) { o.x = sx; o.y = sy; o.a = l.ang; o.q = 1; o.near = 1; o.state = 0; return o; }
  const u = p.fall, e = u * u * (3 - 2 * u), sway = l.focus ? 0.05 : 0.22;
  o.x = mix(sx, l.gx, e) + Math.sin(u * 9.4 + l.r3 * 6) * sway * Math.sin(Math.PI * u);
  o.y = mix(sy, l.gy, Math.pow(u, 1.25));
  o.a = mix(l.ang, l.rest, e) + Math.sin(u * 12 + l.r1 * 6) * (l.focus ? 0.25 : 0.8) * Math.sin(Math.PI * u);
  const land = smooth((u - 0.8) / 0.2);
  o.q = mix(1, 0.5, land);                                  // lying on the lawn, a leaf is seen at a slant
  o.near = mix(1, 1 + Math.max(0, 0.3 - l.gy) * 0.45, land);   // and nearer the viewer it is drawn larger
  o.state = u >= 1 ? 2 : 1;
  return o;
}
