// Does a sloping border between regions change where bodies gather, how they move and whether they live?
// The same saved worlds are continued twice: with the stepped border they had, and with the floor's load rising smoothly.
// Usage: node tools/alife2-shore-assay.js <seconds> <tank world to move to the coast (.json)> <coast worlds (.json.gz)...>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [secs, tank, ...coast] = process.argv.slice(2), T = Number(secs) || 600, WIDTH = 24, EDGES = [190, 300, 380, 0];
const read = f => JSON.parse(f.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(f)) : fs.readFileSync(f));
function run(data, shore, reseed) {
  const w = A.engine.World.restore(JSON.parse(JSON.stringify(data))); if (reseed) w.rand = A.genome.rng(reseed); w.enable({ shore });
  const start = new Set(w.bodies.map(o => o.id)); let surv = NaN, pos = null;
  for (let i = 0; i < 30 * T; i++) { w.step(); if (i === 30 * 200) surv = w.bodies.filter(o => start.has(o.id)).length / start.size; if (i === 30 * (T - 60)) pos = new Map(w.bodies.map(o => [o.id, [o.cx, o.cy]])); }
  const n = w.bodies.length, dist = (x, e) => { let v = Math.abs(x - e); return Math.min(v, w.W - v); }, r = { n, surv };
  EDGES.forEach(e => { r['d' + e] = n ? w.bodies.filter(o => dist(o.cx, e) < 12).length / (n * 24 / w.W) : NaN; });
  const mv = w.bodies.filter(o => pos.has(o.id)).map(o => { const p = pos.get(o.id); let dx = Math.abs(o.cx - p[0]); dx = Math.min(dx, w.W - dx); return Math.hypot(dx, o.cy - p[1]) / 60; });
  r.speed = mv.length ? mv.reduce((a, b) => a + b, 0) / mv.length : NaN; return r;
}
const show = (name, list) => { const m = k => list.reduce((a, x) => a + x[k], 0) / list.length, rg = (k, d) => m(k).toFixed(d) + ' [' + Math.min(...list.map(x => x[k])).toFixed(d) + '〜' + Math.max(...list.map(x => x[k])).toFixed(d) + ']';
  console.log('  ' + name.padEnd(6, '　') + ' 密度比 外洋→海底 ' + rg('d190', 2) + ' / 海底→浅瀬 ' + rg('d300', 2) + ' / 浅瀬→大粒 ' + rg('d380', 2) + ' / 大粒→外洋 ' + rg('d0', 2) + '\n         移動の速さ ' + rg('speed', 3) + ' / 200 秒後の生存 ' + rg('surv', 2) + ' / 個体数 ' + rg('n', 0)); };
if (tank && tank !== '-') {
  const moved = A.engine.World.transplant(A.engine.World.restore(read(tank)), 'coast'); for (let i = 0; i < 30 * 60; i++) moved.step(); const base = moved.save();
  console.log('== 組 A：水槽で進化した世界を沿岸へ移したもの（' + moved.bodies.length + ' 個体、乱数だけ変えた 4 本ずつ、' + T + ' 秒）');
  show('段差', [1, 2, 3, 4].map(k => run(base, 0, 9000 + k))); show('なだらか', [1, 2, 3, 4].map(k => run(base, WIDTH, 9000 + k)));
}
if (coast.length) {
  const datas = coast.map(read);
  console.log('== 組 B：沿岸で進化した ' + coast.length + ' 世界（各 1 本、' + T + ' 秒）');
  show('段差', datas.map(d => run(d, 0, 0))); show('なだらか', datas.map(d => run(d, WIDTH, 0)));
}
