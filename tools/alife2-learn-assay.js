// Can a body acquire, in its own life, a connection it was not born with — and does that feed it?
// Artificial bodies only, as in tools/alife2-nerve2-assay.js: an eye on each side, each side comparing its eye with the other's and slowing its own cilia when it wins
// (that turns the body towards what it sees). Here the eye's connection starts with strength 0. It can grow with use, but only in the moment after the
// body's mouth has swallowed something (the mouth's segment reports that to the sides). Nobody is told where food is.
// World A: food has the colour the eyes like. World B: food has another colour and the bodies themselves wear the colour the eyes like.
// Compared in each: the learner; the same body where connections cannot change; a body wired correctly from birth.
// Usage: node tools/alife2-learn-assay.js [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const v2 = process.argv.includes('v2'), [secs, ...seedArgs] = process.argv.slice(2).filter(x => x !== 'v2'), T = Number(secs) || 600, seeds = seedArgs.length ? seedArgs.map(Number) : [881, 882, 883, 884], G = A.genome, RAD = Math.PI / 180;
const body = (w0, eta, hue) => { const g = G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3, beat: -1, nerve: 0.5, mouth: 0.6, gut: 0.5, gonad: 0.3 }), G.part({ len: 0.5, r0: 0.25, r1: 0.2, cilia: 0.6, beat: -1, nerve: 0.5, eye: 0.5, tune: 50 * RAD })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 })] });
  g.parts[0].nn = [{ b: 0, k: 1, in: [['g', 4]], out: [] }];
  // first design: the neuron that compares the two sides is itself the one that learns. (It splits: the side that wins grows, the side that loses shrinks.)
  // second design ('v2'): on each side one neuron takes the eye (its connection learns, only just after a swallow) and a second one compares the two sides' first neurons.
  g.parts[1].nn = v2 ? [{ b: 0.3, k: 1, in: [eta ? ['v', w0, eta] : ['v', w0], ['p0', 0]], out: [], m: 1 }, { b: 0, k: 1, in: [['s0', 3], ['m1', -2]], out: [['C', -1]] }] : [{ b: 0.3, k: 1, in: [eta ? ['v', w0, eta] : ['v', w0], ['m0', -2], ['p0', 0]], out: [['C', -1]], m: 2 }]; g.hue = hue; return g; };
const rg = (r, k, d) => (r.reduce((a, x) => a + x[k], 0) / r.length).toFixed(d) + ' [' + Math.min(...r.map(x => x[k])).toFixed(d) + '〜' + Math.max(...r.map(x => x[k])).toFixed(d) + ']';
const KINDS = [['学習する（結合は 0 から）', 0, 0.8, 1], ['同じ身体・結合は変わらない', 0, 0.8, 0], ['最初から配線（結合 ' + (v2 ? 2 : 3) + '）', v2 ? 2 : 3, 0, 1]];
for (const [world, foodHue, hue] of [['世界 A：餌の色＝眼が好む色（身体は別の色）', 50, 200], ['世界 B：餌は別の色、身体が眼の好む色', 200, 50]]) {
  console.log('== ' + world + '（24 匹、' + T + ' 秒、' + seeds.length + ' 世界）');
  for (const [name, w0, eta, learn] of KINDS) {
    const R = seeds.map(seed => { const w = new A.engine.World({ seed, founders: 0, cap: 0, vision: 1, blind: 1, nerve2: 1, learn, foodHue }); for (let i = 0; i < 900; i++) w.step(); const all = [];
      for (let i = 0; i < 24; i++) { const o = w.spawn(body(w0, eta, hue), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null); o.E = o.prof.Emax * 0.4; all.push(o); }
      let early = 0, late = 0; for (let i = 0; i < 30 * T; i++) { w.step(); if (i === 15 * T) early = all.reduce((a, o) => a + o.eaten, 0); } late = all.reduce((a, o) => a + o.eaten, 0) - early;
      const m = f => all.reduce((a, o) => a + f(o), 0) / all.length, age = o => Math.max(1, o.age), live = all.filter(o => !o.dead), nw = all.flatMap(o => o.b.segs.slice(1).map(s => (s.nw ? s.nw[0] : 0))); // (a body that died keeps what it had when it died)
      return { mouth: m(o => o.eaten * o.prof.eta / age(o)), alive: live.length / all.length, got: nw.length ? nw.reduce((a, x) => a + x, 0) / nw.length : 0, spread: nw.length ? nw.filter(x => x > 0.5).length / nw.length : 0, neg: nw.length ? nw.filter(x => x < -0.5).length / nw.length : 0, half: early > 0 ? late / early : 0 }; });
    console.log('  ' + name.padEnd(16, '　') + ' 口からの収入 ' + rg(R, 'mouth', 4) + ' / 生存 ' + rg(R, 'alive', 2) + ' / 身につけた強さ（全個体の平均。死んだ個体は死んだ時点）' + rg(R, 'got', 2) + '（+0.5 超の側 ' + rg(R, 'spread', 2) + '、−0.5 未満の側 ' + rg(R, 'neg', 2) + '）' + ' / 食べた量：後半÷前半 ' + rg(R, 'half', 2));
  }
}
