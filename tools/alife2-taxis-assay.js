// Does perceiving food cause the evolved bodies to reach it? Takes the body plans alive at the end of a selection
// trial, puts copies of them in a fresh world, and compares them with the same bodies deprived of that perception.
// Usage: node tools/alife2-taxis-assay.js <result.json> [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [file, secs, ...seedArgs] = process.argv.slice(2), d = require(require('path').resolve(file)), T = Number(secs) || 150, seeds = seedArgs.length ? seedArgs.map(Number) : [101, 102, 103];
function run(seed, blind) {
  const w = new A.engine.World({ seed, founders: 0, cap: 0, blind: blind ? 1 : 0 }); for (let i = 0; i < 900; i++) w.step();
  for (const k of d.top) for (let i = 0; i < Math.max(1, Math.round(k.count / 3)); i++) { const p = w.patch[w.rand.int(w.patch.length)]; w.spawn(A.genome.sanitize(A.genome.copy(k.genome)), p.x + w.rand.gauss() * 6, Math.max(2, Math.min(w.yBottom - 2, p.y + w.rand.gauss() * 6)), 1, null); }
  const all = w.bodies.slice(), t0 = w.t; for (let i = 0; i < 30 * T; i++) w.step();
  const movers = all.filter(o => w.traveller(o)), len = movers.reduce((a, o) => a + o.taxLen, 0), dt = w.t - t0;
  return { n: all.length, movers: movers.length, taxis: len ? movers.reduce((a, o) => a + o.taxDot, 0) / len : 0, eaten: all.reduce((a, o) => a + o.eaten, 0) / all.length / dt, speed: all.reduce((a, o) => a + o.path, 0) / all.length / dt, alive: all.filter(o => !o.dead).length };
}
const rows = seeds.map(s => [run(s, false), run(s, true)]), mean = (k, j) => rows.reduce((a, r) => a + r[j][k], 0) / rows.length;
console.log(file.split('/').pop(), '| bodies', rows[0][0].n, '| moved >=2u', mean('movers', 0).toFixed(0), '/', mean('movers', 1).toFixed(0),
  '| taxis  seeing', mean('taxis', 0).toFixed(3), ' blinded', mean('taxis', 1).toFixed(3),
  '| eaten/s  seeing', mean('eaten', 0).toFixed(4), ' blinded', mean('eaten', 1).toFixed(4), ' ratio', (mean('eaten', 0) / Math.max(1e-9, mean('eaten', 1))).toFixed(2),
  '| speed', mean('speed', 0).toFixed(3), '/', mean('speed', 1).toFixed(3), '| per world taxis', rows.map(r => r[0].taxis.toFixed(2) + '/' + r[1].taxis.toFixed(2)).join(' '));
