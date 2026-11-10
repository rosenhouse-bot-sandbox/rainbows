// Stage 2: standing in a field with the Sun behind you and rain ahead. Units are metres.
// You face −z; sunlight travels along sunDir (which is also the direction of the antisolar point).
import { V, DEG, clamp } from '../gl.js';
import * as O from '../optics.js';
import { WARM, bowTexture, drawFigure, coneDir } from './common.js';

export const EYE = [0, 1.62, 0];
export const sunDir = S => { const h = S.sun * DEG; return [0, -Math.sin(h), -Math.cos(h)]; };
export const sunColour = S => { const t = clamp(Math.sin(S.sun * DEG) / 0.55, 0, 1), k = t * t * (3 - 2 * t); return [1, 0.5 + 0.42 * k, 0.22 + 0.58 * k]; };
const B1 = O.bowAngle(O.nWater(550)), B2 = O.bowAngle(O.nWater(550), 2);
const RINGS = [[650, 1], [550, 1], [450, 1]].map(([l]) => ({ th: O.bowAngle(O.nWater(l)), col: O.wlRGB(l) }));
let prog = null;

export default {
  id: 'sky', name: 'Sky', scale: '1 km', scaleNote: 'rain about 1 km away', modes: false, focus: true,
  controls: ['focus', 'sun'], bloom: 0.55, exposure: 1.05,
  hint: 'Drag to look around · pinch or scroll to step in and out of your own eyes',
  hintSmall: 'Drag to look · pinch to step into your own eyes',
  cam: { type: 'look', eyePos: EYE, yaw: 0, pitch: 0.27, dist: 7.5, fov: 62, sway: 0.02,
    lim: { yaw: [-0.95, 0.95], pitch: [-0.05, 0.85], dist: [0, 16] } },
  portalLook: S => [0, clamp(B1 - S.sun * DEG, 0.03, 0.8)],

  caption(S) {
    if (S.sun > 42) return { title: 'Too high a Sun, no bow',
      body: 'The bow is a circle 42° from the point directly opposite the Sun. With the Sun more than 42° up, that whole circle lies below the horizon, which is why rainbows belong to mornings and late afternoons. Lower the Sun to bring it back.' };
    if (S.focus === 'eye') return { title: 'A cone of light, with your eye at its tip',
      body: 'Every sight-line drawn here leaves your eye 42° away from the line to your head\'s shadow. Raindrops anywhere along those lines send you colour, near or far. The bow has no place of its own: it is a direction, and it moves when you do.' };
    if (S.focus === 'sun') return { title: 'Sunlight over your shoulder',
      body: 'The Sun is behind you, and its rays pass overhead into the rain. The line through your head points at the centre of the bow, the antisolar point, which is where your head\'s shadow falls.' };
    return { title: 'Sun behind, rain ahead',
      body: 'Sunlit rain sends colour back at 42° from the line running from the Sun through your head. A fainter second bow sits at 51° with its colours reversed. Between them the sky is darker, and inside the main bow it is brighter. Lower the Sun and the bow climbs.' };
  },
  readout(S) {
    const top = (B1 / DEG - S.sun), top2 = (B2 / DEG - S.sun);
    return `<dl><dt>Sun above the horizon</dt><dd>${S.sun.toFixed(1)}°</dd>
<dt>Top of the main bow</dt><dd>${top > 0 ? top.toFixed(1) + '° up' : 'below the horizon'}</dd>
<dt>Top of the outer bow</dt><dd>${top2 > 0 ? top2.toFixed(1) + '° up' : 'below the horizon'}</dd>
<dt>Red to violet</dt><dd>${(O.bowAngle(O.nWater(700)) / DEG).toFixed(1)}° to ${(O.bowAngle(O.nWater(400)) / DEG).toFixed(1)}°</dd></dl>`;
  },
  labels(S) {
    const s = sunDir(S), L = [], far = 900;
    const at = (th, psi) => V.mad(EYE, coneDir(s, th, psi), far);
    const psi = S.sun > 30 ? 0.0 : 0.5;
    if (B1 / DEG - S.sun > 2) L.push({ p: at(B1, 0), text: `Main bow · ${(B1 / DEG).toFixed(0)}°`, cls: 'strong' });
    if (B2 / DEG - S.sun > 2) L.push({ p: at(B2 + 0.01, -psi), text: `Outer bow · ${(B2 / DEG).toFixed(0)}°`, cls: 'far' });
    if (46 - S.sun > 2) L.push({ p: at(46.3 * DEG, psi * 1.3), text: 'Darker band between', cls: 'far' });
    if (S.sun > 1.5) { const t = EYE[1] / Math.sin(S.sun * DEG); if (t < 60) L.push({ p: V.mad(EYE, s, t), text: 'Shadow of your head: the centre of the bow', cls: 'note' }); }
    return L;
  },

  init(R) {
    bowTexture(R);
    prog = R.rayProgram(`
uniform vec3 uSun, uSunCol; uniform sampler2D uLUT; uniform vec2 uLutRange; uniform float uBow;
float hills(float az){ return 0.008 + 0.026*vnoise(vec3(az*4.0, 1.0, 2.0)) + 0.010*vnoise(vec3(az*15.0, 5.0, 1.0)); }
void main(){
  vec3 ro = uEye, rd = rayDir(), toSun = -uSun;
  float sunUp = smoothstep(-0.02, 0.04, toSun.y);
  float az = atan(rd.x, -rd.z), el = rd.y;
  float toward = dot(normalize(rd.xz+vec2(1e-5)), normalize(toSun.xz));
  vec3 sky = mix(vec3(0.040,0.055,0.090), vec3(0.26,0.34,0.50), smoothstep(-0.2,1.0,toward)*0.9);
  vec2 cp = rd.xz/max(el+0.10, 0.06);
  float cl = fbm(vec3(cp*0.42 + vec2(uTime*0.006, 0.0), 1.0));
  sky *= 0.40 + 1.25*cl;
  sky += uSunCol*vec3(0.11,0.10,0.10)*exp(-max(el,0.0)*5.0)*sunUp;
  float rainAmt = (0.45 + 0.55*smoothstep(0.3,0.7,fbm(vec3(az*2.0, 0.3, 3.0+uTime*0.01))))*smoothstep(0.9,-0.3,toward);
  float th = degrees(acos(clamp(dot(rd,uSun),-1.0,1.0)));
  vec3 bow = texture(uLUT, vec2((th-uLutRange.x)/(uLutRange.y-uLutRange.x), 0.5)).rgb*uSunCol*sunUp*uBow;
  float streak = pow(vnoise(vec3(az*240.0, el*6.0 + uTime*1.5, 0.0)), 5.0);
  float hz = hills(az), depth = 1.0; vec3 col;
  if(el > hz){
    col = sky + bow*rainAmt*smoothstep(hz, hz+0.015, el);
    col += vec3(0.5,0.6,0.7)*streak*0.045*rainAmt;
  } else if(el > 0.0005){
    col = mix(vec3(0.016,0.032,0.028), sky, 0.5) + bow*rainAmt*0.55;
  } else {
    float t = min(-ro.y/min(rd.y,-1e-4), 6000.0);
    vec3 P = ro + rd*t;
    float fld = fbm(vec3(P.xz*0.011, 0.0));
    vec3 alb = mix(vec3(0.045,0.105,0.028), vec3(0.17,0.17,0.05), smoothstep(0.35,0.65,fld));
    alb *= 0.65 + 0.7*vnoise(vec3(P.xz*1.3, 0.0))*exp(-t/60.0) + 0.35*(1.0-exp(-t/60.0));
    vec3 g = alb*(uSunCol*(0.22+1.9*max(toSun.y,0.0))*sunUp + vec3(0.09,0.12,0.17));
    float fog = 1.0-exp(-t/1500.0);
    col = mix(g, mix(vec3(0.016,0.032,0.028), sky, 0.5), fog);
    col += bow*rainAmt*(1.0-exp(-t/600.0))*0.6;
    depth = depthOf(P);
  }
  o = vec4(col*uFade, 1.0); gl_FragDepth = depth; }`);
  },

  draw(R, S, T) {
    const gl = R.gl, s = sunDir(S), toSun = V.mul(s, -1), sc = sunColour(S), f = S.focus, bt = bowTexture(R);
    gl.useProgram(prog.p); R.setRayUniforms(prog, T);
    gl.uniform3fv(prog.u.uSun, s); gl.uniform3fv(prog.u.uSunCol, sc); gl.uniform1f(prog.u.uBow, 0.62);
    gl.uniform2f(prog.u.uLutRange, bt.tab.deg0, bt.tab.deg1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bt.tex); gl.uniform1i(prog.u.uLUT, 0);
    R.fullscreen(prog, 'opaque');

    const back = V.len(V.sub(R.view.eye, EYE)), out = clamp((back - 0.8) / 2, 0, 1);
    if (back > 0.9) drawFigure(R, [0, 0, 0], toSun, sc.map(x => x * 0.9));
    if (out <= 0) return;

    // sunlight streaming over your shoulders
    const aS = (f === 'eye' ? 0.12 : f === 'sun' ? 1 : 0.6) * out;
    const r = [1, 0, 0], u = V.cross(r, s);
    for (let i = -2; i <= 2; i++) for (let j = 0; j < 3; j++) {
      if (i === 0 && j === 0) continue;
      const q = V.mad(V.mad(EYE, r, i * 3.2 + (j & 1) * 1.5), u, j * 2.8 + 0.3);
      const tg = s[1] < -1e-3 ? Math.min(500, q[1] / -s[1]) : 500;
      R.seg(V.mad(q, s, -70), V.mad(q, s, tg), WARM, 0.32 * aS, 1.5, 0.06 * aS, i * 3.1 + j * 7.7);
    }
    const tgE = s[1] < -1e-3 ? Math.min(500, EYE[1] / -s[1]) : 500;
    R.seg(V.mad(EYE, s, -70), EYE, WARM, 0.7 * aS, 2.0, 0.7 * aS);
    R.flushLines({ dash: [9, T * 14, 0.45] });
    // the antisolar line, on through your head to its shadow
    R.seg(EYE, V.mad(EYE, s, tgE), [0.7, 0.8, 1], 0.55 * out, 1.4, 0.3 * out);
    R.flushLines({ dash: [0.5, 0, 0.5] });
    if (tgE < 60) R.arc(V.add(V.mad(EYE, s, tgE), [0, 0.02, 0]), [1, 0, 0], [0, 0, 1], 0.35, 0, 6.2832, [0.7, 0.8, 1], 0.7 * out, 1.6, 28);

    // the cone of sight-lines that carry colour back to you
    const aE = (f === 'sun' ? 0.1 : f === 'eye' ? 1 : 0.55) * out;
    for (const ring of RINGS) for (let k = -16; k <= 16; k++) {
      const d = coneDir(s, ring.th, k * 0.115);
      const L = d[1] < -1e-3 ? Math.min(1400, EYE[1] / -d[1]) : 1400;
      if (d[1] < -0.03) continue;
      R.seg(EYE, V.mad(EYE, d, Math.min(L, 60)), ring.col, 0.34 * aE, 1.4, 0.2 * aE, k * 1.7);
      if (L > 60) R.seg(V.mad(EYE, d, 60), V.mad(EYE, d, L), ring.col, 0.2 * aE, 1.4, 0.02 * aE, k * 1.7 + 60);
    }
    R.flushLines();
    R.pt(EYE, [1, 1, 1], 0.8 * out, 0.1); R.flushPoints();
  },
};
