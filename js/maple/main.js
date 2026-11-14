// Japanese maple: the controller. Two numbers drive the page: the zoom (0 = tree ... 3 = molecules)
// and the season (0 = late March ... 1 = late December). The picture is redrawn only when one changes.
import { dayOf, dateOf, dayLength, PHASES, phaseAt, LAT, clamp, smooth, mix, css, leafRGB } from './model.js';
import { makeScene } from './scene.js';
import { makeMicro, TARGETS } from './micro.js';
import { drawSpectrum, drawStalk } from './figs.js';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv = $('view'), ctx = cv.getContext('2d', { alpha: false });
const scene = makeScene(), micro = makeMicro();

// The five scales: the width and height, in metres, that must fit in the free part of the screen.
const STOPS = [
  { id: 'tree', name: 'Tree', w: 7.8, h: 5.5 },
  { id: 'leaf', name: 'Leaf', w: 0.105, h: 0.128 },
  { id: 'cells', name: 'Cells', w: 1.45e-4, h: 1.25e-4 },
  { id: 'molecules', name: 'Molecules', w: 9.5e-9, h: 7e-9 },
];
const LAST = STOPS.length - 1, LAWN_SHOWN = 1.0;      // metres of lawn in front of the tree, where leaves land
{ const b = scene.tree.bounds; STOPS[0].w = (b.x1 - b.x0) * 1.1; STOPS[0].h = (b.y1 + LAWN_SHOWN) * 1.08; }   // the Tree scale frames the tree as grown
const HOP_OUT = 2.22;                    // changing where the Molecules scale looks pulls back to this zoom on the way

const CAP = {
  tree: [
    ['New leaves', 'A Japanese maple, Acer palmatum, about 4 m tall. Its buds open in late March and leaves grow in pairs along each twig. A new leaf is pale yellow-green: it is still making chlorophyll, the pigment that absorbs light for making sugar.'],
    ['Full leaf', 'The leaves hang in flat layers, so few are shaded by the ones above. All of them hold about the same amount of chlorophyll.'],
    ['The outside turns first', 'Leaves in full sun turn first and turn reddest, because a leaf needs light to make the red pigment. Shaded leaves inside the crown turn yellow or orange.'],
    ['Every leaf has turned', 'Red on the outside of the crown, orange and yellow within. The first leaves are falling.'],
    ['Bare twigs', 'A leaf falls once the layer of cells that held its stalk to the twig has come apart. The leaf we follow, low on the left, is the last to go.'],
  ],
  leaf: [
    ['One leaf unfolds', 'The leaf has seven pointed lobes, each with a vein down its middle. The veins bring water in and carry sugar out.'],
    ['Green', 'Chlorophyll absorbs light near 440 nm and near 675 nm. Light around 550 nm is mostly sent back or passes through, and we see that as green.'],
    ['Chlorophyll is taken apart', 'The leaf dismantles the proteins that hold its chlorophyll and sends their nitrogen back into the tree. The chlorophyll is broken down. Green lasts longest beside the veins.'],
    ['Red', 'The leaf makes a new pigment, an anthocyanin, from sugar that builds up in it. Anthocyanin absorbs light from about 480 to 580 nm. What comes back is mostly longer than 600 nm, which we see as red.'],
    ['The stalk lets go', 'Across the foot of the stalk, a layer of cells dissolves the walls that join them, while cork seals the twig behind. Then the leaf\'s weight breaks it off.'],
  ],
  cells: [
    ['Inside the leaf', 'Looking down through the leaf\'s clear outer layer at the cells below, each about 12 µm across. The green bodies are chloroplasts, where the chlorophyll is. The clear middle is the vacuole, a store of water.'],
    ['Chloroplasts', 'Each cell holds several chloroplasts pressed against its wall. Inside a chloroplast, chlorophyll sits in stacks of membrane, seen here as dark dots.'],
    ['Chloroplasts fade', 'The stacks of membrane are taken apart and their chlorophyll is broken down. The chloroplasts shrink and turn yellow: carotenoids are what is left in them.'],
    ['Crimson vacuoles', 'Anthocyanin dissolves in water, so it collects in the vacuole and not in the chloroplasts. Seen from outside, the leaf\'s red is the yellow of its chloroplasts and the crimson of its vacuoles together.'],
    ['The last days', 'The cells have sent most of their nitrogen and phosphorus back into the tree. They die soon after the leaf falls.'],
  ],
  membrane: [
    ['Chlorophyll', 'A patch of chloroplast membrane about 10 nm across. A ring with one magnesium atom at its centre and a long tail is one chlorophyll molecule. The leaf is still making them.'],
    ['Two pigments', 'Chlorophyll is a ring around a magnesium atom; it absorbs near 440 and 675 nm. A carotenoid is a chain of 40 carbon atoms; it absorbs from 400 to 500 nm. There are about three chlorophylls to each carotenoid.'],
    ['Chlorophyll is taken apart', 'One enzyme removes the magnesium, another cuts off the tail, a third opens the ring. The opened ring absorbs no light we can see, and is drawn fading to grey. The carotenoids stay.'],
    ['Carotenoids remain', 'With the chlorophyll gone, this membrane sends back the light carotenoids do not absorb: wavelengths longer than about 500 nm, which we see as yellow.'],
    ['What is left', 'About half of the carotenoids are still here when the leaf falls. They are why a fallen maple leaf with little anthocyanin is yellow.'],
  ],
  vacuole: [
    ['Water', 'Inside the vacuole. In spring there is no pigment here: only water, with salts and sugars dissolved in it.'],
    ['Water', 'Inside the vacuole. All summer there is no pigment here: only water, with salts and sugars dissolved in it.'],
    ['Anthocyanin arrives', 'Each molecule is cyanidin 3-glucoside, the red pigment of maple leaves: three rings of carbon joined to one sugar. It is made outside the vacuole and moved in.'],
    ['The red pigment', 'Cyanidin 3-glucoside absorbs light around 530 nm. Its three rings share one run of alternating single and double bonds, long enough to absorb in the middle of the range we can see.'],
    ['Still red', 'Anthocyanin is not taken back into the tree. It stays in the leaf when it falls.'],
  ],
};
const NOTE = {
  tree: `Drawn with ${scene.count.toLocaleString('en')} leaves; a real tree this size carries several times more. Dates are typical for Kyoto, ${LAT}° N. A fall takes seconds; here it is spread over two and a half days so that it can be seen.`,
  leaf: 'A fall takes seconds; here it is spread over two and a half days of the slider so that it can be seen.',
  cells: 'Cells are drawn as circles in one layer, and only their chloroplasts and vacuole are shown.',
  membrane: 'Each line is a bond between two atoms; hydrogen atoms are left out. Thick lines are the bonds whose electrons absorb visible light. The proteins and fats that hold these molecules in the membrane are not drawn. One molecule has no colour: each is drawn in the colour its pigment has in bulk.',
  vacuole: 'Each line is a bond between two atoms; hydrogen atoms are left out. Thick lines are the bonds whose electrons absorb visible light. Water is not drawn. The pigment is drawn far more crowded than it is: a real view this size would usually hold no molecule at all.',
};
const CUT = 'The foot of the leaf stalk cut lengthwise, twig on the left. Brown: cells whose walls fill with cork and seal the twig. Beside them, small cells dissolve the walls that join them, from the outside in. The pale strand is the vein, the last part to break. A diagram: real cells are smaller and far more numerous.';

// ---- state ---------------------------------------------------------------------------------------
const st = { z: 0, s: 0, play: false, where: 'membrane' };
let w = 0;                               // 0 = looking into the chloroplast membrane, 1 = into the vacuole
let fly = null, hop = null, dirty = true, last = 0, raf = 0;
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

function measure() {
  const W = innerWidth, H = innerHeight, r = $('panel').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  if (W >= 900) { free.x = r.right + 12; free.y = 0; free.w = W - free.x; free.h = H; }
  else { free.x = 0; free.y = 52; free.w = W; free.h = Math.max(120, r.top - 52); }
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  cam.W = W; cam.H = H; cam.dpr = dpr; dirty = true; kick();
}

const fitK = (i) => Math.min(free.w / STOPS[i].w, free.h / STOPS[i].h) * 0.94;
// the zoom actually shown: the slider's, pulled back during a hop between the two places in the cell
const zShown = () => hop ? mix(st.z, Math.min(st.z, HOP_OUT), Math.sin(Math.PI * hop.t) ** 0.7) : st.z;

function aim(z) {
  const i = Math.min(LAST - 1, Math.floor(z)), f = z - i, k0 = fitK(i), k1 = fitK(i + 1);
  const k = Math.exp(mix(Math.log(k0), Math.log(k1), f)), t = (1 / k - 1 / k1) / (1 / k0 - 1 / k1);
  const F = scene.spot(), lc = scene.leafCentre(), b = scene.tree.bounds;
  const target = [mix(TARGETS.membrane[0], TARGETS.vacuole[0], w), mix(TARGETS.membrane[1], TARGETS.vacuole[1], w)];
  // each stop's centre, measured from the point on the leaf that the deeper scales look into
  const rel = [[(b.x0 + b.x1) / 2 - F[0], (b.y1 - LAWN_SHOWN) / 2 - F[1]], [lc[0] - F[0], lc[1] - F[1]], [0, 0], target];
  const c = [mix(rel[i + 1][0], rel[i][0], t), mix(rel[i + 1][1], rel[i][1], t)];   // linear in the size of the view: a zoom toward one point
  cam.k = k;
  cam.ox = free.x + free.w / 2 - k * (F[0] + c[0]); cam.oy = free.y + free.h / 2 + k * (F[1] + c[1]);
  return { c, X: free.x + free.w / 2 - k * c[0], Y: free.y + free.h / 2 + k * c[1] };
}

function draw() {
  const day = dayOf(st.s);
  scene.update(day);
  const a = aim(zShown()), p = scene.focus().p;
  const leafCol = scene.draw(ctx, cam);
  micro.draw(ctx, cam, p, a.X, a.Y, a.c, leafCol);
  ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
  const g = ctx.createRadialGradient(free.x + free.w / 2, free.y + free.h / 2, Math.min(free.w, free.h) * 0.45, free.x + free.w / 2, free.y + free.h / 2, Math.hypot(cam.W, cam.H) * 0.62);
  g.addColorStop(0, 'rgba(5,7,15,0)'); g.addColorStop(1, 'rgba(5,7,15,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cam.W, cam.H);
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
const INK = micro.INK;
let figKey = '';
function sync() {
  const z = zShown(), lvl = Math.round(z), stop = STOPS[lvl], day = dayOf(st.s), date = dateOf(day), ph = phaseAt(st.s), p = scene.focus().p;
  const bar = scaleBar();
  const zi = $('zoom'), si = $('season');
  if (Math.abs(zi.value - st.z) > 0.0015) zi.value = st.z;
  zi.style.setProperty('--v', (st.z / LAST * 100) + '%');
  zi.setAttribute('aria-valuetext', `${STOPS[Math.round(st.z)].name}, scale bar ${bar}`);
  set('zoomV', STOPS[Math.round(st.z)].name);
  if (shown.sv !== Math.round(st.s * 1000)) { shown.sv = Math.round(st.s * 1000); si.value = shown.sv; si.setAttribute('aria-valuetext', date.text); }
  set('seasonV', date.text);
  for (const b of $('stops').children) b.setAttribute('aria-current', String(+b.dataset.i === Math.round(st.z)));
  [...$('ticks').children].forEach((t, i) => t.classList.toggle('on', i === ph));
  const pl = st.play ? 'Pause' : st.s > 0.995 ? 'Play the year again' : 'Play the year';
  if (shown.play !== pl) { shown.play = pl; $('play').setAttribute('aria-pressed', String(st.play)); $('play').setAttribute('aria-label', pl); }

  const deep = lvl >= 2;
  if (shown.deep !== deep) { shown.deep = deep; $('whereCtl').hidden = !deep; }
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
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
  if (st.play) { st.s = Math.min(1, st.s + dt / 50); if (st.s >= 1) st.play = false; dirty = true; }
  if (fly) { fly.t = Math.min(1, fly.t + dt / fly.dur); st.z = mix(fly.from, fly.to, smooth(fly.t)); if (fly.t >= 1) fly = null; dirty = true; }
  if (hop) { hop.t = Math.min(1, hop.t + dt / hop.dur); w = mix(hop.from, hop.to, smooth((hop.t - 0.3) / 0.4)); if (hop.t >= 1) hop = null; dirty = true; }
  if (dirty) { dirty = false; draw(); sync(); }
  if (st.play || fly || hop) kick(); else last = 0;
}
const touch = () => { dirty = true; kick(); };
function zoomTo(z) {
  z = clamp(z, 0, LAST);
  if (reduced) { fly = null; st.z = z; } else fly = { from: st.z, to: z, t: 0, dur: 0.9 + 1.5 * Math.abs(z - st.z) };
  touch();
}
function look(where) {
  if (where === st.where) return;
  st.where = where; const to = where === 'vacuole' ? 1 : 0;
  if (reduced || st.z <= 2.01) { hop = null; w = to; } else hop = { from: w, to, t: 0, dur: st.z > HOP_OUT ? 2.6 : 1.2 };
  touch();
}

// ---- controls ------------------------------------------------------------------------------------
STOPS.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = s.name; b.dataset.i = i; b.style.left = (i / LAST * 100) + '%'; b.addEventListener('click', () => zoomTo(i)); $('stops').append(b); });
PHASES.forEach((ph) => { const t = document.createElement('i'); t.style.left = (ph.at * 100) + '%'; $('ticks').append(t); });
$('zoom').addEventListener('input', (e) => { fly = null; st.z = clamp(+e.target.value, 0, LAST); touch(); });
$('season').addEventListener('input', (e) => { st.s = e.target.value / 1000; shown.sv = +e.target.value; st.play = false; touch(); });
$('play').addEventListener('click', () => { if (!st.play && st.s > 0.995) st.s = 0; st.play = !st.play; touch(); });
for (const b of document.querySelectorAll('[data-where]')) b.addEventListener('click', () => look(b.dataset.where));
cv.addEventListener('wheel', (e) => { e.preventDefault(); fly = null; st.z = clamp(st.z - e.deltaY * (e.deltaMode ? 0.03 : 0.0012), 0, LAST); touch(); }, { passive: false });
addEventListener('resize', measure);
addEventListener('hashchange', () => { if (readHash()) { st.play = false; fly = hop = null; touch(); } });
document.fonts?.ready.then(measure);

const fromLink = readHash();
measure();
window.__maple = { st, cam, free, stops: STOPS, get busy() { return !!(fly || hop || st.play); } };
if (!reduced && !fromLink) setTimeout(() => { if (st.s === 0 && !st.play) { st.play = true; touch(); } }, 1400);
