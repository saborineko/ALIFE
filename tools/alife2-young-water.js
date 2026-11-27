// How rich must the water be for a body to pay its upkeep through its skin alone — as a newborn, as an adult — and how rich is the water at a given
// distance from a mother? In saved evolved worlds; it reads, nothing is changed (each world is stepped 10 s first, so that per-body state is in place).
// Usage: node tools/alife2-young-water.js <world.json.gz> [...]
const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const zlib = require('zlib'), fs = require('fs'), C = A.organs.C, TAU = Math.PI * 2;
const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(p * (s.length - 1))] : NaN; }, f = (x, d) => (Number.isFinite(x) ? x.toFixed(d == null ? 2 : d) : '—'), pct = x => (Number.isFinite(x) ? (x * 100).toFixed(0) + '%' : '—');
for (const file of process.argv.slice(2)) {
  const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))); for (let i = 0; i < 300; i++) w.step();
  let s = 0; for (let i = 0; i < w.nut.length; i++) s += w.nut[i]; const world = s / w.nut.length, cells = Array.from(w.nut).sort((a, b) => a - b), share = c => cells.filter(v => v >= c).length / cells.length;
  const needOf = p => p.basal / (C.osm * p.absorb.reduce((a, b) => a + b, 0)), at = o => w.nutAt(o.cx, o.cy, w.nut), adults = w.bodies.filter(o => o.stage >= 1);
  const baby = o => A.organs.profile(A.development.develop(o.g, { stage: o.g.birth, maxSegs: w.maxSegs, pair: w.pair })); // a newborn of this body's genome, as it would be laid
  const B = w.bodies.map(o => { const p = baby(o); return { need: needOf(p), fixed: C.fixed / p.basal, tau: C.eggReserve * p.Emax / p.basal }; }), Ad = adults.map(o => ({ need: needOf(o.prof), fixed: C.fixed / o.prof.basal }));
  const name = file.split('/').pop().replace('-t3000.json.gz', ''), nb = q(B.map(b => b.need), 0.5), na = q(Ad.map(b => b.need), 0.5);
  console.log('== ' + name + '：溶存栄養 世界の平均 ' + f(world, 3) + '・成体のいる場所（中央値）' + f(q(adults.map(at), 0.5), 3) + ' ｜ 体表からの吸収だけで維持費を払うのに要る濃さ：新生個体 ' + f(nb, 3) + '（世界の水のうち足りるのは ' + pct(share(nb)) + '、固定費は維持費の ' + pct(q(B.map(b => b.fixed), 0.5)) + '、産まれたときの蓄えは収入 0 で ' + f(q(B.map(b => b.tau), 0.5), 1) + ' 秒）・成体 ' + f(na, 3) + '（' + pct(share(na)) + '、固定費 ' + pct(q(Ad.map(b => b.fixed), 0.5)) + '）');
  // the water at a distance from a mother: 12 directions around every adult, at the usual laying distance (her size + 1) plus this much — placed as an egg would be (round the world sideways, kept inside top and bottom)
  const rows = [];
  for (const extra of [0, 2, 4, 8, 12, 16, 24, 40]) { const rel = [], ok = [], same = [];
    for (const o of adults) { const d = Math.sqrt(o.prof.V) + 1 + extra, need = needOf(baby(o)), reg = w.regions ? w.regionAt(o.cx) : 0;
      for (let k = 0; k < 12; k++) { const a = TAU * (k + 0.5) / 12, x = (((o.cx + Math.cos(a) * d) % w.W) + w.W) % w.W, y = Math.min(w.H - 2, Math.max(2, o.cy + Math.sin(a) * d)), v = w.nutAt(x, y, w.nut); rel.push(v / world); ok.push(v >= need ? 1 : 0); same.push(!w.regions || w.regionAt(x) === reg ? 1 : 0); } }
    rows.push({ extra, rel: q(rel, 0.5), ok: ok.reduce((a, b) => a + b, 0) / ok.length, same: same.reduce((a, b) => a + b, 0) / same.length }); }
  console.log('  母からの距離（ふだんの距離に足す分）ごとの水：' + rows.map(r => '+' + r.extra + ' → 世界の平均の ' + f(r.rel) + '、その母の新生個体に足りる場所 ' + pct(r.ok) + '、母と同じ海域 ' + pct(r.same)).join(' ｜ '));
  console.log('JSON ' + JSON.stringify({ name, world, adultAt: q(adults.map(at), 0.5), needNewborn: nb, needAdult: na, rows }));
}
