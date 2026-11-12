// Stage 2: a field with the Sun behind you and rain ahead, from the whole sky down to single drops.
// Units are metres. The far rain paints the bow on the sky; the near drops are drawn one by one, each
// coloured by the light it sends to the figure's eye: red at 42.4° from the antisolar line, violet at
// 40.6°, faint white inside that, and almost nothing outside. Both lie on the same cone from the eye.
// Sunlight is gold, slanted and carries arrowheads; rain is cool, vertical and tear-shaped.
import { V, DEG, rng, clamp, sstep, lerp } from '../gl.js';
import * as O from '../optics.js';
import { SUN, sunRay, bowTexture, drawFigure, wavefrontSheets, colourName } from './common.js';
import { EYE, sunDir, sunColour, drawEnv, initEnv } from './sky.js';
import { drawFar } from './drop.js';

const BOX0 = [-8, 0, -13], BOXS = [16, 9, 10.5], NDROPS = 30000;
const B1 = O.bowAngle(O.nWater(550)), B2 = O.bowAngle(O.nWater(550), 2);
const DROP = 0.01, FALL = 1.1 / 16;      // a marked drop's drawn radius, and how fast it falls, in metres (per second)
const HEROES = [[-2.6, -7.5, 0.0], [0.4, -6.2, 0.37], [2.9, -8.4, 0.71], [-0.9, -9.6, 0.55]];
let drops = null, vao = null;
// How the scene is dressed depends only on where the camera is. `here` is 0 from far above (arriving
// from orbit) and 1 once it is down in the field; `close` is 0 from the wide view behind your shoulder
// and 1 in among the drops, where the sky is turned down so that single drops show against it.
const dress = eye => { const back = V.len(V.sub(eye, EYE)); return { here: 1 - sstep(60, 500, back), close: 1 - sstep(10, 19, back) }; };

const angleAt = (p, s) => { const d = V.norm(V.sub(p, EYE)); return Math.acos(clamp(V.dot(d, s), -1, 1)); };
// The hero drops fall straight down through the bow; find the height where each crosses 42°.
function heroes(S, T) {
  const s = sunDir(S), tab = bowTexture().tab, out = [];
  for (const [x, z, ph] of HEROES) {
    let lo = 0.2, hi = 12;
    const target = 41.6 * DEG;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (angleAt([x, m, z], s) < target) lo = m; else hi = m; }
    // a drop whose crossing of the bow is leaving the rain (too high, or into the ground) fades out
    // as the Sun moves, and is not there one moment and gone the next
    const edge = sstep(0.6, 1.4, lo) * (1 - sstep(7.2, 8.2, lo));
    if (edge <= 0) continue;
    const u = (T / 16 + ph) % 1, y = lo + 0.55 - FALL * 16 * u;
    const P = [x, y, z], th = angleAt(P, s), c = O.sampleBow(tab, th / DEG), m = Math.max(c[0], c[1], c[2], 1e-4);
    out.push({ P, th, col: c.map(v => v / Math.max(m, 0.25)), level: Math.min(1, m / 0.25), lam: O.wavelengthAt(th), u, fade: Math.min(1, u * 8, (1 - u) * 8) * edge });
  }
  return out;
}
let lastHeroes = [], lock = 0, lockAt = 0;
// The Drop scene's axes for a drop at P: sunlight along its +x, and the eye in its x-y plane, below.
function frame(P, X) {
  const v = V.norm(V.sub(EYE, P)), Y = V.mul(V.norm(V.mad(v, X, -V.dot(v, X))), -1);
  return { o: P, s: DROP, X, Y, Z: V.cross(X, Y), theta: Math.acos(clamp(-V.dot(v, X), -1, 1)) };
}

export default {
  id: 'rain', aliases: ['sky'], name: 'Rain', scale: '1 km to 1 m', scaleNote: 'near drops drawn larger than life, as streaks', modes: true, focus: true,
  controls: ['focus', 'mode', 'sun', 'key'], bloom: 0.85, exposure: 1.0,
  hint: 'Drag to look around · scroll to move in among the drops',
  hintSmall: 'Drag to look around · pinch to move in',
  // One camera for the whole scale: from behind your shoulder with the bow across the sky, in to the drops.
  cam: { type: 'orbit', target: [0, 3.7, -6], yaw: 0.1, pitch: -0.18, dist: 20, fov: 58, sway: 0.02, minY: 0.9, widen: true,
    lim: { yaw: [-1.2, 1.2], pitch: [-0.22, 0.6], dist: [8.5, 26] } },
  extent: 3500,        // how much of this scene matters, in metres: the rain and the bow in it
  // the next scale is one of the marked drops: pick the one with the most of its fall left, and stay with it
  portal: S => {
    const now = performance.now();
    if (now - lockAt > 1500 || !lastHeroes[lock]) { lock = 0; lastHeroes.forEach((h, i) => { if (h.u < (lastHeroes[lock]?.u ?? 2) ) lock = i; }); }
    lockAt = now;
    return lastHeroes[lock] ? lastHeroes[lock].P : [0, 5, -7];
  },

  // The Drop scene is one of the marked drops: sunlight along its +x, and its eye direction toward the figure.
  // `ahead` asks where the drop will be that many seconds on: it keeps falling during the flight in.
  embed(S, ahead = 0) {
    const P = V.add(this.portal(S), [0, -FALL * ahead, 0]);
    return { ...frame(P, sunDir(S)), hero: lastHeroes[lock], eyeDist: V.len(V.sub(EYE, P)) / DROP };
  },

  caption(S) {
    if (S.sun > 42) return { title: 'Too high a Sun, no bow',
      body: 'The bow is a circle 42° from the point directly opposite the Sun. With the Sun more than 42° up, that whole circle lies below the horizon, which is why rainbows are seen in the morning and late afternoon. Only drops close by and below your eye line can still be seen coloured, as in the spray of a garden sprinkler. Lower the Sun to bring the bow back.' };
    if (S.focus === 'eye') return { title: 'Only some drops send light to your eye',
      body: 'Gold arrows are sunlight going into a few marked drops; the coloured arrows are the light those drops send to your eye. You see a drop as coloured only while it is 42° away from the line to your head\'s shadow, near or far. Falling through, it is seen as red, then orange, yellow, green, blue and violet, and then pale. Another drop takes its place at once, so the bow stays still while the drops fall through it.' };
    if (S.focus === 'sun') return { title: 'Every drop does the same thing',
      body: 'The Sun is behind you, and its light, drawn in gold, passes over your shoulder into the rain. Each drop sends part of that light back toward the Sun on a hollow cone, with the light seen as red outermost. All the cones point the same way. You see a drop as coloured only if its cone passes through your eye.' };
    return { title: 'Sun behind, rain ahead',
      body: 'The gold arrows are sunlight. The falling streaks are raindrops, each coloured by what it sends to the standing figure. Near drops and far rain are seen coloured along the same cone, 42° from the line through your head to its shadow: the bow is a set of directions, not a place. Move in to watch single drops fall through it.' };
  },
  readout(S) {
    const top = (B1 / DEG - S.sun), top2 = (B2 / DEG - S.sun);
    const rows = lastHeroes.map((h, i) => `<dt>Marked drop ${i + 1} · ${(h.th / DEG).toFixed(1)}°</dt><dd>${h.lam ? colourName(h.lam) + ' ' + Math.round(h.lam) + ' nm' : h.th > 0.74 ? 'dark' : 'pale white'}</dd>`).join('');
    // always one row for each marked drop, so the list never changes length while the Sun slider is held
    const blank = Array.from({ length: HEROES.length - lastHeroes.length }, (_, i) => `<dt>Marked drop ${lastHeroes.length + i + 1}</dt><dd>not crossing the bow</dd>`).join('');
    return `<dl><dt>Top of the main bow</dt><dd>${top > 0 ? top.toFixed(1) + '° up' : 'below the horizon'}</dd>
<dt>Top of the outer bow</dt><dd>${top2 > 0 ? top2.toFixed(1) + '° up' : 'below the horizon'}</dd>
${rows}${blank}<dt>Drops shown falling</dt><dd>about 15× slower than real</dd></dl>`;
  },
  liveReadout: true,
  init(R) {
    const gl = R.gl; bowTexture(R); initEnv(R);
    drops = R.compile(`#version 300 es
layout(location=0) in vec2 corner; layout(location=1) in vec4 D;
uniform mat4 uVP; uniform vec2 uRes, uLutRange; uniform float uPx, uP11, uTime, uFade, uGain;
uniform vec3 uSun, uEyeP, uSunCol, uBox0, uBoxS; uniform sampler2D uLUT;
out vec3 vC; out vec2 vUV; out float vTail;
void main(){
  vec3 p = D.xyz; p.y = uBox0.y + mod(D.y - uTime*(0.45+0.2*D.w), uBoxS.y);
  float th = degrees(acos(clamp(dot(normalize(p-uEyeP), uSun), -1.0, 1.0)));
  vec3 bow = texture(uLUT, vec2((th-uLutRange.x)/(uLutRange.y-uLutRange.x), 0.5)).rgb;
  vec3 e = (p-uBox0)/uBoxS; float edge = smoothstep(0.0,0.08,e.x)*smoothstep(1.0,0.92,e.x)*smoothstep(0.0,0.1,e.z)*smoothstep(1.0,0.9,e.z)*smoothstep(1.0,0.9,e.y);
  vC = (vec3(0.014,0.026,0.048) + bow*uSunCol*uGain)*uFade*edge;
  vec4 c = uVP*vec4(p,1.0);
  if(c.w < 0.05){ gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  float truePx = 0.02*uP11*uRes.y*0.5/c.w, px = max(truePx, 1.0*uPx);
  vC *= min(1.0, truePx*truePx/(px*px)*6.0);      // seen from far off, a drop keeps its share of light, not a whole pixel
  // A drop falling past right in front of the camera would cover much of the view for a frame or two, a
  // flash of colour from nowhere. Like anything that close to a lens it is out of focus: it thins as it spreads.
  vC *= min(1.0, pow(0.04*uRes.y/truePx, 2.0));
  // From a distance a falling drop is drawn as a streak, head down. Close enough to have a size of
  // its own it is what it is: a sphere, as the Drop scale shows it.
  vTail = 1.0 - smoothstep(2.5, 8.0, truePx);
  gl_Position = vec4(c.xy + corner*vec2(1.0, mix(1.0, 3.4, vTail))*px/(uRes*0.5)*c.w, c.z, c.w); vUV = corner; }`,
    `#version 300 es
precision highp float; in vec3 vC; in vec2 vUV; in float vTail; layout(location=0) out vec4 o;
// the streak: a round head with a tail thinning out above it
void main(){ float y = vUV.y*0.5+0.5, w = mix(1.0, 0.3, y), x = vUV.x/w, h = (vUV.y+0.62)/0.38;
  float streak = exp(-x*x*3.5)*(vUV.y < -0.62 ? exp(-h*h*3.5) : pow(1.0-(vUV.y+0.62)/1.62, 1.6))*1.25;
  float f = mix(exp(-dot(vUV,vUV)*3.5), streak, vTail);
  if(f < 0.01) discard; o = vec4(vC*f, 0.0); }`);
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
    const { here, close } = dress(R.view.eye);
    drawEnv(R, S, T, lerp(0.36, 0.85, close) * here, lerp(0.62, 0.25, close));
    drawFigure(R, [0, 0, 0], toSun, sc.map(x => x * 0.85));
    if (here <= 0) return;       // from orbit there is only the land: the diagram is drawn once you are down in it

    // the near rain, drop by drop
    gl.useProgram(drops.p);
    const u = drops.u, v = R.view;
    gl.uniformMatrix4fv(u.uVP, false, v.vp); gl.uniform2f(u.uRes, R.W, R.H); gl.uniform2f(u.uLutRange, bt.tab.deg0, bt.tab.deg1);
    gl.uniform1f(u.uPx, R.px); gl.uniform1f(u.uP11, v.p11); gl.uniform1f(u.uTime, T); gl.uniform1f(u.uFade, R.fade * here);
    gl.uniform1f(u.uGain, f === 'sun' ? 1.2 : 3.2);
    gl.uniform3fv(u.uSun, s); gl.uniform3fv(u.uEyeP, EYE); gl.uniform3fv(u.uSunCol, sc); gl.uniform3fv(u.uBox0, BOX0); gl.uniform3fv(u.uBoxS, BOXS);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bt.tex); gl.uniform1i(u.uLUT, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.bindVertexArray(vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, NDROPS);

    // sunlight, over your shoulder and down into the rain
    const aS = (f === 'eye' ? 0.1 : f === 'sun' ? 1 : 0.55) * here;
    if (S.mode === 'wave') {
      wavefrontSheets(R, V.mad([0, 4.2, -5], s, -10), s, 5.0, 2.4, 8, (T * 0.4) % 1, SUN, 0.24 * aS, p => p[1] > 0, 4);
    } else {
      const r = [1, 0, 0], up = V.cross(r, s);
      for (let i = -3; i <= 3; i++) for (let j = 0; j < 4; j++) {
        const q = V.mad(V.mad([0, 1, -4], r, i * 2.1 + (j & 1)), up, j * 2.1 + 0.4);
        const tg = s[1] < -1e-3 ? Math.min(30, q[1] / -s[1]) : 30;
        sunRay(R, V.mad(q, s, -22), V.mad(q, s, tg), 0.3 * aS, 0.3 * aS, T, { gap: 3.4, size: 0.24, speed: 3.2, phase: i * 0.37 + j * 0.61 });
      }
      // the one ray that reaches your head
      sunRay(R, V.mad(EYE, s, -22), EYE, 0.6 * aS, 0.6 * aS, T, { gap: 3.4, size: 0.24, speed: 3.2, w: 2 });
    }
    R.flushLines();
    // the antisolar line: on through your head to its shadow, the centre of the bow
    const tgE = s[1] < -1e-3 ? Math.min(40, EYE[1] / -s[1]) : 40;
    R.seg(EYE, V.mad(EYE, s, tgE), [0.7, 0.8, 1], 0.5 * here, 1.3);
    R.flushLines({ dash: [0.3, 0, 0.5] });
    if (tgE < 40) { R.arc(V.add(V.mad(EYE, s, tgE), [0, 0.02, 0]), [1, 0, 0], [0, 0, 1], 0.35, 0, 6.2832, [0.7, 0.8, 1], 0.7 * here * (1 - sstep(30, 40, tgE)), 1.6, 28); R.flushLines(); }

    // marked drops: a glint, the sunlight going into it, and the one ray of the light it throws back that finds the eye
    // (drawn by the Drop scale's own code, in the drop's own axes, so the two scales agree line for line)
    const hs = lastHeroes = heroes(S, T);
    for (const h of hs) {
      const M = frame(h.P, s);
      drawFar(R, S, h, EYE, T, here, here, p => [M.o[0] + (M.X[0] * p[0] + M.Y[0] * p[1] + M.Z[0] * p[2]) * DROP, M.o[1] + (M.X[1] * p[0] + M.Y[1] * p[1] + M.Z[1] * p[2]) * DROP, M.o[2] + (M.X[2] * p[0] + M.Y[2] * p[1] + M.Z[2] * p[2]) * DROP], DROP);
    }
    R.flushLines();
    R.pt(EYE, [1, 1, 1], 0.9 * here, 0.09);
    R.flushPoints({ minPx: 2 });
  },
};
