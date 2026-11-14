// Small WebGL2 helpers, a few solid shapes, and the vector and rotation routines the page needs.
// Positions and rotations are worked out in JavaScript numbers (64-bit) and only handed to the
// graphics card at the end, because the page spans from metres down to a tenth of a nanometre.

export function program(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader did not compile: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Shaders did not link: ' + gl.getProgramInfoLog(p));
  const u = {};
  for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

// A shape drawn many times. mesh: { pos: Float32Array (xyz), nor: Float32Array, idx: Uint16Array }.
// layout: sizes of the per-copy numbers, which go to attribute locations 2, 3, ...
export function instanced(gl, mesh, layout) {
  const vao = gl.createVertexArray(), stride = layout.reduce((a, b) => a + b, 0);
  gl.bindVertexArray(vao);
  const put = (loc, data, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
  put(0, mesh.pos, 3); put(1, mesh.nor, 3);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  let off = 0;
  layout.forEach((size, i) => { gl.enableVertexAttribArray(i + 2); gl.vertexAttribPointer(i + 2, size, gl.FLOAT, false, stride * 4, off * 4); gl.vertexAttribDivisor(i + 2, 1); off += size; });
  gl.bindVertexArray(null);
  const o = { vao, buf, stride, count: 0, n: mesh.idx.length,
    set(data, usage = gl.STATIC_DRAW) { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, usage); o.count = data.length / stride; },
    draw(first = 0, count = o.count - first) { if (count <= 0) return; gl.bindVertexArray(vao); if (first) throw new Error('first'); gl.drawElementsInstanced(gl.TRIANGLES, o.n, gl.UNSIGNED_SHORT, 0, count); } };
  return o;
}

// ---- shapes: all centred on the origin, of unit size --------------------------------------------
function finish(P, N, I) { return { pos: new Float32Array(P), nor: new Float32Array(N), idx: new Uint16Array(I) }; }
// A ball of radius 1, from an octahedron split `n` times.
export function ball(n = 2) {
  let V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], F = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  for (let k = 0; k < n; k++) {
    const mid = new Map(), F2 = [];
    const m = (a, b) => { const key = a < b ? a * 65536 + b : b * 65536 + a; if (!mid.has(key)) { const v = [V[a][0] + V[b][0], V[a][1] + V[b][1], V[a][2] + V[b][2]], l = Math.hypot(...v); mid.set(key, V.push(v.map((x) => x / l)) - 1); } return mid.get(key); };
    for (const [a, b, c] of F) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); F2.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
    F = F2;
  }
  return finish(V.flat(), V.flat(), F.flat());
}
// A tube along z from -1 to 1, radius 1, with flat ends. The shader may taper it and round it.
export function tube(sides = 10, rings = 1, caps = true) {
  const P = [], N = [], I = [];
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= sides; i++) { const a = i / sides * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a); P.push(c, s, -1 + 2 * j / rings); N.push(c, s, 0); }
  for (let j = 0; j < rings; j++) for (let i = 0; i < sides; i++) { const a = j * (sides + 1) + i, b = a + sides + 1; I.push(a, a + 1, b, b, a + 1, b + 1); }
  if (caps) for (const z of [-1, 1]) {
    const c0 = P.length / 3; P.push(0, 0, z); N.push(0, 0, z);
    for (let i = 0; i <= sides; i++) { const a = i / sides * 2 * Math.PI; P.push(Math.cos(a), Math.sin(a), z); N.push(0, 0, z); }
    for (let i = 0; i < sides; i++) z > 0 ? I.push(c0, c0 + 1 + i, c0 + 2 + i) : I.push(c0, c0 + 2 + i, c0 + 1 + i);
  }
  return finish(P, N, I);
}
// A box from -1 to 1 with flat faces.
export function box() {
  const P = [], N = [], I = [];
  for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3, b = P.length / 3;
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = [0, 0, 0]; p[ax] = s; p[u] = a * s; p[v] = c; P.push(...p); const n = [0, 0, 0]; n[ax] = s; N.push(...n); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return finish(P, N, I);
}
// A flat square in the xy plane from -1 to 1, facing +z.
export function square() { return finish([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], [0, 1, 2, 0, 2, 3]); }

// ---- vectors and rotations ----------------------------------------------------------------------
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// A rotation as a quaternion [x, y, z, w].
export function quatOf(x, y, z) {                           // from three unit axes at right angles: where the shape's x, y and z point
  const t = x[0] + y[1] + z[2]; let q;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; q = [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4]; }
  else if (x[0] > y[1] && x[0] > z[2]) { const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2; q = [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]; }
  else if (y[1] > z[2]) { const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2; q = [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s]; }
  else { const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2; q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s]; }
  return q;
}
export function qmul(a, b) { return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; }
export const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qaxis(axis, angle) { const s = Math.sin(angle / 2), a = unit(axis); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)]; }
export function qrot(q, v) { const [x, y, z, w] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]); return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx]; }
export function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const s = d < 0 ? -1 : 1; d = Math.abs(d);
  let ka = 1 - t, kb = t;
  if (d < 0.9995) { const th = Math.acos(d), sn = Math.sin(th); ka = Math.sin((1 - t) * th) / sn; kb = Math.sin(t * th) / sn; }
  const q = [ka * a[0] + s * kb * b[0], ka * a[1] + s * kb * b[1], ka * a[2] + s * kb * b[2], ka * a[3] + s * kb * b[3]], l = Math.hypot(...q);
  return q.map((x) => x / l);
}
// the rotation that turns z to point along `d`
export function qalong(d) { const z = unit(d), h = Math.abs(z[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0], x = unit(cross(h, z)); return quatOf(x, cross(z, x), z); }

export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
