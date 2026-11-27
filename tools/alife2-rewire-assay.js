// Does letting unused connections wither spread? A competition in a saved evolved world: in half of its bodies (drawn at random, by a draw of the tool's own) every part
// gets the gene that lets the segment's own input connections wither while unused (nLife), and every connection of every neuron the same; the other half is left as it is.
// Arm "rewire": the world has the rule. Arm "plain": the same bodies and genes in the same world without it, where the gene does nothing and costs its fifth:
// how far a share wanders by chance alone, with the cost of carrying the ability.
// Usage: node tools/alife2-rewire-assay.js <seconds> <world.json.gz> <gene, e.g. 0.3> run <k> rewire|plain
//        node tools/alife2-rewire-assay.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), mean = L => L.reduce((a, b) => a + b, 0) / L.length, rg = (L, d) => (L.length ? mean(L).toFixed(d) + ' [' + Math.min(...L).toFixed(d) + '〜' + Math.max(...L).toFixed(d) + ']' : '—');
  for (const [arm, label] of [['rewire', '規則あり（遺伝子を持つ側は、使われない結合が細る）'], ['plain', '規則なし（同じ遺伝子を持つだけ：対照）']]) { const R = rows.filter(r => r.arm === arm); if (!R.length) continue;
    console.log(label + ' ' + R.length + ' 本：遺伝子を持つ側の割合 始まり ' + rg(R.map(r => r.share0), 3) + ' → 終わり ' + rg(R.map(r => r.shareEnd), 3) + ' ｜ 個体数（終わりの 500 秒の平均）' + rg(R.map(r => r.popTail), 0) + (arm === 'rewire' ? ' ｜ 遺伝子を持つ結合のうち在る分 ' + rg(R.map(r => r.presence), 3) + ' ｜ 配線の費用（生まれつきに対して）' + rg(R.map(r => r.wiringNow), 3) : '') + ' ｜ 配線の強さ：持つ側 ' + rg(R.map(r => r.wiringHi), 2) + '、持たない側 ' + rg(R.map(r => r.wiringLo), 2));
    for (const r of R) console.log('  乱数 ' + r.k + '：150 秒ごとの割合 ' + r.series.map(x => x.toFixed(2)).join(' ')); }
  process.exit(0); }
const [secs, file, geneS, , k, arm] = process.argv.slice(2), T = Number(secs), X = Number(geneS), G = A.genome;
const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))); w.rand = G.rng(7000 + Number(k)); if (arm === 'rewire') w.enable({ rewire: 1 });
const mark = G.rng(9100 + Number(k));
for (const o of w.bodies) { if (!(mark() < 0.5)) continue; for (const p of o.g.parts) { p.nLife = X; for (const q of p.nn || []) for (const e of q.in) { if (e[2] == null) e[2] = 0; e[3] = X; } } G.sanitize(o.g); o.nextCost = null; const root = o.b.segs[0]; w.form(o, o.cx, o.cy, Math.atan2(root.dy, root.dx)); } // (the same bodies are marked in both arms of one k)
const hi = g => { let s = 0; for (const p of g.parts) s += p.nLife || 0; return s / g.parts.length > X / 2; }, share = () => (w.bodies.length ? w.bodies.filter(o => hi(o.g)).length / w.bodies.length : 0), share0 = share(), series = [];
const tail = Math.min(500, T); let nSum = 0; for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step(); if (i >= 30 * (T - tail)) nSum += w.bodies.length; if ((i + 1) % 4500 === 0) series.push(share()); }
const c = w.census(), wm = f => { const L = w.bodies.filter(o => hi(o.g) === f); return L.length ? L.reduce((a, o) => a + o.prof.wiring, 0) / L.length : 0; };
console.log(JSON.stringify({ arm, k: Number(k), gene: X, t: Math.round(w.t), share0, shareEnd: share(), series, popTail: nSum / (30 * tail), bodies: w.bodies.length, presence: c.presence == null ? null : c.presence, wiringNow: c.wiringNow == null ? null : c.wiringNow, wiringHi: wm(true), wiringLo: wm(false), gen: c.gen, broken: w.counts.broken || 0, unsound: c.unsound }));
