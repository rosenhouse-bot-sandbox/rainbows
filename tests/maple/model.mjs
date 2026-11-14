// Checks the Japanese maple's model without a browser: the calendar, each leaf's timetable, the
// pigment curves, the colours they give, and the tree. Fails if a number leaves its range, an event
// happens out of order, a colour comes out with the wrong name, or two builds of the tree differ.
//
//   node tests/maple/model.mjs
import * as M from '../../js/maple/model.js';
import { stamp } from './stamp.mjs';
import { buildTree, place, leafShape, SPOT } from '../../js/maple/tree.js';

let fails = 0;
{ const r = stamp(true); if (r.stale.length) { fails++; console.log(`FAIL the version stamp is out of date in: ${r.stale.join(', ')}. Run: node tests/maple/stamp.mjs`); } }
const ok = (cond, what) => { if (!cond) { fails++; console.log('FAIL ' + what); } };

// the calendar
let prev = -1;
for (let i = 0; i <= 1000; i++) { const d = M.dayOf(i / 1000); ok(d > prev, `day rises at season ${i / 1000}`); ok(Math.abs(M.seasonOf(d) - i / 1000) < 1e-9, `season and day agree at ${i / 1000}`); prev = d; }
ok(M.dateOf(M.DAY_START).text === '25 March' && M.dateOf(M.DAY_END).text === '20 December', 'the year runs 25 March to 20 December');
ok(Math.abs(M.dayLength(172) - 14.4) < 0.15 && Math.abs(M.dayLength(355) - 9.6) < 0.15, 'day length at 35° N is about 14.4 h in June and 9.6 h in December');
for (let i = 1; i < M.PHASES.length; i++) ok(M.PHASES[i].at > M.PHASES[i - 1].at, 'phases are in order');

// the tree
const T = buildTree(), T2 = buildTree();
ok(T.leaves.length > 2000 && T.leaves.length < 6000, `leaf count ${T.leaves.length} is between 2000 and 6000`);
ok(JSON.stringify(T.leaves.map((l) => [l.nx, l.ny, l.T.d0])) === JSON.stringify(T2.leaves.map((l) => [l.nx, l.ny, l.T.d0])), 'two builds give the same tree');
ok(T.bounds.y1 > 3 && T.bounds.y1 < 5.5 && T.bounds.x1 - T.bounds.x0 > 4 && T.bounds.x1 - T.bounds.x0 < 8, 'the crown is 3 to 5.5 m tall and 4 to 8 m wide');
ok(T.leaves.filter((l) => l.focus).length === 1, 'one leaf is followed');
for (const l of T.leaves) {
  const t = l.T;
  ok(t.bud >= M.DAY_START && t.bud < 100, 'buds open in the first fortnight');
  ok(t.d0 > 290 && t.d0 < 320 && t.drop > t.d0 + 20 && t.land <= M.DAY_END + 1e-9, 'a leaf turns, then falls, and has landed by the last day');
  if (!l.focus) ok(t.drop < T.focus.T.drop, 'the followed leaf is the last to fall');
  ok(l.gy < 0.5 && l.gy > -1.6, 'a fallen leaf lies on the lawn');
  for (const d of [M.DAY_START, 200, t.d0 + 10, t.drop + 1, M.DAY_END]) { const o = place(l, d); ok([o.x, o.y, o.a, o.q, o.size].every(Number.isFinite), 'a leaf has a finite place'); }
  ok(place(l, M.DAY_END).state === 2, 'every leaf is on the ground on the last day');
}
// sun leaves turn first and reddest
const sunny = T.leaves.filter((l) => l.sunny > 0.8 && !l.focus), shaded = T.leaves.filter((l) => l.sunny < 0.2);
const mean = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
ok(sunny.length > 50 && shaded.length > 50, 'the crown has both sunny and shaded leaves');
ok(mean(sunny, (l) => l.T.d0) < mean(shaded, (l) => l.T.d0) - 5, 'leaves in the sun turn at least five days before shaded ones');
ok(mean(sunny, (l) => M.pigments(335, l.T).anth) > 3 * mean(shaded, (l) => M.pigments(335, l.T).anth), 'leaves in the sun make several times more anthocyanin');
// the point the deeper scales look into is on the blade, clear of the lobe's middle vein
ok(SPOT[0] > 0.2 && SPOT[0] < 0.8 && Math.abs(SPOT[1]) > 0.03 && Math.abs(SPOT[1]) < 0.12, 'the spot is on the middle lobe beside its vein');
ok(leafShape.plain.length === 7 && leafShape.veins.length === 7, 'a leaf has seven lobes, each with a vein');

// the followed leaf, day by day
const F = M.FOCUS; let last = null, chlHalf = 0, anthHalf = 0, carMin = 1;
for (let d = M.DAY_START; d <= M.DAY_END; d += 0.25) {
  const p = M.pigments(d, F);
  for (const k of ['size', 'chl', 'car', 'anth', 'absc', 'fall']) ok(p[k] >= 0 && p[k] <= 1, `${k} is within 0..1 on day ${d}`);
  if (last) {
    for (const k of ['size', 'chl', 'car', 'anth', 'absc']) ok(Math.abs(p[k] - last[k]) < 0.03, `${k} changes smoothly at day ${d}`);
    ok(p.anth >= last.anth - 1e-12 && p.absc >= last.absc - 1e-12 && p.size >= last.size - 1e-12, 'anthocyanin, the cut and the blade only grow');
    if (d > F.d0) ok(p.chl <= last.chl + 1e-12, 'chlorophyll only falls in autumn');
  }
  if (!chlHalf && d > 200 && p.chl < 0.5) chlHalf = d;
  if (!anthHalf && p.anth > 0.5) anthHalf = d;
  if (d > 200) carMin = Math.min(carMin, p.car);
  last = p;
}
const summer = M.pigments(200, F);
ok(summer.chl === 1 && summer.car === 1 && summer.anth === 0 && summer.absc === 0, 'in summer: full chlorophyll and carotenoids, no anthocyanin, stalk whole');
ok(chlHalf > F.d0 && anthHalf > F.d0 && Math.abs(chlHalf - anthHalf) < 6, 'chlorophyll halves and anthocyanin half-fills within a few days of each other');
ok(carMin > 0.4, 'more than 40% of the carotenoids outlast the chlorophyll');
ok(M.pigments(F.drop - 0.01, F).absc > 0.99 && M.pigments(F.drop - 0.01, F).fall === 0, 'the leaf falls when the stalk is cut through, not before');

// colours, from the spectra
const name = (p) => M.colourName(M.leafRGB(p));
ok(name(M.pigments(M.DAY_START + 12, F)) === 'yellow-green', `a new leaf is yellow-green (${name(M.pigments(M.DAY_START + 12, F))})`);
ok(name(summer) === 'green', `a summer leaf is green (${name(summer)})`);
ok(name(M.pigments(335, F)) === 'red', `the followed leaf at its peak is red (${name(M.pigments(335, F))})`);
const shade = M.timetable(0, 0.5, 0.5);
ok(['yellow', 'orange'].includes(name(M.pigments(shade.drop, shade))), `a shaded leaf falls yellow or orange (${name(M.pigments(shade.drop, shade))})`);
ok(M.peakReturned(M.returned(summer)) >= 540 && M.peakReturned(M.returned(summer)) <= 560, 'a green leaf sends back most near 550 nm');
for (const k of M.PIG) { const t = M.bandTable(k); let pk = 0; for (let i = 0; i < M.NS; i++) if (t[i] > t[pk]) pk = i; const l = M.nm(pk); ok(k === 'chl' ? (l >= 430 && l <= 445) || (l >= 670 && l <= 680) : k === 'car' ? l >= 440 && l <= 490 : l >= 520 && l <= 545, `${k} absorbs most where it should (${l} nm)`); }
const rs = M.returned(summer); for (let i = 0; i < M.NS; i++) ok(rs[i] > 0 && rs[i] < 1, 'the share of light that comes back is between 0 and 1');
for (let l = 400; l <= 700; l += 10) ok(M.wavelengthRGB(l).every((v) => v >= 0 && Number.isFinite(v)), `a colour for ${l} nm`);

console.log(fails ? `${fails} failed` : `model: all checks passed (${T.leaves.length} leaves)`);
process.exit(fails ? 1 : 0);
