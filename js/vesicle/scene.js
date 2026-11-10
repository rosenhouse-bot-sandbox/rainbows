// Builds and draws the synapse: lipids, proteins, transmitter and the hazy surroundings.
// Units are nanometres. y points into the sending cell; the cleft is below y = 0.
import { program, instancedVAO, rng, sstep, lerp } from './glx.js';
import { compute, surf, D, CLEFT, TABW, BAREA, PH } from './profile.js';
import * as SH from './shaders.js';

const PI = Math.PI, TAU = 2 * PI;
export const PATCH = 120;            // radius of membrane drawn lipid by lipid
const LIPID_AREA = 0.68;             // nm^2 per lipid in a fluid bilayer
const GLU_PER_NM3 = 0.0903;          // 150 mM glutamate
const NT_MAX = 26000, BALL_MAX = 9000;
export const CUT_CENTRE = PI / 2;

export const COLORS = {
  vesicle: [0.97, 0.69, 0.30], vesicleIn: [0.94, 0.53, 0.22],
  plasma: [0.34, 0.57, 0.88], plasmaOut: [0.29, 0.49, 0.80],
  post: [0.52, 0.47, 0.70], postIn: [0.44, 0.39, 0.61],
  syntaxin: [0.92, 0.26, 0.28], snap25: [0.33, 0.80, 0.42], synaptobrevin: [0.36, 0.33, 1.0],
  synaptotagmin: [0.72, 0.48, 0.96], calcium: [1.0, 0.90, 0.28], glutamate: [1.0, 0.36, 0.74],
  channel: [0.86, 0.70, 0.34], ampa: [0.20, 0.72, 0.66], nmda: [0.86, 0.50, 0.30],
  sodium: [0.62, 0.92, 1.0], adhesion: [0.62, 0.62, 0.74],
};

const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const mixv = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const erfc = (x) => { const t = 1 / (1 + 0.3275911 * x); return t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x); };
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

export class Scene {
  constructor(gl) {
    this.gl = gl;
    this.P = {
      head: program(gl, SH.lipidHeadVS, SH.sphereFS), tail: program(gl, SH.tailVS, SH.tailFS),
      ball: program(gl, SH.ballVS, SH.sphereFS), ballHalo: program(gl, SH.ballVS, SH.haloFS),
      nt: program(gl, SH.transmitterVS, SH.sphereFS), ntHalo: program(gl, SH.transmitterVS, SH.haloFS),
      sheet: program(gl, SH.sheetVS, SH.sheetFS), sky: program(gl, SH.skyVS, SH.skyFS),
    };
    this.corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.tabTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tabTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TABW, 4, 0, gl.RGBA, gl.FLOAT, null);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    const mk = (layout, stride) => { const b = gl.createBuffer(); return { b, vao: instancedVAO(gl, this.corners, b, layout, stride), n: 0 }; };
    this.ves = mk([4, 3], 7); this.sheetLipids = mk([4, 3], 7);
    this.nt = mk([3, 4], 7); this.scenery = mk([4, 4], 8); this.dyn = mk([4, 4], 8);
    this.dynData = new Float32Array(BALL_MAX * 8);
    this.emptyVAO = gl.createVertexArray();
    this.S = null; this.key = ''; this.labels = [];
    this.buildProteins(); this.buildScenery(); this.buildSheets(); this.buildTransmitter();
  }

  // ---- static geometry -------------------------------------------------------------------------
  setQuality(q) {
    this.q = q;
    const area = LIPID_AREA / q, gl = this.gl, r = rng(7);
    this.spacing = Math.sqrt(2 * area / Math.sqrt(3));
    this.headR = this.spacing * 0.53;
    const out = [];
    const hex = (kind, leaf, s, radius, scale) => {
      const dz = s * Math.sqrt(3) / 2, nj = Math.ceil(radius / dz), ni = Math.ceil(radius / s) + 1;
      const ox = r() * s, oz = r() * dz;
      for (let j = -nj; j <= nj; j++) for (let i = -ni; i <= ni; i++) {
        const x = (i + 0.5 * (j & 1)) * s + ox + (r() - 0.5) * s * 0.34, z = j * dz + oz + (r() - 0.5) * s * 0.34;
        if (x * x + z * z > radius * radius) continue;
        out.push(x, z, r.gauss(), r.gauss(), r(), kind + 4 * leaf, scale);
      }
    };
    hex(1, 0, this.spacing, PATCH + 3, 1); hex(1, 1, this.spacing, PATCH + 3, 1);
    const coarse = 1.3;                 // the far membrane is drawn with fewer, larger headgroups
    hex(2, 0, this.spacing * coarse, PATCH, coarse); hex(2, 1, this.spacing * coarse, PATCH, coarse);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sheetLipids.b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
    this.sheetLipids.n = out.length / 7;
    this.vesR = -1; this.key = '';
  }

  buildVesicle(R) {
    const gl = this.gl, r = rng(11), out = [], area = LIPID_AREA / this.q;
    for (let leaf = 0; leaf < 2; leaf++) {
      const Rl = R + (leaf ? -D : D), n = Math.round(4 * PI * Rl * Rl / area), g = PI * (3 - Math.sqrt(5)) * (leaf ? 1 : -1);
      for (let i = 0; i < n; i++) {
        const u = Math.sqrt((i + 0.5) / n), ph = i * g + leaf;
        out.push(u * Math.cos(ph), u * Math.sin(ph), r.gauss(), r.gauss(), r(), 4 * leaf, 1);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ves.b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW);
    this.ves.n = out.length / 7; this.vesR = R;
  }

  buildTransmitter() {
    const gl = this.gl, r = rng(23), d = new Float32Array(NT_MAX * 7);
    for (let i = 0; i < NT_MAX; i++) {
      let x, y, z;
      do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1);
      d.set([x, y, z, r(), r.gauss(), r.gauss(), r()], i * 7);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nt.b);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
  }

  buildSheets() {
    const gl = this.gl, rings = [PATCH - 14, PATCH, 150, 200, 280, 420, 700, 1300, 2600, 5000], seg = 72, v = [];
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, r0 = rings[k], r1 = rings[k + 1];
      const p = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
      v.push(...p(r0, a0), ...p(r1, a0), ...p(r1, a1), ...p(r0, a0), ...p(r1, a1), ...p(r0, a1));
    }
    this.sheetVAO = gl.createVertexArray();
    gl.bindVertexArray(this.sheetVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.sheetN = v.length / 2;
  }

  // Fixed cast of proteins. Angles are chosen so some sit on each side of the default cutaway.
  buildProteins() {
    const r = rng(5);
    this.snares = []; this.syts = [];
    for (let k = 0; k < 6; k++) {
      this.snares.push({ phi: CUT_CENTRE + PI / 6 + k * PI / 3 + (r() - 0.5) * 0.16, dphi: (r() - 0.5) * 2.2, rOut: 22 + r() * 46, yaw: (r() - 0.5) * 4.5 });
      this.syts.push({ phi: CUT_CENTRE + k * PI / 3 + (r() - 0.5) * 0.2 + PI / 3, dphi: (r() - 0.5) * 2, rOut: 12 + r() * 40 });
    }
    this.channels = [{ phi: 3.55, r: 30 }, { phi: 5.9, r: 37 }, { phi: 1.75, r: 44 }];
    this.receptors = [];
    let guard = 0;
    while (this.receptors.length < 19 && guard++ < 4000) {
      const rr = 72 * Math.sqrt(r()), a = r() * TAU, x = rr * Math.cos(a), z = rr * Math.sin(a);
      if (this.receptors.some(o => Math.hypot(o.x - x, o.z - z) < 11.5)) continue;
      this.receptors.push({ x, z, rot: r() * PI, nmda: this.receptors.length % 5 === 4, r: rr });
    }
    this.links = [];
    for (let i = 0; i < 12; i++) { const a = r() * TAU, rr = 48 + r() * 60; this.links.push({ a, r: rr, bend: (r() - 0.5) * 3, ph: r() * 9 }); }
  }

  buildScenery() {
    const gl = this.gl, r = rng(3), out = [];
    const ball = (x, y, z, rad, c, style) => out.push(x, y, z, rad, c[0], c[1], c[2], style);
    const amber = [0.80, 0.58, 0.30];
    // Reserve pool of vesicles, and a few more docked along the active zone.
    const ves = []; this.reserve = null;
    let guard = 0;
    while (ves.length < 230 && guard++ < 40000) {
      const a = r() * TAU, rr = 520 * Math.sqrt(r()), y = 62 + 480 * Math.pow(r(), 1.25), rad = 19 + r() * 5;
      const p = [rr * Math.cos(a), y, rr * Math.sin(a)];
      if (Math.hypot(p[0], p[1] - 10, p[2]) < 98) continue;
      if (ves.some(v => Math.hypot(v[0] - p[0], v[1] - p[1], v[2] - p[2]) < v[3] + rad + 5)) continue;
      ves.push([...p, rad]);
      if (!this.reserve && p[2] < -90 && y > 110 && y < 190 && Math.abs(p[0]) < 120) this.reserve = [p[0], p[1] + rad, p[2]];
    }
    for (const [a, rr] of [[0.5, 104], [2.5, 150], [4.3, 118], [5.6, 205], [3.4, 255], [1.3, 290]]) {
      const rad = 20 + r() * 3; ves.push([rr * Math.cos(a), rad + D + 3.5, rr * Math.sin(a), rad]);
    }
    for (const v of ves) ball(v[0], v[1], v[2], v[3], shade(amber, 0.85 + 0.3 * r()), 2);
    this.reserve = this.reserve || [ves[0][0], ves[0][1] + ves[0][3], ves[0][2]];
    // A mitochondrion far behind: the terminal's power supply.
    const m0 = [-330, 430, -520], m1 = [300, 360, -640];
    for (let i = 0; i <= 26; i++) { const p = mixv(m0, m1, i / 26); ball(p[0], p[1] + Math.sin(i * 0.5) * 14, p[2], 118 + 10 * Math.sin(i * 0.9), [0.62, 0.30, 0.34], 3); }
    this.mito = [-60, 520, -570];
    // Microtubules and actin filaments.
    const chain = (a, b, rad, step, c, style, wob) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.ceil(len / step);
      for (let i = 0; i <= n; i++) { const p = mixv(a, b, i / n); ball(p[0] + Math.sin(i * 0.11) * wob, p[1] + Math.cos(i * 0.07) * wob, p[2], rad, c, style); }
    };
    chain([-760, 300, -250], [720, 215, -430], 12.5, 9, [0.42, 0.62, 0.60], 0, 10);
    chain([-640, 470, 180], [560, 590, -180], 12.5, 9, [0.42, 0.62, 0.60], 0, 14);
    for (let i = 0; i < 12; i++) {
      const a = r() * TAU, rr = 150 + r() * 330, p = [rr * Math.cos(a), 60 + r() * 300, rr * Math.sin(a)];
      const dir = norm([r() - 0.5, (r() - 0.5) * 0.8, r() - 0.5]), len = 140 + r() * 220;
      chain(p, add(p, dir, len), 3.6, 4.2, [0.78, 0.44, 0.46], 0, 3);
    }
    // Postsynaptic density: the scaffold that holds receptors under the release site.
    for (let i = 0; i < 1100; i++) {
      const a = r() * TAU, rr = 190 * Math.sqrt(r()), dep = Math.pow(r(), 1.6);
      ball(rr * Math.cos(a), -CLEFT - D - 3.2 - dep * 34, rr * Math.sin(a), 1.9 + r() * 2.6, shade([0.60, 0.42, 0.62], 0.75 + 0.4 * r()), 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.scenery.b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
    this.scenery.n = out.length / 8;
  }

  // ---- per-frame state -------------------------------------------------------------------------
  update(st, time) {
    const gl = this.gl, R = st.diam / 2 - 2.4, key = st.p.toFixed(5) + '|' + R;
    if (this.vesR !== R) this.buildVesicle(R);
    if (key !== this.key) {
      this.S = compute(st.p, R, this.S && this.S.tab);
      gl.bindTexture(gl.TEXTURE_2D, this.tabTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TABW, 4, gl.RGBA, gl.FLOAT, this.S.tab);
      this.key = key;
    }
    const S = this.S, p = st.p;
    S.hV = S.h + (S.fused[0] ? 0 : S.extra);
    S.Rin = R - D - 0.9;
    this.glutamate = Math.round(GLU_PER_NM3 * 4 / 3 * PI * Math.pow(S.Rin, 3));
    const half = st.cut * PI / 360;
    const kept = (x, z) => half < 0.002 || Math.abs(((Math.atan2(z, x) - CUT_CENTRE + PI) % TAU + TAU) % TAU - PI) >= half;

    const d = this.dynData; let n = 0;
    const ball = (q, rad, c, style = 0) => { if (n >= BALL_MAX) return; const k = n++ * 8; d[k] = q[0]; d[k + 1] = q[1]; d[k + 2] = q[2]; d[k + 3] = rad; d[k + 4] = c[0]; d[k + 5] = c[1]; d[k + 6] = c[2]; d[k + 7] = style; };
    const tmp = new Float64Array(6);
    const at = (leaf, a, phi) => { surf(S, leaf, a, phi, tmp); return { p: [tmp[0], tmp[1], tmp[2]], n: [tmp[3], tmp[4], tmp[5]] }; };
    const strand = (a, b, steps, rad, c) => { for (let i = 0; i <= steps; i++) ball(mixv(a, b, i / steps), rad, c); };
    const Av = S.Av[0], C = COLORS;
    const anchors = {};

    // SNARE complexes. Syntaxin (red) and SNAP-25 (green) belong to the plasma membrane,
    // synaptobrevin (blue) to the vesicle. Zipping the four helices from their far ends toward
    // the membrane anchors is what drags the two bilayers together.
    const Lb = 11.5, zip = lerp(0.42, 1, sstep(0.02, PH.STALK + 0.02, p));
    const wCis = sstep(PH.PORE + 0.02, 0.6, p), wOut = sstep(0.56, 1, p), wJoin = sstep(PH.PORE, 0.56, p);
    this.snares.forEach((sn) => {
      const phi = sn.phi + sn.dphi * wOut;
      const rs = lerp(9, 5.5, sstep(0, PH.STALK, p)) + sn.rOut * Math.pow(wOut, 1.4);
      const sb = lerp(10, 5.5, sstep(0, PH.STALK, p));
      const aS = Av + PI * rs * rs, dphi = 0.9 / Math.max(rs, 3);
      const Sx = at(0, aS, phi + dphi * wJoin), B = at(0, lerp(Av - PI * sb * sb, aS, wJoin), phi - dphi * wJoin);
      if (!kept(Sx.p[0], Sx.p[2])) return;
      const er = [Math.cos(phi), 0, Math.sin(phi)], et = [-Math.sin(phi), 0, Math.cos(phi)];
      // Before fusion the bundle lies in the wedge between the membranes; afterwards it rests on one.
      const M = mixv(Sx.p, B.p, 0.5), rM = Math.hypot(M[0], M[2]), r2 = rM + 7;
      const vy = S.hV - Math.sqrt(Math.max(0, (S.Rc + D) * (S.Rc + D) - r2 * r2));
      const dirT = norm(add(add([0, 0, 0], er, 7), [0, 1, 0], (Math.max(vy, D + 3) + D) / 2 - M[1]));
      const S2 = at(0, Av + PI * (rs + Lb) * (rs + Lb), phi);
      const Q1 = add(Sx.p, Sx.n, 2.5), Q2 = add(S2.p, S2.n, 2.5);
      let dir = norm(mixv(dirT, norm(add(Q2, Q1, -1)), wCis));
      const yaw = sn.yaw * sstep(0.62, 0.96, p);
      if (yaw) { const c = Math.cos(yaw), s = Math.sin(yaw), k = Sx.n, kx = cross(k, dir), kd = k[0] * dir[0] + k[1] * dir[1] + k[2] * dir[2]; dir = norm([dir[0] * c + kx[0] * s + k[0] * kd * (1 - c), dir[1] * c + kx[1] * s + k[1] * kd * (1 - c), dir[2] * c + kx[2] * s + k[2] * kd * (1 - c)]); }
      const C0 = mixv(add(M, er, 1.2), Q1, wCis);
      const e1 = norm(cross(dir, Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(dir, e1);
      const cols = [C.syntaxin, C.snap25, C.synaptobrevin, C.snap25];
      const ends = [add(Sx.p, Sx.n, 1.2), add(add(Sx.p, Sx.n, 2.1), et, 1.4), add(B.p, B.n, 1.2), add(add(Sx.p, Sx.n, 2.1), et, -1.4)];
      const bundle = (j, s) => { const ang = j * PI / 2 - 1.3 * s + sn.phi * 3; return add(add(add(C0, dir, Lb * (1 - s)), e1, 0.78 * Math.cos(ang)), e2, 0.78 * Math.sin(ang)); };
      const tips = [], heads = [];
      for (let j = 0; j < 4; j++) {
        const end = bundle(j, 1), off = add(ends[j], end, -1);
        heads.push(bundle(j, 0));
        for (let i = 0; i <= 27; i++) {
          const s = i / 27; let q = bundle(j, s), rad = 0.58;
          if (s > zip) { const u = (s - zip) / (1 - zip); q = add(q, off, u * u * (3 - 2 * u)); rad = 0.36; }
          ball(q, rad, cols[j]);
          if (i === 27) tips.push(q);
        }
      }
      // Linkers and the two membrane-spanning helices.
      for (const [tip, A, c] of [[tips[0], Sx, C.syntaxin], [tips[2], B, C.synaptobrevin]]) {
        strand(tip, A.p, 3, 0.36, c);
        for (let t = 0.5; t <= 2 * D + 0.3; t += 0.55) ball(add(A.p, A.n, -t), 0.55, shade(c, 0.82));
      }
      // SNAP-25's two helices are joined by a loop that is lipid-anchored to the plasma membrane.
      const ctrl = add(add(C0, dir, Lb * 0.5), Sx.n, -2.6), lc = shade(C.snap25, 0.8);
      for (let i = 1; i < 12; i++) { const u = i / 12; ball(mixv(mixv(tips[1], ctrl, u), mixv(ctrl, heads[3], u), u), 0.3, lc); }
      if (!anchors.snare || sn.phi % TAU > 2.9 && sn.phi % TAU < 3.6) anchors.snare = add(C0, dir, Lb * 0.6);
    });

    // Synaptotagmin, the calcium sensor: anchored in the vesicle, with two C2 domains that
    // plunge into the plasma membrane when calcium binds.
    const wCa = sstep(0.07, 0.15, p), wDock = wCa * (1 - sstep(0.42, 0.62, p));
    this.sytPos = [];
    this.syts.forEach((sy) => {
      const st2 = Math.min(13, Math.sqrt(Av / PI) * 0.6), phi = sy.phi + sy.dphi * wOut;
      const T = at(0, Av - PI * st2 * st2 + PI * Math.pow(st2 + sy.rOut, 2) * Math.pow(wOut, 1.5), phi);
      if (!kept(T.p[0], T.p[2])) return;
      const er = [Math.cos(phi), 0, Math.sin(phi)], et = [-Math.sin(phi), 0, Math.cos(phi)];
      const rT = Math.hypot(T.p[0], T.p[2]);
      const pm = [T.p[0] / Math.max(rT, 1e-3) * (rT + 1), D + 1.9, T.p[2] / Math.max(rT, 1e-3) * (rT + 1)];
      const c2b = mixv(add(add(T.p, T.n, 5.2), et, 1.4), pm, wDock);
      const c2a = mixv(add(add(T.p, T.n, 2.9), et, -1.2), add(mixv(add(T.p, T.n, 2.6), c2b, 0.5), et, -2.6), wDock);
      const c = C.synaptotagmin;
      for (let t = 0.5; t <= 2 * D + 0.3; t += 0.55) ball(add(T.p, T.n, -t), 0.55, shade(c, 0.8));
      strand(T.p, c2a, 4, 0.33, shade(c, 0.9)); strand(c2a, c2b, 3, 0.33, shade(c, 0.9));
      for (const q of [c2a, c2b]) for (const [a, b, e] of [[0.8, 0.5, 0], [-0.8, 0.5, 0], [0, -0.6, 0.8], [0, -0.6, -0.8]]) ball(add(add(add(q, er, a), [0, 1, 0], b), et, e), 1.25, c);
      if (wCa > 0.5) for (const o of [[0.9, -1.1, 0.4], [-0.7, -1.2, -0.5], [0.1, -1.3, -0.9]]) ball(add(c2b, o), 0.3 * wCa, C.calcium, 1);
      this.sytPos.push(c2b);
      if (!anchors.syt) anchors.syt = c2b;
    });

    // Voltage-gated calcium channels, and the calcium that rushes in when one opens.
    const caFlow = sstep(0.03, 0.09, p) * (1 - sstep(0.2, 0.3, p));
    this.channels.forEach((ch, ci) => {
      const A = at(0, Av + PI * ch.r * ch.r, ch.phi);
      if (!kept(A.p[0], A.p[2])) return;
      const er = [Math.cos(ch.phi), 0, Math.sin(ch.phi)], et = [-Math.sin(ch.phi), 0, Math.cos(ch.phi)];
      const mid = [A.p[0], 0, A.p[2]];
      for (let k = 0; k < 4; k++) {
        const a = k * PI / 2 + 0.4, o = add(add(mid, er, 2.1 * Math.cos(a)), et, 2.1 * Math.sin(a));
        for (const y of [-3.4, -1.2, 1.2, 3.6]) ball(add(o, [0, 1, 0], y), 1.75, shade(C.channel, y > 2 ? 0.85 : 1));
      }
      ball(add(add(mid, er, 2.6), [0, 1, 0], -6.4), 2.5, shade(C.channel, 0.78));
      ball(add(add(mid, et, -2.4), [0, 1, 0], 5.6), 1.9, shade(C.channel, 0.7));
      if (ci === 0) anchors.channel = add(mid, [0, 1, 0], 6);
      if (caFlow > 0.01) {
        const tgt = this.sytPos[ci % Math.max(1, this.sytPos.length)] || [0, 6, 0];
        for (let j = 0; j < 46; j++) {
          if ((j * 0.618) % 1 > caFlow) continue;
          const ph = (time * 0.34 + j * 0.3819 + ci * 0.21) % 1, wob = j * 12.9898;
          const jx = Math.sin(wob) * 0.5, jz = Math.cos(wob * 1.7) * 0.5;
          let q;
          if (ph < 0.4) q = add(mid, [jx, lerp(-11, 5, ph / 0.4), jz]);
          else { const u = (ph - 0.4) / 0.6; q = mixv(add(mid, [jx, 5, jz]), add(tgt, [Math.sin(wob * 2.3) * 7, Math.cos(wob * 3.1) * 4 + 3, Math.cos(wob * 2.9) * 7]), Math.sqrt(u)); }
          ball(q, 0.34 * (1 - Math.pow(ph, 4)), C.calcium, 1);
        }
      }
    });

    // Adhesion molecules stitch the two cells together and set the width of the cleft.
    const AvT = S.Av[1];
    this.links.forEach((ln) => {
      const top = at(1, AvT + PI * ln.r * ln.r, ln.a).p;
      if (!kept(top[0], top[2]) || Math.hypot(top[0], top[2]) > PATCH - 8) return;
      const bot = [top[0], -CLEFT + D, top[2]];
      for (let i = 0; i <= 15; i++) {
        const u = i / 15, q = mixv(top, bot, u), big = (i === 4 || i === 5 || i === 10 || i === 11);
        q[0] += Math.sin(u * PI) * ln.bend + Math.sin(time * 0.8 + ln.ph + u * 4) * 0.25;
        ball(q, big ? 1.25 : 0.72, shade(C.adhesion, big ? 1.05 : 0.85));
      }
    });

    // Glutamate receptors in the receiving cell. Each opens once transmitter has had time to reach it.
    const yTop = -CLEFT + D;
    let nearest = null;
    this.receptors.forEach((rc, ri) => {
      if (!kept(rc.x, rc.z)) return;
      const open = sstep(0, 0.035, p - (0.415 + rc.r * 0.0019 + (rc.nmda ? 0.05 : 0)));
      const base = rc.nmda ? C.nmda : C.ampa, lit = mixv(base, [1, 1, 0.9], 0.3 * open), k = rc.nmda ? 1.12 : 1;
      for (let j = 0; j < 4; j++) {
        const a = rc.rot + j * PI / 2, cx = Math.cos(a), sz = Math.sin(a), pair = (j % 2 ? 1 : -1) * 0.5;
        const px = (rr, y, sq) => [rc.x + rr * cx * k + sq * -sz * pair, y, rc.z + rr * sz * k + sq * cx * pair];
        ball(px(1.5, yTop - D - 2.6, 0), 1.5, shade(base, 0.62));
        ball(px(1.6 - 0.25 * open, yTop - D, 0), 1.55, shade(base, 0.8));
        ball(px(1.7 + 0.5 * open, yTop + 1.0, 0), 1.3, shade(base, 0.9));
        ball(px(2.3, yTop + 3.9, 1.0), 1.85, lit);
        ball(px(2.5, yTop + 8.4 * k, 2.2), 2.0, shade(base, 1.05));
        if (open > 0.5) ball(px(3.2, yTop + 3.9, 1.0), 0.42, C.glutamate, 1);
      }
      if (open > 0.3) for (let j = 0; j < 5; j++) {
        const ph = (time * 0.55 + j * 0.2 + ri * 0.137) % 1, y = lerp(yTop + 7, -CLEFT - 16, ph), sp = y < -CLEFT - D ? (-CLEFT - D - y) * 0.22 : 0.15;
        ball([rc.x + Math.sin(j * 7.1 + ri) * sp, y, rc.z + Math.cos(j * 5.3 + ri) * sp], 0.3 * open * (1 - ph * ph), C.sodium, 1);
      }
      const score = Math.hypot(rc.x + 22, rc.z + 12);
      if (!rc.nmda && (!nearest || score < nearest.s)) nearest = { s: score, q: [rc.x, yTop + 10, rc.z] };
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn.b);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * 8), gl.DYNAMIC_DRAW);
    this.dyn.n = n;

    // Where the on-screen labels point.
    const top = S.hV + S.Rc + D, face = CUT_CENTRE + half + 0.25, fx = Math.cos(face), fz = Math.sin(face);
    this.labels = [
      { id: 'vesicle', q: p < 0.8 ? [0, Math.min(top, S.hV + S.Rc + D), 0] : null },
      { id: 'stalk', q: p >= PH.STALK - 0.02 && p < PH.PORE ? [0, S.rho, 0] : null },
      { id: 'pore', q: p >= PH.PORE && p < 0.66 ? [0, S.rho, 0] : null },
      { id: 'glutamate', q: p < 0.4 ? (st.cut > 25 ? [-S.Rin * 0.45, S.hV + S.Rin * 0.2, 0] : null) : [-14 - 30 * sstep(0.45, 0.9, p), -CLEFT / 2, -6] },
      { id: 'snare', q: anchors.snare }, { id: 'syt', q: p < 0.62 ? anchors.syt : null }, { id: 'channel', q: anchors.channel },
      { id: 'receptor', q: nearest && nearest.q },
      { id: 'pre', q: [fx * 84, D, fz * 84] }, { id: 'cleft', q: [fx * 62, -CLEFT / 2, fz * 62] }, { id: 'post', q: [fx * 96, -CLEFT - D, fz * 96] },
      { id: 'psd', q: [fx * 30, -CLEFT - 16, fz * 30] },
      { id: 'reserve', q: this.reserve }, { id: 'mito', q: this.mito },
    ];
    this.focusY = Math.max(-3, Math.min(13, 0.3 * top - 2));
    this.kept = kept;
  }

  // Rough line-of-sight test for labels: is q hidden behind a membrane or the vesicle?
  visible(q, eye) {
    const S = this.S, d = [q[0] - eye[0], q[1] - eye[1], q[2] - eye[2]];
    const blocked = (t) => t > 0.02 && t < 0.97 && this.kept(eye[0] + d[0] * t, eye[2] + d[2] * t);
    for (const y of [0, -CLEFT]) if (Math.abs(d[1]) > 1e-6 && blocked((y - eye[1]) / d[1])) {
      const t = (y - eye[1]) / d[1];
      if (y < 0 || Math.hypot(eye[0] + d[0] * t, eye[2] + d[2] * t) > S.Rc * 0.9 || S.p < PH.DILATE) return false;
    }
    if (S.p < 0.74) {
      const o = [eye[0], eye[1] - S.hV, eye[2]], R = S.Rc + D;
      const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - R * R;
      const disc = b * b - a * c;
      if (disc > 0) { const sq = Math.sqrt(disc); if (blocked((-b - sq) / a) || blocked((-b + sq) / a)) return false; }
    }
    return true;
  }

  // ---- drawing ---------------------------------------------------------------------------------
  draw(cam, st, time) {
    const gl = this.gl, S = this.S, P = this.P, C = COLORS;
    const common = (pr) => {
      gl.useProgram(pr.p); const u = pr.u;
      gl.uniformMatrix4fv(u.uView, false, cam.view); gl.uniformMatrix4fv(u.uProj, false, cam.proj);
      gl.uniform3fv(u.uCamPos, cam.eye); gl.uniform3fv(u.uCamR, cam.basis.r); gl.uniform3fv(u.uCamU, cam.basis.u); gl.uniform3fv(u.uCamF, cam.basis.f);
      gl.uniform4f(u.uLens, cam.proj[0], cam.proj[5], cam.ox, cam.oy);
      gl.uniform2f(u.uViewport, cam.w, cam.h);
      gl.uniform4f(u.uFog, cam.dist * 0.9, 150 + cam.dist * 0.9, 45 + 0.45 * cam.dist, 190 + 1.5 * cam.dist);
      gl.uniform3fv(u.uFocus, cam.target); gl.uniform2f(u.uCut, CUT_CENTRE, st.cut * PI / 360);
      gl.uniform1f(u.uTime, time);
      return u;
    };
    gl.viewport(0, 0, cam.w, cam.h);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    common(P.sky); gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);

    // Distant membranes.
    let u = common(P.sheet);
    gl.uniform1f(u.uGrain, this.spacing * 1.4);
    gl.bindVertexArray(this.sheetVAO);
    for (const [y, c] of [[D, C.plasma], [-D, C.plasmaOut], [-CLEFT + D, C.post], [-CLEFT - D, C.postIn]]) {
      gl.uniform1f(u.uY, y); gl.uniform3fv(u.uSheetCol, c); gl.drawArrays(gl.TRIANGLES, 0, this.sheetN);
    }

    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    // Lipids.
    // How far lipids have wandered since each leaflet became continuous, and the matching spread
    // of vesicle lipid on the cell membrane (equal numbers cross in each direction).
    const sig = [0, 1].map((leaf) => 0.7 * PI * S.R * Math.pow(Math.max(0, (S.p - (leaf ? PH.PORE : PH.STALK)) / (1 - (leaf ? PH.PORE : PH.STALK))), 0.75));
    const sigPM = sig.map((sg, leaf) => {
      if (sg <= 0) return 0;
      const Rl = S.R + (leaf ? -D : D); let B = 0;
      for (let i = 0; i < 64; i++) { const al = (i + 0.5) / 64 * PI, x = Rl * (PI - al) / sg; B += 0.5 * erfc(x / Math.SQRT2) * Math.sin(al); }
      return Math.sqrt(2 * Rl * Rl * B * PI / 64);
    });
    const lipidU = (pr) => {
      const v = common(pr);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tabTex); gl.uniform1i(v.uTab, 0);
      gl.uniform2f(v.uAv, S.Av[0], S.Av[1]); gl.uniform2f(v.uRW, S.rW[0], S.rW[1]);
      gl.uniform2f(v.uSigma, sig[0], sig[1]); gl.uniform2f(v.uSigmaPM, sigPM[0], sigPM[1]); gl.uniform2f(v.uRl, S.R + D, S.R - D);
      gl.uniform4f(v.uGeo, D, CLEFT, BAREA, PATCH);
      gl.uniform3fv(v.uCol, [...C.vesicle, ...C.vesicleIn, ...C.plasma, ...C.plasmaOut, ...C.post, ...C.postIn]);
      gl.uniform1f(v.uHeadR, this.headR);
      return v;
    };
    const both = () => { for (const b of [this.ves, this.sheetLipids]) { gl.bindVertexArray(b.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, b.n); } };
    lipidU(P.head); both();
    if (st.cut > 1) { u = lipidU(P.tail); gl.uniform1f(u.uBand, Math.max(2.0, this.spacing * 1.9)); both(); }

    // Proteins and scenery.
    u = common(P.ball);
    gl.uniform3f(u.uBall, 1, 0, 0); gl.bindVertexArray(this.dyn.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.dyn.n);
    gl.uniform3f(u.uBall, 1, 1, 1); gl.bindVertexArray(this.scenery.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.scenery.n);

    // Transmitter.
    const full = this.glutamate, shown = Math.min(NT_MAX, Math.round(full * (this.q < 0.6 ? 0.55 : 1)));
    const grow = Math.min(1.7, Math.cbrt(full / Math.max(1, shown)));
    const ntU = (pr, scale) => {
      const v = common(pr);
      gl.uniform4f(v.uNT, S.p, S.hV, S.Rin - 0.6, S.rho);
      gl.uniform4f(v.uNT2, Math.max(0.15, S.neck - D - 0.6), -D - 1.4, -CLEFT + D + 1.4, 0.36);
      gl.uniform4f(v.uNT3, PH.PORE + 0.012, 0.30, scale, 0);
      gl.uniform3fv(v.uNTCol, C.glutamate);
      return v;
    };
    ntU(P.nt, grow); gl.bindVertexArray(this.nt.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, shown);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    // Glow.
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    u = ntU(P.ntHalo, grow * 3.4); gl.uniform1f(u.uGlow, 0.30); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, shown);
    u = common(P.ballHalo); gl.uniform3f(u.uBall, 4.2, 0, 0); gl.uniform1f(u.uGlow, 0.55);
    gl.bindVertexArray(this.dyn.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.dyn.n);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.bindVertexArray(null);
  }
}
