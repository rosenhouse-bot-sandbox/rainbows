// Reads the traces run.mjs recorded and looks for anything that did not change smoothly.
// Nothing here knows what the page is meant to look like. It only knows that when the input moves a
// little, or not at all, the page should move a little: a frame that differs from its neighbours far
// more than they differ from each other is a jump, whatever is in it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const LW = 64, LH = 40, BW = 8;
const T = {      // thresholds; pictures are 0..255
  popAbs: 5, popK: 3, popB: 2.5,        // one frame changes K times more than the frames either side
  popWinK: 6,                             // ... or than is usual around it
  flash: 0.45,                            // a change that is mostly undone by the next frame
  same: 4, sameRoute: 7,                  // two pictures that should be one picture
  hotAbs: 25, hotK: 4,
  layout: 0.6,                            // px
  reshuffle: 0.2, count: 0.15, ink: 0.08, inkK: 4,
  dv: 0.12,
};
const KINDS = {
  'not-finite': 'A NaN or infinity was sent to WebGL',
  'error': 'The page or the scenario failed',
  'flash': 'One-frame flash',
  'jump': 'The picture jumps',
  'sparkle': 'Fine detail flickers',
  'layout': 'The layout moves',
  'under-pointer': 'A control moved as it was pressed',
  'slider': 'The slider does not follow the pointer',
  'particles': 'Particles reshuffle, appear or vanish together',
  'lines': 'Lines pop in or out',
  'labels': 'A label jumps or flickers',
  'flight': 'The flight between scales is not continuous',
  'round-trip': 'There and back does not give the same view',
  'route': 'The address does not bring back the same view',
  'state': 'State changed with no input',
};
const ORDER = Object.keys(KINDS);

const dec = b64 => Uint8Array.from(Buffer.from(b64, 'base64'));
// the largest mean change of any 8x8 block, and the mean over the whole frame
function diff(a, b) {
  let bmax = 0, sum = 0, at = 0;
  for (let by = 0; by < LH / BW; by++) for (let bx = 0; bx < LW / BW; bx++) {
    let s = 0;
    for (let y = by * BW; y < by * BW + BW; y++) for (let x = bx * BW; x < bx * BW + BW; x++) { const o = (y * LW + x) * 3; s += Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]); }
    s /= BW * BW * 3; sum += s; if (s > bmax) { bmax = s; at = by * (LW / BW) + bx; }
  }
  return { bmax, mean: sum / (LW * LH / BW / BW), at };
}
const median = v => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const where = at => { const x = at % (LW / BW), y = Math.floor(at / (LW / BW)); return `${['top', 'upper', 'middle', 'lower', 'bottom'][y]} ${['far left', 'left', 'left of centre', 'centre', 'centre', 'right of centre', 'right', 'far right'][x]}`; };
const rectDelta = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]));
const histDist = (a, b) => { let d = 0, n = 0; for (let i = 0; i < a.length; i++) { d += Math.abs(a[i] - b[i]); n += a[i] + b[i]; } return n ? d / n : 0; };
const normText = t => t.replace(/[\d.,]+/g, '#');
// labels are followed by their wording with the numbers taken out, and by which of several alike they are
const keyed = labels => { const n = new Map(); return labels.map(l => { const t = normText(l.t), k = n.get(t) ?? 0; n.set(t, k + 1); return [k ? `${t} (${k + 1})` : t, l]; }); };

// Particles are compared by how many are in each eighth of the screen. Which particle is where is
// chance, and two honest draws of the same stream differ cell by cell on a fine grid; a stream that has
// bunched up, emptied or moved shows on a coarse one.
const coarse = h => { const o = new Array(8).fill(0); for (let y = 0; y < 10; y++) for (let x = 0; x < 16; x++) o[(y < 5 ? 0 : 4) + (x >> 2)] += h[y * 16 + x]; return o; };
// how two moments that should show the same view differ. Playing, the particles and waves are never
// in the same places twice, so the last 60 frames before each moment are averaged (or `span` of them:
// enough to blur a travelling wave whatever its phase).
function compare(s, img, a, b, playing, span = 60) {
  const A = s[a], B = s[b], out = []; let sev = 0;
  const k = playing ? Math.min(span, b - a - 8, a + 1) : 1, avg = at => { const acc = new Float32Array(LW * LH * 3), hist = new Array(A.gl.hist.length).fill(0); let n = 0; for (let i = Math.max(0, at - k + 1); i <= at; i++) { n++; for (let j = 0; j < acc.length; j++) acc[j] += img[i][j]; s[i].gl.hist.forEach((v, j) => { hist[j] += v; }); } for (let j = 0; j < acc.length; j++) acc[j] /= n; return { img: acc, hist }; };
  const VA = avg(a), VB = avg(b), busy = Math.max(A.gl.points, B.gl.points) >= 50;
  const d = diff(VA.img, VB.img), limit = playing ? T.sameRoute : busy ? 2 * T.same : T.same;
  if (d.bmax > limit) { out.push(`the picture differs (by ${d.bmax.toFixed(1)} of 255, ${where(d.at)})`); sev = Math.max(sev, d.bmax / limit); }
  for (const key of Object.keys(A.S)) {
    if (key === 'crossPhi' ? Math.abs(A.S[key] - B.S[key]) > 1e-3 : typeof A.S[key] === 'number' ? Math.abs(A.S[key] - B.S[key]) > 1e-6 : A.S[key] !== B.S[key]) { out.push(`state ${key} is ${B.S[key]} and was ${A.S[key]}`); sev = Math.max(sev, 2); }
  }
  const moved = Object.keys(A.layout).filter(key => !B.layout[key] || rectDelta(A.layout[key], B.layout[key]) > T.layout), extra = Object.keys(B.layout).filter(key => !A.layout[key]);
  if (moved.length || extra.length) { out.push(`layout differs: ${[...moved, ...extra].slice(0, 5).map(key => `${key} ${A.layout[key] && B.layout[key] ? rectDelta(A.layout[key], B.layout[key]).toFixed(0) + ' px' : ''}`).join(', ')}`); sev = Math.max(sev, 2); }
  /* the same words within 4 px of where they were (rounding each place to a grid would call 681.9 and 682.0 different) */
  const lab = L => L.labels.map(l => l.t).sort().join('|'), labMoved = A.labels.some(l => !B.labels.some(m => m.t === l.t && Math.abs(m.x - l.x) < 4 && Math.abs(m.y - l.y) < 4));
  if (!playing && (lab(A) !== lab(B) || labMoved)) { out.push('the labels differ'); sev = Math.max(sev, 1.5); }
  const pa = A.gl.points, pb = B.gl.points;
  if (Math.abs(pa - pb) > 0.05 * Math.max(pa, pb) + 2) { out.push(`${pb} particles on screen, and ${pa} before`); sev = Math.max(sev, 2); }
  const hd = histDist(coarse(VA.hist), coarse(VB.hist));
  if (busy && hd > 0.2) { out.push(`the particles are spread differently (${(hd * 100).toFixed(0)}% of them are in another part of the screen)`); sev = Math.max(sev, hd / 0.2); }
  const ia = A.gl.ink, ib = B.gl.ink;
  if (Math.abs(ia - ib) / Math.max(ia, ib, 1e-6) > (playing ? 0.1 : 0.02)) { out.push(`${((ib / ia - 1) * 100).toFixed(0)}% more line drawn`); sev = Math.max(sev, 1.5); }
  return { out, sev };
}

export function analyze(traces) {
  const findings = [], perScenario = [];
  const accepted = (() => { try { return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'accepted.json'), 'utf8')).map(a => ({ ...a, re: new RegExp(a.scenario, 'i'), msg: a.match ? new RegExp(a.match, 'i') : null })); } catch { return []; } })();
  const add = (tr, kind, i, j, sev, msg, level = 'fail') => {
    const acc = accepted.find(a => a.kind === kind && a.re.test(tr.name) && (!a.msg || a.msg.test(msg)));
    findings.push({ scenario: tr.name, dir: tr.dir, kind, from: i, to: j, sev, msg, level: acc ? 'accepted' : level, why: acc?.reason, tag: tr.samples[i]?.tag });
  };

  for (const tr of traces) {
    const s = tr.samples, n = s.length, img = s.map(x => dec(x.img));
    for (const e of tr.errors) add(tr, 'error', Math.max(0, n - 1), Math.max(0, n - 1), 9, e);
    if (!n) continue;
    const d = [null], ev = s.map(x => !!x.ev), reloaded = s.map(x => !!x.ev?.reload), stageCh = s.map((x, i) => i > 0 && x.S.stage !== s[i - 1].S.stage);
    for (let i = 1; i < n; i++) d.push(diff(img[i - 1], img[i]));
    const sinceEv = []; { let c = 99; for (let i = 0; i < n; i++) { c = ev[i] ? 0 : c + 1; sinceEv.push(c); } }
    const bm = i => (i >= 1 && i < n ? d[i].bmax : 0);

    for (let i = 1; i < n; i++) {
      const x = s[i], p = s[i - 1], fast = /fast drag/.test(x.tag), rm = tr.reduced;
      // ---- numbers that are not numbers ----
      for (const b of x.bad) add(tr, 'not-finite', i, i, 9, `${b.kind}: ${b.what}`, b.kind === 'pixel-negative' ? 'note' : 'fail');

      // ---- the picture ----
      const a = bm(i);
      if (i + 1 < n && a > T.popAbs) {
        const c = diff(img[i - 1], img[i + 1]).bmax;
        if (c < T.flash * a && !ev[i + 1]) add(tr, 'flash', i, i, a / T.popAbs, `frame ${i} differs from the frames before and after it, which agree with each other (${a.toFixed(1)} of 255 at the ${where(d[i].at)}, then back to within ${c.toFixed(1)})`);
      }
      // the press that starts a flight between scales must not cut the picture: the flight is the change
      if (ev[i] && x.tr && !p.tr && !x.tr.hop && a > 30) add(tr, 'jump', i, i, a / 30, `the picture cut by ${a.toFixed(1)} of 255 on the very frame a flight between scales began`);
      if (!ev[i] && !fast && a > T.popAbs && ![1, 2, 3].some(k => reloaded[i - k])) {      // (a freshly loaded page settles for a few frames)
        const prev = ev[i - 1] ? Infinity : bm(i - 1), next = i + 1 < n ? (ev[i + 1] ? 0 : bm(i + 1)) : 0;
        const win = []; for (let j = Math.max(1, i - 7); j <= Math.min(n - 1, i + 7); j++) if (j !== i && !ev[j] && sinceEv[j] > 10 && s[j].tag === x.tag) win.push(bm(j));
        const lone = a > T.popK * Math.max(prev, next) + T.popB;
        const unusual = win.length >= 6 && sinceEv[i] > 10 && a > T.popWinK * median(win) + T.popB;
        if (lone || unusual) add(tr, 'jump', i, i, a / (T.popK * Math.max(Math.min(prev, 99), next) + T.popB), `the picture changed by ${a.toFixed(1)} of 255 at the ${where(d[i].at)} in one frame; the frames either side changed by ${prev === Infinity ? '(a press)' : prev.toFixed(1)} and ${next.toFixed(1)}`);
      }
      if (!ev[i] && !fast && sinceEv[i] > 2 && x.hot > T.hotAbs && x.hot > T.hotK * Math.max(p.hot, s[i + 1]?.hot ?? 0) + 10
        // (a flicker comes from nowhere: where as many pixels were already changing half as fast the frame before or
        // after, the same change is only passing the mark, as when a slider's value steps by two notches for one)
        && !(x.hot <= 1.5 * Math.max(p.warm ?? 0, s[i + 1]?.warm ?? 0)))
        add(tr, 'sparkle', i, i, x.hot / T.hotAbs / 4, `${x.hot} pixels changed sharply in one frame (${p.hot} the frame before, ${s[i + 1]?.hot ?? 0} the frame after)`);

      // ---- the layout ----
      const resized = [0, 1, 2, 3, 4, 5, 6, 7, 8].some(k => s[i - k]?.ev?.resize);
      const keys = new Set([...Object.keys(x.layout), ...Object.keys(p.layout)]), moved = [];
      for (const k of keys) { if (k === '#capBody' || k === '#capTitle') continue;      // the words may change inside the caption's box: it is the box that must hold still
        const A = p.layout[k], B = x.layout[k]; if (!A || !B) moved.push([k, A ? 'went' : 'came', 99]); else { const dl = rectDelta(A, B); if (dl > T.layout) moved.push([k, `${dl.toFixed(1)} px`, dl, A, B]); } }
      if (moved.length && !resized) {
        const excused = ev[i] || ev[i - 1] || stageCh[i] || stageCh[i - 1];
        const list = moved.sort((a, b) => b[2] - a[2]).slice(0, 4).map(m => `${m[0]} ${m[1]}`).join(', ');
        if (!excused) add(tr, 'layout', i, i, Math.min(9, moved[0][2] / 2 + 1), `${moved.length} box${moved.length > 1 ? 'es' : ''} moved or changed size during "${x.tag}": ${list}`);
        // the control just pressed must stay where the pointer is
        const sel = (x.ev ?? p.ev)?.sel;
        if (sel) {
          const key = sel.startsWith('#') ? [sel, 'in:' + sel.slice(1)] : ['in:' + (sel.match(/="([^"]+)"/)?.[1] ?? '')];
          const m = moved.find(m => key.includes(m[0]) && m[3] && (Math.abs(m[3][0] - m[4][0]) > 1 || Math.abs(m[3][1] - m[4][1]) > 1));
          if (m) {
            const [A, B] = [m[3], m[4]], px = A[0] + A[2] / 2, py = A[1] + A[3] / 2, still = px >= B[0] && px <= B[0] + B[2] && py >= B[1] && py <= B[1] + B[3];
            add(tr, 'under-pointer', i, i, Math.min(9, m[2] / 4 + 1), `${sel} moved ${m[1]} when it was pressed (from ${A.slice(0, 2)} to ${B.slice(0, 2)})${still ? ', though the pointer is still on it' : ': the pointer is no longer on it'}`, still ? 'note' : 'fail');
          }
        }
      }

      // ---- the slider under the pointer ----
      if (x.drag) {
        const have = x.sliders[x.drag.id];
        if (have === undefined) add(tr, 'slider', i, i, 5, `the ${x.drag.id} slider went away while it was being dragged`);
        else {
          if (Math.abs(have - x.drag.want) > x.drag.tol) add(tr, 'slider', i, i, Math.min(9, Math.abs(have - x.drag.want) / x.drag.tol), `the pointer is at ${x.drag.want.toFixed(2)} on the ${x.drag.id} slider, which reads ${have}`);
          if (Math.abs(x.S[x.drag.id] - have) > 1e-9) add(tr, 'slider', i, i, 3, `the ${x.drag.id} slider reads ${have} and the page's state has ${x.S[x.drag.id]}`);
        }
      }

      // ---- what was sent to WebGL ----
      const g = x.gl, gp = p.gl, flying = !!(x.tr || p.tr || s[i + 1]?.tr || s[i - 2]?.tr), quiet = !ev[i] && !stageCh[i] && !fast && !flying;      // (mid-flight two scenes are drawn and masked: the picture checks cover that)
      if (quiet && Math.max(g.points, gp.points) >= 20 && Math.abs(g.points - gp.points) / Math.max(g.points, gp.points) > T.count) add(tr, 'particles', i, i, 2, `the number of particles on screen went from ${gp.points} to ${g.points} in one frame`);
      // (where the particles are is compared as counts on a grid, since a page may draw them in a new order each frame)
      if (quiet && Math.min(g.points, gp.points) >= 20 && i > 1 && i + 1 < n && !ev[i + 1] && !ev[i - 1]) {
        const h0 = histDist(s[i - 2].gl.hist, gp.hist), h1 = histDist(gp.hist, g.hist), h2 = histDist(g.hist, s[i + 1].gl.hist);
        if (h1 > 0.3 && h1 > 3 * Math.max(h0, h2) + 0.05) add(tr, 'particles', i, i, h1 / 0.3, `${(h1 * 100).toFixed(0)}% of the particles moved to another part of the screen in one frame`);
      }
      if (quiet && i + 1 < n && i > 1) {
        const rel = k => Math.abs(s[k].gl.ink - s[k - 1].gl.ink) / Math.max(s[k].gl.ink, s[k - 1].gl.ink, 1e-3), r = rel(i);
        if (r > T.ink && r > T.inkK * Math.max(ev[i - 1] ? 1 : rel(i - 1), ev[i + 1] ? 0 : rel(i + 1)) + 0.02) add(tr, 'lines', i, i, r / T.ink, `the amount of line drawn went from ${gp.ink.toFixed(1)} to ${g.ink.toFixed(1)} in one frame (${(r * 100).toFixed(0)}%), with ${gp.segs} then ${g.segs} segments`);
      }

      // ---- labels ----
      if (!ev[i] && !stageCh[i] && !stageCh[i - 1] && i > 1 && !rm) {
        const prevBy = new Map(keyed(p.labels)), prev2 = new Map(keyed(s[i - 2].labels)), same = x.labels.length === p.labels.length && p.labels.length === s[i - 2].labels.length;
        if (same && !resized) for (const [key, l] of keyed(x.labels)) {
          const a0 = prevBy.get(key), a1 = prev2.get(key); if (!a0 || !a1 || l.off) continue;
          const dn = Math.hypot(l.x - a0.x, l.y - a0.y), dp = Math.hypot(a0.x - a1.x, a0.y - a1.y);
          if (dn > 14 && dn > 4 * dp + 4 && !fast && sinceEv[i] > 2 && !/scroll to zoom/.test(x.tag) /* every frame of a scroll is a new notch of the wheel */) add(tr, 'labels', i, i, dn / 14, `the label "${l.t}" moved ${dn.toFixed(0)} px in one frame (${dp.toFixed(0)} px the frame before)`);
        }
      }

      // ---- the flight ----
      if (x.tr && p.tr && x.tr.hi === p.tr.hi && !rm && i > 1 && s[i - 2].tr?.hi === x.tr.hi) {
        const v1 = (x.tr.q - p.tr.q) / x.dt, v0 = (p.tr.q - s[i - 2].tr.q) / x.dt;
        if (Math.abs(v1 - v0) > T.dv && x.tr.q > 0 && x.tr.q < 1 && p.tr.q > 0 && p.tr.q < 1) add(tr, 'flight', i, i, Math.abs(v1 - v0) / T.dv, `the flight's speed changed from ${v0.toFixed(2)} to ${v1.toFixed(2)} (of the way per second) in one frame`);
      }
      // ---- state that changed by itself ----
      if (!ev[i] && !ev[i - 1]) for (const k of Object.keys(x.S)) {
        if (k === 'crossPhi' || k === 'stage' || k === x.drag?.id || k === p.drag?.id) continue;
        const A = p.S[k], B = x.S[k];
        if (typeof B === 'number' ? Math.abs(B - A) > 0.02 * Math.max(1, Math.abs(A)) : A !== B) add(tr, 'state', i, i, 1, `${k} went from ${A} to ${B} with no input (during "${x.tag}")`, 'note');
      }
    }
    // labels that blink: gone and back, or there and gone, within a third of a second
    {
      const seen = new Map();
      for (let i = 0; i < n; i++) { if (s[i].labels.some(l => l.off) || tr.reduced) continue; for (const [key] of keyed(s[i].labels)) { if (!seen.has(key)) seen.set(key, []); seen.get(key).push(i); } }
      for (const [key, at] of seen) for (let k = 1; k < at.length; k++) {
        const gap = at[k] - at[k - 1];
        if (gap > 1 && gap <= 20 && !s.slice(at[k - 1], at[k] + 1).some((x, j) => x.ev || /look around|scroll|coasting|resize/.test(x.tag) || stageCh[at[k - 1] + j] || x.tr || x.labels.some(l => l.off) || !x.labels.length)) add(tr, 'labels', at[k - 1] + 1, at[k], 2, `the label "${key}" went away for ${gap - 1} frame${gap > 2 ? 's' : ''} and came back`);
      }
    }
    // ---- there and back, and back by the address ----
    for (const c of tr.checks) if (c.kind === 'same' && s[c.a] && s[c.b]) {
      const r = compare(s, img, c.a, c.b, !!c.playing, c.span), kind = /address/.test(c.what) ? 'route' : 'round-trip';
      if (r.out.length) {
        const f = { scenario: tr.name, dir: tr.dir, kind, from: c.b, to: c.b, pair: [c.a, c.b], sev: r.sev, msg: `${c.what}: ${r.out.join('; ')}`, level: 'fail', tag: s[c.b].tag };
        const acc = accepted.find(a => a.kind === f.kind && a.re.test(tr.name) && (!a.msg || a.msg.test(f.msg))); if (acc) { f.level = 'accepted'; f.why = acc.reason; }
        findings.push(f);
      }
    }
    perScenario.push({ name: tr.name, frames: n, secs: tr.secs, maxStep: Math.max(0, ...d.slice(1).map((x, i) => (ev[i + 1] ? 0 : x.bmax))) });
  }

  // neighbouring frames with the same complaint are one finding
  findings.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.kind.localeCompare(b.kind) || a.from - b.from);
  const merged = [];
  for (const f of findings) {
    const m = merged.at(-1);
    if (m && m.scenario === f.scenario && m.kind === f.kind && m.level === f.level && !f.pair && !f.other && f.from - m.to <= 3) { m.to = f.to; m.count = (m.count ?? 1) + 1; if (f.sev > m.sev) { m.sev = f.sev; m.msg = f.msg; m.peak = f.from; } }
    else merged.push({ ...f, peak: f.from });
  }
  merged.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.sev - a.sev);
  return { findings: merged, perScenario, frames: traces.reduce((a, t) => a + t.samples.length, 0) };
}

const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function writeReport(result, traces, out) {
  const { findings, perScenario } = result, fails = findings.filter(f => f.level === 'fail'), notes = findings.filter(f => f.level === 'note'), acc = findings.filter(f => f.level === 'accepted');
  const byKind = k => fails.filter(f => f.kind === k);
  const md = [];
  md.push('# Smooth-interaction report', '');
  md.push(`${traces.length} scenarios, ${result.frames} frames. **${fails.length} findings**${acc.length ? `, ${acc.length} accepted (see accepted.json)` : ''}${notes.length ? `, ${notes.length} notes` : ''}.`, '');
  md.push('| Kind | Findings | Scenarios |', '|---|---|---|');
  for (const k of ORDER) { const f = byKind(k); if (f.length) md.push(`| ${KINDS[k]} | ${f.length} | ${new Set(f.map(x => x.scenario)).size} |`); }
  md.push('', '## Worst of each kind', '');
  // the pictures show a few of each kind, and not the same scenario over and over
  const shown = [];
  for (const k of ORDER) { const per = new Map(); for (const f of byKind(k)) { const c = per.get(f.scenario) ?? 0; if (c >= 1 || shown.filter(x => x.kind === k).length >= 4) continue; per.set(f.scenario, c + 1); shown.push(f); } }
  for (const f of shown) md.push(`- **${KINDS[f.kind]}**: ${f.scenario}, frame ${f.peak}${f.to > f.from ? ` (frames ${f.from} to ${f.to})` : ''}. ${f.msg}`);
  md.push('', '## Every finding', '');
  for (const f of fails) md.push(`- [${f.kind}] ${f.scenario} @${f.from}${f.to > f.from ? '-' + f.to : ''}${f.count ? ` (${f.count} frames)` : ''}: ${f.msg}`);
  if (acc.length) { md.push('', '## Accepted', ''); for (const f of acc) md.push(`- [${f.kind}] ${f.scenario} @${f.from}${f.to > f.from ? '-' + f.to : ''}: ${f.msg} *Accepted: ${f.why}*`); }
  if (notes.length) { md.push('', '## Notes', ''); for (const f of notes) md.push(`- [${f.kind}] ${f.scenario} @${f.from}${f.to > f.from ? '-' + f.to : ''}: ${f.msg}`); }
  md.push('', '## Scenarios', '', '| Scenario | Frames | Largest step between frames (of 255) | Findings |', '|---|---|---|---|');
  for (const p of perScenario.sort((a, b) => a.name.localeCompare(b.name))) md.push(`| ${p.name} | ${p.frames} | ${p.maxStep.toFixed(1)} | ${fails.filter(f => f.scenario === p.name).length} |`);
  fs.writeFileSync(path.join(out, 'report.md'), md.join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ summary: { scenarios: traces.length, frames: result.frames, fails: fails.length, accepted: acc.length }, findings }, null, 1));

  // ---- the pictures ----
  const byName = new Map(traces.map(t => [t.name, t]));
  const src = (dir, i) => `${dir}/${String(i).padStart(5, '0')}.jpg`;
  const tile = (dir, i, cap, cls = '') => `<figure class="${cls}"><img src="${src(dir, i)}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`;
  const strip = f => {
    const tr = byName.get(f.scenario), n = tr.samples.length, cells = [];
    const cap = i => { const x = tr.samples[i]; return `${i}${x.drag ? ` · ${x.drag.id} ${(+x.drag.want).toFixed(2)}` : ''}${x.ev ? ' · ' + x.ev.what.replace(/^press /, '') : ''}`; };
    let a, b;
    if (f.pair) { [a, b] = f.pair; cells.push(tile(tr.dir, a, `before · ${cap(a)}`), tile(tr.dir, b, `after · ${cap(b)}`)); }
    else if (f.other) { a = null; cells.push(tile(f.other.dir, f.other.i, f.other.name), tile(tr.dir, f.from, tr.route)); }
    else { const i = f.peak; a = i - 1; b = i; for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) cells.push(tile(tr.dir, k, cap(k), k === i ? 'hit' : '')); }
    const A = f.other ? src(f.other.dir, f.other.i) : src(tr.dir, a), B = f.other ? src(tr.dir, f.from) : src(tr.dir, b);
    cells.push(`<figure class="diff"><div><img src="${A}"><img src="${B}"></div><figcaption>difference × 5</figcaption></figure>`);
    return `<section><h3>${esc(KINDS[f.kind])} <small>${esc(f.scenario)} · ${esc(f.tag ?? '')}</small></h3><p>${esc(f.msg)}</p><div class="strip">${cells.join('')}</div></section>`;
  };
  const html = `<!doctype html><meta charset="utf-8"><title>Smooth-interaction report</title><style>
body{font:14px/1.4 system-ui,sans-serif;background:#10131c;color:#e6eaf5;margin:20px;max-width:1500px}h1{font-size:20px}h3{font-size:15px;margin:22px 0 2px}h3 small{font-weight:400;color:#9aa6c4}p{margin:2px 0 8px;color:#c5cde2;max-width:1100px}
.strip{display:flex;gap:6px;flex-wrap:wrap}figure{margin:0}figure img{display:block;width:230px;height:144px;object-fit:cover;border:2px solid #2a3350}figure.hit img{border-color:#ff5d5d}figcaption{font-size:11px;color:#9aa6c4;max-width:230px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.diff div{position:relative;width:234px;height:148px;filter:brightness(5)}.diff img{position:absolute;inset:0}.diff img+img{mix-blend-mode:difference}
table{border-collapse:collapse}td,th{padding:2px 10px;text-align:left;border-bottom:1px solid #2a3350}</style>
<h1>Smooth-interaction report</h1><p>${traces.length} scenarios, ${result.frames} frames, ${fails.length} findings${acc.length ? `, ${acc.length} accepted` : ''}. The frame outlined in red is the one that does not fit its neighbours.</p>
<table><tr><th>Kind</th><th>Findings</th></tr>${ORDER.filter(k => byKind(k).length).map(k => `<tr><td>${KINDS[k]}</td><td>${byKind(k).length}</td></tr>`).join('')}</table>
${shown.filter(f => byName.get(f.scenario)?.samples.length).map(strip).join('\n')}`;
  fs.writeFileSync(path.join(out, 'report.html'), html);
  try {
    let pw; try { pw = createRequire(import.meta.url)('playwright'); } catch { pw = createRequire('/opt/node-tools/')('playwright'); }
    const b = await pw.chromium.launch(), page = await b.newPage({ viewport: { width: 1480, height: 900 } });
    await page.goto('file://' + path.join(out, 'report.html')); await page.evaluate(() => Promise.all([...document.images].map(i => { i.loading = 'eager'; return i.decode().catch(() => { }); })));
    await page.screenshot({ path: path.join(out, 'contact.png'), fullPage: true }); await b.close();
  } catch (e) { console.error('contact sheet not written: ' + e.message); }
}
