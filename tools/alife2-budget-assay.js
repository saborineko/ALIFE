// Does it change what evolves, that the young must be built from what its egg holds? One saved world is continued several times with
// the earlier rule and with the budget rule (only the random numbers differ between runs of a kind), and the two kinds are compared.
// Usage: node tools/alife2-budget-assay.js <seconds> <world.json(.gz)> run <k> <0|1>     (one run, prints one line of JSON)
//        node tools/alife2-budget-assay.js report <lines.txt>                          (compare the runs)
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), rg = (l, d) => l.length ? (l.reduce((a, b) => a + b, 0) / l.length).toFixed(d) + ' [' + Math.min(...l).toFixed(d) + '〜' + Math.max(...l).toFixed(d) + ']' : '-';
  const KEYS = [['n', '個体数', 0], ['birthsPerCap', '1 個体あたりの出生/1000秒', 2], ['birthV', '出生時の体積', 3], ['birthStage', '出生時の発生段階', 3], ['birthGene', '出生段階の遺伝子', 3], ['eggCost', '卵 1 個の費用', 2], ['adultV', '成体の体積', 2], ['segs', '成体の体節数', 2], ['stillShare', '死産の割合', 4], ['createdPerBirth', '出生 1 回で生じたエネルギー', 3], ['gen', '平均世代', 0]];
  for (const b of [0, 1]) { const r = rows.filter(x => x.budget === b); console.log(b ? '== 出生の収支を合わせる（' + r.length + ' 本）' : '== これまでの規則（' + r.length + ' 本）'); for (const [k, name, d] of KEYS) console.log('  ' + name.padEnd(16, '　') + rg(r.map(x => x[k]), d)); }
  process.exit(0);
}
const [secs, file, , k, flag] = process.argv.slice(2), T = Number(secs), d = JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)); d.opt.audit = 1;
const w = A.engine.World.restore(d); w.rand = A.genome.rng(7000 + Number(k)); w.enable({ budget: Number(flag) }); for (const key in w.ledger) w.ledger[key] = 0;
const b0 = w.counts.births, s0 = w.counts.stillborn || 0; let bMid = 0, nSum = 0;
for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step(); if (i === 30 * (T - 1000)) bMid = w.counts.births; if (i >= 30 * (T - 1000)) nSum += w.bodies.length; }
const c = w.census(), births = w.counts.births - b0, still = (w.counts.stillborn || 0) - s0;
console.log(JSON.stringify({ budget: Number(flag), k: Number(k), n: c.n, gen: c.gen, birthsPerCap: nSum ? (w.counts.births - bMid) / (nSum / 30000) : 0, birthV: c.birthV, birthStage: c.birthStage, birthGene: c.birthGene, eggCost: c.eggCost, adultV: c.adultV, segs: c.segMean, stillShare: births + still ? still / (births + still) : 0, createdPerBirth: births ? w.ledger.mutation / births : 0, extinct: !w.bodies.length }));
