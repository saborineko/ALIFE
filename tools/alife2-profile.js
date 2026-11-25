// Where does a world step spend its time? Usage: node tools/alife2-profile.js <result.json> [steps]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const d = require(require('path').resolve(process.argv[2])), N = Number(process.argv[3]) || 600;
const w = new A.engine.World({ seed: 3, founders: 0 }); for (let i = 0; i < 900; i++) w.step();
for (const k of d.top) for (let i = 0; i < k.count; i++) w.spawn(A.genome.sanitize(A.genome.copy(k.genome)), w.rand() * w.W, w.rand() * w.H, 1, null);
const t = {}, wrap = (obj, name, label) => { const f = obj[name]; obj[name] = function () { const a = process.hrtime.bigint(), r = f.apply(this, arguments); t[label] = (t[label] || 0) + Number(process.hrtime.bigint() - a) / 1e6; return r; }; };
wrap(w, 'stepFood', 'food'); wrap(w, 'sense', 'sense'); wrap(A.physics, 'step', 'physics'); wrap(A.physics, 'com', 'com'); wrap(A.physics, 'pose', 'pose'); wrap(w, 'census', 'census'); wrap(w, 'prune', 'prune'); wrap(w, 'form', 'form(develop+build)'); wrap(w, 'spawn', 'spawn');
const t0 = process.hrtime.bigint(); for (let i = 0; i < N; i++) w.step(); const total = Number(process.hrtime.bigint() - t0) / 1e6;
const segs = w.bodies.reduce((a, o) => a + o.b.segs.length, 0), active = w.bodies.filter(o => !o.passive);
console.log(`bodies ${w.bodies.length} (active ${active.length}, segments ${segs}, active segments ${active.reduce((a, o) => a + o.b.segs.length, 0)}), food ${w.food.length}`);
console.log(`total ${(total / N).toFixed(2)} ms/step = ${(N / 30 / (total / 1000)).toFixed(1)} sim-seconds per second`);
for (const [k, v] of Object.entries(t).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${(v / N).toFixed(3)} ms/step  ${(100 * v / total).toFixed(0)}%`);
console.log(`  (rest: metabolism, feeding, bookkeeping) ${((total - ['food', 'sense', 'physics', 'census', 'prune', 'form(develop+build)'].reduce((a, k) => a + (t[k] || 0), 0)) / N).toFixed(3)} ms/step`);
