// The rule "a connection is made only where both of its ends are" (wireEnds), checked on evolved bodies of saved worlds. It reads; nothing is saved.
//   1. what the rule removes from each body = what the sorting tool (tools/alife2-wiring-use.js, written apart from the rule) calls "no partner", body by body
//      (bodies with wounds are left out: the rule is applied when a body is built, not when it is hurt), and under the rule the tool finds none left
//   2. how much of the wiring that is, and how far the upkeep falls
//   3. every adult, alone in an empty world of the same kind, with and without the rule: where every part of it is, how it moves, what it takes in and what it
//      holds, number for number (the upkeep is held equal: a body that pays less keeps more reserve, and hunger is one of the things a circuit reads)
// Usage: node tools/alife2-wire-ends-check.js <world.json.gz> [...]
const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
const { sort } = require('./alife2-wiring-use.js'), zlib = require('zlib'), fs = require('fs');
for (const file of process.argv.slice(2)) { const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(file))), name = file.split('/').pop().replace('-t3000.json.gz', '');
  const w0 = A.engine.World.restore(d), w1 = A.engine.World.restore(d), before = new Map(w0.bodies.map(o => [o.id, { r: sort(w0, o), wiring: o.prof.wiring, basal: o.prof.basal }]));
  w1.enable({ wireEnds: 1 }); let bad = 0, hurt = 0, left = 0, n = 0, saved = 0, tot = 0; const drop = [];
  for (const o of w1.bodies) { const b = before.get(o.id), part = b.r.T.partner || 0; n++; tot += b.wiring; saved += b.wiring - o.prof.wiring; drop.push(1 - o.prof.basal / b.basal);
    if (o.b.segs.some(q => q.gone) || (o.hp && o.hp.some(h => h < 1))) { hurt++; continue; } left += sort(w1, o).T.partner || 0; if (Math.abs((b.wiring - o.prof.wiring) - part) > 1e-9) bad++; }
  drop.sort((a, b) => a - b);
  console.log('== ' + name + '：身体 ' + n + ' 匹（傷のある ' + hurt + ' 匹は 1 の比較から除く）｜ 1. 規則が消す結合 ＝ 道具の「相手が無い」：合わない身体 ' + bad + ' 匹・規則のもとで道具が見つける「相手が無い」結合 ' + left.toFixed(6) + ' ｜ 2. 消える配線 ' + (saved / tot * 100).toFixed(1) + '%・維持費の低下（中央値）' + (drop[Math.floor(n / 2)] * 100).toFixed(2) + '%');
  const adults = w0.bodies.filter(o => o.stage >= 1); let same = 0, diff = 0, changed = 0, ticks = 0;
  for (const o of adults) { const mk = on => { const w = new A.engine.World(Object.assign({}, d.opt, { n: 0, seed: 77, wireEnds: on })), q = w.spawn(JSON.parse(JSON.stringify(o.g)), o.cx, o.cy, 1); q.E = 0.6 * q.prof.Emax; return [w, q]; }, [wa, a] = mk(0), [wb, b] = mk(1);
    if (a.prof.wiring !== b.prof.wiring) changed++; let ok = true, t = 0;
    for (; t < 150 && ok; t++) { b.prof.basal = a.prof.basal; wa.step(); wb.step(); if (wa.bodies.length !== 1 || wb.bodies.length !== 1 || a.dead || b.dead) break; if (JSON.stringify([Array.from(a.b.x), Array.from(a.b.vx), a.absorbed, a.eaten, a.E]) !== JSON.stringify([Array.from(b.b.x), Array.from(b.b.vx), b.absorbed, b.eaten, b.E])) ok = false; }
    ticks += t; if (ok) same++; else diff++; }
  console.log('   3. 成体 ' + adults.length + ' 匹（規則が配線を変えるのは ' + changed + ' 匹）を 1 匹ずつ空の世界で最大 5 秒、規則なし対あり（維持費は揃える）：すべての数字が一致 ' + same + ' 匹・違う ' + diff + ' 匹（比べた刻み ' + ticks + '）'); }
