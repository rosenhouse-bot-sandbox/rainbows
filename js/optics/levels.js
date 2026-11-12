// The challenges. Each one is a brief, a few things the player can change, a scene built from
// those, and a score read off the traced rays. Text here states what the model does; every number
// shown while playing is computed from the trace.

import { AIR, BK7, CR39, EYE, GREEN } from './glass.js';
import { trace, beam, lens, seg, arc, mirror } from './trace.js';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const f0 = (v) => v.toFixed(0), f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);
const signed = (v, d) => (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(d);
const mm = (R) => (isFinite(R) && Math.abs(R) < 1e5 ? f0(Math.abs(R)) + ' mm' : 'flat');

// Light that arrives at the target, as numbers. `ring` weights each ray by its distance from the
// axis: on the axis of a round lens, a ray at height s stands for a ring of light of radius s.
function tally(scene, rays, ring) {
  let all = 0, got = 0, u2 = 0, via = 0, viaGot = 0;
  const hits = [];
  for (const r of rays) {
    const w = ring ? Math.abs(r.s) : 1, o = trace(scene, r);
    all += w;
    const used = o.tags.has('part');
    if (used) via += w;
    if (o.end === 'target') { got += w; u2 += w * o.u * o.u; hits.push(o.u, w); if (used) viaGot += w; }
  }
  return { share: all ? got / all : 0, viaShare: via ? viaGot / via : 0, via: all ? via / all : 0,
    blur: got ? 2 * Math.sqrt(u2 / got) : Infinity, hits };
}

// Handles: how a drag on the picture changes a setting. `hit` says how near a point (in world
// units, with px per unit) is, or Infinity; `start` remembers the grab; `move` returns the value.
const slideX = (param, x, h, pad, ky) => ({ param, cursor: 'ew', knobs: [[x, ky]],
  hit: (wx, wy, k) => (Math.abs(wy) <= h + pad + 10 / k && Math.abs(wx - x) * k <= 26 ? Math.abs(wx - x) : Infinity),
  start: (wx, wy, v) => v - wx, move: (wx, wy, c) => wx + c });

export const LEVELS = [
  // ───────────────────────────────────────────────────────────── 1
  {
    id: 'burn', nav: 'Burning glass', unit: 'mm', scale: 'Bench 120 mm long',
    title: 'Light the match',
    brief: 'Sunlight arrives from the left as parallel rays. Slide the magnifying glass along its rail and change how strongly its faces curve until the light meets on the match head.',
    learned: 'A lens that bulges in the middle bends parallel rays to one meeting point, its focus. The distance from lens to focus is the focal length, and stronger curves make it shorter. Look at the outermost rays: they cross a little early. That is spherical aberration, and it comes back in the camera challenge. The Sun is traced here as a single far-off point; its real image here would be a disc more than half a millimetre across.',
    key: [['k-ray', 'Sunlight, one colour (550 nm)'], ['k-glass', 'Crown glass lens'], ['k-target', 'Match head, 1.5 mm']],
    bounds: [-112, -25, 14, 25],
    params: [
      { id: 'x', label: 'Lens position', min: -78, max: -42, step: 0.25, value: -50, show: (v) => f1(-v) + ' mm from the match' },
      { id: 'c', label: 'Curve of the faces', min: 5, max: 25, step: 0.1, value: 6.5, show: (v) => 'radius ' + f0(1000 / v) + ' mm' },
    ],
    build(p) {
      const R = 1000 / p.c;
      const L = lens({ x: p.x, h: 15, R1: R, R2: -R, mat: BK7, tag: 'part' });
      const surfaces = [...L.surfaces,
        seg(0, -0.75, 0, 0.75, { act: 'target' })];
      const src = { ox: -112, oy: 0, half: 14.6, nm: GREEN };
      return { surfaces, ring: true, L,
        draw: beam({ ...src, n: 15 }), probe: beam({ ...src, n: 241 }),
        items: [{ t: 'axis' }, { t: 'rail', x0: -78, x1: -42, y: -21 }, { t: 'post', x: p.x, y0: -15, y1: -21 },
          { t: 'glass', outline: L.outline }, { t: 'match', x: 0, r: 0.75 }],
        handles: [slideX('x', p.x, 15, 6, -21)] };
    },
    score(m, b, p) {
      return { solved: m.viaShare >= 0.9,
        meters: [{ label: 'Light on the match head', text: f0(m.viaShare * 100) + '%', goal: '90% or more', frac: m.viaShare / 0.9 }],
        rows: [['Focal length of the lens', f1(b.L.focal(GREEN)) + ' mm'], ['Lens to match', f1(-p.x) + ' mm']] };
    },
  },
  // ───────────────────────────────────────────────────────────── 2
  {
    id: 'specs', nav: 'Eyeglasses', unit: 'mm', scale: 'Eye 23.5 mm long',
    title: 'Fit a pair of glasses',
    brief: 'This eye is a little too long, so light from a distant point meets in front of the retina and lands as a blur: nearsightedness. Choose the power of the spectacle lens that puts the focus back on the retina.',
    learned: 'A lens that is thinner in the middle spreads light, which pushes the focus further back. Opticians measure power in dioptres, one over the focal length in metres, negative for a spreading lens. The stroke of a letter on the 20/20 line covers about 5 µm of retina. This one-surface model eye cannot do better than about 16 µm, because a sphere is not the ideal shape; a real cornea flattens toward its edge.',
    key: [['k-ray', 'Light from a far-off point (550 nm)'], ['k-glass', 'Spectacle lens, 12 mm from the eye'], ['k-target', 'Retina'], ['k-inset', 'Inset: the spot on the retina, magnified. The ring is the goal.']],
    bounds: [-42, -14.5, 27, 14.5],
    params: [
      { id: 'P', label: 'Power of the lens', min: -8, max: 4, step: 0.25, value: 0, show: (v) => signed(v, 2) + ' D' },
    ],
    build(p) {
      const LEN = 23.45, RB = 11.2, cx = LEN - RB, RC = 5.55;
      // where the corneal bulge meets the eyeball
      const xj = (RB * RB - RC * RC - cx * cx + RC * RC) / (2 * (RC - cx)), hj = Math.sqrt(RC * RC - (xj - RC) ** 2);
      const R = p.P ? 2 * (CR39.n(GREEN) - 1) / p.P * 1000 : Infinity;
      const L = lens({ x: -12, h: 9, R1: R, R2: -R, mat: CR39, tag: 'part' });
      const pupil = 1.5;
      const surfaces = [...L.surfaces,
        arc(RC, 0, RC, -1, hj, { act: 'refract', nL: AIR, nR: EYE }),
        arc(cx, 0, RB, -1, RB, { act: 'absorb', hmin: hj }),
        seg(xj, pupil, xj, hj, { act: 'absorb' }), seg(xj, -pupil, xj, -hj, { act: 'absorb' }),
        arc(cx, 0, RB, 1, RB, { act: 'target' })];
      const src = { ox: -42, oy: 0, nm: GREEN };
      return { surfaces, ring: true, L, R,
        draw: beam({ ...src, half: 7, n: 15 }), probe: beam({ ...src, half: 2.4, n: 241 }),
        spot: { goal: 0.020, unit: 'µm', per: 1000 },
        items: [{ t: 'axis' }, { t: 'eye', cx, RB, RC, xj, hj, pupil }, { t: 'glass', outline: L.outline }],
        handles: [] };
    },
    score(m, b, p) {
      const um = m.blur * 1000;
      return { solved: um <= 20,
        meters: [{ label: 'Blur on the retina', text: isFinite(um) ? f0(um) + ' µm' : 'no light', goal: '20 µm or less', frac: 20 / um }],
        rows: [['Lens power', signed(p.P, 2) + ' D'], ['Its focal length', p.P ? signed(b.L.focal(GREEN), 0) + ' mm' : 'none (flat)']] };
    },
  },
  // ───────────────────────────────────────────────────────────── 3
  {
    id: 'camera', nav: 'Camera lens', unit: 'mm', scale: 'Lens 26 mm across',
    title: 'A sharp, bright camera lens',
    brief: 'One 50 mm lens, a distant point of light, and a sensor that slides itself to the best focus. Wide open the picture is bright but soft. Closing the iris sharpens it and throws light away. Find a lens shape that is sharp without closing down past f/4.',
    learned: 'Rays through the edge of a spherical lens bend too much and cross early: spherical aberration. It grows steeply with the opening, so closing the iris cures it, at the cost of light. Shape matters as well. With the curved face toward the distant scene both faces share the bending, and the blur is about a quarter of what the same glass gives turned round. Real camera lenses stack several elements so the errors of one cancel those of the next. Only light along the axis is traced here; off-axis blurs and colour are for later challenges.',
    key: [['k-ray', 'Light from a far-off point (550 nm)'], ['k-glass', 'Crown glass lens, 50 mm'], ['k-stop', 'Iris'], ['k-target', 'Sensor'], ['k-inset', 'Inset: the spot on the sensor, magnified. The ring is the goal.']],
    bounds: [-46, -20, 64, 20],
    params: [
      { id: 'q', label: 'Lens shape', min: -1, max: 1, step: 0.05, value: -1, show: (v, b) => 'front ' + mm(b.R1) + ', back ' + mm(b.R2) },
      { id: 'D', label: 'Iris opening', min: 4, max: 24, step: 0.1, value: 24, show: (v, b) => f1(v) + ' mm, f/' + f1(b.fnum) },
    ],
    build(p) {
      const n = BK7.n(GREEN), P = 1 / 50, H = 13, XI = -6;
      const c1 = P * (p.q + 1) / (2 * (n - 1)), c2 = P * (p.q - 1) / (2 * (n - 1));
      const R1 = Math.abs(c1) > 1e-9 ? 1 / c1 : Infinity, R2 = Math.abs(c2) > 1e-9 ? 1 / c2 : Infinity;
      const L = lens({ x: 0, h: H, R1, R2, mat: BK7, tag: 'part' });
      const open = p.D / 2;
      const front = [...L.surfaces,
        seg(XI, open, XI, 18, { act: 'absorb' }), seg(XI, -open, XI, -18, { act: 'absorb' })];
      const src = { ox: -46, oy: 0, nm: GREEN };
      const probe = beam({ ...src, half: Math.min(open, H) * 0.999, n: 241 });
      // Autofocus: each ray leaves the lens as a straight line y = a + b·x, so the plane where the
      // ring-weighted mean square height is least has a closed form.
      let sab = 0, sbb = 0;
      const free = { surfaces: front, bounds: this.bounds };
      for (const r of probe) {
        const o = trace(free, r), k = o.pts.length;
        if (o.end !== 'out' || k < 6) continue;
        const bb = (o.pts[k - 1] - o.pts[k - 3]) / (o.pts[k - 2] - o.pts[k - 4]), a = o.pts[k - 1] - bb * o.pts[k - 2], w = Math.abs(r.s);
        sab += w * a * bb; sbb += w * bb * bb;
      }
      const xs = clamp(sbb ? -sab / sbb : 50, 30, 60);
      const f = L.focal(GREEN);
      return { surfaces: [...front, seg(xs, -12, xs, 12, { act: 'target' })], ring: true, L, R1, R2, xs, f, fnum: f / p.D,
        draw: beam({ ...src, half: 12.6, n: 15 }), probe,
        spot: { goal: 0.040, unit: 'µm', per: 1000 },
        items: [{ t: 'axis' }, { t: 'glass', outline: L.outline }, { t: 'iris', x: XI, open, h: 18 }, { t: 'sensor', x: xs, h: 12 }],
        // Drag a blade up or down: a tenth of a millimetre of opening for each pixel, so a thumb
        // can find f/4. The knob follows more slowly than the finger.
        handles: [{ param: 'D', cursor: 'ns', knobs: [[XI, open], [XI, -open]],
          hit: (wx, wy, k) => (Math.abs(wx - XI) * k <= 26 && Math.abs(wy) >= open - 16 / k && Math.abs(wy) <= 18 + 16 / k ? Math.abs(wx - XI) : Infinity),
          start: (wx, wy, v, k) => ({ v, wy, k, up: wy < 0 ? -1 : 1 }), move: (wx, wy, c) => c.v + (wy - c.wy) * c.up * c.k * 0.1 }] };
    },
    score(m, b, p) {
      const um = m.blur * 1000, okB = um <= 40, okN = b.fnum < 4.05;       // what the readout shows as f/4.0
      return { solved: okB && okN,
        meters: [{ label: 'Blur on the sensor', text: f0(um) + ' µm', goal: '40 µm or less', frac: 40 / um },
          { label: 'Brightness', text: 'f/' + f1(b.fnum), goal: 'f/4 or a smaller number', frac: okN ? 1 : 4 / b.fnum * 0.96 }],
        rows: [['Focal length', f1(b.f) + ' mm'], ['Light let through, against wide open', f0(100 * (p.D / 24) ** 2) + '%'], ['Sensor sits', f1(b.xs - b.L.v2) + ' mm behind the lens']] };
    },
  },
  // ───────────────────────────────────────────────────────────── 4
  {
    id: 'tower', nav: 'Solar tower', unit: 'm', scale: 'Tower 100 m tall',
    title: 'Aim the heliostats',
    brief: 'A solar power tower boils its working fluid with sunlight bounced off a field of flat mirrors. The Sun stands 40° above the horizon behind the field. Tilt each mirror so that its light lands on the boiler at the top of the tower.',
    learned: 'A mirror sends light off at the same angle it arrived at, so each mirror must face exactly halfway between the Sun and the boiler. That is why every mirror in the field needs its own tilt, and why, as the Sun crosses the sky, each one turns at half the Sun’s rate. Real plants steer thousands of mirrors this way all day. The Sun is traced here as a point; its half-degree width smears each beam by about a metre over these distances.',
    key: [['k-ray', 'Sunlight headed for the mirrors (the rest is not drawn)'], ['k-mirror', 'Heliostat mirrors, 8 m'], ['k-target', 'Boiler']],
    bounds: [8, -11, 166, 112],
    hint: 'Drag a knob sideways to tilt its mirror, or use the sliders',
    params: [0, 1, 2].map((i) => ({ id: 't' + i, label: ['Near', 'Middle', 'Far'][2 - i] + ' mirror tilt', min: -25, max: 25, step: 0.25, value: [14, -14, 12][i],
      show: (v) => (v ? f2(Math.abs(v)) + '° ' + (v > 0 ? 'toward the tower' : 'toward the Sun') : 'level') })),
    build(p) {
      const SUN = 40 * DEG, XT = 150, PIV = [[22, 7], [64, 7], [106, 7]], W = 8;
      const dir = -SUN;                                    // the light travels down and to the right
      const surfaces = [
        seg(XT, 82, XT, 100, { act: 'target' }),
        seg(XT, 0, XT, 82, { act: 'absorb' }), seg(XT, 100, XT + 9, 100, { act: 'absorb' }), seg(XT + 9, 0, XT + 9, 100, { act: 'absorb' }),
        seg(-400, 0, 400, 0, { act: 'absorb' })];
      const draw = [], probe = [], items = [{ t: 'ground' }, { t: 'tower', x: XT, w: 9, y0: 82, y1: 100 }], handles = [];
      PIV.forEach(([px, py], i) => {
        const tilt = p['t' + i], phi = (90 - tilt) * DEG;
        const m = mirror(px, py, phi, W, { tag: 'part' });
        surfaces.push(m);
        items.push({ t: 'heliostat', px, py, m });
        const back = 150, src = { ox: px - Math.cos(dir) * back, oy: py - Math.sin(dir) * back, angle: dir, nm: GREEN };
        draw.push(...beam({ ...src, half: 3.9, n: 5 }));
        probe.push(...beam({ ...src, half: 4, n: 81 }));
        // Drag sideways on a mirror: 0.15° for each pixel, so a thumb can set a quarter of a degree.
        handles.push({ param: 't' + i, cursor: 'ew', knobs: [[px, -6]],
          hit: (wx, wy, k) => (Math.abs(wx - px) * k <= 30 && wy >= -6 - 30 / k && wy <= py + 30 / k ? Math.abs(wx - px) : Infinity),
          start: (wx, wy, v, k) => ({ v, wx, k }), move: (wx, wy, c) => c.v + (wx - c.wx) * c.k * 0.15 });
      });
      return { surfaces, ring: false, draw, probe, items, handles };
    },
    score(m) {
      return { solved: m.viaShare >= 0.9,
        meters: [{ label: 'Mirror light on the boiler', text: f0(m.viaShare * 100) + '%', goal: '90% or more', frac: m.viaShare / 0.9 }],
        rows: [] };
    },
  },
];

// Trace a level at settings p. Returns everything the page draws and reports.
export function run(level, p) {
  const b = level.build(p);
  const scene = { surfaces: b.surfaces, bounds: level.bounds };
  const paths = b.draw.map((r) => trace(scene, r));
  const m = tally(scene, b.probe, b.ring);
  return { b, paths, m, score: level.score(m, b, p) };
}
