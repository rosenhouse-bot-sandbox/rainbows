// Japanese maple: the controller. Two numbers drive the page: the zoom (0 = tree ... 4 = molecules)
// and the season (0 = late March ... 1 = late December). The picture is redrawn only when one changes.
import { dayOf, dateOf, dayLength, PHASES, phaseAt, LAT, clamp, smooth, mix, css, leafRGB } from './model.js?v=a18ea26b';
import { makeWorld, TARGETS } from './world.js?v=a18ea26b';
import { quatOf, qmul, qrot, slerp, add, mul, unit, cross, lerp3 } from './gl.js?v=a18ea26b';
import { drawSpectrum, drawStalk, drawChain } from './figs.js?v=a18ea26b';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv = $('view'), gl = cv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
let world = null, broken = false;
try { if (!gl) throw new Error('This browser does not offer WebGL 2.'); world = makeWorld(gl); } catch (e) { console.error(e); broken = true; $('oops').hidden = false; $('oopsText').textContent = 'The 3D picture could not start on this device.'; }
const FOV = 30 * Math.PI / 180, P11 = 1 / Math.tan(FOV / 2);

// The five scales: the width and height, in metres, that must fit in the free part of the screen.
const STOPS = [
  { id: 'tree', name: 'Tree', w: 7.8, h: 5.5 },
  { id: 'leaf', name: 'Leaf', w: 0.15, h: 0.165 },
  { id: 'tissue', name: 'Tissue', w: 2.1e-4, h: 1.62e-4 },
  { id: 'cells', name: 'Cells', w: 6.2e-5, h: 5.6e-5 },
  { id: 'molecules', name: 'Molecules', w: 5.2e-9, h: 4.2e-9 },
];
const LAST = STOPS.length - 1;
const TB = world ? world.tree.bounds : { x0: -3, x1: 3, y1: 4, z0: -3, z1: 3 };
STOPS[0].w = Math.max(TB.x1 - TB.x0, (TB.z1 - TB.z0) * 0.8) * 1.12; STOPS[0].h = (TB.y1 + 0.5) * 1.06;   // the Tree scale frames the tree as grown
const TREE_AT = [(TB.x0 + TB.x1) / 2, TB.y1 * 0.47, (TB.z0 + TB.z1) / 2];
const PHI = [78, 78, 11, 8, 48].map((d) => d * Math.PI / 180), PHI_VAC = 8 * Math.PI / 180;   // how far the camera is tipped up from the cut wall's level, at each scale
const HOP_OUT = 3.17;                    // changing where the Molecules scale looks pulls back to this zoom on the way

const CAP = {
  tree: [
    ['New leaves', 'A Japanese maple, Acer palmatum, about 4 m tall. Its buds open in late March and leaves grow in pairs along each twig. A new leaf is pale yellow-green: it is still making chlorophyll, the pigment that absorbs light for making sugar.'],
    ['Full leaf', 'The leaves are held out flat in layers, so few are shaded by the ones above.'],
    ['The outside turns first', 'Leaves in full sun turn first and turn reddest, because a leaf needs light to make the red pigment. Shaded leaves inside the crown turn yellow or orange.'],
    ['Every leaf has turned', 'Red on the outside of the crown, orange and yellow within. The first leaves are falling.'],
    ['Bare twigs', 'A leaf falls once the layer of cells that held its stalk to the twig has come apart. The leaf we follow, ringed in white, is the last to go.'],
  ],
  leaf: [
    ['One leaf unfolds', 'The leaf has seven pointed lobes, each with a vein down its middle. The veins bring water in and carry sugar out.'],
    ['Green', 'Chlorophyll absorbs light near 440 nm and near 675 nm. Light around 550 nm is absorbed least, so more of it comes back or passes through than at other wavelengths, and we see the leaf as green.'],
    ['Chlorophyll is taken apart', 'The leaf dismantles the proteins that hold its chlorophyll and sends their nitrogen back into the tree. The chlorophyll is broken down. Green lasts longest beside the veins.'],
    ['Red', 'The leaf makes a new pigment, an anthocyanin, from sugar that builds up in it. Anthocyanin absorbs light from about 480 to 580 nm. What comes back is mostly longer than 600 nm, which we see as red.'],
    ['The stalk lets go', 'Across the foot of the stalk, a layer of cells dissolves the walls that join them, while cork seals the twig behind. Then the leaf\'s weight breaks it off.'],
  ],
  tissue: [
    ['Inside the leaf', 'A window 0.8 mm wide is cut through the leaf, and this is one wall of it. The leaf is 0.14 mm thick. Under a clear skin one cell thick stand tall cells, side by side. Below them are loose cells with air between, then the lower skin.'],
    ['Where the light is used', 'Most light is absorbed in the tall cells, which hold the most chloroplasts: the green bodies. Carbon dioxide comes in through pores in the lower skin and spreads through the air spaces. The bundle of pipes on the right is a vein.'],
    ['Green lasts by the vein', 'Cells far from a vein lose their chlorophyll first. Those beside it keep theirs a few days longer.'],
    ['Red on the sunlit side', 'Anthocyanin is made mostly in the tall cells under the upper skin, where the light is strongest. The loose cells below make little. That is why a maple leaf is redder on top than underneath.'],
    ['Emptied', 'Sugar, and the nitrogen from dismantled proteins, left through the vein before the stalk was sealed. Cell walls, carotenoids and anthocyanin stay behind.'],
  ],
  cells: [
    ['One cell', 'One of the tall cells, 11 µm wide and 41 µm tall. The bodies along its wall are chloroplasts, where the chlorophyll is. The clear column down its middle is the vacuole, a store of water.'],
    ['Chloroplasts', 'Each chloroplast is about 5 µm long and lies against the cell wall, next to the air spaces that bring carbon dioxide. Inside its clear envelope are stacks of membrane, like stacks of coins. The chlorophyll is in those membranes.'],
    ['Chloroplasts fade', 'The stacks of membrane are taken apart and their chlorophyll is broken down. The chloroplasts shrink and turn yellow: carotenoids are what is left in them.'],
    ['Crimson vacuoles', 'Anthocyanin dissolves in water, so it collects in the vacuole and not in the chloroplasts. Seen from outside, the leaf\'s red is the yellow of its chloroplasts and the crimson of its vacuoles together.'],
    ['The last days', 'The cells have sent about half or more of their nitrogen and phosphorus back into the tree. They die soon after the leaf falls.'],
  ],
  membrane: [
    ['Chlorophyll', 'The face of one membrane in a stack. Each ring with a pale magnesium atom at its centre and a long tail is one chlorophyll molecule. The leaf is still making them.'],
    ['Why chlorophyll is green', 'Eighteen electrons are shared right round the ring instead of staying between two atoms. The more atoms electrons are spread over, the less energy it takes to lift them, so they take in light we can see instead of ultraviolet: here near 440 and 675 nm. Watch the dots of light: those two bands are swallowed, and what we see as green goes by.'],
    ['Chlorophyll is taken apart', 'One enzyme removes the magnesium, another cuts off the tail, a third opens the ring, and the pieces are soon made colourless: an opened ring no longer shares its electrons all the way round. The carotenoids, the long chains, stay.'],
    ['Why carotenoids are yellow', 'A carotenoid shares electrons along a chain of 11 double bonds. It takes in light from 400 to 500 nm, which we see as violet and blue. The rest goes by, and together that looks yellow.'],
    ['What is left', 'About half of the carotenoids are still here when the leaf falls. They are why a fallen maple leaf with little anthocyanin is yellow.'],
  ],
  vacuole: [
    ['Water', 'Inside the vacuole. In spring there is no pigment here: only water, with salts and sugars dissolved in it. The dots of light pass straight through.'],
    ['Water', 'Inside the vacuole. All summer there is no pigment here: only water, with salts and sugars dissolved in it. The dots of light pass straight through.'],
    ['Anthocyanin arrives', 'Each molecule is cyanidin 3-glucoside, the red pigment of maple leaves: three rings (the middle one includes an oxygen atom) joined to one sugar. It is made outside the vacuole and moved in.'],
    ['Why anthocyanin is red', 'Its three rings share one set of electrons, a shorter run than chlorophyll\'s ring, but its oxygen atoms and its positive charge shift what it takes in to longer wavelengths than a plain chain that short would: around 530 nm, which we see as green. What goes by is mostly longer than 600 nm, which we see as red.'],
    ['Still red', 'Anthocyanin is not taken back into the tree. It stays in the leaf when it falls.'],
  ],
};
const NOTE = {
  tree: `Drawn with ${world ? world.count.toLocaleString('en') : 'a few thousand'} leaves; a real tree this size carries several times more. The white ring marks the leaf we follow. Dates are typical for Kyoto, ${LAT}° N. A fall takes seconds; here it is spread over two and a half days so that it can be seen.`,
  leaf: 'The white ring marks a window cut through the leaf, 0.8 mm wide, so that the next scales can look inside. A fall takes seconds; here it is spread over two and a half days of the slider so that it can be seen.',
  tissue: 'A model: real cells are less regular, and those at a cut would be sliced open. Only walls, chloroplasts and vacuoles are drawn. The ring marks the cell the next scale shows.',
  cells: 'Only the walls, chloroplasts and vacuoles are drawn. The small ring marks where the Molecules scale looks.',
  membrane: 'Sticks are bonds between atoms: carbon grey, nitrogen blue, oxygen red, magnesium pale green; hydrogen is left out. The glowing bonds are the ones whose shared electrons take in visible light. The beads underneath are the heads of the membrane\'s fat molecules. In a real membrane the pigments sit inside it, held by proteins, which are not drawn; here they are lifted onto its face so that they can be seen. Chlorophyll comes in two kinds, a and b; a is drawn, and only one of its five oxygen atoms. In autumn the real membrane is taken apart too, and the carotenoids that remain end up in drops of fat. Each dot of light stands for a little light of one wavelength, drawn in the colour we see it as, and moving far slower than light does; a real wave of visible light is about a hundred times wider than this view. One molecule has no colour: each is drawn in the colour its pigment has in bulk.',
  vacuole: 'Sticks are bonds between atoms; carbon is drawn pale and oxygen dark red so that they show against the red water; hydrogen is left out. The water\'s own colour hides molecules more than a few tens of nanometres away. The glowing bonds are the ones whose shared electrons take in visible light. Water is not drawn. The pigment is drawn a few times more crowded than it is in a deep red cell. Each dot of light stands for a little light of one wavelength, moving far slower than light does.',
};
const CUT = 'The foot of the leaf stalk cut lengthwise, twig on the left. Brown: cells whose walls fill with cork and seal the twig. Beside them, small cells dissolve the walls that join them, from the outside in. The pale strand is the vein, the last part to break. A diagram: real cells are smaller and far more numerous.';

// ---- state ---------------------------------------------------------------------------------------
const st = { z: 0, s: 0, play: false, where: 'membrane' };
let w = 0;                               // 0 = looking into the chloroplast membrane, 1 = into the vacuole
let fly = null, hop = null, dirty = true, last = 0, raf = 0;
// The zoom and the date never move together. While the zoom is moving the year waits, and while the
// Season slider is being moved a flight between scales waits. These are when each was last moved by hand.
let still = false;                       // the tests step the light themselves
let zNew = false, sNew = false, zoomAt = -1e9, seasonAt = -1e9, lightOn = !reduced;
const HOLD = 450;                        // milliseconds
const FLY_T = 0.45, FLY_V = 4.5;         // a flight's easing time in seconds, and its top speed: e^4.5 times larger or smaller each second
const drawn = { z: 0, s: 0, n: 0 };       // what the last picture showed, for the tests
const free = { x: 0, y: 0, w: 1, h: 1 }, cam = { k: 1, ox: 0, oy: 0, W: 1, H: 1, dpr: 1 };

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.has('z')) st.z = clamp(parseFloat(q.get('z')) || 0, 0, LAST);
  if (q.has('s')) st.s = clamp(parseFloat(q.get('s')) || 0);
  if (q.get('at') === 'vacuole') { st.where = 'vacuole'; w = 1; } else if (q.has('at')) { st.where = 'membrane'; w = 0; }
  return q.has('z') || q.has('s');
}
let hashTimer = 0;
const writeHash = () => { clearTimeout(hashTimer); hashTimer = setTimeout(() => history.replaceState(null, '', `#z=${st.z.toFixed(2)}&s=${st.s.toFixed(3)}${st.where === 'vacuole' ? '&at=vacuole' : ''}`), 400); };

let coarse = 1;                           // the tests draw a coarser picture, because without a graphics card each pixel is slow
function measure() {
  const W = innerWidth, H = innerHeight, r = $('panel').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1) * coarse;
  if (r.right < W * 0.7) { free.x = r.right + 12; free.y = 0; free.w = W - free.x; free.h = H; }
  else { free.x = 0; free.y = 52; free.w = W; free.h = Math.max(120, r.top - 52); }
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  cam.W = W; cam.H = H; cam.dpr = dpr; knots(); dirty = true; kick();
}

const fitK = (i) => Math.min(free.w / STOPS[i].w, free.h / STOPS[i].h) * 0.94;
// The size of the view against the slider: ln(pixels per metre) as one smooth curve through the stops (a monotone cubic),
// so that the pace of the zoom has no kink at a stop. uOf(z) reads it, zOf(u) turns it round.
let KN = null;
function knots() { const U = STOPS.map((_, i) => Math.log(fitK(i))), n = U.length, d = [], m = []; for (let i = 0; i < n - 1; i++) d[i] = U[i + 1] - U[i]; m[0] = d[0]; m[n - 1] = d[n - 2]; for (let i = 1; i < n - 1; i++) m[i] = 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]); KN = { U, m }; }
function uOf(z) { const i = Math.min(LAST - 1, Math.floor(z)), g = z - i, g2 = g * g, g3 = g2 * g, { U, m } = KN; return (2 * g3 - 3 * g2 + 1) * U[i] + (g3 - 2 * g2 + g) * m[i] + (3 * g2 - 2 * g3) * U[i + 1] + (g3 - g2) * m[i + 1]; }
function zOf(u) { let a = 0, b = LAST; for (let n = 0; n < 40; n++) { const c = (a + b) / 2; if (uOf(c) < u) a = c; else b = c; } return (a + b) / 2; }
// the zoom actually shown: the slider's, pulled back during a hop between the two places in the cell
const zShown = () => hop ? mix(st.z, Math.min(st.z, HOP_OUT), smooth(Math.min(hop.t, 1 - hop.t) / 0.36)) : st.z;   // eased at both ends, held in the middle while the view moves across

function aim(z) {
  const i = Math.min(LAST - 1, Math.floor(z)), g = z - i, k0 = fitK(i), k1 = fitK(i + 1);
  const k = Math.exp(uOf(z)), t = k0 / k * (1 - smooth(g));   // the next stop's point slides to the middle of the view, starting and ending at rest
  const fa = world.frames(false), fc = world.frames(true), cut = (p) => add(fa.cutO, qrot(fa.cutQ, mul(p, 1e-6)));
  const at = lerp3(TARGETS.membrane, TARGETS.vacuole, w);                                  // where the Molecules scale looks, in the frame of the cut
  const T = [TREE_AT, fa.centre, cut([38, 0, -33]), cut(TARGETS.vacuole), cut(at)];
  const target = lerp3(T[i + 1], T[i], t);
  // From the Leaf scale down the camera is set against the leaf: level with the cut wall, tipped up by an angle that changes with the scale.
  const phis = [PHI[0], PHI[1], PHI[2], PHI[3], mix(PHI[4], PHI_VAC, w)], phi = mix(phis[i], phis[i + 1], smooth(i === 1 ? (g - 0.25) / 0.6 : g));
  const cq = slerp(fc.cutQ, fa.cutQ, smooth((z - 1) / 0.5));                               // while it falls the leaf tumbles; the camera only follows that from close by
  let q = qmul(cq, quatOf([1, 0, 0], [0, Math.sin(phi), Math.cos(phi)], [0, -Math.cos(phi), Math.sin(phi)]));
  if (z < 1) { const b = unit([0.1, 0.22, 1]), r = unit(cross([0, 1, 0], b)); q = slerp(quatOf(r, cross(b, r), b), q, smooth(g)); }
  const dist = cam.H * P11 / (2 * k), cx = free.x + free.w / 2, cy = free.y + free.h / 2;
  cam.k = k;
  return { eye: add(target, mul(qrot(q, [0, 0, 1]), dist)), q, W: cam.W, H: cam.H, dpr: cam.dpr, P11, ox: 2 * cx / cam.W - 1, oy: 1 - 2 * cy / cam.H, k, dist, at, where: st.where, light: lightOn };
}

function draw() {
  drawn.z = st.z; drawn.s = st.s; drawn.n++;
  world.update(dayOf(st.s));
  world.draw(aim(zShown()));
}

// ---- the panel -----------------------------------------------------------------------------------
const shown = {};
const set = (id, text) => { if (shown[id] !== text) { shown[id] = text; $(id).textContent = text; } };
const fmtLen = (m) => m >= 1 ? `${+m.toPrecision(1)} m` : m >= 0.01 ? `${+(m * 100).toPrecision(1)} cm` : m >= 1e-3 ? `${+(m * 1e3).toPrecision(1)} mm` : m >= 1e-6 ? `${+(m * 1e6).toPrecision(1)} µm` : `${+(m * 1e9).toPrecision(1)} nm`;
function scaleBar() {
  const want = 96 / cam.k, e = Math.pow(10, Math.floor(Math.log10(want))), n = want / e >= 5 ? 5 : want / e >= 2 ? 2 : 1, len = n * e, text = fmtLen(len);
  $('scaleBar').style.width = (len * cam.k).toFixed(1) + 'px'; set('scaleText', text);
  return text;
}
const INK = world ? world.INK : null;
let figKey = '';
function sync() {
  const z = zShown(), lvl = Math.round(st.z), stop = STOPS[lvl], day = dayOf(st.s), date = dateOf(day), ph = phaseAt(st.s), p = world.focus().p;
  const bar = scaleBar();
  const zi = $('zoom'), si = $('season');
  if (Math.abs(zi.value - st.z) > 0.0015) zi.value = st.z;
  zi.style.setProperty('--v', (st.z / LAST * 100) + '%');
  zi.setAttribute('aria-valuetext', `${STOPS[Math.round(st.z)].name}, scale bar ${bar}`);
  set('zoomV', STOPS[Math.round(st.z)].name);
  if (shown.sv !== Math.round(st.s * 1000)) { shown.sv = Math.round(st.s * 1000); si.value = shown.sv; si.setAttribute('aria-valuetext', date.text); }
  set('seasonV', date.text);
  for (const b of $('stops').children) b.setAttribute('aria-current', String(+b.dataset.i === Math.round(st.z)));
  [...$('zticks').children].forEach((t, i) => t.classList.toggle('on', i === Math.round(st.z)));
  [...$('ticks').children].forEach((t, i) => t.classList.toggle('on', i === ph));
  const pl = st.play ? 'Pause' : st.s > 0.995 ? 'Play the year again' : 'Play the year';
  if (shown.play !== pl) { shown.play = pl; $('play').setAttribute('aria-pressed', String(st.play)); $('play').setAttribute('aria-label', pl); }

  const deep = lvl >= 3;
  if (shown.deep !== deep) { shown.deep = deep; $('whereCtl').hidden = !deep; }
  if (shown.nano !== (lvl === LAST)) { shown.nano = lvl === LAST; $('lightCtl').hidden = !shown.nano; $('figChain').hidden = !shown.nano; if (shown.nano) chain(); }
  for (const b of document.querySelectorAll('[data-where]')) b.setAttribute('aria-pressed', String(b.dataset.where === st.where));
  const capId = lvl === LAST ? st.where : stop.id, key = capId + ph;
  if (shown.cap !== key) {
    const first = shown.cap === undefined; shown.cap = key;
    const apply = () => { const [t, body] = CAP[capId][ph]; $('capTitle').textContent = t; $('capBody').textContent = body; $('capScale').textContent = stop.name; $('capPhase').textContent = PHASES[ph].name; $('note').textContent = NOTE[capId] || ''; $('cap').classList.remove('swap'); };
    if (first || reduced) apply(); else { $('cap').classList.add('swap'); setTimeout(() => { if (shown.cap === key) apply(); }, 180); }
  }

  const pc = (v) => Math.round(v * 100) + '%';
  for (const [id, v] of [['Chl', p.chl], ['Car', p.car], ['Anth', p.anth], ['Absc', p.absc]]) { const t = pc(v); if (shown['b' + id] !== t) { shown['b' + id] = t; $('b' + id).style.width = t; $('v' + id).textContent = t; } }
  const dl = dayLength(day), hh = Math.floor(dl), mm = Math.round((dl - hh) * 60);
  set('daylight', `Daylight on this date at ${LAT}° N: ${mm === 60 ? hh + 1 : hh} h ${String(mm === 60 ? 0 : mm).padStart(2, '0')} min.`);

  const stalk = lvl === 1 && p.absc > 0.004, fk = (stalk ? 'c' : 's') + Math.round(st.s * 1000);
  if (fk !== figKey) {
    figKey = fk;
    $('figStalk').hidden = !stalk; $('figLight').hidden = stalk;
    if (stalk) { drawStalk($('figCut'), p.absc, p.fall, leafRGB(p)); set('cutCap', CUT); }
    else set('specCap', drawSpectrum($('figSpec'), p, INK));
  }
  writeHash();
}

// ---- time ----------------------------------------------------------------------------------------
function kick() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  if (broken) return;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
  // The frame that first shows a slider's new value never moves the other one too, however slow frames are.
  const zooming = !!(fly || hop) || now - zoomAt < HOLD || zNew, dating = now - seasonAt < HOLD || sNew; zNew = sNew = false;
  if (st.play && !zooming) { st.s = Math.min(1, st.s + dt / 25); if (st.s >= 1) st.play = false; dirty = true; }
  if (fly && dating) fly.v = 0;
  if (fly && !dating) {                                    // a flight: eased toward the stop in ln(scale), keeping its speed if the stop is changed on the way
    const goal = uOf(fly.to), u = uOf(st.z), om = 2 / FLY_T, x = om * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const ch = clamp(u - goal, -FLY_V * FLY_T, FLY_V * FLY_T), tmp = (fly.v + om * ch) * dt;
    fly.v = (fly.v - om * tmp) * e;
    let out = u - ch + (ch + tmp) * e;
    if ((goal - u > 0) === (out > goal)) { out = goal; fly.v = 0; }
    if (Math.abs(out - goal) < 0.004 && Math.abs(fly.v) < 0.05) { st.z = fly.to; fly = null; } else st.z = zOf(out);
    dirty = true;
  }
  if (hop && !dating) { hop.t = Math.min(1, hop.t + dt / hop.dur); w = mix(hop.from, hop.to, smooth((hop.t - 0.36) / 0.28)); if (hop.t >= 1) hop = null; dirty = true; }
  const lit = lightOn && !still && zShown() > 3.5;                  // light arriving at the molecules moves by itself; with reduced motion it is off until the visitor switches it on
  if (lit) { try { world.update(dayOf(st.s)); world.stepLight(dt, st.where, world.focus().p); } catch (e) { oops(e); } dirty = true; }
  if (dirty) {
    dirty = false;
    try { draw(); } catch (e) { oops(e); }
    try { sync(); } catch (e) { oops(e); }
  }
  if (st.play || fly || hop || lit) kick(); else last = 0;
}
const touch = () => { dirty = true; kick(); };
// If the picture cannot be drawn, say so and offer to reload, and leave the controls working.
function oops(e) {
  console.error(e);
  if (broken) return;
  broken = true;  fly = hop = null; st.play = false; $('oops').hidden = false;
}
function zoomTo(z) {
  z = clamp(z, 0, LAST);
  if (reduced) { fly = null; st.z = z; zoomAt = performance.now(); zNew = true; } else fly = { to: z, v: fly ? fly.v : 0 };
  touch();
}
function look(where) {
  if (where === st.where) return;
  st.where = where; const to = where === 'vacuole' ? 1 : 0;
  if (reduced || st.z <= 3.01) { hop = null; w = to; zoomAt = performance.now(); zNew = true; } else hop = { from: w, to, t: 0, dur: st.z > HOP_OUT ? 3.4 : 1.4 };
  touch();
}

// ---- controls ------------------------------------------------------------------------------------
STOPS.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = s.name; b.dataset.i = i; b.style.left = (i / LAST * 100) + '%'; b.addEventListener('click', () => zoomTo(i)); $('stops').append(b); });
PHASES.forEach((ph) => { const t = document.createElement('i'); t.style.left = (ph.at * 100) + '%'; $('ticks').append(t); });
$('zoom').addEventListener('input', (e) => { fly = null; zoomAt = performance.now(); zNew = true; st.z = clamp(+e.target.value, 0, LAST); touch(); });
$('season').addEventListener('input', (e) => { st.s = e.target.value / 1000; shown.sv = +e.target.value; st.play = false; seasonAt = performance.now(); sNew = true; touch(); });
$('play').addEventListener('click', () => { if (!st.play && st.s > 0.995) { st.s = 0; seasonAt = performance.now(); sNew = true; } st.play = !st.play; touch(); });
// An arrow key moves a slider by a step that can be seen: a twentieth of a scale, or five thousandths of the year.
for (const [id, step] of [['zoom', 0.05], ['season', 5]]) $(id).addEventListener('keydown', (e) => {
  const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!d) return;
  e.preventDefault(); e.target.value = +e.target.value + d * step; e.target.dispatchEvent(new Event('input', { bubbles: true }));
});
for (const b of document.querySelectorAll('[data-where]')) b.addEventListener('click', () => look(b.dataset.where));
cv.addEventListener('wheel', (e) => { e.preventDefault(); if (hop) return; fly = null; zoomAt = performance.now(); zNew = true; st.z = zOf(clamp(uOf(st.z) - e.deltaY * (e.deltaMode ? 0.1 : 0.004), KN.U[0], KN.U[LAST])); touch(); }, { passive: false });   // one notch is the same change of scale everywhere
$('reload').addEventListener('click', () => location.reload());
$('light').checked = lightOn;
function chain() { const el = $('chain'), r = drawChain($('figChainCv'), +el.value); el.style.setProperty('--v', ((+el.value - 3) / 8 * 100) + '%'); el.setAttribute('aria-valuetext', r.n + ' double bonds in a row'); set('chainV', r.n); set('chainCap', r.cap); }
$('chain').addEventListener('input', chain);
STOPS.forEach((s, i) => { const t = document.createElement('i'); t.style.left = (i / LAST * 100) + '%'; $('zticks').append(t); });
$('light').addEventListener('change', (e) => { lightOn = e.target.checked; touch(); });
cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); broken = true; $('oops').hidden = false; });
cv.addEventListener('webglcontextrestored', () => location.reload());
addEventListener('resize', measure);
addEventListener('hashchange', () => { if (readHash()) { st.play = false; fly = hop = null; touch(); } });
document.fonts?.ready.then(measure);

const fromLink = readHash();
measure();
window.__maple = { st, drawn, cam, free, stops: STOPS, get busy() { return !!(fly || hop || st.play); }, res(k) { coarse = k; measure(); }, settle() { if (fly) { st.z = fly.to; fly = null; } if (hop) { w = hop.to; hop = null; } touch(); },   // for the tests: a coarser picture, and a flight ended at once
  redraw() { world.update(dayOf(st.s)); world.draw(aim(zShown())); gl.finish(); },
  light(steps) { lightOn = true; still = true; $('light').checked = true; world.update(dayOf(st.s)); for (let i = 0; i < steps; i++) world.stepLight(0.05, st.where, world.focus().p); touch(); } };   // for the tests: moves the light on without the clock
if (!reduced && !fromLink) setTimeout(() => { if (st.s === 0 && !st.play && !fly && zoomAt < 0) { st.play = true; touch(); } }, 1400);
