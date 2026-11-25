// Do evolved bodies use what they perceive? Takes the body plans alive at the end of a selection trial, puts copies
// in fresh worlds of the same kind, and compares: intact / told nothing about where food is (blind) / unable to taste
// dissolved food (numb). Works for the original world and for mapped worlds (reported per region).
// Usage: node tools/alife2-ablate.js <result.json> [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [file, secs, ...seedArgs] = process.argv.slice(2), d = require(require('path').resolve(file)), T = Number(secs) || 150, seeds = seedArgs.length ? seedArgs.map(Number) : [801, 802, 803], C = A.organs.C;
const map = (d.options && d.options.map) || '';
function run(seed, mode) {
  const w = new A.engine.World({ seed, map, founders: 0, cap: 0, blind: mode === 'blind' ? 1 : 0, numb: mode === 'numb' ? 1 : 0 }); for (let i = 0; i < 1200; i++) w.step();
  for (const k of d.top) for (let i = 0; i < Math.max(1, Math.round(k.count / 3)); i++) w.spawn(A.genome.sanitize(A.genome.copy(k.genome)), w.rand() * w.W, 3 + w.rand() * (Math.min(w.H, w.yBottom) - 6), 1, null);
  const all = w.bodies.slice(); for (const o of all) o.start = w.regions ? w.regionAt(o.cx) : 0;
  for (let i = 0; i < 30 * T; i++) w.step();
  const groups = w.regions ? w.regions.map(q => all.filter(o => o.start === q.id)) : [all], age = o => Math.max(1, o.age);
  return groups.map(l => { const m = f => l.length ? l.reduce((a, o) => a + f(o), 0) / l.length : 0; return { n: l.length, mouth: m(o => o.eaten * o.prof.eta / age(o)), income: m(o => (o.absorbed + o.eaten * o.prof.eta) / age(o)), alive: m(o => o.dead ? 0 : 1), speed: m(o => o.path / age(o)) }; });
}
const names = map ? new A.engine.World({ map, founders: 0 }).regions.map(q => q.name) : ['世界全体'], res = {};
for (const mode of ['intact', 'blind', 'numb']) res[mode] = seeds.map(s => run(s, mode));
console.log(file.split('/').pop() + (map ? '（' + map + '）' : ''));
names.forEach((nm, g) => {
  const col = (mode, k) => { const v = res[mode].map(r => r[g][k]); return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(k === 'alive' ? 2 : 3) + ' [' + Math.min(...v).toFixed(3) + '〜' + Math.max(...v).toFixed(3) + ']'; };
  console.log('  ' + nm + '（' + res.intact[0][g].n + '体）');
  for (const [mode, label] of [['intact', 'そのまま　　　　'], ['blind', '餌の方向を切断　'], ['numb', '味覚を切断　　　']]) console.log('    ' + label + ' 口から ' + col(mode, 'mouth') + ' 収入 ' + col(mode, 'income') + ' 生存 ' + col(mode, 'alive') + ' 速度 ' + col(mode, 'speed'));
});
