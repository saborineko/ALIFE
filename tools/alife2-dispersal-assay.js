// Did cilia spread because they let offspring leave the place their parent is depleting?
// Same evolved genomes, with cilia and with cilia switched off:
//   sparse / dense : adults far apart, or packed together  -> income and balance per individual
//   near / far     : juveniles born beside a packed group of adults, or alone -> growth
// Usage: node tools/alife2-dispersal-assay.js <result.json> [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [file, secs, ...seedArgs] = process.argv.slice(2), d = require(require('path').resolve(file)), T = Number(secs) || 200, seeds = seedArgs.length ? seedArgs.map(Number) : [401, 402, 403];
const C = A.organs.C, plans = d.top.filter(k => A.organs.profile(A.development.develop(A.genome.sanitize(A.genome.copy(k.genome)), { maxSegs: 64 })).cilia > 0.05).slice(0, 3);
const geno = (k, cilia) => { const g = A.genome.sanitize(A.genome.copy(k.genome)); if (!cilia) for (const p of g.parts) p.cilia = 0; return g; };
const sites = w => Array.from({ length: 6 }, (_, i) => [(i + 0.5) * w.W / 6, w.yBottom * (0.25 + 0.5 * ((i * 0.618) % 1))]);
function adults(seed, cilia, dense) {
  const w = new A.engine.World({ seed, founders: 0, cap: 0 }); for (let i = 0; i < 900; i++) w.step();
  const S = sites(w); let n = 0;
  for (const k of plans) for (let i = 0; i < 12; i++, n++) { const [x, y] = dense ? S[n % 3] : [w.rand() * w.W, w.rand() * w.yBottom * 0.9 + 3], r = dense ? 1.5 : 0; const o = w.spawn(geno(k, cilia), x + w.rand.gauss() * r, y + w.rand.gauss() * r, 1, null); o.E = o.prof.Emax * 0.4; }
  const all = w.bodies.slice(); for (let i = 0; i < 30 * T; i++) w.step();
  const m = f => all.reduce((a, o) => a + f(o), 0) / all.length;
  return { income: m(o => (o.absorbed + o.eaten * o.prof.eta) / Math.max(1, o.age)), absorbed: m(o => o.absorbed / Math.max(1, o.age)), eaten: m(o => o.eaten / Math.max(1, o.age)),
    cost: m(o => o.prof.basal + C.ciliaWork * o.b.ciliaUse / Math.max(1, o.age)), alive: all.filter(o => !o.dead).length / all.length, spread: m(o => o.path) };
}
function young(seed, cilia, near) {
  const w = new A.engine.World({ seed, founders: 0, cap: 0 }); for (let i = 0; i < 900; i++) w.step();
  const S = sites(w), kids = []; let n = 0;
  for (const k of plans) for (let i = 0; i < 6; i++, n++) {
    const [x, y] = S[n % 6];
    if (near) for (let j = 0; j < 4; j++) w.spawn(geno(k, false), x + w.rand.gauss() * 0.8, y + w.rand.gauss() * 0.8, 1, null);   // the group it is born into: adults that stay put
    const g = geno(k, cilia), o = w.spawn(g, x + 1.2, y, g.birth, null); o.E = o.eggEnergy = A.organs.C.eggReserve * o.prof.Emax; kids.push(o);
  }
  for (let i = 0; i < 30 * T; i++) w.step();
  const m = f => kids.reduce((a, o) => a + f(o), 0) / kids.length;
  return { stage: m(o => o.stage), mature: kids.filter(o => o.stage >= 1).length / kids.length, alive: kids.filter(o => !o.dead).length / kids.length, moved: m(o => o.path), income: m(o => (o.absorbed + o.eaten * o.prof.eta) / Math.max(1, o.age)) };
}
const avg = (fn, ...a) => { const r = seeds.map(s => fn(s, ...a)); return Object.fromEntries(Object.keys(r[0]).map(k => [k, r.reduce((x, y) => x + y[k], 0) / r.length])); };
const name = file.split('/').pop();
for (const dense of [false, true]) for (const cil of [true, false]) { const r = avg(adults, cil, dense); console.log(name, dense ? 'dense ' : 'sparse', cil ? 'cilia   ' : 'no cilia', '| income/s', r.income.toFixed(4), '(skin', r.absorbed.toFixed(4), 'mouth', r.eaten.toFixed(4) + ')', 'cost/s', r.cost.toFixed(4), 'balance', (r.income - r.cost).toFixed(4), '| alive', (r.alive * 100).toFixed(0) + '%', '| travelled', r.spread.toFixed(1)); }
for (const near of [true, false]) for (const cil of [true, false]) { const r = avg(young, cil, near); console.log(name, near ? 'born beside adults' : 'born alone        ', cil ? 'cilia   ' : 'no cilia', '| stage reached', r.stage.toFixed(2), 'matured', (r.mature * 100).toFixed(0) + '%', 'alive', (r.alive * 100).toFixed(0) + '%', '| income/s', r.income.toFixed(4), '| travelled', r.moved.toFixed(1)); }
