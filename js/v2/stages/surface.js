// Stage 5: light meeting the water's surface, about ten wavelengths across. Units are micrometres.
// The surface is the drop's own: a sphere 1000 µm in radius whose top touches the origin, drawn to
// scale, so it runs off to a horizon and curves away below it. Across the beam it departs from flat
// by about 20 nm, so the field drawn is the exact plane-wave solution of Maxwell's equations at a
// flat boundary (Fresnel's coefficients), inside a beam of finite width. Water fills y < 0 there.
import { V, DEG, rng, sstep, clamp } from '../gl.js';
import * as O from '../optics.js';
import { backdrop } from './common.js';
import { crossAngle } from './drop.js';

const WAIST = 1.25, BOX = [6.2, 4.4, 2.3], RD = 1000;      // RD: the drop's radius
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
    const a = S.crossPhi ?? crossAngle(S.cross), s = Math.sin(a), c = Math.cos(a);
    return v => [v[0] * s - v[1] * c, v[0] * c + v[1] * s, v[2]];
  },
  // The Molecules scene is the same surface where the beam meets it: its +x runs down into the water,
  // and one of its units is 0.17 µm, so its wavelengths are this scene's wavelengths.
  embed: () => ({ o: [0, 0, 0], s: 550 / 3200, X: [0, -1, 0], Y: [0, 0, 1], Z: [-1, 0, 0] }),

  caption(S) {
    const c = setup(S);
    if (S.cross === 'enter') return { title: 'Slowed, squeezed and turned',
      body: 'Crests cannot be created or lost at the surface, so each one in the air must join one in the water. Light is slower in water, so the crests there sit closer together, and the only way they can still match along the surface is to tilt. That tilt is refraction. A small part of the wave reflects.' };
    if (S.cross === 'back') return { title: 'The back wall is a leaky mirror',
      body: `The rainbow ray meets the back of the drop at about 40°, short of the ${(c.crit / DEG).toFixed(1)}° critical angle. So this is ordinary partial reflection: most of the light escapes into the air, and only about one part in twenty of sunlight reflects to carry on toward the bow. A ray inside a sphere meets the wall at the same angle it was bent to on the way in, which is always below critical.` };
    return { title: 'Out again, bending toward you',
      body: 'Leaving the water, the crests speed up, spread apart and swing away from the perpendicular. This last bend is the mirror image of the first, and it sets the direction in which each wavelength finally travels to your eye.' };
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
<dt>Red would leave at</dt><dd>${d(bend(nr))}</dd><dt>Violet would leave at</dt><dd>${d(bend(nv))}</dd>`;
    return `<dl>${rows}</dl>` + (S.pol === 'p' ? '<p>With the electric field in the plane of the bend, the quantity drawn is the magnetic field, which then points along the surface.</p>' : '');
  },
  labels(S, view) {
    const c = setup(S), si = Math.sin(c.th), ci = Math.cos(c.th), L = [];
    L.push({ p: [-5.4, 3.6, 0], text: 'Air', cls: 'big' }, { p: [-5.4, -3.6, 0], text: 'Water', cls: 'big' });
    L.push({ p: toScene([-si * 5.6, ci * 5.6, 0], c), text: 'Arriving', cls: 'far' });
    L.push({ p: toScene([si * 5.6, ci * 5.6, 0], c), text: `Reflected ${(c.F.R * 100).toFixed(c.F.R > 0.1 ? 0 : 1)}%`, cls: 'far' });
    L.push({ p: toScene([Math.sin(c.F.thetaT) * 5.0, -Math.cos(c.F.thetaT) * 5.0, 0], c), text: `Transmitted ${((1 - c.F.R) * 100).toFixed(c.F.R > 0.1 ? 0 : 1)}%`, cls: 'far' });
    L.push({ p: toScene([-Math.sin(c.th / 2) * 2.3, Math.cos(c.th / 2) * 2.3, 0], c), text: (c.th / DEG).toFixed(1) + '°', cls: 'num' });
    L.push({ p: toScene([Math.sin(c.F.thetaT / 2) * 2.3, -Math.cos(c.F.thetaT / 2) * 2.3, 0], c), text: (c.F.thetaT / DEG).toFixed(1) + '°', cls: 'num' });
    // how far the drop's skin can be seen before it curves out of sight, from where the camera is
    if (view) {
      const e = view.eye, h = Math.hypot(e[0], e[1] + RD, e[2]) - RD;
      if (h > 0.05) {
        const dist = Math.sqrt(h * (2 * RD + h)), a = Math.asin(RD / (RD + h)), f = V.norm([view.f[0], 0, view.f[2]]);
        // the point of the horizon straight ahead: down from the camera by the angle a from the vertical
        const dn = V.norm([e[0], e[1] + RD, e[2]]), t = V.norm(V.mad(f, dn, -V.dot(f, dn)));
        const p = V.add(e, V.mul(V.add(V.mul(dn, -Math.cos(a)), V.mul(t, Math.sin(a))), dist));
        L.push({ p: V.add(p, [0, dist * 0.035, 0]), text: `The drop curves out of sight ${Math.round(dist)} µm away`, cls: 'far' });
      }
    }
    return L;
  },

  init(R) {
    prog = R.rayProgram(`
uniform vec4 uA, uB, uC, uD; uniform vec3 uCol, uW; uniform float uOwn;
const float RD = ${RD.toFixed(1)};
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
// The drop's surface along a ray: x is how far to it (negative if the ray misses), y how far the ray
// runs through water, z whether the camera is itself under water. The sphere's centre is RD below the origin; the forms used keep their
// precision though the camera is a few units from a sphere a thousand across.
vec3 dropHit(vec3 ro, vec3 rd){
  float c = dot(ro,ro) + 2.0*RD*ro.y, b = dot(ro,rd) + RD*rd.y, h = b*b - c;
  if(c <= 0.0){ float t = sqrt(max(h,0.0)) - b; return vec3(t, t, 1.0); }          // the camera is under water
  if(h <= 0.0 || b >= 0.0) return vec3(-1.0, 0.0, 0.0);
  h = sqrt(h); return vec3(c/(h - b), 2.0*h, 0.0);
}
// lines of a square net with cells "cell" across, kept about a pixel wide and faded out before they blur together
float net(vec2 g, float cell){
  vec2 q = g/cell, w = fwidth(q), d = abs(fract(q - 0.5) - 0.5);
  vec2 l = 1.0 - smoothstep(w*0.6, w*1.6, d);
  return max(l.x, l.y)*(1.0 - smoothstep(0.08, 0.3, max(w.x, w.y)));
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
    float Tr = 1.0;
    // crests glow and also hide what is behind them, so the near face of the beam reads as solid sheets
    for(int i=0;i<N;i++){
      vec3 p = ro + rd*(ta + (float(i)+j)*ds);
      vec3 f = field(p);
      float crest = max(f.x, 0.0), c2 = crest*crest;
      float e = mix(f.y*0.07, c2*c2*5.0 + f.x*f.x*0.12, uD.y)*f.z;
      col += Tr*mix(uCol, vec3(1.0), 0.35*c2*c2*uD.y)*e*ds;
      Tr *= exp(-e*ds*mix(0.0, 2.2, uD.y));
    }
    col *= 1.6;
  }
  // The drop itself, to scale: its skin carries a net of 2 µm squares near the beam, 20 µm and 200 µm
  // ones further off, and shines where it is seen edge-on, at the horizon.
  vec3 hit = dropHit(ro, rd);
  if(hit.x > 0.0){
    vec3 P = ro + rd*hit.x, nrm = vec3(P.x, P.y + RD, P.z)/RD;
    vec2 g = RD*vec2(atan(P.x, P.y + RD), atan(P.z, P.y + RD));
    float line = max(net(g, 2.0), max(net(g, 20.0), net(g, 200.0)));
    float graze = pow(1.0 - abs(dot(nrm, rd)), 4.0);
    col += vec3(0.16,0.34,0.7)*(0.05 + 0.11*line + 0.45*graze)*uOwn;
    // from inside the drop the skin is a window on the dark air beyond: the water in between is kept faint
    col += vec3(0.010,0.028,0.070)*mix(1.5, 0.45, hit.z)*(1.0 - exp(-hit.y/7.0))*uOwn;
  }
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
    // twice. Flying on into the molecules they go first.
    const z = R.zoom, own = !z ? 1 : z.lo ? z.cover : 1 - sstep(0.15, 0.5, z.k);
    gl.uniform1f(prog.u.uOwn, own);
    R.fullscreen(prog, 'add');

    // the perpendicular, the three beam axes and their angles
    const P = q => toScene(q, c), dim = [0.75, 0.82, 1];
    R.seg(P([0, -3.6, 0]), P([0, 3.6, 0]), dim, 0.5, 1.2);
    R.flushLines({ dash: [0.28, 0, 0.5], depth: false });
    R.seg(P([-si * 5.2, ci * 5.2, 0]), [0, 0, 0], dim, 0.1 * W[0], 1.3, 0.55 * W[0]);
    R.seg([0, 0, 0], P([si * 5.2, ci * 5.2, 0]), dim, 0.55 * W[1] * Math.sqrt(c.F.R), 1.3, 0.1 * W[1]);
    R.seg([0, 0, 0], P([st * 5.0, -ct * 5.0, 0]), dim, 0.55 * W[2], 1.3, 0.1 * W[2]);
    R.arc([0, 0, 0], P([0, 1, 0]), P([-1, 0, 0]), 1.7, 0, c.th, dim, 0.6, 1.3, 20);
    R.arc([0, 0, 0], P([0, -1, 0]), P([1, 0, 0]), 1.7, 0, c.F.thetaT, dim, 0.6, 1.3, 20);
    R.flushLines({ depth: false });

    if (!wave) {
      // photons: each reflects or passes with the Fresnel odds, and travels at c/n
      const key = [S.cross, S.theta, S.pol].join();       // a change of colour leaves the photons where they are
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
