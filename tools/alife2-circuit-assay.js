// Does a local nerve circuit that uses the taste of dissolved food pay for itself?
// A ciliated single-segment body, with: no circuit; "swim hard where the water is thin, rest where it is rich";
// the opposite wiring; and the first one again with its taste cut. Packed together, and spread out.
// Usage: node tools/alife2-circuit-assay.js [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [secs, ...seedArgs] = process.argv.slice(2), T = Number(secs) || 200, seeds = seedArgs.length ? seedArgs.map(Number) : [701, 702, 703, 704], C = A.organs.C;
const body = o => { const g = A.genome.primordial(1); Object.assign(g.parts[0], { cilia: 0.5, beat: -1, nerve: 0.5 }, o); return g; };
const kinds = [
  ['繊毛なし（動かない）', () => body({ cilia: 0 }), false],
  ['繊毛・回路なし', () => body({}), false],
  ['薄いと速く、濃いと止まる', () => body({ nC: 3, mCil: -1 }), false],
  ['同じ回路・味覚を切断', () => body({ nC: 3, mCil: -1 }), true],
  ['逆の配線（濃いと速く）', () => body({ nC: 3, mCil: 1 }), false],
  ['過去を引きずる（leak 0.05）', () => body({ nC: 3, mCil: -1, leak: 0.05 }), false],
  ['良くならない限り曲がる', () => body({ adapt: 1, nC: 2, nB: -2, mTurn: 1.5 }), false],
  ['同じ回路・味覚を切断　', () => body({ adapt: 1, nC: 2, nB: -2, mTurn: 1.5 }), true],
  ['悪くなると速く泳ぐ', () => body({ adapt: 1, nC: -4, mCil: 1 }), false],
  ['同じ回路・味覚を切断　　', () => body({ adapt: 1, nC: -4, mCil: 1 }), true]
];
function run(seed, make, numb, dense) {
  const w = new A.engine.World({ seed, founders: 0, cap: 0, numb: numb ? 1 : 0 }); for (let i = 0; i < 900; i++) w.step();
  const all = [], S = [[30, 25], [80, 45], [130, 30]];
  for (let i = 0; i < 36; i++) { const [x, y] = dense ? S[i % 3] : [w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8)], r = dense ? 1.5 : 0; const o = w.spawn(make(), x + w.rand.gauss() * r, y + w.rand.gauss() * r, 1, null); o.E = o.prof.Emax * 0.4; all.push(o); }
  for (let i = 0; i < 30 * T; i++) w.step();
  const m = f => all.reduce((a, o) => a + f(o), 0) / all.length, age = o => Math.max(1, o.age);
  return { income: m(o => (o.absorbed + o.eaten * o.prof.eta) / age(o)), cost: m(o => o.prof.basal + (C.ciliaWork * o.b.ciliaUse + C.spike * o.b.nerveUse) / age(o)), alive: all.filter(o => !o.dead).length / all.length, path: m(o => o.path), nerve: m(o => C.spike * o.b.nerveUse / age(o) + C.synapse * o.prof.wiring) };
}
for (const dense of [true, false]) {
  console.log(dense ? '== 混雑（3 か所に 12 匹ずつ）' : '== まばら');
  for (const [name, make, numb] of kinds) {
    const r = seeds.map(s => run(s, make, numb, dense)), mean = k => r.reduce((a, x) => a + x[k], 0) / r.length, bal = r.map(x => x.income - x.cost);
    console.log('  ' + name.padEnd(16, '　') + ' 収入 ' + mean('income').toFixed(3) + ' 費用 ' + mean('cost').toFixed(3) + '（うち神経 ' + mean('nerve').toFixed(4) + '） 収支 ' + (mean('income') - mean('cost')).toFixed(3) + ' [' + Math.min(...bal).toFixed(3) + '〜' + Math.max(...bal).toFixed(3) + '] 生存 ' + (mean('alive') * 100).toFixed(0) + '% 移動 ' + mean('path').toFixed(1));
  }
}
