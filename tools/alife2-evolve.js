// Headless natural-selection trial. Usage: node tools/alife2-evolve.js <seed> <seconds> [out.json] [key=value ...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [seed, seconds, out, ...kv] = process.argv.slice(2);
const opt = { seed: Number(seed) || 1 }; for (const s of kv) { const [k, v] = s.split('='); opt[k] = Number.isNaN(Number(v)) ? v : Number(v); }
const snapEvery = opt.snapshots; delete opt.snapshots; // snapshots=<seconds>: with saveWorld, also keep the whole world every so often (gzip), so extinct lines can be examined later
const zlib = require('zlib'), snap = (w, t) => require('fs').writeFileSync(String(saveWorld).replace(/\.json(\.gz)?$/, '') + '-t' + t + '.json.gz', zlib.gzipSync(JSON.stringify(w.save()), { level: 9 }));
let nextSnap = snapEvery || Infinity;
const saveWorld = opt.saveWorld; delete opt.saveWorld; // saveWorld=<path>: also write the whole final world (every genome and the genealogy), for looking at single individuals
// resume=<world.json or .json.gz>: carry on from a saved world instead of starting from founders (nothing about the world is changed)
const resume = opt.resume; delete opt.resume;
const w = resume ? A.engine.World.restore(JSON.parse(resume.endsWith('.gz') ? zlib.gunzipSync(require('fs').readFileSync(resume)) : require('fs').readFileSync(resume))) : new A.engine.World(opt), T = Number(seconds) || 600, log = [], t0 = Date.now();
if (!resume) w.seedWith(A.genome.primordial(opt.seed)); else { nextSnap = Math.ceil((w.t + 1) / (snapEvery || Infinity)) * (snapEvery || Infinity); }
let next = resume ? w.t : 0;
while (w.t < T && w.bodies.length) {
  w.step();
  if (saveWorld && w.t >= nextSnap) { snap(w, Math.round(w.t)); nextSnap += snapEvery; }
  if (w.t >= next) { const c = w.census(); log.push(c); next += Math.max(20, T / 40);
    console.log(`t=${c.t} n=${c.n} lines=${c.lines} gen=${c.gen.toFixed(1)} seg=${c.segMean.toFixed(2)}/${c.segMax} multi=${(c.multi * 100).toFixed(0)}% V=${c.volume.toFixed(2)} v=${c.speed.toFixed(3)} mouth=${(c.mouthShare * 100).toFixed(0)}% cilia=${(c.cilia * 100).toFixed(0)}% wired=${(c.wired * 100).toFixed(0)}% tasteWired=${(c.tasteWired * 100).toFixed(0)}% wiring=${c.wiring.toFixed(2)} headingVsFood=${c.taxis.toFixed(2)}(${c.taxisN}) turn=${c.turnGain.toFixed(2)} eyes=${(c.eyes * 100).toFixed(0)}% bottom=${(c.bottom * 100).toFixed(0)}% nut=${c.nutrient.toFixed(2)} food=${c.food} births=${c.births} starved=${c.starved} aged=${c.aged} broken=${c.broken} blocked=${c.blocked} [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
    if (c.regions) console.log('    ' + c.regions.map(q => `${q.name} n=${q.n} seg=${q.seg.toFixed(1)} cilia=${(q.cilia * 100).toFixed(0)}% v=${q.speed.toFixed(2)} sess=${(q.sessile * 100).toFixed(0)}% mouth=${(q.mouth * 100).toFixed(0)}% immig=${(q.immigrants * 100).toFixed(0)}%`).join(' | ')); }
}
if (saveWorld) snap(w, Math.round(w.t));
if (out) {
  // keep the commonest body plans alive at the end
  const kinds = new Map();
  for (const o of w.bodies) { const k = o.full.segs + ':' + o.full.V.toFixed(1); if (!kinds.has(k)) kinds.set(k, { n: 0, o }); kinds.get(k).n++; }
  const top = [...kinds.values()].sort((a, b) => b.n - a.n).slice(0, 12).map(q => ({ count: q.n, segs: q.o.full.segs, volume: q.o.full.V, gen: q.o.gen, speed: q.o.age > 5 ? q.o.path / q.o.age : null, mouthShare: q.o.eaten / (q.o.eaten + q.o.absorbed + 1e-9), genome: q.o.g }));
  require('fs').writeFileSync(out, JSON.stringify({ seed: opt.seed, seconds: w.t, options: opt, extinct: !w.bodies.length, log, top }, null, 1));
}
