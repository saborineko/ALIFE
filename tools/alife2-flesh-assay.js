// Can a body live, in part, on the tissue of other bodies? And what does it do to ordinary bodies that they can now touch and tear each other?
// Artificial bodies only (nothing here evolved). Every case is run with tissue-taking on, with it cut (bodies touch, mouths take nothing),
// and, for the packed bodies, without contact at all.
// 1) six big-mouthed swimmers among forty small ones: one kind meets them by chance; one has an eye tuned to their colour, wired
//    "go straight while what I see of that colour grows, otherwise turn".
// 2) thirty-six ordinary small bodies packed in three places: swimmers, and bodies that cannot move.
// Usage: node tools/alife2-flesh-assay.js [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [secs, ...seedArgs] = process.argv.slice(2), T = Number(secs) || 300, seeds = seedArgs.length ? seedArgs.map(Number) : [821, 822, 823, 824], C = A.organs.C, RAD = Math.PI / 180;
const body = (o, hue) => { const g = A.genome.primordial(1); Object.assign(g.parts[0], { cilia: 0.5, beat: -1, nerve: 0.5 }, o); g.hue = hue; return g; };
const BIG = { len: 1.0, r0: 0.75, r1: 0.75, mouth: 1, gut: 0.5, muscle: 0.3 }, SEER = Object.assign({ eye: 0.5, adapt: 1, vE: -2, nB: 2, mTurn: 1.5, tune: 200 * RAD }, BIG);
const world = (seed, o) => { const w = new A.engine.World(Object.assign({ seed, founders: 0, cap: 0, vision: 1 }, o)); for (let i = 0; i < 900; i++) w.step(); return w; };
const put = (w, g, x, y) => { const o = w.spawn(g, x == null ? w.rand() * w.W : x, y == null ? 4 + w.rand() * (w.yBottom - 8) : y, 1, null); o.E = o.prof.Emax * 0.4; return o; };
const st = (all, w) => { const m = f => all.reduce((a, o) => a + f(o), 0) / all.length, age = o => Math.max(1, o.age);
  return { flesh: m(o => (o.flesh || 0) / age(o)), grain: m(o => (o.eaten - (o.flesh || 0)) / age(o)), share: all.reduce((a, o) => a + (o.flesh || 0), 0) / Math.max(1e-9, all.reduce((a, o) => a + o.eaten, 0)),
    bal: m(o => (o.absorbed + o.eaten * o.prof.eta) / age(o) - o.prof.basal - (C.ciliaWork * o.b.ciliaUse + C.spike * o.b.nerveUse + C.work * o.b.work) / age(o)), alive: all.filter(o => !o.dead).length / all.length, killed: w.counts.killed, hurt: m(o => o.lost ? 1 : 0), path: m(o => o.path) }; };
const rg = (r, k, d) => (r.reduce((a, x) => a + x[k], 0) / r.length).toFixed(d) + ' [' + Math.min(...r.map(x => x[k])).toFixed(d) + '〜' + Math.max(...r.map(x => x[k])).toFixed(d) + ']';
const CONDS = [['摂取あり', { contact: 1 }], ['摂取を切断', { contact: 1, noBite: 1 }], ['接触なし', {}]];
console.log('== 1) 大きな口の遊泳体 6 匹と、小さな遊泳体 40 匹（' + T + ' 秒、' + seeds.length + ' 世界）');
for (const [kind, gene] of [['偶然まかせ', BIG], ['色が大きくなる間は直進（眼）', SEER]]) for (const [cn, co] of CONDS.slice(0, 2)) {
  const H = [], P = []; for (const seed of seeds) { const w = world(seed, co), hs = [], ps = []; for (let i = 0; i < 40; i++) ps.push(put(w, body({}, 200))); for (let i = 0; i < 6; i++) hs.push(put(w, body(gene, 20))); for (let i = 0; i < 30 * T; i++) w.step(); H.push(st(hs, w)); P.push(st(ps, w)); }
  console.log('  ' + (kind + '・' + cn).padEnd(24, '　') + ' 大口：組織から ' + rg(H, 'flesh', 4) + '/秒、粒から ' + rg(H, 'grain', 4) + '/秒、組織の割合 ' + rg(H, 'share', 2) + '、収支 ' + rg(H, 'bal', 3) + '、生存 ' + rg(H, 'alive', 2)
    + '\n' + ''.padEnd(26, '　') + ' 小さい側：生存 ' + rg(P, 'alive', 2) + '、傷を負った割合 ' + rg(P, 'hurt', 2) + '、傷で死んだ数 ' + rg(P, 'killed', 0));
}
console.log('== 2) 普通の小さな身体 36 匹を 3 か所に密集（' + Math.min(T, 200) + ' 秒）');
const S3 = [[30, 25], [80, 45], [130, 30]];
for (const [kind, gene] of [['遊泳体', {}], ['動かない身体', { cilia: 0 }]]) for (const [cn, co] of CONDS) {
  const R = []; for (const seed of seeds) { const w = world(seed, co), all = []; for (let i = 0; i < 36; i++) { const [x, y] = S3[i % 3]; all.push(put(w, body(gene, 200), x + w.rand.gauss() * 1.5, y + w.rand.gauss() * 1.5)); } for (let i = 0; i < 30 * Math.min(T, 200); i++) w.step(); R.push(st(all, w)); }
  console.log('  ' + (kind + '・' + cn).padEnd(14, '　') + ' 生存 ' + rg(R, 'alive', 2) + '、収支 ' + rg(R, 'bal', 3) + '、組織の割合 ' + rg(R, 'share', 3) + '、傷を負った割合 ' + rg(R, 'hurt', 2) + '、傷で死んだ数 ' + rg(R, 'killed', 0) + '、移動 ' + rg(R, 'path', 1));
}
