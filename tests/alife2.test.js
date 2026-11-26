// ALIFE 2.0 Phase 1 checks. Run: node --test tests/
// These test what the bodies do, not just that code exists.
const test = require('node:test'), assert = require('node:assert');
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'render', 'bodyplan']) require('../alife2-' + f + '.js');
const { design, SAMPLES } = A.bodyplan, { develop, describe } = A.development, P = A.physics;
const sample = (id, over) => { const s = SAMPLES.find(q => q.id === id); return { s, plan: develop(design(Object.assign({}, s.params, over))) }; };
const run = (id, over, env, seconds) => { const { s, plan } = sample(id, over); const r = P.trial(plan, { env: env || { ground: s.env === 'ground' }, seconds: seconds || 6 }); r.bl = r.speed / describe(plan).length; return r; };

test('five samples are structurally different bodies from one grammar', () => {
  const sig = SAMPLES.map(s => { const d = describe(develop(design(s.params))); return [d.axial, d.appendages, d.appendageJoints, Math.round(d.armorFraction * 10)].join('/'); });
  assert.strictEqual(new Set(sig).size, 5, sig.join(' | '));
  for (const s of SAMPLES) assert.strictEqual(design(s.params).origin, 'artificial');
});

test('development is deterministic and inherited exactly', () => {
  for (const s of SAMPLES) { const g = design(s.params), strip = p => JSON.stringify(p.segs.map(q => [q.parent, q.len, q.r0, q.r1, q.angle, q.phase])); assert.strictEqual(strip(develop(g)), strip(develop(A.genome.copy(g)))); }
});

test('shape changes continuously with parameters', () => {
  let last = -1;
  for (let t = 0; t <= 3; t += 0.25) { const d = describe(develop(design(Object.assign({}, SAMPLES[2].params, { tail: t })))); assert.ok(d.length > last - 1e-9); assert.ok(last < 0 || d.length - last < 4); last = d.length; }
  const a = describe(sample('soft', { width: 2.3 }).plan), b = describe(sample('soft', { width: 2.4 }).plan);
  assert.ok(b.volume > a.volume && b.volume < a.volume * 1.2);
});

test('growth: a bud becomes the adult body', () => {
  const g = design(SAMPLES[4].params); let last = 0;
  for (let s = 0; s <= 1.001; s += 0.1) { const n = develop(g, { stage: s }).segs.length; assert.ok(n >= last); last = n; }
  assert.ok(develop(g, { stage: 0 }).segs.length <= 3); assert.strictEqual(last, develop(g).segs.length);
});

test('mutation changes the grammar, and the mutated body really develops and moves', () => {
  const r = A.genome.rng(7); let changed = 0, n = 0;
  for (const s of SAMPLES) for (let k = 0; k < 12; k++) {
    let g = design(s.params); const base = JSON.stringify(describe(develop(g)));
    for (let i = 0; i < 5; i++) g = A.genome.mutate(g, r);
    const plan = develop(g); assert.ok(plan.segs.length >= 1 && plan.segs.length <= A.development.MAX_SEGS);
    assert.strictEqual(g.origin, 'artificial-mutated');
    const t = P.trial(plan, { seconds: 1.5, warm: 0 }); assert.ok(t.ok, 'physics stays finite');
    if (JSON.stringify(describe(plan)) !== base) changed++; n++;
  }
  assert.ok(changed / n > 0.9, changed + '/' + n);
});

test('unselected mutation can build structure from a single blob (reach of the encoding, not evolution)', () => {
  const r = A.genome.rng(11); let best = 1;
  for (let line = 0; line < 30; line++) { let g = A.genome.primordial(line + 1); assert.strictEqual(develop(g).segs.length, 1); for (let i = 0; i < 150; i++) g = A.genome.mutate(g, r); best = Math.max(best, develop(g).segs.length); }
  assert.ok(best >= 6, 'best ' + best);
});

test('muscles alone cannot move the body: no travel without water or ground', () => {
  for (const s of SAMPLES) {
    const r = run(s.id, {}, { fluid: 0, ground: false }, 4);
    assert.ok(r.maxBend > 0.1, s.id + ' joints bend');
    assert.ok(r.distance < 1e-6, s.id + ' drift ' + r.distance);
  }
});

test('travel comes from the body working against its surroundings', () => {
  for (const s of SAMPLES) { const r = run(s.id); assert.ok(r.ok && r.bl > 0.02, s.id + ' ' + r.bl); }
  assert.ok(run('soft', { muscle: 0 }).bl < 0.005, 'no muscle, no travel');
  assert.ok(run('tail', { wave: 0, limbAmp: 0 }).bl < 0.005, 'no activity, no travel');
});

test('having legs is not walking: grip and timing decide', () => {
  const good = run('limbed').bl, noGrip = run('limbed', { grip: 0 }).bl, badTiming = run('limbed', { gripPhase: 90 }).bl;
  assert.ok(good > 0.08, 'walks ' + good);
  assert.ok(noGrip < good * 0.5, 'no pads ' + noGrip);
  assert.ok(badTiming < good * 0.5, 'bad timing ' + badTiming);
});

test('a time-symmetric stroke gives no net swimming, an asymmetric one does', () => {
  const sym = run('radial', { skew: 0 }).bl, asym = run('radial', { skew: 0.8 }).bl;
  assert.ok(asym > sym * 4 && asym > 0.02, sym + ' vs ' + asym);
});

test('body form changes performance and cost', () => {
  const a = run('soft'), b = run('soft', { limbs: 0 }), c = run('soft', { waves: 1.5 });
  assert.ok(Math.abs(a.bl - b.bl) / a.bl > 0.05); assert.ok(Math.abs(a.costOfTransport - c.costOfTransport) / a.costOfTransport > 0.05);
});

test('joints stay near their range of motion', () => {
  for (const s of SAMPLES) { const r = run(s.id), lim = Math.max(...r.body.segs.map(q => q.p.range)); assert.ok(r.maxBend < lim * 1.6 + 0.1, s.id + ' ' + r.maxBend + ' / ' + lim); }
});

test('the picture is computed from the body: pose and shape change the pixels', () => {
  const R = new A.render.Renderer(), view = { cx: 0, cy: 0, scale: 8, w: 240, h: 160 };
  const count = segs => { const d = R.field(segs, view, { hue: 100 }).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; };
  const { plan } = sample('tail'), n0 = count(plan.segs);
  assert.ok(n0 > 300);
  assert.ok(count(sample('tail', { tail: 0.5 }).plan.segs) < n0);
  assert.ok(count(sample('tail', { width: 4.3 }).plan.segs) > n0 * 1.2);
  const snap = () => Array.from(R.field(plan.segs, view, {}).data.filter((_, i) => i % 4 === 3)); const before = snap();
  const b = P.build(plan); for (let i = 0; i < 60; i++) P.step(b, 1 / 60);
  const after = Array.from(R.field(b.segs, Object.assign({}, view, { cx: P.com(b)[0], cy: P.com(b)[1] }), {}).data.filter((_, i) => i % 4 === 3));
  let diff = 0; for (let i = 0; i < before.length; i++) if (Math.abs(before[i] - after[i]) > 60) diff++;
  assert.ok(diff > 100, 'pose changed pixels: ' + diff);
});

// ---- Phase 2: energy budget and the world
for (const f of ['organs', 'engine']) require('../alife2-' + f + '.js');
const prof = (id, over) => A.organs.profile(sample(id, over).plan);

test('every tissue is paid for, and one piece of body cannot hold everything', () => {
  const a = prof('soft'), b = prof('soft', { eyes: 0 }), c = prof('soft', { armor: 0.9 });
  assert.ok(a.basal > b.basal, 'eyes cost upkeep'); assert.ok(c.basal > a.basal, 'armour costs upkeep');
  const g = A.genome.create({ parts: [A.genome.part({ muscle: 1, gut: 1, gonad: 1, store: 1, nerve: 1, vessel: 1 })] }), p = develop(g).segs[0].p;
  assert.ok(Math.abs(p.muscle + p.gut + p.gonad + p.store + p.nerve + p.vessel - A.development.TISSUE_ROOM) < 1e-9);
});

test('small bodies absorb more per volume, large mouths reach larger food, large bodies hold more reserve', () => {
  const s = prof('soft', { length: 3, width: 0.7 }), l = prof('soft', { length: 12, width: 2.8 });
  const abs = p => p.absorb.reduce((x, y) => x + y, 0) / p.V;
  assert.ok(abs(s) > abs(l) * 2); assert.ok(l.gape > s.gape * 2); assert.ok(l.Emax > s.Emax * 20);
  assert.ok(l.Emax / l.basal > s.Emax / s.basal, 'a large body starves more slowly');
});

test('limbs far from the gut are weak unless transport tissue reaches them', () => {
  const g = design(Object.assign({}, SAMPLES[1].params, { limbLen: 9 })), far = p => Math.min(...p.segs.map(q => q.supply));
  const g2 = A.genome.copy(g); for (const p of g2.parts) p.vessel = 0.9;
  assert.ok(far(develop(g)) < 0.5); assert.ok(far(develop(g2)) > far(develop(g)) * 1.5);
});

test('energy is conserved in the books: a body alone with no food only loses what it spends', () => {
  const w = new A.engine.World({ seed: 3, founders: 0, cap: 0, grainRate: 0, bottomRate: 0, nutrientStart: 0, nutrientRegrow: 0 });
  const o = w.spawn(design(SAMPLES[0].params), 80, 30, 1, null), e0 = o.E, t0 = w.t;
  for (let i = 0; i < 60; i++) w.step();
  const spent = o.prof.basal * (w.t - t0) + A.organs.C.work * o.b.work + o.egg; // upkeep, muscle work, and what went into the egg
  assert.ok(Math.abs((e0 - o.E) - spent) < 1e-6 * spent + 1e-9, (e0 - o.E) + ' vs ' + spent); assert.ok(e0 > o.E);
});

test('with nothing to eat, everything starves; founders live and breed on what the world gives', () => {
  const barren = new A.engine.World({ seed: 2, grainRate: 0, bottomRate: 0, nutrientStart: 0, nutrientRegrow: 0 }); barren.seedWith(A.genome.primordial(2));
  for (let i = 0; i < 30 * 150 && barren.bodies.length; i++) barren.step();
  assert.strictEqual(barren.bodies.length, 0); assert.ok(barren.counts.starved > 0);
  const w = new A.engine.World({ seed: 2 }); w.seedWith(A.genome.primordial(2));
  for (let i = 0; i < 30 * 150; i++) w.step();
  assert.ok(w.bodies.length > 0 && w.counts.births > 10, 'births ' + w.counts.births);
  assert.ok(w.bodies.some(o => o.g.origin === 'evolved' && o.g.mutations > 0));
});

test('genealogy: every living body traces back to a founder, and the record of each ancestor holds its genome', () => {
  const w = new A.engine.World({ seed: 2 }); w.seedWith(A.genome.primordial(2));
  for (let i = 0; i < 30 * 200; i++) w.step();
  assert.ok(w.bodies.some(o => o.gen > 0));
  for (const o of w.bodies) { const chain = w.ancestors(o.id); assert.strictEqual(chain[0].id, o.id); assert.strictEqual(chain.length, o.gen + 1); assert.strictEqual(chain[chain.length - 1].parent, 0); for (const n of chain) assert.ok(n.g && n.g.parts.length); }
  w.prune(); assert.ok(w.tree.size >= w.bodies.length);
  // body plans that died out are still on record, with a genome that can be grown again
  for (let i = 0; i < 30 * 400; i++) w.step();
  const lost = [...w.clades.values()].filter(c => c.ended != null); assert.ok(lost.length > 0);
  for (const c of lost) { assert.strictEqual(c.alive, 0); assert.ok(c.members >= 1 && c.ended >= c.born); assert.strictEqual(Object.values(c.causes).reduce((a, b) => a + b, 0), c.members); if (c.members > 2) assert.ok(develop(c.g).segs.length >= 1); else assert.strictEqual(c.g, null); }
  assert.strictEqual([...w.clades.values()].reduce((a, c) => a + c.alive, 0), w.bodies.length);
});

test('a saved world comes back with the same bodies, reserves, genealogy and record', () => {
  const w = new A.engine.World({ seed: 4 }); w.seedWith(A.genome.primordial(4));
  for (let i = 0; i < 30 * 120; i++) w.step();
  const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save())));
  assert.strictEqual(w2.bodies.length, w.bodies.length); assert.strictEqual(w2.tree.size, w.tree.size); assert.strictEqual(w2.events.length, w.events.length); assert.strictEqual(w2.clades.size, w.clades.size);
  const sum = x => x.bodies.reduce((a, o) => a + o.E, 0); assert.ok(Math.abs(sum(w) - sum(w2)) < 1e-9);
  assert.deepStrictEqual(w2.bodies.map(o => [o.id, o.gen, o.line, o.stage]), w.bodies.map(o => [o.id, o.gen, o.line, o.stage]));
  for (let i = 0; i < 300; i++) w2.step(); assert.ok(w2.bodies.length > 0);
  assert.throws(() => A.engine.World.restore({ format: 'alife16' }));
});

test('cilia push against water: they move a jointless body, need water, and cost energy', () => {
  const blob = c => develop(A.genome.create({ parts: [A.genome.part({ len: 0.5, r0: 0.5, r1: 0.5, muscle: 0, cilia: c })] }));
  const go = (c, env) => P.trial(blob(c), { env, seconds: 5, warm: 1 });
  const none = go(0, {}), some = go(0.4, {}), more = go(0.9, {}), dry = go(0.9, { fluid: 0 });
  assert.ok(none.distance < 1e-9); assert.ok(some.speed > 0.1, 'speed ' + some.speed); assert.ok(more.speed > some.speed * 1.2); assert.ok(dry.distance < 1e-9);
  assert.ok(more.body.ciliaUse > some.body.ciliaUse && some.body.ciliaUse > 0);
  const a = A.organs.profile(blob(0)), b = A.organs.profile(blob(0.9)); assert.ok(b.basal > a.basal);
});

test('taxis index: about zero without steering, positive when turning to food, zero again when that perception is cut', () => {
  const run = (brain, blind) => { const w = new A.engine.World({ seed: 9, founders: 0, cap: 0, blind: blind ? 1 : 0 }); for (let i = 0; i < 600; i++) w.step();
    const g = A.genome.primordial(1); g.parts[0].cilia = 0.5; g.parts[0].beat = -1; g.parts[0].nerve = 0.5; g.brain = brain;
    for (let i = 0; i < 16; i++) { const p = w.patch[i % 4]; w.spawn(A.genome.copy(g), p.x + w.rand.gauss() * 4, p.y + w.rand.gauss() * 4, 1, null); }
    for (let i = 0; i < 30 * 120; i++) w.step(); return w.census(); };
  const plain = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], st = s => [2, 0, 0, 0, 0, 0, 0, s, 0, 0, 0, 0, 0, 0, 0];
  const none = run(plain).taxis, a = run(st(2)).taxis, b = run(st(-2)).taxis, good = a > b ? st(2) : st(-2), cut = run(good, true).taxis;
  assert.ok(Math.abs(none) < 0.12, 'unsteered ' + none); assert.ok(Math.max(a, b) > 0.2 && Math.max(a, b) > Math.abs(none) + 0.15, 'steered ' + a + ' / ' + b);
  assert.ok(Math.abs(cut) < 0.12, 'steering genes but no perception ' + cut);
});

test('taxis index ignores bodies that only tremble in place', () => {
  const w = new A.engine.World({ seed: 5, noCilia: 1 }); w.seedWith(A.genome.primordial(5));
  for (let i = 0; i < 30 * 200; i++) w.step();
  const c = w.census(), still = w.bodies.filter(o => o.age > 5 && o.path / o.age < 0.02);
  assert.ok(still.length > w.bodies.length * 0.8, 'most bodies in a world without cilia do not travel');
  assert.ok(still.every(o => !w.traveller(o))); assert.strictEqual(c.taxisN, w.bodies.length - still.length - w.bodies.filter(o => o.age <= 5 || (o.path / o.age >= 0.02 && o.taxLen < 2)).length);
});

test('control world: with cilia disabled no body can express them', () => {
  const w = new A.engine.World({ seed: 1, noCilia: 1, founders: 0 }); const g = A.genome.primordial(1); g.parts[0].cilia = 0.8;
  const o = w.spawn(g, 50, 30, 1, null); assert.strictEqual(o.full.cilia, 0); assert.strictEqual(o.passive, true);
});

test('a mapped world: regions differ, bodies and food cross between them, and it saves and restores', () => {
  const run = () => { const w = new A.engine.World({ seed: 3, map: 'coast' }); w.seedWith(A.genome.primordial(3)); for (let i = 0; i < 30 * 120; i++) w.step(); return w; };
  const w = run(), c = w.census();
  assert.strictEqual(c.regions.length, 4); assert.strictEqual(c.regions.reduce((a, q) => a + q.n, 0), c.n); assert.ok(c.n > 20);
  assert.ok(w.isGround(250, 80) && !w.isGround(50, 80));                                   // seabed has a bottom, open ocean has none
  assert.ok(Math.hypot(...w.flowAt(50, 40)) > Math.hypot(...w.flowAt(340, 40)) * 2 || Math.hypot(...w.flowAt(50, 90)) > Math.hypot(...w.flowAt(340, 90)) * 2); // ocean flows more than shallows
  const sizeIn = id => w.food.filter(f => w.regionAt(f.x) === id).reduce((a, f) => Math.max(a, f.size), 0);
  assert.ok(sizeIn(3) >= 1.2 && w.food.some(f => f.fixed && w.regionAt(f.x) === 2));          // big grains in the big-grain sea, fixed grains in the shallows
  assert.deepStrictEqual(run().census().n, c.n);                                             // same seed, same world
  const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); assert.strictEqual(w2.bodies.length, w.bodies.length); assert.strictEqual(w2.regions.length, 4);
  for (let i = 0; i < 60; i++) w2.step(); assert.ok(w2.bodies.length > 0);
});

test('local nerve circuit: unwired bodies are untouched; a wired segment tastes, signals, changes its cilia, and pays for it', () => {
  const mk = o => { const g = A.genome.primordial(1); Object.assign(g.parts[0], { cilia: 0.5, beat: -1, nerve: 0.5 }, o); return g; };
  const world = (numb) => { const w = new A.engine.World({ seed: 6, founders: 0, cap: 0, grainRate: 0, bottomRate: 0, numb: numb ? 1 : 0 }); for (let i = 0; i < w.nut.length; i++) w.nut[i] = (i % w.cols) < w.cols / 2 ? 0.9 : 0.1; return w; };
  const w = world(false), plain = w.spawn(mk({}), 40, 30, 1, null), rich = w.spawn(mk({ nC: 3, mCil: -1 }), 40, 50, 1, null), poor = w.spawn(mk({ nC: 3, mCil: -1 }), 120, 50, 1, null);
  for (let i = 0; i < 20; i++) w.step();
  assert.strictEqual(plain.b.hasCircuit, false); assert.strictEqual(plain.b.segs[0].a, 0); assert.strictEqual(plain.b.segs[0].cd, 1); assert.strictEqual(plain.b.nerveUse, 0);
  assert.ok(rich.b.segs[0].a > 0.5 && rich.b.segs[0].cd < 0.5, 'rich water: signal up, cilia down ' + rich.b.segs[0].a);
  assert.ok(poor.b.segs[0].a < -0.5 && poor.b.segs[0].cd > 1.5, 'thin water: signal down, cilia up ' + poor.b.segs[0].a);
  assert.ok(rich.b.nerveUse > 0 && rich.prof.basal > plain.prof.basal, 'wiring and activity cost energy');
  // the same body with its taste cut does the same thing wherever it is
  const n = world(true), a = n.spawn(mk({ nC: 3, mCil: -1 }), 40, 50, 1, null), b = n.spawn(mk({ nC: 3, mCil: -1 }), 120, 50, 1, null);
  for (let i = 0; i < 20; i++) n.step();
  assert.ok(Math.abs(a.b.segs[0].a - b.b.segs[0].a) < 1e-9 && Math.abs(a.b.segs[0].a) < 1e-9);
  // a signal that carries the past is part of the individual: it survives saving
  const s = w.spawn(mk({ nC: 3, mCil: -1, leak: 0.05 }), 40, 70, 1, null); for (let i = 0; i < 30; i++) w.step();
  const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))), s2 = w2.bodies.find(o => o.id === s.id);
  assert.ok(Math.abs(s2.b.segs[0].a - s.b.segs[0].a) < 1e-4 && Math.abs(s.b.segs[0].a) > 0.1);
});

test('a sense that adapts reports change, not level', () => {
  const g = A.genome.primordial(1); Object.assign(g.parts[0], { cilia: 0.5, nerve: 0.5, adapt: 1, nC: 4 });
  const b = P.build(develop(g)), taste = new Float64Array(4);
  taste[0] = 0.8; for (let i = 0; i < 300; i++) A.neural.local(b, taste, 0);
  assert.ok(Math.abs(b.segs[0].a) < 0.05, 'steady rich water: silent ' + b.segs[0].a);
  taste[0] = 0.5; A.neural.local(b, taste, 0); assert.ok(b.segs[0].a < -0.5, 'it got worse: ' + b.segs[0].a);
});

test('a restored world continues exactly as the saved one would have (pose, velocity, rhythm, nerve state, food, randomness)', () => {
  for (const opt of [{ seed: 8 }, { seed: 8, map: 'coast' }]) {
    const w = new A.engine.World(opt), mk = o => { const g = A.genome.primordial(3); Object.assign(g.parts[0], o); return g; };
    w.seedWith(A.genome.primordial(8));
    for (let i = 0; i < 6; i++) w.spawn(mk({ cilia: 0.5, beat: -1, nerve: 0.5, nC: 3, mCil: -1, mTurn: 0.5, leak: 0.2, adapt: 0.5 }), 20 + i * 20, 30, 1, null);   // rigid, ciliated, wired
    for (let i = 0; i < 3; i++) w.spawn(design(Object.assign({}, SAMPLES[0].params, { length: 3, width: 0.7, segments: 5, limbs: 0, tail: 0.3, tailSegs: 2 })), 30 + i * 40, 50, 1, null); // jointed
    for (let i = 0; i < 30 * 40; i++) w.step();
    const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save())));
    for (let i = 0; i < 30 * 40; i++) { w.step(); w2.step(); }
    const snap = x => JSON.stringify([x.t, x.bodies.map(o => [o.id, o.cx, o.cy, o.E, o.G, o.path, o.b.segs.map(q => [q.a, q.m, q.bx, q.by])]), x.food.length, x.food.slice(0, 50).map(f => [f.x, f.y, f.e]), Array.from(x.nut.slice(0, 200)), x.counts, x.rand.state(), x.census().regions]);
    assert.strictEqual(snap(w2), snap(w), 'identical after 40 more seconds' + (opt.map ? ' (coast)' : ''));
    assert.ok(w.bodies.length > 10 && w.counts.births > 0);
  }
});

test('worlds without the leaked substances never touch the genes for sensing them', () => {
  let g = A.genome.primordial(4); const r = A.genome.rng(9);
  for (let i = 0; i < 400; i++) g = A.genome.mutate(g, r);
  assert.ok(g.parts.every(p => p.sA === 0 && p.sB === 0) && g.odor === 0.5, 'unchanged after 400 mutations');
  let h = A.genome.primordial(4); const r2 = A.genome.rng(9);
  for (let i = 0; i < 400; i++) h = A.genome.mutate(h, r2, undefined, true);
  assert.ok(h.parts.some(p => p.sA !== 0 || p.sB !== 0) && h.odor !== 0.5, 'they do change where bodies leak');
});

test('bodies leak into the water, a wired segment senses it, the cut sense does not, and such a world restores exactly', () => {
  const mk = (o, odor) => { const g = A.genome.primordial(3); Object.assign(g.parts[0], { cilia: 0.5, beat: -1, nerve: 0.5 }, o); g.odor = odor; return g; };
  const run = cut => { const w = new A.engine.World({ seed: 3, founders: 0, cap: 0, scent: 1, anosmic: cut });
    const me = w.spawn(mk({ sB: 4 }, 0.95), 80, 30, 1, null); for (let i = 0; i < 10; i++) w.spawn(mk({ cilia: 0 }, 0.05), 80 + Math.cos(i) * 2, 30 + Math.sin(i) * 2, 1, null);
    for (let i = 0; i < 30 * 20; i++) w.step(); return { w, me }; };
  const a = run(0), b = run(1);
  assert.ok(a.w.nutAt(80, 30, a.w.scB) > 5 * a.w.nutAt(80, 30, a.w.scA) && a.w.nutAt(80, 30, a.w.scB) > 20 * a.w.nutAt(10, 60, a.w.scB), 'the crowd of B bodies can be smelt where it is');
  assert.ok(a.me.b.segs[0].a > 0.1 && b.me.b.segs[0].a < -0.9, 'sensed ' + a.me.b.segs[0].a + ', cut ' + b.me.b.segs[0].a);
  const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(a.w.save())));
  for (let i = 0; i < 300; i++) { a.w.step(); w2.step(); }
  const snap = x => JSON.stringify([x.bodies.map(o => [o.cx, o.cy, o.E, o.b.segs[0].a, o.b.segs[0].mB]), Array.from(x.scA), Array.from(x.scB)]);
  assert.strictEqual(snap(w2), snap(a.w));
});

test('an eye is a receptor that looks one way and answers to its colour: bodies as well as food, not what is behind it, not when cut', () => {
  const R = Math.PI / 180, mk = (o, hue) => { const g = A.genome.primordial(3); Object.assign(g.parts[0], o); g.hue = hue; return g; };
  const run = (hue, side, cut) => { const w = new A.engine.World({ seed: 3, founders: 0, cap: 0, vision: 1, sightless: cut, grainRate: 0, bottomRate: 0 });
    const me = w.spawn(mk({ cilia: 0.2, nerve: 0.5, eye: 0.5, vE: 3, tune: 200 * R }, 200), 80, 30, 1, null); w.step();
    const s = me.b.segs[0]; w.spawn(mk({}, hue), 80 - side * s.dx * 6, 30 - side * s.dy * 6, 1, null); // the root segment looks against its own direction
    for (let i = 0; i < 12; i++) w.step(); return me.b.segs[0].v; };
  const same = run(200, 1, 0), other = run(290, 1, 0), behind = run(200, -1, 0), cut = run(200, 1, 1);
  assert.ok(same > 0.05 && other < same * 0.01 && behind === 0 && cut === 0, [same, other, behind, cut].join(' '));
  let g = A.genome.primordial(4); const r = A.genome.rng(9); for (let i = 0; i < 400; i++) g = A.genome.mutate(g, r, undefined, 'x');
  assert.ok(g.parts.every(p => p.vE === 0 && p.gaze === 0 && p.tune === 1), 'sight genes stay put where eyes do not work this way');
  const w = new A.engine.World({ seed: 6, vision: 1 }); w.seedWith(A.genome.primordial(6));
  for (let i = 0; i < 4; i++) w.spawn(mk({ cilia: 0.5, beat: -1, nerve: 0.5, eye: 0.5, vE: -3, mCil: 1, mTurn: 1, adapt: 0.5, tune: 50 * R }, 100), 20 + i * 30, 30, 1, null);
  for (let i = 0; i < 900; i++) w.step();
  const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); for (let i = 0; i < 600; i++) { w.step(); w2.step(); }
  const snap = x => JSON.stringify(x.bodies.map(o => [o.cx, o.cy, o.E, o.b.segs[0].a, o.b.segs[0].v, o.b.segs[0].mV]));
  assert.strictEqual(snap(w2), snap(w)); assert.ok(w.bodies.some(o => o.b.segs[0].v > 0), 'something was seen');
});

test('sight and smell can be switched on in a world that is already running: the bodies carry on and nothing changes until then', () => {
  const a = new A.engine.World({ seed: 12 }), b = new A.engine.World({ seed: 12 }); a.seedWith(A.genome.primordial(12)); b.seedWith(A.genome.primordial(12));
  for (let i = 0; i < 3000; i++) { a.step(); b.step(); }
  const ids = a.bodies.map(o => o.id).join(), n = a.bodies.length;
  b.enable({ vision: 1, scent: 1 });
  assert.strictEqual(b.bodies.map(o => o.id).join(), ids); assert.ok(n > 20 && b.events.some(e => /視覚を有効/.test(e.text)));
  for (let i = 0; i < 3000; i++) b.step();
  assert.ok(b.bodies.length > 10 && b.bodies.every(o => Number.isFinite(o.cx + o.E) && o.b.segs.every(q => Number.isFinite(q.a))), 'still alive and finite');
  assert.ok(b.scA.some(v => v > 0) && b.bodies.some(o => Number.isFinite(o.g.odor)));
});

test('a living population can be moved into another map with its genomes, genealogy and settings', () => {
  const a = new A.engine.World({ seed: 12, vision: 1 }); a.seedWith(A.genome.primordial(12)); for (let i = 0; i < 3000; i++) a.step();
  const ids = a.bodies.map(o => o.id).join(), w = A.engine.World.transplant(a, 'coast');
  assert.strictEqual(w.bodies.map(o => o.id).join(), ids); assert.strictEqual(w.map, 'coast'); assert.strictEqual(w.W, 480); assert.strictEqual(w.cap, 1600); assert.strictEqual(w.vision, 1);
  assert.strictEqual(w.tree.size, a.tree.size); assert.ok(w.t === a.t && w.events.some(e => /世界を移した/.test(e.text)));
  for (let i = 0; i < 1500; i++) w.step();
  assert.ok(w.bodies.length > 10 && w.bodies.every(o => Number.isFinite(o.cx + o.cy + o.E) && o.cx >= 0 && o.cx <= 480));
  const back = A.engine.World.transplant(w, ''); assert.strictEqual(back.W, 160); assert.strictEqual(back.cap, 400); for (let i = 0; i < 300; i++) back.step(); assert.ok(back.bodies.length > 0);
});

test('with a sloping border the load on the floor is continuous across every border, and such a world restores exactly', () => {
  const w = new A.engine.World({ seed: 4, map: 'coast', shore: 24 });
  let worst = 0; for (let x = 0; x < 480; x += 0.25) worst = Math.max(worst, Math.abs(w.slope(x + 0.25, true) - w.slope(x, true)));
  assert.ok(worst < 0.01, 'largest jump over a quarter unit: ' + worst);
  assert.strictEqual(w.slope(100, true), 0); assert.ok(Math.abs(w.slope(250, true) - 0.35) < 1e-9 && Math.abs(w.slope(340, true) - 0.12) < 1e-9);
  const old = new A.engine.World({ seed: 4, map: 'coast' }); assert.strictEqual(old.borderX(old.regions[0]), 188); assert.strictEqual(old.isGround(189, 50), true); assert.strictEqual(old.isGround(187, 50), false);
  w.seedWith(A.genome.primordial(4)); for (let i = 0; i < 6; i++) w.spawn(design(Object.assign({}, SAMPLES[0].params, { length: 3, width: 0.7, segments: 5, limbs: 0, tail: 0.3, tailSegs: 2 })), 176 + i * 5, 50, 1, null);
  for (let i = 0; i < 900; i++) w.step();
  const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); assert.strictEqual(w2.shore, 24);
  for (let i = 0; i < 600; i++) { w.step(); w2.step(); }
  const snap = x => JSON.stringify(x.bodies.map(o => [o.id, o.cx, o.cy, o.E])); assert.strictEqual(snap(w2), snap(w));
});

test('bodies that touch push each other apart without gaining momentum; a mouth takes exactly what the other body loses; lost tissue is lost function', () => {
  const C = A.organs.C, mk = o => { const g = A.genome.primordial(1); Object.assign(g.parts[0], o); return g; };
  const quiet = { seed: 2, founders: 0, cap: 0, contact: 1, flow: 0, grainRate: 0, bottomRate: 0, jitter: 0, nutrientStart: 0, nutrientRegrow: 0 };
  { // pushing: a rigid body and a jointed one, overlapping
    const w = new A.engine.World(Object.assign({}, quiet, { noBite: 1 })), a = w.spawn(mk({ cilia: 0, mouth: 0 }), 80, 30, 1, null);
    const b = w.spawn(design(Object.assign({}, SAMPLES[0].params, { length: 3, width: 0.7, segments: 5, limbs: 0, tail: 0.3, tailSegs: 2 })), 80.4, 30.2, 1, null);
    const mom = () => { const p = P.momentum(a.b), q = P.momentum(b.b); return [p[0] + q[0], p[1] + q[1]]; }, m0 = mom(); w.index(); w.touch(w.dt); const m1 = mom();
    assert.ok(Math.hypot(m1[0] - m0[0], m1[1] - m0[1]) < 1e-9, 'momentum before ' + m0 + ' after ' + m1);
    const gap = () => Math.min(...b.b.segs.map(s => Math.hypot(s.bx - a.b.segs[0].bx, s.by - a.b.segs[0].by) - s.r1 - a.b.segs[0].r1)), g0 = gap(); for (let i = 0; i < 240; i++) w.step();
    assert.ok(g0 < -0.1 && gap() > -0.05, 'overlap ' + g0 + ' -> ' + gap()); assert.ok(!a.hp && !b.hp, 'no bite where mouths take nothing');
  }
  { // biting: the eater's gut gets exactly what the other loses, at every moment, until it dies of it
    const w = new A.engine.World(quiet), big = w.spawn(mk({ len: 1.4, r0: 1, r1: 1, mouth: 1, gut: 0.5, muscle: 0.3, cilia: 0 }), 80, 30, 1, null);
    const small = w.spawn(mk({ cilia: 0, mouth: 0 }), big.b.segs[0].bx + 0.3, big.b.segs[0].by, 1, null), has = o => Math.max(0, o.E) + o.G + C.flesh * o.prof.buildCost;
    w.index(); let n = 0, worst = 0; const v0 = small.prof.V;
    while (!small.dead && n < 3000) { const s0 = has(small), g0 = big.G; w.touch(w.dt); worst = Math.max(worst, Math.abs((s0 - has(small)) - (big.G - g0))); big.G = Math.max(0, big.G - 0.02); n++; }
    assert.ok(worst < 1e-9, 'largest mismatch ' + worst); assert.strictEqual(small.dead, 'killed'); assert.ok(n > 5, 'not in an instant: ' + n + ' steps');
    assert.ok(Math.abs(w.counts.flesh - big.flesh) < 1e-9 && Math.abs(small.lost - big.flesh) < 1e-9 && small.prof.V < 0.31 * v0);
  }
  { // wounds: half the tissue of a segment gone = half of what it did
    const w = new A.engine.World(quiet), o = w.spawn(mk({ cilia: 0.5, beat: -1, eye: 0.5, gonad: 0.3 }), 80, 30, 1, null), p0 = o.prof, c0 = o.b.segs[0].cil;
    o.hp = [0.5]; w.wound(o); for (const k of ['V', 'gutCap', 'gape', 'eye', 'gonadRate', 'Emax']) assert.ok(Math.abs(o.prof[k] / p0[k] - 0.5) < 1e-9, k);
    assert.ok(Math.abs(o.b.segs[0].cil / c0 - 0.5) < 1e-9 && !o.dead); o.E = o.prof.Emax; const e0 = o.E; for (let i = 0; i < 30; i++) w.step(); assert.ok(o.hp === null || o.hp[0] > 0.5, 'it mends when it has reserves');
  }
  { // such a world restores exactly, wounds included
    const w = new A.engine.World({ seed: 5, contact: 1 }); w.seedWith(A.genome.primordial(5)); for (let i = 0; i < 6; i++) w.spawn(mk({ len: 1.2, r0: 0.9, r1: 0.9, mouth: 1, gut: 0.5, muscle: 0.3, cilia: 0.5, beat: -1 }), 20 + i * 25, 40, 1, null);
    for (let i = 0; i < 1500; i++) w.step(); const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); for (let i = 0; i < 600; i++) { w.step(); w2.step(); }
    const snap = x => JSON.stringify([x.bodies.map(o => [o.id, o.cx, o.cy, o.E, o.G, o.hp]), x.counts]); assert.strictEqual(snap(w2), snap(w));
  }
});

test('newer gene rules: a split leaves the body exactly as it was, at every growth stage; then the two parts can go their own ways', () => {
  const G = A.genome, r = G.rng(5), pool = SAMPLES.map(s => design(s.params));
  { const rm = G.rng(77); for (let t = 0; t < 25; t++) { let g = G.primordial(100 + t); for (let i = 0; i < 50; i++) g = G.mutate(g, rm, 1, 'gxv'); if (g.links.length) pool.push(g); } }
  const KEYS = ['parent', 'idx', 'mir', 'at', 'off', 'angle', 'len', 'r0', 'r1', 'z0', 'z1', 'phase', 'chain', 'tip', 'leaf', 'supply', 'ax', 'ay', 'bx', 'by', 'addr'];
  const same = (a, b) => a.segs.length === b.segs.length && a.segs.every((x, i) => KEYS.every(k => x[k] === b.segs[i][k]) && Object.keys(G.PART_FIELDS).every(k => x.p[k] === b.segs[i].p[k]));
  let tried = 0, seenInBody = 0;
  for (const g0 of pool) { const g = G.ensureIds(G.sanitize(G.copy(g0)));
    for (const li of g.parts.map((_, i) => G.axisOf(g, i)).filter(i => i >= 0)) G.zones(g, li).forEach((z, zi) => { for (const k of new Set([1, z.len >> 1, z.len - 1])) { if (k < 1 || k >= z.len) continue;
      const h = G.copy(g), Q = G.splitZone(h, li, zi, k, r); if (Q < 0) continue; tried++; assert.deepStrictEqual(G.sanitize(G.copy(h)), h);
      for (const stage of [0.3, 0.6, 1]) { const p0 = develop(g, { stage, maxSegs: 64 }), p1 = develop(h, { stage, maxSegs: 64 }); assert.ok(same(p0, p1), 'plan differs at stage ' + stage); assert.strictEqual(JSON.stringify(A.organs.profile(p1)), JSON.stringify(A.organs.profile(p0))); if (stage === 1 && p1.segs.some(s => s.part === Q)) seenInBody++; }
    } }); }
  assert.ok(tried > 60 && seenInBody > 30, tried + ' splits, ' + seenInBody + ' with the copy in the body');
  // the copy is its own part: changing it changes only its stretch of the axis
  const g = G.ensureIds(design(SAMPLES[0].params)), li = G.axisOf(g, g.root), n = G.zones(g, li)[0].len, Q = G.splitZone(g, li, 0, n >> 1, r), before = develop(g);
  g.parts[Q].r0 *= 1.5; const after = develop(g); let changed = 0, kept = 0; before.segs.forEach((s, i) => { if (s.part === Q) changed += after.segs[i].r1 !== s.r1 || after.segs[i].r0 !== s.r0 ? 1 : 0; else kept += after.segs[i].len === s.len ? 1 : 0; });
  assert.ok(changed > 0 && kept === before.segs.filter(s => s.part !== Q).length);
});

test('newer gene rules: dormant parts decay and do not block duplication; old rules and old genomes are untouched', () => {
  const G = A.genome;
  // a genome like the one found after 565 generations: 12 parts, one in use
  const junk = G.primordial(3); for (let i = 0; i < 11; i++) junk.parts.push(G.copy(junk.parts[0])); G.sanitize(junk); assert.strictEqual(G.reach(junk).size, 1);
  let a = G.copy(junk), b = G.copy(junk); const ra = G.rng(4), rb = G.rng(4); let grewOld = 0, most = 12;
  for (let i = 0; i < 600; i++) { a = G.mutate(a, ra); if (a.parts.length > 12) grewOld++; b = G.mutate(b, rb, 1, 'g'); most = Math.max(most, G.reach(b).size); }
  assert.strictEqual(grewOld, 0, 'old rules: stuck at the limit'); assert.strictEqual(a.parts.length, 12);
  assert.ok(G.reach(b).size <= G.MAX_PARTS && b.parts.length <= G.STORE_PARTS && b.parts.every(p => p.id != null) && new Set(b.parts.map(p => p.id)).size === b.parts.length);
  let c = G.copy(junk); const rc = G.rng(8); let dup = 0; for (let i = 0; i < 300; i++) { const n = c.parts.length, ids = new Set(c.parts.map(p => p.id)); c = G.mutate(c, rc, 1, 'g'); if (c.parts.some(p => p.how === 'dup' && !ids.has(p.id))) dup++; }
  assert.ok(dup > 5, 'duplication happens again: ' + dup); assert.ok(c.parts.length - G.reach(c).size < 11, 'the dormant parts have thinned: ' + (c.parts.length - G.reach(c).size));
  // old rules consume the same random numbers as before: a genome mutated without the new rules never gets ids or zones
  let o = G.primordial(6); const ro = G.rng(2); for (let i = 0; i < 300; i++) o = G.mutate(o, ro, 1, 'xv'); assert.ok(o.parts.every(p => p.id == null && p.next == null) && o.links.every(l => l.id == null && l.fam == null));
  // a world with the new rules runs, records gene use, and restores exactly
  const w = new A.engine.World({ seed: 5, genome2: 1 }); w.seedWith(G.primordial(5)); for (let i = 0; i < 2400; i++) w.step();
  const c0 = w.census(); assert.ok(c0.partsUsed >= 1 && c0.partsReach >= c0.partsUsed && c0.partsTotal >= c0.partsReach);
  const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); for (let i = 0; i < 600; i++) { w.step(); w2.step(); }
  const snap = x => JSON.stringify(x.bodies.map(q => [q.id, q.cx, q.cy, q.E, q.gu])); assert.strictEqual(snap(w2), snap(w));
});

test('the energy ledger balances, and keeping it changes nothing', () => {
  const run = audit => { const w = new A.engine.World({ seed: 7, audit, contact: 1, genome2: 1, vision: 1, scent: 1 }); w.seedWith(A.genome.primordial(7));
    for (let i = 0; i < 6; i++) { const g = A.genome.primordial(3); Object.assign(g.parts[0], { len: 1.2, r0: 0.9, r1: 0.9, mouth: 1, gut: 0.5, muscle: 0.3, cilia: 0.5, beat: -1 }); w.spawn(g, 20 + i * 25, 40, 1, null); }
    for (let i = 0; i < 900; i++) w.step(); return w; };
  const a = run(1), b = run(0), sig = w => JSON.stringify(w.bodies.map(o => [o.id, o.cx, o.cy, o.E, o.G])); assert.strictEqual(sig(a), sig(b), 'same world with and without the ledger'); assert.strictEqual(b.ledger, null);
  for (const k in a.ledger) a.ledger[k] = 0; const s0 = a.stored(); for (let i = 0; i < 1800; i++) a.step();
  const L = a.ledger, IN = ['rain', 'regrow', 'placed', 'mutation'], inflow = IN.reduce((x, k) => x + L[k], 0), out = Object.keys(L).filter(k => !IN.includes(k)).reduce((x, k) => x + L[k], 0), gap = (a.stored() - s0) - (inflow - out);
  assert.ok(Object.values(L).every(Number.isFinite) && L.rain > 100 && L.basal > 10 && L.death > 0 && a.counts.births > 20, JSON.stringify(L));
  assert.ok(Math.abs(gap) < 1e-6 * inflow, 'unexplained ' + gap + ' of ' + inflow);
});

test('birth budget: the young is built from what the egg holds; nothing is created at birth; too little makes it premature or stillborn', () => {
  const G = A.genome, C = A.organs.C, w = new A.engine.World({ seed: 3, founders: 0, budget: 1 });
  const P = G.primordial(3), cost = (g, s) => { const p = A.organs.profile(develop(g, { stage: s, maxSegs: 64 })); return p.buildCost + C.eggReserve * p.Emax; }, B = cost(P, P.birth);
  assert.strictEqual(w.afford(P, B), P.birth, 'its own kind of young: exactly paid for');
  const big = G.copy(P); big.parts[0].len *= 1.6; big.parts[0].r0 *= 1.4; big.parts[0].r1 *= 1.4; const s = w.afford(big, B);
  assert.ok(s < big.birth && s >= 0.05 && cost(big, s) <= B + 1e-9, 'a bigger body is born earlier: ' + s); assert.ok(cost(big, Math.min(big.birth, s + 0.02)) > B || s === big.birth);
  const small = G.copy(P); small.parts[0].len *= 0.6; assert.strictEqual(w.afford(small, B), small.birth); assert.ok(cost(small, small.birth) < B, 'a smaller body has yolk left');
  const huge = G.copy(P); huge.parts[0].len = 8; huge.parts[0].r0 = 4; huge.parts[0].r1 = 4; assert.strictEqual(w.afford(huge, B), null, 'no bud can be made: stillborn');
  // in a running world: the ledger shows nothing created at birth, with the rule on; and something, with it off
  const run = budget => { const x = new A.engine.World({ seed: 9, budget, audit: 1 }); x.seedWith(G.primordial(9)); for (let i = 0; i < 4500; i++) x.step(); return x; };
  const on = run(1), off = run(0), gap = x => { const L = x.ledger, IN = ['rain', 'regrow', 'placed', 'mutation']; return [IN.reduce((a, k) => a + L[k], 0), Object.keys(L).filter(k => !IN.includes(k)).reduce((a, k) => a + L[k], 0)]; };
  assert.ok(on.counts.births > 50 && Math.abs(on.ledger.mutation) < 1e-9, 'created at birth with the rule: ' + on.ledger.mutation); assert.ok(Math.abs(off.ledger.mutation) > 1e-3, 'without: ' + off.ledger.mutation);
  assert.ok(on.bodies.some(o => o.gen > 0 && o.stage0 < o.g.birth - 1e-6) || on.bodies.some(o => o.gen > 0 && (o.grow > 0 || o.egg > 0)), 'some young were born early or with yolk');
  const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(on.save()))); for (let i = 0; i < 300; i++) { on.step(); w2.step(); }
  assert.strictEqual(JSON.stringify(w2.bodies.map(o => [o.id, o.cx, o.E, o.grow, o.stage0])), JSON.stringify(on.bodies.map(o => [o.id, o.cx, o.E, o.grow, o.stage0])));
});

test('carry: a segment keeps its nerve signal, its sensory adaptation and the body its rhythm when the body is rebuilt for growth', () => {
  const g = design(Object.assign({}, SAMPLES[0].params, { length: 3, width: 0.7, segments: 5, limbs: 0, tail: 0.3, tailSegs: 2 })); for (const p of g.parts) Object.assign(p, { nerve: 0.5, nC: 2, nP: 1, leak: 0.2, adapt: 0.5 });
  for (const carry of [1, 0]) { const w = new A.engine.World({ seed: 4, founders: 0, cap: 0, carry }), o = w.spawn(A.genome.copy(g), 60, 40, 0.5, null);
    for (let i = 0; i < 300; i++) w.step(); const before = new Map(o.plan.segs.map((s, i) => [s.addr, [o.b.segs[i].a, o.b.segs[i].m]])), t = o.b.t; assert.ok([...before.values()].some(v => Math.abs(v[0]) > 0.01), 'the circuit is active');
    o.stage = 0.8; w.form(o, o.cx, o.cy, 0);
    const kept = o.plan.segs.filter((s, i) => before.has(s.addr) && o.b.segs[i].a === before.get(s.addr)[0] && o.b.segs[i].m === before.get(s.addr)[1]).length, had = o.plan.segs.filter(s => before.has(s.addr)).length;
    if (carry) { assert.ok(had > 2 && kept === had, kept + ' of ' + had + ' kept'); assert.strictEqual(o.b.t, t); } else { assert.ok(o.b.segs.every(q => q.a === 0 && q.m === null) && o.b.t !== t, 'earlier rule: starts from nothing'); } }
});

test('mutation strength can itself evolve; a mouth can take pieces of a grain too big to swallow; neither touches worlds without the setting', () => {
  const G = A.genome; let g = G.primordial(2); const r = G.rng(3); for (let i = 0; i < 200; i++) g = G.mutate(g, r, 1, 'xvg'); assert.strictEqual(g.mut, undefined);
  let h = G.primordial(2); const r2 = G.rng(3); for (let i = 0; i < 200; i++) h = G.mutate(h, r2, h.mut == null ? 1 : h.mut, 'm'); assert.ok(h.mut !== 1 && h.mut >= 0.1 && h.mut <= 3, 'mut ' + h.mut);
  const w = new A.engine.World({ seed: 5, metamut: 1 }); w.seedWith(G.primordial(5)); for (let i = 0; i < 3000; i++) w.step(); const c = w.census(); assert.ok(w.bodies.some(o => o.g.mut != null && o.g.mut !== 1) && c.mutGene > 0.1);
  // nibbling: a small mouth held on a big fixed grain
  const run = nibble => { const x = new A.engine.World({ seed: 2, founders: 0, cap: 0, nibble, audit: 1, flow: 0, grainRate: 0, bottomRate: 0, jitter: 0, nutrientStart: 0, nutrientRegrow: 0 });
    const g2 = G.primordial(1); Object.assign(g2.parts[0], { cilia: 0 }); const o = x.spawn(g2, 80, 90, 1, null); o.passive = true; x.step(); const s = o.b.segs[0]; x.addFood(s.bx, s.by, 1.2, 40 * 1.2 ** 3, true, 1e9); const e0 = x.food[0].e;
    for (let i = 0; i < 300; i++) x.step(); return { eaten: o.eaten, left: x.food.length ? x.food[0].e : 0, e0, size: x.food.length ? x.food[0].size : 0 }; };
  const off = run(0), on = run(1); assert.strictEqual(off.eaten, 0, 'whole or nothing: nothing'); assert.ok(on.eaten > 0.05 && Math.abs(on.e0 - on.left - on.eaten) < 1e-9 && on.size < 1.2, JSON.stringify(on));
});

test('where bodies touch: a segment feels a push and a tear, the cut sense feels nothing, and a mouth held shut takes nothing', () => {
  const G = A.genome, mk = o => { const g = G.primordial(1); Object.assign(g.parts[0], o); return g; };
  const quiet = { seed: 2, founders: 0, cap: 0, contact: 1, flow: 0, grainRate: 0, bottomRate: 0, jitter: 0, nutrientStart: 0.6, nutrientRegrow: 0 };
  // pushed: two overlapping bodies, one wired from touch
  for (const cut of [0, 1]) { const w = new A.engine.World(Object.assign({}, quiet, { noBite: 1, numbSkin: cut })), a = w.spawn(mk({ cilia: 0.2, nerve: 0.5, sT: 4, mouth: 0 }), 80, 30, 1, null); w.spawn(mk({ cilia: 0, mouth: 0 }), 80.3, 30.1, 1, null);
    let peak = 0; for (let i = 0; i < 20; i++) { w.step(); peak = Math.max(peak, a.b.segs[0].a); } if (cut) assert.strictEqual(peak, 0, 'cut: ' + peak); else assert.ok(peak > 0.3, 'felt the push: ' + peak); }
  // torn: a small wired body under a big mouth
  { const w = new A.engine.World(quiet), big = w.spawn(mk({ len: 1.4, r0: 1, r1: 1, mouth: 1, gut: 0.5, muscle: 0.3, cilia: 0 }), 80, 30, 1, null), small = w.spawn(mk({ cilia: 0.2, nerve: 0.5, sW: 4, mouth: 0 }), big.b.segs[0].bx + 0.3, big.b.segs[0].by, 1, null);
    let peak = 0; for (let i = 0; i < 30 && !small.dead; i++) { w.step(); peak = Math.max(peak, small.b.segs[0].a); } assert.ok(small.lost > 0 && peak > 0.3, 'felt the tear: ' + peak + ' lost ' + small.lost); }
  // a mouth held shut (signal high, mBite negative) takes neither tissue nor grains; the same mouth without that gene does
  const fed = mBite => { const w = new A.engine.World(quiet), big = w.spawn(mk({ len: 1.4, r0: 1, r1: 1, mouth: 1, gut: 0.5, muscle: 0.3, cilia: 0.05, nerve: 0.5, nB: 2, mBite }), 80, 30, 1, null); w.step();
    const s = big.b.segs[0], small = w.spawn(mk({ cilia: 0, mouth: 0 }), s.bx + 0.3, s.by, 1, null); w.addFood(s.bx, s.by, 0.3, 1, true, 1e9); for (let i = 0; i < 20; i++) w.step(); return { flesh: big.flesh || 0, eaten: big.eaten, lost: small.lost || 0 }; };
  const shut = fed(-1.5), open = fed(0); assert.ok(open.flesh > 0 && open.eaten > 0.9, JSON.stringify(open)); assert.ok(shut.flesh === 0 && shut.eaten === 0 && shut.lost === 0, JSON.stringify(shut));
  // old rules: these genes never change in worlds without contact
  let g = G.primordial(4); const r = G.rng(9); for (let i = 0; i < 300; i++) g = G.mutate(g, r, 1, 'xvgm'); assert.ok(g.parts.every(p => p.sT === 0 && p.sW === 0 && p.mBite === 0));
});

test('several neurons per segment: they read senses and each other by place on the body (the mirror twin included), act, mutate, and survive save and growth', () => {
  const G = A.genome, N = A.neural;
  // a body with a pod on each side; each pod has an eye and one neuron that hears its own eye and, against it, its twin's neuron
  const two = () => G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3, beat: -1, nerve: 0.5, mouth: 0.4, gut: 0.5 }), G.part({ len: 0.5, r0: 0.25, r1: 0.2, cilia: 0.6, beat: -1, nerve: 0.5, eye: 0.5 })],
    links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 })] });
  const g = two(); g.parts[1].nn = [{ b: 0, k: 1, in: [['v', 3], ['m0', -2]], out: [['C', 1]] }];
  const b = P.build(develop(g)), L = b.segs[1], R = b.segs[2]; assert.strictEqual(b.segs.length, 3); assert.ok(L.twin === 2 && R.twin === 1 && b.segs[0].twin === -1, 'twins ' + L.twin + ' ' + R.twin);
  const taste = new Float64Array(8).fill(0.5); L.v = 1.5; R.v = 0; for (let i = 0; i < 40; i++) N.local(b, taste, 0, null, null, true, false);
  assert.ok(L.na[0] > 0.5 && R.na[0] < -0.5, 'the side that sees wins: ' + L.na[0] + ' / ' + R.na[0]); assert.ok(L.cd > 1.4 && R.cd < 0.6, 'and beats harder: ' + L.cd + ' / ' + R.cd);
  // without the twin connection both sides only follow their own eye
  const h = two(); h.parts[1].nn = [{ b: 0, k: 1, in: [['v', 3]], out: [['C', 1]] }]; const b2 = P.build(develop(h)); b2.segs[1].v = 1.5; b2.segs[2].v = 1.2; for (let i = 0; i < 40; i++) N.local(b2, taste, 0, null, null, true, false);
  assert.ok(Math.abs(b2.segs[1].na[0] - b2.segs[2].na[0]) < 0.2, 'no comparison without the connection');
  // mutation makes, copies and loses neurons only where the setting is on
  let m = G.primordial(3); const r = G.rng(4); let had = 0, most = 0; for (let i = 0; i < 300; i++) { m = G.mutate(m, r, 1, 'n'); const n = m.parts.reduce((a, p) => a + (p.nn ? p.nn.length : 0), 0); if (n) had++; most = Math.max(most, n); assert.ok(m.parts.every(p => !p.nn || p.nn.length <= G.NN_MAX)); }
  assert.ok(had > 100 && most >= 2, had + ' ' + most); let o = G.primordial(3); const r2 = G.rng(4); for (let i = 0; i < 300; i++) o = G.mutate(o, r2, 1, 'xvgmc'); assert.ok(o.parts.every(p => p.nn == null));
  assert.ok(A.organs.profile(develop(g)).wiring > A.organs.profile(develop(two())).wiring + 2, 'neurons and their connections cost upkeep');
  // in a world: runs, restores exactly with the neurons' state, and the state follows the segment through growth
  const w = new A.engine.World({ seed: 5, founders: 0, cap: 0, nerve2: 1, vision: 1, carry: 1 }); for (let i = 0; i < 300; i++) w.step(); const body = w.spawn(G.copy(g), 60, 40, 0.6, null); for (let i = 0; i < 300; i++) w.step();
  const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); for (let i = 0; i < 300; i++) { w.step(); w2.step(); } const sig = x => JSON.stringify(x.bodies.map(q => [q.cx, q.cy, q.E, q.b.segs.map(s => (s.na ? Array.from(s.na) : null))])); assert.strictEqual(sig(w2), sig(w));
  const before = new Map(body.plan.segs.map((s, i) => [s.addr, body.b.segs[i].na ? Array.from(body.b.segs[i].na) : null])); body.stage = 0.9; w.form(body, body.cx, body.cy, 0);
  body.plan.segs.forEach((s, i) => { if (before.get(s.addr)) assert.deepStrictEqual(Array.from(body.b.segs[i].na), before.get(s.addr)); });
});

test('adhere: a pressed pad grips another body without creating momentum; reserve seeps from the fuller to the emptier body and none is lost; skin blocks it', () => {
  const G = A.genome, mk = o => { const g = G.primordial(1); Object.assign(g.parts[0], { mouth: 0, cilia: 0 }, o); return g; };
  const quiet = { seed: 2, founders: 0, cap: 0, contact: 1, adhere: 1, noBite: 1, flow: 0, grainRate: 0, bottomRate: 0, jitter: 0, nutrientStart: 0, nutrientRegrow: 0 };
  // grip: B slides past A; with A's pad pressed the difference in their speeds shrinks in one touch, and total momentum stays
  for (const grip of [1, 0]) { const w = new A.engine.World(quiet), a = w.spawn(mk({ grip }), 80, 30, 1, null), b = w.spawn(mk({}), 80 + 1.05, 30, 1, null); w.step();
    a.b.segs[0].press = grip; b.b.segs[0].press = 0; for (let k = 0; k < b.b.np; k++) { b.b.vx[k] = 0; b.b.vy[k] = 1; a.b.vx[k] = 0; a.b.vy[k] = 0; } b.b.om = 0; a.b.om = 0;
    const mom = () => { const p = P.momentum(a.b), q = P.momentum(b.b); return [p[0] + q[0], p[1] + q[1]]; }, rel = () => Math.hypot(b.b.vx[1] - a.b.vx[1], b.b.vy[1] - a.b.vy[1]), m0 = mom(), r0 = rel();
    for (const o of [a, b]) { const c = P.com(o.b); o.cx = c[0]; o.cy = c[1]; } P.pose(a.b); P.pose(b.b); w.index(); w.touch(w.dt); const m1 = mom();
    assert.ok(Math.hypot(m1[0] - m0[0], m1[1] - m0[1]) < 1e-9, 'momentum'); if (grip) assert.ok(rel() < r0 * 0.99 && a.held === w.tick, 'gripped: ' + r0 + ' -> ' + rel()); else assert.ok(Math.abs(rel() - r0) < 1e-9 && a.held == null, 'no pad, no grip'); }
  // seepage
  const seep = (skin, noSeep) => { const w = new A.engine.World(Object.assign({}, quiet, { noSeep })), a = w.spawn(mk({ skin: 0 }), 80, 30, 1, null), b = w.spawn(mk({ skin }), 80.9, 30, 1, null); a.E = a.prof.Emax * 0.9; b.E = b.prof.Emax * 0.1;
    const tot = a.E + b.E; w.index(); for (let i = 0; i < 200; i++) w.touch(w.dt); return { moved: b.E - b.prof.Emax * 0.1, lost: Math.abs(a.E + b.E - tot), fa: a.E / a.prof.Emax, fb: b.E / b.prof.Emax }; };
  const open = seep(0, 0), covered = seep(1, 0), cut = seep(0, 1);
  assert.ok(open.moved > 0.01 && open.lost < 1e-9 && open.fa > open.fb, JSON.stringify(open)); assert.strictEqual(covered.moved, 0); assert.strictEqual(cut.moved, 0);
});

test('islands: a body that leaves one world and arrives in another keeps what it is; both ledgers balance; nothing is created', () => {
  const mk = seed => { const w = new A.engine.World({ seed, audit: 1, contact: 1, genome2: 1, budget: 1 }); w.seedWith(A.genome.primordial(seed)); for (let i = 0; i < 900; i++) w.step(); for (const k in w.ledger) w.ledger[k] = 0; return w; };
  const IN = ['rain', 'regrow', 'placed', 'mutation', 'recycled', 'arrived'], gap = (w, s0) => { const L = w.ledger, inflow = IN.reduce((x, k) => x + (L[k] || 0), 0), out = Object.keys(L).filter(k => !IN.includes(k)).reduce((x, k) => x + L[k], 0); return [(w.stored() - s0) - (inflow - out), inflow]; };
  const a = mk(11), b = mk(12), sa = a.stored(), sb = b.stored(), na = a.bodies.length, nb = b.bodies.length, before = new Map(a.bodies.map(o => [o.id, { E: o.E, age: o.age, gen: o.gen, g: JSON.stringify(o.g), stage: o.stage, V: o.prof.V }]));
  const out = JSON.parse(JSON.stringify(a.emigrate(5))); // (as it would cross between threads)
  assert.strictEqual(out.length, 5); assert.strictEqual(a.bodies.length, na - 5); assert.strictEqual(a.counts.left, 5);
  for (const s of out) { const n = a.tree.get(s.from.id); assert.strictEqual(n.cause, 'left'); assert.ok(n.died != null && !a.bodies.some(o => o.id === s.from.id)); }
  const got = b.immigrate(out, 3); assert.strictEqual(b.bodies.length, nb + 5); assert.strictEqual(b.counts.arrived, 5);
  got.forEach((o, i) => { const was = before.get(out[i].from.id), n = b.tree.get(o.id);
    assert.strictEqual(o.E, was.E); assert.strictEqual(o.age, was.age); assert.strictEqual(o.gen, was.gen); assert.strictEqual(n.gen, was.gen); assert.strictEqual(o.stage, was.stage); assert.strictEqual(JSON.stringify(o.g), was.g);
    assert.ok(Math.abs(o.prof.V - was.V) < 1e-12); assert.strictEqual(n.from.id, out[i].from.id); assert.strictEqual(n.from.island, 3); assert.strictEqual(o.parent, 0); });
  assert.ok(Math.abs(a.ledger.left - b.ledger.arrived) < 1e-9 && a.ledger.left > 0, 'what left is what arrived: ' + a.ledger.left + ' / ' + b.ledger.arrived);
  for (let i = 0; i < 600; i++) { a.step(); b.step(); }
  const ga = gap(a, sa), gb = gap(b, sb); assert.ok(Math.abs(ga[0]) < 1e-6 * ga[1], 'source: unexplained ' + ga[0]); assert.ok(Math.abs(gb[0]) < 1e-6 * gb[1], 'destination: unexplained ' + gb[0]);
  const r = A.engine.World.restore(JSON.parse(JSON.stringify(b.save()))); for (let i = 0; i < 60; i++) { b.step(); r.step(); }
  assert.strictEqual(JSON.stringify(r.bodies.map(o => [o.id, o.cx, o.E])), JSON.stringify(b.bodies.map(o => [o.id, o.cx, o.E])), 'a world with arrivals saves and continues exactly');
  const lone = new A.engine.World({ seed: 5 }); lone.spawn(A.genome.primordial(5), 10, 10, 1, null); assert.strictEqual(lone.emigrate(3).length, 0, 'the last body of a world does not leave');
});

test('mix: bare surfaces that touch pass genetic material; the next egg is made from both genomes, by parts they share; skin lets none through; worlds without the rule never mix', () => {
  const G = A.genome, r = G.rng(3);
  // the operator: the plan is the mother's; every gene of the child is the mother's or the other's; a part the other lacks is untouched
  const m = G.ensureIds(G.primordial(1)), f = G.copy(m); Object.assign(m.parts[0], { len: 0.3, mouth: 0.1, cilia: 0.2, store: 0.1 }); Object.assign(f.parts[0], { len: 0.9, mouth: 0.9, cilia: 0.8, store: 0.7 }); f.hue = 10; m.hue = 200;
  m.parts.push(Object.assign(G.part(), { id: 77, len: 0.44 })); m.links.push(Object.assign(G.link({ from: 0, to: 1 }), { id: 1077 }));
  let fromBoth = 0, whole = 0; const seen = new Set();
  for (let i = 0; i < 200; i++) { const c = G.recombine(m, f, r); assert.strictEqual(c.parts.length, 2); assert.strictEqual(c.links.length, m.links.length); assert.strictEqual(c.parts[1].len, 0.44, 'a part only the mother has stays hers');
    const src = Object.keys(G.PART_FIELDS).map(k => c.parts[0][k] === m.parts[0][k] ? (c.parts[0][k] === f.parts[0][k] ? '=' : 'm') : c.parts[0][k] === f.parts[0][k] ? 'f' : '?').join(''); assert.ok(!src.includes('?'), 'every gene is one parent\'s: ' + src);
    const s2 = src.replace(/=/g, ''); if (/m/.test(s2) && /f/.test(s2)) fromBoth++; else whole++; assert.ok(/^(m*f*|f*m*)$/.test(s2), 'one cut: ' + s2); seen.add(c.hue); }
  assert.ok(fromBoth > 50 && whole > 20 && seen.size === 2, 'eggs with genes of both, and eggs with the whole part from one (four genes differ, far apart in the row): ' + fromBoth + ' / ' + whole);
  const noIds = G.recombine(G.primordial(1), f, r); assert.ok(noIds.parts.length === 1, 'genomes without ids are matched by position');
  // in a world
  const quiet = { seed: 4, founders: 0, cap: 50, contact: 1, noBite: 1, flow: 0, grainRate: 0, bottomRate: 0, jitter: 0, mutation: 0 }, mk = (skin, hue) => { const g = G.primordial(1); Object.assign(g.parts[0], { skin, cilia: 0.3, beat: -1 }); g.hue = hue; return g; };
  const meet = (opt, skin) => { const w = new A.engine.World(Object.assign({}, quiet, opt)), a = w.spawn(mk(skin, 10), 80, 30, 1, null), b = w.spawn(mk(0, 200), 80.6, 30, 1, null); w.index(); for (let i = 0; i < 20; i++) w.touch(w.dt); return { w, a, b }; };
  const on = meet({ mix: 1 }, 0); assert.ok(on.a.got && on.a.got.id === on.b.id && on.b.got && on.b.got.id === on.a.id, 'both carry the other\'s material');
  const off = meet({}, 0); assert.ok(!off.a.got && !off.b.got, 'no rule, no uptake');
  const skin = meet({ mix: 1 }, 1); assert.ok(!skin.a.got && !skin.b.got, 'a fully covered body neither gives nor takes');
  // the egg: made from both, the material is used up, the record names both parents; saving keeps the material
  const w = on.w, a = on.a; const copy = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); assert.strictEqual(copy.bodies[0].got.id, on.b.id, 'saved and restored');
  a.stage = 1; a.E = a.prof.Emax; a.egg = a.eggCost * 3; let kid = null; for (let i = 0; i < 600 && !kid; i++) { w.step(); a.E = a.prof.Emax; kid = w.bodies.find(o => o.parent === a.id); }
  assert.ok(kid, 'an egg was laid'); assert.strictEqual(kid.p2, on.b.id); assert.strictEqual(w.tree.get(kid.id).p2, on.b.id); assert.strictEqual(w.counts.mixed, 1); assert.ok(kid.g.hue === 10 || kid.g.hue === 200);
});

test('invest: the reserve a mother gives each egg is hers to inherit; richer eggs cost more and start the young fuller; without the rule the gene is ignored', () => {
  const G = A.genome, mk = y => { const g = G.primordial(1); g.yolk = y; return g; };
  const w = new A.engine.World({ seed: 3, founders: 0, invest: 1, budget: 1 }), lean = w.spawn(mk(0.1), 20, 20, 1, null), rich = w.spawn(mk(1.5), 60, 20, 1, null), plain = w.spawn(G.primordial(1), 100, 20, 1, null);
  assert.ok(lean.eggCost < plain.eggCost && plain.eggCost < rich.eggCost, [lean.eggCost, plain.eggCost, rich.eggCost].join(' < '));
  const off = new A.engine.World({ seed: 3, founders: 0, budget: 1 }), o2 = off.spawn(mk(1.5), 60, 20, 1, null), p2 = off.spawn(G.primordial(1), 100, 20, 1, null); assert.strictEqual(o2.eggCost, p2.eggCost, 'no rule: the gene does nothing');
  // an egg of each: the young of the rich mother starts with more (what it cannot hold goes to its growth), and nothing is created
  const lay = m => { m.E = m.prof.Emax; m.egg = m.eggCost; const before = w.bodies.length; let kid = null; for (let i = 0; i < 300 && !kid; i++) { w.step(); m.E = m.prof.Emax; kid = w.bodies.find(o => o.parent === m.id); } return kid; };
  const w2 = Object.assign(w, { mutation: 0 }), kl = lay(lean), kr = lay(rich); assert.ok(kl && kr, 'both laid');
  assert.ok(kr.E + kr.grow > kl.E + kl.grow, 'the richer egg gives more: ' + (kr.E + kr.grow) + ' > ' + (kl.E + kl.grow));
  // the gene mutates only where the rule is on, and stays in range
  const r = G.rng(9); let g = mk(0.5), moved = false; for (let i = 0; i < 300; i++) { g = G.mutate(g, r, 1, 'i'); if (g.yolk !== 0.5) moved = true; assert.ok(g.yolk >= 0.05 && g.yolk <= 3); } assert.ok(moved);
  let h = G.primordial(1); for (let i = 0; i < 100; i++) h = G.mutate(h, r, 1, 'gxv'); assert.strictEqual(h.yolk, undefined, 'never appears in a world without the rule');
});

test('learn: a connection used together with its neuron grows by its heritable rate, only while its gate is active, fades when unused; not without the rule; saved, carried through growth, mutated only where the rule is on', () => {
  const G = A.genome, N = A.neural, dt = 1 / 30, taste = new Float64Array(8).fill(0.5);
  const one = nn => { const g = G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3, beat: -1, nerve: 0.5 })], links: [] }); g.parts[0].nn = nn; return g; };
  const run = (nn, learn, hunger, steps) => { const b = P.build(develop(one(nn))); for (let i = 0; i < (steps || 300); i++) N.local(b, taste, hunger || 0, null, null, false, false, learn); return b.segs[0]; };
  // a constant input, a positive bias: input and neuron are active together
  const grow = run([{ b: 0.5, k: 1, in: [['1', 0.2, 0.5]], out: [['C', 0.5]] }], dt), fixed = run([{ b: 0.5, k: 1, in: [['1', 0.2, 0.5]], out: [['C', 0.5]] }], 0), none = run([{ b: 0.5, k: 1, in: [['1', 0.2]], out: [['C', 0.5]] }], dt);
  assert.ok(grow.nw[0] > 1, 'acquired strength: ' + grow.nw[0]); assert.ok(grow.na[0] > fixed.na[0] + 0.1, 'and the neuron answers more strongly: ' + grow.na[0] + ' > ' + fixed.na[0]);
  assert.strictEqual(fixed.nw, undefined, 'no rule: nothing is acquired'); assert.ok(!none.nw, 'a connection with rate 0 stays as its genes made it'); assert.strictEqual(none.na[0], fixed.na[0]);
  const shrink = run([{ b: 0.5, k: 1, in: [['1', 0.2, -0.5]], out: [['C', 0.5]] }], dt); assert.ok(shrink.nw[0] < -0.2, 'a negative rate weakens what is used: ' + shrink.nw[0]);
  // gated by hunger (the neuron's second input, with no strength of its own): fed, nothing changes; hungry, it does
  const gated = [{ b: 0.5, k: 1, in: [['1', 0.2, 0.5], ['h', 0]], out: [['C', 0.5]], m: 1 }], fed = run(gated, dt, 0), hungry = run(gated, dt, 1);
  assert.strictEqual(fed.nw[0], 0, 'gate shut'); assert.ok(hungry.nw[0] > 1, 'gate open: ' + hungry.nw[0]);
  // what was acquired fades when the neuron falls silent
  { const b = P.build(develop(one([{ b: 0, k: 1, in: [['h', 3, 0.5]], out: [['C', 0.5]] }]))); for (let i = 0; i < 300; i++) N.local(b, taste, 1, null, null, false, false, dt); const top = b.segs[0].nw[0]; for (let i = 0; i < 3000; i++) N.local(b, taste, 0, null, null, false, false, dt); assert.ok(top > 0.5 && b.segs[0].nw[0] < top * 0.7, 'fades: ' + top + ' -> ' + b.segs[0].nw[0]); }
  // genes: kept by sanitize, changed only with the flag, the gate follows its input when another is removed
  const s = G.sanitize(one([{ b: 0, k: 1, in: [['c', 1, 0.3], ['h', 1, 9], ['o', 1, 0]], out: [['C', 1]], m: 1 }])).parts[0].nn[0]; assert.deepStrictEqual(s.in, [['c', 1, 0.3], ['h', 1, 1], ['o', 1]]); assert.strictEqual(s.m, 1);
  assert.strictEqual(G.sanitize(one([{ b: 0, k: 1, in: [['c', 1]], out: [], m: 4 }])).parts[0].nn[0].m, undefined, 'a gate that points nowhere is dropped');
  const r = G.rng(4); let a = one([{ b: 0, k: 1, in: [['c', 1], ['h', 1]], out: [['C', 1]] }]), bb = G.copy(a), rates = 0, plain = 0;
  for (let i = 0; i < 300; i++) { a = G.mutate(a, r, 1, 'nl'); if (a.parts[0].nn && a.parts[0].nn.some(q => q.in.some(e => e[2]) || q.m != null)) rates++; bb = G.mutate(bb, r, 1, 'n'); if (bb.parts[0].nn && bb.parts[0].nn.some(q => q.in.some(e => e.length > 2) || q.m != null)) plain++; }
  assert.ok(rates > 50, 'rates and gates arise by mutation where the rule is on: ' + rates); assert.strictEqual(plain, 0, 'and never where it is off');
  // in a world: acquired strengths are saved exactly and kept when the body is rebuilt for growth; a world without the rule ignores the genes
  const mk = learn => { const w = new A.engine.World({ seed: 6, founders: 0, nerve2: 1, learn, carry: 1 }); const g = one([{ b: 0.5, k: 1, in: [['1', 0.2, 0.5]], out: [['C', 0.5]] }]); const o = w.spawn(g, 40, 30, 1, null); for (let i = 0; i < 200; i++) w.step(); return { w, o }; };
  const on = mk(1), off = mk(0); assert.ok(on.o.b.segs[0].nw && on.o.b.segs[0].nw[0] > 0.5, 'learned in the world'); assert.ok(!off.o.b.segs[0].nw, 'not without the rule');
  const copy = A.engine.World.restore(JSON.parse(JSON.stringify(on.w.save()))); assert.strictEqual(copy.bodies[0].b.segs[0].nw[0], on.o.b.segs[0].nw[0]); for (let i = 0; i < 60; i++) { on.w.step(); copy.step(); } assert.strictEqual(copy.bodies[0].cx, on.w.bodies[0].cx, 'continues exactly');
  const had = on.o.b.segs[0].nw[0]; on.w.form(on.o, on.o.cx, on.o.cy, 0); assert.strictEqual(on.o.b.segs[0].nw[0], had, 'kept through rebuilding');
});

test('wave: richness travels along the world; every place gets the same supply over a period; the total that falls is not changed; grains fall where the water is rich', () => {
  const mk = (map, wave) => new A.engine.World({ seed: 8, founders: 0, map, wave, audit: 1 });
  for (const map of ['', 'coast']) {
    const w = mk(map, 600), flat = mk(map, 0);
    // the wave fits the world, averages to 1 along it, and at one place over one period
    let sx = 0; for (let i = 0; i < 1000; i++) sx += w.waveAt(i / 1000 * w.W); assert.ok(Math.abs(sx / 1000 - 1) < 1e-9, 'mean along the world ' + sx / 1000);
    assert.ok(Math.abs(w.waveAt(0) - w.waveAt(w.W)) < 1e-9, 'no seam'); let st = 0; const t0 = w.t; for (let i = 0; i < 600; i++) { w.t = t0 + i; st += w.waveAt(37); } w.t = t0; assert.ok(Math.abs(st / 600 - 1) < 1e-9, 'mean over a period ' + st / 600);
    for (let i = 0; i < 30 * 120; i++) { w.step(); flat.step(); }
    // what fell is the same amount (to within the last grain), but it fell where the water was rich
    assert.ok(Math.abs(w.ledger.rain - flat.ledger.rain) < 0.02 * flat.ledger.rain, map + ' rain ' + w.ledger.rain + ' / ' + flat.ledger.rain);
    let rich = 0, lean = 0; const n0 = w.food.length; w.food.length = 0; for (let i = 0; i < 30; i++) w.step(); for (const f of w.food) { if (w.waveAt(f.x) > 1) rich += f.e; else lean += f.e; }
    assert.ok(rich > 1.25 * lean && rich > 0, map + ' new grains in rich water ' + rich.toFixed(1) + ', in lean ' + lean.toFixed(1)); // (where grains fall in drifting patches, they can only follow the wave as far as the patches happen to lie)
    // dissolved food: richer near the crest than near the trough
    let a = 0, b = 0, na = 0, nb = 0; for (let x = 0; x < w.cols; x++) { const f = w.waveAt((x + 0.5) * w.cell); for (let y = 0; y < w.rows; y++) { const v = w.nut[y * w.cols + x] / (w.hRegrow ? Math.max(0.05, w.hRegrow[y * w.cols + x]) : 1); if (f > 1.5) { a += v; na++; } else if (f < 0.5) { b += v; nb++; } } }
    assert.ok(na > 0 && nb > 0, 'both rich and lean water exist');
  }
  const w = mk('coast', 0); w.enable({ wave: 900 }); assert.strictEqual(w.wave, 900); assert.ok(/豊かさの波/.test(w.events[w.events.length - 1].text));
});

test('sound: it spreads, fades and adds up; low pitch carries further; ears hear by place and tuning; a voice costs energy; bodies cannot help making sound; controls cut ears and voices; saved exactly; genes only where sound exists', () => {
  const G = A.genome, W = o => new A.engine.World(Object.assign({ seed: 9, founders: 0, cap: 0, sound: 1, nerve2: 1, flow: 0, grainRate: 0, bottomRate: 0, jitter: 0 }, o || {}));
  const level = (w, x, y, b) => (b == null ? w.snd.reduce((a, f) => a + w.nutAt(x, y, f), 0) : w.nutAt(x, y, w.snd[b]));
  // physics of the field: the same water with nothing, with one source, with another, with both
  const run = f => { const w = W(); for (let i = 0; i < 90; i++) { f(w); w.step(); } return w; };
  const none = run(() => {}), lo = run(w => w.emit(40, 40, 0, 0.1, 'voice')), hi = run(w => w.emit(40, 40, 1, 0.1, 'voice')), both = run(w => { w.emit(40, 40, 0, 0.1, 'voice'); w.emit(40, 40, 1, 0.1, 'voice'); });
  const net = (w, d) => level(w, 40 + d, 40) - level(none, 40 + d, 40);
  assert.ok(net(lo, 0) > net(lo, 8) && net(lo, 8) > net(lo, 24) && net(lo, 24) > 0, 'louder near the source: ' + [0, 8, 24].map(d => net(lo, d).toFixed(4)));
  assert.ok(net(lo, 16) > 3 * net(hi, 16) && net(hi, 0) > 10 * net(hi, 16), 'low pitch carries further than high: ' + net(lo, 16).toFixed(4) + ' / ' + net(hi, 16).toFixed(4));
  for (const d of [0, 6, 20]) assert.ok(Math.abs(net(both, d) - net(lo, d) - net(hi, d)) < 1e-4 * (1 + net(both, d)), 'sounds add up at ' + d);
  for (let i = 0; i < 150; i++) { lo.step(); none.step(); } assert.ok(net(lo, 0) < 0.25 * 0.4 && net(lo, 0) >= -1e-6, 'and it fades once the source is silent: ' + net(lo, 0));
  assert.ok(level(none, 100, 30) > 0, 'the water itself is not silent');
  // a body with a voice driven by a neuron, and a listener with one ear near and one far, tuned low
  const speaker = pitch => { const g = G.create({ parts: [G.part({ len: 0.8, r0: 0.4, r1: 0.4, nerve: 0.5, voice: 0.3, pitch })], links: [] }); g.parts[0].nn = [{ b: 0, k: 1, in: [['1', 3]], out: [['V', 1]] }]; return g; };
  const listener = tune => G.create({ parts: [G.part({ len: 1, r0: 0.4, r1: 0.4, nerve: 0.5 }), G.part({ len: 3, r0: 0.2, r1: 0.2, nerve: 0.5, ear: 0.6, hTune: tune, hWide: 0.2, hE: 2 })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.5, off: 1, angle: 1.5, scale: 1, repeat: 1 })] });
  const scene = (o, pitch, tune) => { const w = W(Object.assign({ audit: 1 }, o)), s = w.spawn(speaker(pitch), 40, 34, 1, null), l = w.spawn(listener(tune), 40, 40, 1, null); for (const k in w.ledger) w.ledger[k] = 0; const s0 = w.stored(); for (let i = 0; i < 120; i++) { w.step(); l.E = l.prof.Emax * 0.9; } return { w, s, l, s0 }; };
  const a = scene({}, 0, 0), ears = a.l.b.segs.filter(q => q.earW), near = ears.reduce((m, q) => (q.e > m.e ? q : m)), far = ears.reduce((m, q) => (q.e < m.e ? q : m));
  assert.strictEqual(ears.length, 2); assert.ok(near.e > far.e * 1.05 && Math.hypot(near.bx - a.s.cx, near.by - a.s.cy) < Math.hypot(far.bx - a.s.cx, far.by - a.s.cy), 'the ear nearer the voice hears more: ' + near.e.toFixed(3) + ' / ' + far.e.toFixed(3));
  assert.ok(a.l.b.hd > 0.05, 'what it hears pushes on its circuit: ' + a.l.b.hd); assert.ok(a.s.voE > 0 && a.s.voOn && a.w.aco.out.voice > 0 && a.w.ledger.sound > 0, 'the voice sounds and is paid for');
  const mis = scene({}, 1, 0); assert.ok(mis.l.b.segs.filter(q => q.earW)[0].e < 0.3 * near.e, 'an ear tuned low hardly hears a high voice: ' + mis.l.b.segs.filter(q => q.earW)[0].e + ' / ' + near.e);
  const deaf = scene({ deaf: 1 }, 0, 0); assert.ok(deaf.l.b.segs.filter(q => q.earW).every(q => q.e === 0) && !(deaf.l.b.hd > 0), 'deaf world: ears read nothing');
  const mute = scene({ mute: 1 }, 0, 0); assert.ok(!(mute.s.voE > 0) && mute.w.aco.out.voice === 0 && !mute.w.ledger.sound, 'mute world: no voice, no cost');
  const lag = scene({ soundLag: 2 }, 0, 0); assert.ok(lag.w.sndPast && lag.l.b.segs.filter(q => q.earW)[0].e > 0, 'lagged world: ears read the water of two seconds ago');
  // the ledger still balances with voices sounding
  { const w = W({ audit: 1 }); w.spawn(speaker(0.5), 40, 34, 1, null); for (const k in w.ledger) w.ledger[k] = 0; const s0 = w.stored(); for (let i = 0; i < 90; i++) w.step(); const L = w.ledger, IN = ['rain', 'regrow', 'placed', 'mutation', 'recycled', 'arrived'], inflow = IN.reduce((x, k) => x + (L[k] || 0), 0), out = Object.keys(L).filter(k => !IN.includes(k)).reduce((x, k) => x + L[k], 0), gap = (w.stored() - s0) - (inflow - out); assert.ok(L.sound > 0 && Math.abs(gap) < 1e-6 * (1 + w.stored()), 'unexplained ' + gap + ' with sound spent ' + L.sound); }
  // saved and continued exactly
  const copy = A.engine.World.restore(JSON.parse(JSON.stringify(a.w.save()))); for (let i = 0; i < 60; i++) { a.w.step(); copy.step(); }
  assert.strictEqual(JSON.stringify(copy.bodies.map(o => [o.cx, o.E, o.b.segs.map(q => q.e)])), JSON.stringify(a.w.bodies.map(o => [o.cx, o.E, o.b.segs.map(q => q.e)])), 'a world with sound saves and continues exactly'); assert.strictEqual(copy.snd[0][1234], a.w.snd[0][1234]);
  // sounds a body cannot help making: beating cilia, pushing on another body
  { const w = W({ contact: 1 }), g = G.primordial(1); Object.assign(g.parts[0], { cilia: 0.5, beat: -1, nerve: 0.5 }); w.spawn(g, 30, 30, 1, null); w.spawn(g, 30.4, 30, 1, null); for (let i = 0; i < 60; i++) w.step(); assert.ok(w.aco.out.cilia > 0 && w.aco.out.hit > 0 && w.aco.out.voice === 0, JSON.stringify(w.aco.out)); }
  // no sound, nothing: a world without the rule has no fields and its bodies no ears
  { const w = new A.engine.World({ seed: 9, founders: 0, cap: 0, nerve2: 1 }), l = w.spawn(listener(0), 40, 40, 1, null); for (let i = 0; i < 30; i++) w.step(); assert.ok(!w.snd && !l.b.hasEar && l.b.segs.every(q => q.e == null)); w.enable({ sound: 1 }); for (let i = 0; i < 30; i++) w.step(); assert.ok(w.snd && l.b.hasEar && l.b.segs.some(q => q.e > 0), 'switched on in a running world'); }
  // genes of sound arise by mutation only where sound exists; mixing leaves them alone elsewhere
  const r = G.rng(7); let on = G.primordial(1), off = G.primordial(1), gotE = false, gotV = false, codes = false; for (let i = 0; i < 400; i++) { on = G.mutate(on, r, 1, 'ns'); off = G.mutate(off, r, 1, 'nlgxvc'); const p = on.parts[0]; if (p.ear > 0) gotE = true; if (p.voice > 0) gotV = true; if (on.parts.some(q => (q.nn || []).some(n => n.in.some(e => e[0] === 'e') || n.out.some(e => e[0] === 'V' || e[0] === 'Q')))) codes = true; }
  assert.ok(gotE && gotV && codes, 'ears, voices and their neuron connections arise: ' + [gotE, gotV, codes]); assert.ok(off.parts.every(p => p.ear === 0 && p.voice === 0 && p.hE === 0 && p.mVoice === 0 && !(p.nn || []).some(n => n.in.some(e => e[0] === 'e') || n.out.some(e => 'VQ'.includes(e[0])))), 'and never where sound does not exist');
  const m1 = G.ensureIds(G.primordial(1)), m2 = G.copy(m1); m2.parts[0].ear = 0.9; m2.parts[0].len = 0.9; let leaked = 0; for (let i = 0; i < 100; i++) if (G.recombine(m1, m2, r).parts[0].ear !== 0) leaked++; assert.strictEqual(leaked, 0, 'mixing in a world without sound does not touch the genes of sound');
});
