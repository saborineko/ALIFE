// Do a sense and what is learned work through a whole life? Artificial bodies only: the two-eyed body of tools/alife2-learn-assay.js (an eye on each side; each
// side compares its eye with the other's and slows its own cilia when it wins, which turns the body towards what it sees), in the tank where food has the colour
// the eyes like. Here every body starts as a newborn (stage 0.3) and grows. It is fed by hand so that none starves (what it eats is still counted), and it is
// rebuilt for growth every 25 seconds, five times — the pace measured in evolved worlds (a rebuild every 20 s at the median, full growth at 123 to 145 s).
// (A first version kept the bodies full and let them grow as fast as they could: they were grown in 14 seconds. Nothing about a youth can be read from that.)
// Kinds: the learner (the eye's connection starts at 0 and grows only just after a swallow) / the same body whose connections cannot change / wired from birth.
// Rules: as first built / carry / keep / keep + pair.
// Usage: node tools/alife2-lifetime-assay.js [seconds] [world seeds...]
const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [secs, ...seedArgs] = process.argv.slice(2), T = Number(secs) || 450, seeds = seedArgs.length ? seedArgs.map(Number) : [881, 882, 883, 884], G = A.genome, RAD = Math.PI / 180;
const body = (w0, eta) => { const g = G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3, beat: -1, nerve: 0.5, mouth: 0.6, gut: 0.5, gonad: 0.3 }), G.part({ len: 0.5, r0: 0.25, r1: 0.2, cilia: 0.6, beat: -1, nerve: 0.5, eye: 0.5, tune: 50 * RAD })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 })] });
  g.parts[0].nn = [{ b: 0, k: 1, in: [['g', 4]], out: [] }]; g.parts[1].nn = [{ b: 0.3, k: 1, in: [eta ? ['v', w0, eta] : ['v', w0], ['p0', 0]], out: [], m: 1 }, { b: 0, k: 1, in: [['s0', 3], ['m1', -2]], out: [['C', -1]] }]; g.hue = 200; g.birth = 0.3; return g; };
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; }, mean = a => { const s = a.filter(Number.isFinite); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : NaN; };
const rg = (r, k, d) => { const v = r.map(x => x[k]).filter(Number.isFinite); return v.length ? mean(v).toFixed(d) + ' [' + Math.min(...v).toFixed(d) + '〜' + Math.max(...v).toFixed(d) + ']' : '—'; };
const KINDS = [['学習する', 0, 0.8], ['結合は変わらない', 0, 0], ['最初から配線', 2, 0]], RULES = [['何も無し', {}], ['carry', { carry: 1 }], ['keep', { keep: 1 }], ['keep＋pair', { keep: 1, pair: 1 }]];
const out = {};
for (const [rule, opt] of RULES) { console.log('== 規則：' + rule + '（24 匹、' + T + ' 秒、' + seeds.length + ' 世界）');
  for (const [name, w0, eta] of KINDS) {
    const R = seeds.map(seed => { const w = new A.engine.World(Object.assign({ seed, founders: 0, cap: 0, vision: 1, blind: 1, nerve2: 1, learn: 1, foodHue: 50 }, opt)); for (let i = 0; i < 900; i++) w.step();
      const all = []; for (let i = 0; i < 24; i++) { const o = w.spawn(body(w0, eta), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 0.3, null); all.push({ o, eyes2: NaN, grown: NaN, eat0: 0, eatG: NaN, eatA: NaN, wAt: {}, wiped: 0, kept: 0, n: 0 }); }
      const wt = o => { const e = o.b.segs.filter(q => q.p.eye > 0.1); return e.length ? e.reduce((a, q) => a + (q.nw ? q.nw[0] : 0), 0) / e.length : 0; };
      const form0 = w.form.bind(w); w.form = function (o, x, y, a) { const r = all.find(q => q.o === o), before = r && o.b ? wt(o) : null; const v = form0(o, x, y, a); if (before != null) { const after = wt(o); r.n++; if (Math.abs(before) > 0.02) { if (Math.abs(after) < 1e-9) r.wiped++; else r.kept++; } } return v; };
      for (let i = 0; i < 30 * T; i++) { w.step(); const t = (i + 1) / 30;
        for (const r of all) { const o = r.o; if (o.dead) continue; o.E = o.prof.Emax * 0.9 * A.organs.C.growReserve; // fed, but not so full that it grows by itself
          if (o.stage < 1 && (i + 1) % 750 === 0 && o.nextCost != null) o.grow = o.nextCost; // the next piece of body is due
          if (!Number.isFinite(r.eyes2) && o.b.segs.filter(q => q.p.eye > 0.1).length >= 2) r.eyes2 = t;
          if (!Number.isFinite(r.grown) && o.stage >= 1) { r.grown = t; r.eatG = o.eaten; }
          if (Number.isFinite(r.grown) && !Number.isFinite(r.eatA) && t >= r.grown + 200) r.eatA = o.eaten;
          if ((i + 1) % 3000 === 0) r.wAt[t] = wt(o); } }
      const ok = all.filter(r => !r.o.dead);
      return { eyes2: med(ok.map(r => r.eyes2)), grown: med(ok.map(r => r.grown)), w100: mean(ok.map(r => r.wAt[100])), w200: mean(ok.map(r => r.wAt[200])), w300: mean(ok.map(r => r.wAt[300])), w400: mean(ok.map(r => r.wAt[400])),
        wiped: ok.reduce((a, r) => a + r.wiped, 0), kept: ok.reduce((a, r) => a + r.kept, 0), young: mean(ok.map(r => r.eatG / r.grown)), adult: mean(ok.map(r => (r.eatA - r.eatG) / 200)), alive: ok.length / all.length }; });
    out[rule + '|' + name] = R;
    console.log('  ' + name.padEnd(9, '　') + ' 両眼がそろう ' + rg(R, 'eyes2', 0) + ' 秒・育ち切る ' + rg(R, 'grown', 0) + ' 秒 / 身につけた結合：100 秒 ' + rg(R, 'w100', 2) + '・200 秒 ' + rg(R, 'w200', 2) + '・300 秒 ' + rg(R, 'w300', 2) + '・400 秒 ' + rg(R, 'w400', 2)
      + ' / 作り直しで結合が消えた回数 ' + R.reduce((a, x) => a + x.wiped, 0) + '・残った回数 ' + R.reduce((a, x) => a + x.kept, 0) + ' / 見つけた餌（毎秒）：育つ途中 ' + rg(R, 'young', 4) + '・育ってから 200 秒 ' + rg(R, 'adult', 4) + ' / 生存 ' + rg(R, 'alive', 2)); }
  const base = out[rule + '|結合は変わらない']; for (const k of ['学習する', '最初から配線']) { const r = out[rule + '|' + k]; console.log('    ' + k + ' ÷ 結合は変わらない：育つ途中 ' + r.map((x, i) => (x.young / base[i].young).toFixed(2)).join(' ') + ' ／ 育ってから ' + r.map((x, i) => (x.adult / base[i].adult).toFixed(2)).join(' ')); } }
