// Does laying matter spread? A competition in a saved evolved world: every body gets the same gland in its root part and the same neuron that drives it; in half of
// the bodies (drawn at random, by a draw of the tool's own) the neuron drives the gland (+1: they secrete), in the other half it holds it shut (-1: they do not).
// Both sides pay the same upkeep for tissue and wiring; only the matter differs: who pays for it, and who gains from it. The share of the secreting side is followed.
// Arm "secrete": the world has the rule (nest). Arm "marker": the same bodies and genes in a world without it, where the gene changes nothing: how far a share
// wanders by chance alone.
// Usage: node tools/alife2-nest-assay.js <seconds> <world.json.gz> run <k> secrete|marker
//        node tools/alife2-nest-assay.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), mean = L => L.reduce((a, b) => a + b, 0) / L.length, rg = (L, d) => (L.length ? mean(L).toFixed(d) + ' [' + Math.min(...L).toFixed(d) + '〜' + Math.max(...L).toFixed(d) + ']' : '—');
  for (const [arm, label] of [['secrete', '規則あり（片側だけが分泌する）'], ['marker', '規則なし（同じ遺伝子を持つだけ：対照）']]) { const R = rows.filter(r => r.arm === arm); if (!R.length) continue;
    console.log(label + ' ' + R.length + ' 本：分泌する側の割合 始まり ' + rg(R.map(r => r.share0), 3) + ' → 終わり ' + rg(R.map(r => r.shareEnd), 3) + ' ｜ 個体数（終わりの 500 秒の平均）' + rg(R.map(r => r.popTail), 0) + ' ｜ 溶存栄養 ' + rg(R.map(r => r.nutrient), 3) + ' ｜ 水の中の物質 ' + rg(R.map(r => r.matter), 1) + '（' + rg(R.map(r => r.cells), 0) + ' マス）｜ 分泌に使われた蓄え ' + rg(R.map(r => r.secreted), 1) + ' ｜ 物質の中で水に戻った粒 ' + rg(R.map(r => r.composted), 1) + ' ｜ どちらの遺伝子も失った個体 ' + rg(R.map(r => r.neither), 3));
    for (const r of R) console.log('  乱数 ' + r.k + '：150 秒ごとの割合 ' + r.series.map(x => x.toFixed(2)).join(' ') + ' ｜ 分泌する側のいる水の物質 ' + r.matHi.toFixed(2) + '、しない側 ' + r.matLo.toFixed(2)); }
  process.exit(0); }
const [secs, file, , k, arm] = process.argv.slice(2), T = Number(secs), G = A.genome;
const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))); w.rand = G.rng(7000 + Number(k)); if (!w.nerve2) throw new Error('the world needs several neurons per segment (nerve2)'); if (arm === 'secrete') w.enable({ nest: 1 });
const mark = G.rng(9100 + Number(k)), drive = g => { let s = 0; for (const p of g.parts) for (const q of p.nn || []) for (const e of q.out) if (e[0] === 'S') s += e[1]; return s; };
for (const o of w.bodies) { const p = o.g.parts[o.g.root], nn = p.nn ? p.nn.slice(0, G.NN_MAX - 1) : [], used = new Set(nn.map(q => q.id)); let id = 0; while (used.has(id)) id++; // (the same bodies are marked in both arms of one k)
  p.gland = 0.3; nn.push(Object.assign({ b: 1, k: 1, in: [['1', 1]], out: [['S', mark() < 0.5 ? 1 : -1]] }, w.wire || nn.some(q => q.id != null) ? { id } : {})); p.nn = nn; G.sanitize(o.g);
  o.nextCost = null; const root = o.b.segs[0]; w.form(o, o.cx, o.cy, Math.atan2(root.dy, root.dx)); }
const side = g => { const d = drive(g); return d > 0.05 ? 1 : d < -0.05 ? -1 : 0; }, share = () => { let hi = 0, lo = 0; for (const o of w.bodies) { const s = side(o.g); if (s > 0) hi++; else if (s < 0) lo++; } return hi + lo ? hi / (hi + lo) : 0; }, share0 = share(), series = [];
const nutMean = () => { let s = 0; for (let i = 0; i < w.nut.length; i++) s += w.nut[i]; return s / w.nut.length; }, tail = Math.min(500, T); let nSum = 0;
for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step(); if (i >= 30 * (T - tail)) nSum += w.bodies.length; if ((i + 1) % 4500 === 0) series.push(share()); }
const at = s => { const L = w.bodies.filter(o => side(o.g) === s); return w.mat && L.length ? L.reduce((a, o) => a + w.mat[w.cellAt(o.cx, o.cy)], 0) / L.length : 0; }, c = w.census();
console.log(JSON.stringify({ arm, k: Number(k), t: Math.round(w.t), share0, shareEnd: share(), series, popTail: nSum / (30 * tail), bodies: w.bodies.length, nutrient: nutMean(), matter: w.mat ? w.mat.reduce((a, b) => a + b, 0) : 0, cells: w.mat ? w.mat.reduce((a, b) => a + (b > 0.05 ? 1 : 0), 0) : 0, secreted: w.counts.secreted || 0, composted: w.counts.composted || 0, neither: w.bodies.length ? w.bodies.filter(o => side(o.g) === 0).length / w.bodies.length : 0, matHi: at(1), matLo: at(-1), gen: c.gen, broken: w.counts.broken || 0, unsound: c.unsound }));
