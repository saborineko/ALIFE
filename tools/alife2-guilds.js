// How do the bodies of a saved world make their living? Groups them by the share of their lifetime income that came through the mouth
// (the rest was taken up through the skin from dissolved food), and prints for each group: how many, where they live, how they are built,
// how fast they move, income against upkeep, and offspring per 100 seconds of adult life (so that old bodies do not count for more).
// A record of the living only: bodies that died young are not in it.
// Usage: node tools/alife2-guilds.js <world.json.gz> [...]
const zlib = require('zlib'), fs = require('fs'), A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
for (const file of process.argv.slice(2)) {
  const w = A.engine.World.restore(JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file))), ad = w.bodies.filter(o => o.stage >= 1 && o.age > 60);
  const sh = o => { const m = o.eaten * o.prof.eta, t = m + o.absorbed; return t > 0 ? m / t : 0; }, bins = [0, 0.1, 0.3, 0.5, 1.01], names = w.regions ? w.regions.map(q => q.name) : ['水槽'];
  console.log('== ' + file + '（t=' + Math.round(w.t) + '、成体で 60 秒以上生きている個体 ' + ad.length + ' / 全 ' + w.bodies.length + '）');
  for (let i = 0; i < bins.length - 1; i++) { const g = ad.filter(o => sh(o) >= bins[i] && sh(o) < bins[i + 1]); if (!g.length) continue; const m = fn => g.reduce((a, o) => a + fn(o), 0) / g.length, reg = {}; for (const o of g) { const r = names[w.regions ? w.regionAt(o.cx) : 0]; reg[r] = (reg[r] || 0) + 1; }
    const adult = o => Math.max(1, o.age - (o.grownAt || 0));
    console.log('  口からの収入 ' + (bins[i] * 100).toFixed(0) + '〜' + Math.min(100, bins[i + 1] * 100).toFixed(0) + '%：' + g.length + ' 個体（' + (100 * g.length / ad.length).toFixed(0) + '%）｜ 収入÷維持費 ' + m(o => (o.absorbed + o.eaten * o.prof.eta) / Math.max(1, o.age) / o.prof.basal).toFixed(2) + ' ｜ 子／齢 100 秒 ' + m(o => o.kids / o.age * 100).toFixed(2) + ' ｜ 齢 ' + m(o => o.age).toFixed(0) + ' ｜ 体積 ' + m(o => o.prof.V).toFixed(2) + '・体節 ' + m(o => o.b.segs.length).toFixed(1) + '・口 ' + m(o => o.prof.mouths.length).toFixed(1) + ' ｜ 速さ ' + m(o => o.path / Math.max(1, o.age)).toFixed(3) + ' ｜ 繊毛あり ' + (100 * m(o => (o.prof.cilia > 0.05 ? 1 : 0))).toFixed(0) + '%・配線された眼 ' + (100 * m(o => (o.b.segs.some(s => s.p.eye > 0.05 && (Math.abs(s.p.vE || 0) > 0.05 || (s.p.nn || []).some(q => q.in.some(e => e[0] === 'v')))) ? 1 : 0))).toFixed(0) + '%・味覚の配線 ' + (100 * m(o => (o.b.segs.some(s => Math.abs(s.p.nC || 0) > 0.05) ? 1 : 0))).toFixed(0) + '% ｜ ' + Object.entries(reg).map(([k, v]) => k + ' ' + v).join('・')); }
}
