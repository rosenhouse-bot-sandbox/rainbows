// The challenges. Each one is a brief, a few things the player can change, a scene built from
// those, and a score read off the traced rays. Text here states what the model does; every number
// shown while playing is computed from the trace.

import { AIR, BK7, F2, SF10, CAF2, CR39, EYE, GREEN, WHITE, abbe } from './glass.js';
import { trace, beam, lens, stack, paraxial, seg, arc, mirror } from './trace.js';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const f0 = (v) => v.toFixed(0), f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);
const signed = (v, d) => (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(d);
const mm = (R) => (isFinite(R) && Math.abs(R) < 1e5 ? f0(Math.abs(R)) + ' mm' : 'flat');
// A face of a lens in words: `out` is -1 for a front face, +1 for a back face.
const side = (R, out) => (isFinite(R) && Math.abs(R) < 1e5 ? (Math.sign(R) === -out ? 'bulging ' : 'hollow ') + f0(Math.abs(R)) : 'flat');

// Light that arrives at the target, as numbers. `ring` weights each ray by its distance from the
// axis: on the axis of a round lens, a ray at height s stands for a ring of light of radius s.
// Rays may carry a group number c (a wavelength, or a direction); each group is also tallied alone,
// with its blur measured about the axis (`blur`) and about its own middle (`spread`).
function tally(scene, rays, ring) {
  let all = 0, got = 0, u2 = 0, via = 0, viaGot = 0;
  const hits = [], groups = [];
  for (const r of rays) {
    const w = ring ? Math.abs(r.s) : 1, o = trace(scene, r), c = r.c || 0;
    const G = groups[c] || (groups[c] = { w: 0, u: 0, u2: 0 });
    all += w;
    const used = o.tags.has('part');
    if (used) via += w;
    if (o.end === 'target') { got += w; u2 += w * o.u * o.u; hits.push(o.u, w, c); if (used) viaGot += w; G.w += w; G.u += w * o.u; G.u2 += w * o.u * o.u; }
  }
  for (const G of groups) {
    G.blur = G.w ? 2 * Math.sqrt(G.u2 / G.w) : Infinity;
    G.spread = G.w ? 2 * Math.sqrt(Math.max(0, G.u2 / G.w - (G.u / G.w) ** 2)) : Infinity;
  }
  return { share: all ? got / all : 0, viaShare: via ? viaGot / via : 0, via: all ? via / all : 0,
    blur: got ? 2 * Math.sqrt(u2 / got) : Infinity, hits, groups };
}

// White light: the same bundle at each of three wavelengths.
const white = (src, n) => WHITE.flatMap((col, c) => beam({ ...src, n, nm: col.nm }).map((r) => ({ ...r, c, rgb: col.rgb })));
// Where the rays that leave a lens (a list of traces, with their weights) are tightest about the axis.
function bestFocus(scene, rays) {
  let sab = 0, sbb = 0;
  for (const r of rays) {
    const o = trace(scene, r), k = o.pts.length;
    if (o.end !== 'out' || k < 6) continue;
    const bb = (o.pts[k - 1] - o.pts[k - 3]) / (o.pts[k - 2] - o.pts[k - 4]), a = o.pts[k - 1] - bb * o.pts[k - 2], w = Math.abs(r.s);
    sab += w * a * bb; sbb += w * bb * bb;
  }
  return sbb ? -sab / sbb : NaN;
}
const GLASSES = [CAF2, BK7, F2, SF10];
// (the rows are always there, so the readout keeps its height when a lens stops focusing)
const focusRows = (surfaces, from, ok = true) => WHITE.map((col) => [f0(col.nm) + ' nm focuses', ok ? f1(paraxial(surfaces, col.nm).at - from) + ' mm behind' : 'nowhere']);

// A bar that fills as the picture gets sharper. The player is after sharpness, so that is what the
// bar is called and what grows; the number beside it is the blur, which shrinks.
const sharp = (label, um, goal, digits = 0) => ({ label, goal: `blur ${goal} µm or less`, ok: um <= goal, frac: goal / um,
  text: isFinite(um) ? 'blur ' + um.toFixed(um < 10 ? digits : 0) + ' µm' : 'no light' });
// A quantity that has to land inside a band: drawn as a marker on a scale, not as a bar that fills.
const band = (label, value, lo, hi, min, max, text) => ({ label, text, goal: `${lo} to ${hi} mm`, ok: value >= lo && value <= hi, range: { lo, hi, min, max, value } });

// Handles: how a drag on the picture changes a setting. `hit` says how near a point (in world
// units, with px per unit) is, or Infinity; `start` remembers the grab; `move` returns the value.
const slideX = (param, x, h, pad, ky) => ({ param, cursor: 'ew', knobs: [[x, ky]],
  hit: (wx, wy, k) => (Math.abs(wy) <= h + pad + 10 / k && Math.abs(wx - x) * k <= 26 ? Math.abs(wx - x) : Infinity),
  start: (wx, wy, v) => v - wx, move: (wx, wy, c) => wx + c });

export const LEVELS = [
  // ───────────────────────────────────────────────────────────── 1
  {
    id: 'burn', nav: 'Match', unit: 'mm', scale: 'Bench 120 mm long',
    title: 'Light the match',
    task: 'Slide the lens and change its curve until the sunlight meets on the match head.',
    brief: 'Sunlight arrives from the left as parallel rays. Drag the white knob to slide the lens along its rail.',
    learned: 'A lens that bulges in the middle bends parallel rays to one meeting point, its focus. The distance from lens to focus is the focal length, and stronger curves make it shorter. Look at the outermost rays: they cross a little early. That is spherical aberration, and it comes back in the camera challenge. The Sun is traced here as a single far-off point; its real image here would be a disc more than half a millimetre across.',
    key: [['k-ray', 'Sunlight, one wavelength (550 nm)'], ['k-glass', 'Crown glass lens'], ['k-target', 'Match head, 1.5 mm']],
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
    id: 'specs', nav: 'Glasses', unit: 'mm', scale: 'Eye 23.5 mm long',
    title: 'Fit a pair of glasses',
    task: 'Choose the lens power that puts the focus back on the retina and clears the eye chart.',
    brief: 'This eye is a little too long, so light from a distant point meets in front of the retina and lands as a blur: nearsightedness. The chart shows what the eye makes of an eye chart across the room.',
    learned: 'A lens that is thinner in the middle spreads light, which pushes the focus further back. Opticians measure power in dioptres, one over the focal length in metres, negative for a spreading lens. Look at the lens: the stronger it is, the thicker its edge. A letter on the 20/20 line is only 26 µm tall on the retina, so a blur of 16 µm leaves it soft. This one-surface model eye cannot do better, because a sphere is not the ideal shape; a real cornea flattens toward its edge.',
    key: [['k-ray', 'Light from a far-off point (550 nm)'], ['k-glass', 'Spectacle lens, 40 mm across, 12 mm from the eye'], ['k-target', 'Retina'], ['k-inset', 'Chart: an eye chart as this eye sees it. The bottom row is the 20/20 line.']],
    bounds: [-27, -21.5, 25, 21.5], aside: true,
    params: [
      { id: 'P', label: 'Power of the lens', min: -8, max: 4, step: 0.25, value: 0, show: (v) => signed(v, 2) + ' D' },
    ],
    build(p) {
      const LEN = 23.45, RB = 11.2, cx = LEN - RB, RC = 5.55;
      // where the corneal bulge meets the eyeball
      const xj = (RB * RB - RC * RC - cx * cx + RC * RC) / (2 * (RC - cx)), hj = Math.sqrt(RC * RC - (xj - RC) ** 2);
      const R = p.P ? 2 * (CR39.n(GREEN) - 1) / p.P * 1000 : Infinity;
      const L = lens({ x: -12, h: 20, R1: R, R2: -R, mat: CR39, tmin: 1.5, tag: 'part' });
      const pupil = 1.5;
      const surfaces = [...L.surfaces,
        arc(RC, 0, RC, -1, hj, { act: 'refract', nL: AIR, nR: EYE }),
        arc(cx, 0, RB, -1, RB, { act: 'absorb', hmin: hj }),
        seg(xj, pupil, xj, hj, { act: 'absorb' }), seg(xj, -pupil, xj, -hj, { act: 'absorb' }),
        arc(cx, 0, RB, 1, RB, { act: 'target' })];
      const src = { ox: -27, oy: 0, nm: GREEN };
      // The eye turns about the centre of the cornea's curve, so that far in front of the retina
      // is what turns an angle in the world into a distance on the retina.
      return { surfaces, ring: true, L, R,
        draw: beam({ ...src, half: 9, n: 19 }), probe: beam({ ...src, half: 2.4, n: 241 }),
        chart: { umPerArcmin: (LEN - RC) * 1000 * Math.PI / 10800 },
        items: [{ t: 'axis' }, { t: 'eye', cx, RB, RC, xj, hj, pupil }, { t: 'glass', outline: L.outline }],
        handles: [] };
    },
    score(m, b, p) {
      const um = m.blur * 1000;
      return { solved: um <= 20,
        meters: [sharp('Sharpness on the retina', um, 20)],
        rows: [['Its focal length', p.P ? signed(b.L.focal(GREEN), 0) + ' mm' : 'none (flat)'],
          ['Lens thickness, middle', f1(b.L.t) + ' mm'], ['Lens thickness, edge', f1(b.L.edge) + ' mm']] };
    },
  },
  // ───────────────────────────────────────────────────────────── 3
  {
    id: 'camera', nav: 'Camera', unit: 'mm', scale: 'Lens 26 mm across',
    title: 'A sharp, bright camera lens',
    task: 'Find a lens shape that is sharp without closing the iris past f/4.',
    brief: 'One 50 mm lens, a distant point of light, and a sensor that slides itself to the best focus. Wide open the picture is bright but soft. Closing the iris sharpens it and throws light away. Drag a white knob to open or close the iris.',
    learned: 'Rays through the edge of a spherical lens bend too much and cross early: spherical aberration. It grows steeply with the opening, so closing the iris cures it, at the cost of light. Shape matters as well. With the curved face toward the distant scene both faces share the bending, and the blur is about a quarter of what the same glass gives turned round. Real camera lenses stack several elements so the errors of one cancel those of the next. Only light along the axis is traced here; blur off the axis and other wavelengths are for later challenges.',
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
        meters: [sharp('Sharpness', um, 40),
          // the bar is the light let through, against what f/4 lets through
          { label: 'Brightness', text: 'f/' + f1(b.fnum), goal: 'f/4 or brighter', ok: okN, frac: (4.05 / b.fnum) ** 2 }],
        rows: [['Focal length', f1(b.f) + ' mm'], ['Light let through, against wide open', f0(100 * (p.D / 24) ** 2) + '%'], ['Sensor sits', f1(b.xs - b.L.v2) + ' mm behind the lens']] };
    },
  },
  // ───────────────────────────────────────────────────────────── colour
  {
    id: 'colour', nav: 'Colour', unit: 'mm', scale: 'Lens 16 mm across',
    title: 'Chase the colour fringe',
    task: 'Pick a glass and set the curve for a 100 mm lens that lands the wavelengths closest together.',
    brief: 'White light is a mix of many wavelengths, and glass slows the short ones more than the long ones. So a lens brings short wavelengths, which we see as blue, to a focus nearer than long ones, which we see as red, and a white point lands with coloured fringes. The sensor slides itself to the best focus.',
    learned: 'Every glass bends short wavelengths more than long ones. The Abbe number says how little the bending varies: fluorite, at 95, spreads the wavelengths least, which is why long camera lenses use it. Notice that a glass with a higher index needs gentler curves for the same focal length. No single glass brings every wavelength to one focus, though. With one simple lens this blur, chromatic aberration, is set by the width of the lens and the Abbe number, and nothing else you can change. The cure is the next challenge.',
    key: [['k-ray', 'White light, traced at 486, 546 and 656 nm, each drawn in the colour we see it as. Sharpness counts all three.'], ['k-glass', 'Lens'], ['k-target', 'Sensor'], ['k-inset', 'Inset: the spot on the sensor, magnified. The ring is the goal.']],
    bounds: [-30, -14, 122, 14],
    params: [
      { id: 'glass', label: 'Glass', options: ['Fluorite', 'Crown', 'Flint', 'Dense flint'], value: 3 },
      { id: 'c', label: 'Curve of the faces', min: 5, max: 16, step: 0.25, value: 7, show: (v) => 'radius ' + f0(1000 / v) + ' mm' },
    ],
    build(p) {
      const mat = GLASSES[p.glass], R = 1000 / p.c;
      const L = lens({ x: 0, h: 8, R1: R, R2: -R, mat, tag: 'part' });
      const src = { ox: -30, oy: 0 }, probe = white({ ...src, half: 7.9 }, 81);
      const xs = clamp(bestFocus({ surfaces: L.surfaces, bounds: this.bounds }, probe) || 119, 20, 119);
      return { surfaces: [...L.surfaces, seg(xs, -11, xs, 11, { act: 'target' })], ring: true, L, mat, xs,
        f: paraxial(L.surfaces, WHITE[1].nm).f,
        draw: white({ ...src, half: 7.4 }, 7), probe,
        spot: { goal: 0.070, unit: 'µm', per: 1000 },
        items: [{ t: 'axis' }, { t: 'glass', outline: L.outline }, { t: 'sensor', x: xs, h: 11 }],
        handles: [] };
    },
    score(m, b) {
      const um = m.blur * 1000, okF = b.f >= 90 && b.f <= 110;
      return { solved: um <= 70 && okF,
        meters: [sharp('Sharpness', um, 70),
          band('Focal length', b.f, 90, 110, 60, 140, f0(b.f) + ' mm')],
        rows: [['Index of this glass', b.mat.n(587.56).toFixed(3)], ['Its Abbe number', f0(abbe(b.mat))], ...focusRows(b.L.surfaces, b.L.v2)] };
    },
  },
  // ───────────────────────────────────────────────────────────── doublet
  {
    id: 'doublet', nav: 'Doublet', unit: 'mm', scale: 'Lens 12 mm across',
    title: 'An achromatic doublet',
    task: 'Design a 50 mm lens from two cemented glasses that brings all the wavelengths to one sharp point.',
    brief: 'A crown glass lens in front, and a second lens cemented behind it. Set the curve of the front lens, choose the glass of the second, and shape its back face. Shaped right, the second lens brings the wavelengths that the first one separated back together.',
    learned: 'A lens that spreads light separates the wavelengths the opposite way to one that gathers it. Flint glass separates them nearly twice as strongly as crown for the same bending, so a weak spreading lens of flint cancels all of the crown lens’s chromatic error and only a bit more than half of its power. Made of crown as well, it cannot: cancelling the chromatic error would cancel the focusing too. This is the achromatic doublet (the name means without colour), the front lens of telescopes and binoculars since the 1750s. It trims spherical aberration as well, which is why the spot shrank so far. Dense flint cancels the chromatic error too, but with these shapes it leaves more spherical aberration behind, so the choice of glass pair decides how sharp the lens can be.',
    key: [['k-ray', 'White light, traced at 486, 546 and 656 nm, each drawn in the colour we see it as. Sharpness counts all three.'], ['k-glass', 'Crown lens in front, your lens cemented behind'], ['k-target', 'Sensor'], ['k-inset', 'Inset: the spot on the sensor, magnified. The ring is the goal.']],
    bounds: [-16, -11, 96, 11],
    params: [
      { id: 'c1', label: 'Curve of the front lens', min: 24, max: 60, step: 0.5, value: 30, show: (v) => 'radius ' + f1(1000 / v) + ' mm' },
      { id: 'glass', label: 'Glass of the second lens', options: ['Crown', 'Flint', 'Dense flint'], value: 0 },
      { id: 'c', label: 'Its back face', min: -45, max: 30, step: 0.25, value: -30,
        show: (v) => (Math.abs(v) < 0.126 ? 'flat' : 'radius ' + f0(1000 / Math.abs(v)) + ' mm, ' + (v < 0 ? 'bulging' : 'hollow')) },
    ],
    build(p) {
      const mat = GLASSES[p.glass + 1], RC = 1000 / p.c1, H = 6;
      const K = stack({ x: 0, h: H, R: [RC, -RC, Math.abs(p.c) < 0.126 ? Infinity : 1000 / p.c], mats: [BK7, mat], tag: 'part' });
      const src = { ox: -16, oy: 0 }, probe = white({ ...src, half: H * 0.98 }, 81);
      const far = this.bounds[2] - 3, x = bestFocus({ surfaces: K.surfaces, bounds: this.bounds }, probe);
      const xs = x > K.back + 4 && x < far ? x : far;                 // no focus on the bench: park the sensor at the end
      return { surfaces: [...K.surfaces, seg(xs, -9, xs, 9, { act: 'target' })], ring: true, K, mat, xs,
        f: paraxial(K.surfaces, WHITE[1].nm).f,
        draw: white({ ...src, half: H * 0.93 }, 7), probe,
        spot: { goal: 0.006, unit: 'µm', per: 1000 },
        items: [{ t: 'axis' }, { t: 'glass', outline: K.outlines[0] }, { t: 'glass', outline: K.outlines[1], flint: p.glass > 0 }, { t: 'sensor', x: xs, h: 9 }],
        handles: [] };
    },
    score(m, b) {
      const um = m.blur * 1000, okF = b.f >= 48 && b.f <= 52;
      return { solved: um <= 6 && okF,
        meters: [sharp('Sharpness', um, 6, 1),
          band('Focal length', b.f > 0 ? b.f : Infinity, 48, 52, 30, 70, b.f > 0 && b.f < 1000 ? f1(b.f) + ' mm' : 'none')],
        rows: [['Abbe numbers, front and back', f0(abbe(BK7)) + ' and ' + f0(abbe(b.mat))],
          ...focusRows(b.K.surfaces, b.K.back, b.f > 0 && b.f < 1000)] };
    },
  },
  // ───────────────────────────────────────────────────────────── wide
  {
    id: 'wide', nav: 'Wide', unit: 'mm', scale: 'Lens 32 mm across',
    title: 'A lens for landscapes',
    task: 'Bend the lens and slide the stop until the picture is sharp at its edge as well as its middle.',
    brief: 'Light drawn in gold comes straight in. Light drawn in pale blue is the same wavelength, coming from 20° off to one side, and it has to land sharp on the same flat sensor. Drag the white knob to slide the stop.',
    learned: 'Off the axis a simple lens smears a point into a comet shape (coma), and focuses it on a curved surface where the sensor is flat. A stop in front decides which part of the lens each direction of light goes through. With the lens bent into a meniscus, hollow side to the scene, and the stop at the right distance, those errors nearly cancel. William Wollaston found this in 1812, and his landscape lens went into simple cameras for well over a century. Only an up-and-down slice of each beam is traced here, so the error of the sideways slice (astigmatism) is not counted.',
    key: [['k-ray', 'Light from straight ahead (550 nm)'], ['k-ray2', 'Light from 20° off to one side (also 550 nm)'], ['k-glass', 'Crown glass lens, 60 mm'], ['k-stop', 'Stop, f/11'], ['k-target', 'Sensor, at the best focus for the middle']],
    bounds: [-46, -24, 68, 30],
    params: [
      { id: 'q', label: 'Lens faces', min: -2.5, max: 1, step: 0.05, value: 0, show: (v, b) => side(b.R1, -1) + ' / ' + side(b.R2, 1) + ' mm' },
      { id: 'xi', label: 'Stop position', min: -30, max: -6, step: 0.25, value: -6, show: (v) => f1(-v) + ' mm in front of the lens' },   // slider and stop move the same way
    ],
    build(p) {
      const n = BK7.n(GREEN), P = 1 / 60, H = 16, D = 5.45, FIELD = 20 * DEG;
      const c1 = P * (p.q + 1) / (2 * (n - 1)), c2 = P * (p.q - 1) / (2 * (n - 1));
      const R1 = Math.abs(c1) > 1e-9 ? 1 / c1 : Infinity, R2 = Math.abs(c2) > 1e-9 ? 1 / c2 : Infinity;
      const L = lens({ x: 0, h: H, R1, R2, mat: BK7, tag: 'part' });
      const xi = p.xi, front = [...L.surfaces, seg(xi, D / 2, xi, 21, { act: 'absorb' }), seg(xi, -D / 2, xi, -21, { act: 'absorb' })];
      // two bundles through the stop: straight ahead, and from 20° below the axis
      const bundle = (angle, n, c, rgb, fill) => beam({ ox: xi - 70 * Math.cos(angle), oy: -70 * Math.sin(angle), angle, half: D / 2 * Math.cos(angle) * fill, n, nm: GREEN }).map((r) => ({ ...r, c, rgb }));
      const probe = [...bundle(0, 81, 0, null, 0.999), ...bundle(FIELD, 81, 1, null, 0.999)];
      const xs = clamp(bestFocus({ surfaces: front, bounds: this.bounds }, probe.filter((r) => !r.c)) || 60, 30, 66);
      return { surfaces: [...front, seg(xs, -23, xs, 29, { act: 'target' })], ring: false, L, R1, R2, xs, f: L.focal(GREEN),
        draw: [...bundle(0, 7, 0, null, 0.92), ...bundle(FIELD, 7, 1, [150, 205, 255], 0.92)], probe,
        items: [{ t: 'axis' }, { t: 'glass', outline: L.outline }, { t: 'iris', x: xi, open: D / 2, h: 21 }, { t: 'sensor', x: xs, h: 26, y: 3 }],
        handles: [{ param: 'xi', cursor: 'ew', knobs: [[xi, -21]],
          hit: (wx, wy, k) => (Math.abs(wx - xi) * k <= 26 && Math.abs(wy) <= 21 + 12 / k ? Math.abs(wx - xi) : Infinity),
          start: (wx, wy, v) => v - wx, move: (wx, wy, c) => wx + c }] };
    },
    score(m, b) {
      const mid = m.groups[0] ? m.groups[0].spread * 1000 : Infinity, edge = m.groups[1] ? m.groups[1].spread * 1000 : Infinity;
      return { solved: mid <= 40 && edge <= 60,
        meters: [sharp('Sharp in the middle', mid, 40), sharp('Sharp at the edge', edge, 60)],
        rows: [['Focal length', f1(b.f) + ' mm'], ['Sensor sits', f1(b.xs - b.L.v2) + ' mm behind the lens']] };
    },
  },
  // ───────────────────────────────────────────────────────────── tower
  {
    id: 'tower', nav: 'Tower', unit: 'm', scale: 'Tower 100 m tall',
    title: 'Aim the heliostats',
    task: 'Tilt each mirror so that its sunlight lands on the boiler at the top of the tower.',
    brief: 'A solar power tower boils its working fluid with sunlight bounced off a field of flat mirrors. The Sun stands 40° above the horizon behind the field. Drag a white knob sideways to tilt its mirror.',
    learned: 'A mirror sends light off at the same angle it arrived at, so each mirror must face exactly halfway between the Sun and the boiler. That is why every mirror in the field needs its own tilt, and why, as the Sun crosses the sky, each one turns at half the Sun’s rate. Real plants steer thousands of mirrors this way all day. The Sun is traced here as a point; its half-degree width smears each beam by about a metre over these distances.',
    key: [['k-ray', 'Sunlight headed for the mirrors (the rest is not drawn)'], ['k-mirror', 'Heliostat mirrors, 8 m'], ['k-target', 'Boiler']],
    bounds: [8, -11, 166, 112],
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
