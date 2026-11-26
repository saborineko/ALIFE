// Several worlds of the same kind run side by side, each in its own thread; now and then a few bodies move from each world to the next (a ring).
// The worlds wait for each other at every exchange, so a run is reproducible: the same seed gives the same history whatever the machine's load.
// Usage: node tools/alife2-islands.js <seed> <seconds> <out prefix> [islands=4] [every=150] [count=1] [key=value world options ...]
//   every=<seconds between exchanges>, count=<bodies that leave each world at each exchange>; count=0 = the same worlds without any exchange (the control).
//   resume=<prefix of an earlier run>: carry on from its saved worlds.
// Writes <prefix>-<i>.json (census log, as tools/alife2-evolve.js) and <prefix>-<i>-t<seconds>.json.gz (the whole world) for every island.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads'), zlib = require('zlib'), fs = require('fs');
if (!isMainThread) {
  const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
  const { opt, index, resume } = workerData, log = [];
  const w = resume ? A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(resume)))) : new A.engine.World(opt); if (!resume) w.seedWith(A.genome.primordial(opt.seed));
  parentPort.on('message', m => {
    if (m.type === 'run') { if (m.arrive && m.arrive.length) w.immigrate(m.arrive, m.from); while (w.t < m.until) w.step(); const c = w.census(); log.push(c); parentPort.postMessage({ type: 'done', index, out: m.count ? w.emigrate(m.count) : [], c: { t: c.t, n: c.n, gen: c.gen, lines: c.lines, segMean: c.segMean, segMax: c.segMax, multi: c.multi, neuronBodies: c.neuronBodies || 0, fleshShare: c.fleshShare || 0 } }); }
    if (m.type === 'finish') { const t = Math.round(w.t); fs.writeFileSync(m.prefix + '-' + index + '-t' + t + '.json.gz', zlib.gzipSync(JSON.stringify(w.save()), { level: 9 })); fs.writeFileSync(m.prefix + '-' + index + '.json', JSON.stringify({ seed: opt.seed, island: index, seconds: w.t, options: opt, extinct: !w.bodies.length, arrived: w.counts.arrived || 0, left: w.counts.left || 0, log, top: [] }, null, 1)); parentPort.postMessage({ type: 'saved', index, file: m.prefix + '-' + index + '-t' + t + '.json.gz' }); }
  });
} else {
  const [seed, seconds, prefix, ...kv] = process.argv.slice(2), opt = {}; for (const s of kv) { const [k, v] = s.split('='); opt[k] = Number.isNaN(Number(v)) ? v : Number(v); }
  const K = opt.islands || 4, every = opt.every || 150, count = opt.count == null ? 1 : opt.count, resume = opt.resume, T = Number(seconds) || 600, t0 = Date.now(); for (const k of ['islands', 'every', 'count', 'resume']) delete opt[k];
  const saved = i => fs.readdirSync(require('path').dirname(resume)).filter(f => f.startsWith(require('path').basename(resume) + '-' + i + '-t') && f.endsWith('.json.gz')).sort((a, b) => Number(b.match(/-t(\d+)/)[1]) - Number(a.match(/-t(\d+)/)[1])).map(f => require('path').join(require('path').dirname(resume), f))[0];
  const ws = Array.from({ length: K }, (_, i) => new Worker(__filename, { workerData: { opt: Object.assign({}, opt, { seed: (Number(seed) || 1) * 1000 + i }), index: i, resume: resume ? saved(i) : null } }));
  let until = 0, pending = 0, outs = [], rows = []; const t00 = resume ? Number(saved(0).match(/-t(\d+)/)[1]) : 0;
  const epoch = () => { until = (until || t00) + every; pending = K; ws.forEach((x, i) => x.postMessage({ type: 'run', until: Math.min(until, T), count: until >= T ? 0 : count /* nobody leaves at the very end: there would be nowhere to arrive */, arrive: outs[(i + K - 1) % K] || [], from: (i + K - 1) % K })); outs = []; rows = []; };
  ws.forEach(x => x.on('message', m => {
    if (m.type === 'done') { outs[m.index] = m.out; rows[m.index] = m.c; if (--pending) return;
      console.log('t=' + rows[0].t + ' ' + rows.map((c, i) => '[' + i + '] n=' + c.n + ' gen=' + c.gen.toFixed(1) + ' seg=' + c.segMean.toFixed(2) + ' multi=' + (c.multi * 100).toFixed(0) + '%').join(' ') + ' [' + ((Date.now() - t0) / 1000).toFixed(0) + 's]');
      if (until >= T) { pending = K; ws.forEach(x => x.postMessage({ type: 'finish', prefix })); } else epoch(); }
    if (m.type === 'saved') { console.log('saved ' + m.file); if (!--pending) process.exit(0); }
  }));
  ws.forEach(x => x.on('error', e => { console.error(e); process.exit(1); }));
  epoch();
}
