// Is it the upkeep of its nerve wiring that keeps a newborn from growing up? An experiment inside a saved evolved world (a copy: nothing is saved).
// Every body born naturally in the first half of the stretch is put, by the toss of a coin that is not the world's, into one of two groups:
//   0 nothing · 1 it pays nothing for its wiring until it has grown up (its circuit works as before; only the upkeep of the connections is waived)
// Both live in the same water at the same time. (This asks what the cost does to ONE young among the others, not what a world without the cost would be.)
// Usage: node tools/alife2-young-wiring.js <seconds> <world.json.gz> <run number>
const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const zlib = require('zlib'), fs = require('fs'), [secs, file, run] = process.argv.slice(2), T = Number(secs) || 600, k = Number(run) || 1, C = A.organs.C;
const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))), t0 = w.t, rec = [], coin = A.genome.rng(9300 + k); w.rand = A.genome.rng(7000 + k);
const spawn0 = w.spawn.bind(w); w.spawn = function (g, x, y, stage, parent) { const o = spawn0(g, x, y, stage, parent); if (parent && w.t - t0 < T / 2) rec.push({ o, g: coin.int(2), share: o.prof.wiring * C.synapse / o.prof.basal, t: w.t }); return o; };
for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step();
  for (const r of rec) { if (r.done) continue; const o = r.o;
    if (o.dead) { r.done = true; r.up = o.stage >= 1; continue; } if (o.stage >= 1) { r.done = true; r.up = true; continue; }
    if (r.g === 1 && !o.prof.waived) { o.prof.basal -= o.prof.wiring * C.synapse; o.prof.waived = true; } } } // (a body's profile is made anew each time it grows: the waiver is put back on the new one, and not on the grown body's)
const rate = L => (L.length ? L.filter(r => r.up).length / L.length : 0), G = g => rec.filter(r => r.g === g), med = (() => { const s = rec.map(r => r.share).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; })();
const out = { world: file.split('/').pop().replace('-t3000.json.gz', ''), run: k, shareMedian: med, n0: G(0).length, n1: G(1).length, up0: rate(G(0)), up1: rate(G(1)), open: rec.filter(r => !r.done).length,
  lowShare: { up0: rate(G(0).filter(r => r.share < med)), up1: rate(G(1).filter(r => r.share < med)) }, highShare: { up0: rate(G(0).filter(r => r.share >= med)), up1: rate(G(1).filter(r => r.share >= med)) } };
console.log(JSON.stringify(out));
