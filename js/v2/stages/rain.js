// Stage 3: inside the rain. Units are metres; the geometry is the Sky stage's, seen from outside.
// Every drop is coloured by the light it sends to the figure's eye: red at 42.4° from the antisolar
// line, violet at 40.6°, faint white inside that, and almost nothing outside.
import { V, DEG, rng, clamp } from '../gl.js';
import * as O from '../optics.js';
import { WARM, bowTexture, drawFigure, coneDir, wavefrontSheets, colourName } from './common.js';
import { EYE, sunDir, sunColour } from './sky.js';

const BOX0 = [-8, 0, -13], BOXS = [16, 9, 10.5], NDROPS = 30000;
const CONE = [[650, O.bowAngle(O.nWater(650))], [550, O.bowAngle(O.nWater(550))], [450, O.bowAngle(O.nWater(450))]].map(([l, th]) => ({ th, col: O.wlRGB(l) }));
const HEROES = [[-2.6, -7.5, 0.0], [0.4, -6.2, 0.37], [2.9, -8.4, 0.71], [-0.9, -9.6, 0.55]];
let ground = null, drops = null, vao = null;

const angleAt = (p, s) => { const d = V.norm(V.sub(p, EYE)); return Math.acos(clamp(V.dot(d, s), -1, 1)); };
// The hero drops fall straight down through the bow; find the height where each crosses 42°.
function heroes(S, T) {
  const s = sunDir(S), tab = bowTexture().tab, out = [];
  for (const [x, z, ph] of HEROES) {
    let lo = 0.2, hi = 12;
    const target = 41.6 * DEG;
    if (angleAt([x, hi, z], s) < target) continue;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (angleAt([x, m, z], s) < target) lo = m; else hi = m; }
    if (lo < 0.6 || lo > 8.2) continue;
    const u = (T / 16 + ph) % 1, y = lo + 0.55 - 1.1 * u;
    const P = [x, y, z], th = angleAt(P, s), c = O.sampleBow(tab, th / DEG), m = Math.max(c[0], c[1], c[2], 1e-4);
    out.push({ P, th, col: c.map(v => v / Math.max(m, 0.25)), level: Math.min(1, m / 0.25), lam: O.wavelengthAt(th), fade: Math.min(1, u * 8, (1 - u) * 8) });
  }
  return out;
}
let lastHeroes = [];

export default {
  id: 'rain', name: 'Rain', scale: '1 m', scaleNote: 'drops drawn much larger than life', modes: true, focus: true,
  controls: ['focus', 'mode', 'sun'], bloom: 1.0, exposure: 1.0,
  cam: { type: 'orbit', target: [0, 2.9, -4.6], yaw: 0.62, pitch: 0.1, dist: 14.5, fov: 40,
    lim: { yaw: [-1.2, 1.2], pitch: [0.02, 0.6], dist: [7.5, 19] } },
  portal: S => (lastHeroes[0] ? lastHeroes[0].P : [0, 5, -7]),

  caption(S) {
    if (S.focus === 'eye') return { title: 'Only some drops are aimed at you',
      body: 'A drop sends you colour only while it sits on the cone 42° from your antisolar line. As each drop falls through that cone it flashes red, then orange, yellow, green, blue and violet, and then goes pale. A fresh drop takes its place at once, so the bow holds still while the rain pours through it.' };
    if (S.focus === 'sun') return { title: 'Every drop does the same thing',
      body: 'Each drop takes in parallel sunlight and throws a hollow cone of colour back toward the Sun, red on the outside. All the cones point the same way. Whether you see a drop as coloured depends only on whether its cone happens to pass through your eye.' };
    return { title: 'A bow made of falling drops',
      body: 'Here the drops are coloured by what each one sends to the standing figure. Together they trace a cone with the eye at its tip. Watch the marked drops: each throws back its own cone of colour, and one edge of it sweeps across the eye as the drop falls.' };
  },
  readout(S) {
    const rows = lastHeroes.map((h, i) => `<dt>Marked drop ${i + 1} · ${(h.th / DEG).toFixed(1)}°</dt><dd>${h.lam ? colourName(h.lam) + ' ' + Math.round(h.lam) + ' nm' : h.th > 0.74 ? 'dark' : 'pale white'}</dd>`).join('');
    return `<dl>${rows}<dt>Drops shown falling</dt><dd>about 15× slower than real</dd></dl>`;
  },
  liveReadout: true,
  labels(S) {
    const L = [{ p: [0, 1.95, 0], text: 'You', cls: 'strong' }];
    lastHeroes.forEach((h, i) => { if (h.fade > 0.5) L.push({ p: V.add(h.P, [0.12, 0.1, 0]), text: h.lam ? `sends you ${colourName(h.lam)}` : h.th > 0.74 ? 'nothing for you yet' : 'pale white now', cls: i ? 'far' : '' }); });
    const s = sunDir(S);
    L.push({ p: V.mad([2.5, 6.5, 0], s, -3), text: 'Sunlight', cls: 'far' });
    return L;
  },

  init(R) {
    const gl = R.gl; bowTexture(R);
    ground = R.rayProgram(`
uniform vec3 uSun, uSunCol;
void main(){ vec3 ro = uEye, rd = rayDir(); float depth = 1.0;
  float toward = dot(normalize(rd.xz+vec2(1e-5)), normalize(-uSun.xz));
  vec3 sky = mix(vec3(0.016,0.022,0.04), vec3(0.07,0.085,0.12), smoothstep(-0.4,1.0,toward))*(0.6+0.8*fbm(rd*2.0+vec3(0.0,0.0,uTime*0.01)));
  sky += uSunCol*0.05*exp(-abs(rd.y)*7.0);
  vec3 col = sky;
  if(rd.y < -1e-4){
    float t = -ro.y/rd.y; vec3 P = ro + rd*t;
    float rip = vnoise(vec3(P.xz*3.0, uTime*0.7));
    vec3 g = vec3(0.020,0.032,0.022)*(0.6+0.8*vnoise(vec3(P.xz*0.7,1.0))) + uSunCol*0.012*rip;
    vec2 gr = abs(fract(P.xz)-0.5); g += vec3(0.05,0.07,0.1)*smoothstep(0.485,0.5,max(gr.x,gr.y))*exp(-t/14.0);
    vec3 refl = reflect(rd, normalize(vec3((rip-0.5)*0.12, 1.0, 0.0)));
    g += uSunCol*pow(max(dot(refl,-uSun),0.0), 24.0)*0.25;
    col = mix(g, sky, 1.0-exp(-t/45.0)); depth = depthOf(P);
  }
  o = vec4(col*uFade, 1.0); gl_FragDepth = depth; }`);
    drops = R.compile(`#version 300 es
layout(location=0) in vec2 corner; layout(location=1) in vec4 D;
uniform mat4 uVP; uniform vec2 uRes, uLutRange; uniform float uPx, uP11, uTime, uFade, uGain;
uniform vec3 uSun, uEyeP, uSunCol, uBox0, uBoxS; uniform sampler2D uLUT;
out vec3 vC; out vec2 vUV;
void main(){
  vec3 p = D.xyz; p.y = uBox0.y + mod(D.y - uTime*(0.45+0.2*D.w), uBoxS.y);
  float th = degrees(acos(clamp(dot(normalize(p-uEyeP), uSun), -1.0, 1.0)));
  vec3 bow = texture(uLUT, vec2((th-uLutRange.x)/(uLutRange.y-uLutRange.x), 0.5)).rgb;
  vec3 e = (p-uBox0)/uBoxS; float edge = smoothstep(0.0,0.08,e.x)*smoothstep(1.0,0.92,e.x)*smoothstep(0.0,0.1,e.z)*smoothstep(1.0,0.9,e.z)*smoothstep(1.0,0.9,e.y);
  vC = (vec3(0.022,0.027,0.036) + bow*uSunCol*uGain)*uFade*edge;
  vec4 c = uVP*vec4(p,1.0);
  if(c.w < 0.05){ gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  float px = max(0.02*uP11*uRes.y*0.5/c.w, 1.0*uPx);
  gl_Position = vec4(c.xy + corner*vec2(1.0,2.4)*px/(uRes*0.5)*c.w, c.z, c.w); vUV = corner; }`,
    `#version 300 es
precision highp float; in vec3 vC; in vec2 vUV; layout(location=0) out vec4 o;
void main(){ float r2 = dot(vUV,vUV); if(r2 > 1.0) discard; o = vec4(vC*exp(-r2*3.5), 0.0); }`);
    const rnd = rng(5), data = new Float32Array(NDROPS * 4);
    for (let i = 0; i < NDROPS; i++) { data[i * 4] = BOX0[0] + rnd() * BOXS[0]; data[i * 4 + 1] = rnd() * BOXS[1]; data[i * 4 + 2] = BOX0[2] + rnd() * BOXS[2]; data[i * 4 + 3] = rnd(); }
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const q = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, q); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
  },

  draw(R, S, T) {
    const gl = R.gl, s = sunDir(S), toSun = V.mul(s, -1), sc = sunColour(S), f = S.focus, bt = bowTexture(R);
    gl.useProgram(ground.p); R.setRayUniforms(ground, T);
    gl.uniform3fv(ground.u.uSun, s); gl.uniform3fv(ground.u.uSunCol, sc);
    R.fullscreen(ground, 'opaque');
    drawFigure(R, [0, 0, 0], toSun, sc.map(x => x * 0.8));

    // the rain
    gl.useProgram(drops.p);
    const u = drops.u, v = R.view;
    gl.uniformMatrix4fv(u.uVP, false, v.vp); gl.uniform2f(u.uRes, R.W, R.H); gl.uniform2f(u.uLutRange, bt.tab.deg0, bt.tab.deg1);
    gl.uniform1f(u.uPx, R.px); gl.uniform1f(u.uP11, v.p11); gl.uniform1f(u.uTime, T); gl.uniform1f(u.uFade, R.fade);
    gl.uniform1f(u.uGain, f === 'sun' ? 1.2 : 3.2);
    gl.uniform3fv(u.uSun, s); gl.uniform3fv(u.uEyeP, EYE); gl.uniform3fv(u.uSunCol, sc); gl.uniform3fv(u.uBox0, BOX0); gl.uniform3fv(u.uBoxS, BOXS);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bt.tex); gl.uniform1i(u.uLUT, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.bindVertexArray(vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, NDROPS);

    // sunlight
    const aS = f === 'eye' ? 0.1 : f === 'sun' ? 1 : 0.55;
    if (S.mode === 'wave') {
      wavefrontSheets(R, V.mad([0, 4.2, -5], s, -10), s, 5.0, 2.4, 8, (T * 0.4) % 1, WARM, 0.2 * aS, p => p[1] > 0, 4);
      R.flushLines();
    } else {
      const r = [1, 0, 0], up = V.cross(r, s);
      for (let i = -3; i <= 3; i++) for (let j = 0; j < 4; j++) {
        const q = V.mad(V.mad([0, 1, -4], r, i * 2.1 + (j & 1)), up, j * 2.1 + 0.4);
        const tg = s[1] < -1e-3 ? Math.min(30, q[1] / -s[1]) : 30;
        R.seg(V.mad(q, s, -14), V.mad(q, s, tg), WARM, 0.3 * aS, 1.5, 0.3 * aS, i * 1.3 + j * 2.9);
      }
      R.flushLines({ dash: [2.6, T * 3.2, 0.4] });
    }
    // the antisolar line through the head
    const tgE = s[1] < -1e-3 ? Math.min(40, EYE[1] / -s[1]) : 40;
    R.seg(V.mad(EYE, s, -5), V.mad(EYE, s, tgE), [0.7, 0.8, 1], 0.5, 1.3);
    R.flushLines({ dash: [0.3, 0, 0.5] });

    // marked drops: the cone each throws back, and the one ray of it that finds the eye
    const hs = lastHeroes = heroes(S, T), back = toSun;
    const aC = f === 'eye' ? 0.12 : f === 'sun' ? 1 : 0.6, aE = f === 'sun' ? 0.15 : 1;
    for (const h of hs) {
      for (const c of CONE) for (let k = 0; k < 30; k++) {
        const d = coneDir(back, c.th, k / 30 * 2 * Math.PI);
        R.seg(h.P, V.mad(h.P, d, 1.8), c.col, 0.4 * aC * h.fade, 1.2, 0);
      }
      R.seg(h.P, EYE, h.col, (0.25 + 0.75 * h.level) * aE * h.fade, 2.4);
      R.pt(h.P, [0.8, 0.9, 1], 0.7 * h.fade, 0.06);
      R.pt(h.P, h.col, h.level * h.fade * aE, 0.2);
    }
    R.flushLines();
    if (f !== 'sun') {
      // the eye's own cone, for comparison
      for (const c of CONE) for (let k = -16; k <= 16; k++) {
        const d = coneDir(s, c.th, k * 0.1), L = d[1] < -1e-3 ? Math.min(12, EYE[1] / -d[1]) : 12;
        R.seg(EYE, V.mad(EYE, d, L), c.col, (f === 'eye' ? 0.3 : 0.1), 1.2, 0.0, k);
      }
      R.flushLines({ dash: [1.2, -T * 2.5, 0.6] });
    }
    R.pt(EYE, [1, 1, 1], 0.9, 0.09);
    R.flushPoints({ minPx: 2 });
  },
};
