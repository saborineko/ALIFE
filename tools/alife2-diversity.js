// How many kinds of body are alive in a world, counted so that worlds of different size can be compared.
// A kind is a body plan (segments / mouths / eye / joints / cilia). The effective number of kinds is the inverse Simpson index:
// 1 if all bodies are alike, k if there are k equally common kinds. It is also taken for random samples of the same size (SAMPLE bodies)
// from every world, since a bigger population holds more rare kinds by number alone.
// Usage: node tools/alife2-diversity.js <label>=<world.json.gz,world.json.gz,...> ...
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const SAMPLE = 80, simpson = l => { const c = new Map(); for (const k of l) c.set(k, (c.get(k) || 0) + 1); let s = 0; for (const v of c.values()) s += (v / l.length) ** 2; return { eff: 1 / s, kinds: c.size }; };
const rng = A.genome.rng(1), sample = l => { const a = l.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, SAMPLE); };
const rg = (l, d) => (l.reduce((a, b) => a + b, 0) / l.length).toFixed(d) + ' [' + Math.min(...l).toFixed(d) + '〜' + Math.max(...l).toFixed(d) + ']';
for (const arg of process.argv.slice(2)) {
  const [label, files] = arg.split('='), rows = files.split(',').map(f => { const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(f)))), kinds = w.bodies.map(o => o.kind), all = simpson(kinds);
    let e = 0, k = 0; const R = 200; for (let i = 0; i < R; i++) { const s = simpson(sample(kinds)); e += s.eff / R; k += s.kinds / R; }
    const segs = w.bodies.map(o => o.full.segs), m = segs.reduce((a, b) => a + b, 0) / segs.length, sd = Math.sqrt(segs.reduce((a, b) => a + (b - m) ** 2, 0) / segs.length);
    const reg = w.regions ? w.regions.map(q => { const l = w.bodies.filter(o => w.regionAt(o.cx) === q.id).map(o => o.kind); return q.name + ' ' + l.length + '匹/実効 ' + (l.length ? simpson(l).eff.toFixed(1) : '-'); }).join('・') : '';
    return { n: w.bodies.length, eff: all.eff, kinds: all.kinds, effS: e, kindsS: k, sd, max: Math.max(...segs), reg }; });
  console.log('== ' + label + '（' + rows.length + ' 世界）\n  個体数 ' + rg(rows.map(r => r.n), 0) + '\n  体制の種類：全個体で ' + rg(rows.map(r => r.kinds), 0) + '、実効 ' + rg(rows.map(r => r.eff), 1)
    + '\n  ' + SAMPLE + ' 個体に揃えると：種類 ' + rg(rows.map(r => r.kindsS), 1) + '、実効 ' + rg(rows.map(r => r.effS), 1) + '\n  体節数のばらつき（標準偏差） ' + rg(rows.map(r => r.sd), 2) + '、最大体節数 ' + rg(rows.map(r => r.max), 0));
  for (const r of rows) if (r.reg) console.log('    海域別：' + r.reg);
}
