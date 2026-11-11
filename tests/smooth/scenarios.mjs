// What the test does to the page. Nothing here names a scale or a control: run.mjs first asks the
// page what scales it has and which sliders, buttons and tick boxes each one shows (the `model`), and
// the scenarios are made from that. Rework a scale, rename it, add a slider: it is tested as found.
//
// A scenario is a fresh load of /v2/ at `hash`, then `run(h)`; h is the Hand in run.mjs (frames,
// click, drag, look, land, mark/same ...). When a person finds a jump the tests missed, add the
// gesture that shows it to `extra` at the bottom.

// a tiny seeded generator, for the scenario that presses things at random
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const SEG_KEY = { mode: 'm', focus: 'f', cross: 'x', pol: 'p' };      // how the address bar spells each button group
// Flights are stepped a little faster than 30 a second: at 30 or slower the page takes the machine
// for a slow one and starts drawing at a lower resolution, which is a change of picture all of its own.
const FLY = 0.029;
const qs = o => Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`).join('&');

export function scenarios(model, { quick = false } = {}) {
  const L = [], q = quick, ST = model.stages, last = ST.length - 1;
  const secs = st => st.frameMs / 1000;
  // how many steps a drag gets: fewer where a frame takes the software renderer a long time
  const steps = (st, budget) => Math.round(Math.max(12, Math.min(q ? 24 : 80, (budget / secs(st) - 100) / 3)));

  // ---- every slider: slowly there and back, quickly there and back, then again with the animation
  // paused, when the picture depends on the slider alone and must come back exactly as it was ----
  for (const st of ST) for (const [k, id] of st.sliders.entries()) {
    const variants = [];
    const modes = st.segs.mode ?? [null], eye = st.segs.focus?.includes('eye');
    for (const m of modes) { variants.push({ m }); if (eye && !q) variants.push({ m, f: 'eye' }); }
    for (const v of q ? [eye ? { m: modes[0], f: 'eye' } : variants[0], ...(modes.length > 1 && k === 0 ? [{ m: modes[1] }] : [])] : variants) {
      const n = steps(st, q ? 25 : 60), m = Math.round(n * 0.6), label = [v.m, v.f && 'focus ' + v.f].filter(Boolean).join(', ');
      for (const view of q || k > 0 || v.f ? [undefined] : [undefined, 'phone']) L.push({
        name: `sweep ${st.name} ${id}${label ? ' (' + label + ')' : ''}${view ? ' (phone)' : ''}`, hash: qs({ s: st.id, ...v }), view, cost: secs(st) * (100 + 3 * n),
        async run(h) {
          await h.frames(12, 'idle (the baseline)');
          const g = await h.box('#' + id), from = g.min, to = g.max;
          await h.drag(id, from, to, n, `slow drag of ${id}`); await h.frames(4, 'held');
          await h.drag(id, to, from, n, `slow drag of ${id}, back`); await h.frames(4, 'held');
          await h.drag(id, from, to, 6, `fast drag of ${id}`); await h.frames(8, 'held after a fast drag');
          await h.drag(id, to, from, 6, `fast drag of ${id}, back`); await h.frames(16, 'held after a fast drag');
          await h.click('#pause', 24, 'paused'); h.mark('paused');
          await h.drag(id, from, to, m, `paused: slow drag of ${id}`);
          await h.drag(id, to, from, m, `paused: slow drag of ${id}, back`); await h.frames(24, 'paused: held');
          h.same('paused', `after dragging ${id} there and back with the animation paused`);
        },
      });
    }
  }

  // ---- the flights between scales ----
  const pairCost = i => Math.max(secs(ST[i]), secs(ST[i + 1])) * 2;
  // zoom in from scale i and back out, watching every frame of both flights
  const flight = (i, { view, reduced } = {}) => ({
    name: `flight ${ST[i].name} to ${ST[i + 1].name} and back${view ? ' (' + view + ')' : ''}`, hash: `s=${ST[i].id}`, dt: q ? 1 / 20 : 1 / 30, view, reduced, cost: pairCost(i) * (q ? 230 : 350),
    async run(h) {
      await h.frames(8);
      await h.click('#next'); await h.land(`zoom in from ${ST[i].name}`);
      h.expect((await h.state()).stage === i + 1, `Zoom in from ${ST[i].name} did not arrive at ${ST[i + 1].name}`);
      await h.click('#prev'); await h.land(`zoom out to ${ST[i].name}`);
      h.expect((await h.state()).stage === i, `Zoom out did not arrive back at ${ST[i].name}`);
    },
  });
  // presses made in mid-flight: backing out part-way must return to exactly the picture left behind,
  // and a change of mind twice over must still arrive
  const reverse = i => ({
    name: `reverse mid-flight ${ST[i].name} to ${ST[i + 1].name}`, hash: `s=${ST[i].id}`, dt: FLY, paused: true, cost: pairCost(i) * 330,
    async run(h) {
      await h.frames(10); h.mark('start');
      await h.click('#next', 45, 'zooming in'); await h.click('#prev'); await h.land('turned back part-way', 700, 20);
      h.expect((await h.state()).stage === i, 'Zoom out pressed part-way in did not return to the scale it left');
      h.same('start', 'after zooming in part-way and backing out, paused');
      await h.click('#next', 70, 'zooming in'); await h.click('#prev', 12, 'turning back'); await h.click('#next'); await h.land('turned forward again');
      h.expect((await h.state()).stage === i + 1, 'Zoom in, out, in again did not arrive at the deeper scale');
    },
  });
  for (let i = 0; i < last; i++) { L.push(flight(i)); if (!q || i === Math.floor(last / 2)) L.push(reverse(i)); }
  if (!q) L.push(flight(last - 1, { view: 'phone' }), flight(0, { view: 'phone' }));
  const crossAt = ST.findIndex(st => st.segs.cross), CX = crossAt >= 0 ? ST[crossAt].segs.cross : [], cx = v => `[data-cross="${v}"]`;
  L.push({
    name: 'reduced motion: every scale and back', hash: `s=${ST[0].id}`, dt: FLY, reduced: true, cost: 60,
    async run(h) {
      await h.frames(6);
      for (let i = 0; i < last; i++) { await h.click('#next'); await h.land(`to ${ST[i + 1].name}`, 200, 4); if (i + 1 === crossAt) await h.click(cx(CX.at(-1)), 10); }
      for (let i = last - 1; i >= 0; i--) { await h.click('#prev'); await h.land(`back to ${ST[i].name}`, 200, 4); }
      h.expect((await h.state()).stage === 0, 'did not arrive back at the first scale');
    },
  });
  if (!q) L.push({
    name: 'jump from the first scale to the last and back', hash: `s=${ST[0].id}`, dt: FLY, cost: 600,
    async run(h) {
      await h.frames(6);
      await h.click(`#stages button:nth-child(${last + 1})`); await h.land('first to last', 1500);
      h.expect((await h.state()).stage === last, 'the jump to the last scale did not arrive');
      await h.click('#stages button:nth-child(1)'); await h.land('last to first', 1500);
      h.expect((await h.state()).stage === 0, 'the jump to the first scale did not arrive');
    },
  });
  if (CX.length >= 3) L.push({
    name: `${ST[crossAt].name}: flying between crossings`, hash: qs({ s: ST[crossAt].id, x: CX[0] }), dt: FLY, cost: secs(ST[crossAt]) * 800,
    async run(h) {
      await h.frames(8);
      await h.click(cx(CX[1])); await h.land(`${CX[0]} to ${CX[1]}`);
      await h.click(cx(CX[2])); await h.land(`${CX[1]} to ${CX[2]}`);
      await h.click(cx(CX[0])); await h.land(`${CX[2]} to ${CX[0]}`);
      // a change of mind part-way round, and a Zoom out part-way round
      await h.click(cx(CX[2]), 25, `${CX[0]} to ${CX[2]}`); await h.click(cx(CX[1])); await h.land(`changed to ${CX[1]} part-way`);
      h.expect((await h.state()).cross === CX[1], 'the crossing pressed last was not the one arrived at');
      await h.click(cx(CX[0]), 20, `${CX[1]} to ${CX[0]}`); await h.click('#prev'); await h.land('zoom out part-way round');
      h.expect((await h.state()).stage === crossAt - 1, 'Zoom out during a crossing hop did not arrive at the scale above');
    },
  });
  L.push({
    name: 'presses at random moments', hash: `s=${ST[1].id}`, dt: FLY, cost: 400,
    async run(h) {
      const r = rng(7); let heading = 1;
      await h.frames(5);
      for (let k = 0; k < (q ? 6 : 14); k++) {
        const u = r();
        if (u < 0.4) { heading = Math.min(last, heading + 1); await h.click('#next'); }
        else if (u < 0.8) { heading = Math.max(0, heading - 1); await h.click('#prev'); }
        else { heading = 1 + Math.floor(r() * last); await h.click(`#stages button:nth-child(${heading + 1})`); }
        await h.frames(4 + Math.floor(r() * 50), `heading for ${ST[heading].name}`);
      }
      await h.land(`settling at ${ST[heading].name}`, 1500);
      h.expect((await h.state()).stage === heading, `after a run of presses the page is not at ${ST[heading].name}, where the last press pointed`);
    },
  });

  // ---- every button and tick box, and looking around ----
  for (const st of ST) for (const view of q ? [undefined] : [undefined, 'phone']) {
    const sels = [...Object.entries(st.segs).filter(([k]) => k !== 'cross').flatMap(([k, vs]) => vs.map(v => `[data-${k}="${v}"]`)), ...st.checks.map(c => '#' + c)];
    const w = q || secs(st) > 0.5 ? 8 : 14;
    L.push({
      name: `buttons and looking around: ${st.name}${view ? ' (phone)' : ''}`, hash: `s=${st.id}`, view, cost: secs(st) * (sels.length * w + 150),
      async run(h) {
        await h.frames(8);
        for (const s of [...sels, ...sels.slice(0, 2)]) await h.click(s, w);
        await h.look(160, 0, 16); await h.look(0, 70, 12); await h.frames(14, 'coasting after a drag');
        await h.wheel(-60, 6); await h.wheel(60, 6); await h.frames(14, 'coasting after scrolling');
        await h.click('#resetView', 20);
        await h.click('#pause', 5); await h.click('#pause', 5);
      },
    });
  }
  L.push({
    name: 'resize between desktop and phone', hash: `s=${ST[Math.min(2, last)].id}`, cost: 30,
    async run(h) { await h.frames(8); await h.resize('phone', 40); await h.resize('desk', 40); },
  });

  // ---- the address bar must bring back the view it was written for ----
  // Get somewhere by hand (drag a slider to its end, press a button), then load the address the page
  // wrote for it in a fresh page and run the same number of frames. The two must be the same view:
  // the same state, layout and labels, the same picture when paused, the same spread of particles.
  const route = (name, hash, how, { paused, st, N = 30 }) => L.push({
    name: `route: ${name} (${paused ? 'paused' : 'playing'})`, hash, paused, cost: secs(st) * (2 * N + 30),
    async run(h) {
      await h.frames(6); await how(h);
      await h.frames(N - h.samples.length, 'arrived by hand'); h.mark('by hand');
      await h.reload(); await h.frames(N, 'loaded from the address');
      h.same('by hand', 'loading the address the page wrote', { playing: !paused, span: Math.min(120, N - 45) });
    },
  });
  for (const st of ST) {
    const base = { s: st.id, ...(st.segs.focus?.includes('eye') ? { f: 'eye' } : {}) }, c = secs(st);
    for (const [k, id] of st.sliders.entries()) {
      const key = st.hashKey[id], r = st.range[id]; if (!key || (q && k > 0)) continue;
      const how = h => h.drag(id, r.max, r.min, 20, `fast drag of ${id} to its lowest`);
      route(`${st.name}, ${id} dragged to its lowest`, qs({ ...base, [key]: r.max }), how, { paused: true, st, N: 100 });
      route(`${st.name}, ${id} dragged to its lowest`, qs({ ...base, [key]: r.max }), how, { paused: false, st, N: c > 0.5 ? 70 : 180 });
    }
    for (const [k, vs] of Object.entries(st.segs)) {
      if (!SEG_KEY[k] || k === 'cross' || vs.length < 2 || (q && k !== 'mode')) continue;
      route(`${st.name}, ${k} ${vs.at(-1)} pressed`, qs({ s: st.id, [SEG_KEY[k]]: vs[0] }), h => h.click(`[data-${k}="${vs.at(-1)}"]`), { paused: true, st, N: 40 });
    }
    if (st.segs.cross && !q) L.push({
      name: `route: ${st.name}, flown to crossing ${CX[1]} (playing)`, hash: qs({ s: st.id, x: CX[0] }), dt: FLY, cost: c * 560,
      async run(h) {
        await h.frames(4); await h.click(cx(CX[1])); await h.frames(256, 'flying round'); h.mark('by hand');
        await h.reload(); await h.frames(260, 'loaded from the address');
        h.same('by hand', 'loading the address the page wrote', { playing: true });
      },
    });
  }

  // ---- gestures a person found a problem with: keep them here so the machine finds the next one ----
  const extra = [];
  return [...L, ...extra];
}
