// Does a gene for laying eggs farther away spread? A competition in a saved evolved world: half of its bodies (drawn at random, by a draw of the tool's
// own) are given the gene "lay this much farther away", the rest are given 0, and the share of the far-laying side is followed.
// With the rule (flag 1) the gene sets where eggs are laid. Without it (flag 0) the same bodies carry the same mark, it is inherited, and it changes
// nothing: that is the control for how far a share wanders by chance alone.
// Usage: node tools/alife2-cast-assay.js <seconds> <world.json.gz> <extra distance> run <k> <flag>
//        node tools/alife2-cast-assay.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), mean = L => L.reduce((a, b) => a + b, 0) / L.length, rg = (L, d) => (L.length ? mean(L).toFixed(d) + ' [' + Math.min(...L).toFixed(d) + '〜' + Math.max(...L).toFixed(d) + ']' : '—');
  for (const [flag, label] of [[1, '規則あり（遺伝子が産む距離を決める）'], [0, '規則なし（同じ印を持つだけ：対照）']]) { const R = rows.filter(r => r.on === flag); if (!R.length) continue;
    console.log(label + ' ' + R.length + ' 本：「遠くへ産む」側の割合 始まり ' + rg(R.map(r => r.share0), 3) + ' → 終わり ' + rg(R.map(r => r.shareEnd), 3) + ' ｜ 個体数（終わりの 1000 秒の平均）' + rg(R.map(r => r.popTail), 0) + ' ｜ 溶存栄養 ' + rg(R.map(r => r.nutrient), 3) + ' ｜ 身体のいる場所の水 ÷ 世界の平均 ' + rg(R.map(r => r.atBodies), 3));
    const bh = R.reduce((a, r) => a + r.bornHi, 0), bl = R.reduce((a, r) => a + r.bornLo, 0), uh = R.reduce((a, r) => a + r.upHi, 0), ul = R.reduce((a, r) => a + r.upLo, 0);
    console.log('  生まれた子が育ち切った割合（3 本を合わせて。運命が決まった子だけ）：遠くへ産む側 ' + (uh / bh * 100).toFixed(1) + '%（' + bh + ' 匹）・反対側 ' + (ul / bl * 100).toFixed(1) + '%（' + bl + ' 匹） → ' + (uh / bh / (ul / bl)).toFixed(2) + ' 倍 ｜ 生まれた場所の水 ÷ 世界の平均（中央値）：遠くへ産む側 ' + rg(R.map(r => r.relHi), 2) + '・反対側 ' + rg(R.map(r => r.relLo), 2));
    for (const r of R) console.log('  乱数 ' + r.k + '：150 秒ごとの割合 ' + r.series.map(x => x.toFixed(2)).join(' ')); }
  process.exit(0); }
const [secs, file, extra, , k, flag] = process.argv.slice(2), T = Number(secs), X = Number(extra);
const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))); w.rand = A.genome.rng(7000 + Number(k)); if (Number(flag)) w.enable({ cast: 1 });
const mark = A.genome.rng(9100 + Number(k)); for (const o of w.bodies) o.g.cast = mark() < 0.5 ? X : 0; // (the same bodies are marked in both arms of one k)
const hi = g => (g.cast || 0) > X / 2, share = () => (w.bodies.length ? w.bodies.filter(o => hi(o.g)).length / w.bodies.length : 0), share0 = share(), series = [], open = [], cnt = { bornHi: 0, bornLo: 0, upHi: 0, upLo: 0 }, rel = { hi: [], lo: [] };
const nutMean = () => { let s = 0; for (let i = 0; i < w.nut.length; i++) s += w.nut[i]; return s / w.nut.length; }; let nm = nutMean();
const spawn0 = w.spawn.bind(w); w.spawn = function (g, x, y, stage, parent) { const o = spawn0(g, x, y, stage, parent); if (parent) { const h = hi(o.g); open.push({ o, h }); (h ? rel.hi : rel.lo).push(w.nutAt(o.cx, o.cy, w.nut) / nm); } return o; };
const tail = Math.min(1000, T); let nSum = 0;
for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step(); if (i >= 30 * (T - tail)) nSum += w.bodies.length;
  if (i % 30 === 0) { for (let j = open.length - 1; j >= 0; j--) { const r = open[j], o = r.o; if (o.dead || o.stage >= 1) { cnt[r.h ? 'bornHi' : 'bornLo']++; if (o.stage >= 1) cnt[r.h ? 'upHi' : 'upLo']++; open[j] = open[open.length - 1]; open.pop(); } } }
  if (i % 300 === 0) nm = nutMean(); if ((i + 1) % 4500 === 0) series.push(share()); }
const c = w.census(), med = L => { const s = L.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(0.5 * (s.length - 1))] : 0; }, atBodies = (() => { let s = 0; for (const o of w.bodies) s += w.nutAt(o.cx, o.cy, w.nut); return w.bodies.length && c.nutrient > 0 ? s / w.bodies.length / c.nutrient : 0; })();
console.log(JSON.stringify({ on: Number(flag), k: Number(k), X, share0, shareEnd: share(), series, n: c.n, popTail: nSum / (30 * tail), nutrient: c.nutrient, atBodies, ...cnt, relHi: med(rel.hi), relLo: med(rel.lo), castGene: c.castGene, gen: c.gen }));
