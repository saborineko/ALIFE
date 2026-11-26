// Continue one saved world several times as it is and several times with some settings changed (only the random numbers differ
// between runs of a kind), and compare what the two kinds become. The general form of the comparisons used for each new rule.
// Usage: node tools/alife2-branch.js <seconds> <world.json(.gz)> <key=value,key=value...> run <k> <0|1>   (one run: prints one JSON line)
//        node tools/alife2-branch.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const KEYS = [['n', '個体数', 0], ['birthRate', '1 個体あたりの出生/1000秒', 2], ['segs', '成体の体節数', 2], ['adultV', '成体の体積', 2], ['mouthShare', '口からの収入の割合', 3], ['speed', '自力移動の速さ', 3], ['nutrient', '溶存栄養（格子の平均）', 3], ['partsUsed', '身体に現れる部品の種類', 2], ['zoned', '軸に区分がある割合', 3], ['fleshShare', '口の収入のうち組織', 3], ['wired', '神経の配線を持つ割合', 2], ['lasting', '続いた新規性（この期間に現れた数）', 1], ['uneaten', '食べられずに消えた粒／流入', 3], ['gen', '平均世代', 0], ['cilia', '繊毛を持つ割合', 3], ['tasteWired', '味覚を配線した割合', 3], ['taxis', '餌の方向と進む向きの一致', 3], ['starvedShare', '期間中の死のうち餓死', 3], ['multi', '多体節の割合', 3], ['senseNeurons', '感覚を読んで動かす神経を持つ割合', 3], ['twoParents', '2 つの遺伝子から生まれた割合', 3], ['mutGene', '変異の強さ', 3]];
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), rg = (l, d) => l.length ? (l.reduce((a, b) => a + b, 0) / l.length).toFixed(d) + ' [' + Math.min(...l).toFixed(d) + '〜' + Math.max(...l).toFixed(d) + ']' : '-';
  const a = rows.filter(x => !x.on), b = rows.filter(x => x.on); console.log('そのまま ' + a.length + ' 本 / 設定を変えたもの ' + b.length + ' 本（' + (b[0] ? b[0].opts : '') + '）');
  for (const [k, name, d] of KEYS) { const va = a.map(x => x[k]).filter(Number.isFinite), vb = b.map(x => x[k]).filter(Number.isFinite); if (!va.length || !vb.length) continue; const apart = Math.max(...va) < Math.min(...vb) || Math.max(...vb) < Math.min(...va); console.log('  ' + name.padEnd(20, '　') + rg(va, d).padEnd(26) + ' → ' + rg(vb, d) + (apart ? '   ← 範囲が重ならない' : '')); }
  process.exit(0);
}
const [secs, file, optStr, , k, flag] = process.argv.slice(2), T = Number(secs), d = JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)); d.opt.audit = 1;
const w = A.engine.World.restore(d), on = {}; for (const s of optStr.split(',')) { const [key, v] = s.split('='); on[key] = Number.isNaN(Number(v)) ? v : Number(v); }
w.rand = A.genome.rng(7000 + Number(k)); if (Number(flag)) w.enable(on); for (const key in w.ledger) w.ledger[key] = 0;
const t0 = w.t, dead0 = { starved: w.counts.starved, aged: w.counts.aged, killed: w.counts.killed || 0 }; let bMid = 0, nSum = 0; const tail = Math.min(1000, T);
for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step(); if (i === 30 * (T - tail)) bMid = w.counts.births; if (i >= 30 * (T - tail)) nSum += w.bodies.length; }
const c = w.census(), L = w.ledger, lasting = [...w.clades.values()].filter(q => q.born >= t0 && q.members >= 20 && q.genMax - q.gen0 >= 5).length;
console.log(JSON.stringify({ on: Number(flag), k: Number(k), opts: optStr, n: c.n, gen: c.gen, birthRate: nSum ? (w.counts.births - bMid) / (nSum / 30 / tail) * 1000 / tail : 0, segs: c.segMean, adultV: c.adultV, mouthShare: c.mouthShare, speed: c.speed, nutrient: c.nutrient, partsUsed: c.partsUsed, zoned: c.zoned, fleshShare: c.fleshShare, wired: c.wired, cilia: c.cilia, tasteWired: c.tasteWired, taxis: c.taxis, multi: c.multi, senseNeurons: c.senseNeurons, twoParents: c.twoParents, mutGene: c.mutGene, starvedShare: (w.counts.starved - dead0.starved) / Math.max(1, w.counts.starved - dead0.starved + w.counts.aged - dead0.aged + (w.counts.killed || 0) - dead0.killed), lasting, uneaten: L.expire / Math.max(1e-9, L.rain + L.regrow) }));
