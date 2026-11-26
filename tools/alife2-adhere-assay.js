// Does clinging to another body, and the seepage of reserve between touching bodies, give a small body anything?
// Artificial bodies only. Thirty small swimmers among ten large well-fed bodies that do not move. Compared: no pad; a pad (grip and seepage);
// a pad with seepage cut; and seepage without any pad.
// Usage: node tools/alife2-adhere-assay.js [seconds] [world seeds...] [full]
// With 'full' the other bodies are thirty swimmers of the same size that start full (in the tank such bodies stay full), and the thirty tested bodies start hungry.
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const hostKind = process.argv.includes('full') ? 'full' : 'big', [secs, ...seedArgs] = process.argv.slice(2).filter(x => x !== 'full'), T = Number(secs) || 300, seeds = seedArgs.length ? seedArgs.map(Number) : [861, 862, 863, 864];
const body = o => { const g = A.genome.primordial(1); Object.assign(g.parts[0], { cilia: 0.5, beat: -1, nerve: 0.5, skin: 0 }, o); return g; }, HOST = { len: 1.0, r0: 1.0, r1: 1.0, cilia: 0, mouth: 0, skin: 0, store: 0.5 };
const rg = (r, k, d) => (r.reduce((a, x) => a + x[k], 0) / r.length).toFixed(d) + ' [' + Math.min(...r.map(x => x[k])).toFixed(d) + '〜' + Math.max(...r.map(x => x[k])).toFixed(d) + ']';
const KINDS = [['パッドなし・染み出しあり', {}, { adhere: 1 }], ['パッドあり（掴む＋染み出し）', { grip: 1 }, { adhere: 1 }], ['パッドあり・染み出しを切断', { grip: 1 }, { adhere: 1, noSeep: 1 }], ['接着の規則なし', { grip: 1 }, {}]];
console.log('== ' + (hostKind === 'full' ? '空腹の小さな遊泳体 30 匹と、満腹の同じ大きさの遊泳体 30 匹（' : '小さな遊泳体 30 匹と、動かない大きな身体 10 匹（') + T + ' 秒、' + seeds.length + ' 世界）');
for (const [name, gene, opt] of KINDS) {
  const R = seeds.map(seed => { const w = new A.engine.World(Object.assign({ seed, founders: 0, cap: 0, contact: 1, noBite: 1 }, opt)); for (let i = 0; i < 900; i++) w.step(); const small = [], big = [];
    for (let i = 0; i < (hostKind === 'full' ? 30 : 10); i++) { const o = w.spawn(body(hostKind === 'full' ? {} : HOST), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null); o.E = o.prof.Emax * (hostKind === 'full' ? 1 : 0.9); big.push(o); }
    for (let i = 0; i < 30; i++) { const o = w.spawn(body(gene), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null); o.E = o.prof.Emax * 0.3; small.push(o); }
    let hold = 0, n = 0; for (let i = 0; i < 30 * T; i++) { w.step(); if (i % 30 === 0) for (const o of small) if (!o.dead) { n++; if (o.held != null && w.tick - o.held < 30) hold++; } }
    const m = (l, f) => l.reduce((a, o) => a + f(o), 0) / l.length, age = o => Math.max(1, o.age);
    return { seep: m(small, o => (o.seepIn || 0) / age(o)), out: m(small, o => (o.seepOut || 0) / age(o)), other: m(small, o => (o.absorbed + o.eaten * o.prof.eta) / age(o)), alive: small.filter(o => !o.dead).length / small.length, hold: n ? hold / n : 0, host: big.filter(o => !o.dead).length / big.length, hostLoss: m(big, o => ((o.seepOut || 0) - (o.seepIn || 0)) / age(o)) }; });
  console.log('  ' + name.padEnd(16, '　') + ' 染み出しで得た ' + rg(R, 'seep', 4) + '/秒（失った ' + rg(R, 'out', 4) + '）/ ほかの収入 ' + rg(R, 'other', 4) + ' / 生存 ' + rg(R, 'alive', 2) + ' / 掴んでいた時間 ' + rg(R, 'hold', 2) + ' / 相手側の生存 ' + rg(R, 'host', 2) + '・純流出 ' + rg(R, 'hostLoss', 4));
}
