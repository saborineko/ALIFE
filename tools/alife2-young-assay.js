// What decides whether a newborn grows up? An experiment inside a saved evolved world (a copy: nothing is saved). Every body born naturally in the first half
// of the stretch is put, by the toss of a coin that is not the world's, into one of six groups, and one thing about its start in life is changed:
//   0 nothing · 1 its reserve is filled (it is born half full) · 2 it gets four times its reserve (more than a body of its size can hold: a yolk sac)
//   3 it is laid at a random place in its region (not beside its mother) · 4 it is laid 8 units from its mother · 5 it is born two steps of growth bigger
// All six live in the same water at the same time; only the random numbers differ between runs. The share of each group that grows up is compared.
// (This asks what helps ONE young among the others. Giving the same help to all would change the water for all: that is a different question.)
// Usage: node tools/alife2-young-assay.js <seconds> <world.json.gz> <run number> [...more worlds]
const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const zlib = require('zlib'), fs = require('fs'), [secs, file, run] = process.argv.slice(2), T = Number(secs) || 600, k = Number(run) || 1;
const NAMES = ['何もしない', '蓄えを満たす', '蓄えを 4 倍', '海域の無作為な場所に産む', '親から 8 単位離して産む', '2 段階大きく産む'];
const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))), t0 = w.t, rec = new Map(), coin = A.genome.rng(9000 + k); w.rand = A.genome.rng(7000 + k);
const spawn0 = w.spawn.bind(w); w.spawn = function (g, x, y, stage, parent) { const o = spawn0(g, x, y, stage, parent); if (parent && w.t - t0 < T / 2) rec.set(o.id, { o, t: w.t, pre: true }); return o; };
for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step();
  for (const r of rec.values()) { const o = r.o;
    if (r.pre) { r.pre = false; if (o.dead) { r.skip = true; continue; } const g = r.g = coin.int(6), pr = o.prof, root = o.b.segs[0], ang = Math.atan2(root.dy, root.dx); r.E0 = o.E; r.cost0 = pr.buildCost + o.E;
      if (g === 1) o.E = pr.Emax; else if (g === 2) o.E = 4 * o.E;
      else if (g === 3) { const ground = w.isGround(o.cx, o.cy), R = w.regions ? w.regions[w.regionAt(o.cx)] : { x0: 0, x1: w.W }; let x = o.cx, y = o.cy; for (let n = 0; n < 40; n++) { const xx = R.x0 + coin() * (R.x1 - R.x0), yy = 2 + coin() * (w.H - 4); if (w.isGround(xx, yy) === ground) { x = xx; y = yy; break; } } w.form(o, x, y, ang); }
      else if (g === 4) { const a = coin() * 2 * Math.PI, x = ((o.cx + 8 * Math.cos(a)) % w.W + w.W) % w.W, y = Math.max(2, Math.min(w.H - 2, o.cy + 8 * Math.sin(a))); w.form(o, x, y, ang); }
      else if (g === 5) { const share = o.E / pr.Emax; o.stage = Math.min(1, o.stage + 0.28); o.nextCost = null; w.form(o, o.cx, o.cy, ang); o.E = share * o.prof.Emax; }
      r.cost = o.prof.buildCost + o.E; r.nut = w.nutAt(o.cx, o.cy, w.nut); r.tau = o.E / o.prof.basal; continue; }
    if (r.skip || r.done) continue; if (o.dead) { r.done = true; r.up = o.stage >= 1; r.died = w.t - r.t; } else if (o.stage >= 1) { r.done = true; r.up = true; } } }
const all = [...rec.values()].filter(r => !r.skip && r.g != null), out = { world: file.split('/').pop().replace('-t3000.json.gz', ''), run: k, groups: [] };
for (let g = 0; g < 6; g++) { const L = all.filter(r => r.g === g), mean = f => L.reduce((a, r) => a + f(r), 0) / Math.max(1, L.length), dead = L.filter(r => r.done && !r.up).map(r => r.died).sort((a, b) => a - b);
  out.groups.push({ name: NAMES[g], n: L.length, up: L.filter(r => r.up).length / Math.max(1, L.length), open: L.filter(r => !r.done).length, nut: mean(r => r.nut), tau: mean(r => r.tau), cost: mean(r => r.cost), diedAge: dead.length ? dead[Math.floor((dead.length - 1) / 2)] : null }); }
console.log(JSON.stringify(out));
