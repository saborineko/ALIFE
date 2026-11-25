// Headless natural-selection trial. Usage: node tools/alife2-evolve.js <seed> <seconds> [out.json] [key=value ...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [seed, seconds, out, ...kv] = process.argv.slice(2);
const opt = { seed: Number(seed) || 1 }; for (const s of kv) { const [k, v] = s.split('='); opt[k] = Number(v); }
const w = new A.engine.World(opt), T = Number(seconds) || 600, log = [], t0 = Date.now();
w.seedWith(A.genome.primordial(opt.seed));
let next = 0;
while (w.t < T && w.bodies.length) {
  w.step();
  if (w.t >= next) { const c = w.census(); log.push(c); next += Math.max(20, T / 40);
    console.log(`t=${c.t} n=${c.n} lines=${c.lines} gen=${c.gen.toFixed(1)} seg=${c.segMean.toFixed(2)}/${c.segMax} multi=${(c.multi * 100).toFixed(0)}% V=${c.volume.toFixed(2)} v=${c.speed.toFixed(3)} mouth=${(c.mouthShare * 100).toFixed(0)}% cilia=${(c.cilia * 100).toFixed(0)}% headingVsFood=${c.taxis.toFixed(2)}(${c.taxisN}) turn=${c.turnGain.toFixed(2)} eyes=${(c.eyes * 100).toFixed(0)}% bottom=${(c.bottom * 100).toFixed(0)}% nut=${c.nutrient.toFixed(2)} food=${c.food} births=${c.births} starved=${c.starved} aged=${c.aged} broken=${c.broken} blocked=${c.blocked} [${((Date.now() - t0) / 1000).toFixed(0)}s]`); }
}
if (out) {
  // keep the commonest body plans alive at the end
  const kinds = new Map();
  for (const o of w.bodies) { const k = o.full.segs + ':' + o.full.V.toFixed(1); if (!kinds.has(k)) kinds.set(k, { n: 0, o }); kinds.get(k).n++; }
  const top = [...kinds.values()].sort((a, b) => b.n - a.n).slice(0, 12).map(q => ({ count: q.n, segs: q.o.full.segs, volume: q.o.full.V, gen: q.o.gen, speed: q.o.age > 5 ? q.o.path / q.o.age : null, mouthShare: q.o.eaten / (q.o.eaten + q.o.absorbed + 1e-9), genome: q.o.g }));
  require('fs').writeFileSync(out, JSON.stringify({ seed: opt.seed, seconds: w.t, options: opt, extinct: !w.bodies.length, log, top }, null, 1));
}
