// Stage 1: the Earth in sunlight. Units are Earth radii; sunlight travels along +x.
import { V, DEG } from '../gl.js';
import * as O from '../optics.js';
import { WARM, wavefrontSheets, coneDir } from './common.js';

let prog = null;
// Where you stand: the place on the globe where the Sun is S.sun degrees above the horizon.
const place = S => { const h = S.sun * DEG; return [-Math.sin(h), Math.cos(h) * 0.42, Math.cos(h) * 0.9075]; };
const lit = p => !(p[1] * p[1] + p[2] * p[2] < 1 && p[0] > -Math.sqrt(1 - p[1] * p[1] - p[2] * p[2]));

export default {
  id: 'orbit', name: 'Orbit', scale: '10 000 km', scaleNote: 'Earth is 12 742 km across', modes: true, focus: true,
  controls: ['focus', 'mode', 'sun'], bloom: 1.1, exposure: 1.0,
  cam: { type: 'orbit', target: [0, 0, 0], yaw: 0.3, pitch: 0.22, dist: 5.6, fov: 34, sway: 0.05,
    lim: { yaw: [-0.9, 1.15], pitch: [-0.45, 0.8], dist: [3.0, 8.5] } },
  portal: place,

  caption(S) {
    if (S.focus === 'eye') return { title: 'One thin bundle is yours',
      body: 'Of all the sunlight falling on the Earth, your rainbow is made by the light arriving right around you. It always appears opposite the Sun, as a circle 42° out from the line that runs from the Sun through your head.' };
    return S.mode === 'wave'
      ? { title: 'Sunlight arrives as flat waves',
        body: 'The Sun is 150 million kilometres away, so by the time its light reaches us the wave crests are flat sheets, all facing the same way. That shared direction is what lets millions of separate drops act together.' }
      : { title: 'Sunlight arrives in parallel',
        body: 'The Sun is 150 million kilometres away, so its light reaches the Earth as parallel rays, all travelling the same way to within half a degree. Every raindrop is lit from exactly the same direction. Lower the Sun and see where you must stand.' };
  },
  readout(S) {
    return `<dl><dt>Sun above your horizon</dt><dd>${S.sun.toFixed(1)}°</dd>
<dt>Distance to the Sun</dt><dd>149.6 million km</dd>
<dt>Light's travel time</dt><dd>8 min 19 s</dd>
<dt>Rays parallel to within</dt><dd>0.53°</dd></dl>`;
  },
  labels(S) {
    const p = place(S);
    return [
      { p: V.mul(p, 1.02), text: 'You are here', cls: 'strong' },
      { p: [-3.3, 1.5, 0.6], text: 'Sunlight', cls: 'far' },
      { p: V.add(V.mul(p, 1.0), V.mul(coneDir([1, 0, 0], 42 * DEG, bestPsi(p)), 0.5)), text: 'Your rainbow (drawn far too big)', cls: 'far' },
      { p: [1.0, -0.9, 0.9], text: 'Night', cls: 'big' },
    ];
  },

  init(R) {
    prog = R.rayProgram(`
vec3 stars(vec3 d){ vec3 p = d*110.0, id = floor(p), f = fract(p)-0.5; float r = hash3(id);
  return vec3(0.8,0.88,1.0)*smoothstep(0.16, 0.0, length(f))*step(0.975, r)*(r-0.97)*45.0; }
void main(){ vec3 ro = uEye, rd = rayDir(); vec3 toSun = vec3(-1.0,0.0,0.0);
  float sd = max(dot(rd,toSun),0.0);
  vec3 col = stars(rd) + vec3(0.004,0.006,0.014) + vec3(1.0,0.82,0.6)*(pow(sd,6.0)*0.10 + pow(sd,60.0)*0.5 + pow(sd,900.0)*40.0);
  float b = dot(ro,rd), c = dot(ro,ro)-1.0, h = b*b-c, depth = 1.0;
  if(h > 0.0 && b < 0.0){
    vec3 n = ro + rd*(-b-sqrt(h));
    float f = fbm(n*1.9+vec3(3.1,0.0,1.7)) + 0.25*fbm(n*6.0);
    float land = smoothstep(0.60, 0.66, f);
    vec3 landc = mix(vec3(0.05,0.17,0.04), vec3(0.34,0.27,0.13), smoothstep(0.35,0.7,fbm(n*4.0+7.0)));
    landc = mix(landc, vec3(0.85,0.9,0.95), smoothstep(0.80,0.9,abs(n.y)+0.08*f));
    vec3 surf = mix(vec3(0.012,0.05,0.16), landc, land);
    float cl = smoothstep(0.50,0.78, fbm(n*3.2+vec3(uTime*0.006,2.0,0.0)) + 0.35*fbm(n*9.0+vec3(0.0,uTime*0.01,5.0))-0.12);
    float mu = dot(n,toSun), day = smoothstep(-0.12,0.22,mu);
    vec3 sunc = mix(vec3(1.0,0.45,0.2), vec3(1.0,0.96,0.9), smoothstep(-0.05,0.35,mu));
    surf = mix(surf, vec3(0.92), cl*0.9);
    col = surf*sunc*max(mu,0.0)*1.5 + surf*sunc*day*0.05;
    col += sunc*pow(max(dot(reflect(rd,n),toSun),0.0),50.0)*(1.0-land)*(1.0-cl)*0.9;
    float rim = pow(1.0-max(dot(n,-rd),0.0), 2.6);
    col += vec3(0.20,0.45,1.0)*rim*day*1.1 + vec3(0.004,0.006,0.012)*(1.0-day);
    depth = depthOf(n);
  } else if(b < 0.0){
    float dca = sqrt(max(dot(ro,ro)-b*b, 1.0));
    vec3 q = normalize(ro + rd*(-b));
    col += vec3(0.22,0.48,1.0)*exp(-(dca-1.0)*42.0)*smoothstep(-0.25,0.3,dot(q,toSun))*1.2;
  }
  o = vec4(col*uFade, 1.0); gl_FragDepth = depth; }`);
  },

  draw(R, S, T) {
    const gl = R.gl, f = S.focus, p = place(S);
    gl.useProgram(prog.p); R.setRayUniforms(prog, T); R.fullscreen(prog, 'opaque');
    const dim = f === 'eye' ? 0.18 : 1;
    if (S.mode === 'wave') {
      wavefrontSheets(R, [-6.6, 0, 0], [1, 0, 0], 1.9, 1.05, 13, (T * 0.4) % 1, WARM, 0.2 * dim, lit, 4);
      R.flushLines();
    } else {
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        const y = i * 0.62 + (j & 1) * 0.2, z = j * 0.62, r2 = y * y + z * z;
        const x1 = r2 < 1 ? -Math.sqrt(1 - r2) : 7;
        R.seg([-7, y, z], [x1, y, z], WARM, 0.04 * dim, 1.2, 0.32 * dim, (i * 7 + j * 3) * 0.37);
      }
      R.flushLines({ dash: [1.5, T * 1.6, 0.4] });
    }
    // the light that reaches you
    const a = f === 'sun' ? 0.25 : 1;
    for (let k = 0; k < 6; k++) {
      const q = [p[0], p[1] + Math.cos(k) * 0.035, p[2] + Math.sin(k) * 0.035];
      R.seg([-7, q[1], q[2]], q, WARM, 0.1 * a, 1.8, 0.9 * a, k * 0.3);
    }
    R.flushLines({ dash: [1.5, T * 1.6, 0.5] });
    R.seg(p, V.mad(p, [1, 0, 0], 0.75), [0.7, 0.8, 1], 0.6 * a, 1.3, 0.1 * a);
    R.flushLines({ dash: [0.06, 0, 0.5] });
    // your rainbow: the 42° cone about the antisolar direction, where it clears the horizon
    [[660, 0.515], [550, 0.5], [450, 0.485]].forEach(([l, rad]) => {
      const th = O.bowAngle(O.nWater(l)), col = O.wlRGB(l); let prev = null;
      for (let i = 0; i <= 96; i++) {
        const d = coneDir([1, 0, 0], th, i / 96 * 2 * Math.PI), q = V.dot(d, p) > 0.02 ? V.mad(p, d, rad) : null;
        if (prev && q) R.seg(prev, q, col, 0.95 * a, 2.2); prev = q;
      }
    });
    R.flushLines();
    R.pt(p, [1, 1, 1], 1.2, 0.05); R.flushPoints({ minPx: 3 });
  },
};
function bestPsi(p) { let b = 0, m = -2; for (let i = 0; i < 24; i++) { const d = coneDir([1, 0, 0], 42 * DEG, i / 24 * 6.2832), v = V.dot(d, p); if (v > m) { m = v; b = i / 24 * 6.2832; } } return b; }
