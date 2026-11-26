// Does a travelling wave of richness make moving, and sensing where to move, pay? Artificial bodies only, each kind alone in a tank.
// Compared, with the wave and without: a body that only drifts; one that only swims; one that swims and turns when the water tastes worse than a moment ago
// (one neuron: the change of taste drives the turning of its cilia); and the last with its taste cut.
// Usage: node tools/alife2-wave-assay.js [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [secs, ...seedArgs] = process.argv.slice(2), T = Number(secs) || 600, seeds = seedArgs.length ? seedArgs.map(Number) : [891, 892, 893, 894], G = A.genome, P = 1600;
const body = (o, nn) => { const g = G.primordial(1); Object.assign(g.parts[0], { nerve: 0.5, beat: -1 }, o); if (nn) g.parts[0].nn = nn; return g; };
const TURN = [{ b: 0, k: 1, in: [['c', -3]], out: [['T', 1]] }];
const KINDS = [['漂うだけ', () => body({ cilia: 0 }), 0], ['泳ぐだけ', () => body({ cilia: 0.4 }), 0], ['味が悪くなると向きを変える', () => body({ cilia: 0.4, adapt: 1 }, TURN), 0], ['同じ身体・味覚を切断', () => body({ cilia: 0.4, adapt: 1 }, TURN), 1]];
const rg = (r, k, d) => (r.reduce((a, x) => a + x[k], 0) / r.length).toFixed(d) + ' [' + Math.min(...r.map(x => x[k])).toFixed(d) + '〜' + Math.max(...r.map(x => x[k])).toFixed(d) + ']';
for (const wave of [P, 0]) {
  console.log('== ' + (wave ? '波あり（周期 ' + P + ' 秒）' : '波なし') + '：24 匹、' + T + ' 秒、' + seeds.length + ' 世界');
  for (const [name, make, numb] of KINDS) {
    const R = seeds.map(seed => { const w = new A.engine.World({ seed, founders: 0, cap: 0, blind: 1, nerve2: 1, wave, numb }); for (let i = 0; i < 900; i++) w.step(); const all = [];
      for (let i = 0; i < 24; i++) { const o = w.spawn(make(), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null); o.E = o.prof.Emax * 0.5; all.push(o); }
      let rich = 0, n = 0, probe = wave || P; for (let i = 0; i < 30 * T; i++) { w.step(); if (i % 30 === 0) for (const o of all) if (!o.dead) { const keep = w.wave; w.wave = probe; rich += w.waveAt(o.cx); w.wave = keep; n++; } }
      const m = f => all.reduce((a, o) => a + f(o), 0) / all.length, age = o => Math.max(1, o.age);
      return { abs: m(o => o.absorbed / age(o)), mouth: m(o => o.eaten * o.prof.eta / age(o)), bal: m(o => (o.absorbed + o.eaten * o.prof.eta) / age(o) - o.prof.basal), alive: all.filter(o => !o.dead).length / all.length, rich: n ? rich / n : 0, path: m(o => o.path / age(o)), fill: m(o => (o.dead ? 0 : o.E / o.prof.Emax)) }; });
    console.log('  ' + name.padEnd(14, '　') + ' 体表からの収入 ' + rg(R, 'abs', 4) + ' / 口から ' + rg(R, 'mouth', 4) + ' / 収支 ' + rg(R, 'bal', 4) + ' / 生存 ' + rg(R, 'alive', 2) + ' / いた場所の豊かさ ' + rg(R, 'rich', 2) + ' / 速さ ' + rg(R, 'path', 3));
  }
}
