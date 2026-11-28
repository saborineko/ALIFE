// A sense is cut in a random half of the bodies of a saved world and in all their descendants, and the two halves live on in the same water.
// The cut is not a gene: it follows the mother (a child of a cut mother is cut), so it cannot be lost by mutation or by mixing, and the genes
// of the two halves keep mixing. What is measured is what the sense itself is worth to those that have it, in that world, now.
// The control marks the same half and cuts nothing: its spread is what chance alone does to a mark.
// With a sense named at the end, only the bodies that have that sense wired (a connection from it on a part that is in the body, or a neuron
// that reads it) take part: half of them are cut, the other half are the reference, and everyone else is left out of the count. Without it a
// cut is diluted by all the bodies that never had the sense.
// Usage: node tools/alife2-cut-assay.js <seconds> <world.json(.gz)> <numb|anosmic|numbSkin|sightless|deaf|none> run <k> [<sense>]   (one run: one JSON line)
//        node tools/alife2-cut-assay.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const NAMES = { numb: '味覚', anosmic: '匂い', numbSkin: '触覚と傷の感覚', sightless: '眼', deaf: '耳' };
// a sense is wired where a part's single signal has a connection from it, or a neuron of the part reads it
const SENSE = { numb: [['nC'], 'c'], anosmic: [['sA', 'sB'], 'AB'], numbSkin: [['sT', 'sW'], 'tw'], sightless: [['vE'], 'v'], deaf: [['hE'], 'e'] };
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), rg = (l, d) => (l.reduce((a, b) => a + b, 0) / l.length).toFixed(d) + ' [' + Math.min(...l).toFixed(d) + '〜' + Math.max(...l).toFixed(d) + ']';
  for (const key of [...new Set(rows.map(r => r.cut + '|' + (r.sense || '')))]) {
    const l = rows.filter(r => r.cut + '|' + (r.sense || '') === key).sort((a, b) => a.k - b.k), [cut, sense] = key.split('|');
    console.log((sense ? NAMES[sense] + 'を配線した個体だけ（始まりに ' + rg(l.map(r => r.marked), 0) + ' 匹）：' : '全個体：') + (cut === 'none' ? '印だけ（何も切らない：対照）' : NAMES[cut] + 'を切った系統') + ' ' + l.length + ' 本：印のある側の割合 始まり ' + rg(l.map(r => r.share0), 3) + ' → 終わり ' + rg(l.map(r => r.shareEnd), 3) +
      ' ｜ 個体数（終わり）' + rg(l.map(r => r.bodies), 0) + (sense ? '、うち数えた系統 ' + rg(l.map(r => r.counted), 0) : '') + ' ｜ いた場所の水（印のある側／比べる側）' + rg(l.map(r => r.waterTag), 3) + '／' + rg(l.map(r => r.waterRest), 3) + ' ｜ 速さ ' + rg(l.map(r => r.speedTag), 3) + '／' + rg(l.map(r => r.speedRest), 3) +
      ' ｜ 1 個体・1000 秒あたりの出生 ' + rg(l.map(r => r.birthTag), 2) + '／' + rg(l.map(r => r.birthRest), 2) + '、死 ' + rg(l.map(r => r.deathTag), 2) + '／' + rg(l.map(r => r.deathRest), 2));
    for (const r of l) console.log('  乱数 ' + r.k + '：150 秒ごとの割合 ' + r.series.map(x => x.toFixed(2)).join(' '));
  }
  process.exit(0);
}
const [secs, file, cut, , kArg, sense] = process.argv.slice(2), T = Number(secs), k = Number(kArg);
if (cut !== 'none' && !(cut in SENSE)) { console.error('unknown cut: ' + cut); process.exit(1); }
if (sense && !(sense in SENSE)) { console.error('unknown sense: ' + sense); process.exit(1); }
const w = A.engine.World.restore(JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)));
w.rand = A.genome.rng(7000 + k); const mr = A.genome.rng(9100 + k);
const wired = o => { const [genes, letters] = SENSE[sense]; return o.b.segs.some(q => q.p && (genes.some(g => Math.abs(q.p[g] || 0) > 0.2) || (q.p.nn && q.p.nn.some(n => n.in.some(e => letters.includes(e[0])))))); };
// tag 1: the marked side (cut, unless the cut is `none`). tag 2: the side it is compared with. No tag: left out (only when a sense is named).
const mark = (o, tag) => { o.tag = tag; if (tag === 1 && cut !== 'none') o[cut] = 1; };
for (const o of w.bodies) { const pick = mr() < 0.5; if (!sense || wired(o)) mark(o, pick ? 1 : 2); }
const births = [0, 0, 0]; { const spawn0 = w.spawn.bind(w); w.spawn = function (g, x, y, stage, parent) { const o = spawn0(g, x, y, stage, parent); if (parent && parent.tag) { mark(o, parent.tag); births[o.tag]++; } return o; }; }
const count = tag => { let n = 0; for (const o of w.bodies) if (o.tag === tag) n++; return n; }, share = () => { const a = count(1), b = count(2); return a + b ? a / (a + b) : 0; };
const was = [0, count(1), count(2)], share0 = share(), series = [], water = [0, 0, 0], life = [0, 0, 0]; // (life: body-seconds lived by each side, for the rates)
for (let i = 0; i < 30 * T && w.bodies.length; i++) {
  w.step();
  if (i % 30 === 29) for (const o of w.bodies) if (o.tag) { water[o.tag] += w.nutAt(o.cx, o.cy, w.nut); life[o.tag]++; }
  if (i % 4500 === 4499) series.push(share());
}
const sp = tag => { const l = w.bodies.filter(o => o.tag === tag && o.age > 5); return l.length ? l.reduce((a, o) => a + o.path / o.age, 0) / l.length : 0; };
// deaths follow from what each side started with, what was born into it and what is left
const now = [0, count(1), count(2)], rate = (n, j) => n / Math.max(1, life[j]) * 1000;
console.log(JSON.stringify({ cut, sense: sense || '', k, t: Math.round(w.t), marked: was[1] + was[2], share0, shareEnd: share(), series, bodies: w.bodies.length, counted: now[1] + now[2], waterTag: water[1] / Math.max(1, life[1]), waterRest: water[2] / Math.max(1, life[2]),
  speedTag: sp(1), speedRest: sp(2), birthTag: rate(births[1], 1), birthRest: rate(births[2], 2), deathTag: rate(was[1] + births[1] - now[1], 1), deathRest: rate(was[2] + births[2] - now[2], 2) }));
