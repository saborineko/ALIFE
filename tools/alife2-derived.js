// What becomes of a new body plan? In a saved evolved world, every body born in the first third of a stretch with a plan unlike its mother's is taken as
// the founder of that plan and followed: what its kind of newborn needs (the water it must have to pay its upkeep through the skin alone) beside what
// its mother's kind needs, whether the founder grew up and bred, and how many bodies the plan had by the end. It counts; nothing is changed.
// Usage: node tools/alife2-derived.js <seconds> <world.json.gz> [...]
const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const zlib = require('zlib'), fs = require('fs'), [secs, ...files] = process.argv.slice(2), T = Number(secs) || 600, C = A.organs.C;
const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(p * (s.length - 1))] : NaN; }, f2 = (x, d) => (Number.isFinite(x) ? x.toFixed(d == null ? 2 : d) : '—'), pct = x => (Number.isFinite(x) ? (x * 100).toFixed(0) + '%' : '—');
for (const file of files) {
  const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))), t0 = w.t, F = [], plain = [];
  const needOf = p => p.basal / (C.osm * p.absorb.reduce((x, y) => x + y, 0)), newborn = g => A.organs.profile(A.development.develop(g, { stage: g.birth, maxSegs: w.maxSegs, pair: w.pair })), adult = g => A.organs.profile(A.development.develop(g, { stage: 1, maxSegs: w.maxSegs, pair: w.pair }));
  const spawn0 = w.spawn.bind(w); w.spawn = function (g, x, y, stage, parent) { const o = spawn0(g, x, y, stage, parent);
    if (parent && w.t - t0 < T / 3) { const mutated = (o.g.mutations || 0) > (parent.g.mutations || 0);
      if (o.kind !== parent.kind) { const nb = newborn(o.g), nm = newborn(parent.g), ad = adult(o.g), am = adult(parent.g); F.push({ o, id: o.id, kind: o.kind, from: parent.kind, need: needOf(nb), needM: needOf(nm), V: nb.V, VM: nm.V, adV: ad.V, adVM: am.V, adNeed: needOf(ad), adNeedM: needOf(am), cost: nb.basal, costM: nm.basal, nut: w.nutAt(o.cx, o.cy, w.nut) }); }
      else if (!mutated) plain.push({ o }); }
    return o; };
  const seen = r => { const o = r.o; if (r.up == null && o.stage >= 1) r.up = 1; if (o.kids > 0) r.bred = 1; };
  for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step(); if (i % 30 === 0) { for (const r of F) seen(r); for (const r of plain) seen(r); } }
  for (const r of F) { seen(r); const cl = w.clades.get(r.id); r.members = cl ? cl.members : 1; r.alive = cl ? cl.alive : 0; r.rel = r.need / r.needM; }
  for (const r of plain) seen(r);
  const name = file.split('/').pop().replace('-t3000.json.gz', ''), sh = (L, t) => (L.length ? L.filter(t).length / L.length : NaN), up = r => r.up === 1, bred = r => r.bred === 1, five = r => r.members >= 5, live = r => r.alive > 0;
  const row = (label, L) => label + ' ' + L.length + ' 個：始祖が育ち切った ' + pct(sh(L, up)) + '・子を産んだ ' + pct(sh(L, bred)) + '・5 匹以上になった ' + pct(sh(L, five)) + '・終わりに生きている ' + pct(sh(L, live));
  const hi = F.filter(r => r.rel > 1.05), mid = F.filter(r => r.rel <= 1.05 && r.rel >= 0.95), lo = F.filter(r => r.rel < 0.95), big = F.filter(r => r.adV > r.adVM * 1.1), small = F.filter(r => r.adV < r.adVM * 0.9), won = F.filter(five), lost = F.filter(r => !five(r));
  console.log('== ' + name + '：' + T + ' 秒のうち最初の ' + Math.round(T / 3) + ' 秒に生まれた、親と違う体制の子（新しい体制の始祖）' + F.length + ' 個。比較：同じ時期に生まれた、変異の入らなかった子 ' + plain.length + ' 匹は 育ち切った ' + pct(sh(plain, up)) + '・子を産んだ ' + pct(sh(plain, bred)));
  console.log('  ' + row('すべての新しい体制', F));
  console.log('  新生個体が必要とする水の濃さ ÷ 母の型（中央値 ' + f2(q(F.map(r => r.rel), 0.5)) + '、四分位 ' + f2(q(F.map(r => r.rel), 0.25)) + '〜' + f2(q(F.map(r => r.rel), 0.75)) + '）で分けて：' + row('5% 以上高い', hi) + ' ｜ ' + row('±5% 以内', mid) + ' ｜ ' + row('5% 以上低い', lo));
  console.log('  5 匹以上になった体制 ' + won.length + ' 個：必要な濃さ ÷ 母の型 ' + f2(q(won.map(r => r.rel), 0.5)) + '・新生個体の体積 ÷ 母の型 ' + f2(q(won.map(r => r.V / r.VM), 0.5)) + '・成体の体積 ÷ 母の型 ' + f2(q(won.map(r => r.adV / r.adVM), 0.5)) + ' ｜ ならなかった体制 ' + lost.length + ' 個：' + f2(q(lost.map(r => r.rel), 0.5)) + '・' + f2(q(lost.map(r => r.V / r.VM), 0.5)) + '・' + f2(q(lost.map(r => r.adV / r.adVM), 0.5)));
  console.log('  成体の大きさで分けて：' + row('母の体制より 1 割以上大きい', big) + '（新生個体の必要な濃さ ÷ 母の型 ' + f2(q(big.map(r => r.rel), 0.5)) + '、成体の必要な濃さ ÷ 母の型 ' + f2(q(big.map(r => r.adNeed / r.adNeedM), 0.5)) + '） ｜ ' + row('1 割以上小さい', small) + '（' + f2(q(small.map(r => r.rel), 0.5)) + '、' + f2(q(small.map(r => r.adNeed / r.adNeedM), 0.5)) + '）');
  console.log('JSON ' + JSON.stringify({ name, n: F.length, plainUp: sh(plain, up), up: sh(F, up), bred: sh(F, bred), five: sh(F, five), nFive: won.length, upHi: sh(hi, up), nHi: hi.length, upRest: sh(mid.concat(lo), up), nRest: mid.length + lo.length, relWon: q(won.map(r => r.rel), 0.5), relLost: q(lost.map(r => r.rel), 0.5), nBig: big.length, relBig: q(big.map(r => r.rel), 0.5), relSmall: q(small.map(r => r.rel), 0.5) }));
}
