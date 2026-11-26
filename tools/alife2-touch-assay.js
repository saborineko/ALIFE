// Does feeling a push or a tear let a body respond to being eaten? Artificial bodies only. Forty small bodies among six big-mouthed ones;
// each wiring of the small bodies is run again with the skin sense cut (numbSkin).
// Usage: node tools/alife2-touch-assay.js [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [secs, ...seedArgs] = process.argv.slice(2), T = Number(secs) || 300, seeds = seedArgs.length ? seedArgs.map(Number) : [841, 842, 843, 844];
const body = o => { const g = A.genome.primordial(1); Object.assign(g.parts[0], { cilia: 0.5, beat: -1, nerve: 0.5 }, o); return g; }, BIG = { len: 1.0, r0: 0.75, r1: 0.75, mouth: 1, gut: 0.5, muscle: 0.3, cilia: 0.15 };
const rg = (r, k, d) => (r.reduce((a, x) => a + x[k], 0) / r.length).toFixed(d) + ' [' + Math.min(...r.map(x => x[k])).toFixed(d) + '〜' + Math.max(...r.map(x => x[k])).toFixed(d) + ']';
const KINDS = [['回路なし（泳ぎ続ける）', {}, 0], ['押される・削られると強く泳ぐ', { sT: 4, sW: 4, mCil: 1 }, 0], ['同・皮膚の感覚を切断', { sT: 4, sW: 4, mCil: 1 }, 1], ['ふだん休み、触れられると泳ぐ', { nB: -2, sT: 4, sW: 4, mCil: 1 }, 0], ['同・皮膚の感覚を切断　', { nB: -2, sT: 4, sW: 4, mCil: 1 }, 1]];
console.log('== 小さな身体 40 匹と、大きな口の身体 6 匹（' + T + ' 秒、' + seeds.length + ' 世界）');
for (const [name, gene, cut] of KINDS) {
  const R = seeds.map(seed => { const w = new A.engine.World({ seed, founders: 0, cap: 0, contact: 1 }); for (let i = 0; i < 900; i++) w.step(); const prey = [];
    for (let i = 0; i < 40; i++) { const o = w.spawn(body(gene), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null); o.E = o.prof.Emax * 0.4; o.numbSkin = cut; prey.push(o); }
    for (let i = 0; i < 6; i++) { const o = w.spawn(body(BIG), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null); o.E = o.prof.Emax * 0.6; }
    for (let i = 0; i < 30 * T; i++) w.step(); const m = f => prey.reduce((a, o) => a + f(o), 0) / prey.length;
    return { lost: m(o => o.lost || 0), hurt: m(o => o.lost ? 1 : 0), alive: prey.filter(o => !o.dead).length / prey.length, path: m(o => o.path), killed: w.counts.killed }; });
  console.log('  ' + name.padEnd(16, '　') + ' 失った組織 ' + rg(R, 'lost', 3) + ' / 傷を負った割合 ' + rg(R, 'hurt', 2) + ' / 生存 ' + rg(R, 'alive', 2) + ' / 移動 ' + rg(R, 'path', 1) + ' / 傷で死んだ数 ' + rg(R, 'killed', 1));
}
