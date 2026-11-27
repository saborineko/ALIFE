// Does a sense pay where food wells up unevenly? A competition in a saved evolved world. Every body gets, on each of its parts that carry cilia, the same taste
// connection (the segment's signal falls as the water gets richer) and enough nerve tissue to carry it. In half of the bodies (drawn at random, by a draw of the tool's
// own) the signal drives the cilia: they swim harder in poor water and slow down in rich water. In the other half it drives nothing, and a neuron that is never active makes
// up the same wiring cost. So both sides pay the same and sense the same; only what the signal does differs.
// Arm "vents": the world has vents (dissolved food wells up in a few small places that move). Arm "plain": the same bodies and genes in the same world without vents.
// Usage: node tools/alife2-kinesis-assay.js <seconds> <world.json.gz> run <k> vents|plain
//        node tools/alife2-kinesis-assay.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), mean = L => L.reduce((a, b) => a + b, 0) / L.length, rg = (L, d) => (L.length ? mean(L).toFixed(d) + ' [' + Math.min(...L).toFixed(d) + '〜' + Math.max(...L).toFixed(d) + ']' : '—');
  for (const [arm, label] of [...new Set(rows.map(r => r.arm))].map(a => [a, a === 'vents' ? '湧き場あり' : a === 'plain' ? 'そのままの世界（同じ個体・同じ遺伝子）' : '設定 ' + a])) { const R = rows.filter(r => r.arm === arm); if (!R.length) continue;
    console.log(label + ' ' + R.length + ' 本：信号が繊毛を動かす側の割合 始まり ' + rg(R.map(r => r.share0), 3) + ' → 終わり ' + rg(R.map(r => r.shareEnd), 3) + ' ｜ 個体数（終わりの 500 秒の平均）' + rg(R.map(r => r.popTail), 0) + ' ｜ 溶存栄養 ' + rg(R.map(r => r.nutrient), 3) + ' ｜ どちらでもなくなった個体 ' + rg(R.map(r => r.neither), 3) + (arm.includes('vents') ? ' ｜ 湧き場の近くにいる割合：動かす側 ' + rg(R.map(r => r.nearHi), 3) + '、動かさない側 ' + rg(R.map(r => r.nearLo), 3) + '（そこは水の ' + rg(R.map(r => r.water), 3) + '）' : ''));
    for (const r of R) console.log('  乱数 ' + r.k + '：150 秒ごとの割合 ' + r.series.map(x => x.toFixed(2)).join(' ') + ' ｜ いた場所の水（1 秒ごとの平均）：動かす側 ' + r.richHi.toFixed(3) + '、動かさない側 ' + r.richLo.toFixed(3)); }
  process.exit(0); }
const [secs, file, , k, arm] = process.argv.slice(2), T = Number(secs), G = A.genome;
const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))); w.rand = G.rng(7000 + Number(k)); if (arm === 'vents') w.enable({ vents: 1 }); else if (arm.includes('=')) { const on = {}; for (const kv of arm.split(',')) { const [key, v] = kv.split('='); on[key] = Number(v); } w.enable(on); } // (or any settings: still=25 or still=25,vents=1)
const mark = G.rng(9100 + Number(k)); let given = 0;
for (const o of w.bodies) { const drive = mark() < 0.5; let any = false; // (the same bodies are marked in both arms of one k)
  for (const p of o.g.parts) { if (!((p.cilia || 0) > 0.05 && p.beat !== 0)) continue; any = true; p.nC = -3; p.mCil = drive ? 1 : 0; if (p.nerve < 0.3) p.nerve = 0.3;
    if (!drive) { const nn = p.nn ? p.nn.slice(0, G.NN_MAX - 1) : [], used = new Set(nn.map(q => q.id)); let id = 0; while (used.has(id)) id++; nn.push(Object.assign({ b: 0, k: 1, in: [['w', 0.5]], out: [] }, w.wire || nn.some(q => q.id != null) ? { id } : {})); p.nn = nn; } }
  if (!any) continue; given++; G.sanitize(o.g); o.nextCost = null; const root = o.b.segs[0]; w.form(o, o.cx, o.cy, Math.atan2(root.dy, root.dx)); }
// which side a genome is on now: among its parts that still carry the taste connection, the strongest drive of the cilia by the signal
const side = g => { let m = null; for (const p of g.parts) if (p.nC < -1 && (p.cilia || 0) > 0.05) m = m == null ? p.mCil : Math.max(m, p.mCil); return m == null ? 0 : m > 0.5 ? 1 : -1; };
const share = () => { let hi = 0, lo = 0; for (const o of w.bodies) { const s = side(o.g); if (s > 0) hi++; else if (s < 0) lo++; } return hi + lo ? hi / (hi + lo) : 0; }, share0 = share(), series = [];
const tail = Math.min(500, T), R2 = 2 * w.ventRadius, acc = { 1: [0, 0, 0], '-1': [0, 0, 0] }; let nSum = 0;
for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step(); if (i >= 30 * (T - tail)) nSum += w.bodies.length; if ((i + 1) % 4500 === 0) series.push(share());
  if (i % 30 === 29) for (const o of w.bodies) { const s = side(o.g); if (!s) continue; const a = acc[s]; a[0]++; a[1] += w.nutAt(o.cx, o.cy, w.nut); if (w.vents && w.ventDist(o.cx, o.cy) < R2) a[2]++; } }
const c = w.census(); let nm = 0; for (let i = 0; i < w.nut.length; i++) nm += w.nut[i];
console.log(JSON.stringify({ arm, k: Number(k), t: Math.round(w.t), given, share0, shareEnd: share(), series, popTail: nSum / (30 * tail), bodies: w.bodies.length, nutrient: nm / w.nut.length, neither: w.bodies.length ? w.bodies.filter(o => side(o.g) === 0).length / w.bodies.length : 0, richHi: acc[1][0] ? acc[1][1] / acc[1][0] : 0, richLo: acc[-1][0] ? acc[-1][1] / acc[-1][0] : 0, nearHi: acc[1][0] ? acc[1][2] / acc[1][0] : 0, nearLo: acc[-1][0] ? acc[-1][2] / acc[-1][0] : 0, water: c.ventWater || 0, speed: c.speed, gen: c.gen, broken: w.counts.broken || 0, unsound: c.unsound }));
