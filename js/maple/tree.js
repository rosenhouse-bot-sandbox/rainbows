// The tree in three dimensions: its branches, where each leaf hangs and how it is turned, each
// leaf's own timetable, and the outline of a leaf. Built once from a fixed seed, so every visit
// shows the same tree. Lengths are in metres; x is to the right, y is up, z is toward the viewer,
// and the foot of the trunk is at (0, 0, 0). No DOM.
import { add, sub, mul, dot, cross, unit, len, quatOf, qmul, qaxis, slerp } from './gl.js?v=a6cc9af8';
import { timetable, FOCUS, pigments, mix, smooth, clamp } from './model.js?v=a6cc9af8';

const UP = [0, 1, 0];
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
  mid: LOBES.map((L) => lobe(L, 5, 0)),
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
// A blade's own axes: x along the middle vein from the stalk to the tip, z out of its upper side.
const frame = (u, n0) => { const n = unit(sub(n0, mul(u, dot(n0, u)))), v = cross(n, u); return { u, v, n, q: quatOf(u, v, n) }; };
export const DROOP = 0.16;                                 // a blade curves down away from its stalk: depth = DROOP * distance squared, in leaf lengths
// A point on a blade, given in leaf lengths, as it is in the leaf's own frame.
export const onBlade = (a, b) => [a, b, -DROOP * (a * a + b * b)];

export function buildTree(seed = 20261113) {
  const R = rng(seed), segs = [], nodes = [], leaves = [];
  const rv = () => [R() - 0.5, R() - 0.5, R() - 0.5];
  const perp = (d) => { const h = cross(d, UP); return len(h) > 0.2 ? unit(h) : unit(cross(d, [1, 0, 0])); };
  const twig = (p, d, length, w) => {                      // a leafy shoot: pairs of leaves along it and one pair at its end
    const n = 2 + Math.floor(length / 0.05), side = perp(d);
    for (let i = 1; i <= n; i++) {
      const at = add(p, mul(d, length * i / n));
      nodes.push({ p: at, d, tip: i === n });
      for (const s of [1, -1]) {
        if (R() < 0.12) continue;
        const sd = unit(add(add(mul(d, 0.55), mul(side, s * 0.8)), add([0, -0.25 - 0.3 * R(), 0], mul(rv(), 0.5))));   // the stalk leaves the twig at about 50 degrees
        const u = unit(add(sd, add([0, -0.45 - 0.6 * R(), 0], mul(rv(), 0.3))));                                     // and the blade droops
        leaves.push({ node: at, sd, pl: 0.022 + 0.02 * R(), ...frame(u, add(UP, mul(rv(), 0.7))), len: 0.07 + 0.028 * R(), r1: R(), r2: R(), r3: R(), r4: R() });
      }
    }
  };
  const TOP = 8, girth = (depth) => 0.0026 * Math.pow(1.72, depth);        // a twig is 2.6 mm thick, the trunk 20 cm
  const grow = (p, d, length, depth) => {
    const out = len([p[0], 0, p[2]]) > 0.15 ? unit([p[0], 0.4 * Math.hypot(p[0], p[2]), p[2]]) : unit([d[0], 0.5, d[2]]), to = depth > 5 ? unit(add(UP, mul(out, 0.5))) : out;      // limbs rise, then branches level out into flat layers
    const d2 = unit(add(add(d, mul(rv(), 0.3)), depth < TOP ? mul(sub(to, d), depth > 5 ? 0.25 : 0.34) : [0, 0, 0]));
    const mid = add(p, mul(d, length * 0.5)), end = add(mid, mul(d2, length * 0.5)), w = girth(depth), w1 = girth(depth - 0.6), wm = (w + w1) / 2;
    segs.push({ a: p, b: mid, w0: w, w1: wm }, { a: mid, b: end, w0: wm, w1 });
    if (depth <= 2) twig(mid, d2, length * 0.5, w1);
    else if (depth <= 5 && R() < 0.75) {                    // a short leafy shoot from the side of an older branch
      const sa = unit(add(d2, mul(unit(add(mul(perp(d2), R() < 0.5 ? 1 : -1), mul(rv(), 0.8))), 0.9))), sl = 0.16 + 0.2 * R(), e = add(mid, mul(sa, sl));
      segs.push({ a: mid, b: e, w0: girth(0.6), w1: girth(0) });
      twig(add(mid, mul(sa, sl * 0.5)), sa, sl * 0.5 + 0.08, girth(0));
    }
    if (depth === 0) return;
    const kids = depth === TOP ? 5 : R() < (depth > 4 ? 0.4 : 0.12) ? 3 : 2, side = perp(d2), other = cross(d2, side), turn = R() * 6.283;
    for (let i = 0; i < kids; i++) {
      const az = turn + i * 6.283 / kids + (R() - 0.5) * 0.6, tilt = (depth === TOP ? 0.62 : depth > 4 ? 0.5 : 0.42) + (R() - 0.5) * 0.25;
      let c = unit(add(mul(d2, Math.cos(tilt)), mul(add(mul(side, Math.cos(az)), mul(other, Math.sin(az))), Math.sin(tilt))));
      if (c[1] < 0.02) c = unit([c[0], 0.02, c[2]]);       // no branch points below level
      const dn = depth < TOP - 1 && depth > 1 && R() < 0.3 ? depth - 2 : depth - 1;
      grow(end, c, depth === TOP ? 0.75 + 0.25 * R() : length * (0.7 + 0.24 * R()), dn);
    }
  };
  grow([0, 0, 0], unit([0.04, 1, 0.02]), 0.5, TOP);

  // how much sun a leaf gets: 0 deep in the crown, 1 on its outside and top
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const l of leaves) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], l.node[k]); hi[k] = Math.max(hi[k], l.node[k]); }
  const c = [(lo[0] + hi[0]) / 2, mix(lo[1], hi[1], 0.42), (lo[2] + hi[2]) / 2], rx = (hi[0] - lo[0]) / 2, rz = (hi[2] - lo[2]) / 2, ry = hi[1] - c[1];
  for (const l of leaves) {
    const dx = (l.node[0] - c[0]) / rx, dz = (l.node[2] - c[2]) / rz, dy = (l.node[1] - c[1]) / (l.node[1] > c[1] ? ry : (c[1] - lo[1]) * 1.5);
    l.sunny = clamp((Math.hypot(dx, dy, dz) - 0.45) / 0.5 + (l.r3 - 0.5) * 0.35);
    l.T = timetable(l.sunny, l.r1, l.r2);
  }

  // the leaf the page follows: at the end of a low twig on the near left, hanging clear of the others
  const fu = unit([-0.4, -0.2, 0.9]), ff = frame(fu, [0, 0.92, 0.36]), fsd = unit(add(fu, [0, -0.5, 0]));   // held out nearly flat, its upper side tipped a little toward the viewer
  const look = unit(sub([-0.3, 0, -1], mul(ff.n, dot([-0.3, 0, -1], ff.n))));               // the way the close-up views look across the blade: away from the viewer, clear of the crown
  const fpl = 0.04, flen = 0.085;
  const want = [c[0] - 0.55 * rx, lo[1] + 0.3 * (hi[1] - lo[1]), c[2] + 0.6 * rz];
  let tip = nodes[0], best = 1e9;
  for (const n of nodes) {
    if (!n.tip) continue;
    const mid = add(add(n.p, mul(fsd, fpl)), mul(fu, flen * 0.45)); let crowd = 0;          // branches near the blade, or between it and where it is watched from, would fill the close-up
    for (const s of segs) { const m = sub(mul(add(s.a, s.b), 0.5), mid), along = dot(m, ff.n), off = len(sub(m, mul(ff.n, along))); if ((along > -0.4 && along < 0.6 && off < 0.1 + s.w0 + Math.abs(along) * 0.3) && len(sub(s.b, n.p)) > 0.02) crowd++; }
    const d = len(sub(n.p, want)) + crowd * 0.25;
    if (d < best) { best = d; tip = n; }
  }
  const focus = { look, node: tip.p, sd: fsd, pl: fpl, ...ff, len: flen, r1: 0.5, r2: 0.5, r3: 0.5, r4: 0.5, sunny: 1, T: FOCUS, focus: true };
  const fm = add(add(focus.node, mul(fsd, fpl)), mul(fu, flen * 0.45));
  const kept = leaves.filter((l) => { const m = sub(add(add(l.node, mul(l.sd, l.pl)), mul(l.u, l.len * 0.45)), fm), along = dot(m, ff.n), off = len(sub(m, mul(ff.n, along))); const al = dot(m, look), ol = len(sub(m, mul(look, al))); return !(along > -0.5 && along < 0.6 && off < 0.2 + Math.abs(along) * 0.36) && !(al > 0 && al < 0.9 && ol < 0.08 + al * 0.3); });
  kept.push(focus);
  for (const l of kept) {                                   // where it comes to rest on the lawn, and how it lies there
    const b = add(l.node, mul(l.sd, l.pl)), a = l.focus ? 2.2 : l.r3 * 6.283;
    l.g = l.focus ? [b[0] - 0.3, 0.006, b[2] + 0.45] : [b[0] + (l.r2 - 0.5) * 2.4 + 0.25, 0.004 + 0.01 * l.r1, b[2] + (l.r4 - 0.5) * 2.4];
    l.rest = frame([Math.cos(a), 0, Math.sin(a)], l.focus ? [0.06, 1, 0.1] : [(l.r1 - 0.5) * 0.5, 1, (l.r2 - 0.5) * 0.5]).q;
    l.spin = unit([l.r2 - 0.5, l.r3 - 0.5, l.r4 - 0.5 + 0.01]);
  }
  return { segs, nodes, leaves: kept, focus, bounds: { x0: lo[0], x1: hi[0], y0: lo[1], y1: hi[1], z0: lo[2], z1: hi[2] }, centre: c };
}

// Where a leaf is on a given day and how it is turned: on its twig, in the air, or on the lawn. Writes into `o`.
// o.pos is the foot of the blade (the end of its stalk); o.q turns the blade; o.calm is o.q without the tumbling.
export function place(l, day, o = {}) {
  const p = pigments(day, l.T);
  o.p = p; o.size = p.size;
  const base = add(l.node, mul(l.sd, l.pl * p.size));
  if (p.fall <= 0) { o.pos = base; o.q = o.calm = l.q; o.state = 0; return o; }
  const t = p.fall, e = t * t * (3 - 2 * t), sway = (l.focus ? 0.05 : 0.22) * Math.sin(Math.PI * t);
  o.pos = [mix(base[0], l.g[0], e) + Math.sin(t * 9.4 + l.r3 * 6) * sway, mix(base[1], l.g[1], Math.pow(t, 1.25)), mix(base[2], l.g[2], e) + Math.cos(t * 7.7 + l.r1 * 6) * sway];
  o.calm = slerp(l.q, l.rest, e);
  o.q = qmul(qaxis(l.spin, Math.sin(t * 12 + l.r1 * 6) * (l.focus ? 0.3 : 1.1) * Math.sin(Math.PI * t)), o.calm);
  o.state = t >= 1 ? 2 : 1;
  return o;
}
