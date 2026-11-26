// Can a body with an eye on each side use the difference between them? Artificial bodies only. No one is told where food is (blind: 1);
// eyes are tuned to the colour of food. Compared: no wiring; each eye driving its own side's cilia (possible with the older single signal);
// each side comparing its eye with the other side's (needs the mirror-twin connection of the newer neurons); and the last with sight cut.
// Usage: node tools/alife2-nerve2-assay.js [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [secs, ...seedArgs] = process.argv.slice(2), T = Number(secs) || 300, seeds = seedArgs.length ? seedArgs.map(Number) : [851, 852, 853, 854], G = A.genome, RAD = Math.PI / 180;
const two = (pod, nn) => { const g = G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3, beat: -1, nerve: 0.5, mouth: 0.6, gut: 0.5, gonad: 0.3 }), G.part(Object.assign({ len: 0.5, r0: 0.25, r1: 0.2, cilia: 0.6, beat: -1, nerve: 0.5, eye: 0.5, tune: 50 * RAD }, pod))], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 })] }); if (nn) g.parts[1].nn = nn; return g; };
const KINDS = [['配線なし', () => two({}), 0], ['眼が自分の側の繊毛を強める（旧来の信号）', () => two({ vE: 3, mCil: 1 }), 0], ['眼が自分の側の繊毛を弱める（旧来の信号）', () => two({ vE: 3, mCil: -1 }), 0],
  ['左右を比べ、勝った側を強める（新しい神経）', () => two({}, [{ b: 0, k: 1, in: [['v', 3], ['m0', -2]], out: [['C', 1]] }]), 0], ['左右を比べ、勝った側を弱める（新しい神経）', () => two({}, [{ b: 0, k: 1, in: [['v', 3], ['m0', -2]], out: [['C', -1]] }]), 0],
  ['比べて強める・視覚を切断', () => two({}, [{ b: 0, k: 1, in: [['v', 3], ['m0', -2]], out: [['C', 1]] }]), 1], ['比べて弱める・視覚を切断', () => two({}, [{ b: 0, k: 1, in: [['v', 3], ['m0', -2]], out: [['C', -1]] }]), 1]];
const rg = (r, k, d) => (r.reduce((a, x) => a + x[k], 0) / r.length).toFixed(d) + ' [' + Math.min(...r.map(x => x[k])).toFixed(d) + '〜' + Math.max(...r.map(x => x[k])).toFixed(d) + ']';
console.log('== 左右に眼を持つ身体 24 匹（' + T + ' 秒、' + seeds.length + ' 世界、餌の方向は誰にも教えない）');
for (const [name, make, cut] of KINDS) {
  const R = seeds.map(seed => { const w = new A.engine.World({ seed, founders: 0, cap: 0, vision: 1, blind: 1, nerve2: 1, sightless: cut }); for (let i = 0; i < 900; i++) w.step(); const all = [];
    for (let i = 0; i < 24; i++) { const o = w.spawn(make(), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null); o.E = o.prof.Emax * 0.4; all.push(o); }
    for (let i = 0; i < 30 * T; i++) w.step(); const m = f => all.reduce((a, o) => a + f(o), 0) / all.length, age = o => Math.max(1, o.age);
    return { mouth: m(o => o.eaten * o.prof.eta / age(o)), bal: m(o => (o.absorbed + o.eaten * o.prof.eta) / age(o) - o.prof.basal), alive: all.filter(o => !o.dead).length / all.length, path: m(o => o.path) }; });
  console.log('  ' + name.padEnd(24, '　') + ' 口からの収入 ' + rg(R, 'mouth', 4) + ' / 収支 ' + rg(R, 'bal', 3) + ' / 生存 ' + rg(R, 'alive', 2) + ' / 移動 ' + rg(R, 'path', 1));
}
