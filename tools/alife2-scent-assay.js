// Can a body tell that others are near, and tell its own kind from strangers, by what bodies leak into the water?
// Artificial bodies only (nothing here evolved). Each wiring is run again with the sense cut (anosmic).
// 1) crowding: 36 alike bodies, packed in three places or spread out. Does "swim when the water smells of bodies" change spacing and income?
// 2) kind: 18 bodies leaking mostly A (wired) among 18 leaking mostly B (not wired, no cilia), packed together. Does "swim when it smells of B, rest when it smells of A" leave the wired ones among their own kind?
// Usage: node tools/alife2-scent-assay.js [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [secs, ...seedArgs] = process.argv.slice(2), T = Number(secs) || 200, seeds = seedArgs.length ? seedArgs.map(Number) : [801, 802, 803, 804], C = A.organs.C;
const body = (o, odor) => { const g = A.genome.primordial(1); Object.assign(g.parts[0], { cilia: 0.5, beat: -1, nerve: 0.5 }, o); g.odor = odor == null ? 0.5 : odor; return g; };
const S = [[30, 25], [80, 45], [130, 30]];
const world = (seed, cut) => { const w = new A.engine.World({ seed, founders: 0, cap: 0, scent: 1, anosmic: cut ? 1 : 0 }); for (let i = 0; i < 900; i++) w.step(); return w; };
const put = (w, g, i, dense) => { const [x, y] = dense ? S[i % 3] : [w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8)], r = dense ? 1.5 : 0; const o = w.spawn(g, x + w.rand.gauss() * r, y + w.rand.gauss() * r, 1, null); o.E = o.prof.Emax * 0.4; return o; };
const near = (w, o, list) => { let m = Infinity; for (const q of list) { if (q === o || q.dead) continue; let dx = Math.abs(q.cx - o.cx); dx = Math.min(dx, w.W - dx); const d = Math.hypot(dx, q.cy - o.cy); if (d < m) m = d; } return m; };
const stats = (w, all, others) => {
  const live = all.filter(o => !o.dead), m = f => all.reduce((a, o) => a + f(o), 0) / all.length, ml = f => live.length ? live.reduce((a, o) => a + f(o), 0) / live.length : NaN, age = o => Math.max(1, o.age);
  return { income: m(o => (o.absorbed + o.eaten * o.prof.eta) / age(o)), cost: m(o => o.prof.basal + (C.ciliaWork * o.b.ciliaUse + C.spike * o.b.nerveUse) / age(o) + C.synapse * o.prof.wiring), alive: live.length / all.length, path: m(o => o.path), gap: ml(o => near(w, o, others || all)), a: ml(o => w.nutAt(o.cx, o.cy, w.scA)), b: ml(o => w.nutAt(o.cx, o.cy, w.scB)) };
};
const line = (name, r, extra) => { const mean = k => r.reduce((a, x) => a + x[k], 0) / r.length, rng = (f, d) => '[' + Math.min(...r.map(f)).toFixed(d) + '〜' + Math.max(...r.map(f)).toFixed(d) + ']', bal = x => x.income - x.cost;
  console.log('  ' + name.padEnd(17, '　') + ' 収支 ' + (mean('income') - mean('cost')).toFixed(3) + ' ' + rng(bal, 3) + ' 生存 ' + (mean('alive') * 100).toFixed(0) + '% 移動 ' + mean('path').toFixed(1) + ' ' + rng(x => x.path, 1) + ' ' + extra(mean, rng)); };

const crowdKinds = [
  ['繊毛なし（動かない）', { cilia: 0 }, false], ['繊毛・回路なし', {}, false],
  ['匂うと泳ぎ、薄いと休む', { sA: 3, sB: 3, mCil: 1 }, false], ['同じ回路・嗅覚を切断', { sA: 3, sB: 3, mCil: 1 }, true],
  ['逆（匂うと休む）', { sA: -3, sB: -3, mCil: 1 }, false], ['逆・嗅覚を切断', { sA: -3, sB: -3, mCil: 1 }, true],
  ['匂いが増えると曲がる', { adapt: 1, sA: 3, sB: 3, mTurn: 1.5 }, false], ['同・嗅覚を切断', { adapt: 1, sA: 3, sB: 3, mTurn: 1.5 }, true]
];
for (const dense of [true, false]) {
  console.log('== 1) 混雑の感知：' + (dense ? '3 か所に 12 匹ずつ' : 'まばら'));
  for (const [name, o, cut] of crowdKinds) {
    const r = seeds.map(seed => { const w = world(seed, cut), all = []; for (let i = 0; i < 36; i++) all.push(put(w, body(o), i, dense)); for (let i = 0; i < 30 * T; i++) w.step(); return stats(w, all); });
    line(name, r, (mean, rng) => '最近接の他個体まで ' + mean('gap').toFixed(1) + ' ' + rng(x => x.gap, 1));
  }
}
const kinKinds = [
  ['繊毛・回路なし', {}, false], ['B が匂うと泳ぎ、A だと休む', { sA: -3, sB: 3, mCil: 1 }, false], ['同じ回路・嗅覚を切断', { sA: -3, sB: 3, mCil: 1 }, true],
  ['逆（A が匂うと泳ぐ）', { sA: 3, sB: -3, mCil: 1 }, false], ['逆・嗅覚を切断', { sA: 3, sB: -3, mCil: 1 }, true]
];
console.log('== 2) 自分の系統と他の系統：A を出す 18 匹（配線あり）と B を出す 18 匹（動かない）を 3 か所に混ぜて置く');
for (const [name, o, cut] of kinKinds) {
  const r = seeds.map(seed => { const w = world(seed, cut), mine = [], other = []; for (let i = 0; i < 18; i++) { mine.push(put(w, body(o, 0.95), i, true)); other.push(put(w, body({ cilia: 0 }, 0.05), i, true)); } for (let i = 0; i < 30 * T; i++) w.step(); const s = stats(w, mine, other); s.kin = mine.filter(q => !q.dead).reduce((a, q) => a + near(w, q, mine), 0) / Math.max(1, mine.filter(q => !q.dead).length); return s; });
  line(name, r, (mean, rng) => '他系統まで ' + mean('gap').toFixed(1) + ' ' + rng(x => x.gap, 1) + ' 同系統まで ' + mean('kin').toFixed(1) + ' ' + rng(x => x.kin, 1) + ' その場の B ' + mean('b').toFixed(3) + ' A ' + mean('a').toFixed(3));
}
