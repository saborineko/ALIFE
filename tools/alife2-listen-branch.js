// Is it hearing? Continue one saved world several times as it is and several times with every ear cut (only the random numbers differ between runs of a kind),
// and read from the record of sound what bodies did when a call began near them, less what they did just before: bodies without ears, bodies with working ears
// (in the runs left as they are) and bodies whose ears are cut (in the other runs). If the change seen in bodies with working ears comes from hearing, bodies of
// the same kinds with their ears cut must not show it.
// Usage: node tools/alife2-listen-branch.js <seconds> <world.json.gz> run <k> <0|1>     (one run: prints one JSON line; 1 = ears cut)
//        node tools/alife2-listen-branch.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), f = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  for (const [name, on, cell] of [['そのまま：働く耳を持つ個体', 0, 1], ['そのまま：耳の無い個体', 0, 0], ['耳を切る：切られた耳を持つ個体', 1, 2], ['耳を切る：耳の無い個体', 1, 0]]) {
    console.log(name); if (cell === 1 || cell === 2) for (const r of rows.filter(x => x.deaf === on).sort((a, b) => a.k - b.k)) console.log('   分岐 ' + r.k + '：鳴いている割合（鳴いたことのある個体の毎秒の記録）：この 1 秒に食べたとき ' + (r.tab.ate ? (r.tab.ate.whenYes * 100).toFixed(1) + '%、食べていないとき ' + (r.tab.ate.whenNo * 100).toFixed(1) + '%（' + Math.round(r.tab.ate.n) + ' 回の記録）' : '—') + '／状態との結びつき ' + r.signalBits.toFixed(3) + ' ビット（' + r.signalOf + '）'); for (const r of rows.filter(x => x.deaf === on).sort((a, b) => a.k - b.k)) { const c = r.cells[cell]; console.log('   分岐 ' + r.k + '：鳴き始め ' + r.onsets + ' 回・例数 ' + Math.round(c.n) + '・動く速さの変化 ' + f(c.m, 3) + '（ばらつき ' + f(c.msd, 3) + '、前 ' + f(c.pre, 3) + ' → 後 ' + f(c.post, 3) + '）・食べた割合の変化 ' + f(c.eat, 3) + '・声の方へ向きを変える ' + f(c.h, 2) + '（' + Math.round(c.hn) + ' 例）'); } }
  process.exit(0);
}
const [secs, file, , k, flag] = process.argv.slice(2), T = Number(secs), w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file))));
w.rand = A.genome.rng(7000 + Number(k)); if (Number(flag)) w.enable({ deaf: 1 });
const fresh = w.acoNew(); w.aco.lis = fresh.lis; w.aco.tab = {}; const on0 = w.aco.onsets; w.sndPend = []; // (only what happens from here on is read)
for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step(); if (i % 30 === 29) for (const c of w.aco.lis) for (const key in c) c[key] /= 0.998; } // (the notebook's fading undone: every case in this stretch counts the same)
const c = w.census(), cells = w.aco.lis.map(q => ({ n: q.n, m: q.n ? q.m / q.n : NaN, msd: q.n ? Math.sqrt(Math.max(0, q.m2 / q.n - (q.m / q.n) ** 2)) : NaN, eat: q.n ? q.eat / q.n : NaN, pre: q.n ? q.pre / q.n : NaN, post: q.n ? q.post / q.n : NaN, h: q.hn ? q.h / q.hn : NaN, hn: q.hn }));
const tab = {}; for (const key in w.aco.tab) { const t = w.aco.tab[key]; tab[key] = { whenYes: t[3] / Math.max(1e-9, t[1] + t[3]), whenNo: t[2] / Math.max(1e-9, t[0] + t[2]), n: t[0] + t[1] + t[2] + t[3] }; }
console.log(JSON.stringify({ deaf: Number(flag), k: Number(k), t: Math.round(w.t), n: c.n, eared: c.eared, voiced: c.voiced, onsets: w.aco.onsets - on0, callTime: c.callTime, signalBits: c.signalBits, signalOf: c.signalOf, lisEffect: c.lisEffect, lisOf: c.lisOf, tab, cells }));
