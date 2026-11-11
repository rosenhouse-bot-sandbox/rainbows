// Pieces shared by several stages.
import { V } from '../gl.js';

// How bright to draw a beam carrying a fraction I of the sunlight. A straight mapping would make
// the 5% that forms the rainbow invisible beside the 89% that escapes, so brightness is compressed.
export const vis = I => Math.pow(Math.max(I, 0), 0.42);

export const WARM = [1.0, 0.86, 0.62];      // low sunlight
export const WHITE = [1, 1, 1];

let backdropProg = null;
// A quiet gradient behind the small-scale stages.
export function backdrop(R, time, top, bot, glow = [0, 0, 0], glowDir = [1, 0, 0]) {
  const gl = R.gl;
  if (!backdropProg) backdropProg = R.rayProgram(`
uniform vec3 uTop, uBot, uGlow, uGlowDir;
void main(){ vec3 rd = rayDir();
  vec3 c = mix(uBot, uTop, smoothstep(-0.7, 0.8, rd.y));
  c += uGlow*pow(max(dot(rd, uGlowDir), 0.0), 6.0);
  c *= 0.85 + 0.3*fbm(rd*2.5 + vec3(0.0, uTime*0.01, 0.0));
  o = vec4(c*uFade, 1.0); gl_FragDepth = 1.0; }`);
  gl.useProgram(backdropProg.p); R.setRayUniforms(backdropProg, time);
  // arriving from the scale above, this backdrop comes up only as that scene gives way (see main.js)
  const k = R.zoom?.lo ? R.zoom.cover : 1, dimmed = c => c.map(x => x * k);
  gl.uniform3fv(backdropProg.u.uTop, dimmed(top)); gl.uniform3fv(backdropProg.u.uBot, dimmed(bot));
  gl.uniform3fv(backdropProg.u.uGlow, dimmed(glow)); gl.uniform3fv(backdropProg.u.uGlowDir, glowDir);
  R.fullscreen(backdropProg, 'opaque');
}

// Plane wavefronts: square sheets of crest lines sweeping along `dir`.
// keep(p) can cut the sheet where the light has been blocked.
export function wavefrontSheets(R, origin, dir, half, spacing, count, phase, color, alpha, keep, grid = 8) {
  const d = V.norm(dir);
  let e1 = V.cross(d, [0, 1, 0]); if (V.len(e1) < 1e-3) e1 = [1, 0, 0]; e1 = V.norm(e1);
  const e2 = V.cross(e1, d);
  for (let k = 0; k < count; k++) {
    const s = (k + phase) * spacing, c = V.mad(origin, d, s);
    const edge = Math.min(1, Math.min(k + phase, count - k - phase) / 2);
    const a = alpha * edge;
    for (let i = 0; i <= grid; i++) {
      const u = (i / grid * 2 - 1) * half, w = i === 0 || i === grid ? 1.8 : 1.1, aa = i === 0 || i === grid ? a : a * 0.45;
      for (let j = 0; j < grid; j++) {
        const v0 = (j / grid * 2 - 1) * half, v1 = ((j + 1) / grid * 2 - 1) * half;
        const p0 = V.mad(V.mad(c, e1, u), e2, v0), p1 = V.mad(V.mad(c, e1, u), e2, v1);
        const q0 = V.mad(V.mad(c, e2, u), e1, v0), q1 = V.mad(V.mad(c, e2, u), e1, v1);
        if (!keep || (keep(p0) && keep(p1))) R.seg(p0, p1, color, aa, w);
        if (!keep || (keep(q0) && keep(q1))) R.seg(q0, q1, color, aa, w);
      }
    }
  }
}

// A stylised eye: an almond outline with an iris, facing along `look`.
export function eyeGlyph(R, at, look, up, size, iris, alpha = 1) {
  const f = V.norm(look); let r = V.norm(V.cross(up, f)); const u = V.cross(f, r);
  const N = 20; let p1 = null, p2 = null;
  for (let i = 0; i <= N; i++) {
    const t = i / N * 2 - 1, y = (1 - t * t) * 0.48;
    const a = V.mad(V.mad(at, r, t * size), u, y * size), b = V.mad(V.mad(at, r, t * size), u, -y * size);
    if (p1) { R.seg(p1, a, [1, 1, 1], 0.8 * alpha, 1.6); R.seg(p2, b, [1, 1, 1], 0.8 * alpha, 1.6); }
    p1 = a; p2 = b;
  }
  R.arc(at, r, u, size * 0.3, 0, Math.PI * 2, iris, alpha, 2.2, 20);
  R.pt(at, iris, 1.4 * alpha, size * 0.55);
}

// ---- the sky's brightness table, as a texture ----
import { bowTable } from '../optics.js';
import { latheMesh, sphereMesh, modelTRS } from '../gl.js';
let bow = null;
export function bowTexture(R) {
  if (bow) return bow;
  const gl = R.gl, tab = bowTable(1024, 20, 70);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, tab.N, 1, 0, gl.RGBA, gl.FLOAT, tab.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  bow = { tex, tab };
  return bow;
}

// ---- a simple standing figure, 1.75 m tall, eyes at 1.62 m ----
let fig = null;
export function drawFigure(R, at, toSun, sunCol, scale = 1) {
  if (!fig) fig = {
    body: R.mesh(...latheMesh([[0.0, 0], [0.13, 0.0], [0.15, 0.45], [0.19, 0.85], [0.21, 1.15], [0.24, 1.38], [0.17, 1.47], [0.07, 1.5], [0.0, 1.5]], 18)),
    head: R.mesh(...sphereMesh(18, 12)),
  };
  const col = [0.12, 0.13, 0.16], amb = [0.12, 0.15, 0.22];
  R.drawMesh(fig.body, modelTRS(at, scale), col, toSun, sunCol, amb);
  R.drawMesh(fig.head, modelTRS([at[0], at[1] + 1.63 * scale, at[2]], 0.125 * scale), col, toSun, sunCol, amb);
}

// Directions on a cone of half-angle theta about `axis`; psi = 0 is the highest point.
export function coneDir(axis, theta, psi) {
  const up = Math.abs(axis[1]) > 0.999 ? [0, 0, -1] : [0, 1, 0];
  const r = V.norm(V.cross(axis, up)), u = V.cross(r, axis);
  const s = Math.sin(theta), c = Math.cos(theta);
  return [axis[0] * c + (u[0] * Math.cos(psi) + r[0] * Math.sin(psi)) * s,
    axis[1] * c + (u[1] * Math.cos(psi) + r[1] * Math.sin(psi)) * s,
    axis[2] * c + (u[2] * Math.cos(psi) + r[2] * Math.sin(psi)) * s];
}
export const colourName = l => l == null ? '' : l < 425 ? 'violet' : l < 455 ? 'indigo' : l < 492 ? 'blue' : l < 565 ? 'green' : l < 590 ? 'yellow' : l < 625 ? 'orange' : 'red';
