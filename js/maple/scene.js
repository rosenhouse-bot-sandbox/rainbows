// Everything from the whole tree down to the surface of one leaf, drawn in metres with one camera.
// cam = { k: CSS pixels per metre, ox, oy: where the world's (0,0) falls on screen, W, H, dpr }.
import { leafRGB, css, pigments, clamp, smooth, mix } from './model.js';
import { buildTree, leafShape, place, SPOT } from './tree.js';

const poly = (lists) => { const p = new Path2D(); for (const pts of lists) { p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); } return p; };
const lines = (lists) => { const p = new Path2D(); for (const [a, b] of lists) { p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); } return p; };
const hash = (i, j) => { let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const BG = [5, 7, 15];
const SKY = [[0, '#060916'], [0.35, '#0e1838'], [0.62, '#243061'], [0.8, '#5a4a76'], [0.91, '#a7697a'], [1, '#e2a274']];
const SKY_TOP = 15, SKY_FOOT = 1.1, LAWN = 0.55;          // metres: the sky's gradient runs between these; the lawn's far edge
// two lines of far trees, as heights in metres at each x
const far1 = (x) => 4.3 + 0.9 * Math.sin(x * 0.21 + 1.3) + 0.5 * Math.sin(x * 0.53 + 0.4) + 0.28 * Math.abs(Math.sin(x * 1.1 + 2));
const far2 = (x) => 2.9 + 0.7 * Math.sin(x * 0.33 + 4.0) + 0.45 * Math.abs(Math.sin(x * 0.9 + 1)) + 0.22 * Math.abs(Math.sin(x * 2.3));

export function makeScene() {
  const tree = buildTree(), L = tree.leaves, F = tree.focus;
  const P = { tiny: poly(leafShape.tiny), plain: poly(leafShape.plain), toothed: poly(leafShape.toothed), veins: lines(leafShape.veins), side: lines(leafShape.side) };
  const S = L.map(() => ({}));                             // each leaf's place and colour on the current day
  const fo = S[L.indexOf(F)];
  let day = -1;
  const tmp = { chl: 0, car: 0, anth: 0 };

  function update(d) {
    if (d === day) return; day = d;
    for (let i = 0; i < L.length; i++) {
      const l = L[i], o = place(l, d, S[i]);
      const c = leafRGB(o.p), lit = (0.5 + 0.5 * l.z) * (0.9 + 0.2 * l.r3);
      o.rgb = c; o.lit = lit; o.col = css(c, lit);
    }
  }
  // The leaf blade's colour a few days earlier or later than the leaf as a whole: green lasts longest by the veins.
  const shade = (l, o, dd, k = 1) => { const p = pigments(day + dd, l.T); tmp.chl = p.chl; tmp.car = p.car; tmp.anth = p.anth; return css(leafRGB(tmp), o.lit * k); };

  // world position of a point given in a leaf's own units
  const at = (l, o, u, v) => { const m = l.len * o.size * o.near, c = Math.cos(o.a), s = Math.sin(o.a); return [o.x + m * (c * u - s * v), o.y + o.q * m * (s * u + c * v)]; };
  const spot = () => at(F, fo, SPOT[0], SPOT[1]);
  // the middle of the leaf-scale picture: the hanging leaf with its stalk, then the blade alone once it falls
  const leafCentre = () => {
    const hang = [F.nx + Math.cos(F.pa) * F.pl * 0.5 + Math.cos(F.ang) * F.len * 0.5, F.ny + Math.sin(F.pa) * F.pl * 0.5 + Math.sin(F.ang) * F.len * 0.5];
    const blade = at(F, fo, 0.42, 0), t = smooth(fo.p.fall * 5);
    return [mix(hang[0], blade[0], t), mix(hang[1], blade[1], t)];
  };

  function setLeaf(ctx, cam, l, o) {
    const m = cam.k * cam.dpr * l.len * o.size * o.near, c = Math.cos(o.a), s = Math.sin(o.a);
    ctx.setTransform(m * c, -m * o.q * s, -m * s, -m * o.q * c, (cam.ox + cam.k * o.x) * cam.dpr, (cam.oy - cam.k * o.y) * cam.dpr);
    return m / cam.dpr;                                    // CSS pixels per leaf length
  }
  function drawLeaf(ctx, cam, l, o) {
    const px = cam.k * l.len * o.size * o.near;
    const X = cam.ox + cam.k * o.x, Y = cam.oy - cam.k * o.y;
    if (X < -px || X > cam.W + px || Y < -px || Y > cam.H + px) return;
    if (px < 2.2) { ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0); ctx.fillStyle = o.col; ctx.fillRect(X - px * 0.45, Y - px * 0.45, px * 0.9, px * 0.9); return; }
    setLeaf(ctx, cam, l, o);
    if (px < 44) { ctx.fillStyle = o.col; ctx.fill(px < 9 ? P.tiny : P.plain); return; }
    const g = ctx.createRadialGradient(0.1, 0, 0.05, 0.25, 0, 0.85);
    g.addColorStop(0, shade(l, o, -5, 1.08)); g.addColorStop(0.5, o.col); g.addColorStop(1, shade(l, o, 4, 0.84));
    ctx.fillStyle = g; ctx.fill(px > 150 ? P.toothed : P.plain);
    const v = clamp((px - 44) / 60);
    ctx.strokeStyle = shade(l, o, -9, 1.22); ctx.lineCap = 'round';
    ctx.globalAlpha = 0.75 * v; ctx.lineWidth = Math.max(1 / px, 0.011); ctx.stroke(P.veins);
    if (px > 110) { ctx.globalAlpha = 0.4 * clamp((px - 110) / 120); ctx.lineWidth = Math.max(0.7 / px, 0.004); ctx.stroke(P.side); }
    ctx.globalAlpha = 1;
  }
  const world = (ctx, cam) => ctx.setTransform(cam.k * cam.dpr, 0, 0, -cam.k * cam.dpr, cam.ox * cam.dpr, cam.oy * cam.dpr);

  function backdrop(ctx, cam) {
    const { W, H, k, ox, oy, dpr } = cam, Y = (y) => oy - k * y, wx = (X) => (X - ox) / k;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, Y(SKY_TOP), 0, Y(SKY_FOOT));
    for (const [t, c] of SKY) g.addColorStop(t, c);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(ox + k * 6.5, Y(1.2), 0, ox + k * 6.5, Y(1.2), k * 10);    // the low Sun, off to the right
    sun.addColorStop(0, 'rgba(255,200,140,.42)'); sun.addColorStop(0.4, 'rgba(255,170,120,.14)'); sun.addColorStop(1, 'rgba(255,170,120,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    const ridge = (f, col, haze, foot, top) => {
      ctx.beginPath(); ctx.moveTo(0, Y(foot));
      for (let X = 0; X <= W + 4; X += 4) ctx.lineTo(X, Y(f(wx(X))));
      ctx.lineTo(W, Y(foot)); ctx.closePath();
      const h = ctx.createLinearGradient(0, Y(top), 0, Y(LAWN)); h.addColorStop(0, col); h.addColorStop(1, haze); ctx.fillStyle = h; ctx.fill();
    };
    ridge(far1, '#1d2150', '#4b3f6d', 0, 5.6); ridge(far2, '#0c1126', '#1c2440', 0, 4);
    const lawn = ctx.createLinearGradient(0, Y(LAWN), 0, Y(-2.6));
    lawn.addColorStop(0, '#2b4a33'); lawn.addColorStop(0.08, '#1d3a2a'); lawn.addColorStop(0.6, '#10241c'); lawn.addColorStop(1, '#070d12');
    ctx.fillStyle = lawn; ctx.fillRect(0, Y(LAWN), W, Math.max(0, H - Y(LAWN)));
    // the tree's shadow
    world(ctx, cam);
    const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); sh.addColorStop(0, 'rgba(3,6,10,.5)'); sh.addColorStop(1, 'rgba(3,6,10,0)');
    ctx.save(); ctx.translate(-0.3, -0.05); ctx.scale(3.6, 0.5); ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill(); ctx.restore();
  }
  function branches(ctx, cam, back) {
    world(ctx, cam); ctx.lineCap = 'round';
    const minw = 0.7 / cam.k, x0 = -cam.ox / cam.k - 0.5, x1 = (cam.W - cam.ox) / cam.k + 0.5, y1 = cam.oy / cam.k + 0.5, y0 = (cam.oy - cam.H) / cam.k - 0.5;
    for (const s of tree.segs) {
      if ((s.z < 0.5) !== back) continue;
      if (Math.max(s.x0, s.x1) < x0 || Math.min(s.x0, s.x1) > x1 || Math.max(s.y0, s.y1) < y0 || Math.min(s.y0, s.y1) > y1) continue;
      const w = (s.w0 + s.w1) / 2, thin = clamp(1 - w / 0.02);
      ctx.strokeStyle = back ? css([0.075 + 0.04 * thin, 0.065, 0.085]) : css([0.2 + 0.1 * thin, 0.155 + 0.01 * thin, 0.15]);
      ctx.lineWidth = Math.max(w, minw);
      ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.quadraticCurveTo(s.cx, s.cy, s.x1, s.y1); ctx.stroke();
      if (!back && w * cam.k > 5) {                        // low light from the right catches the bark
        ctx.strokeStyle = 'rgba(226,150,110,.2)'; ctx.lineWidth = w * 0.28; const d = w * 0.3;
        ctx.beginPath(); ctx.moveTo(s.x0 + d, s.y0); ctx.quadraticCurveTo(s.cx + d, s.cy, s.x1 + d, s.y1); ctx.stroke();
      }
    }
  }
  // stalks and next year's buds: only worth drawing from close by
  function stalks(ctx, cam) {
    if (cam.k < 260) return;
    world(ctx, cam); ctx.lineCap = 'round';
    const a = clamp((cam.k - 260) / 400), x0 = -cam.ox / cam.k - 0.1, x1 = (cam.W - cam.ox) / cam.k + 0.1, y1 = cam.oy / cam.k + 0.1, y0 = (cam.oy - cam.H) / cam.k - 0.1;
    ctx.globalAlpha = a;
    for (let i = 0; i < L.length; i++) {
      const l = L[i], o = S[i];
      // the stalk falls with the leaf: the break is where the stalk meets the twig
      const ta = o.a - l.ang + l.pa, m = l.pl * o.size * o.near, tx = o.state ? o.x - Math.cos(ta) * m : l.nx, ty = o.state ? o.y - Math.sin(ta) * m * o.q : l.ny;
      if (Math.max(tx, o.x) < x0 || Math.min(tx, o.x) > x1 || Math.max(ty, o.y) < y0 || Math.min(ty, o.y) > y1) continue;
      ctx.strokeStyle = css([0.62, 0.2, 0.2], o.lit); ctx.lineWidth = Math.max(0.0011 * (0.4 + 0.6 * o.size), 0.8 / cam.k);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(o.x, o.y); ctx.stroke();
      if (!o.state && o.p.absc > 0.02 && cam.k > 1500) {               // the separation layer, a pale ring round the foot of the stalk
        const c = Math.cos(l.pa), s = Math.sin(l.pa), r = 0.0011, d = 0.0016;
        ctx.strokeStyle = css([0.95, 0.85, 0.62], 1, o.p.absc); ctx.lineWidth = 0.0005;
        ctx.beginPath(); ctx.moveTo(l.nx + c * d - s * r, l.ny + s * d + c * r); ctx.lineTo(l.nx + c * d + s * r, l.ny + s * d - c * r); ctx.stroke();
      }
    }
    if (cam.k > 900) {
      ctx.fillStyle = '#6d2a2c';
      for (const n of tree.nodes) {
        if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue;
        for (const side of [1, -1]) { const b = n.a + side * 0.7; ctx.beginPath(); ctx.ellipse(n.x + Math.cos(b) * 0.0018, n.y + Math.sin(b) * 0.0018, 0.0017, 0.0008, b, 0, 7); ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;
  }
  // the net of small veins, seen once the leaf is a few centimetres across the screen
  function net(ctx, cam, clip) {
    const mm = cam.k * 1e-3, a = smooth((mm - 12) / 30);
    if (a <= 0) return;
    const [fx, fy] = spot(), X0 = cam.ox + cam.k * fx, Y0 = cam.oy - cam.k * fy, side = 0.42, dx = side * Math.sqrt(3), dy = side * 1.5;
    ctx.save();
    if (clip) { setLeaf(ctx, cam, F, fo); ctx.clip(P.plain); }
    ctx.setTransform(mm * cam.dpr, 0, 0, -mm * cam.dpr, X0 * cam.dpr, Y0 * cam.dpr);
    const j0 = Math.floor((Y0 - cam.H) / mm / dy) - 1, j1 = Math.ceil(Y0 / mm / dy) + 1, i0 = Math.floor(-X0 / mm / dx) - 1, i1 = Math.ceil((cam.W - X0) / mm / dx) + 1;
    if ((j1 - j0) * (i1 - i0) < 9000) {
      const vx = (x, y) => { const i = Math.round(x / side * 4), j = Math.round(y / side * 4); return [x + (hash(i, j) - 0.5) * side * 0.5, y + (hash(j + 91, i - 37) - 0.5) * side * 0.5]; };
      ctx.beginPath();
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx = (i + (j & 1) * 0.5) * dx, cy = j * dy; let p = null;
        for (let q = 0; q < 4; q++) { const t = Math.PI / 6 + q * Math.PI / 3, v = vx(cx + side * Math.cos(t), cy + side * Math.sin(t)); if (q) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); p = v; }
      }
      ctx.strokeStyle = shade(F, fo, -9, 1.2); ctx.globalAlpha = 0.3 * a; ctx.lineWidth = Math.max(0.016, 0.8 / mm); ctx.lineJoin = 'round'; ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // Draws the scene. Returns the colour of the leaf at the point the deeper scales look into.
  function draw(ctx, cam) {
    const here = shade(F, fo, -1.5), flat = smooth((cam.k - 1.2e5) / 2.5e5);
    if (flat < 1) {
      backdrop(ctx, cam);
      const lv = (lo, hi, st) => { for (let i = 0; i < L.length; i++) { const l = L[i], o = S[i]; if (o.state === st && l.z >= lo && l.z < hi && (st !== 2 || (l.gy >= 0) === (lo === 0))) drawLeaf(ctx, cam, l, o); } };
      for (let i = 0; i < L.length; i++) if (S[i].state === 2 && L[i].gy >= 0) drawLeaf(ctx, cam, L[i], S[i]);      // fallen, on the far lawn
      branches(ctx, cam, true);
      lv(0, 0.5, 0); lv(0, 0.5, 1);
      branches(ctx, cam, false); stalks(ctx, cam);
      lv(0.5, 2, 0); lv(0.5, 2, 1);
      for (let i = 0; i < L.length; i++) if (S[i].state === 2 && L[i].gy < 0) drawLeaf(ctx, cam, L[i], S[i]);       // fallen, on the near lawn
      net(ctx, cam, true);
    }
    if (flat > 0) {
      ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0); ctx.globalAlpha = flat; ctx.fillStyle = here; ctx.fillRect(0, 0, cam.W, cam.H); ctx.globalAlpha = 1;
      net(ctx, cam, false);
    }
    return here;
  }
  return { tree, update, draw, spot, leafCentre, focus: () => fo, focusAt: (dd) => dd ? pigments(day + dd, F.T) : fo.p, count: L.length, BG };
}
