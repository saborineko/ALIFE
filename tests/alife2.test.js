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
