// Do the working joints of evolved bodies do anything for them? Same bodies, with their joints' rhythm switched off,
// and separately with their cilia switched off. Usage: node tools/alife2-joint-assay.js <result.json> [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [file, secs, ...seedArgs] = process.argv.slice(2), d = require(require('path').resolve(file)), T = Number(secs) || 120, seeds = seedArgs.length ? seedArgs.map(Number) : [301, 302, 303];
function run(seed, mode) {
  const w = new A.engine.World({ seed, founders: 0, cap: 0 }); for (let i = 0; i < 900; i++) w.step();
  let jointed = 0;
  for (const k of d.top) for (let i = 0; i < Math.max(1, Math.round(k.count / 3)); i++) {
    const g = A.genome.sanitize(A.genome.copy(k.genome)); if (mode === 'no joints') for (const p of g.parts) p.amp = 0; if (mode === 'no cilia') for (const p of g.parts) p.cilia = 0;
    const p = w.patch[w.rand.int(w.patch.length)], o = w.spawn(g, p.x + w.rand.gauss() * 6, Math.max(2, Math.min(w.yBottom - 2, p.y + w.rand.gauss() * 6)), 1, null); if (mode === 'intact' && !o.b.rigid) jointed++;
  }
  const all = w.bodies.slice(), t0 = w.t, work0 = all.map(o => o.b.work); for (let i = 0; i < 30 * T; i++) w.step();
  const dt = w.t - t0, m = f => all.reduce((a, o, i) => a + f(o, i), 0) / all.length;
  return { n: all.length, jointed, speed: m(o => o.path) / dt, eaten: m(o => o.eaten) / dt, muscleCost: m((o, i) => A.organs.C.work * (o.b.work - work0[i])) / dt, net: m(o => o.E) };
}
const out = {}; for (const md of ['intact', 'no joints', 'no cilia']) { const r = seeds.map(s => run(s, md)); out[md] = Object.fromEntries(Object.keys(r[0]).map(k => [k, r.reduce((a, x) => a + x[k], 0) / r.length])); }
console.log(file.split('/').pop(), '| bodies', out.intact.n, 'with working joints', out.intact.jointed.toFixed(0),
  '| speed u/s: intact', out.intact.speed.toFixed(3), 'no joints', out['no joints'].speed.toFixed(3), 'no cilia', out['no cilia'].speed.toFixed(3),
  '| eaten/s: intact', out.intact.eaten.toFixed(4), 'no joints', out['no joints'].eaten.toFixed(4), 'no cilia', out['no cilia'].eaten.toFixed(4), '| muscle cost/s', out.intact.muscleCost.toFixed(4));
