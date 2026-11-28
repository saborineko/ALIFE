// A sense is cut in a random half of the bodies of a saved world and in all their descendants, and the two halves live on in the same water.
// The cut is not a gene: it follows the mother (a child of a cut mother is cut), so it cannot be lost by mutation or by mixing, and the genes
// of the two halves keep mixing. What is measured is what the sense itself is worth to those that have it, in that world, now.
// The control marks the same half and cuts nothing: its spread is what chance alone does to a mark.
// Usage: node tools/alife2-cut-assay.js <seconds> <world.json(.gz)> <numb|anosmic|numbSkin|none> run <k>   (one run: prints one JSON line)
//        node tools/alife2-cut-assay.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const NAMES = { numb: '味覚を切った系統', anosmic: '匂いを切った系統', numbSkin: '触覚を切った系統', none: '印だけ（何も切らない：対照）' };
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), rg = (l, d) => (l.reduce((a, b) => a + b, 0) / l.length).toFixed(d) + ' [' + Math.min(...l).toFixed(d) + '〜' + Math.max(...l).toFixed(d) + ']';
  for (const cut of [...new Set(rows.map(r => r.cut))]) {
    const l = rows.filter(r => r.cut === cut).sort((a, b) => a.k - b.k);
    console.log(NAMES[cut] + ' ' + l.length + ' 本：印のある側の割合 始まり ' + rg(l.map(r => r.share0), 3) + ' → 終わり ' + rg(l.map(r => r.shareEnd), 3) + ' ｜ 個体数（終わり）' + rg(l.map(r => r.bodies), 0) +
      ' ｜ いた場所の水（印のある側／ない側）' + rg(l.map(r => r.waterTag), 3) + '／' + rg(l.map(r => r.waterRest), 3) + ' ｜ 速さ ' + rg(l.map(r => r.speedTag), 3) + '／' + rg(l.map(r => r.speedRest), 3) +
      ' ｜ 1 個体・1000 秒あたりの出生 ' + rg(l.map(r => r.birthTag), 2) + '／' + rg(l.map(r => r.birthRest), 2) + '、死 ' + rg(l.map(r => r.deathTag), 2) + '／' + rg(l.map(r => r.deathRest), 2));
    for (const r of l) console.log('  乱数 ' + r.k + '：150 秒ごとの割合 ' + r.series.map(x => x.toFixed(2)).join(' '));
  }
  process.exit(0);
}
const [secs, file, cut, , kArg] = process.argv.slice(2), T = Number(secs), k = Number(kArg);
if (!(cut in NAMES)) { console.error('unknown cut: ' + cut); process.exit(1); }
const w = A.engine.World.restore(JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)));
w.rand = A.genome.rng(7000 + k); const mr = A.genome.rng(9100 + k);
const mark = o => { o.tag = 1; if (cut !== 'none') o[cut] = 1; };
for (const o of w.bodies) if (mr() < 0.5) mark(o);
const births = [0, 0]; { const spawn0 = w.spawn.bind(w); w.spawn = function (g, x, y, stage, parent) { const o = spawn0(g, x, y, stage, parent); if (parent) { if (parent.tag) mark(o); births[o.tag ? 1 : 0]++; } return o; }; }
const share = () => w.bodies.filter(o => o.tag).length / Math.max(1, w.bodies.length), share0 = share(), series = [];
const water = [0, 0], seen = [0, 0], life = [0, 0]; // (life: body-seconds lived by each side, for the rates)
for (let i = 0; i < 30 * T && w.bodies.length; i++) {
  w.step();
  if (i % 30 === 29) for (const o of w.bodies) { const j = o.tag ? 1 : 0; water[j] += w.nutAt(o.cx, o.cy, w.nut); seen[j]++; life[j]++; }
  if (i % 4500 === 4499) series.push(share());
}
const sp = j => { const l = w.bodies.filter(o => (o.tag ? 1 : 0) === j && o.age > 5); return l.length ? l.reduce((a, o) => a + o.path / o.age, 0) / l.length : 0; };
// deaths follow from what each side started with, what was born into it and what is left
const start = (() => { const d = JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)); return d.bodies ? d.bodies.length : 0; })();
const now = [w.bodies.filter(o => !o.tag).length, w.bodies.filter(o => o.tag).length], was = [Math.round(start * (1 - share0)), Math.round(start * share0)];
const rate = (n, j) => n / Math.max(1, life[j]) * 1000;
console.log(JSON.stringify({ cut, k, t: Math.round(w.t), share0, shareEnd: share(), series, bodies: w.bodies.length, waterTag: water[1] / Math.max(1, seen[1]), waterRest: water[0] / Math.max(1, seen[0]),
  speedTag: sp(1), speedRest: sp(0), birthTag: rate(births[1], 1), birthRest: rate(births[0], 0), deathTag: rate(was[1] + births[1] - now[1], 1), deathRest: rate(was[0] + births[0] - now[0], 0) }));
