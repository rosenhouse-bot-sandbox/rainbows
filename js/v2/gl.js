// A small WebGL2 engine for Rainbows v2: HDR render targets with bloom, glowing instanced lines
// and points, lit meshes, and full-screen ray shaders that share one camera convention.
// No dependencies.

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
export const DEG = Math.PI / 180;

export function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.gauss = () => Math.sqrt(-2 * Math.log(1 - r() + 1e-12)) * Math.cos(6.283185307 * r());
  return r;
}

// ---------- vectors and matrices (column-major 4×4) ----------
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  mad: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
export const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function matMul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
// model matrix from a translation, uniform scale and (optional) rotation about X
export function modelTRS(t, s = 1, rotX = 0, sy = s, sz = s) {
  const c = Math.cos(rotX), n = Math.sin(rotX);
  return new Float32Array([s, 0, 0, 0, 0, sy * c, sy * n, 0, 0, -sz * n, sz * c, 0, t[0], t[1], t[2], 1]);
}

// Build everything a shader needs to know about the camera.
// ox, oy shift the optical centre (in NDC) so the subject clears the UI panel.
export function makeView(eye, fwd, fovY, w, h, near, far, ox = 0, oy = 0) {
  const f = V.norm(fwd);
  let r = V.cross(f, [0, 1, 0]);
  if (V.len(r) < 1e-4) r = [1, 0, 0];
  r = V.norm(r);
  const u = V.cross(r, f);
  const p11 = 1 / Math.tan(fovY / 2), p00 = p11 * h / w;
  const view = new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0,
    -V.dot(r, eye), -V.dot(u, eye), V.dot(f, eye), 1]);
  const proj = new Float32Array(16);
  proj[0] = p00; proj[5] = p11; proj[8] = -ox; proj[9] = -oy;
  proj[10] = (far + near) / (near - far); proj[11] = -1; proj[14] = 2 * far * near / (near - far);
  const vp = matMul(proj, view);
  return { eye, r, u, f, p00, p11, ox, oy, vp, w, h, near, far };
}
// world point → CSS-pixel screen position (or null when behind the camera)
export function project(view, p, cssW, cssH) {
  const m = view.vp, x = p[0], y = p[1], z = p[2];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (cw < 1e-4) return null;
  const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw, cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw;
  return [(cx * 0.5 + 0.5) * cssW, (0.5 - cy * 0.5) * cssH, cw];
}

// ---------- GLSL shared by the full-screen ray shaders ----------
export const FS_VS = `#version 300 es
out vec2 v; void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2))*2.0-1.0; v = p; gl_Position = vec4(p,0.0,1.0); }`;
export const RAY_GLSL = `
uniform vec3 uEye, uR, uU, uF; uniform vec4 uProj; uniform mat4 uVP; uniform float uTime, uFade;
in vec2 v; layout(location=0) out vec4 o;
vec3 rayDir(){ return normalize(uF + uR*((v.x-uProj.z)/uProj.x) + uU*((v.y-uProj.w)/uProj.y)); }
float depthOf(vec3 P){ vec4 c = uVP*vec4(P,1.0); return clamp(c.z/c.w*0.5+0.5, 0.0, 1.0); }
`;
export const NOISE_GLSL = `
float hash1(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float hash3(vec3 p){ p = fract(p*0.3183099+vec3(.1,.2,.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x), mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x), mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03+vec3(1.7,9.2,3.1); a *= 0.5; } return s; }
`;

const LINE_VS = `#version 300 es
layout(location=0) in vec2 corner; layout(location=1) in vec3 A; layout(location=2) in vec3 B;
layout(location=3) in vec4 CA; layout(location=4) in vec4 CB; layout(location=5) in vec2 WS;
uniform mat4 uVP, uModel; uniform vec2 uRes; uniform float uPx;
out vec4 vC; out float vAcross, vS;
void main(){
  vec4 wa = uModel*vec4(A,1.0), wb = uModel*vec4(B,1.0);
  vec4 a = uVP*wa, b = uVP*wb;
  const float NW = 1e-4;
  if(a.w < NW && b.w < NW){ gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  float ta = 0.0, tb = 1.0;
  if(a.w < NW) ta = (NW-a.w)/(b.w-a.w);
  if(b.w < NW) tb = (NW-a.w)/(b.w-a.w);
  vec4 a2 = mix(a,b,ta), b2 = mix(a,b,tb);
  vec2 sa = a2.xy/a2.w*uRes*0.5, sb = b2.xy/b2.w*uRes*0.5;
  vec2 d = sb-sa; float L = length(d); d = L > 1e-5 ? d/L : vec2(1.0,0.0);
  vec2 nrm = vec2(-d.y, d.x);
  float hw = WS.x*uPx*0.5 + 1.0;
  vec4 p = mix(a2,b2,corner.x);
  vec2 s = mix(sa,sb,corner.x) + nrm*corner.y*hw + d*(corner.x*2.0-1.0)*hw*0.5;
  gl_Position = vec4(s/(uRes*0.5)*p.w, p.z, p.w);
  float tt = mix(ta,tb,corner.x);
  vC = mix(CA,CB,tt); vAcross = corner.y; vS = WS.y + tt*length(wb.xyz-wa.xyz);
}`;
const LINE_FS = `#version 300 es
precision highp float; in vec4 vC; in float vAcross, vS; uniform float uGain; uniform vec3 uDash; layout(location=0) out vec4 o;
void main(){
  float f = exp(-vAcross*vAcross*3.2);
  float a = vC.a*f*uGain;
  if(uDash.x > 0.0){ float m = fract((vS-uDash.y)/uDash.x); a *= smoothstep(1.0-uDash.z, 1.0, m)*smoothstep(1.0, 0.985, m)*1.6 + 0.10; }
  o = vec4(vC.rgb*a, 0.0);
}`;
const POINT_VS = `#version 300 es
layout(location=0) in vec2 corner; layout(location=1) in vec3 P; layout(location=2) in vec4 C; layout(location=3) in float S;
uniform mat4 uVP, uModel; uniform vec2 uRes; uniform float uPx, uMinPx, uP11;
out vec4 vC; out vec2 vUV;
void main(){
  vec4 c = uVP*uModel*vec4(P,1.0);
  if(c.w < 1e-4){ gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  float px = max(S*uP11*uRes.y*0.5/c.w, uMinPx*uPx);
  gl_Position = vec4(c.xy + corner*px/(uRes*0.5)*c.w, c.z, c.w);
  vC = C; vUV = corner;
}`;
const POINT_FS = `#version 300 es
precision highp float; in vec4 vC; in vec2 vUV; uniform float uGain; layout(location=0) out vec4 o;
void main(){
  float r2 = dot(vUV,vUV); if(r2 > 1.0) discard;
  float f = exp(-r2*7.0)*1.3 + pow(1.0-r2, 3.0)*0.25;
  o = vec4(vC.rgb*vC.a*f*uGain, 0.0);
}`;
const MESH_VS = `#version 300 es
layout(location=0) in vec3 P; layout(location=1) in vec3 N;
uniform mat4 uVP, uModel; out vec3 vN, vW;
void main(){ vec4 w = uModel*vec4(P,1.0); vW = w.xyz; vN = mat3(uModel)*N; gl_Position = uVP*w; }`;
const MESH_FS = `#version 300 es
precision highp float; in vec3 vN, vW; uniform vec3 uEye, uColor, uLight, uLightCol, uAmb; uniform float uFade; layout(location=0) out vec4 o;
void main(){
  vec3 n = normalize(vN), vd = normalize(uEye-vW);
  float d = max(dot(n,uLight),0.0);
  float rim = pow(1.0-max(dot(n,vd),0.0), 3.0);
  vec3 c = uColor*(uAmb + uLightCol*d) + uLightCol*rim*max(dot(n,uLight)*0.5+0.5,0.0)*0.35;
  o = vec4(c*uFade, 1.0);
}`;

const POST_BRIGHT = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D T; uniform vec2 uTexel; uniform float uThresh; layout(location=0) out vec4 o;
void main(){ vec2 uv = v*0.5+0.5;
  vec3 c = (texture(T, uv+uTexel*vec2(-1,-1)).rgb + texture(T, uv+uTexel*vec2(1,-1)).rgb + texture(T, uv+uTexel*vec2(-1,1)).rgb + texture(T, uv+uTexel*vec2(1,1)).rgb)*0.25;
  c = min(c, vec3(24.0));
  float l = max(c.r, max(c.g, c.b)); float k = max(l-uThresh, 0.0)/max(l, 1e-4);
  o = vec4(c*k, 1.0); }`;
const POST_BLUR = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D T; uniform vec2 uDir; layout(location=0) out vec4 o;
void main(){ vec2 uv = v*0.5+0.5;
  vec3 c = texture(T, uv).rgb*0.227027;
  c += (texture(T, uv+uDir*1.3846).rgb + texture(T, uv-uDir*1.3846).rgb)*0.316216;
  c += (texture(T, uv+uDir*3.2308).rgb + texture(T, uv-uDir*3.2308).rgb)*0.070270;
  o = vec4(c, 1.0); }`;
const POST_MIX = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D A, B; uniform float uT; layout(location=0) out vec4 o;
void main(){ vec2 uv = v*0.5+0.5; o = vec4(mix(texture(A,uv).rgb, texture(B,uv).rgb, uT), 1.0); }`;
const POST_FINAL = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D T, B1, B2, B3; uniform float uBloom, uTime, uExposure; uniform vec3 uStreak; layout(location=0) out vec4 o;
float h(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
void main(){ vec2 uv = v*0.5+0.5;
  vec3 c = texture(T, uv).rgb;
  if(uStreak.z > 0.001){      // a radial smear toward the point being zoomed into, during the move between scales
    float j = h(gl_FragCoord.xy + 3.7); c = vec3(0.0);
    for(int i=0;i<12;i++) c += texture(T, mix(uv, uStreak.xy, (float(i)+j)/12.0*uStreak.z)).rgb;
    c /= 12.0;
  }
  c += uBloom*(texture(B1, uv).rgb*0.55 + texture(B2, uv).rgb*0.5 + texture(B3, uv).rgb*0.6);
  c *= uExposure;
  c *= 1.0 - 0.28*pow(length(v*vec2(0.9,0.8)), 2.4);
  c = clamp((c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14), 0.0, 1.0);
  c = pow(c, vec3(1.0/2.2));
  c += (h(gl_FragCoord.xy + fract(uTime)*91.7)-0.5)/255.0;
  o = vec4(c, 1.0); }`;

function compile(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      throw new Error(`Shader compile failed:\n${log}\n` + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link failed: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

// A growable instance buffer with a fixed attribute layout.
class Batch {
  constructor(gl, corners, layout) {
    this.gl = gl; this.stride = layout.reduce((a, b) => a + b, 0);
    this.data = new Float32Array(this.stride * 4096); this.n = 0; this.cap = 0;
    this.buf = gl.createBuffer();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    let off = 0;
    layout.forEach((size, i) => {
      gl.enableVertexAttribArray(i + 1);
      gl.vertexAttribPointer(i + 1, size, gl.FLOAT, false, this.stride * 4, off * 4);
      gl.vertexAttribDivisor(i + 1, 1); off += size;
    });
    gl.bindVertexArray(null);
  }
  reserve(extra) {
    const need = (this.n + extra) * this.stride;
    if (need > this.data.length) { const d = new Float32Array(Math.max(need, this.data.length * 2)); d.set(this.data); this.data = d; }
  }
  upload() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (this.data.length > this.cap) { gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW); this.cap = this.data.length; }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * this.stride);
  }
}

export function createEngine(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const hdr = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
  const IFMT = hdr ? gl.RGBA16F : gl.RGBA8, TYPE = hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  const lineCorners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, lineCorners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const quadCorners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadCorners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const progLine = compile(gl, LINE_VS, LINE_FS), progPoint = compile(gl, POINT_VS, POINT_FS), progMesh = compile(gl, MESH_VS, MESH_FS);
  const pBright = compile(gl, FS_VS, POST_BRIGHT), pBlur = compile(gl, FS_VS, POST_BLUR), pMix = compile(gl, FS_VS, POST_MIX), pFinal = compile(gl, FS_VS, POST_FINAL);
  const emptyVAO = gl.createVertexArray();

  const mkTarget = (depth) => ({ fb: gl.createFramebuffer(), tex: gl.createTexture(), rb: depth ? gl.createRenderbuffer() : null, w: 0, h: 0 });
  const sizeTarget = (t, w, h) => {
    if (t.w === w && t.h === h) return;
    t.w = w; t.h = h;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, IFMT, w, h, 0, gl.RGBA, TYPE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    if (t.rb) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, t.rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.rb);
    }
  };
  const scene = [mkTarget(true), mkTarget(true)], mixT = mkTarget(false);
  const bloom = [0, 1, 2].map(() => [mkTarget(false), mkTarget(false)]);

  const R = {
    gl, hdr, canvas, W: 1, H: 1, px: 1, view: null, fade: 1,
    lines: new Batch(gl, lineCorners, [3, 3, 4, 4, 2]),
    points: new Batch(gl, quadCorners, [3, 4, 1]),
    compile: (vs, fs) => compile(gl, vs, fs),
    // a full-screen ray shader: `body` supplies void main() and may use rayDir(), depthOf()
    rayProgram(body) { return compile(gl, FS_VS, '#version 300 es\nprecision highp float;\n' + RAY_GLSL + NOISE_GLSL + body); },

    resize(cssW, cssH, dpr, scale) {
      const w = Math.max(2, Math.round(cssW * dpr * scale)), h = Math.max(2, Math.round(cssH * dpr * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      R.W = w; R.H = h; R.px = dpr * scale;
      scene.forEach(t => sizeTarget(t, w, h)); sizeTarget(mixT, w, h);
      bloom.forEach((lv, i) => lv.forEach(t => sizeTarget(t, Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1)))));
    },
    begin(slot, view, fade) {
      R.view = view; R.fade = fade;
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene[slot].fb);
      gl.viewport(0, 0, R.W, R.H);
      gl.depthMask(true); gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      R.lines.n = 0; R.points.n = 0;
    },
    setRayUniforms(prog, time) {
      const u = prog.u, v = R.view;
      gl.uniform3fv(u.uEye, v.eye); gl.uniform3fv(u.uR, v.r); gl.uniform3fv(u.uU, v.u); gl.uniform3fv(u.uF, v.f);
      gl.uniform4f(u.uProj, v.p00, v.p11, v.ox, v.oy); gl.uniformMatrix4fv(u.uVP, false, v.vp);
      if (u.uTime) gl.uniform1f(u.uTime, time); if (u.uFade) gl.uniform1f(u.uFade, R.fade);
    },
    // Draw a full-screen pass. mode: 'opaque' writes colour and depth; 'add' blends additively and tests depth.
    fullscreen(prog, mode = 'opaque') {
      if (mode === 'opaque') { gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.ALWAYS); gl.depthMask(true); }
      else { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); }
      gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthFunc(gl.LEQUAL);
    },
    // ---- glowing lines ----
    seg(a, b, c, alpha = 1, w = 2, alphaB = alpha, s0 = 0, cB = c) {
      const L = R.lines; L.reserve(1);
      const d = L.data, o = L.n++ * 16;
      d[o] = a[0]; d[o + 1] = a[1]; d[o + 2] = a[2]; d[o + 3] = b[0]; d[o + 4] = b[1]; d[o + 5] = b[2];
      d[o + 6] = c[0]; d[o + 7] = c[1]; d[o + 8] = c[2]; d[o + 9] = alpha;
      d[o + 10] = cB[0]; d[o + 11] = cB[1]; d[o + 12] = cB[2]; d[o + 13] = alphaB; d[o + 14] = w; d[o + 15] = s0;
    },
    polyline(pts, c, alpha = 1, w = 2) { for (let i = 0; i + 1 < pts.length; i++) R.seg(pts[i], pts[i + 1], c, alpha, w); },
    arc(center, e1, e2, radius, a0, a1, c, alpha = 1, w = 2, n = 32) {
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = a0 + (a1 - a0) * i / n, p = V.mad(V.mad(center, e1, Math.cos(t) * radius), e2, Math.sin(t) * radius);
        if (prev) R.seg(prev, p, c, alpha, w); prev = p;
      }
    },
    flushLines(opts = {}) {
      const L = R.lines; if (!L.n) return;
      const u = progLine.u; gl.useProgram(progLine.p);
      gl.uniformMatrix4fv(u.uVP, false, R.view.vp); gl.uniformMatrix4fv(u.uModel, false, opts.model || IDENT);
      gl.uniform2f(u.uRes, R.W, R.H); gl.uniform1f(u.uPx, R.px); gl.uniform1f(u.uGain, (opts.gain ?? 1) * R.fade);
      const d = opts.dash || [0, 0, 0]; gl.uniform3f(u.uDash, d[0], d[1], d[2]);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      if (opts.depth === false) gl.disable(gl.DEPTH_TEST); else { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); }
      L.upload(); gl.bindVertexArray(L.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, L.n);
      if (!opts.keep) L.n = 0;
    },
    // ---- glowing points ----
    pt(p, c, alpha = 1, size = 0.05) {
      const P = R.points; P.reserve(1);
      const d = P.data, o = P.n++ * 8;
      d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = c[0]; d[o + 4] = c[1]; d[o + 5] = c[2]; d[o + 6] = alpha; d[o + 7] = size;
    },
    flushPoints(opts = {}) {
      const P = R.points; if (!P.n) return;
      const u = progPoint.u; gl.useProgram(progPoint.p);
      gl.uniformMatrix4fv(u.uVP, false, R.view.vp); gl.uniformMatrix4fv(u.uModel, false, opts.model || IDENT);
      gl.uniform2f(u.uRes, R.W, R.H); gl.uniform1f(u.uPx, R.px); gl.uniform1f(u.uGain, (opts.gain ?? 1) * R.fade);
      gl.uniform1f(u.uMinPx, opts.minPx ?? 1.2); gl.uniform1f(u.uP11, R.view.p11);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      if (opts.depth === false) gl.disable(gl.DEPTH_TEST); else { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); }
      P.upload(); gl.bindVertexArray(P.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, P.n);
      if (!opts.keep) P.n = 0;
    },
    // ---- lit meshes ----
    mesh(pos, idx) {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      const e = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, e); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, n: idx.length };
    },
    drawMesh(m, model, color, light, lightCol = [1, 1, 1], amb = [0.1, 0.1, 0.12]) {
      const u = progMesh.u; gl.useProgram(progMesh.p);
      gl.uniformMatrix4fv(u.uVP, false, R.view.vp); gl.uniformMatrix4fv(u.uModel, false, model);
      gl.uniform3fv(u.uEye, R.view.eye); gl.uniform3fv(u.uColor, color); gl.uniform3fv(u.uLight, light);
      gl.uniform3fv(u.uLightCol, lightCol); gl.uniform3fv(u.uAmb, amb); gl.uniform1f(u.uFade, R.fade);
      gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
      gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
    },
    // ---- post: (optional cross-fade) → bloom → tone map ----
    present(mixAmount, time, bloomAmt = 1, exposure = 1, streak = 0) {
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(false);
      gl.bindVertexArray(emptyVAO);
      let src = scene[0];
      const bind = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); };
      if (mixAmount > 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, mixT.fb); gl.viewport(0, 0, R.W, R.H);
        gl.useProgram(pMix.p); bind(0, scene[0]); bind(1, scene[1]);
        gl.uniform1i(pMix.u.A, 0); gl.uniform1i(pMix.u.B, 1); gl.uniform1f(pMix.u.uT, mixAmount);
        gl.drawArrays(gl.TRIANGLES, 0, 3); src = mixT;
      }
      let from = src;
      for (let i = 0; i < 3; i++) {
        const [a, b] = bloom[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb); gl.viewport(0, 0, a.w, a.h);
        gl.useProgram(pBright.p); bind(0, from); gl.uniform1i(pBright.u.T, 0);
        gl.uniform2f(pBright.u.uTexel, 0.5 / from.w, 0.5 / from.h); gl.uniform1f(pBright.u.uThresh, i === 0 ? 0.55 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.useProgram(pBlur.p); gl.uniform1i(pBlur.u.T, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); bind(0, a); gl.uniform2f(pBlur.u.uDir, 1 / a.w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb); bind(0, b); gl.uniform2f(pBlur.u.uDir, 0, 1 / a.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
        from = a;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, R.W, R.H);
      gl.useProgram(pFinal.p);
      bind(0, src); bind(1, bloom[0][0]); bind(2, bloom[1][0]); bind(3, bloom[2][0]);
      gl.uniform1i(pFinal.u.T, 0); gl.uniform1i(pFinal.u.B1, 1); gl.uniform1i(pFinal.u.B2, 2); gl.uniform1i(pFinal.u.B3, 3);
      gl.uniform1f(pFinal.u.uBloom, bloomAmt); gl.uniform1f(pFinal.u.uTime, time); gl.uniform1f(pFinal.u.uExposure, exposure);
      gl.uniform3f(pFinal.u.uStreak, 0.5 + (R.view ? R.view.ox : 0) * 0.5, 0.5 + (R.view ? R.view.oy : 0) * 0.5, streak);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    },
  };
  return R;
}

// ---------- meshes ----------
export function sphereMesh(seg = 20, ring = 14) {
  const pos = [], idx = [];
  for (let j = 0; j <= ring; j++) for (let i = 0; i <= seg; i++) {
    const t = j / ring * Math.PI, p = i / seg * 2 * Math.PI;
    const x = Math.sin(t) * Math.cos(p), y = Math.cos(t), z = Math.sin(t) * Math.sin(p);
    pos.push(x, y, z, x, y, z);
  }
  for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return [new Float32Array(pos), new Uint16Array(idx)];
}
// a body of revolution about Y from a profile of [radius, y] pairs
export function latheMesh(profile, seg = 18) {
  const pos = [], idx = [], n = profile.length;
  for (let j = 0; j < n; j++) {
    const [r, y] = profile[j];
    const a = profile[Math.max(0, j - 1)], b = profile[Math.min(n - 1, j + 1)];
    let nr = b[1] - a[1], ny = -(b[0] - a[0]); const l = Math.hypot(nr, ny) || 1; nr /= l; ny /= l;
    for (let i = 0; i <= seg; i++) {
      const p = i / seg * 2 * Math.PI, c = Math.cos(p), s = Math.sin(p);
      pos.push(r * c, y, r * s, nr * c, ny, nr * s);
    }
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return [new Float32Array(pos), new Uint16Array(idx)];
}
