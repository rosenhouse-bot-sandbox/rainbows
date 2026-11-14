// The three pigment molecules as skeletons, in nanometres: where the atoms are and which are joined.
// Each is flat here (real ones are nearly so across their rings); hydrogen atoms are left out.
// `conj` lists the bonds of the run of alternating single and double bonds, whose shared electrons
// take in visible light; `rest` lists the others.
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

const key = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);
// Gathers a molecule's atoms from its bonds. mark(p) names the element of an atom that is not carbon.
function build(conj, rest, mark) {
  const atoms = new Map();
  for (const [a, b] of [...conj, ...rest]) for (const p of [a, b]) if (!atoms.has(key(p))) atoms.set(key(p), { p, el: mark(p) || 'C' });
  return { conj, rest, atoms: [...atoms.values()] };
}
export function pigmentShapes() {
  const c = chlorophyll(), k = carotene(), y = cyanidin(), near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-3;
  return {
    chl: build(c.ring, [...c.rest, ...c.tail, ...c.mg], (p) => Math.hypot(p[0], p[1]) < 1e-3 ? 'Mg' : Math.abs(Math.hypot(p[0], p[1]) - 0.205) < 1e-3 ? 'N' : null),
    car: build(k.chain, k.rest, () => null),
    anth: build(y.ring, y.rest, (p) => y.dots.some((d) => near(d, p)) ? 'O' : null),
  };
}
