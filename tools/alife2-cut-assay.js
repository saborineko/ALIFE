// A sense is cut in a random half of the bodies of a saved world and in all their descendants, and the two halves live on in the same water.
// The cut is not a gene: it follows the mother (a child of a cut mother is cut), so it cannot be lost by mutation or by mixing, and the genes
// of the two halves keep mixing. What is measured is what the sense itself is worth to those that have it, in that world, now.
// The control marks the same half and cuts nothing: its spread is what chance alone does to a mark.
// With a sense named at the end, only the bodies that have that sense wired (a connection from it on a part that is in the body, or a neuron
// that reads it) take part: half of them are cut, the other half are the reference, and everyone else is left out of the count. Without it a
// cut is diluted by all the bodies that never had the sense.
// Which bodies fall in which half decides a great deal by itself where lineages differ (in one evolved world the marked half of a mark-only
// run went from 0.50 to 0.57〜0.79 in 600 s, and the same halves went the same way whatever was cut). So a cut is read against the same
// split, not against 0.50: `other` at the end cuts the other half of the same split (same <k>), and the report gives, split by split, the
// share of the marked half when the other half is cut minus its share when it is cut itself (twice the worth of the sense, the split cancels).
// Usage: node tools/alife2-cut-assay.js <seconds> <world.json(.gz)> <numb|anosmic|numbSkin|sightless|deaf|none> run <k> [<sense>|all] [other]   (one run: one JSON line)
//        node tools/alife2-cut-assay.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const NAMES = { numb: '味覚', anosmic: '匂い', numbSkin: '触覚と傷の感覚', sightless: '眼', deaf: '耳' };
// a sense is wired where a part's single signal has a connection from it, or a neuron of the part reads it
const SENSE = { numb: [['nC'], 'c'], anosmic: [['sA', 'sB'], 'AB'], numbSkin: [['sT', 'sW'], 'tw'], sightless: [['vE'], 'v'], deaf: [['hE'], 'e'] };
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), rg = (l, d) => (l.reduce((a, b) => a + b, 0) / l.length).toFixed(d) + ' [' + Math.min(...l).toFixed(d) + '〜' + Math.max(...l).toFixed(d) + ']';
  const sd = r => r.side || 1, kd = r => r.cut + '|' + (r.sense || '') + '|' + sd(r);
  for (const key of [...new Set(rows.map(kd))]) {
    const l = rows.filter(r => kd(r) === key).sort((a, b) => a.k - b.k), [cut, sense, side] = key.split('|');
    console.log((sense ? NAMES[sense] + 'を配線した個体だけ（始まりに ' + rg(l.map(r => r.marked), 0) + ' 匹）：' : '全個体：') + (cut === 'none' ? '印だけ（何も切らない：対照）' : NAMES[cut] + (side === '2' ? 'を、比べる側で切った（印のある側は切らない）' : 'を切った系統')) + ' ' + l.length + ' 本：印のある側の割合 始まり ' + rg(l.map(r => r.share0), 3) + ' → 終わり ' + rg(l.map(r => r.shareEnd), 3) +
      ' ｜ 個体数（終わり）' + rg(l.map(r => r.bodies), 0) + (sense ? '、うち数えた系統 ' + rg(l.map(r => r.counted), 0) : '') + ' ｜ いた場所の水（印のある側／比べる側）' + rg(l.map(r => r.waterTag), 3) + '／' + rg(l.map(r => r.waterRest), 3) + ' ｜ 速さ ' + rg(l.map(r => r.speedTag), 3) + '／' + rg(l.map(r => r.speedRest), 3) +
      ' ｜ 1 個体・1000 秒あたりの出生 ' + rg(l.map(r => r.birthTag), 2) + '／' + rg(l.map(r => r.birthRest), 2) + '、死 ' + rg(l.map(r => r.deathTag), 2) + '／' + rg(l.map(r => r.deathRest), 2));
    for (const r of l) console.log('  乱数 ' + r.k + '：150 秒ごとの割合 ' + r.series.map(x => x.toFixed(2)).join(' '));
  }
  // the same split read three ways: cut on the marked half, nothing cut, cut on the other half (a sense that is worth something gives low < middle < high)
  const f = x => x == null ? '  —  ' : x.toFixed(3), sg = x => x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(3);
  for (const key of [...new Set(rows.filter(r => r.cut !== 'none').map(r => r.cut + '|' + (r.sense || '')))]) {
    const [cut, sense] = key.split('|'), at = (c, side, k) => { const r = rows.find(r => r.cut === c && (r.sense || '') === sense && sd(r) === side && r.k === k); return r ? r.shareEnd : null; };
    const ks = [...new Set(rows.filter(r => r.cut === cut && (r.sense || '') === sense).map(r => r.k))].sort((a, b) => a - b), ds = [];
    console.log('同じ分け方どうし：' + (sense ? NAMES[sense] + 'を配線した個体だけ、' : '全個体、') + NAMES[cut] + 'を切る ｜ 印のある側の終わりの割合（印のある側を切る／何も切らない／比べる側を切る）、差（比べる側を切る − 印のある側を切る）');
    for (const k of ks) { const a = at(cut, 1, k), n = at('none', 1, k), b = at(cut, 2, k), d = a != null && b != null ? b - a : null; if (d != null) ds.push(d); console.log('  乱数 ' + k + '：' + f(a) + ' ／ ' + f(n) + ' ／ ' + f(b) + ' ｜ 差 ' + sg(d)); }
    if (ds.length) console.log('  差の平均 ' + sg(ds.reduce((x, y) => x + y, 0) / ds.length) + '（' + ds.length + ' 組、正が ' + ds.filter(d => d > 0).length + ' 組。感覚に値打ちが無ければ 0 のまわり）');
  }
  process.exit(0);
}
const [secs, file, cut, , kArg, senseArg, sideArg] = process.argv.slice(2), T = Number(secs), k = Number(kArg), sense = senseArg && senseArg !== 'all' ? senseArg : '', cutTag = sideArg === 'other' ? 2 : 1;
if (cut !== 'none' && !(cut in SENSE)) { console.error('unknown cut: ' + cut); process.exit(1); }
if (sense && !(sense in SENSE)) { console.error('unknown sense: ' + sense); process.exit(1); }
const w = A.engine.World.restore(JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)));
w.rand = A.genome.rng(7000 + k); const mr = A.genome.rng(9100 + k);
const wired = o => { const [genes, letters] = SENSE[sense]; return o.b.segs.some(q => q.p && (genes.some(g => Math.abs(q.p[g] || 0) > 0.2) || (q.p.nn && q.p.nn.some(n => n.in.some(e => letters.includes(e[0])))))); };
// tag 1: the marked side. tag 2: the side it is compared with. No tag: left out (only when a sense is named). The cut falls on tag 1, or on tag 2 with `other`.
const mark = (o, tag) => { o.tag = tag; if (tag === cutTag && cut !== 'none') o[cut] = 1; };
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
console.log(JSON.stringify({ cut, sense: sense || '', side: cutTag, k, t: Math.round(w.t), marked: was[1] + was[2], share0, shareEnd: share(), series, bodies: w.bodies.length, counted: now[1] + now[2], waterTag: water[1] / Math.max(1, life[1]), waterRest: water[2] / Math.max(1, life[2]),
  speedTag: sp(1), speedRest: sp(2), birthTag: rate(births[1], 1), birthRest: rate(births[2], 2), deathTag: rate(was[1] + births[1] - now[1], 1), deathRest: rate(was[2] + births[2] - now[2], 2) }));
