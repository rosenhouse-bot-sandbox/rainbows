// The place the Rain scale happens in: a field with the Sun behind you and rain ahead. Units are metres.
// You face −z; sunlight travels along sunDir (which is also the direction of the antisolar point).
// (This was once a scale of its own, "Sky"; the Rain scale now shows the sky and the drops together.)
import { V, DEG, clamp, sstep, lerp } from '../gl.js';
import { bowTexture } from './common.js';

export const EYE = [0, 1.62, 0];
export const sunDir = S => { const h = S.sun * DEG; return [0, -Math.sin(h), -Math.cos(h)]; };
export const sunColour = S => { const t = clamp(Math.sin(S.sun * DEG) / 0.55, 0, 1), k = t * t * (3 - 2 * t); return [1, 0.5 + 0.42 * k, 0.22 + 0.58 * k]; };
let prog = null;

// The land, hills, sky and weather. `rainy` runs from 0 (plain daylight, as seen coming down from orbit)
// to 1 (turned well down, so that single drops show against it, with a metre grid on the ground).
// `bow` is how strongly the far rain's bow is painted on the sky.
const DIM = 0.24;
export function drawEnv(R, S, T, rainy, bow) {
  const gl = R.gl, bt = bowTexture(R);
  // a bow belongs to one pair of eyes: from far away (arriving from orbit) this one is not yours to see
  const near = 1 - sstep(250, 2500, V.len(V.sub(R.view.eye, EYE)));
  gl.useProgram(prog.p); R.setRayUniforms(prog, T);
  gl.uniform3fv(prog.u.uSun, sunDir(S)); gl.uniform3fv(prog.u.uSunCol, sunColour(S));
  gl.uniform1f(prog.u.uBow, bow * near); gl.uniform1f(prog.u.uDim, lerp(1, DIM, rainy)); gl.uniform1f(prog.u.uFloor, rainy);
  gl.uniform2f(prog.u.uLutRange, bt.tab.deg0, bt.tab.deg1);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bt.tex); gl.uniform1i(prog.u.uLUT, 0);
  R.fullscreen(prog, 'opaque');
}

export function initEnv(R) {
  bowTexture(R);
  if (prog) return;
    prog = R.rayProgram(`
uniform vec3 uSun, uSunCol; uniform sampler2D uLUT; uniform vec2 uLutRange; uniform float uBow, uDim, uFloor;
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
  float hz = hills(az), depth = 1.0; vec3 col, mark = vec3(0.0);
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
    // From far above (arriving from orbit) you look down on the top of the weather: sunlit land
    // under broken cloud, in the same tones as the globe. Coming down, it thins into the view below.
    float high = smoothstep(250.0, 3000.0, ro.y);
    if(high > 0.0){
      vec3 Q = ro + rd*(-ro.y/min(rd.y,-1e-4));
      float k = 1.0/max(ro.y, 2000.0);       // features sized to how much ground is in view
      float deck = smoothstep(0.42, 0.72, 0.6*fbm(vec3(Q.xz*0.00011, 4.0+uTime*0.004)) + 0.4*fbm(vec3(Q.xz*k*1.6, 9.0)) + 0.25*(fbm(vec3(Q.xz*k*7.0, 2.0))-0.5));
      vec3 lnd = mix(vec3(0.045,0.105,0.028), vec3(0.17,0.17,0.05), smoothstep(0.35,0.65, fbm(vec3(Q.xz*k*3.0, 5.0))+0.3*(fbm(vec3(Q.xz*k*14.0, 1.0))-0.5)));
      vec3 sun = uSunCol*sunUp;
      col = mix(col, mix(lnd*(sun*(0.22+1.9*max(toSun.y,0.0)) + vec3(0.09,0.12,0.17)), vec3(0.92)*(sun*(0.05+1.5*max(toSun.y,0.0)) + 0.01), deck*0.9), high);
    }
    // the Rain scale's floor: a metre grid and the shimmer of wet ground, close around the figure
    if(uFloor > 0.0){
      vec2 gr = abs(fract(P.xz)-0.5); float rip = vnoise(vec3(P.xz*3.0, uTime*0.7));
      mark = (vec3(0.05,0.07,0.1)*smoothstep(0.485,0.5,max(gr.x,gr.y))*exp(-t/14.0) + uSunCol*0.012*rip*exp(-t/45.0))*uFloor;
    }
    depth = depthOf(P);
  }
  o = vec4((col*uDim + mark)*uFade, 1.0); gl_FragDepth = depth; }`);
}
