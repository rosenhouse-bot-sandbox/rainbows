// Stage 6: why each colour is slowed by a different amount. Not to scale: in real water there are
// about a thousand layers of molecules in one wavelength; here each drawn molecule stands for over a hundred layers.
//
// The model is the Lorentz oscillator that gives optics.nWater: each molecule's electrons are pulled back
// toward its nuclei in proportion to their displacement, with natural frequency ω0 in the ultraviolet, and light at ω drives it with amplitude
// ∝ 1/(ω0² − ω²). The surface is the plane x = 0, with water at x > 0; light arrives at an angle you set.
import { V, DEG, rng, sstep } from '../gl.js';
import * as O from '../optics.js';
import { backdrop, colourName } from './common.js';
import surface, { SKIN_GLSL, skinWidth, cutAt } from './surface.js';

const NL = 37, DX = 0.25, X1 = 0.3, AMP = 1.3, SI = 8.2, ST = 9.6, W = 2.3, YF = -3.0, XB = 9.4, ZB = 5.6, YM = 2.0;
const lamD = l => 3.2 * l / 550;                 // drawn vacuum wavelength, scene units
let mols = [], skinProg = null;
// Where this scene sits in the Surface scale's: a point p here is IN.o + IN.s (p.x IN.X + p.y IN.Y + p.z IN.Z) there.
const IN = surface.embed();
// The wave's phase is added up frame by frame, so a change of colour changes how fast it advances from
// here on and never where it already is: the wave does not jump or race while the slider moves.
let phase = 0, lastT = null;
const WHITE = [0.82, 0.88, 1.0], BCOL = [0.35, 0.75, 1.0], GRID = [0.35, 0.75, 1.0], CLOUD = [0.45, 0.68, 1.0], CORE = [1.0, 0.5, 0.38];
const css = c => O.cssRGB(c);

// The exact plane-wave solution for light arriving at an angle with its electric field along y
// (across the plane of the bend, which is the floor of the scene). Fresnel gives r and t.
function setup(S) {
  const l = S.lambda, n = O.nWater(l), th = Math.min(75, S.tilt) * DEG;
  const si = Math.sin(th), ci = Math.cos(th), sT = si / n, cT = Math.sqrt(1 - sT * sT);
  const k0 = 2 * Math.PI / lamD(l), wT = phase, r = (ci - n * cT) / (ci + n * cT), t = 1 + r;
  return { l, n, th, thT: Math.asin(sT), k0, wT, r, t,
    di: [ci, 0, -si], dt: [cT, 0, -sT], dr: [-ci, 0, -si],          // directions of travel
    bi: [si, 0, ci], bt: [sT, 0, cT], br: [si, 0, -ci],             // the magnetic field's direction, k × E
    inWater: p => t * Math.cos(n * k0 * (cT * p[0] - sT * p[2]) - wT) };
}
const pct = x => (x * 100).toFixed(1) + '%';

// ---- the two moving pictures in the panel ----
const EXTRA = 10;          // how many times too big the electron picture draws the extra displacement
const LAYER = 550 / 8;     // nm between the layers drawn in the wavelet picture
const lagAt = l => 2 * Math.PI * (O.nWater(l) - 1) * LAYER / l;      // radians one drawn layer sets the wave back
function fit(cv) {
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.lineCap = 'round'; g.lineJoin = 'round'; g.font = '600 11px system-ui, sans-serif'; g.textAlign = 'center';
  return { g, w, h };
}
const INK = 'rgba(234,240,255,', CLOUD_CSS = 'rgb(140,190,255)', CORE_CSS = 'rgb(255,150,120)';
// One molecule in 700 nm light and one in 400 nm: its electrons (a disc), the field, and how far they move.
function drawElectrons(cv, T) {
  const f = fit(cv); if (!f) return; const { g, w, h } = f, cy = h / 2 + 4, R0 = 15;
  [[700, '700 nm', 0.27], [400, '400 nm', 0.73]].forEach(([l, name, at]) => {
    const cx = w * at, col = O.cssRGB(O.wlRGB(l)), extra = O.energySplit(l).response - 1;
    const amp = R0 * (1 + EXTRA * extra), push = Math.cos(2 * Math.PI * T * 550 / l / 2.2), y = cy + amp * push;       // the cloud goes against the field
    g.fillStyle = INK + '.75)'; g.fillText(name, cx, 12);
    // how far a steady field would move the middle of the electrons
    g.setLineDash([3, 3]); g.strokeStyle = INK + '.45)'; g.lineWidth = 1;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + 14, cy + s * R0); g.lineTo(cx + 40, cy + s * R0); g.stroke(); }
    g.setLineDash([]);
    g.strokeStyle = INK + '.8)'; g.beginPath(); g.moveTo(cx + 18, y); g.lineTo(cx + 36, y); g.stroke();       // where its middle is now
    // the cloud, and the rest of the molecule, which stays put
    g.globalAlpha = 0.55; g.fillStyle = CLOUD_CSS; g.beginPath(); g.arc(cx, y, 11, 0, 7); g.fill(); g.globalAlpha = 1;
    g.fillStyle = CORE_CSS; g.beginPath(); g.arc(cx, cy, 3.5, 0, 7); g.fill();
    // the light's push
    const ax = cx - 34, len = -26 * push;
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.5; g.beginPath(); g.moveTo(ax, cy); g.lineTo(ax, cy + len); g.stroke();
    if (Math.abs(len) > 5) { const s = Math.sign(len); g.beginPath(); g.moveTo(ax, cy + len + s * 3); g.lineTo(ax - 4, cy + len - s * 4); g.lineTo(ax + 4, cy + len - s * 4); g.fill(); }
  });
}
// The wave going into the water, layer by layer: what each layer adds, and what the sum is.
function drawSum(cv, S, T) {
  const f = fit(cv); if (!f) return; const { g, w, h } = f, l = S.lambda, col = O.cssRGB(O.wlRGB(l));
  const x0 = Math.round(w * 0.24), px = 0.3 * w / 550, lam = l * px, d = LAYER * px, k = 2 * Math.PI / lam, lag = lagAt(l);
  const wt = 2 * Math.PI * T * 550 / l / 2.2, y1 = h * 0.27, u1 = h * 0.17, y2 = h * 0.76, u2 = h * 0.34;
  const layers = []; for (let x = x0 + d / 2; x < w - 2; x += d) layers.push(x);
  const passed = x => x < x0 ? 0 : Math.min(layers.length, Math.floor((x - x0) / d + 0.5));
  g.fillStyle = 'rgba(40,90,190,.22)'; g.fillRect(x0, 0, w - x0, h);
  g.strokeStyle = 'rgba(115,185,255,.9)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0, h); g.stroke();
  g.strokeStyle = INK + '.1)'; g.lineWidth = 1;
  for (const x of layers) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x, h - 4); g.stroke(); }
  const trace = (fn, xa, xb, y, u) => { g.beginPath(); for (let x = xa; x <= xb; x += 1.5) g.lineTo(x, y - u * fn(x)); g.stroke(); };
  // the wave as it would be with no water, and the wave as it is
  g.setLineDash([4, 4]); g.strokeStyle = INK + '.5)'; g.lineWidth = 1.2; trace(x => Math.cos(k * (x - x0) - wt), x0, w, y1, u1); g.setLineDash([]);
  g.strokeStyle = col; g.lineWidth = 2.4; trace(x => Math.cos(k * (x - x0) - wt), 0, x0, y1, u1);
  for (let j = 0; j <= layers.length; j++) trace(x => Math.cos(k * (x - x0) - wt + j * lag), j ? layers[j - 1] : x0, j < layers.length ? layers[j] : w, y1, u1);
  // what each layer of molecules gives off: the difference it makes to the wave that reaches it
  // (one layer in three is drawn, or they hide one another)
  g.strokeStyle = CLOUD_CSS; g.lineWidth = 1.3; g.globalAlpha = 0.85;
  layers.forEach((xj, i) => i % 3 === 1 && trace(x => (Math.cos(k * (x - x0) - wt + (i + 1) * lag) - Math.cos(k * (x - x0) - wt + i * lag)) * Math.min(1, (x - xj) / 6), xj, w, y2, u2));
  g.globalAlpha = 1; g.fillStyle = CLOUD_CSS;
  layers.forEach((x, i) => { g.globalAlpha = i % 3 === 1 ? 1 : 0.35; g.beginPath(); g.arc(x, y2 + 4 * Math.cos(k * (x - x0) - wt + passed(x) * lag), 2, 0, 7); g.fill(); }); g.globalAlpha = 1;
  g.fillStyle = INK + '.6)'; g.fillText('Air', x0 / 2, h - 5); g.fillText('Water', (x0 + w) / 2, h - 5);
}

export default {
  id: 'atoms', name: 'Molecules', scale: '1 nm', scaleNote: 'not to scale: see the note', modes: false, focus: false,
  controls: ['tilt', 'lambda', 'bfield'], lambdaMin: 250, bloom: 0.55, exposure: 1.0,
  overlay: true,      // light on a dark ground: laid over the scale above during the flight in
  // The camera is the Surface scale's, moved closer: set in the drop's world with the same limits, so
  // it stays upright there and the water stays on the side it was on. (main.js hands the direction
  // of view from one scale to the other, so the flight between them never turns the camera.)
  cam: { type: 'orbit', target: [1.5, 0, -0.4], yaw: surface.cam.yaw, pitch: surface.cam.pitch, dist: 33, fov: 34,
    lim: { yaw: surface.cam.lim.yaw, pitch: surface.cam.lim.pitch, dist: [15, 48] } },
  camFrame(S) {
    const turn = surface.camFrame(S);
    return v => { const a = turn(v); return [V.dot(a, IN.X), V.dot(a, IN.Y), V.dot(a, IN.Z)]; };
  },

  // One caption for the whole scale. It sits above the sliders, so it must not change length while one is dragged.
  caption() {
    return { title: 'Why short wavelengths are slowed more',
      body: 'The electric field of light pushes the electrons of every water molecule it passes back and forth, and electrons moved back and forth give off light of their own. The two moving pictures below show how that slows the wave. Slowed crests arriving at an angle must change direction to stay joined at the surface. That change is refraction.' };
  },
  // Every number here sits in a cell of its own, so the text never re-wraps as the sliders move.
  readout(S) {
    const l = S.lambda, e = O.energySplit(l), lag = O.lagPerLayerDeg(l), col = css(O.wlRGB(l));
    const C = { el: col, st: '#f7b04d', mo: '#ff6b5e', mg: '#58b8ff' };
    const bar = (name, parts) => `<div class="bar"><span>${name}</span><div>${parts.map(([w, c]) => `<i style="width:${(w * 100).toFixed(2)}%;background:${c}"></i>`).join('')}</div></div>`;
    const lag1000 = lag * 1000, a = -lag1000 * DEG, th = Math.min(75, S.tilt);
    const x2 = 48 + 34 * Math.cos(a), y2 = 48 - 34 * Math.sin(a);
    const key = (c, text, dot) => `<li><i class="${dot ? 'dot' : ''}" style="background:${c}"></i><span>${text}</span></li>`;
    const more = n => ((O.energySplit(n).response - 1) * 100).toFixed(1) + '%';
    const figs = `<figure class="fig"><canvas data-fig="electrons" role="img" aria-label="Two water molecules side by side, one in 700 nm light and one in 400 nm light. Each is drawn as a red dot for its nuclei and a blue disc for its electrons. The disc moves up and down, opposite to an arrow showing the light's electric field. In the 400 nm light it moves faster and further."></canvas>
<figcaption>Blue disc: a water molecule's electrons. Red dot: its nuclei. The arrow is the light's electric field. It pushes the negatively charged electrons the opposite way, and their attraction to the nuclei pulls them back. Left alone, displaced electrons would oscillate at an ultraviolet frequency. The frequency of 400 nm light is nearer to that than the frequency of 700 nm light, so it moves them further: ${more(400)} further than a steady field of the same strength would, against ${more(700)} at 700 nm. The dashed marks show how far the steady field moves them. The extra beyond the marks is drawn ${EXTRA} times too big.</figcaption></figure>
<figure class="fig"><canvas data-fig="sum" role="img" aria-label="A wave crossing from air into water. In the water it falls further and further behind a dashed copy of itself that carries on as if there were no water. Below, each layer of molecules gives off a small wave of its own, a quarter of a cycle behind."></canvas>
<figcaption>Above: the wave (bold) beside the wave as it would be with no water (dashed). Below: the small wave that the moving electrons in one layer of molecules give off, a quarter of a cycle behind (one layer in three is drawn). Adding each one delays the wave a little more, ${(lagAt(l) / DEG).toFixed(0)}° of phase per layer at this wavelength. Each layer drawn stands for about ${Math.round(LAYER / 0.31 / 10) * 10} real ones, and reflection is left out.</figcaption></figure>`;
    return `${figs}<ul class="scenekey">
${key(col, '<b>Electric field E</b> of the light, pointing up, then down')}
${S.bfield ? key(css(BCOL), '<b>Magnetic field B</b>: points side to side, in step with E') : ''}
${key(css(CLOUD), '<b>Electrons</b> of a water molecule, drawn as one disc, pushed by E', 1)}
${key(css(CORE), '<b>Nuclei</b> of the molecule, too heavy to move visibly', 1)}
<li><i class="dash"></i><span><b>Dashed, on the floor</b>: the way straight on, and the perpendicular to the surface</span></li></ul>
<div class="phasor"><svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="34" fill="none" stroke="rgba(234,240,255,.18)"/>
<line x1="48" y1="48" x2="82" y2="48" stroke="rgba(234,240,255,.45)" stroke-width="2" stroke-dasharray="3 3"/>
<path d="M ${48 + 20} 48 A 20 20 0 ${lag1000 > 180 ? 1 : 0} 1 ${48 + 20 * Math.cos(a)} ${48 - 20 * Math.sin(a)}" fill="none" stroke="${col}" stroke-width="1.5"/>
<line x1="48" y1="48" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="3" stroke-linecap="round"/></svg>
<div><h3>Phase delay from 1000 layers of molecules</h3>
<dl><dt>This wavelength</dt><dd>${lag1000.toFixed(0)}°</dd>
<dt>700 nm, seen as red</dt><dd>${(O.lagPerLayerDeg(700) * 1000).toFixed(0)}°</dd>
<dt>400 nm, seen as violet</dt><dd>${(O.lagPerLayerDeg(400) * 1000).toFixed(0)}°</dd></dl></div></div>
<dl><dt>Seen as</dt><dd>${l < 400 ? 'nothing: ultraviolet' : colourName(l)}</dd>
<dt>Arrives at, continues at</dt><dd>${th.toFixed(1)}° → ${(Math.asin(Math.sin(th * DEG) / e.n) / DEG).toFixed(1)}°</dd>
<dt>Speed of the crests in water</dt><dd>${e.vPhase.toFixed(4)} c</dd>
<dt>Electron movement, against a steady field's</dt><dd>× ${e.response.toFixed(3)}</dd></dl>
<details data-k="energy" class="energy"><summary>Where the wave's energy is</summary>
${bar('Air', [[0.5, C.el], [0.5, C.mg]])}
${bar('Water', [[e.electric, C.el], [e.stretch, C.st], [e.motion, C.mo], [e.magnetic, C.mg]])}
<dl><dt><i style="background:${C.el}"></i>Electric field</dt><dd>${pct(e.electric)}</dd><dt><i style="background:${C.st}"></i>Displaced electrons</dt><dd>${pct(e.stretch)}</dd>
<dt><i style="background:${C.mo}"></i>Moving electrons</dt><dd>${pct(e.motion)}</dd><dt><i style="background:${C.mg}"></i>Magnetic field</dt><dd>${pct(e.magnetic)}</dd>
<dt>Energy travels at</dt><dd>${e.vEnergy.toFixed(4)} c</dd></dl>
<p>In air the energy is half electric and half magnetic, and all of it travels. In water, part of the energy is stored in the molecules, in the displacement and the motion of their electrons. Stored energy does not travel, so the energy as a whole moves slower. At shorter wavelengths more is stored.</p></details>
<p>Not to scale: each molecule drawn stands for about ${Math.round(DX / (lamD(l) / e.n) * (l / e.n) / 0.31 / 10) * 10} layers of real ones, 0.31 nm apart. The few percent of the light that reflects off the surface is left out. The water is drawn cut open along the plane of the bend, as at the Surface scale.</p>`;
  },
  // Called every frame while this scale is showing: the readout is rebuilt whenever a control moves,
  // so the canvases are looked up afresh. T is the scene's clock, which Pause stops.
  figures(root, S, T) {
    for (const cv of root.querySelectorAll('canvas[data-fig]')) cv.dataset.fig === 'electrons' ? drawElectrons(cv, T) : drawSum(cv, S, T);
  },
  labels(S) {
    const c = setup(S), at = (d, k, up = 0, b = null, kb = 0) => { const p = V.mul(d, k); if (b) { p[0] += b[0] * kb; p[2] += b[2] * kb; } p[1] += up; return p; };
    const mid = (a, b) => V.norm(V.add(a, b));
    const L = [
      { p: [-5.5, 0, -3.0], text: 'Air', cls: 'big' }, { p: [5.5, 0, 4.5], text: 'Water', cls: 'big' },
      { p: at(c.di, -7.2, 0, c.bi, 2.6), text: 'Electric field E', cls: 'key', color: css(O.wlRGB(c.l)) },
      { p: at(mid(c.di, [1, 0, 0]), -2.7, YF), text: (c.th / DEG).toFixed(1) + '°', cls: 'num' },
      { p: at(mid(c.dt, [1, 0, 0]), 2.9, YF), text: (c.thT / DEG).toFixed(1) + '°', cls: 'num' },
    ];
    if (S.bfield) L.push({ p: at(c.di, -3.6, 0, c.bi, AMP + 0.3), text: 'Magnetic field B', cls: 'key', color: css(BCOL) });
    return L;
  },

  // Not a cloud of molecules but two tidy rows, one above the wave and one below it and in its own plane,
  // so each electron cloud can be seen swinging in step with the stretch of wave beside it.
  init(R) {
    // the drop's skin and the water behind it, exactly as the Surface scale draws them
    const f = a => a.map(x => x.toFixed(1)).join(',');
    skinProg = R.rayProgram(`uniform float uOwn, uSkin, uCut;
${SKIN_GLSL}
const mat3 IN = mat3(${f(IN.X)}, ${f(IN.Y)}, ${f(IN.Z)});
void main(){ o = vec4(dropSkin(IN*uEye*${IN.s.toFixed(6)}, IN*rayDir(), uSkin, uCut)*uOwn*uFade, 0.0); }`);
    const r = rng(7);
    for (let j = 0; j < NL; j++) for (const y of [-YM, YM])
      mols.push({ x: X1 + j * DX + (r() - 0.5) * 0.04, y: y + (r() - 0.5) * 0.08, u: 0 });
  },

  draw(R, S, T) {
    if (lastT !== null) phase = (phase + 2 * Math.PI / lamD(S.lambda) * 2.1 * Math.max(0, T - lastT)) % (2 * Math.PI);
    lastT = T;
    const c = setup(S), col = O.wlRGB(c.l), e = O.energySplit(c.l), lam = lamD(c.l);
    backdrop(R, T, [0.010, 0.016, 0.036], [0.003, 0.005, 0.012]);
    // The water is blue, as it is at the Surface scale, and on the same side. Flying in from there
    // this takes over from that scene's water as that scene gives way, so it is never drawn twice.
    const gl = R.gl;
    gl.useProgram(skinProg.p); R.setRayUniforms(skinProg, T);
    gl.uniform1f(skinProg.u.uOwn, R.zoom?.lo ? R.zoom.cover : 1);
    gl.uniform1f(skinProg.u.uSkin, skinWidth(V.mul(R.view.eye, IN.s))); gl.uniform1f(skinProg.u.uCut, cutAt(V.mul(R.view.eye, IN.s)));
    R.fullscreen(skinProg, 'add');

    // the surface (the plane x = 0) and the floor of the water behind it
    // (this wire frame is the scale's own; flying in from the Surface scale it comes up last, so the
    // wave is first seen in the surface it belongs to and not in a box of its own)
    const own = R.zoom?.lo ? sstep(0.75, 1, R.zoom.k) : 1;
    for (let i = -3; i <= 3; i++) R.seg([0, -3.0, i * ZB / 3], [0, 3.0, i * ZB / 3], GRID, Math.abs(i) === 3 ? 0.3 : 0.07, 1.0);
    for (let i = -3; i <= 3; i++) R.seg([0, i, -ZB], [0, i, ZB], GRID, i === -3 ? 0.45 : i === 3 ? 0.3 : 0.07, 1.0);
    R.seg([0, YF, -ZB], [XB, YF, -ZB], GRID, 0.3, 1.2, 0.02);
    R.flushLines({ gain: own });
    // the perpendicular to the surface, on the floor, and the two angles measured from it
    R.seg([-4.5, YF, 0], [5.5, YF, 0], WHITE, 0.5, 1.2);
    R.flushLines({ dash: [0.3, 0, 0.5] });
    R.arc([0, YF, 0], [-1, 0, 0], [0, 0, 1], 2.0, 0, c.th, WHITE, 0.6, 1.3, 20);
    R.arc([0, YF, 0], [1, 0, 0], [0, 0, -1], 2.2, 0, c.thT, WHITE, 0.6, 1.3, 20);

    // crests, drawn on the floor: lines of equal phase across the beam. They meet at the surface.
    // In the water they sit closer together, so to stay joined they must turn.
    const crests = (d, b, step, s0, s1, half, keepWater, colr, alpha) => {
      const ph = ((c.wT / (2 * Math.PI)) % 1 + 1) % 1;
      for (let m = Math.ceil(s0 / step - ph); (m + ph) * step <= s1; m++) {
        const s = (m + ph) * step;
        let ax = d[0] * s - b[0] * half, az = d[2] * s - b[2] * half, bx = d[0] * s + b[0] * half, bz = d[2] * s + b[2] * half;
        const ina = keepWater ? ax >= 0 : ax <= 0, inb = keepWater ? bx >= 0 : bx <= 0;
        if (!ina && !inb) continue;
        if (ina !== inb) { const t = ax / (ax - bx), cz = az + (bz - az) * t; if (ina) { bx = 0; bz = cz; } else { ax = 0; az = cz; } }
        const fade = Math.min(1, (s - s0) / 1.5, (s1 - s) / 1.5);
        R.seg([ax, YF, az], [bx, YF, bz], colr, alpha * fade, 1.8);
      }
    };
    const halfT = W * Math.cos(c.thT) / Math.cos(c.th), reach = W * Math.tan(c.th);
    crests(c.di, c.bi, lam, -SI, reach, W, false, col, 0.6);
    crests(c.dt, c.bt, lam / c.n, -halfT * Math.tan(c.thT), ST, halfT, true, col, 0.6);
    R.flushLines();
    // the beam's path on the floor, where the two angles are measured
    const fl = (d, k) => [d[0] * k, YF, d[2] * k];
    R.seg(fl(c.di, -SI), [0, YF, 0], col, 0.15, 1.6, 0.8); R.seg([0, YF, 0], fl(c.dt, ST), col, 0.8, 1.6, 0.15);
    R.flushLines();
    // the way the light would have gone on if the water had not slowed it
    R.seg([0, YF, 0], fl(c.di, ST * 0.8), WHITE, 0.5, 1.2, 0.1);
    R.flushLines({ dash: [0.3, 0, 0.5] });

    // the wave along each ray: electric field up and down and, when asked for, magnetic field across, in step
    const ribbon = (d, b, s0, s1, k, amp, bamp) => {
      let pe = null, pb = null, i = 0;
      for (let s = s0; s <= s1; s += 0.07, i++) {
        const f = Math.cos(k * s - c.wT), edge = Math.min(1, (s - s0) / 1.2 + (s0 === 0 ? 1 : 0), (s1 - s) / 0.9);
        const o = [d[0] * s, 0, d[2] * s], E = [o[0], AMP * amp * f, o[2]], B = [o[0] + b[0] * AMP * bamp * f, 0, o[2] + b[2] * AMP * bamp * f];
        if (pe) { R.seg(pe, E, col, 0.95 * edge, 2.6); if (S.bfield) R.seg(pb, B, BCOL, 0.6 * edge, 1.8); }
        if (i % 3 === 0) { R.seg(o, E, col, 0.3 * edge, 1.1); if (S.bfield) R.seg(o, B, BCOL, 0.2 * edge, 1.0); }
        pe = E; pb = B;
      }
    };
    R.seg(V.mul(c.di, -SI), [0, 0, 0], WHITE, 0.2, 1.1); R.seg([0, 0, 0], V.mul(c.dt, ST), WHITE, 0.2, 1.1);
    ribbon(c.di, c.bi, -SI, 0, c.k0, 1, 1);
    ribbon(c.dt, c.bt, 0, ST, c.n * c.k0, c.t, c.n * c.t);
    R.flushLines();

    // molecules: a fixed core, and an electron cloud pushed against the field
    const swing = 0.42 * e.response / c.t;
    for (const m of mols) {
      const p = molPos(m, c), q = [p[0], p[1] - swing * c.inWater(p), p[2]];
      R.pt(p, CORE, 0.8, 0.1);
      R.pt(q, CLOUD, 0.16, 0.4);
      R.seg(p, q, CLOUD, 0.7, 1.4);
    }
    R.flushPoints(); R.flushLines();
  },
};
// molecules follow the refracted beam, so they stay in the light at any angle and colour
function molPos(m, c) { return [m.x, m.y, -Math.tan(c.thT) * m.x + m.u]; }
