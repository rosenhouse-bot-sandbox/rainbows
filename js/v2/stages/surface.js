// Stage 5: light meeting the water's surface, about ten wavelengths across. Units are micrometres.
// At this scale the drop's surface is flat. Water fills y < 0. The field drawn is the exact
// plane-wave solution of Maxwell's equations at a flat boundary (Fresnel's coefficients), inside a
// beam of finite width; past the critical angle the transmitted wave becomes an evanescent one.
import { V, DEG, rng } from '../gl.js';
import * as O from '../optics.js';
import { backdrop } from './common.js';

const WAIST = 1.25, BOX = [6.2, 4.4, 2.3];
let prog = null, photons = [], photonKey = '';
const rand = rng(23);

// The angle at which the rainbow ray meets the surface at each of its three crossings.
export function presetAngle(S) {
  const n = O.nWater(S.lambda), b = O.bowB(n);
  if (S.cross === 'enter') return +(Math.asin(b) / DEG).toFixed(1);
  if (S.cross === 'tir') return 56;
  return +(Math.asin(b / n) / DEG).toFixed(1);
}
function setup(S) {
  const n = O.nWater(S.lambda), enter = S.cross === 'enter';
  const n1 = enter ? 1 : n, n2 = enter ? n : 1, th = Math.max(0.001, S.theta * DEG);
  const F = O.fresnelComplex(n1, n2, th, S.pol), k0 = 2 * Math.PI / (S.lambda / 1000);
  const tAmp = Math.hypot(1 + F.r[0], F.r[1]);
  return { n, n1, n2, th, F, k0, sy: enter ? 1 : -1, enter, crit: O.criticalAngle(n), tAmp,
    depth: F.tir ? S.lambda / (2 * Math.PI * F.kappa) : 0 };
}
// map from the solver's frame (light arrives from q.y > 0) to the scene (water below)
const toScene = (q, c) => [q[0], q[1] * c.sy, q[2]];
const weights = S => S.focus === 'sun' ? [1, 0.22, 0.22] : S.focus === 'both' ? [1, 1, 1]
  : (S.cross === 'back' || S.cross === 'tir') ? [0.22, 1, 0.18] : [0.22, 0.18, 1];

export default {
  id: 'surface', name: 'Surface', scale: '1 µm', scaleNote: 'about 12 µm across', modes: true, focus: true,
  controls: ['cross', 'focus', 'mode', 'theta', 'lambda', 'pol'], bloom: 0.9, exposure: 1.0,
  cam: { type: 'orbit', target: [0, 0, 0], yaw: 0.42, pitch: 0.2, dist: 19, fov: 34,
    lim: { yaw: [-1.1, 1.1], pitch: [-0.35, 0.8], dist: [6, 25] } },
  // past the critical angle, come in close and level with the surface so the thin field outside shows
  camGoal: S => S.cross === 'tir' ? { yaw: 0.3, pitch: 0.045, dist: 9.5 } : { yaw: 0.42, pitch: 0.2, dist: 19 },
  portal: () => [0.6, -0.4, 0],

  caption(S) {
    const c = setup(S);
    if (c.F.tir) return { title: 'Past the critical angle: an evanescent field',
      body: `Steeper than ${(c.crit / DEG).toFixed(1)}°, no wave can carry energy out into the air, and all of it reflects. The field still reaches a little way outside: it slides along the surface and fades to nothing within a fraction of a wavelength. Sunlight inside a raindrop never arrives this steeply, so the rainbow has no such field. It is shown here because you can steer the light past the limit.` };
    if (S.cross === 'enter') return { title: 'Slowed, squeezed and turned',
      body: 'Crests cannot be created or lost at the surface, so each one in the air must join one in the water. Light is slower in water, so the crests there sit closer together, and the only way they can still match along the surface is to tilt. That tilt is refraction. A small part of the wave reflects.' };
    if (S.cross === 'back') return { title: 'The back wall is a leaky mirror',
      body: `The rainbow ray meets the back of the drop at about 40°, short of the ${(c.crit / DEG).toFixed(1)}° critical angle. So this is ordinary partial reflection: most of the light escapes into the air, and only about one part in twenty of sunlight reflects to carry on toward the bow. A ray inside a sphere meets the wall at the same angle it was bent to on the way in, which is always below critical.` };
    return { title: 'Out again, bending toward you',
      body: 'Leaving the water, the crests speed up, spread apart and swing away from the perpendicular. This last bend is the mirror image of the first, and it sets the direction in which each colour finally travels to your eye.' };
  },
  readout(S) {
    const c = setup(S), d = x => (x / DEG).toFixed(1) + '°';
    const other = O.fresnelComplex(c.n1, c.n2, c.th, S.pol === 's' ? 'p' : 's');
    const nr = O.nWater(700), nv = O.nWater(400);
    const bend = n => c.enter ? Math.asin(Math.min(1, Math.sin(c.th) / n)) : Math.asin(Math.min(1, n * Math.sin(c.th)));
    let rows = `<dt>Water's index at ${Math.round(S.lambda)} nm</dt><dd>${c.n.toFixed(4)}</dd>
<dt>Wavelength in water</dt><dd>${(S.lambda / c.n).toFixed(0)} nm</dd>
<dt>Critical angle (inside)</dt><dd>${d(c.crit)}</dd>
<dt>Reflected</dt><dd>${(c.F.R * 100).toFixed(1)}% (other polarisation ${(other.R * 100).toFixed(1)}%)</dd>`;
    if (c.F.tir) rows += `<dt>Field outside fades to 1/e in</dt><dd>${c.depth.toFixed(0)} nm</dd>
<dt>Phase shift on reflection</dt><dd>${(c.F.phase / DEG).toFixed(0)}°</dd>
<dt>Energy carried out</dt><dd>none</dd>`;
    else rows += `<dt>Transmitted, leaving at</dt><dd>${((1 - c.F.R) * 100).toFixed(1)}% at ${d(c.F.thetaT)}</dd>
<dt>Red would leave at</dt><dd>${d(bend(nr))}</dd><dt>Violet would leave at</dt><dd>${d(bend(nv))}</dd>`;
    return `<dl>${rows}</dl>` + (S.pol === 'p' ? '<p>With the electric field in the plane of the bend, the quantity drawn is the magnetic field, which then points along the surface.</p>' : '');
  },
  labels(S) {
    const c = setup(S), si = Math.sin(c.th), ci = Math.cos(c.th), L = [];
    L.push({ p: [-5.4, 3.6, 0], text: 'Air', cls: 'big' }, { p: [-5.4, -3.6, 0], text: 'Water', cls: 'big' });
    L.push({ p: toScene([-si * 5.6, ci * 5.6, 0], c), text: 'Arriving', cls: 'far' });
    L.push({ p: toScene([si * 5.6, ci * 5.6, 0], c), text: `Reflected ${(c.F.R * 100).toFixed(c.F.R > 0.1 ? 0 : 1)}%`, cls: 'far' });
    if (c.F.tir) L.push({ p: toScene([0.25, -c.depth / 1000 - 0.5, 0], c), text: `Evanescent field: down to 1/e at ${Math.round(c.depth)} nm, the line`, cls: 'note' });
    else L.push({ p: toScene([Math.sin(c.F.thetaT) * 5.0, -Math.cos(c.F.thetaT) * 5.0, 0], c), text: `Transmitted ${((1 - c.F.R) * 100).toFixed(c.F.R > 0.1 ? 0 : 1)}%`, cls: 'far' });
    L.push({ p: toScene([-Math.sin(c.th / 2) * 2.3, Math.cos(c.th / 2) * 2.3, 0], c), text: (c.th / DEG).toFixed(1) + '°', cls: 'num' });
    if (!c.F.tir) L.push({ p: toScene([Math.sin(c.F.thetaT / 2) * 2.3, -Math.cos(c.F.thetaT / 2) * 2.3, 0], c), text: (c.F.thetaT / DEG).toFixed(1) + '°', cls: 'num' });
    return L;
  },

  init(R) {
    prog = R.rayProgram(`
uniform vec4 uA, uB, uC, uD; uniform vec3 uCol, uW;
const vec3 BOX = vec3(${BOX.map(x => x.toFixed(2)).join(',')});
float sg(float a){ return exp(-a*a); }       // a beam with a fairly flat top and a definite edge
// x: the field; y: its envelope squared; z: how strongly to draw it
vec3 field(vec3 p){
  vec3 q = vec3(p.x, p.y*uA.w, p.z);
  float w2 = uD.x*uD.x, gz = sg(q.z*q.z/w2), ci = uA.z, c2 = ci*ci/w2;
  float rr = length(uC.xy), ra = atan(uC.y, uC.x);
  vec2 tc = vec2(1.0+uC.x, uC.y); float tm = length(tc), ta = atan(tc.y, tc.x);
  if(q.y >= 0.0){
    float xi = q.x + q.y*uD.z, xr = q.x - q.y*uD.z;
    float gi = gz*sg(xi*xi*c2), gr = rr*gz*sg(xr*xr*c2);
    float F = gi*cos(uA.x*(uA.y*q.x - ci*q.y) - uC.w) + gr*cos(uA.x*(uA.y*q.x + ci*q.y) - uC.w + ra);
    return vec3(F, gi*gi + gr*gr, (uW.x*gi + uW.y*gr)/(gi + gr + 1e-4));
  }
  if(uB.w > 0.5){
    float g = tm*gz*sg(q.x*q.x*c2)*exp(uC.z*q.y);
    return vec3(g*cos(uA.x*uA.y*q.x - uC.w + ta), g*g, 1.0);
  }
  float xt = q.x + q.y*uD.w, g = tm*gz*sg(xt*xt*c2);
  return vec3(g*cos(uB.x*(uB.y*q.x - uB.z*q.y) - uC.w + ta), g*g, uW.z);
}
void main(){
  vec3 ro = uEye, rd = rayDir();
  vec3 inv = 1.0/rd, t0 = (-BOX-ro)*inv, t1 = (BOX-ro)*inv;
  vec3 tn = min(t0,t1), tf = max(t0,t1);
  float ta = max(max(tn.x,tn.y),max(tn.z,0.0)), tb = min(min(tf.x,tf.y),tf.z);
  vec3 col = vec3(0.0);
  if(tb > ta){
    const int N = 72;
    float ds = (tb-ta)/float(N), j = hash1(gl_FragCoord.xy + fract(uTime)*17.0);
    float water = 0.0, Tr = 1.0;
    // crests glow and also hide what is behind them, so the near face of the beam reads as solid sheets
    for(int i=0;i<N;i++){
      vec3 p = ro + rd*(ta + (float(i)+j)*ds);
      vec3 f = field(p);
      float crest = max(f.x, 0.0), c2 = crest*crest;
      float e = mix(f.y*0.07, c2*c2*5.0 + f.x*f.x*0.12, uD.y)*f.z;
      col += Tr*mix(uCol, vec3(1.0), 0.35*c2*c2*uD.y)*e*ds;
      Tr *= exp(-e*ds*mix(0.0, 2.2, uD.y));
      water += step(p.y, 0.0)*ds;
    }
    col *= 1.6;
    col += vec3(0.010,0.028,0.070)*water*0.55;
    float tp = -ro.y/rd.y;
    if(tp > ta && tp < tb){
      vec3 P = ro + rd*tp; vec2 g = abs(fract(P.xz*0.5)-0.5);
      float line = smoothstep(0.47,0.5,max(g.x,g.y));
      col += vec3(0.16,0.34,0.7)*(0.05 + 0.10*line + 0.45*pow(1.0-abs(rd.y), 4.0));
    }
  }
  o = vec4(col*uFade, 0.0); }`);
  },

  draw(R, S, T) {
    const gl = R.gl, c = setup(S), col = O.wlRGB(S.lambda), W = weights(S), wave = S.mode === 'wave';
    backdrop(R, T, [0.010, 0.016, 0.036], [0.003, 0.005, 0.012]);
    const si = Math.sin(c.th), ci = Math.cos(c.th), st = Math.sin(c.F.thetaT), ct = Math.cos(c.F.thetaT);
    // one crest passes about every 1.3 s whatever the colour is told to be: frequency scaled with 1/λ
    const omegaT = T * 4.8 * 550 / S.lambda;
    gl.useProgram(prog.p); R.setRayUniforms(prog, T);
    gl.uniform4f(prog.u.uA, c.k0 * c.n1, si, ci, c.sy);
    gl.uniform4f(prog.u.uB, c.k0 * c.n2, st, ct, c.F.tir ? 1 : 0);
    gl.uniform4f(prog.u.uC, c.F.r[0], c.F.r[1], c.k0 * c.F.kappa, omegaT);
    gl.uniform4f(prog.u.uD, WAIST, wave ? 1 : 0, si / ci, c.F.tir ? 0 : st / ct);
    gl.uniform3fv(prog.u.uCol, col.map(x => x * 0.9 + 0.06)); gl.uniform3fv(prog.u.uW, W);
    R.fullscreen(prog, 'add');

    // the perpendicular, the three beam axes and their angles
    const P = q => toScene(q, c), dim = [0.75, 0.82, 1];
    R.seg(P([0, -3.6, 0]), P([0, 3.6, 0]), dim, 0.5, 1.2);
    R.flushLines({ dash: [0.28, 0, 0.5], depth: false });
    R.seg(P([-si * 5.2, ci * 5.2, 0]), [0, 0, 0], dim, 0.1 * W[0], 1.3, 0.55 * W[0]);
    R.seg([0, 0, 0], P([si * 5.2, ci * 5.2, 0]), dim, 0.55 * W[1] * Math.sqrt(c.F.R), 1.3, 0.1 * W[1]);
    if (!c.F.tir) R.seg([0, 0, 0], P([st * 5.0, -ct * 5.0, 0]), dim, 0.55 * W[2], 1.3, 0.1 * W[2]);
    R.arc([0, 0, 0], P([0, 1, 0]), P([-1, 0, 0]), 1.7, 0, c.th, dim, 0.6, 1.3, 20);
    if (!c.F.tir) R.arc([0, 0, 0], P([0, -1, 0]), P([1, 0, 0]), 1.7, 0, c.F.thetaT, dim, 0.6, 1.3, 20);
    // the critical direction, for light arriving from inside the water
    if (!c.enter) { const a = c.crit; R.seg([0, 0, 0], P([-Math.sin(a) * 3.2, Math.cos(a) * 3.2, 0]), [1, 0.5, 0.35], 0.5, 1.1, 0.1); }
    if (c.F.tir) {       // how far the field reaches: the height at which it has fallen to 1/e
      const y = c.depth / 1000;
      R.seg(P([-2.6, -y, 0]), P([2.6, -y, 0]), [1, 1, 1], 0.7, 1.1);
    }
    // box edges, to fix the space
    const [bx, by, bz] = BOX;
    for (const sz of [-1, 1]) R.seg([-bx, 0, sz * bz], [bx, 0, sz * bz], [0.3, 0.5, 0.9], 0.35, 1.1);
    for (const sx of [-1, 1]) R.seg([sx * bx, 0, -bz], [sx * bx, 0, bz], [0.3, 0.5, 0.9], 0.35, 1.1);
    R.flushLines({ depth: false });

    if (!wave) {
      // photons: each reflects or passes with the Fresnel odds, and travels at c/n
      const key = [S.cross, S.theta, S.lambda, S.pol].join();
      if (!photons.length) for (let i = 0; i < 520; i++) photons.push({ t0: -rand() * 6 });
      const fresh = key !== photonKey; photonKey = key;
      const LEN = 6.0, speed = 2.3;
      for (const ph of photons) {
        const dur = LEN * c.n1 / speed + LEN * Math.max(c.n1, c.n2) / speed;
        if (fresh || ph.u === undefined || T - ph.t0 > ph.dur) {
          ph.u = rand.gauss() * WAIST * 0.5; ph.v = rand.gauss() * WAIST * 0.5;
          ph.refl = rand() < c.F.R; ph.dur = dur * (0.7 + 0.3 * rand());
          ph.t0 = (fresh || ph.u === undefined) && ph.t0 > -900 ? T - rand() * dur : T;
        }
        const tHit = LEN * c.n1 / speed, t = T - ph.t0, x0 = ph.u / ci;
        let q, w;
        if (t < tHit) { const sdist = LEN - t * speed / c.n1; q = [x0 - si * sdist, ci * sdist, ph.v]; w = W[0]; }
        else if (ph.refl) { const sdist = (t - tHit) * speed / c.n1; q = [x0 + si * sdist, ci * sdist, ph.v]; w = W[1]; }
        else { const sdist = (t - tHit) * speed / c.n2; q = [x0 + st * sdist, -ct * sdist, ph.v]; w = W[2]; }
        if (Math.abs(q[0]) > BOX[0] || Math.abs(q[1]) > BOX[1]) continue;
        R.pt(P(q), col, 0.95 * w, 0.075);
      }
      R.flushPoints({ minPx: 1.6, depth: false });
    }
  },
};
