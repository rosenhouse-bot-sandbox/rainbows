// The page's shaders. Colours arrive already worked out by the model (model.js) as display values;
// the shaders only light them. Nothing here fades with the zoom: a thing is drawn at its true size
// and is seen or not according to how big that is on screen.

const HEAD = `#version 300 es
precision highp float; precision highp int;
`;
const LIGHT = `
uniform vec3 uSun;                 // direction to the Sun, in the camera's frame
`;

// ---- the sky ---------------------------------------------------------------------------------------
export const SKY_VS = HEAD + `
layout(location=0) in vec3 aPos;
uniform mat3 uRay;                 // turns a screen position into a direction in the world
out vec3 vDir;
void main() { vDir = uRay * vec3(aPos.xy, 1.0); gl_Position = vec4(aPos.xy, 0.9999, 1.0); }`;
export const SKY_FS = HEAD + `
in vec3 vDir; out vec4 o;
uniform vec3 uSunW;
vec3 sky(float y) {
  vec3 c = mix(vec3(0.886,0.635,0.455), vec3(0.655,0.412,0.478), smoothstep(0.0, 0.05, y));
  c = mix(c, vec3(0.353,0.29,0.463), smoothstep(0.03, 0.12, y));
  c = mix(c, vec3(0.141,0.188,0.38), smoothstep(0.08, 0.26, y));
  c = mix(c, vec3(0.055,0.094,0.22), smoothstep(0.2, 0.5, y));
  return mix(c, vec3(0.024,0.035,0.086), smoothstep(0.4, 0.95, y));
}
void main() {
  vec3 d = normalize(vDir);
  vec3 c = d.y >= 0.0 ? sky(d.y) : mix(vec3(0.886,0.635,0.455) * 0.5, vec3(0.03,0.05,0.06), smoothstep(0.0, 0.12, -d.y));
  float s = max(dot(d, uSunW), 0.0);
  c += vec3(1.0,0.72,0.45) * (0.5 * pow(s, 40.0) + 0.22 * pow(s, 6.0));
  o = vec4(c, 1.0);
}`;

// ---- the lawn and the far hills -------------------------------------------------------------------
export const LAND_VS = HEAD + `
layout(location=0) in vec3 aPos;
uniform mat4 uMV, uP; uniform vec4 uShape;      // lawn: half-width; hills: radius, height
uniform int uKind;
out vec3 vW; out vec3 vV;
void main() {
  vec3 w = uKind == 0 ? vec3(aPos.x * uShape.x, 0.0, aPos.y * uShape.x) : vec3(aPos.x * uShape.x, (aPos.z * 0.5 + 0.5) * uShape.y, aPos.y * uShape.x);
  vW = w; vec4 v = uMV * vec4(w, 1.0); vV = v.xyz; gl_Position = uP * v;
}`;
export const LAND_FS = HEAD + `
in vec3 vW; in vec3 vV; out vec4 o;
uniform int uKind; uniform vec4 uShape; uniform vec3 uTint;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
void main() {
  if (uKind == 0) {
    float r = length(vW.xz);
    vec3 c = mix(vec3(0.115,0.235,0.15), vec3(0.17,0.29,0.2), noise(vW.xz * 1.7)) * (0.9 + 0.2 * noise(vW.xz * 9.0));
    c *= 1.0 - 0.6 * exp(-dot(vW.xz - vec2(-0.6, -0.2), vW.xz - vec2(-0.6, -0.2)) / 9.0);      // the tree's shadow
    c = mix(c, vec3(0.2,0.2,0.3), smoothstep(8.0, 60.0, r));                                    // haze with distance
    o = vec4(c, 1.0);
  } else {
    float a = atan(vW.z, vW.x), h = uShape.y * (0.42 + 0.2 * sin(a * 3.0 + uShape.z) + 0.13 * sin(a * 7.0 + uShape.z * 2.3) + 0.07 * abs(sin(a * 17.0 + uShape.z)) + 0.035 * abs(sin(a * 41.0)));
    if (vW.y > h) discard;
    o = vec4(mix(uTint * 1.5, uTint, smoothstep(0.0, h, vW.y)), 1.0);
  }
}`;

// ---- leaves ---------------------------------------------------------------------------------------
// One leaf outline drawn for every leaf. The blade curves down away from its stalk.
export const LEAF_VS = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=2) in vec3 iPos; layout(location=3) in vec4 iQuat; layout(location=4) in vec4 iCol;
uniform mat4 uMV, uP; uniform float uDroop;
out vec2 vUV; out vec3 vN; out vec3 vV; out vec3 vCol;
vec3 rot(vec4 q, vec3 v) { vec3 t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
void main() {
  vec3 l = vec3(aPos.xy, -uDroop * dot(aPos.xy, aPos.xy));
  vec4 v = uMV * vec4(iPos + rot(iQuat, l * iCol.a), 1.0);
  vN = mat3(uMV) * rot(iQuat, vec3(2.0 * uDroop * aPos.xy, 1.0));
  vUV = aPos.xy; vV = v.xyz; vCol = iCol.rgb; gl_Position = uP * v;
}`;
export const LEAF_FS = HEAD + LIGHT + `
in vec2 vUV; in vec3 vN; in vec3 vV; in vec3 vCol; out vec4 o;
uniform int uDetail;                 // 1 for the leaf we follow
uniform vec3 uEarly, uLate, uVein;   // that leaf's colour a few days earlier and later, and its veins' colour
uniform vec4 uHole; uniform vec2 uHoleX;   // the window cut in it: the middle of its far wall, its half-width and its depth, in leaf lengths; and which way that wall runs
uniform vec2 uLobe[7];               // each lobe's direction and length
uniform float uVeinW, uSideW, uNetW, uNetCell;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// how much of a pixel a line of width w covers, at distance d from its middle
float cover(float d, float w) { float px = max(fwidth(d), 1e-9); return clamp((0.5 * w - d) / px + 0.5, 0.0, 1.0) * min(1.0, w / px); }
void main() {
  if (uDetail == 1) { vec2 hd = vUV - uHole.xy; float hx = dot(hd, uHoleX), hy = dot(hd, vec2(-uHoleX.y, uHoleX.x)); if (abs(hx) < uHole.z && hy < 0.0 && hy > -uHole.w) discard; }
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0), v = normalize(-vV);
  float ndl = dot(n, uSun);
  vec3 base = vCol;
  if (uDetail == 1) { float t = clamp((length(vUV - vec2(0.1, 0.0)) - 0.05) / 0.8, 0.0, 1.0); base = t < 0.5 ? mix(uEarly, vCol, t * 2.0) : mix(vCol, uLate, t * 2.0 - 1.0); }
  // the veins, at their true width
  float main = 0.0, side = 0.0;
  for (int i = 0; i < 7; i++) {
    vec2 d = uLobe[i]; float L = length(d); d /= L;
    float t = dot(vUV, d), s = vUV.x * d.y - vUV.y * d.x;
    if (t > 0.0 && t < 0.97 * L) main = max(main, cover(abs(s), uVeinW * (1.0 - 0.6 * t / L)));
    if (uDetail == 1) {
      float n9 = floor(9.0 * L + 0.5), gap = 0.74 * L / (n9 + 1.0), q = (t - 0.12 * L) - abs(s) * 0.75, k = floor(q / gap + 0.5);
      if (k >= 1.0 && k <= n9 && abs(s) < 0.15 * L) side = max(side, cover(abs(q - k * gap) * 0.8, uSideW));
    }
  }
  vec3 c = base;
  if (uDetail == 1) {
    // the net of small veins
    vec2 g = vUV / uNetCell, id = floor(g); float d1 = 9.0, d2 = 9.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 cell = id + vec2(i, j); float dd = length(cell + vec2(hash(cell), hash(cell + 7.3)) - g); if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd; }
    c = mix(c, uVein, 0.3 * cover((d2 - d1) * 0.5 * uNetCell, uNetW));
    c = mix(c, uVein, 0.45 * side);
  }
  c = mix(c, uDetail == 1 ? uVein : base * 1.22 + 0.02, 0.75 * main);
  // lit from the front it is matt; with the Sun behind it, light comes through and it glows
  vec3 col = c * (0.42 + 0.4 * max(ndl, 0.0) + 1.0 * pow(max(-ndl, 0.0), 0.5));
  col += vec3(1.0, 0.9, 0.8) * 0.12 * pow(max(dot(n, normalize(uSun + v)), 0.0), 30.0);
  o = vec4(col, 1.0);
}`;

// ---- every solid thing: branches, cells, chloroplasts, atoms --------------------------------------
// Each copy carries a place, a rotation, a size, a colour and three numbers: its kind, a threshold
// and an index. Kinds:
//  0 matt solid            1 clear shell (a cell wall)      2 vacuole              3 glowing
//  4 chloroplast (far)     5 stack of membranes             6 chloroplast envelope   14 drop of fat in a chloroplast
//  7, 8, 9 part of a chlorophyll, carotenoid or anthocyanin molecule (gone when the pigment is below the threshold)
// 10, 11 a far-off chlorophyll or carotenoid, flat   12 a dot of light   13 a white ring marker
export const SOLID_VS = HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor;
layout(location=2) in vec3 iPos; layout(location=3) in vec4 iQuat; layout(location=4) in vec3 iScale; layout(location=5) in vec4 iCol; layout(location=6) in vec3 iMat;
uniform mat4 uMV, uP; uniform int uShape;       // 0 scaled as it is, 1 capsule (round ends keep their shape), 2 always facing the camera
uniform vec4 uCamQ;
uniform vec3 uPig;                               // chlorophyll, carotenoids, anthocyanin in the followed cell
uniform float uSize[8];
out vec3 vN; out vec3 vV; out vec4 vCol; out vec3 vMat; out vec3 vL;
vec3 rot(vec4 q, vec3 v) { vec3 t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
void main() {
  int kind = int(iMat.x + 0.5);
  vec3 sc = iScale; float grow = 1.0;
  if (kind == 4 || kind == 6) grow = uSize[int(iMat.z + 0.5)];
  if (kind == 5) grow = clamp((uPig.x - iMat.y) / 0.12, 0.0, 1.0);
  if (kind == 14) grow = 1.0 - clamp((uPig.x - iMat.y) / 0.12, 0.0, 1.0);
  if (kind == 7 || kind == 10) grow = clamp((uPig.x - iMat.y) / 0.06, 0.0, 1.0);
  if (kind == 8 || kind == 11) grow = clamp((uPig.y - iMat.y) / 0.06, 0.0, 1.0);
  if (kind == 9) grow = clamp((uPig.z - iMat.y) / 0.06, 0.0, 1.0);
  vec3 l, n;
  if (uShape == 1) { float r = min(sc.x, sc.y), sg = aPos.z > 0.0 ? 1.0 : -1.0; l = vec3(aNor.xy * sc.xy, aNor.z * r + sg * max(sc.z - r, 0.0)); n = aNor; }
  else { l = aPos * sc; n = aNor / sc; }
  if (kind == 0 && iCol.a < 0.999 && uShape == 0) l.xy *= mix(1.0, iCol.a, aPos.z * 0.5 + 0.5);   // a branch narrows toward its end
  vec4 q = uShape == 2 ? uCamQ : iQuat;
  vec4 v = uMV * vec4(iPos + rot(q, l * grow), 1.0);
  vN = mat3(uMV) * rot(q, n); vV = v.xyz; vCol = iCol; vMat = iMat; vL = aPos;
  gl_Position = uP * v;
}`;
export const SOLID_FS = HEAD + LIGHT + `
in vec3 vN; in vec3 vV; in vec4 vCol; in vec3 vMat; in vec3 vL; out vec4 o;
uniform vec4 uBody[8], uDot[8], uVac[8];
uniform float uFlash[64];
uniform vec4 uFog;                  // colour and thickness of what the view is inside (the vacuole's water)
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  int kind = int(vMat.x + 0.5), idx = int(vMat.z + 0.5);
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0), v = normalize(-vV);
  float ndl = max(dot(n, uSun), 0.0), ndv = max(dot(n, v), 0.0), rim = pow(1.0 - ndv, 3.0);
  float spec = pow(max(dot(n, normalize(uSun + v)), 0.0), 40.0);
  vec3 c = vCol.rgb; float a = 1.0;
  if (kind == 0) c = c * (0.32 + 0.68 * ndl) + vec3(0.9, 0.6, 0.45) * 0.12 * rim;
  else if (kind == 1) { a = vCol.a + (1.0 - vCol.a) * 0.3 * rim * rim; c = c * (0.55 + 0.45 * ndl) + 0.3 * spec; }
  else if (kind == 2) { vec4 t = uVac[idx]; c = t.rgb * (0.55 + 0.45 * ndv + 0.25 * ndl); a = t.a; }
  else if (kind == 3 || kind == 7 || kind == 8 || kind == 9) {
    if (vCol.a > 0.5) { float f = uFlash[idx]; c = c * (0.85 + 0.35 * ndv) + c * 1.6 * f + vec3(1.0) * 0.9 * f * f; }      // the bonds whose electrons take in light
    else c = c * (0.35 + 0.65 * ndl) + 0.25 * spec;
  }
  else if (kind == 4) {
    vec3 p = vL * 3.2, id = floor(p); float d = 9.0;
    for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec3 cell = id + vec3(i, j, k); d = min(d, length(cell + vec3(hash3(cell), hash3(cell + 3.1), hash3(cell + 5.7)) - p)); }
    c = mix(uDot[idx].rgb, uBody[idx].rgb, smoothstep(0.28, 0.42, d)) * (0.62 + 0.5 * ndl) + 0.3 * spec + uBody[idx].rgb * 0.35 * rim;
  }
  else if (kind == 5) { vec3 m = uDot[0].rgb * 1.2; c = m * (0.45 + 0.55 * ndl) + 0.3 * spec + m * 0.4 * rim; }
  else if (kind == 6) { c = uBody[idx].rgb * (0.7 + 0.3 * ndl) + 0.6 * spec; a = 0.3 + 0.6 * rim; }
  else if (kind == 14) c = uBody[idx].rgb * (0.75 + 0.5 * ndl) + 0.4 * spec;
  else if (kind == 10) { float r = length(vL.xy); float w = fwidth(r); a = smoothstep(0.78 - w, 0.78, r) * (1.0 - smoothstep(0.92, 0.92 + w, r)); if (a < 0.01) discard; }
  else if (kind == 11) { float w = fwidth(vL.y); a = 1.0 - smoothstep(0.5, 0.5 + w, abs(vL.y)); if (a < 0.01) discard; }
  else if (kind == 12) { float r = length(vL.xy); a = exp(-r * r * 7.0); c = c * 1.3 + vec3(0.35) * exp(-r * r * 40.0); if (a < 0.01) discard; }
  else if (kind == 13) { float r = length(vL.xy), w = max(1.6 * vMat.y * vCol.a, fwidth(r) * 0.5); a = smoothstep(1.0 - 2.0 * w, 1.0 - w, r) * (1.0 - smoothstep(1.0 - w, 1.0, r)); c = vec3(1.0); if (a < 0.01) discard; }
  if (uFog.a > 0.0 && kind != 12 && kind != 13) c = mix(uFog.rgb, c, exp(-uFog.a * length(vV)));
  o = vec4(c, a);
}`;

// ---- the face of a membrane: the heads of its fat molecules, packed side by side ------------------
export const MEMB_VS = HEAD + `
layout(location=0) in vec3 aPos;
uniform mat4 uMV, uP; uniform float uR;
out vec2 vXY; out vec3 vV;
void main() { vec3 w = vec3(aPos.xy * uR, 0.0); vXY = w.xy; vec4 v = uMV * vec4(w, 1.0); vV = v.xyz; gl_Position = uP * v; }`;
export const MEMB_FS = HEAD + LIGHT + `
in vec2 vXY; in vec3 vV; out vec4 o;
uniform float uR; uniform vec3 uTint; uniform mat3 uN;     // uN: the membrane's own axes in the camera's frame
void main() {
  if (length(vXY) > uR) discard;
  // heads 0.8 nm apart, in rows that interlock
  vec2 g = vec2(vXY.x / 0.8, vXY.y / 0.693); float row = floor(g.y + 0.5); g.x += 0.5 * mod(row, 2.0);
  vec2 d = vec2((fract(g.x + 0.5) - 0.5) * 0.8, (g.y - row) * 0.693); float r = length(d) / 0.42;
  float px = fwidth(vXY.x) / 0.8, flat_ = clamp(px * 1.5 - 0.3, 0.0, 1.0);                     // once a head is smaller than a pixel only the average is seen
  vec3 nl = r < 1.0 ? normalize(vec3(d / 0.42, sqrt(1.0 - r * r) * 1.3)) : vec3(0.0, 0.0, 1.0);
  nl = normalize(mix(nl, vec3(0.0, 0.0, 1.0), flat_));
  vec3 n = normalize(uN * nl), v = normalize(-vV);
  float shade = mix(r < 1.0 ? 1.0 : 0.6, 0.85, flat_);
  vec3 c = uTint * shade * (0.45 + 0.55 * max(dot(n, uSun), 0.0)) + 0.25 * pow(max(dot(n, normalize(uSun + v)), 0.0), 30.0) * (1.0 - flat_);
  o = vec4(c, 1.0);
}`;
