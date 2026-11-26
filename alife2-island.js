// ALIFE 2.0 — an island: one more world of the same kind, run in its own thread at full speed.
// The page starts it (as a copy of the world on screen, with other random numbers, or from a saved world), relays the bodies that move
// between islands, and can ask for its state. Nothing here differs from the world on screen except that nobody is watching.
'use strict';
const V = self.location.search || '';
importScripts('./alife2-genome.js' + V, './alife2-development.js' + V, './alife2-neural.js' + V, './alife2-physics.js' + V, './alife2-organs.js' + V, './alife2-engine.js' + V);
const A = self.ALIFE2;
let w = null, paused = false, every = 150, count = 1, next = Infinity, lastStatus = 0, queued = false, rate = 0;
const ch = new MessageChannel(), again = () => { if (!queued) { queued = true; ch.port2.postMessage(0); } };
const status = () => { const c = w.census(); postMessage({ type: 'status', s: { t: c.t, n: c.n, gen: c.gen, lines: c.lines, seg: c.segMean, segMax: c.segMax, multi: c.multi, neuronBodies: c.neuronBodies || 0, fleshShare: c.fleshShare || 0, arrived: w.counts.arrived || 0, left: w.counts.left || 0, rate } }); };
ch.port1.onmessage = () => {
  queued = false; if (!w || paused) return;
  const t0 = performance.now(), s0 = w.t;
  try {
    while (performance.now() - t0 < 120) { w.step(); if (w.t >= next) { next = w.t + every; const out = count > 0 ? w.emigrate(count) : []; if (out.length) postMessage({ type: 'leave', bodies: out }); } }
  } catch (e) { postMessage({ type: 'error', text: String(e && e.stack || e) }); paused = true; return; }
  const t1 = performance.now(); rate = 0.8 * rate + 0.2 * (w.t - s0) / ((t1 - t0) / 1000);
  if (t1 - lastStatus > 1500) { lastStatus = t1; status(); }
  again();
};
self.onmessage = e => {
  const m = e.data;
  try {
    if (m.type === 'start') { // m.text: a saved world (JSON); m.reseed: give it other random numbers, so that it does not repeat the world it was copied from
      w = A.engine.World.restore(JSON.parse(m.text)); if (m.reseed != null) w.rand = A.genome.rng(m.reseed);
      every = m.every || 150; count = m.count == null ? 1 : m.count; next = w.t + every * (m.phase == null ? 1 : m.phase); paused = !!m.paused; status(); again();
    } else if (!w) return;
    else if (m.type === 'arrive') w.immigrate(m.bodies, m.from);
    else if (m.type === 'pause') { paused = true; status(); }
    else if (m.type === 'resume') { paused = false; again(); }
    else if (m.type === 'enable') w.enable(m.o);
    else if (m.type === 'migration') { every = m.every || every; count = m.count == null ? count : m.count; next = w.t + every; }
    else if (m.type === 'save') postMessage({ type: 'saved', id: m.id, text: JSON.stringify(w.save()) });
    else if (m.type === 'swap') { const mine = JSON.stringify(w.save()); w = A.engine.World.restore(JSON.parse(m.text)); next = w.t + every; postMessage({ type: 'swapped', id: m.id, text: mine }); status(); again(); }
  } catch (err) { postMessage({ type: 'error', text: String(err && err.stack || err) }); }
};
