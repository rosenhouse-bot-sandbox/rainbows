// Small WebGL2 helpers and the handful of matrix routines the scene needs.
export function program(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      throw new Error(`Shader compile failed:\n${log}\n${lines}`);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link failed: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

// A VAO for instanced quads: location 0 is the shared corner buffer, the rest are per instance.
export function instancedVAO(gl, corners, buf, layout, stride) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  let off = 0;
  layout.forEach((size, i) => {
    gl.enableVertexAttribArray(i + 1);
    gl.vertexAttribPointer(i + 1, size, gl.FLOAT, false, stride * 4, off * 4);
    gl.vertexAttribDivisor(i + 1, 1);
    off += size;
  });
  gl.bindVertexArray(null);
  return vao;
}

export function perspective(out, p00, p11, near, far, ox, oy) {
  out.fill(0);
  out[0] = p00; out[5] = p11;
  out[8] = -ox; out[9] = -oy;            // shifts the optical centre so the subject clears the UI
  out[10] = (far + near) / (near - far); out[11] = -1;
  out[14] = 2 * far * near / (near - far);
  return out;
}

export function lookAt(out, eye, tgt, basis) {
  let fx = tgt[0] - eye[0], fy = tgt[1] - eye[1], fz = tgt[2] - eye[2];
  let l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
  let rx = -fz, ry = 0, rz = fx;         // f × (0,1,0)
  l = Math.hypot(rx, rz) || 1; rx /= l; rz /= l;
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  out[0] = rx; out[4] = ry; out[8] = rz; out[12] = -(rx * eye[0] + ry * eye[1] + rz * eye[2]);
  out[1] = ux; out[5] = uy; out[9] = uz; out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  out[2] = -fx; out[6] = -fy; out[10] = -fz; out[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];
  out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
  basis.r = [rx, ry, rz]; basis.u = [ux, uy, uz]; basis.f = [fx, fy, fz];
  return out;
}

// Deterministic random numbers so the scene is the same on every visit.
export function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.gauss = () => Math.sqrt(-2 * Math.log(1 - r() + 1e-12)) * Math.cos(6.283185307 * r());
  return r;
}
export const sstep = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
export const lerp = (a, b, t) => a + (b - a) * t;
