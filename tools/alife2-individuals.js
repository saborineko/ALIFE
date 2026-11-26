// Look for single genomes, however rare, whose nerve circuit or brain does something.
// Reads a saved final world (alife2-evolve.js ... saveWorld=<path>). Every distinct living genome that connects a sense
// to an effector is a candidate, even if one body carries it. Copies of each candidate are tested against their own
// ablations (numb: cannot taste dissolved food; blind: not told where food is), in fresh worlds of the same kind.
//   screen   : all candidates together in one world per condition (fast; they may crowd each other)
//   confirm  : each flagged candidate alone, in new worlds
//   ancestry : for a confirmed candidate, the same test on its ancestors' genomes, oldest first, to see where the effect begins
//   heirs    : and on living genomes descended from it
// A difference counts only where the ranges over worlds do not overlap.
// Usage: node tools/alife2-individuals.js <world.json> [seconds] [copies] [max candidates]
const A = require('../alife2-genome.js'), fs = require('fs');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [file, secs, copiesArg, maxArg] = process.argv.slice(2), T = Number(secs) || 120, COPIES = Number(copiesArg) || 12, MAX = Number(maxArg) || 16;
const saved = JSON.parse(fs.readFileSync(file)), W = A.engine.World.restore(saved), map = W.map || '';
const BEH = ['speed', 'straight', 'turn', 'cilia', 'nerve'], OUT = ['mouth', 'income', 'alive', 'eggs'], LABEL = { speed: '自力移動', straight: '直進度', turn: '旋回', cilia: '繊毛の活動', nerve: '神経の活動', mouth: '口から', income: '収入', alive: '生存', eggs: '卵への投資' };
const key = g => JSON.stringify([g.parts, g.links, g.brain.map(v => +v.toFixed(3))]);
const acts = g => { const p = A.development.develop(g, { maxSegs: W.maxSegs }); return p.segs.some(s => A.neural.wiring(s.p) > 1e-6 && ((s.p.cilia > 0.05 && (Math.abs(s.p.mCil) > 0.1 || Math.abs(s.p.mTurn) > 0.1)) || (s.id > 0 && s.p.muscle > 0.02 && Math.abs(s.p.mJoint) > 0.1))); };
const mobile = g => A.development.develop(g, { maxSegs: W.maxSegs }).segs.some(s => s.p.cilia > 0.05 || (s.id > 0 && s.p.muscle > 0.02 && s.p.amp > 0.02)); // a body that cannot move has nothing to steer
const steers = g => mobile(g) && (Math.abs(g.brain[6]) > 0.3 || Math.abs(g.brain[7]) > 0.3 || Math.abs(g.brain[1]) > 0.3 || Math.abs(g.brain[2]) > 0.3);
const groups = new Map();
for (const o of W.bodies) { const k = key(o.g); if (!groups.has(k)) groups.set(k, { g: o.g, ids: [], regions: [] }); const q = groups.get(k); q.ids.push(o.id); q.regions.push(W.regions ? W.regionAt(o.cx) : 0); }
const mode = a => { const c = {}; let best = a[0]; for (const x of a) { c[x] = (c[x] || 0) + 1; if (c[x] > c[best]) best = x; } return best; };
const cands = [...groups.values()].filter(q => acts(q.g) || steers(q.g)).map(q => Object.assign(q, { region: mode(q.regions), circuit: acts(q.g), brain: steers(q.g) })).sort((a, b) => (b.circuit - a.circuit) || b.ids.length - a.ids.length).slice(0, MAX);
console.log(`${file.split('/').pop()}: ${W.bodies.length} bodies, ${groups.size} distinct genomes; ${[...groups.values()].filter(q => acts(q.g)).length} connect a local sense to an effector, ${[...groups.values()].filter(q => steers(q.g)).length} have brain weights on food direction. Testing ${cands.length}.`);

// run a set of genomes (each with a home region) under one condition; returns per-genome metrics
function assay(list, seed, cond) {
  const w = new A.engine.World({ seed, map, founders: 0, cap: 0, blind: cond === 'blind' ? 1 : 0, numb: cond === 'numb' ? 1 : 0 }); for (let i = 0; i < 1200; i++) w.step();
  const sets = list.map(q => { const l = []; for (let i = 0; i < COPIES; i++) { const R = w.regions ? w.regions[q.region] : null, x = R ? R.x0 + w.rand() * (R.x1 - R.x0) : w.rand() * w.W; const o = w.spawn(A.genome.sanitize(A.genome.copy(q.g)), x, 3 + w.rand() * (Math.min(w.H, w.yBottom) - 6), 1, null); o.E = o.prof.Emax * 0.5; l.push(o); } return l; });
  const all = sets.flat(), ang = o => Math.atan2(o.b.segs[0].dy, o.b.segs[0].dx);
  for (const o of all) { o.x0 = o.cx; o.y0 = o.cy; o.th = ang(o); o.turned = 0; o.net = 0; }
  for (let i = 0; i < 30 * T; i++) { w.step(); if (i % 5 === 4) for (const o of all) if (!o.dead) { const a = ang(o); let da = a - o.th; da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI; o.turned += Math.abs(da); o.th = a; let dx = o.cx - o.x0; dx -= Math.round(dx / w.W) * w.W; o.net = Math.hypot(dx, o.cy - o.y0); } }
  const age = o => Math.max(1, o.age);
  return sets.map(l => { const m = f => l.reduce((a, o) => a + f(o), 0) / l.length; return { speed: m(o => o.path / age(o)), straight: m(o => o.path > 0.5 ? Math.min(1, o.net / o.path) : 0), turn: m(o => o.turned / age(o)), cilia: m(o => o.b.ciliaUse / age(o)), nerve: m(o => o.b.nerveUse / age(o)), mouth: m(o => o.eaten * o.prof.eta / age(o)), income: m(o => (o.absorbed + o.eaten * o.prof.eta) / age(o)), alive: m(o => o.dead ? 0 : 1), eggs: m(o => (o.egg + o.kids * o.eggCost) / age(o)) }; });
}
// compare conditions over several worlds; returns for each genome the list of metrics whose ranges do not overlap
function compare(list, seeds) {
  const res = {}; for (const c of ['intact', 'numb', 'blind']) res[c] = seeds.map(s => assay(list, s, c));
  return list.map((q, i) => { const diffs = []; for (const c of ['numb', 'blind']) for (const k of BEH.concat(OUT)) { const a = res.intact.map(r => r[i][k]), b = res[c].map(r => r[i][k]), mean = v => v.reduce((x, y) => x + y, 0) / v.length; const size = Math.abs(mean(b) - mean(a)) / Math.max(Math.abs(mean(a)), Math.abs(mean(b)), 1e-6);
      // counts only if the ranges over worlds do not overlap AND the change is at least 10% (5% for outcomes). Nerve activity itself is not behaviour: cutting an input changes it trivially.
      // strong: at least 10% (5% for outcomes), used to pick what to follow up. weak: any separated change; kept on record, because a small edge can matter over many generations.
      if (k !== 'nerve' && (Math.min(...b) > Math.max(...a) || Math.max(...b) < Math.min(...a))) diffs.push({ cut: c, k, kind: BEH.includes(k) ? '行動' : '結果', from: mean(a), to: mean(b), size, strong: size >= (BEH.includes(k) ? 0.10 : 0.05) }); } return diffs; });
}
const show = d => (d.cut === 'numb' ? '味覚' : '餌の方向') + 'を切ると' + d.kind + '「' + LABEL[d.k] + '」 ' + d.from.toFixed(3) + ' → ' + d.to.toFixed(3);
const wiringOf = g => g.parts.map((p, i) => A.neural.wiring(p) > 1e-6 ? `部品${i}[味${p.nC.toFixed(1)} 親${p.nP.toFixed(1)} 子${p.nK.toFixed(1)} 空腹${p.nH.toFixed(1)} 基${p.nB.toFixed(1)} 残${p.leak.toFixed(2)} 順応${p.adapt.toFixed(2)} →繊毛${p.mCil.toFixed(1)} 旋回${p.mTurn.toFixed(1)} 関節${p.mJoint.toFixed(1)}]` : '').filter(Boolean).join(' ') || '回路なし';
if (!cands.length) { console.log('候補なし。'); process.exit(0); }
const screen = compare(cands, [901, 902, 903, 904]);
const flagged = [];
const weak = [];
cands.forEach((q, i) => { const all = screen[i], d = all.filter(x => x.strong); q.effect = d.reduce((m, x) => Math.max(m, x.size), 0); for (const x of all) if (!x.strong) weak.push({ id: q.ids[0], count: q.ids.length, cut: x.cut, k: x.k, from: x.from, to: x.to, size: x.size }); console.log(`  #${q.ids[0]}（${q.ids.length} 匹、${W.regions ? W.regions[q.region].name : '世界'}、体節 ${A.development.develop(q.g, { maxSegs: W.maxSegs }).segs.length}、${q.circuit ? '局所回路→効果器' : '脳の重みのみ'}）: ` + (d.length ? d.map(show).join(' / ') : '差なし')); if (d.length) flagged.push(q); });
flagged.sort((a, b) => b.effect - a.effect);
const out = { file, candidates: cands.length, weak, flagged: [] };
console.log(`  基準未満だが世界ごとの範囲が重ならない変化：${weak.length} 件（${new Set(weak.map(x => x.id)).size} 遺伝子）。行動 ${weak.filter(x => BEH.includes(x.k)).length}・結果 ${weak.filter(x => OUT.includes(x.k)).length}。記録に残す。`);
for (const q of flagged.slice(0, 4)) {
  console.log(`\n確認：#${q.ids[0]} を単独で、別の世界 4 つ`);
  const d = compare([q], [911, 912, 913, 914])[0];
  console.log('  ' + (d.length ? d.map(show).join(' / ') : '差は再現しない') + '\n  配線：' + wiringOf(q.g) + '\n  脳（駆動・旋回・誘導 × 定数・前・左・空腹・揺らぎ）：' + q.g.brain.map(v => v.toFixed(1)).join(' '));
  const rec = { id: q.ids[0], count: q.ids.length, genome: q.g, screen: screen[cands.indexOf(q)], confirm: d, ancestry: [], heirs: [] };
  if (d.length) {
    const chain = W.ancestors(q.ids[0]).reverse(), seen = new Set(), anc = []; for (const n of chain) { const k = key(n.g); if (!seen.has(k)) { seen.add(k); anc.push({ g: n.g, region: q.region, node: n }); } }
    const ar = compare(anc.slice(-10), [921, 922, 923]);
    console.log('  祖先（古い順、最大 10 世代ぶん）：'); anc.slice(-10).forEach((a, i) => { console.log(`    #${a.node.id} 世代 ${a.node.gen}: ` + (ar[i].length ? ar[i].map(show).join(' / ') : '差なし')); rec.ancestry.push({ id: a.node.id, gen: a.node.gen, diffs: ar[i], genome: a.g }); });
    const heirs = [...groups.values()].filter(h => h !== q && W.ancestors(h.ids[0]).some(n => q.ids.includes(n.id))).slice(0, 6).map(h => Object.assign(h, { region: mode(h.regions) }));
    if (heirs.length) { const hr = compare(heirs, [931, 932, 933]); console.log('  生きている子孫の遺伝子：'); heirs.forEach((h, i) => { console.log(`    #${h.ids[0]}（${h.ids.length} 匹）: ` + (hr[i].length ? hr[i].map(show).join(' / ') : '差なし')); rec.heirs.push({ id: h.ids[0], count: h.ids.length, diffs: hr[i], genome: h.g }); }); } else console.log('  生きている子孫の遺伝子：なし（この遺伝子の個体自身が末端）');
  }
  out.flagged.push(rec);
}
if (!flagged.length) console.log('\n切断対照と差のある遺伝子は無かった。');
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out));
