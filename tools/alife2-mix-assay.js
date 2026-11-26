// Does genetic mixing by contact make new combinations of genes, and only where the rule is on?
// Artificial bodies, no mutation: any body that has the cilia of one line and the mouth of the other can only have come from an egg made of two genomes.
// Two marked lines, thirty bodies each: A swims well and has a small mouth, B swims poorly and has a large mouth.
// Usage: node tools/alife2-mix-assay.js [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const neutral = process.argv.includes('neutral'), [secs, ...seedArgs] = process.argv.slice(2).filter(x => x !== 'neutral'), T = Number(secs) || 900, seeds = seedArgs.length ? seedArgs.map(Number) : [871, 872, 873, 874];
const body = (o, hue) => { const g = A.genome.primordial(1); Object.assign(g.parts[0], { beat: -1, nerve: 0.5 }, o); g.hue = hue; return g; };
// With 'neutral' the two lines have the same body and differ in two genes that do nothing in this world (the timing of a pad they do not have, the colour an eye they do not have would prefer).
const LA = neutral ? { cilia: 0.3, gripPhase: 0.1, tune: 0.2 } : { cilia: 0.5, mouth: 0.2 }, LB = neutral ? { cilia: 0.3, gripPhase: 0.9, tune: 0.8 } : { cilia: 0.2, mouth: 0.9 }, [g1, g2] = neutral ? ['gripPhase', 'tune'] : ['cilia', 'mouth'];
const KINDS = [['混ざる', { mix: 1 }, 0], ['混ざらない（規則なし）', {}, 0], ['混ざる規則あり・全身が外皮', { mix: 1 }, 1]];
console.log('== 2 系統 30 匹ずつ（' + (neutral ? '身体は同じ。働きの無い印の遺伝子 2 つだけが違う：A は gripPhase 0.1・tune 0.2 ／ B は 0.9・0.8' : 'A：繊毛 0.5・口 0.2 ／ B：繊毛 0.2・口 0.9') + '）、変異なし、' + T + ' 秒、' + seeds.length + ' 世界');
for (const [name, opt, skin] of KINDS) {
  const rows = seeds.map(seed => { const w = new A.engine.World(Object.assign({ seed, founders: 0, contact: 1, noBite: 1, mutation: 0 }, opt));
    for (let i = 0; i < 30; i++) { w.spawn(body(Object.assign({ skin }, LA), 10), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null); w.spawn(body(Object.assign({ skin }, LB), 200), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null); }
    for (let i = 0; i < 30 * T; i++) w.step();
    const c = { A: 0, B: 0, good: 0, poor: 0, other: 0 }; for (const o of w.bodies) { const p = o.g.parts[0], is = (x, y) => Math.abs(x - y) < 1e-9 /* (angles pass through a wrap that can move the last bit) */, k = is(p[g1], LA[g1]) ? (is(p[g2], LA[g2]) ? 'A' : is(p[g2], LB[g2]) ? 'good' : 'other') : is(p[g1], LB[g1]) ? (is(p[g2], LB[g2]) ? 'B' : is(p[g2], LA[g2]) ? 'poor' : 'other') : 'other'; c[k]++; }
    return Object.assign(c, { n: w.bodies.length, two: w.bodies.filter(o => o.p2).length, carry: w.bodies.filter(o => o.got).length, births: w.counts.births, mixed: w.counts.mixed || 0, gen: w.bodies.reduce((a, o) => a + o.gen, 0) / Math.max(1, w.bodies.length) }); });
  console.log('  ' + name);
  for (const r of rows) console.log('    個体 ' + r.n + '（平均世代 ' + r.gen.toFixed(1) + '）：A 型 ' + r.A + ' / B 型 ' + r.B + ' / 組み換え型（' + g1 + ' は A・' + g2 + ' は B）' + r.good + ' /（' + g1 + ' は B・' + g2 + ' は A）' + r.poor + ' / その他 ' + r.other + ' ｜ 2 つの遺伝子から生まれた ' + r.two + '（' + (100 * r.two / Math.max(1, r.n)).toFixed(0) + '%）、遺伝物質を持っている ' + r.carry + ' ｜ 出生 ' + r.births + '、うち 2 つの遺伝子から ' + r.mixed);
}
