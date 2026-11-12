// A small exact ray tracer in the plane. No thin-lens or small-angle shortcuts: every ray meets
// every surface where it really is and bends by Snell's law, so spherical aberration is in the
// picture because it is in the geometry. Lengths are in the level's own unit (mm or m).
//
// A scene is a list of surfaces. Each is a straight segment or an arc of a circle, and does one
// thing to a ray: refract, mirror, absorb, or absorb and count (target).

const EPS = 1e-7;

export function seg(ax, ay, bx, by, extra) { return { kind: 'seg', ax, ay, bx, by, ...extra }; }
// The part of the circle (cx, cy, r) on the `side` of its centre (-1: left half, +1: right half)
// within `h` of the axis y = cy (and, with `hmin`, no nearer to it than that).
export function arc(cx, cy, r, side, h, extra) { return { kind: 'arc', cx, cy, r, side, h, hmin: 0, ...extra }; }

// A flat mirror of width w turning about (px, py), silvered on the side its normal (at angle phi,
// radians anticlockwise from +x) points to. The back absorbs.
export function mirror(px, py, phi, w, extra) {
  const tx = -Math.sin(phi) * w / 2, ty = Math.cos(phi) * w / 2;
  const s = seg(px - tx, py - ty, px + tx, py + ty, { act: 'mirror', ...extra });
  const [nx, ny] = normalAt(s);
  s.face = Math.sign(nx * Math.cos(phi) + ny * Math.sin(phi)) || 1;
  return s;
}

function hitSeg(s, x, y, dx, dy) {
  const ex = s.bx - s.ax, ey = s.by - s.ay;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-14) return Infinity;
  const t = ((s.ax - x) * ey - (s.ay - y) * ex) / den;
  const u = ((s.ax - x) * dy - (s.ay - y) * dx) / den;
  return t > EPS && u >= 0 && u <= 1 ? t : Infinity;
}

function hitArc(s, x, y, dx, dy) {
  const ox = x - s.cx, oy = y - s.cy;
  const b = ox * dx + oy * dy, c = ox * ox + oy * oy - s.r * s.r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const q = Math.sqrt(disc);
  for (const t of [-b - q, -b + q]) {
    if (t <= EPS) continue;
    const px = ox + dx * t, py = oy + dy * t;
    if (px * s.side > 0 && Math.abs(py) <= s.h && Math.abs(py) >= s.hmin) return t;
  }
  return Infinity;
}

// Unit normal at a point of the surface, pointing to the surface's left (-x) side; for a segment
// that runs along x, pointing up.
function normalAt(s, px, py) {
  let nx, ny;
  if (s.kind === 'arc') { nx = (px - s.cx) / s.r; ny = (py - s.cy) / s.r; }
  else { const ex = s.bx - s.ax, ey = s.by - s.ay, l = Math.hypot(ex, ey); nx = -ey / l; ny = ex / l; }
  if (nx > 1e-12 || (Math.abs(nx) <= 1e-12 && ny < 0)) { nx = -nx; ny = -ny; }
  return [nx, ny];
}

// Follow one ray {x, y, dx, dy, nm} through the scene. Returns the points of its path, how it
// ended ('target', 'absorbed', 'out'), the surface it ended on, where on that surface (u: the
// height above the surface's axis for an arc, the distance from the segment's middle otherwise),
// and the tags of the surfaces it met on the way.
export function trace(scene, ray) {
  let { x, y, dx, dy } = ray;
  const l = Math.hypot(dx, dy); dx /= l; dy /= l;
  const pts = [x, y], tags = new Set();
  let end = 'out', last = null, u = 0;
  for (let hop = 0; hop < 40; hop++) {
    let best = Infinity, bs = null;
    for (const s of scene.surfaces) {
      const t = s.kind === 'arc' ? hitArc(s, x, y, dx, dy) : hitSeg(s, x, y, dx, dy);
      if (t < best) { best = t; bs = s; }
    }
    if (!bs) {                       // nothing ahead: run to the edge of the world
      const [x0, y0, x1, y1] = scene.bounds;
      let t = Infinity;
      if (dx > 0) t = Math.min(t, (x1 - x) / dx); else if (dx < 0) t = Math.min(t, (x0 - x) / dx);
      if (dy > 0) t = Math.min(t, (y1 - y) / dy); else if (dy < 0) t = Math.min(t, (y0 - y) / dy);
      if (t > 0 && isFinite(t)) pts.push(x + dx * t, y + dy * t);
      break;
    }
    x += dx * best; y += dy * best; pts.push(x, y);
    if (bs.tag) tags.add(bs.tag);
    last = bs;
    if (bs.act === 'absorb' || bs.act === 'target') {
      end = bs.act === 'target' ? 'target' : 'absorbed';
      u = bs.kind === 'arc' ? y - bs.cy
        : ((x - (bs.ax + bs.bx) / 2) * (bs.bx - bs.ax) + (y - (bs.ay + bs.by) / 2) * (bs.by - bs.ay)) / Math.hypot(bs.bx - bs.ax, bs.by - bs.ay);
      break;
    }
    let [nx, ny] = normalAt(bs, x, y);
    let dn = dx * nx + dy * ny;
    if (bs.act === 'mirror') {
      // one-sided: `face` is +1 when the silvered side is the one the stored normal points to
      if (bs.face && dn * bs.face > 0) { end = 'absorbed'; break; }   // met from behind
      dx -= 2 * dn * nx; dy -= 2 * dn * ny;
      continue;
    }
    // refract: the normal points left, so a ray with dn < 0 is travelling left to right
    let n1 = bs.nL.n(ray.nm), n2 = bs.nR.n(ray.nm);
    if (dn > 0) { nx = -nx; ny = -ny; dn = -dn; [n1, n2] = [n2, n1]; }
    const eta = n1 / n2, cosi = -dn, k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) { dx -= 2 * dn * nx; dy -= 2 * dn * ny; }                // total internal reflection
    else { const f = eta * cosi - Math.sqrt(k); dx = eta * dx + f * nx; dy = eta * dy + f * ny; }
  }
  return { pts, end, surface: last, u, tags };
}

// A bundle of parallel rays: `n` of them, evenly spaced across a width 2·half centred on (ox, oy),
// travelling at `angle` (radians, anticlockwise from +x). Each carries s, its offset across the beam.
export function beam({ ox, oy, angle = 0, half, n, nm }) {
  const dx = Math.cos(angle), dy = Math.sin(angle), rays = [];
  for (let i = 0; i < n; i++) {
    const s = n === 1 ? 0 : -half + 2 * half * i / (n - 1);
    rays.push({ x: ox - dy * s, y: oy + dx * s, dx, dy, nm, s });
  }
  return rays;
}

// A lens with spherical faces on the axis y = 0, centred at x. R1 is the front (left) face and R2
// the back, both signed the usual way: positive when the centre of curvature is to the right.
// Infinity is flat. The lens is as thin as it can be with `tmin` of glass left at its thinnest.
// Returns the surfaces, an outline to draw, and the numbers that follow from the shape.
export function lens({ x, h, R1, R2, mat, tmin = 1.2, tag }) {
  const flat = (R) => !isFinite(R) || Math.abs(R) > 1e5;
  const sag = (R) => flat(R) ? 0 : Math.sign(R) * (Math.abs(R) - Math.sqrt(R * R - h * h));
  const s1 = sag(R1), s2 = sag(R2);
  const t = tmin + Math.max(0, s1 - s2);
  const v1 = x - t / 2, v2 = x + t / 2;
  const face = (v, R, nL, nR) => flat(R)
    ? seg(v, -h, v, h, { act: 'refract', nL, nR, tag })
    : arc(v + R, 0, Math.abs(R), -Math.sign(R), h, { act: 'refract', nL, nR, tag });
  const air = { n: () => 1 };
  const surfaces = [
    face(v1, R1, air, mat), face(v2, R2, mat, air),
    seg(v1 + s1, h, v2 + s2, h, { act: 'absorb' }), seg(v1 + s1, -h, v2 + s2, -h, { act: 'absorb' }),
  ];
  const outline = [];
  const N = 24;
  const fx = (v, R, y) => flat(R) ? v : v + R - Math.sign(R) * Math.sqrt(R * R - y * y);
  for (let i = 0; i <= N; i++) { const y = -h + 2 * h * i / N; outline.push(fx(v1, R1, y), y); }
  for (let i = N; i >= 0; i--) { const y = -h + 2 * h * i / N; outline.push(fx(v2, R2, y), y); }
  // Paraxial focal length of the thick lens (the lensmaker's equation), at wavelength nm.
  const focal = (nm) => {
    const n = mat.n(nm), c1 = flat(R1) ? 0 : 1 / R1, c2 = flat(R2) ? 0 : 1 / R2;
    return 1 / ((n - 1) * (c1 - c2 + (n - 1) * t * c1 * c2 / n));
  };
  return { surfaces, outline, t, edge: t - s1 + s2, v1, v2, focal, x, h };
}
