// If food is lying where a young one is born, does it grow up? The premise of "what a parent leaves in the world is of use to its young".
// An experiment inside a saved evolved world (a copy: nothing is saved). Every body born naturally in the first half of the stretch is put, by the
// toss of a coin that is not the world's, into one of five groups:
//   0 nothing · 1 grains of food worth a quarter of what its mother's egg held are laid where it is · 2 grains worth one whole egg
//   3 the same quarter egg, dissolved: added to the water of the cell it is in · 4 one whole egg, dissolved
// The food is laid as grains of the smallest size that falls in this world (as rich, for their size, as any grain), scattered within about a third of a
// unit; anyone can eat it, the mother too. Dissolved food goes into the one cell of water (4 x 4 units) the young is in, as what a body loses goes
// back into the water where that rule holds; it spreads to the cells around, and anyone there takes it up through the skin.
// (This asks what a pile does for ONE young among the others. It is not a rule of the world: nobody pays for the pile here.)
// Usage: node tools/alife2-young-food.js <seconds> <world.json.gz> <run number>
const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
const zlib = require('zlib'), fs = require('fs'), [secs, file, run] = process.argv.slice(2), T = Number(secs) || 600, k = Number(run) || 1, C = A.organs.C;
const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))), t0 = w.t, rec = [], coin = A.genome.rng(9400 + k); w.rand = A.genome.rng(7000 + k);
const S0 = w.grainSizes[0], E0 = w.grainEnergy * S0 ** 3; /* the smallest grain that falls in this world, and what it holds */
const pile = (o, e) => { let left = e, n = 0; w.corpse = true; while (left > 0.01 && n < 200) { const pe = Math.min(left, E0), size = Math.cbrt(pe / w.grainEnergy); w.addFood(o.cx + coin.gauss() * 0.3, o.cy + coin.gauss() * 0.3, size, pe, w.isGround(o.cx, o.cy), w.grainLife); left -= pe; n++; } w.corpse = false; return n; };
const spawn0 = w.spawn.bind(w); w.spawn = function (g, x, y, stage, parent) { const o = spawn0(g, x, y, stage, parent); if (parent && w.t - t0 < T / 2) { const r = { o, g: coin.int(5), egg: Math.max(0, parent.eggCost - C.eggFixed), t: w.t, cost: 0, nut0: w.nutAt(o.cx, o.cy, w.nut) }; const e = r.egg * (r.g === 1 || r.g === 3 ? 0.25 : 1); r.grains = r.g === 1 || r.g === 2 ? pile(o, e) : 0; if (r.g >= 3) w.giveBack(o.cx, o.cy, e); r.nut1 = w.nutAt(o.cx, o.cy, w.nut); rec.push(r); } return o; };
for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step();
  for (const r of rec) { const o = r.o, age = w.t - r.t; if (age <= 20 && !o.dead) { r.cost += o.prof.basal / 30; r.abs = o.absorbed; r.eat = o.eaten * o.prof.eta; } if (r.done) continue; if (o.dead) { r.done = true; r.up = o.stage >= 1; } else if (o.stage >= 1) { r.done = true; r.up = true; } } }
const med = L => { const s = L.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(0.5 * (s.length - 1))] : NaN; }, mean = L => (L.length ? L.reduce((a, b) => a + b, 0) / L.length : NaN);
const out = { world: file.split('/').pop().replace('-t3000.json.gz', ''), run: k, egg: med(rec.map(r => r.egg)), grainEnergy: w.grainEnergy, groups: [0, 1, 2, 3, 4].map(g => { const L = rec.filter(r => r.g === g); return { n: L.length, up: L.filter(r => r.up).length / Math.max(1, L.length), open: L.filter(r => !r.done).length, grains: mean(L.map(r => r.grains)), nut0: mean(L.map(r => r.nut0)), nut1: mean(L.map(r => r.nut1)), mouthShare: mean(L.map(r => (r.eat || 0) / Math.max(1e-9, (r.eat || 0) + (r.abs || 0)))), ate: L.filter(r => r.eat > 0).length / Math.max(1, L.length), income: med(L.map(r => ((r.eat || 0) + (r.abs || 0)) / Math.max(1e-9, r.cost))), mouthIncome: mean(L.map(r => (r.eat || 0) / Math.max(1e-9, r.cost))) }; }) };
console.log(JSON.stringify(out));
