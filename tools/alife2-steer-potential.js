// Why has selection not coupled perception to movement? Two measurements on the body plans alive at the end of a trial:
//  1. how full their guts are (if digestion, not finding food, limits intake, finding food better cannot pay)
//  2. what they would gain if they did steer: the same bodies with a hand-set turning response, either sign
// Usage: node tools/alife2-steer-potential.js <result.json> [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [file, secs, ...seedArgs] = process.argv.slice(2), d = require(require('path').resolve(file)), T = Number(secs) || 120, seeds = seedArgs.length ? seedArgs.map(Number) : [201, 202];
function run(seed, mode) {
  const w = new A.engine.World({ seed, founders: 0, cap: 0, blind: mode === 'blind' ? 1 : 0 }); for (let i = 0; i < 900; i++) w.step();
  for (const k of d.top) for (let i = 0; i < Math.max(1, Math.round(k.count / 3)); i++) {
    const g = A.genome.sanitize(A.genome.copy(k.genome)); if (typeof mode === 'number') { g.brain[6] = 0; g.brain[7] = mode; g.brain[5] = 0; g.brain[8] = 0; g.brain[9] = 0; }
    const p = w.patch[w.rand.int(w.patch.length)]; w.spawn(g, p.x + w.rand.gauss() * 6, Math.max(2, Math.min(w.yBottom - 2, p.y + w.rand.gauss() * 6)), 1, null);
  }
  const all = w.bodies.slice(), t0 = w.t; let full = 0, fill = 0, n = 0;
  for (let i = 0; i < 30 * T; i++) { w.step(); if (i % 30 === 0) for (const o of all) if (!o.dead) { const f = o.G / Math.max(1e-9, o.prof.gutCap); fill += f; full += f > 0.8 ? 1 : 0; n++; } }
  const dt = w.t - t0, m = f => all.reduce((a, o) => a + f(o), 0) / all.length;
  return { eaten: m(o => o.eaten) / dt, digestCap: m(o => o.prof.digest), fill: fill / n, full: full / n, net: m(o => o.E) };
}
const modes = ['evolved', 'blind', 2, -2], res = modes.map(md => { const r = seeds.map(s => run(s, md)); return Object.fromEntries(Object.keys(r[0]).map(k => [k, r.reduce((a, x) => a + x[k], 0) / r.length])); });
console.log(file.split('/').pop(), '| digestion capacity/s', res[0].digestCap.toFixed(3), '| gut fill', (res[0].fill * 100).toFixed(0) + '%', 'time >80% full', (res[0].full * 100).toFixed(0) + '%',
  '| eaten/s: evolved', res[0].eaten.toFixed(4), 'blind', res[1].eaten.toFixed(4), 'forced turn +2', res[2].eaten.toFixed(4), 'forced turn -2', res[3].eaten.toFixed(4),
  '| best forced / evolved', (Math.max(res[2].eaten, res[3].eaten) / res[0].eaten).toFixed(2));
