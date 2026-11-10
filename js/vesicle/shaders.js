// GLSL for the vesicle-fusion scene. Everything round is a camera-facing quad shaded as a sphere
// with true per-pixel depth, which is what lets a phone draw a couple of hundred thousand lipids.
import { TABW } from './profile.js';

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
#define PI 3.14159265359
uniform mat4 uView, uProj;
uniform vec3 uCamPos, uCamR, uCamU, uCamF;
uniform vec4 uLens;      // proj[0][0], proj[1][1], centre offset x, y
uniform vec2 uViewport;
uniform vec4 uFog;       // start, length, focus radius near, far
uniform vec3 uFocus;     // what the camera is looking at
uniform vec2 uCut;       // cutaway wedge: centre angle, half width
uniform float uTime;
uniform vec4 uTIR;       // in vitro: glass height, 1 / penetration depth, surface intensity (0 = off), illumination reach
uniform vec2 uMode;      // in vitro, how far the camera has pulled back (0..1)
`;

// Signed distance to the nearest face of the cutaway wedge; negative means "sliced away".
const CUT = `
float cutDist(vec3 p){
  if(uCut.y < 0.002) return 1e4;
  float ang = abs(mod(atan(p.z, p.x) - uCut.x + PI, 2.0*PI) - PI) - uCut.y;
  float r = length(p.xz);
  return sign(ang) * r * sin(min(abs(ang), PI*0.5));
}
`;

const SKY = `
vec3 viewDir(){
  vec2 ndc = gl_FragCoord.xy / uViewport * 2.0 - 1.0;
  return normalize(uCamF + uCamR * ((ndc.x - uLens.z) / uLens.x) + uCamU * ((ndc.y - uLens.w) / uLens.y));
}
// Cytoplasm above, the cleft at the horizon, the receiving cell below.
vec3 sky(vec3 d){
  vec3 horizon = vec3(0.105, 0.185, 0.290);
  vec3 c = mix(horizon, vec3(0.022, 0.050, 0.105), smoothstep(0.0, 0.85, d.y));
  c = mix(c, vec3(0.060, 0.030, 0.090), smoothstep(0.0, 0.75, -d.y));
  c += vec3(0.05, 0.07, 0.10) * exp(-abs(d.y) * 9.0);
  if(uMode.x > 0.5){
    // On the microscope: glass and darkness below, and a dim room once the camera leaves the cell.
    c = mix(c * 0.55, vec3(0.010, 0.018, 0.034), smoothstep(0.0, 0.45, -d.y));     // darker, so the laser light reads
    c = mix(c, vec3(0.020, 0.024, 0.034) + vec3(0.03, 0.04, 0.055) * exp(-abs(d.y) * 5.0), uMode.y);
  }
  return c;
}
const vec3 EXC = vec3(0.06, 0.56, 0.95);     // 488 nm
// Laser light landing on whatever sits in the evanescent field.
vec3 excite(vec3 col, float wy){
  if(uTIR.z <= 0.0 || wy < uTIR.x) return col;
  return col + EXC * (0.17 * uTIR.z * exp(-(wy - uTIR.x) * uTIR.y) * uTIR.w);
}
vec3 haze(vec3 col, float dist, float fr){
  float f = 1.0 - exp(-max(dist - uFog.x, 0.0) / uFog.y);
  f = 1.0 - (1.0 - f) * (1.0 - 0.78 * smoothstep(uFog.z, uFog.w, fr));
  return mix(col, sky(viewDir()) * 1.22 + 0.012, min(f, 0.955));
}
`;

// Shared lipid placement: turn an instance's flat-map coordinate into a point on the membrane.
const LIPID = `
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aA;   // flat-map position (xy), per-lipid Gaussian pair (zw)
layout(location=2) in vec3 aB;   // seed, code = kind + 4*leaflet, radius scale
uniform sampler2D uTab;
uniform vec2 uAv, uSigma, uSigmaPM, uRl, uRW;
uniform vec4 uGeo;       // D, cleft, BAREA, patch radius
uniform vec3 uCol[6];
uniform float uHeadR;
const float TW = ${TABW}.0;
vec4 row(int r, float t){
  int i = min(int(t), ${TABW - 2});
  return mix(texelFetch(uTab, ivec2(i, r), 0), texelFetch(uTab, ivec2(i + 1, r), 0), t - float(i));
}
vec4 lookup(int leaf, float a, float Av){
  if(a < Av) return row(leaf * 2, a / Av * (TW - 1.0));
  float b = a - Av;
  if(b < uGeo.z) return row(leaf * 2 + 1, b / uGeo.z * (TW - 1.0));
  float sg = leaf == 0 ? 1.0 : -1.0;
  return vec4(sqrt(uRW[leaf] * uRW[leaf] + (b - uGeo.z) / PI), sg * uGeo.x, 0.0, sg);
}
void lipid(out vec3 pos, out vec3 nrm, out vec3 col, out float scale){
  int code = int(aB.y + 0.5), kind = code & 3, leaf = code >> 2;
  float sg = leaf == 0 ? 1.0 : -1.0;
  if(kind == 2){                       // the receiving cell's membrane: a plain sheet
    pos = vec3(aA.x, -uGeo.y + sg * uGeo.x, aA.y);
    nrm = vec3(0.0, sg, 0.0);
    col = uCol[4 + leaf];
  } else {
    float Av = uAv[leaf], uv2 = Av / PI;
    vec2 U = kind == 0 ? aA.xy * sqrt(uv2) : aA.xy * (sqrt(uv2 + dot(aA.xy, aA.xy)) / max(length(aA.xy), 1e-4));
    vec4 s = lookup(leaf, PI * dot(U, U), Av);
    vec2 cs = U / max(length(U), 1e-5);
    pos = vec3(s.x * cs.x, s.y, s.x * cs.y);
    nrm = normalize(vec3(s.z * cs.x, s.w, s.z * cs.y));
    // Mixing. Rather than move lipids (which would wreck the even packing), each site shows the
    // origin of the lipid that has random-walked into it. On the vesicle, the chance of finding a
    // cell-membrane lipid falls off with distance along the surface from the neck; on the cell
    // membrane, vesicle lipids thin out with distance from the fusion site, and the two tallies
    // are matched so that no lipid is created or lost.
    float m;
    if(kind == 0){
      float s = uRl[leaf] * (PI - acos(clamp(1.0 - 2.0 * dot(aA.xy, aA.xy), -1.0, 1.0)));
      m = smoothstep(-0.5, 0.5, uSigma[leaf] * aA.z - s);
    } else {
      m = aB.x > 0.5 ? 1.0 : 1.0 - smoothstep(-0.5, 0.5, uSigmaPM[leaf] * length(aA.zw) - length(aA.xy));
    }
    col = mix(uCol[leaf], uCol[2 + leaf], m);
  }
  float ph = aB.x * 61.0;
  pos += nrm * (0.09 * sin(uTime * 2.3 + ph)) + vec3(sin(uTime * 1.7 + ph * 1.9), 0.0, cos(uTime * 1.3 + ph * 2.7)) * 0.07;
  col *= 0.90 + 0.2 * fract(aB.x * 7.31);
  scale = aB.z * (1.0 - smoothstep(uGeo.w - 14.0, uGeo.w, length(pos.xz)));
}
`;

const SPHERE_OUT = `
out vec2 vUv; out vec3 vCenterV; out float vRad; out vec3 vMemN; out vec3 vColor; out vec3 vMisc;
`;

export const lipidHeadVS = HEAD + CUT + LIPID + SPHERE_OUT + `
void main(){
  vec3 pos, nrm, col; float scale;
  lipid(pos, nrm, col, scale);
  vec4 vc = uView * vec4(pos, 1.0);
  vRad = uHeadR * scale; vUv = aCorner; vCenterV = vc.xyz; vColor = col;
  vMemN = mat3(uView) * nrm;
  vMisc = vec3(length(pos - uFocus), 0.0, aB.x);
  vc.xy += aCorner * vRad;
  gl_Position = (cutDist(pos) < 0.0 || scale < 0.01) ? vec4(2.0, 2.0, 2.0, 1.0) : uProj * vc;
}`;

export const sphereFS = HEAD + SKY + `
in vec2 vUv; in vec3 vCenterV; in float vRad; in vec3 vMemN; in vec3 vColor; in vec3 vMisc;
out vec4 o;
float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main(){
  float r2 = dot(vUv, vUv);
  if(r2 > 1.0) discard;
  float z = sqrt(1.0 - r2);
  vec3 n = vec3(vUv, z);
  vec3 pv = vCenterV + n * vRad;
  gl_FragDepth = ((uProj[2][2] * pv.z + uProj[3][2]) / -pv.z) * 0.5 + 0.5;
  float aa = fwidth(r2);
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, r2);
  vec3 col = vColor;
  float style = vMisc.y;
  if(style > 0.5 && style < 1.5){                 // self-lit: transmitter and ions
    col *= 0.7 + 0.6 * z;
  } else {
    vec3 L = normalize(vec3(-0.38, 0.58, 0.72));
    float diff = max(dot(n, L), 0.0);
    if(style > 1.5){                              // far-off organelles get a pebbled lipid skin
      vec3 nw = transpose(mat3(uView)) * n;
      float k = style > 2.5 ? 5.0 : 26.0;
      col *= 0.80 + 0.36 * vnoise(nw * k + vMisc.z * 31.0);
    }
    col *= (0.36 + 0.74 * diff) * mix(0.45, 1.0, smoothstep(0.0, 0.62, z));
    col += 0.10 * pow(max(dot(n, normalize(L + vec3(0, 0, 1))), 0.0), 28.0);
    // Headgroups shade each other where they tuck into the sheet.
    if(dot(vMemN, vMemN) > 0.0) col *= mix(0.42, 1.0, smoothstep(-0.75, 0.35, dot(n, vMemN)));
  }
  if(style < 0.5 || style > 1.5) col = excite(col, uCamPos.y + uCamR.y * pv.x + uCamU.y * pv.y - uCamF.y * pv.z);
  o = vec4(haze(col, length(pv), vMisc.x), alpha);
}`;

export const tailVS = HEAD + CUT + LIPID + `
uniform float uBand;
out vec2 vUv; out vec3 vColor; out vec3 vMisc;
void main(){
  vec3 pos, nrm, col; float scale;
  lipid(pos, nrm, col, scale);
  float cd = cutDist(pos);
  if(cd < 0.0 || cd > uBand || scale < 0.5){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 a = (uView * vec4(pos - nrm * uHeadR * 0.5, 1.0)).xyz;
  vec3 b = (uView * vec4(pos - nrm * (uGeo.x - 0.08), 1.0)).xyz;
  vec3 ax = b - a;
  vec2 sd = normalize(vec2(-ax.y, ax.x) + 1e-5) * uHeadR * 0.95;
  vec3 p = mix(a, b, aCorner.y * 0.5 + 0.5);
  p.xy += sd * aCorner.x;
  vUv = vec2(aCorner.x, aCorner.y * 0.5 + 0.5);
  vColor = mix(col, vec3(0.93, 0.88, 0.74), 0.72);
  vMisc = vec3(length(pos - uFocus), length(p), aB.x);
  gl_Position = uProj * vec4(p, 1.0);
}`;

export const tailFS = HEAD + SKY + `
in vec2 vUv; in vec3 vColor; in vec3 vMisc;
out vec4 o;
void main(){
  float w = sin(vUv.y * 7.0 + vMisc.z * 50.0) * 0.13;
  float d = min(abs(vUv.x - 0.48 - w), abs(vUv.x + 0.48 + w * 0.8));
  if(d > 0.24) discard;
  float sh = 1.0 - (d / 0.24) * (d / 0.24);
  o = vec4(haze(vColor * (0.42 + 0.5 * sh), vMisc.y, vMisc.x), 1.0);
}`;

// Proteins, organelles and anything else made of balls.
export const ballVS = HEAD + CUT + `
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aPR;
layout(location=2) in vec4 aCS;
uniform vec3 uBall;      // radius scale, apply cutaway, clear the line of sight
` + SPHERE_OUT + `
void main(){
  vec3 pos = aPR.xyz; float rad = aPR.w * uBall.x;
  if(uBall.z > 0.5){
    // Scenery steps aside when it would sit between the camera and the fusion site.
    vec3 ab = uFocus - uCamPos;
    float t = dot(pos - uCamPos, ab) / dot(ab, ab);
    float d = length(pos - (uCamPos + clamp(t, 0.0, 1.0) * ab));
    if(t < 0.93) rad *= smoothstep(aPR.w + 14.0, aPR.w + 40.0, d);
  }
  vec4 vc = uView * vec4(pos, 1.0);
  vRad = rad; vUv = aCorner; vCenterV = vc.xyz; vColor = aCS.rgb; vMemN = vec3(0.0);
  vMisc = vec3(length(pos - uFocus), aCS.a, fract(pos.x * 0.137 + pos.z * 0.071 + pos.y * 0.053));
  vc.xy += aCorner * rad;
  bool gone = rad < 0.01 || (uBall.y > 0.5 && cutDist(pos) < 0.0) || (uBall.x > 1.5 && abs(aCS.a - 1.0) > 0.5);
  gl_Position = gone ? vec4(2.0, 2.0, 2.0, 1.0) : uProj * vc;
}`;

// Soft additive glow around self-lit particles.
export const haloFS = HEAD + SKY + `
in vec2 vUv; in vec3 vCenterV; in float vRad; in vec3 vMemN; in vec3 vColor; in vec3 vMisc;
uniform float uGlow;
out vec4 o;
void main(){
  float r2 = dot(vUv, vUv);
  if(r2 > 1.0 || vMisc.y < 0.5 || vMisc.y > 1.5) discard;
  float f = 1.0 - exp(-max(length(vCenterV) - uFog.x, 0.0) / uFog.y);
  float g = exp(-r2 * 4.5) - exp(-4.5);
  o = vec4(vColor * g * uGlow * (1.0 - 0.8 * f), 1.0);
}`;

// Neurotransmitter: every molecule's whole journey is a function of the progress slider, so it
// can be scrubbed. It waits in the lumen, squeezes through the pore, then spreads in the cleft.
export const transmitterVS = HEAD + CUT + `
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aBall;   // home position in the unit ball
layout(location=2) in vec4 aSeed;   // uniform, Gaussian pair, uniform
uniform vec4 uNT;        // progress, vesicle centre height, lumen radius, neck height
uniform vec4 uNT2;       // pore radius, cleft top, cleft bottom, ball radius
uniform vec4 uNT3;       // first release, release span, radius scale, _
uniform vec3 uNTCol;
` + SPHERE_OUT + `
void main(){
  float e = clamp(0.62 * (aBall.y + 1.0) * 0.5 + 0.38 * aSeed.x, 0.0, 1.0);
  float s = (uNT.x - (uNT3.x + uNT3.y * pow(e, 0.6))) / 0.05;
  float sd = aSeed.w * 100.0, t = uTime;
  vec3 jig = vec3(sin(t * 2.1 + sd), sin(t * 1.7 + sd * 1.3 + 1.0), sin(t * 2.6 + sd * 0.7 + 2.0));
  float sw = t * 0.07 * (aSeed.x - 0.5);
  vec3 b = vec3(aBall.x * cos(sw) - aBall.z * sin(sw), aBall.y, aBall.x * sin(sw) + aBall.z * cos(sw));
  vec3 home = vec3(0.0, uNT.y, 0.0) + b * uNT.z + jig * 0.32;
  vec3 pos = home; float fade = 1.0;
  if(s > 0.0){
    vec2 q = aSeed.yz / max(1.0, length(aSeed.yz) / 1.5);
    vec3 neck = vec3(q.x * uNT2.x * 0.5, uNT.w, q.y * uNT2.x * 0.5);
    if(s < 1.0){
      float u = s * s * (3.0 - 2.0 * s);
      vec3 ctrl = vec3(neck.x, uNT.y - uNT.z + 2.5, neck.z);
      pos = mix(mix(home, ctrl, u), mix(ctrl, neck, u), u) + jig * 0.15;
    } else {
      float k = s - 1.0, desc = 1.0 - exp(-k * 2.5);
      float lat = (6.5 * sqrt(k) + 2.4 * k) * smoothstep(0.4, 0.95, desc);
      pos = vec3(neck.x + aSeed.y * lat, mix(uNT.w, mix(uNT2.y, uNT2.z, aSeed.w), desc), neck.z + aSeed.z * lat) + jig * 0.42;
      fade = 1.0 - smoothstep(60.0, 150.0, length(pos.xz));
    }
  }
  float rad = uNT2.w * uNT3.z * fade;
  vec4 vc = uView * vec4(pos, 1.0);
  vRad = rad; vUv = aCorner; vCenterV = vc.xyz; vColor = uNTCol * (0.85 + 0.3 * aSeed.w); vMemN = vec3(0.0);
  vMisc = vec3(0.0, 1.0, 0.0);
  vc.xy += aCorner * rad;
  gl_Position = (rad < 0.01 || cutDist(pos) < -0.2) ? vec4(2.0, 2.0, 2.0, 1.0) : uProj * vc;
}`;

// The membranes beyond the patch that is drawn lipid by lipid.
export const sheetVS = HEAD + `
layout(location=0) in vec2 aXZ;
uniform float uY;
out vec3 vW;
void main(){ vW = vec3(aXZ.x, uY, aXZ.y); gl_Position = uProj * uView * vec4(vW, 1.0); }`;

export const sheetFS = HEAD + CUT + SKY + `
in vec3 vW;
uniform vec3 uSheetCol;
uniform float uGrain;
out vec4 o;
void main(){
  if(cutDist(vW) < 0.0) discard;
  float dist = length(vW - uCamPos);
  // A hint of headgroups that dissolves with distance.
  vec2 g = vW.xz / uGrain; g.x += 0.5 * floor(g.y);
  vec2 c = fract(g) - 0.5;
  float dots = smoothstep(0.5, 0.15, length(c)) * exp(-dist / 260.0);
  // Lit like the headgroups it stands in for, so the drawn patch melts into it.
  vec3 n = mat3(uView) * vec3(0.0, uCamPos.y > vW.y ? 1.0 : -1.0, 0.0);
  float diff = max(dot(n, normalize(vec3(-0.38, 0.58, 0.72))), 0.0);
  vec3 col = uSheetCol * (0.36 + 0.74 * diff) * (0.78 + 0.2 * dots);
  o = vec4(haze(excite(col, vW.y), dist, length(vW - uFocus)), 1.0);
}`;

export const skyVS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

export const skyFS = HEAD + SKY + `
out vec4 o;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 x){ vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec3 d = viewDir();
  vec3 c = sky(d);
  // Slow mottling: the crowd of proteins too far off to resolve.
  vec2 q = vec2(atan(d.z, d.x) * 2.2, d.y * 3.5);
  float m = n2(q * 1.6 + uTime * 0.012) * 0.6 + n2(q * 4.1 - uTime * 0.02) * 0.4;
  c *= 0.84 + 0.34 * m;
  vec2 v = gl_FragCoord.xy / uViewport - 0.5;
  c *= 1.0 - 0.55 * dot(v, v);
  c += (h2(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

// ---- in vitro ------------------------------------------------------------------------------------
// The evanescent field as a glow in the medium: the exact line integral of exp(-height/depth)
// along each view ray, so it thickens toward the glass and when you look along the surface.
export const glowFS = HEAD + SKY + `
uniform vec3 uGlow;      // ray length, brightness scale, strength
out vec4 o;
void main(){
  vec3 d = viewDir();
  float h0 = uCamPos.y - uTIR.x, t0 = 0.0, t1 = uGlow.x;
  if(abs(d.y) > 1e-5){ float tg = -h0 / d.y; if(d.y > 0.0) t0 = max(t0, tg); else t1 = min(t1, tg); }
  else if(h0 < 0.0) discard;
  if(t1 <= t0) discard;
  float ha = h0 + d.y * t0, hb = h0 + d.y * t1, k = uTIR.y, len;
  if(k < 1e-7) len = t1 - t0;
  else if(abs(d.y) < 1e-4) len = (t1 - t0) * exp(-ha * k);
  else len = abs(exp(-ha * k) - exp(-hb * k)) / (k * abs(d.y));
  float g = 1.0 - exp(-len * uTIR.z / uGlow.y);
  o = vec4(EXC * g * uGlow.z, 1.0);
}`;

// A flat panel carrying the light field: either the top of the glass, or a vertical slice through
// glass and cell on the faces of the cutaway. The slice shows the real wave: plane waves arriving
// and reflecting inside the glass, and above it a wave that only runs sideways and fades upward.
export const fieldVS = HEAD + `
uniform vec3 uO, uA, uB;
out vec3 vW; out vec2 vC;
void main(){
  vC = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vW = uO + uA * vC.x + uB * vC.y;
  gl_Position = uProj * uView * vec4(vW, 1.0);
}`;

export const fieldFS = HEAD + SKY + `
in vec3 vW; in vec2 vC;
uniform vec4 uWave;      // kx, ky in glass, ky in the cell (0 when evanescent), phase shift on reflection
uniform vec4 uWave2;     // reflection amplitude, slice (1) or glass top (0), strength, spot radius
out vec4 o;
void main(){
  float ph = uWave.x * vW.x - uTime * 2.4, dist = length(vW - uCamPos);
  float f = 1.0 - exp(-max(dist - uFog.x, 0.0) / uFog.y);
  if(uWave2.y < 0.5){
    // Top of the coverslip: faint glass, a measuring grid, and the laser's footprint sweeping across.
    float r = length(vW.xz);
    if(r > 1.1e7) discard;
    float spot = exp(-(vW.x * vW.x * 0.25 + vW.z * vW.z) / (2.0 * uWave2.w * uWave2.w));
    float crest = 0.5 + 0.5 * cos(ph);
    float fine = exp(-dist / 900.0);
    vec2 g = abs(fract(vW.xz / 100.0 + 0.5) - 0.5) * 100.0;
    float grid = (1.0 - smoothstep(0.0, 1.2 + dist * 0.004, min(g.x, g.y))) * fine;
    vec3 add = EXC * uTIR.z * spot * (0.07 + 0.16 * mix(0.5, crest, fine)) * uWave2.z + vec3(0.5, 0.7, 0.9) * grid * 0.10;
    float a = 0.10 * (1.0 - f);
    o = vec4(vec3(0.55, 0.72, 0.85) * a * 0.5 + add * (1.0 - f), a);
    return;
  }
  float y = vW.y - uTIR.x, e;
  if(y < 0.0) e = cos(ph + uWave.y * y) + uWave2.x * cos(ph - uWave.y * y - 2.0 * uWave.w);
  else if(uWave.z > 0.0) e = (1.0 + uWave2.x) * cos(ph + uWave.z * y);
  else e = 2.0 * cos(uWave.w) * exp(-y * uTIR.y * 0.5) * cos(ph - uWave.w);
  e *= 0.5;
  // Time-averaged intensity: fringes inside the glass, pure exponential decay above it.
  float mean = y < 0.0 ? 0.25 * (1.0 + uWave2.x * uWave2.x + 2.0 * uWave2.x * cos(2.0 * uWave.y * y + 2.0 * uWave.w))
                       : (uWave.z > 0.0 ? uTIR.z : uTIR.z * exp(-y * uTIR.y));
  // Ruler: a line at each multiple of the penetration depth.
  float tick = 0.0;
  if(y > 0.0 && uTIR.y > 0.0){ float m = y * uTIR.y; float px = fwidth(m); tick = (1.0 - smoothstep(px, 2.5 * px, abs(fract(m + 0.5) - 0.5))) * step(m, 4.5) * step(0.5, m); }
  float edge = (1.0 - smoothstep(0.55, 1.0, vC.x)) * smoothstep(0.0, 0.1, vC.y) * (1.0 - smoothstep(0.8, 1.0, vC.y));
  float k = edge * uWave2.z;
  if(y < 0.0){
    // Inside the glass: a pale slab with the incoming and reflected beams crossing in it.
    float a = 0.5 * k;
    o = vec4(vec3(0.20, 0.27, 0.33) * a + EXC * (mean * 0.30 + 0.16 * e) * k, a);
  } else {
    float surf = 1.0 - smoothstep(0.0, 2.0 * fwidth(y), y);
    o = vec4((EXC * mean * (0.95 + 0.45 * e) + vec3(0.75, 0.92, 1.0) * (tick * 0.55 + surf * 0.8)) * k, 0.0);
  }
}`;

// Dish, coverslip, objective and cells.
export const meshVS = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aCol;
layout(location=3) in vec4 aInst;
out vec3 vN; out vec3 vW; out vec4 vCol;
void main(){
  vW = aPos * aInst.w + aInst.xyz; vN = aNrm; vCol = aCol;
  gl_Position = uProj * uView * vec4(vW, 1.0);
}`;

export const meshFS = HEAD + `
in vec3 vN; in vec3 vW; in vec4 vCol;
uniform vec3 uMesh;      // alpha scale, shininess, additive glow
out vec4 o;
void main(){
  vec3 v = normalize(uCamPos - vW), n = normalize(vN);
  if(dot(n, v) < 0.0) n = -n;
  if(uMesh.z > 0.0){ o = vec4(vCol.rgb * uMesh.z * (0.35 + 0.65 * pow(1.0 - dot(n, v), 2.0)), 0.0); return; }
  vec3 L = normalize(vec3(0.35, 0.8, 0.5));
  float diff = max(dot(n, L), 0.0) * 0.7 + 0.25 * abs(n.y) + 0.22;
  float spec = pow(max(dot(n, normalize(L + v)), 0.0), 40.0) * uMesh.y;
  float rim = pow(1.0 - dot(n, v), 3.0);
  float a = clamp(vCol.a * uMesh.x * (1.0 + 1.2 * rim), 0.0, 1.0);
  o = vec4((vCol.rgb * diff + spec) * a, a);
}`;

// Laser beams as glowing lines that never get thinner than a few pixels.
export const beamVS = HEAD + `
layout(location=0) in vec3 aA;
layout(location=1) in vec3 aB;
layout(location=2) in vec4 aP;     // side, end, width, strength
layout(location=3) in vec3 aC;
out float vS; out vec4 vCol;
void main(){
  vec3 a = (uView * vec4(aA, 1.0)).xyz, b = (uView * vec4(aB, 1.0)).xyz;
  vec3 p = mix(a, b, aP.y);
  vec2 dir = normalize(b.xy / max(-b.z, 1.0) - a.xy / max(-a.z, 1.0) + 1e-9);
  float thin = 0.0035 * abs(p.z), w = max(aP.z, thin);
  p.xy += vec2(-dir.y, dir.x) * w * aP.x;
  // Up close the real beam is wider than the screen; let it thin to a faint wash.
  vS = aP.x; vCol = vec4(aC, aP.w * clamp(thin / aP.z, 0.1, 1.0));
  gl_Position = uProj * vec4(p, 1.0);
}`;

export const beamFS = `#version 300 es
precision highp float;
in float vS; in vec4 vCol;
uniform float uBeam;
out vec4 o;
void main(){ o = vec4(vCol.rgb * vCol.a * uBeam * exp(-vS * vS * 3.5), 0.0); }`;
