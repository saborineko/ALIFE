// Which ways of living pay for themselves in which region of a mapped world?
// Artificial bodies are placed, spaced apart, in one region at a time; each line is the mean over worlds, with the range.
// Usage: node tools/alife2-region-assay.js [map] [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [mapArg, secs, ...seedArgs] = process.argv.slice(2), map = mapArg || 'coast', T = Number(secs) || 200, seeds = seedArgs.length ? seedArgs.map(Number) : [601, 602, 603, 604], C = A.organs.C;
const blob = o => { const g = A.genome.primordial(1); Object.assign(g.parts[0], o); return g; };
const steer = (g, s) => { g.brain = [2, 0, 0, 0, 0, 0, 0, s, 0, 0, 0, 0, 0, 0, 0]; return g; };
const grazer = { len: 0.6, r0: 0.5, r1: 0.5, mouth: 0.8, gut: 0.6, cilia: 0.6, beat: -1, nerve: 0.5, eye: 0.5, muscle: 0, skin: 0.3 };
const kinds = {
  '動かない原始個体': () => blob({}),
  '繊毛で泳ぐ（舵なし）': () => blob(grazer),
  '繊毛＋知覚で舵 (+)': () => steer(blob(grazer), 2),
  '繊毛＋知覚で舵 (−)': () => steer(blob(grazer), -2),
  '大きい口の遊泳体': () => steer(blob(Object.assign({}, grazer, { len: 1.3, r0: 1.1, r1: 1.1, mouth: 1 })), 0)
};
function run(seed, region, make, blind) {
  const w = new A.engine.World({ seed, map, founders: 0, cap: 0, blind: blind ? 1 : 0 }); for (let i = 0; i < 1500; i++) w.step();
  const q = w.regions[region], all = [];
  for (let i = 0; i < 10; i++) { const o = w.spawn(make(), q.x0 + (q.x1 - q.x0) * (0.2 + 0.6 * ((i * 0.37) % 1)), w.H * (0.1 + 0.8 * (i + 0.5) / 10), 1, null); o.E = o.prof.Emax * 0.5; all.push(o); }
  for (let i = 0; i < 30 * T; i++) w.step();
  const m = f => all.reduce((a, o) => a + f(o), 0) / all.length, age = o => Math.max(1, o.age);
  return { income: m(o => (o.absorbed + o.eaten * o.prof.eta) / age(o)), mouth: m(o => o.eaten * o.prof.eta / age(o)), cost: m(o => o.prof.basal + C.ciliaWork * o.b.ciliaUse / age(o)), alive: all.filter(o => !o.dead).length / all.length, speed: m(o => o.path / age(o)) };
}
const W0 = new A.engine.World({ map, founders: 0 }), only = process.env.REGION ? [Number(process.env.REGION)] : W0.regions.map(q => q.id);
for (const rid of only) {
  console.log('== ' + W0.regions[rid].name);
  for (const [name, make] of Object.entries(kinds)) for (const blind of name.includes('舵 (') ? [false, true] : [false]) {
    const r = seeds.map(s => run(s, rid, make, blind)), mean = k => r.reduce((a, x) => a + x[k], 0) / r.length, bal = r.map(x => x.income - x.cost);
    console.log('  ' + (name + (blind ? '・知覚を切断' : '')).padEnd(22, '　') + ' 収入 ' + mean('income').toFixed(3) + '（口 ' + mean('mouth').toFixed(3) + '） 費用 ' + mean('cost').toFixed(3) + ' 収支 ' + (mean('income') - mean('cost')).toFixed(3) + ' [' + Math.min(...bal).toFixed(3) + '〜' + Math.max(...bal).toFixed(3) + '] 生存 ' + (mean('alive') * 100).toFixed(0) + '% 速度 ' + mean('speed').toFixed(2));
  }
}
