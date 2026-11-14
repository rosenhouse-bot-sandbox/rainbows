// Stage 5: light meeting the water's surface, about ten wavelengths across. Units are micrometres.
// The surface is the drop's own: a sphere 1000 µm in radius whose top touches the origin, drawn to
// scale, so it runs off to a horizon and curves away below it. Across the beam it departs from flat
// by about 20 nm, so the field drawn is the exact plane-wave solution of Maxwell's equations at a
// flat boundary (Fresnel's coefficients), inside a beam of finite width. Water fills y < 0 there.
import { V, DEG, rng, sstep, clamp } from '../gl.js';
import * as O from '../optics.js';
import { backdrop } from './common.js';
import { crossAngle } from './drop.js';

const WAIST = 1.25, BOX = [46, 46, 2.3], LEN = 30, RD = 1000;      // BOX: how far the beams are drawn; LEN: how far the photons run;      // RD: the drop's radius
let prog = null, photons = [], photonKey = '', omegaT = 0, lastT = null;
const rand = rng(23);

// The angle at which the rainbow ray meets the surface at each of its three crossings.
export function presetAngle(S) {
  const n = O.nWater(S.lambda), b = O.bowB(n);
  if (S.cross === 'enter') return +(Math.asin(b) / DEG).toFixed(1);
  return +(Math.asin(b / n) / DEG).toFixed(1);
}
// The steepest angle the slider offers. From inside the water it stops short of the critical angle
// (48.1° for violet), beyond which nothing is transmitted: sunlight in a drop never gets there.
export const maxAngle = S => S.cross === 'enter' ? 85 : 47.5;
// The drop's skin and the water under it, as a sight line from ro along rd sees them (in this scene's
// axes and micrometres). The Molecules scale draws the same thing, so the water stays where it was
// and stays blue on the way down into it.
export const SKIN_GLSL = `
const float RD = ${RD.toFixed(1)};
// lines of a square net with cells "cell" across, kept about a pixel wide and faded out before they blur together
float net(vec2 g, float cell){
  vec2 q = g/cell, w = fwidth(q), d = abs(fract(q - 0.5) - 0.5);
  vec2 l = 1.0 - smoothstep(w*0.6, w*1.6, d);
  return max(l.x, l.y)*(1.0 - smoothstep(0.08, 0.3, max(w.x, w.y)));
}
// The drop's skin with its net of lines, where a sight line meets it at P.
vec3 skin(vec3 P, vec3 rd, float sheen){
  vec3 nrm = vec3(P.x, P.y + RD, P.z)/RD;
  vec2 g = RD*vec2(atan(P.x, P.y + RD), atan(P.z, P.y + RD));
  float line = max(net(g, 2.0), max(net(g, 20.0), net(g, 200.0)));
  float graze = pow(1.0 - abs(dot(nrm, rd)), 4.0);
  return vec3(0.16,0.34,0.7)*(0.05*sheen + 0.11*line + 0.45*graze*sheen);
}
// The drop itself, to scale: its skin carries a net of 2 µm squares near the beam, 20 µm and 200 µm
// ones further off, and shines where it is seen edge-on, at the horizon.
// (The sphere's centre is RD below the origin; the forms used keep their precision though the
// camera is a few units from a sphere a thousand across.) From outside, the near skin is seen with
// the water behind it; from inside, the far skin is a window on the dark air beyond and the water in
// between is kept faint. A flight can carry the camera through the skin, so the two views are blended
// over its last few µm outside (w: wider from far off, to match the Drop scale), and skin right at the eye is not drawn: nothing changes at once there.
// The drop is drawn cut open: the half of it nearer the camera than the plane z = zc is taken away,
// so that the water's cut face and its edge, the surface in cross-section, are seen square on with
// the beams lying in that face. (zc is 0, the plane of the ray, once the camera is close; from far off
// it is out beyond the drop, which is then whole: see cutAt.) What is left is the sphere where z < zc.
vec3 dropSkin(vec3 ro, vec3 rd, float w, float zc){
  float reach = min(2.0*RD, 10.0*w);      // how near counts as right at the eye (see the Drop scale's shader)
  float cc = dot(ro,ro) + 2.0*RD*ro.y, bb = dot(ro,rd) + RD*rd.y, hh = bb*bb - cc;
  // where the sight line meets the cutting plane, and how far outside the sphere that point is
  float tp = (zc - ro.z)/(abs(rd.z) < 1e-6 ? -1e-6 : rd.z);
  vec3 Pp = ro + rd*tp;
  float hp = (dot(Pp,Pp) + 2.0*RD*Pp.y)/(2.0*RD), fw = fwidth(hp);
  // how far outside what is left the eye is, and so how much of the view from outside to use
  float wo = smoothstep(0.0, w, max(cc/(2.0*RD), ro.z - zc));
  vec3 col = vec3(0.0);
  // the edge of the cut face: the surface itself, as a bright line
  if(ro.z > zc && rd.z < 0.0 && tp > 0.0 && fw < 0.5*RD) col += wo*vec3(0.45,0.72,1.0)*0.9*exp(-abs(hp)/(1.2*fw + 0.012));
  if(hh <= 0.0) return col;
  float sq = sqrt(hh), tFar = sq - bb, tNear = cc/tFar;      // tNear < 0 with the eye inside the sphere
  float a = tNear, b = tFar; bool face = false, open = false;
  if(rd.z < 0.0){ if(tp > a){ a = tp; face = true; } } else if(tp < b){ b = tp; open = true; }
  if(b <= max(a, 0.0)) return col;
  // (with the drop cut open, the outside of the half that is left is drawn as its net of lines on the
  // dark, without the blue of the water under it: it lies behind the air the beams cross, and the
  // blue is kept for the cut face, so that water and air are told apart at a glance)
  float whole = smoothstep(0.0, 60.0, zc);
  if(wo > 0.0) col += wo*(face ? vec3(0.16,0.34,0.7)*0.07 : skin(ro + rd*a, rd, mix(0.12, 1.0, whole)));
  if(wo < 1.0 && !open) col += (1.0 - wo)*(1.0 - exp(-2.0*b/reach))*skin(ro + rd*b, rd, 1.0);
  return col + vec3(0.010,0.028,0.070)*mix(0.45, 1.5*(face ? 1.0 : mix(0.2, 1.0, whole)), wo)*(1.0 - exp(-(b - max(a, 0.0))/7.0));
}
`;
// Where the cut is, for a camera at `eye` (µm from the crossing): in the plane of the ray from any
// distance this scale's own camera can reach, and further toward the camera the further off it is,
// so that from the Drop scale's distances the drop is whole and the cut closes in as the camera does.
// (This scale's camera goes out to 25 µm, and up to three times that on a narrow screen, where it
// stands further back to fit the scene in: the cut has to be in the plane of the ray from all of those.)
export const cutAt = eye => Math.max(0, 0.8 * (V.len(eye) - 80));
// how wide that blend is, for a camera at `eye`
export const skinWidth = eye => Math.min(300, Math.max(3, 0.6 * (V.len(eye) - 25)));
function setup(S) {
  const n = O.nWater(S.lambda), enter = S.cross === 'enter', crit = O.criticalAngle(n);
  const n1 = enter ? 1 : n, n2 = enter ? n : 1, th = clamp(S.theta * DEG, 0.001, enter ? 1.5 : crit - 0.004);
  const F = O.fresnelAmp(n1, n2, th, S.pol), k0 = 2 * Math.PI / (S.lambda / 1000);
  return { n, n1, n2, th, F, k0, sy: enter ? 1 : -1, enter, crit };
}
// map from the solver's frame (light arrives from q.y > 0) to the scene (water below)
const toScene = (q, c) => [q[0], q[1] * c.sy, q[2]];
const weights = S => S.focus === 'sun' ? [1, 0.22, 0.22] : S.focus === 'both' ? [1, 1, 1]
  : S.cross === 'back' ? [0.22, 1, 0.18] : [0.22, 0.18, 1];

export default {
  id: 'surface', name: 'Surface', scale: '1 µm', scaleNote: 'about 12 µm across', modes: true, focus: true,
  controls: ['cross', 'focus', 'mode', 'theta', 'lambda', 'pol'], bloom: 0.9, exposure: 1.0,
  overlay: true,      // light on a dark ground: laid over the scale above during the flight in
  cam: { type: 'orbit', target: [0, 0, 0], yaw: -0.3, pitch: 0.2, dist: 19, fov: 34,
    lim: { yaw: [-1.1, 1.1], pitch: [-0.35, 0.8], dist: [6, 25] } },
  // The camera stays upright in the drop's world, as it is at the Drop scale, so the surface is seen
  // tilted the way it really lies at each crossing: on the drop's upper side where the light enters,
  // nearly on end at the back, and underneath where it leaves. This turns a direction given in the
  // drop's axes into this scene's, whose y is the outward normal there (see the Drop scale's embed).
  camFrame(S) {
    const a = S.crossPhi ?? crossAngle(S.cross, S.lambda), s = Math.sin(a), c = Math.cos(a);
    return v => [v[0] * s - v[1] * c, v[0] * c + v[1] * s, v[2]];
  },
  // The Molecules scene is the same surface where the beam meets it: its +x runs down into the water,
  // and one of its units is 0.17 µm, so its wavelengths are this scene's wavelengths.
  embed: () => ({ o: [0, 0, 0], s: 550 / 3200, X: [0, -1, 0], Y: [0, 0, 1], Z: [-1, 0, 0] }),

  // The words describe what is drawn, so they go by the view: dots in one, crests in the other. The
  // dots show where the light goes; why it turns, and how much of it reflects, comes from the wave.
  caption(S) {
    const c = setup(S), wave = S.mode === 'wave';
    const why = ' The dots show where the light goes. Why it turns is explained by treating light as a wave, the better model at a surface: switch to Waves.';
    if (S.cross === 'enter') return wave
      ? { title: 'Slower, closer crests, a new direction',
        body: 'Each bright sheet is a crest, where the wave\'s field is strongest. Light travels more slowly in water, so the crests there are closer together. Each crest in the air stays joined to one in the water along the surface, and it can only do that if the wave turns. That turn is refraction. Part of the wave reflects.' }
      : { title: 'Into the water: slower, and turned',
        body: 'Each dot is a photon, a single particle of light. At the surface some photons reflect. The rest go on into the water, more slowly and in a new direction. That change of direction is refraction.' + why };
    if (S.cross === 'back') {
      // what the rainbow ray itself does there, whatever the sliders are set to: it arrives at the
      // angle it was bent to on the way in, and sunlight is an even mix of the two polarisations
      const n = O.nWater(550), th = presetAngle({ cross: 'back', lambda: 550 }) * DEG, pc = x => (x * 100).toFixed(x < 0.01 ? 1 : 0) + '%';
      const Rs = O.fresnelAmp(n, 1, th, 's').R, Rp = O.fresnelAmp(n, 1, th, 'p').R;
      return { title: 'The back wall reflects only a little',
        body: `The rainbow ray meets the back of the drop at about ${(th / DEG).toFixed(0)}°. All of the light would reflect only beyond ${(c.crit / DEG).toFixed(1)}°, the critical angle, so ${wave ? 'most of the wave passes' : 'most photons pass'} out into the air. About ${pc((Rs + Rp) / 2)} of sunlight reflects to carry on toward the bow: ${pc(Rs)} or ${pc(Rp)}, depending on which way its electric field points. Light inside a sphere always meets the wall at the angle it was bent to on the way in, which is below the critical angle.` };
    }
    return wave
      ? { title: 'Out again, bending toward you',
        body: 'Leaving the water, the crests speed up, move further apart and turn away from the perpendicular, the dashed line at right angles to the surface. This bend is the first one in reverse. It sets the direction in which each wavelength finally travels to your eye.' }
      : { title: 'Out again, bending toward you',
        body: 'Leaving the water, the photons speed up and turn away from the perpendicular, the dashed line at right angles to the surface. This bend is the first one in reverse. It sets the direction in which each wavelength finally travels to your eye.' + why };
  },
  readout(S) {
    const c = setup(S), d = x => (x / DEG).toFixed(1) + '°';
    const other = O.fresnelAmp(c.n1, c.n2, c.th, S.pol === 's' ? 'p' : 's');
    const nr = O.nWater(700), nv = O.nWater(400);
    const bend = n => c.enter ? Math.asin(Math.min(1, Math.sin(c.th) / n)) : Math.asin(Math.min(1, n * Math.sin(c.th)));
    let rows = `<dt>Water's index at ${Math.round(S.lambda)} nm</dt><dd>${c.n.toFixed(4)}</dd>
<dt>Wavelength in water</dt><dd>${(S.lambda / c.n).toFixed(0)} nm</dd>
<dt>Reflected</dt><dd>${(c.F.R * 100).toFixed(1)}% (other polarisation ${(other.R * 100).toFixed(1)}%)</dd>`;
    rows += `<dt>Transmitted, leaving at</dt><dd>${((1 - c.F.R) * 100).toFixed(1)}% at ${d(c.F.thetaT)}</dd>
<dt>700 nm would leave at</dt><dd>${d(bend(nr))}</dd><dt>400 nm would leave at</dt><dd>${d(bend(nv))}</dd>`;
    return `<dl>${rows}</dl><p>The drop is drawn cut open along the plane of the ray: the bright line is its surface seen edge-on, with the water's cut face on one side and air on the other. The light itself is a round beam, in front of the cut as well as behind it.</p>` + (S.pol === 'p' && S.mode === 'wave' ? '<p>With the electric field in the plane of the bend, the quantity drawn is the magnetic field, which then points along the surface.</p>' : '');
  },
  labels(S) {
    const c = setup(S), L = [];
    L.push({ p: [-5.4, 3.6, 0], text: 'Air', cls: 'big' }, { p: [-5.4, -3.6, 0], text: 'Water', cls: 'big' });
    L.push({ p: toScene([-Math.sin(c.th / 2) * 2.3, Math.cos(c.th / 2) * 2.3, 0], c), text: (c.th / DEG).toFixed(1) + '°', cls: 'num' });
    L.push({ p: toScene([Math.sin(c.F.thetaT / 2) * 2.3, -Math.cos(c.F.thetaT / 2) * 2.3, 0], c), text: (c.F.thetaT / DEG).toFixed(1) + '°', cls: 'num' });
    return L;
  },

  init(R) {
    prog = R.rayProgram(`
uniform vec4 uA, uB, uC, uD; uniform vec3 uCol, uW; uniform float uOwn, uLit, uSkin, uCut;
const vec3 BOX = vec3(${BOX.map(x => x.toFixed(2)).join(',')});
float sg(float a){ return exp(-a*a); }       // a beam with a fairly flat top and a definite edge
// x: the field; y: its envelope squared; z: how strongly to draw it
vec3 field(vec3 p){
  vec3 q = vec3(p.x, p.y*uA.w, p.z);
  float w2 = uD.x*uD.x, gz = sg(q.z*q.z/w2), ci = uA.z, c2 = ci*ci/w2;
  float r = uC.x, tm = 1.0 + r;          // Fresnel's reflected and transmitted amplitudes
  if(q.y >= 0.0){
    float xi = q.x + q.y*uD.z, xr = q.x - q.y*uD.z;
    float gi = gz*sg(xi*xi*c2), gr = abs(r)*gz*sg(xr*xr*c2);
    float F = gi*cos(uA.x*(uA.y*q.x - ci*q.y) - uC.w) + sign(r)*gr*cos(uA.x*(uA.y*q.x + ci*q.y) - uC.w);
    return vec3(F, gi*gi + gr*gr, (uW.x*gi + uW.y*gr)/(gi + gr + 1e-4));
  }
  float xt = q.x + q.y*uD.w, g = tm*gz*sg(xt*xt*c2);
  return vec3(g*cos(uB.x*(uB.y*q.x - uB.z*q.y) - uC.w), g*g, uW.z);
}
${SKIN_GLSL}
// whether a stretch of a sight line stays clear of a beam: d holds its two ends' distances from the
// beam's axis, m is how far out the beam reaches
bool clear(vec2 d, float m){ return d.x*d.y > 0.0 && min(abs(d.x), abs(d.y)) > m; }
void main(){
  vec3 ro = uEye, rd = rayDir();
  vec3 inv = 1.0/rd, t0 = (-BOX-ro)*inv, t1 = (BOX-ro)*inv;
  vec3 tn = min(t0,t1), tf = max(t0,t1);
  float ta = max(max(tn.x,tn.y),max(tn.z,0.0)), tb = min(min(tf.x,tf.y),tf.z);
  vec3 col = vec3(0.0);
  // The beams run far past the edges of the view, in a slab a few µm thick. Most sight lines cross
  // that slab without meeting any of the three, and are not marched at all.
  bool lit = tb > ta;
  if(lit){
    vec2 a = (ro + rd*ta).xy*vec2(1.0, uA.w), b = (ro + rd*tb).xy*vec2(1.0, uA.w);
    float m = 2.0*uD.x/1.25;
    lit = !(clear(vec2(a.x*uA.z + a.y*uA.y, b.x*uA.z + b.y*uA.y), m)
         && clear(vec2(a.x*uA.z - a.y*uA.y, b.x*uA.z - b.y*uA.y), m)
         && clear(vec2(a.x*uB.z + a.y*uB.y, b.x*uB.z + b.y*uB.y), m*max(1.0, uB.z/uA.z)));
  }
  if(lit){
    const int N = 72;
    float ds = (tb-ta)/float(N), j = hash1(gl_FragCoord.xy + fract(uTime)*17.0);
    float Tr = 1.0;
    // crests glow and also hide what is behind them, so the near face of the beam reads as solid sheets
    for(int i=0;i<N;i++){
      vec3 p = ro + rd*(ta + (float(i)+j)*ds);
      vec3 f = field(p);
      f.z *= 1.0 - smoothstep(0.55, 1.0, max(abs(p.x), abs(p.y))/BOX.x);       // the beams fade out far off
      float crest = max(f.x, 0.0), c2 = crest*crest;
      float e = mix(f.y*0.07, c2*c2*5.0 + f.x*f.x*0.12, uD.y)*f.z;
      col += Tr*mix(uCol, vec3(1.0), 0.35*c2*c2*uD.y)*e*ds;
      Tr *= exp(-e*ds*mix(0.0, 2.2, uD.y));
    }
    col *= 1.6*uLit;
  }
  col += dropSkin(ro, rd, uSkin, uCut)*uOwn;
  o = vec4(col*uFade, 0.0); }`);
  },

  draw(R, S, T) {
    const gl = R.gl, c = setup(S), col = O.wlRGB(S.lambda), W = weights(S), wave = S.mode === 'wave';
    backdrop(R, T, [0.010, 0.016, 0.036], [0.003, 0.005, 0.012]);
    const si = Math.sin(c.th), ci = Math.cos(c.th), st = Math.sin(c.F.thetaT), ct = Math.cos(c.F.thetaT);
    // one crest passes about every 1.3 s whatever the colour is told to be: frequency scaled with 1/λ
    // The phase is added up frame by frame, so changing the colour never makes the wave jump.
    if (lastT !== null) omegaT = (omegaT + Math.max(0, T - lastT) * 4.8 * 550 / S.lambda) % (2 * Math.PI);
    lastT = T;
    gl.useProgram(prog.p); R.setRayUniforms(prog, T);
    gl.uniform4f(prog.u.uA, c.k0 * c.n1, si, ci, c.sy);
    gl.uniform4f(prog.u.uB, c.k0 * c.n2, st, ct, 0);
    gl.uniform4f(prog.u.uC, c.F.r, 0, 0, omegaT);
    gl.uniform4f(prog.u.uD, WAIST, wave ? 1 : 0, si / ci, st / ct);
    gl.uniform3fv(prog.u.uCol, col.map(x => x * 0.9 + 0.06)); gl.uniform3fv(prog.u.uW, W);
    // The drop's skin and the water under it are the same sphere the Drop scale draws, in the same
    // place: flying in from there they take over as that scene gives way, so the drop is never drawn
    // twice. Flying on into the molecules they stay: that scene draws the same skin and water, and takes
    // them over in the same way.
    const z = R.zoom, own = z?.lo ? z.cover : 1;
    gl.uniform1f(prog.u.uOwn, own);
    gl.uniform1f(prog.u.uSkin, skinWidth(R.view.eye)); gl.uniform1f(prog.u.uCut, cutAt(R.view.eye));
    // From far off this whole scene is a speck on the drop's skin, and everything in it would pile up
    // into one bright patch there. So how much of it is drawn goes by how big it looks (`near`: 1 from
    // closer than 80 µm, falling with distance): the beam's glow and the number of photons grow in
    // steadily from the crossing as the camera closes on it, and the construction lines come last.
    const near = Math.min(1, 80 / V.len(R.view.eye)), lit = near * near, lines = sstep(0.3, 0.7, near);
    const dots = z?.lo ? sstep(0.55, 0.95, z.k) : 1;
    gl.uniform1f(prog.u.uLit, lit);
    R.fullscreen(prog, 'add');

    // the perpendicular, the three beam axes and their angles
    const P = q => toScene(q, c), dim = [0.75, 0.82, 1];
    R.seg(P([0, -3.6, 0]), P([0, 3.6, 0]), dim, 0.5, 1.2);
    R.flushLines({ dash: [0.28, 0, 0.5], depth: false, gain: lines });
    R.seg(P([-si * 5.2, ci * 5.2, 0]), [0, 0, 0], dim, 0.1 * W[0], 1.3, 0.55 * W[0]);
    R.seg([0, 0, 0], P([si * 5.2, ci * 5.2, 0]), dim, 0.55 * W[1] * Math.sqrt(c.F.R), 1.3, 0.1 * W[1]);
    R.seg([0, 0, 0], P([st * 5.0, -ct * 5.0, 0]), dim, 0.55 * W[2], 1.3, 0.1 * W[2]);
    R.arc([0, 0, 0], P([0, 1, 0]), P([-1, 0, 0]), 1.7, 0, c.th, dim, 0.6, 1.3, 20);
    R.arc([0, 0, 0], P([0, -1, 0]), P([1, 0, 0]), 1.7, 0, c.F.thetaT, dim, 0.6, 1.3, 20);
    R.flushLines({ depth: false, gain: lines });

    if (!wave) {
      // photons: each reflects or passes with the Fresnel odds, and travels at c/n
      const key = [S.cross, S.theta, S.pol].join();       // a change of colour leaves the photons where they are
      if (!photons.length) for (let i = 0; i < 1500; i++) photons.push({ c: O.wlRGB(420 + 260 * rand()) });
      // seen from far off a photon is drawn large enough to stay a dot, as the Drop scale's are
      const size = Math.max(0.075, 0.004 * V.len(R.view.eye));
      const fresh = key !== photonKey; photonKey = key;
      const speed = 2.3;
      const count = Math.ceil(photons.length * lit);      // fewer from far off, so the stream never clumps
      for (let i = 0; i < count; i++) {
        const ph = photons[i];
        const dur = LEN * c.n1 / speed + LEN * Math.max(c.n1, c.n2) / speed;
        // A photon that has just run out starts again at the source, keeping the few frames it ran
        // over, so the source emits evenly whatever the frame rate. One that ran out long ago was not
        // being drawn (another scale, the wave view, or too far off to be counted in): starting all of
        // those together would send them down the beam as one clump, so each is put somewhere along
        // its run instead, as the stream would have been had it kept going.
        const over = T - ph.t0 - ph.dur;
        if (fresh || ph.u === undefined || over > 0) {
          const carry = !fresh && ph.u !== undefined && over < 0.15;
          ph.u = rand.gauss() * WAIST * 0.5; ph.v = rand.gauss() * WAIST * 0.5;
          ph.refl = rand() < c.F.R; ph.dur = dur * (0.7 + 0.3 * rand());
          ph.t0 = T - (carry ? over : rand() * ph.dur);
        }
        const tHit = LEN * c.n1 / speed, t = T - ph.t0, x0 = ph.u / ci;
        let q, w;
        if (t < tHit) { const sdist = LEN - t * speed / c.n1; q = [x0 - si * sdist, ci * sdist, ph.v]; w = W[0]; }
        else if (ph.refl) { const sdist = (t - tHit) * speed / c.n1; q = [x0 + si * sdist, ci * sdist, ph.v]; w = W[1]; }
        else { const sdist = (t - tHit) * speed / c.n2; q = [x0 + st * sdist, -ct * sdist, ph.v]; w = W[2]; }
        // Flying in from the Drop scale each photon has a colour of its own, as that scale's do, and
        // they settle to the one wavelength this scale follows. They fade out at the far ends.
        const far = 1 - sstep(0.6, 1, Math.hypot(q[0], q[1]) / LEN);
        if (far <= 0) continue;
        R.pt(P(q), dots < 1 ? V.lerp(ph.c, col, dots) : col, 0.95 * w * far, size);
      }
      R.flushPoints({ minPx: 1.6, depth: false });
    }
  },
};
