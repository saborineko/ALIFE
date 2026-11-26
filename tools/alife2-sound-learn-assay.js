// Sound and connections that change with experience: does an ear's connection grow in a body's own life, and does the neuron then answer to the sound of
// OTHER bodies eating? Artificial bodies only. Each swims all the time and eats what it meets. On each side it has an ear tuned to the pitch of its own
// mouth, and a neuron that reads only that ear. The connection starts at 0 and can change only in the moment after the body's own mouth has swallowed.
// The neuron drives nothing: behaviour is the same for every kind, only what is acquired and what the neuron does are read.
// Compared: the learner; the same body whose connections cannot change; a body with the connection from birth. In three worlds: cilia sound from work
// (soundWork=1), the first calibration (soundWork=0), and soundWork=1 with all ears cut.
// The ear adapts fully (adapt 1): it reports changes of loudness, and nothing in silence or in steady noise. (First design: adapt 0.5 — an ear that reports
// -0.5 in silence. The connection then grew from that constant, with or without sound; a world with ears cut showed it. Kept as `adapt=0.5`.)
// Usage: node tools/alife2-sound-learn-assay.js [seconds] [adapt=0.5] [world seeds...]
const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const ADAPT = Number((process.argv.find(a => a.startsWith('adapt=')) || 'adapt=1').slice(6)), [secs, ...seedArgs] = process.argv.slice(2).filter(a => !a.startsWith('adapt=')), T = Number(secs) || 400, seeds = seedArgs.length ? seedArgs.map(Number) : [881, 882, 883], G = A.genome;
const body = (w0, eta) => { const g = G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3, beat: 1, nerve: 0.5, mouth: 0.6, gut: 0.5, gonad: 0.3 }), G.part({ len: 0.5, r0: 0.25, r1: 0.2, nerve: 0.5, ear: 0.6, hTune: 0.36, hWide: 0.15, adapt: ADAPT })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 })] });
  g.parts[0].nn = [{ b: 0, k: 1, in: [['g', 4]], out: [] }]; g.parts[1].nn = [{ b: 0.3, k: 1, in: [eta ? ['e', w0, eta] : ['e', w0], ['p0', 0]], out: [], m: 1 }]; return g; };
const rg = (r, k, d) => (r.reduce((a, x) => a + x[k], 0) / r.length).toFixed(d) + ' [' + Math.min(...r.map(x => x[k])).toFixed(d) + '〜' + Math.max(...r.map(x => x[k])).toFixed(d) + ']';
for (const [world, opt] of [['繊毛の音は仕事から（soundWork=1）', { soundWork: 1 }], ['元の決め方（soundWork=0）', { soundWork: 0 }], ['soundWork=1・耳を切る', { soundWork: 1, deaf: 1 }]]) {
  console.log('== ' + world + '（24 匹、' + T + ' 秒、' + seeds.length + ' 世界）');
  for (const [name, w0, eta] of [['学習する（結合は 0 から）', 0, 0.8], ['同じ身体・結合は変わらない', 0, 0], ['最初から結合 2', 2, 0]]) {
    const R = seeds.map(seed => { const w = new A.engine.World(Object.assign({ seed, founders: 0, cap: 0, sound: 1, nerve2: 1, blind: 1, learn: 1 }, opt)), all = []; for (let i = 0; i < 900; i++) w.step();
      for (let i = 0; i < 24; i++) { const o = w.spawn(body(w0, eta), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null); o.E = o.prof.Emax * 0.6; all.push(o); }
      const acc = [0, 1, 2].map(() => ({ a: 0, e: 0, n: 0 })), half = w.W / 2;
      for (let i = 0; i < 30 * T; i++) { w.step(); for (const o of all) if (!o.dead) o.E = o.prof.Emax * 0.6; // (kept fed: the question is what is acquired, not who starves)
        if (i < 20 * T || i % 3) continue; // read in the last third, when what can be acquired has been
        const eating = all.filter(o => !o.dead && o.b.segs[0].ate > 0.01);
        for (const o of all) { if (o.dead) continue; let cond; if (o.b.segs[0].ate > 0.001) cond = 0; else { let near = Infinity; for (const q of eating) { if (q === o) continue; let dx = Math.abs(q.cx - o.cx); if (dx > half) dx = w.W - dx; const d = Math.hypot(dx, q.cy - o.cy); if (d < near) near = d; } cond = near <= 10 ? 1 : near > 20 ? 2 : -1; }
          if (cond < 0) continue; for (const s of o.b.segs) if (s.earW && s.na) { acc[cond].a += s.na[0]; acc[cond].e += s.e; acc[cond].n++; } } }
      const nw = all.flatMap(o => o.b.segs.filter(s => s.earW).map(s => (s.nw ? s.nw[0] : 0))), m = c => (c.n ? c.a / c.n : NaN), e = c => (c.n ? c.e / c.n : NaN);
      return { got: nw.reduce((a, x) => a + x, 0) / Math.max(1, nw.length), self: m(acc[0]), other: m(acc[1]), none: m(acc[2]), diff: m(acc[1]) - m(acc[2]), eSelf: e(acc[0]), eOther: e(acc[1]), eNone: e(acc[2]), eRatio: e(acc[1]) / e(acc[2]), nOther: acc[1].n, eaten: all.reduce((a, o) => a + o.eaten, 0) }; });
    console.log('  ' + name.padEnd(14, '　') + ' 身につけた結合 ' + rg(R, 'got', 2) + ' / 耳の神経の活動：自分が食べた直後 ' + rg(R, 'self', 3) + '・他個体が 10 単位以内で食べた直後 ' + rg(R, 'other', 3) + '・近くで誰も食べていない ' + rg(R, 'none', 3) + '・差（他 − 無）' + rg(R, 'diff', 3)
      + ' / 耳の生の読み：自分 ' + rg(R, 'eSelf', 4) + '・他 ' + rg(R, 'eOther', 4) + '・無 ' + rg(R, 'eNone', 4) + '（他÷無 ' + rg(R, 'eRatio', 2) + '）/ 例数（他）' + rg(R, 'nOther', 0) + ' / 食べた量 ' + rg(R, 'eaten', 0));
  }
}
