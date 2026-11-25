// Can a given way of life pay for itself in this world? Puts artificial bodies in a fresh world, alone, and reads their energy budget.
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine', 'bodyplan']) require('../alife2-' + f + '.js');
const swimmer = (o, brain) => { const g = A.bodyplan.design(Object.assign({ segments: 6, length: 2.6, width: 0.7, depth: 0.9, taper: 0.93, swell: 0.4, head: 0.9, snout: 0.8, eyes: 0.6, jaw: 0.25, tail: 0.4, tailSegs: 3, tailFin: 0.6, limbs: 0, skin: 0.5, wave: 0.5, waves: 1, tailGain: 1.6, freq: 1.6, gut: 0.6, nerve: 0.3, gonad: 0.3, muscle: 0.6, range: 30, stiff: 0.3 }, o)); g.brain = brain || [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; return g; };
const cases = {
  'blob (founder)': A.genome.primordial(1),
  'blob + cilia, base first': (() => { const g = A.genome.primordial(1); g.parts[0].cilia = 0.5; return g; })(),
  'blob + cilia, mouth first': (() => { const g = A.genome.primordial(1); g.parts[0].cilia = 0.5; g.parts[0].beat = -1; return g; })(),
  'blob + cilia, mouth first, steers to food': (() => { const g = A.genome.primordial(1); g.parts[0].cilia = 0.5; g.parts[0].beat = -1; g.parts[0].nerve = 0.5; g.brain = [2, 0, 0, 0, 0, 0, 0, Number(process.argv[3] || 2), 0, 0, 0, 0, 0, 0, 0]; return g; })(),
  'swimmer, blind': swimmer({ eyes: 0 }),
  'swimmer, eyes, small mouth': swimmer({}, [2, 0, 0, 0, 0, 0, 0, -2, 0, 0.6, 0, 0, 0, 0, 0]),
};
console.log('lifestyle | V | basal/s | move cost/s | eaten/s | absorbed/s | net/s | speed u/s | alive after 300s');
for (const [name, g] of Object.entries(cases)) {
  const w = new A.engine.World({ seed: 5, founders: 0, cap: 30 }); for (let i = 0; i < 900; i++) w.step(); // let food build up
  for (let i = 0; i < 12; i++) { const p = w.patch[i % w.patch.length]; const o = w.spawn(A.genome.copy(g), p.x + w.rand.gauss() * 5, p.y + w.rand.gauss() * 5, 1, null); o.E = o.prof.Emax * 0.6; }
  const list = w.bodies.slice(), t0 = w.t, work0 = list.map(o => o.b.work); const mute = w.cap; w.cap = 0; // no births during the test
  for (let i = 0; i < 9000; i++) w.step();
  const T = w.t - t0, m = f => list.reduce((a, o) => a + f(o), 0) / list.length, pr = list[0].prof;
  const move = m((o, i) => A.organs.C.work * o.b.work + A.organs.C.ciliaWork * o.b.ciliaUse) / T, eat = m(o => o.eaten) * pr.eta / T, abs = m(o => o.absorbed) / T;
  console.log(`${name} | ${pr.V.toFixed(2)} | ${pr.basal.toFixed(3)} | ${move.toFixed(3)} | ${eat.toFixed(3)} | ${abs.toFixed(3)} | ${(eat + abs - pr.basal - move).toFixed(3)} | ${m(o => o.path / Math.max(1, o.age)).toFixed(2)} | ${list.filter(o => !o.dead).length}/12`);
}
