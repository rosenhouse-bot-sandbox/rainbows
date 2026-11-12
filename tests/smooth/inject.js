// Runs in the page before any of the site's own code (Playwright addInitScript). It changes nothing
// in the site: it replaces the clock, watches what the page sends to WebGL, and samples the result.
(() => {
  'use strict';
  // ---------- a clock that only moves when the test says so ----------
  let vnow = 1000, rafId = 0;
  const rafQ = new Map(), realRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => { rafQ.set(++rafId, cb); return rafId; };
  window.cancelAnimationFrame = id => { rafQ.delete(id); };
  Performance.prototype.now = function () { return vnow; };

  // CSS transitions and animations run on the same clock: each is paused and moved by hand.
  const animStart = new WeakMap();
  function stepAnimations() {
    for (const a of document.getAnimations()) {
      if (!animStart.has(a)) { animStart.set(a, vnow); try { a.pause(); a.currentTime = 0; } catch { } continue; }
      try { a.currentTime = vnow - animStart.get(a); } catch { }
    }
  }

  // ---------- what the page asks WebGL to draw ----------
  const GL = WebGL2RenderingContext.prototype;
  const locName = new WeakMap(), progInfo = new WeakMap();
  let cur = null, lastSub = null, frameDraws = [], bad = [];
  const uni = {};       // values of the current program's uniforms we care about
  const wrap = (name, fn) => { const orig = GL[name]; GL[name] = function (...a) { fn.call(this, a); return orig.apply(this, a); }; };
  { const orig = GL.getUniformLocation; GL.getUniformLocation = function (p, n) { const l = orig.call(this, p, n); if (l) locName.set(l, n); let i = progInfo.get(p); if (!i) progInfo.set(p, i = { names: new Set(), u: {} }); i.names.add(n); return l; }; }
  let lastLink = 0; wrap('linkProgram', () => { lastLink = Date.now(); });
  wrap('useProgram', a => { cur = progInfo.get(a[0]) || null; lastProg = cur; });
  const finite = v => { if (typeof v === 'number') return Number.isFinite(v); for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) return false; return true; };
  const note = (kind, what) => { if (bad.length < 50) bad.push({ kind, what }); };
  for (const f of ['uniform1f', 'uniform2f', 'uniform3f', 'uniform4f', 'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv'])
    wrap(f, a => {
      const n = locName.get(a[0]); if (!n) return;
      const v = f.endsWith('v') ? a[1] : a.slice(1);
      if (!finite(v)) note('uniform', n + ' = ' + Array.from(v).join(','));
      if (cur) cur.u[n] = f.endsWith('v') ? Array.from(v) : v;
    });
  wrap('uniformMatrix4fv', a => { const n = locName.get(a[0]); if (!n) return; if (!finite(a[2])) note('uniform', n + ' (matrix) has a non-finite entry'); if (cur) cur.u[n] = Array.from(a[2]); });
  wrap('bufferSubData', a => { const d = a[2]; if (d instanceof Float32Array) lastSub = { d, len: a[4] ?? d.length }; });
  const mul4 = (m, x, y, z) => { const w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, w]; };
  const mm = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
  wrap('drawArraysInstanced', a => {
    if (!cur || !lastSub) return;
    const kind = cur.names.has('uMinPx') ? 'points' : cur.names.has('uDash') ? 'lines' : null; if (!kind) return;
    const n = a[3], stride = kind === 'points' ? 8 : 16, d = lastSub.d;
    const m = cur.u.uVP && cur.u.uModel ? mm(cur.u.uVP, cur.u.uModel) : null, gain = cur.u.uGain?.[0] ?? 1;
    const rec = { kind, n, gain };
    let nonfinite = 0;
    if (kind === 'points') {
      // where each point lands on screen, in the order the page drew them
      const xy = new Float32Array(n * 2); let lit = 0;
      for (let i = 0; i < n; i++) {
        const o = i * stride;
        for (let k = 0; k < 8; k++) if (!Number.isFinite(d[o + k])) { nonfinite++; break; }
        const p = m ? mul4(m, d[o], d[o + 1], d[o + 2]) : [0, 0, 1];
        const vis = p[2] > 0 && d[o + 6] * gain > 0.004;
        xy[i * 2] = vis ? p[0] : NaN; xy[i * 2 + 1] = vis ? p[1] : NaN; if (vis) lit++;
      }
      rec.xy = xy; rec.lit = lit;
    } else {
      // how much line is on screen: length times brightness, roughly what the eye integrates
      let ink = 0, lit = 0;
      for (let i = 0; i < n; i++) {
        const o = i * stride;
        for (let k = 0; k < 16; k++) if (!Number.isFinite(d[o + k])) { nonfinite++; break; }
        const al = (Math.abs(d[o + 9]) + Math.abs(d[o + 13])) * 0.5 * gain; if (!(al > 0.004) || !m) continue;
        const p = mul4(m, d[o], d[o + 1], d[o + 2]), q = mul4(m, d[o + 3], d[o + 4], d[o + 5]);
        if (p[2] <= 0 || q[2] <= 0) continue;
        const cl = v => Math.max(-1.5, Math.min(1.5, v));
        ink += Math.hypot(cl(p[0]) - cl(q[0]), cl(p[1]) - cl(q[1])) * Math.min(al, 4); lit++;
      }
      rec.ink = ink; rec.lit = lit;
    }
    if (nonfinite) note('vertex', `${nonfinite} of ${n} ${kind} have a non-finite value`);
    frameDraws.push(rec);
  });

  // ---------- what the shaders wrote ----------
  // The page draws into floating-point targets, where a shader's 0/0 or overflow is kept as NaN or
  // infinity and then smeared by the bloom into a bright blob. The 8-bit canvas cannot show which
  // pixel did it, so each full-size target is read back as floats when the page moves on from it.
  // With __smoothDeep set it is read after every draw, which names the draw that did it.
  let boundFb = null, dirty = false, vp = [0, 0, 0, 0], drawNo = 0, fbBuf = null, lastProg = null, inCheck = false;
  const fbSeen = new WeakMap();
  const progName = () => (lastProg ? [...lastProg.names].filter(n => !/^u(VP|Model|Res|Px|Eye|R|U|F|Proj|Time|Fade)$/.test(n)).slice(0, 6).join(' ') || 'plain' : '?');
  function checkTarget(gl, why) {
    if (!boundFb || !dirty || inCheck) return; dirty = false;
    const w = vp[2], h = vp[3], cv = gl.canvas; if (w !== cv.width || h !== cv.height) return;      // the full-size targets only
    if (!gl.getExtension('EXT_color_buffer_float')) return;
    inCheck = true;
    if (!fbBuf || fbBuf.length !== w * h * 4) fbBuf = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, fbBuf);
    inCheck = false;
    if (gl.getError()) return;
    let nan = 0, inf = 0, big = 0, at = -1, neg = 0;
    for (let i = 0; i < fbBuf.length; i += 4) for (let k = 0; k < 3; k++) {
      const v = fbBuf[i + k];
      if (v !== v) { nan++; if (at < 0) at = i; } else if (v === Infinity || v === -Infinity) { inf++; if (at < 0) at = i; } else if (v > 6e4) { big++; if (at < 0) at = i; } else if (v < -1e-3) neg++;
    }
    if (nan || inf || big) { const px = at / 4; note('pixel', `${nan ? nan + ' NaN ' : ''}${inf ? inf + ' infinite ' : ''}${big ? big + ' overflowing ' : ''}value${nan + inf + big > 1 ? 's' : ''} in a render target, first at ${(px % w / w).toFixed(2)}, ${(1 - Math.floor(px / w) / h).toFixed(2)} of the way across and down (${why})`); }
    else if (neg > 0 && !fbSeen.get(boundFb)) { fbSeen.set(boundFb, 1); note('pixel-negative', `${neg} negative values in a render target (${why})`); }
  }
  { const orig = GL.bindFramebuffer; GL.bindFramebuffer = function (t, fb) { if (fb !== boundFb) { checkTarget(this, 'whole pass'); boundFb = fb; dirty = false; drawNo = 0; } return orig.call(this, t, fb); }; }
  wrap('viewport', a => { vp = a.slice(0, 4); });
  for (const f of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const orig = GL[f]; GL[f] = function (...a) { const r = orig.apply(this, a); dirty = true; drawNo++; if (window.__smoothDeep) checkTarget(this, `draw ${drawNo} of the pass, shader with ${progName()}`); return r; };
  }

  // ---------- sampling ----------
  const LW = 64, LH = 40, MW = 256, MH = 160, HX = 16, HY = 10;
  let small, mid, prevDraws = null, prevMid = null;
  // boxes are measured in the panel's own scrolled content, so that scrolling it is not a "move"
  const rect = el => { const r = el.getBoundingClientRect(), p = document.getElementById('panel'), inP = p && p !== el && p.contains(el); return [r.left + (inP ? p.scrollLeft : 0) + scrollX, r.top + (inP ? p.scrollTop : 0) + scrollY, r.width, r.height].map(v => Math.round(v * 10) / 10); };
  function layoutSample() {
    const out = {};
    const add = (key, el) => { if (el && el.getClientRects().length) out[key] = rect(el); };
    add('panel', document.getElementById('panel'));
    for (const id of ['cap', 'capTitle', 'capBody', 'stages', 'readout', 'prev', 'next', 'pause', 'resetView', 'hint']) add('#' + id, document.getElementById(id));
    add('.topright', document.querySelector('.topright')); add('.scalebar', document.querySelector('.scalebar'));
    document.querySelectorAll('.ctl').forEach(el => add('ctl:' + el.dataset.c, el));
    document.querySelectorAll('.ctl input, .ctl button').forEach(el => add('in:' + (el.id || Object.values(el.dataset)[0]), el));
    return out;
  }
  function labelSample() {
    const box = document.getElementById('labels'); if (!box) return [];
    const off = box.classList.contains('off') || getComputedStyle(box).opacity === '0';
    const out = [];
    for (const el of box.children) {
      if (el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      out.push({ t: el.textContent, x: Math.round(r.left * 10) / 10, y: Math.round((r.top + r.height / 2) * 10) / 10, off });
    }
    return out;
  }
  function drawSample() {
    // compare this frame's point batches with the last frame's, batch by batch and point by point
    const draws = frameDraws; frameDraws = [];
    const pts = draws.filter(d => d.kind === 'points'), lines = draws.filter(d => d.kind === 'lines');
    // where the points are, whatever order they were drawn in: a coarse grid of counts
    const hist = new Array(HX * HY).fill(0);
    for (const d of pts) for (let i = 0; i < d.xy.length; i += 2) { const x = d.xy[i], y = d.xy[i + 1]; if (Number.isNaN(x) || Math.abs(x) >= 1 || Math.abs(y) >= 1) continue; hist[Math.floor((y + 1) / 2 * HY) * HX + Math.floor((x + 1) / 2 * HX)]++; }
    const out = { hist, points: pts.reduce((a, d) => a + d.lit, 0), ink: lines.reduce((a, d) => a + d.ink, 0), segs: lines.reduce((a, d) => a + d.lit, 0), batches: draws.length };
    if (prevDraws) {
      const pp = prevDraws.filter(d => d.kind === 'points');
      const moves = []; let appeared = 0, vanished = 0;
      if (pp.length === pts.length) for (let b = 0; b < pts.length; b++) {
        const A = pp[b].xy, B = pts[b].xy; if (A.length !== B.length) { out.recount = true; continue; }
        for (let i = 0; i < B.length; i += 2) {
          const va = !Number.isNaN(A[i]), vb = !Number.isNaN(B[i]);
          if (va && vb) moves.push(Math.hypot(B[i] - A[i], B[i + 1] - A[i + 1])); else if (vb) appeared++; else if (va) vanished++;
        }
      } else out.recount = true;
      moves.sort((a, b) => a - b);
      const med = moves.length ? moves[moves.length >> 1] : 0;
      out.moveMed = med; out.moveP95 = moves.length ? moves[Math.floor(moves.length * 0.95)] : 0;
      out.jumped = moves.filter(v => v > 0.08 && v > 8 * med).length; out.tracked = moves.length; out.appeared = appeared; out.vanished = vanished;
    }
    prevDraws = draws;
    return out;
  }
  function imageSample(wantJpeg) {
    const cv = document.getElementById('view');
    if (!small) { small = new OffscreenCanvas(LW, LH).getContext('2d', { willReadFrequently: true }); mid = Object.assign(document.createElement('canvas'), { width: MW, height: MH }).getContext('2d', { willReadFrequently: true }); mid.imageSmoothingQuality = 'high'; }
    mid.drawImage(cv, 0, 0, MW, MH); small.drawImage(mid.canvas, 0, 0, LW, LH);
    const px = small.getImageData(0, 0, LW, LH).data, rgb = new Uint8Array(LW * LH * 3);
    for (let i = 0, j = 0; i < px.length; i += 4) { rgb[j++] = px[i]; rgb[j++] = px[i + 1]; rgb[j++] = px[i + 2]; }
    // fine detail: the largest change of any one pixel of the mid-size frame, and how many changed a lot
    const m = mid.getImageData(0, 0, MW, MH).data; let peak = 0, hot = 0, warm = 0;
    if (prevMid) for (let i = 0; i < m.length; i += 4) { const d = Math.max(Math.abs(m[i] - prevMid[i]), Math.abs(m[i + 1] - prevMid[i + 1]), Math.abs(m[i + 2] - prevMid[i + 2])); if (d > peak) peak = d; if (d > 70) hot++; if (d > 30) warm++; }
    prevMid = m;
    let s = ''; for (let i = 0; i < rgb.length; i++) s += String.fromCharCode(rgb[i]);
    return { rgb: btoa(s), peak, hot, warm };
  }
  const midJpeg = () => mid.canvas.toDataURL('image/jpeg', 0.82).split(',')[1];      // (encoded at once: the asynchronous encoder waits for idle time)
  const realFrame = () => new Promise(r => realRAF(() => setTimeout(r, 0)));

  window.__smooth = {
    LW, LH, MW, MH, HX, HY,
    ready: () => !!window.__rainbows && Date.now() - lastLink > 400,
    // advance the page by one frame of `ms` and report what it now shows
    async step(ms) {
      const t0 = Date.now(); vnow += ms; stepAnimations();
      const cbs = [...rafQ.values()]; rafQ.clear(); frameDraws = [];
      for (const cb of cbs) cb(vnow);
      const t1 = Date.now(); const img = imageSample(); const t2 = Date.now();
      await realFrame(); const t3 = Date.now();      // lets observers and style changes land before the layout is read
      stepAnimations();
      const r = window.__rainbows, S = r ? { ...r.S } : null, tr = r?.tr ? { hi: r.tr.hi, q: r.tr.q, E: r.tr.E, dir: r.tr.dir, v: r.tr.v, hop: !!r.tr.hop } : null;
      const cam = r ? r.cams.map(c => [c.yaw, c.pitch, c.dist]) : null;
      const sliders = {}; document.querySelectorAll('input[type=range]').forEach(el => { if (el.getClientRects().length) sliders[el.id] = +el.value; });
      const ta = Date.now(), layout = layoutSample(), tb = Date.now(), labels = labelSample(), tc = Date.now(), gl = drawSample(), td = Date.now(), jpg = midJpeg(), te = Date.now();
      const out = { t: vnow, S, tr, cam, sliders, layout, labels, gl, img: img.rgb, peak: img.peak, hot: img.hot, warm: img.warm, jpg, bad }; out.ms = [t1 - t0, t2 - t1, t3 - t2, tb - ta, tc - tb, td - tc, te - td];
      bad = [];
      return out;
    },
    // run frames without sampling (to settle)
    async skip(n, ms) { for (let i = 0; i < n; i++) { vnow += ms; stepAnimations(); const cbs = [...rafQ.values()]; rafQ.clear(); for (const cb of cbs) cb(vnow); } frameDraws = []; prevDraws = null; prevMid = null; await realFrame(); },
  };
})();
