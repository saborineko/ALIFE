// Ecological check: are artificial swimmers able to persist and breed among evolved-from-blob residents?
// (Artificial genomes; this says whether the niche exists, not that evolution found it.)
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine', 'bodyplan']) require('../alife2-' + f + '.js');
const seed = Number(process.argv[2] || 1), T = Number(process.argv[3] || 1500), mut = process.argv[4] === 'mutate';
const sw = A.bodyplan.design({ segments: 6, length: 2.6, width: 0.7, depth: 0.9, taper: 0.93, swell: 0.4, head: 0.9, snout: 0.8, eyes: 0.6, jaw: 0.25, tail: 0.4, tailSegs: 3, tailFin: 0.6, limbs: 0, skin: 0.5, wave: 0.5, waves: 1, tailGain: 1.6, freq: 1.6, gut: 0.6, nerve: 0.3, gonad: 0.3, muscle: 0.6, range: 30, stiff: 0.3 });
sw.birth = Number(process.argv[5] || 0.3); sw.brain = [2, 0, 0, 0, 0, 0, 0, -2, 0, 0.6, 0, 0, 0, 0, 0];
const w = new A.engine.World({ seed, mutation: mut ? 0.7 : 0 }); w.seedWith(A.genome.primordial(seed));
for (let i = 0; i < 30 * 300; i++) w.step();
const line = new Set(); for (let i = 0; i < 15; i++) { const p = w.patch[i % 4], o = w.spawn(A.genome.copy(sw), p.x, p.y, 1, null); line.add(o.line); }
let next = w.t;
while (w.t < 300 + T) { w.step(); if (w.t >= next) { next += T / 10; const s = w.bodies.filter(o => line.has(o.line)), r = w.bodies.length - s.length;
  console.log(`t=${Math.round(w.t)} swimmers=${s.length} (gen ${s.length ? (s.reduce((a, o) => a + o.gen, 0) / s.length).toFixed(1) : '-'}, mouth ${(100 * s.reduce((a, o) => a + o.eaten / (o.eaten + o.absorbed + 1e-9), 0) / Math.max(1, s.length)).toFixed(0)}%, v ${(s.reduce((a, o) => a + o.path / Math.max(1, o.age), 0) / Math.max(1, s.length)).toFixed(2)}) residents=${r} nut=${w.census().nutrient.toFixed(2)}`); } }
