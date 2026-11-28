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
  // moved to another map, a world's sound fields are those of the new map
  { const w = new A.engine.World({ seed: 3, sound: 1, nerve2: 1 }); w.seedWith(G.primordial(3)); for (let i = 0; i < 60; i++) w.step(); const c = A.engine.World.transplant(w, 'coast'); for (let i = 0; i < 30; i++) c.step(); assert.strictEqual(c.snd[0].length, c.cols * c.rows); assert.ok(Number.isFinite(c.census().loudness)); }
  // genes of sound arise by mutation only where sound exists; mixing leaves them alone elsewhere
  const r = G.rng(7); let on = G.primordial(1), off = G.primordial(1), gotE = false, gotV = false, codes = false; for (let i = 0; i < 400; i++) { on = G.mutate(on, r, 1, 'ns'); off = G.mutate(off, r, 1, 'nlgxvc'); const p = on.parts[0]; if (p.ear > 0) gotE = true; if (p.voice > 0) gotV = true; if (on.parts.some(q => (q.nn || []).some(n => n.in.some(e => e[0] === 'e') || n.out.some(e => e[0] === 'V' || e[0] === 'Q')))) codes = true; }
  assert.ok(gotE && gotV && codes, 'ears, voices and their neuron connections arise: ' + [gotE, gotV, codes]); assert.ok(off.parts.every(p => p.ear === 0 && p.voice === 0 && p.hE === 0 && p.mVoice === 0 && !(p.nn || []).some(n => n.in.some(e => e[0] === 'e') || n.out.some(e => 'VQ'.includes(e[0])))), 'and never where sound does not exist');
  const m1 = G.ensureIds(G.primordial(1)), m2 = G.copy(m1); m2.parts[0].ear = 0.9; m2.parts[0].len = 0.9; let leaked = 0; for (let i = 0; i < 100; i++) if (G.recombine(m1, m2, r).parts[0].ear !== 0) leaked++; assert.strictEqual(leaked, 0, 'mixing in a world without sound does not touch the genes of sound');
});
test('mutation frequency and width as two genes (mutsplit): changes of plan follow the frequency alone; both genes drift at every birth; a lineage from the one-gene rule keeps its width; off by default', () => {
  const G = A.genome, r = G.rng(11), base = G.mutate(G.mutate(G.primordial(1), r, 1, 'gn'), r, 1, 'gn');
  const sig = g => JSON.stringify([g.parts.length, g.links.map(l => [l.from, l.to, l.repeat, l.sym, l.n]), g.parts.map(p => [p.next, p.span, (p.nn || []).map(q => [q.in.map(e => e[0]).join(''), q.out.map(e => e[0]).join(''), q.m])])]);
  const rate = (strength, structural) => { let ch = 0, step = 0; const N = 6000; for (let i = 0; i < N; i++) { const g = G.mutate(base, r, strength, 'gn', structural); if (sig(g) !== sig(base)) ch++; step += Math.abs(g.hue - base.hue); } return [ch / N, step / N]; };
  const full = rate(1), one = rate(0.1), two = rate(0.1, 1);
  assert.ok(one[0] < 0.2 * full[0], 'one gene at 0.1: the plan changes a tenth as often within a mutation (and a birth mutates a tenth as often: a hundredth in all): ' + one[0] + ' / ' + full[0]);
  assert.ok(Math.abs(two[0] - full[0]) < 0.15 * full[0], 'two genes, width 0.1: the plan changes as often as at full width: ' + two[0] + ' / ' + full[0]);
  assert.ok(two[1] < 0.2 * full[1] && Math.abs(two[1] - one[1]) < 0.2 * one[1], 'and the steps are a tenth as wide: ' + [full[1], one[1], two[1]]);
  assert.strictEqual(new A.engine.World({ seed: 3, founders: 0, cap: 0 }).mutsplit, 0);
  // in a world: founders that carry strength 0.5 from the one-gene rule
  const w = new A.engine.World({ seed: 5, mutsplit: 1 }), g0 = G.primordial(5); g0.mut = 0.5; w.seedWith(g0);
  for (let i = 0; i < 6000 && w.counts.births < 400; i++) w.step();
  const born = w.bodies.filter(o => o.gen > 0), f = born.map(o => (o.g.mut == null ? 1 : o.g.mut)), wd = born.map(o => (o.g.mutW == null ? (o.g.mut == null ? 1 : o.g.mut) : o.g.mutW)), mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(born.length > 50, 'births: ' + born.length);
  assert.ok(mean(f) > 0.35 && mean(f) < 0.7 && mean(wd) > 0.35 && mean(wd) < 0.7, 'they start from the strength they had: ' + mean(f) + ', ' + mean(wd));
  assert.ok(born.some(o => o.g.mutW != null && Math.abs(o.g.mutW - (o.g.mut == null ? 1 : o.g.mut)) > 0.02), 'and the two genes go their own ways');
  const still = born.filter(o => !(o.g.mutations > 0)); assert.ok(still.length === 0 || still.some(o => o.g.mut !== 0.5 || o.g.mutW != null) || still.length < 5, 'they drift also at births that do not mutate');
  const c = w.census(); assert.ok(Number.isFinite(c.mutGene) && Number.isFinite(c.mutWidth));
});

test('keep: a body rebuilt for growth, moved to another island or to another map keeps what its nerves hold; growth keeps its motion; off by default', () => {
  const G = A.genome, W = o => new A.engine.World(Object.assign({ seed: 7, founders: 0, cap: 0, sound: 1, soundWork: 1, nerve2: 1, blind: 1, learn: 1 }, o || {}));
  assert.strictEqual(W().keep, 0);
  const body = () => { const g = G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3, beat: 1, nerve: 0.5, mouth: 0.6, gut: 0.5, gonad: 0.3 }), G.part({ len: 0.5, r0: 0.25, r1: 0.2, nerve: 0.5, ear: 0.6, hTune: 0.36, hWide: 0.15, adapt: 1 })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 })] });
    g.parts[0].nn = [{ b: 0, k: 1, in: [['g', 4]], out: [] }]; g.parts[1].nn = [{ b: 0.3, k: 1, in: [['e', 0, 0.8], ['p0', 0]], out: [], m: 1 }, { b: 0.2, k: 0.3, in: [['s0', 1]], out: [] }]; g.birth = 0.3; return g; };
  // growth: bring a young body to the stage where it has its ears, give it something to remember, and let it grow once more
  const grow = opt => { const w = W(opt), o = w.spawn(body(), 80, 30, 0.3, null); let steps = 0; for (let i = 0; i < 30 * 600 && steps < 1; i++) { const st = o.stage; o.E = o.prof.Emax * 0.95; w.step(); if (o.stage !== st && o.b.segs.some(q => q.earW)) steps++; }
    for (let i = 0; i < 90; i++) { w.step(); o.E = o.prof.Emax * 0.5; } const ears = o.b.segs.filter(q => q.earW); for (const q of ears) { q.nw[0] = -0.8; q.na[1] = 0.33; }
    let before = null; for (let i = 0; i < 30 * 600; i++) { const st = o.stage, snap = { nw: ears.map(q => q.nw[0]), nE: ears.map(q => q.nE), v: Math.hypot(o.b.vx[0], o.b.vy[0]), t: o.b.t }; o.E = o.prof.Emax * 0.95; w.step(); if (o.stage !== st) { before = snap; break; } }
    const now = o.b.segs.filter(q => q.earW); return { before, nw: now.map(q => (q.nw ? q.nw[0] : null)), nE: now.map(q => q.nE), v: Math.hypot(o.b.vx[0], o.b.vy[0]), na: now.map(q => (q.na ? q.na[1] : null)) }; };
  const lost = grow({}), carried = grow({ carry: 1 }), kept = grow({ keep: 1 });
  assert.ok(lost.before && lost.before.nw.every(v => v < -0.3) && lost.nw.every(v => v == null), 'as first built: what was acquired is gone after growth: ' + JSON.stringify(lost.nw)); assert.ok(lost.v === 0 && lost.before.v > 0.05, 'and the body stands still: ' + lost.before.v + ' -> ' + lost.v);
  assert.ok(carried.nw.every(v => v < -0.3) && carried.nE.every(v => v == null) && carried.v === 0, 'carry: connections stay, but what the ears had adapted to is gone and the body stands still: ' + JSON.stringify([carried.nw, carried.nE, carried.v]));
  assert.ok(kept.nw.every((v, i) => Math.abs(v - kept.before.nw[i]) < 0.02) && kept.nE.every((v, i) => v != null && Math.abs(v - kept.before.nE[i]) < 0.5 * kept.before.nE[i] + 1e-4), 'keep: connections and what the ears had adapted to stay: ' + JSON.stringify([kept.before.nw, kept.nw, kept.before.nE, kept.nE]));
  assert.ok(kept.v > 0.5 * kept.before.v && kept.before.v > 0.05, 'and it keeps moving: ' + kept.before.v + ' -> ' + kept.v);
  // another island, another map
  const mk = opt => { const w = W(Object.assign({ map: 'coast' }, opt)); const L = [0, 1, 2].map(i => w.spawn(body(), 80 + i * 6, 30, 1, null)); for (let i = 0; i < 60; i++) { w.step(); for (const o of L) o.E = o.prof.Emax * 0.5; } for (const o of L) for (const q of o.b.segs) if (q.nw) q.nw[0] = -0.8; return { w, L }; };
  for (const keep of [0, 1]) { const a = mk({ keep }), b = W({ map: 'coast', keep }), out = a.w.emigrate(1), got = b.immigrate(out, 0)[0], nw = got.b.segs.filter(q => q.earW).map(q => (q.nw ? q.nw[0] : 0));
    assert.ok(keep ? nw.every(v => v === -0.8) : nw.every(v => v === 0), (keep ? 'keep: it arrives with what it knew: ' : 'as first built it arrives knowing nothing: ') + JSON.stringify(nw));
    const c = mk({ keep }), id = c.L[0].id, moved = A.engine.World.transplant(c.w, ''), o2 = moved.bodies.find(q => q.id === id), nw2 = o2.b.segs.filter(q => q.earW).map(q => (q.nw ? q.nw[0] : 0));
    assert.ok(keep ? nw2.every(v => v === -0.8) : nw2.every(v => v === 0), 'another map, keep=' + keep + ': ' + JSON.stringify(nw2)); assert.strictEqual(moved.keep, keep); }
  // a world with keep saves and continues exactly
  { const w = W({ keep: 1, carry: 1 }); w.seedWith(G.primordial(5)); for (let i = 0; i < 600; i++) w.step(); const c = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); for (let i = 0; i < 300; i++) { w.step(); c.step(); }
    assert.strictEqual(JSON.stringify(c.bodies.map(o => [o.cx, o.cy, o.E])), JSON.stringify(w.bodies.map(o => [o.cx, o.cy, o.E]))); }
});

test('wire: neurons with names. Removing a neuron leaves every other connection reading what it read; a new connection is made to a neuron that exists; old genomes keep their wiring', () => {
  const G = A.genome, NAME = '0123456789abcdefghijklmnopqrstuvwxyz';
  const designed = () => { const g = G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3, beat: -1, nerve: 0.5, mouth: 0.6, gut: 0.5 }), G.part({ len: 0.5, r0: 0.25, r1: 0.2, cilia: 0.6, beat: -1, nerve: 0.5, eye: 0.5 })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 })] }); g.parts[0].nn = [{ b: 0, k: 1, in: [['g', 4]], out: [] }];
    g.parts[1].nn = [{ b: -2, k: 1, in: [['v', 1], ['p0', 0.5]], out: [] }, { b: 0, k: 1, in: [['s0', 3], ['m1', -2]], out: [['C', -1]] }, { b: 2, k: 1, in: [['s1', 1], ['s0', 1]], out: [['T', 0.5]] }]; return g; };
  const who = q => (q.b < -1 ? 0 : q.b > 1 ? 2 : 1); // the three neurons are told apart by their resting levels
  const audit = flags => { const r = G.rng(5); let moved = 0, lost = 0, fresh = 0, dead = 0, del = 0; for (let rep = 0; rep < 6000; rep++) { const g = designed(), m = G.mutate(g, r, 1, flags), a = g.parts[1].nn, b = m.parts[1].nn || []; if (b.length < a.length) del++;
      const named = b.some(q => q.id != null), at = c => { const id = NAME.indexOf(c); return named ? b.find(q => q.id === id) || null : id < b.length ? b[id] : null; };
      for (const q of b) { const was = a[who(q)]; for (const e of q.in) { if (e[0].length !== 2 || !(e[0][0] === 's' || e[0][0] === 'm')) continue; const old = was.in.find(x => x[0] === e[0] && x[1] === e[1]);
        if (!old) { if (!was.in.some(x => x[0] === e[0])) { fresh++; if (!at(e[0][1])) dead++; } continue; } const t = at(e[0][1]); if (!t) lost++; else if (who(t) !== +old[0][1]) moved++; } } } return { moved, lost, fresh, dead, del }; };
  const places = audit('vnl'), names = audit('vnlw');
  assert.ok(places.del > 50 && names.del > 50, 'neurons are removed in both: ' + places.del + ', ' + names.del);
  assert.ok(places.moved > 50, 'counting places: untouched connections come to read another neuron: ' + places.moved); assert.strictEqual(names.moved, 0, 'with names none does');
  assert.ok(names.lost > 20 && places.lost === 0, 'with names a connection whose neuron is gone reads nothing: ' + names.lost);
  assert.ok(places.dead > 0.15 * places.fresh && names.dead < 0.02 * names.fresh, 'new connections born reading nothing: ' + places.dead + '/' + places.fresh + ' counting places, ' + names.dead + '/' + names.fresh + ' with names');
  // the same circuit runs the same before and after names are given out; and a connection finds its neuron wherever it stands in the list
  const run = g => { const b = A.physics.build(A.development.develop(g, { stage: 1 }), { x: 0, y: 0 }); for (const q of b.segs) q.v = 0.4; let out = []; for (let i = 0; i < 40; i++) { A.neural.local(b, b.segs.map(() => 0.2), 0.3, null, null, true, false, false, false); A.physics.step(b, 1 / 30); out = b.segs.map(q => (q.na ? Array.from(q.na) : [])); } return JSON.stringify(out); };
  const g0 = designed(), g1 = G.copy(g0); g1.parts.forEach(p => (p.nn || []).forEach((q, i) => { q.id = i; })); assert.strictEqual(run(G.copy(g1)), run(g0), 'names given by place: the same circuit');
  const g2 = G.copy(g1), nn = g2.parts[1].nn; g2.parts[1].nn = [nn[2], nn[0], nn[1]]; const order = r => JSON.parse(r).map(a => (a.length === 3 ? [a[1], a[2], a[0]] : a)); assert.strictEqual(JSON.stringify(order(run(G.copy(g2)))), run(g0), 'the list in another order: still the same circuit');
  // in a world: off by default; with it, genomes get names when they mutate and the world saves and continues exactly
  assert.strictEqual(new A.engine.World({ seed: 3, founders: 0, cap: 0 }).wire, 0);
  { const w = new A.engine.World({ seed: 5, nerve2: 1, wire: 1 }); w.seedWith(G.primordial(5)); for (let i = 0; i < 3000; i++) w.step(); const withN = w.bodies.filter(o => o.g.parts.some(p => p.nn)); assert.ok(withN.length > 0 && withN.every(o => o.g.parts.every(p => (p.nn || []).every(q => Number.isInteger(q.id)))), 'neurons that arise have names: ' + withN.length);
    const c = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); for (let i = 0; i < 300; i++) { w.step(); c.step(); } assert.strictEqual(JSON.stringify(c.bodies.map(o => [o.cx, o.E])), JSON.stringify(w.bodies.map(o => [o.cx, o.E]))); }
});

test('cast: how far from itself a body lays its eggs is a gene; it starts at 0, changes only where the rule holds, and is drawn in mixing only there; off by default', () => {
  const G = A.genome, r = G.rng(3), base = G.primordial(1);
  let moved = 0; for (let i = 0; i < 400; i++) { const m = G.mutate(base, r, 1, 'gn'); if (m.cast != null) moved++; } assert.strictEqual(moved, 0, 'without the rule no genome gets the gene');
  let got = 0, far = 0; for (let i = 0; i < 400; i++) { const m = G.mutate(base, r, 1, 'gnd'); if (m.cast != null) { got++; assert.ok(m.cast >= 0 && m.cast <= 40); if (m.cast > 0) far++; } } assert.ok(got > 40 && far > 10, 'with it the gene appears and moves: ' + got + ', ' + far);
  // mixing: the same random numbers as before unless the rule holds
  { const a = G.primordial(1), b = Object.assign(G.primordial(2), { cast: 9 }), r1 = G.rng(8), r2 = G.rng(8); const x = G.recombine(a, b, r1, false), y = G.recombine(a, b, r2, false, 0); assert.strictEqual(JSON.stringify(x), JSON.stringify(y)); assert.strictEqual(r1(), r2());
    let took = 0; const r3 = G.rng(9); for (let i = 0; i < 200; i++) if (G.recombine(a, b, r3, false, 1).cast === 9) took++; assert.ok(took > 60 && took < 140, 'where the rule holds, the gene comes from either parent: ' + took); }
  assert.strictEqual(new A.engine.World({ seed: 3, founders: 0, cap: 0 }).cast, 0);
  // in a world: eggs of a mother with the gene land far from her; without the rule, or without the gene, beside her
  const lay = (opt, cast) => { const w = new A.engine.World(Object.assign({ seed: 5, founders: 0, mutation: 0 }, opt)), g = G.primordial(5); if (cast != null) g.cast = cast; const m = w.spawn(g, 80, 50, 1, null), d = [];
    for (let i = 0; i < 3000 && d.length < 12; i++) { const n = w.bodies.length; m.E = m.prof.Emax; m.egg = m.eggCost; w.step(); for (const o of w.bodies.slice(n)) if (o.parent === m.id) { let dx = Math.abs(o.sx - m.cx); if (dx > w.W / 2) dx = w.W - dx; d.push(Math.hypot(dx, o.sy - m.cy)); } } return d; };
  const beside = lay({ cast: 1 }, null), far2 = lay({ cast: 1 }, 20), off = lay({}, 20);
  assert.ok(beside.length >= 8 && beside.every(x => x < 3), 'no gene: beside the mother: ' + beside.map(x => x.toFixed(1))); assert.ok(far2.length >= 8 && far2.every(x => x > 15 && x < 26), 'gene 20: about twenty units further: ' + far2.map(x => x.toFixed(1)));
  assert.ok(off.every(x => x < 3), 'the gene does nothing in a world without the rule: ' + off.map(x => x.toFixed(1)));
  // a world with the rule evolves, saves and continues exactly; switching it on is logged
  { const w = new A.engine.World({ seed: 5, cast: 1 }); w.seedWith(G.primordial(5)); for (let i = 0; i < 3000; i++) w.step(); const c = w.census(); assert.ok(Number.isFinite(c.castGene) && w.bodies.some(o => o.g.cast > 0), 'the gene arises: ' + c.castGene);
    const v = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); assert.strictEqual(v.cast, 1); for (let i = 0; i < 300; i++) { w.step(); v.step(); } assert.strictEqual(JSON.stringify(v.bodies.map(o => [o.cx, o.E])), JSON.stringify(w.bodies.map(o => [o.cx, o.E])));
    const u = new A.engine.World({ seed: 3, founders: 0, cap: 0 }); u.enable({ cast: 1 }); assert.ok(u.cast === 1 && /卵を親からどれだけ離して/.test(u.events[u.events.length - 1].text)); }
});

test('pair: the two segments of a left-right pair appear at the same stage of growth; the grown body is the same; off by default; switched in a running world', () => {
  const G = A.genome, g = G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3 }), G.part({ len: 0.5, r0: 0.25, r1: 0.2, eye: 0.5, cilia: 0.4 })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 })] });
  const eyes = (st, pair) => A.development.develop(g, { stage: st, pair }).segs.filter(q => q.p.eye > 0.1).length;
  assert.deepStrictEqual([0.3, 0.44, 0.58, 0.72, 1].map(st => eyes(st, 0)), [0, 1, 1, 2, 2], 'each in its turn: one eye for two stages');
  assert.deepStrictEqual([0.3, 0.44, 0.58, 0.72, 1].map(st => eyes(st, 1)), [0, 2, 2, 2, 2], 'together');
  const plain = p => JSON.stringify(p.segs.map(q => [q.len, q.r0, q.r1, q.angle, q.addr])); assert.strictEqual(plain(A.development.develop(g, { stage: 1, pair: 1 })), plain(A.development.develop(g, { stage: 1 })), 'the grown body is the same');
  assert.strictEqual(new A.engine.World({ seed: 3, founders: 0, cap: 0 }).pair, 0);
  const w = new A.engine.World({ seed: 3, founders: 0, cap: 0 }), o = w.spawn(g, 40, 30, 0.44, null); assert.strictEqual(o.b.segs.length, 2); w.enable({ pair: 1 }); assert.strictEqual(o.b.segs.length, 3, 'a growing body is rebuilt when the rule is switched on'); assert.ok(/左右の対/.test(w.events[w.events.length - 1].text));
  { const w2 = new A.engine.World({ seed: 5, pair: 1 }); w2.seedWith(G.primordial(5)); for (let i = 0; i < 900; i++) w2.step(); const c = A.engine.World.restore(JSON.parse(JSON.stringify(w2.save()))); assert.strictEqual(c.pair, 1); for (let i = 0; i < 300; i++) { w2.step(); c.step(); } assert.strictEqual(JSON.stringify(c.bodies.map(q => [q.cx, q.E])), JSON.stringify(w2.bodies.map(q => [q.cx, q.E]))); }
});

test('solid: bodies meet along their whole length; a body does not pass through itself; joints stop at the end of their range; torn tissue weighs nothing; a segment torn through is cut off and becomes food; off by default', () => {
  const G = A.genome, P = A.physics, W = o => new A.engine.World(Object.assign({ seed: 3, founders: 0, cap: 0, contact: 1, flow: 0, grainRate: 0, bottomRate: 0, jitter: 0, audit: 1 }, o || {}));
  assert.strictEqual(W().solid, 0);
  // a swimmer heading at the middle of a long rod
  const rod = () => G.create({ parts: [G.part({ len: 8, r0: 0.3, r1: 0.3 })], links: [] }), swim = () => G.create({ parts: [G.part({ len: 0.8, r0: 0.3, r1: 0.3, cilia: 0.6, beat: 1 })], links: [] });
  const cross = solid => { const w = W({ solid, noBite: 1 }), r = w.spawn(rod(), 40, 30, 1, null); w.form(r, 40, 30, Math.PI / 2); const s = w.spawn(swim(), 46, 30.4, 1, null); w.form(s, 46, 30.4, 0); let felt = false; for (let i = 0; i < 900; i++) { w.step(); r.E = r.prof.Emax; s.E = s.prof.Emax; if (r.b.segs[0].tch > 0) felt = true; } return { x: s.cx, rod: r.cx, felt }; };
  const thru = cross(0), stop = cross(1);
  assert.ok(thru.x < 36 && !thru.felt && Math.abs(thru.rod - 40) < 0.01, 'a disc at the far end only: the swimmer goes through the middle of the rod, which feels nothing: ' + JSON.stringify(thru));
  assert.ok(stop.x > 38.5 && stop.felt && stop.rod < 39.8, 'solid: it is stopped, and pushes the rod along: ' + JSON.stringify(stop));
  // a push at a point: momentum is conserved, spin changes by what the two points of action give
  { const mk = (g, x, ang) => P.build(A.development.develop(g, { stage: 1 }), { x, y: 0, angle: ang }), limb = () => G.create({ parts: [G.part({ len: 1.2, r0: 0.4, r1: 0.35, muscle: 0.3 }), G.part({ len: 1, r0: 0.2, r1: 0.15, muscle: 0.5, amp: 0.6, range: 1.0 })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.5, off: 0.9, angle: 1.2, scale: 1, repeat: 1 })] });
    const a = mk(limb(), 0, 0.3), b = mk(rod(), 3, 1.2), tot = () => { const m1 = P.momentum(a), m2 = P.momentum(b); return [m1[0] + m2[0], m1[1] + m2[1], m1[2] + m2[2]]; }; assert.ok(!a.rigid && b.rigid);
    for (const bb of [a, b]) for (let k = 0; k < bb.np; k++) { bb.vx[k] = 0.1 * k; bb.vy[k] = -0.05 * k; } const m0 = tot(), sa = a.segs[2], sb = b.segs[0], ta = 0.37, tb = 0.62, jx = 0.013, jy = -0.021;
    const xa = sa.ax + (sa.bx - sa.ax) * ta, ya = sa.ay + (sa.by - sa.ay) * ta, xb = sb.ax + (sb.bx - sb.ax) * tb, yb = sb.ay + (sb.by - sb.ay) * tb; P.impulseAt(a, sa, ta, jx, jy); P.impulseAt(b, sb, tb, -jx, -jy); const m1 = tot();
    assert.ok(Math.abs(m1[0] - m0[0]) < 1e-12 && Math.abs(m1[1] - m0[1]) < 1e-12, 'momentum'); assert.ok(Math.abs((m1[2] - m0[2]) - ((xa * jy - ya * jx) - (xb * jy - yb * jx))) < 1e-9, 'spin'); }
  // joints and self-contact, over a family of jointed bodies (the lab's samples and mutants of them)
  { require('../alife2-bodyplan.js'); const w = W({ solid: 1, noBite: 1 }), r = G.rng(11), pool = [], wr = x => { x = (x + Math.PI) % (2 * Math.PI); if (x < 0) x += 2 * Math.PI; return x - Math.PI; };
    for (const smp of A.bodyplan.SAMPLES) { const g = A.bodyplan.design(smp); pool.push(g); for (let i = 0; i < 12; i++) { let m = g; for (let j = 0; j < 1 + r.int(6); j++) m = G.mutate(m, r, 1.5, 'g'); pool.push(m); } }
    const run = (g, hard) => { const plan = A.development.develop(g, { stage: 1, maxSegs: 64 }); if (plan.segs.length < 3) return null; const b = P.build(plan, { x: 0, y: 0 }); if (b.rigid) return null; b.hard = hard; const o = { b, plan }, pairs = w.selfPairs(o) || []; o.self = hard && pairs.length ? pairs : null;
      let over = 0, pen = 0, n = 0; for (let i = 0; i < 450; i++) { P.step(b, 1 / 30); if (o.self) { for (const s of b.segs) s.tch = 0; w.selfTouch(o, 1 / 30); } if (i < 60) continue; for (let a = 1; a < b.segs.length; a++) { const s = b.segs[a], ex = Math.abs(wr(s.theta - s.rest)) - (s.p.range * 1.1 + 0.03); if (ex > over) over = ex; }
        for (let k = 0; k < pairs.length; k += 2) { const s = b.segs[pairs[k]], q = b.segs[pairs[k + 1]], d = P.nearest(s, q, 0, 0), R = s.r0 + (s.r1 - s.r0) * P.near.s + q.r0 + (q.r1 - q.r0) * P.near.t; n++; if (d < R * 0.5) pen++; } } return { over, pen: n ? pen / n : 0, ok: P.finite(b) }; };
    let N = 0, o0 = 0, o1 = 0, p0 = 0, p1 = 0; for (const g of pool) { const a = run(g, false); if (!a) continue; const h = run(g, true); N++; assert.ok(a.ok && h.ok, 'no body blows up'); if (a.over > 0.1) o0++; if (h.over > 0.1) o1++; p0 += a.pen; p1 += h.pen; }
    assert.ok(N >= 30, 'jointed bodies tried: ' + N); assert.ok(o0 >= 8 && o1 <= 0.25 * o0, 'joints more than 0.1 rad past their range: ' + o0 + ' bodies as first built, ' + o1 + ' with stops'); assert.ok(p1 <= 0.5 * p0 + 1e-9, 'limbs through each other: ' + p0.toFixed(3) + ' -> ' + p1.toFixed(3)); }
  // torn tissue; a limb cut off
  const chain = () => G.create({ parts: [G.part({ len: 2, r0: 0.5, r1: 0.5, gut: 0.4, store: 0.4 }), G.part({ len: 1, r0: 0.25, r1: 0.2, muscle: 0.3, amp: 0.3, range: 0.8 })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.5, off: 0.9, angle: 1.3, scale: 1, repeat: 1 }), G.link({ from: 1, to: 1, sym: 'none', at: 1, off: 0, angle: 0.2, scale: 0.9, repeat: 2 })] });
  for (const solid of [0, 1]) { const w = W({ solid, noBite: 1 }), o = w.spawn(chain(), 40, 30, 1, null); for (let i = 0; i < 30; i++) w.step(); assert.strictEqual(o.b.segs.length, 7);
    const m0 = o.b.mass; o.hp = new Array(7).fill(1); o.hp[2] = 0.5; w.wound(o); assert.ok(solid ? o.b.mass < m0 - 0.02 : o.b.mass === m0, 'a half-torn segment ' + (solid ? 'is lighter' : 'weighs what it did') + ': ' + m0 + ' -> ' + o.b.mass);
    const first = o.b.segs.findIndex((q, i) => i > 0 && q.parent === 0); o.hp[2] = 1; o.hp[first] = 0.001; w.wound(o); for (const k in w.ledger) w.ledger[k] = 0; const s1 = w.stored(), E0 = o.E, food0 = w.food.length; o.hp[first] = 0; w.wound(o);
    const gone = o.b.segs.filter(q => q.gone).length, L = w.ledger, IN = ['rain', 'regrow', 'placed', 'mutation', 'recycled', 'arrived'], bal = IN.reduce((x, k) => x + (L[k] || 0), 0) - Object.keys(L).filter(k => !IN.includes(k)).reduce((x, k) => x + L[k], 0);
    if (solid) { assert.strictEqual(gone, 3, 'the limb is cut off with everything beyond it'); assert.ok(w.food.length > food0 && o.E < E0, 'what was cut off becomes food, with its share of the reserve'); assert.ok(Math.abs((w.stored() - s1) - bal) < 0.01, 'and the energy is accounted for: ' + (w.stored() - s1) + ' / ' + bal);
      for (let i = 0; i < 900; i++) { w.step(); o.E = o.prof.Emax * 0.9; } assert.ok(!o.dead && P.finite(o.b) && o.hp.filter(h => h === 0).length === 3 && o.b.segs.filter(q => q.gone).every(q => !q.circ), 'it lives on; nothing grows back: ' + JSON.stringify(o.hp));
      const c = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))), o2 = c.bodies[0]; assert.ok(o2.b.segs.filter(q => q.gone).length === 3 && Math.abs(o2.b.mass - o.b.mass) < 1e-9, 'saved and loaded: still cut'); for (let i = 0; i < 120; i++) { w.step(); c.step(); } assert.strictEqual(JSON.stringify([o2.cx, o2.cy, o2.E]), JSON.stringify([o.cx, o.cy, o.E]), 'and continues exactly'); }
    else { assert.strictEqual(gone, 0); for (let i = 0; i < 900; i++) { w.step(); o.E = o.prof.Emax * 0.9; } assert.ok(!o.hp || o.hp[first] > 0.5, 'as first built the segment grows back'); } }
});

test('the sound of cilia from the work they do (soundWork): swimming by cilia becomes nearly silent, other sounds are untouched, an eater can hear itself eat; off by default; switched in a running world', () => {
  const G = A.genome, W = o => new A.engine.World(Object.assign({ seed: 5, founders: 0, cap: 0, sound: 1, nerve2: 1, blind: 1 }, o || {}));
  assert.strictEqual(W().soundWork, 0);
  const swimmer = () => G.create({ parts: [G.part({ len: 1, r0: 0.4, r1: 0.3, cilia: 0.5, beat: 1, nerve: 0.5, mouth: 0.6, gut: 0.5 })], links: [] });
  const run = (o, steps) => { const w = W(o), L = []; for (let i = 0; i < 8; i++) L.push(w.spawn(swimmer(), 20 + i * 15, 30, 1, null)); for (let i = 0; i < steps; i++) { w.step(); for (const b of L) b.E = b.prof.Emax * 0.8; } return { w, L }; };
  const old = run({}, 900), neu = run({ soundWork: 1 }, 900);
  assert.strictEqual(JSON.stringify(neu.L.map(o => [o.cx, o.cy, o.eaten])), JSON.stringify(old.L.map(o => [o.cx, o.cy, o.eaten])), 'bodies without ears live the same life under either rule');
  assert.ok(old.w.aco.out.cilia > 50 * neu.w.aco.out.cilia && neu.w.aco.out.cilia > 0, 'cilia: ' + old.w.aco.out.cilia + ' -> ' + neu.w.aco.out.cilia);
  assert.strictEqual(neu.w.aco.out.crunch, old.w.aco.out.crunch, 'the sound of eating is the same'); assert.ok(old.w.aco.out.crunch > 0);
  // what the rule says: thrust times the speed through the water, at the efficiency of muscle
  { const o = neu.L[0], w = neu.w, c0 = w.aco.out.cilia, u0 = o.b.ciliaUse, p0 = o.path; for (let i = 0; i < 30; i++) w.step(); const others = neu.L.length;
    const made = (w.aco.out.cilia - c0) / others, expect = 0.02 * A.physics.K.cilia * (o.b.ciliaUse - u0) * (o.path - p0); assert.ok(made > 0.3 * expect && made < 3 * expect, 'about thrust x speed x efficiency of muscle: ' + made + ' / ' + expect); }
  // switched in a running world, kept in a save
  { const { w } = run({}, 300), a0 = w.aco.out.cilia; for (let i = 0; i < 60; i++) w.step(); const before = w.aco.out.cilia - a0; w.enable({ soundWork: 1 }); assert.ok(/繊毛の音/.test(w.events[w.events.length - 1].text));
    const a1 = w.aco.out.cilia; for (let i = 0; i < 60; i++) w.step(); assert.ok(w.aco.out.cilia - a1 < before / 50, 'quieter from the moment it is switched on');
    assert.strictEqual(A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))).soundWork, 1); }
  // an eater with an ear tuned to the sound of its own mouth: does the ear tell eating from not eating?
  const eater = () => { const g = G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3, beat: 1, nerve: 0.5, mouth: 0.6, gut: 0.5 }), G.part({ len: 0.5, r0: 0.25, r1: 0.2, nerve: 0.5, ear: 0.6, hTune: 0.36, hWide: 0.15, hE: 0.5 })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 })] }); return g; }; // (the ear is wired to its segment's signal, which drives nothing: an ear with no wiring is not built)
  const ears = sw => { const w = new A.engine.World({ seed: 881, founders: 0, cap: 0, sound: 1, soundWork: sw, nerve2: 1, blind: 1, learn: 1 }), L = []; for (let i = 0; i < 300; i++) w.step(); for (let i = 0; i < 24; i++) L.push(w.spawn(eater(), w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null));
    let all = 0, n = 0, eat = 0, m = 0; for (let i = 0; i < 4500; i++) { w.step(); for (const o of L) { if (o.dead) continue; o.E = o.prof.Emax * 0.6; if (i % 5) continue; for (const q of o.b.segs) if (q.earW) { all += q.e; n++; if (o.b.segs[0].ate > 0.001) { eat += q.e; m++; } } } } return { ratio: (eat / Math.max(1, m)) / (all / Math.max(1, n)), m }; };
  const e0 = ears(0), e1 = ears(1);
  assert.ok(e1.m > 20 && e0.m > 20, 'they ate: ' + e0.m + ', ' + e1.m);
  assert.ok(e1.ratio > 1.3, 'with quiet swimming an ear reads more while its body swallows: x' + e1.ratio); assert.ok(e0.ratio < 1.15, 'under the first calibration it does not (the cilia drown it): x' + e0.ratio);
});

test('the record of sound is only a notebook: wiping it changes nothing in the world; it tells bodies that respond to a call from bodies that merely differ; order is counted within a body; older saves load', () => {
  const G = A.genome, W = o => new A.engine.World(Object.assign({ seed: 5, founders: 0, cap: 0, sound: 1, nerve2: 1, blind: 1 }, o || {}));
  const one = (o, nn, fr) => { const g = G.create({ freq: fr || 1, parts: [G.part(Object.assign({ len: 0.6, r0: 0.3, r1: 0.3, nerve: 0.5, store: 0.5 }, o))], links: [] }); if (nn) g.parts[0].nn = nn; return g; };
  const caller = () => one({ voice: 0.3, pitch: 0.2, freq: 0.25 }, [{ b: -2.7, k: 1, in: [['o', 3]], out: [['V', 1]] }], 0.2); // a few seconds of sound every twenty
  const HEAR = [{ b: -1, k: 1, in: [['e', 4]], out: [['C', 1]] }];
  const kinds = { respond: [() => one({ ear: 0.6, hTune: 0.2, hWide: 0.3, adapt: 1, cilia: 0.4, beat: -1 }, HEAR), () => one({ cilia: 0.4, beat: -1 }, HEAR)], // swims when it hears | the same body without the ear
    differ: [() => one({ ear: 0.6, hTune: 0.2, hWide: 0.3, adapt: 1, cilia: 0.4, beat: 1 }), () => one({})] };                                              // always swims, its ear wired to nothing | sits still
  const scene = (kind, steps, each) => { const w = W(), L = [], [eared, earless] = kinds[kind]; for (let i = 0; i < 200; i++) w.step();
    for (let i = 0; i < 4; i++) { const x0 = 20 + i * 38; L.push(w.spawn(caller(), x0, 30, 1, null)); for (let j = 0; j < 4; j++) { L.push(w.spawn(eared(), x0 - 6 + j * 4, 34, 1, null)); L.push(w.spawn(earless(), x0 - 6 + j * 4, 26, 1, null)); } }
    for (let i = 0; i < steps; i++) { w.step(); for (const o of L) if (!o.dead) o.E = o.prof.Emax; if (each) each(w, i); } return w; };
  // 1. the notebook is not part of the world
  const print = w => JSON.stringify([w.t, w.rand.state ? w.rand.state() : 0, w.bodies.map(o => [o.id, o.cx, o.cy, o.E, o.path, o.b.segs.map(q => [q.e, q.vo])]), Array.from(w.snd[0].subarray(0, 400)), Array.from(w.sndV[1].subarray(0, 400))]);
  const kept = scene('respond', 2400), wiped = scene('respond', 2400, (w, i) => { if (i % 37 === 0) { w.aco = w.acoNew(); w.sndPend = []; for (const o of w.bodies) for (const k of Object.keys(o)) if (/^vo[A-Z]|^vs\d/.test(k)) delete o[k]; } });
  assert.ok(kept.aco.onsets >= 8 && kept.aco.out.voice > 0, 'voices sounded: ' + kept.aco.onsets); assert.ok(wiped.aco.onsets < kept.aco.onsets, 'and the notebook really was wiped');
  assert.strictEqual(print(wiped), print(kept), 'a world whose record is wiped again and again goes on exactly as one whose record is kept');
  // 2. listeners: bodies that swim when they hear are found; bodies of two kinds, neither of which responds, are not
  const rw = scene('respond', 9000), r = rw.census(), d = scene('differ', 9000).census();
  assert.ok(r.lisEffect > 1 && r.lisOf === '動く' && r.lisControl === 'both' && r.lisMovedAfter > 1.5 * r.lisMovedBefore, 'responders are found: ' + JSON.stringify([r.lisEffect, r.lisOf, r.lisControl, r.lisN, r.lisMovedBefore, r.lisMovedAfter]));
  assert.ok(Math.abs(d.lisEffect) < 0.25 && d.lisMovedBefore > 0.3, 'bodies that merely differ are not taken for listeners: ' + JSON.stringify([d.lisEffect, d.lisOf, d.lisN, d.lisMovedBefore, d.lisMovedAfter]));
  assert.ok(r.callShapes >= 1 && r.sequenceN === 0 && r.dialectBits === 0, 'one shape of call, so nothing to say about order');
  // 2b. One body is not a finding. (Both cases come from an evolved world, where a single newborn whose voice hovered at the threshold for 2.4 seconds was logged as
  //     37 calls, a repeated shape and a change in its listeners.) A voice that hovers at one level is one call; and however often one body calls, and however
  //     its neighbours respond, the record says "unknown" until several bodies have called.
  { const hover = () => one({ voice: 0.3, pitch: 0.2, freq: 3 }, [{ b: 0.205, k: 1, in: [['o', 0.012]], out: [['V', 1]] }], 3); // drive wavers between about 0.19 and 0.21, several times a second
    const w = W(), L = []; for (let i = 0; i < 200; i++) w.step(); const h = w.spawn(hover(), 80, 30, 1, null); L.push(h); for (let j = 0; j < 6; j++) { L.push(w.spawn(kinds.respond[0](), 74 + j * 2.4, 34, 1, null)); L.push(w.spawn(kinds.respond[1](), 74 + j * 2.4, 26, 1, null)); }
    let lo = 1, hi = 0; for (let i = 0; i < 1200; i++) { w.step(); for (const o of L) if (!o.dead) o.E = o.prof.Emax; if (i > 60) { const v = h.voL || 0; if (v < lo) lo = v; if (v > hi) hi = v; } }
    assert.ok(lo > 0.1 && lo < 0.2 && hi > 0.2 && hi < 0.3, 'the voice does hover across a fifth: ' + lo + '..' + hi); assert.ok(w.aco.onsets <= 2, 'and is counted as one call, not ' + w.aco.onsets);
    { const buzz = () => one({ voice: 0.3, pitch: 0.2, freq: 3 }, [{ b: 0, k: 1, in: [['o', 1.2]], out: [['V', 1]] }], 3), w2 = W(); for (let i = 0; i < 100; i++) w2.step(); const z = w2.spawn(buzz(), 80, 30, 1, null); // a voice switched on and off nine times a second
      let ons = 0, offs = 0, was = 0; for (let i = 0; i < 600; i++) { w2.step(); z.E = z.prof.Emax; const up = (z.voL || 0) > 0.2 ? 1 : 0; if (up && !was) ons++; if (!up && was) offs++; was = up; }
      assert.ok(ons > 50 && offs > 50, 'the voice does switch many times: ' + ons); assert.ok(w2.aco.onsets <= 2, 'and is one call, not ' + w2.aco.onsets); assert.ok(z.voT > 2 && z.voT < 15, 'its sounding time counts only the moments it sounds: ' + z.voT); }
    const solo = W(), M = []; for (let i = 0; i < 200; i++) solo.step(); M.push(solo.spawn(caller(), 80, 30, 1, null)); for (let j = 0; j < 8; j++) { M.push(solo.spawn(kinds.respond[0](), 71 + j * 2.4, 34, 1, null)); M.push(solo.spawn(kinds.respond[1](), 71 + j * 2.4, 26, 1, null)); }
    for (let i = 0; i < 9000; i++) { solo.step(); for (const o of M) if (!o.dead) o.E = o.prof.Emax; } const c = solo.census(), R = solo.soundReading(c);
    assert.ok(c.onsets >= 10 && c.callers === 1 && c.lisN > 3, 'one caller, many calls: ' + [c.onsets, c.callers, c.lisN]);
    assert.ok(c.lisEffect === 0 && c.lisControl === '' && R.unknown.some(l => /聞き手のふるまい/.test(l)), 'and nothing is said about listeners: ' + c.lisEffect);
    // even with ten times the cases it is the number of callers that decides: the same notebook with three callers on its list does speak
    for (const q of solo.aco.lis) for (const k in q) if (k !== 'ids') q[k] *= 10; assert.ok(solo.aco.lis[1].n >= 25 && solo.soundDerived().lisControl === '', 'many cases from one caller: still nothing');
    solo.aco.who = { 1: solo.t, 2: solo.t, 3: solo.t }; assert.ok(solo.soundDerived().lisControl === '', 'three callers, but the cases come from four listeners: still nothing (' + solo.soundDerived().lisBodies + ')');
    for (let i = 0; i < 6; i++) { solo.aco.lis[1].ids['x' + i] = solo.t; solo.aco.lis[0].ids['y' + i] = solo.t; } assert.ok(solo.soundDerived().lisControl === 'both' && solo.soundDerived().lisEffect > 1, 'with three callers and enough listeners the same cases would count: ' + solo.soundDerived().lisEffect);
    assert.ok(!solo.events.some(e => /音（観測）/.test(e.text)), 'nor is any first logged: ' + solo.events.filter(e => /音（観測）/.test(e.text)).map(e => e.text).join(' / ')); }
  // 3. order: within a body, against its own repertoire
  { const w = W(); let z = 12345; const rnd = () => (z = (z * 1103515245 + 12345) % 2147483648) / 2147483648;
    const seq = fn => { w.aco = w.acoNew(); for (let b = 0; b < 40; b++) { const o = { gen: 1, cx: 10 }; for (let i = 0; i < 60; i++) w.voiceShape(o, fn(b, i)); } return w.soundDerived(); };
    const own = seq(b => b % 6), iid = seq(() => (rnd() < 0.6 ? 1 : 4)), alt = seq((b, i) => (i % 2 ? 1 : 4)), runs = seq((b, i) => (Math.floor(i / 5) % 2 ? 1 : 4));
    assert.strictEqual(own.sequenceN, 0, 'bodies that each keep to one shape say nothing about order'); assert.ok(own.callShapes === 6);
    assert.ok(Math.abs(iid.sequenceOrder) < 0.03 && iid.sequenceN > 1000, 'shapes drawn without regard to the last: ' + iid.sequenceOrder);
    assert.ok(alt.sequenceOrder < -0.4 && runs.sequenceOrder > 0.25, 'taking turns ' + alt.sequenceOrder + ', runs ' + runs.sequenceOrder); }
  // 4. firsts are logged only after five censuses in a row, and a save from before the notebook grew still loads
  { const w = rw, F = w.events.filter(e => /音（観測）/.test(e.text)); assert.ok(F.length >= 2 && F.every(e => e.t >= 150) && F.some(e => /聞こえる個体のふるまい/.test(e.text)), 'firsts: ' + F.map(e => e.t + ' ' + e.text).join(' / '));
    const d0 = JSON.parse(JSON.stringify(w.save())); for (const k of ['lis', 'seqN', 'seqRep', 'seqExp', 'on', 'replied', 'hearN', 'hearYes', 'shape', 'gen', 'reg', 'first', 'pool', 'resD', 'resN', 'chD', 'chN']) delete d0.snd.aco[k];
    const old = A.engine.World.restore(d0); for (let i = 0; i < 900; i++) old.step(); const c = old.census();
    for (const k of ['lisEffect', 'alternation', 'sequenceOrder', 'dialectBits', 'resemble', 'answer', 'callsEnded']) assert.ok(Number.isFinite(c[k]), k + ' after loading an older save: ' + c[k]); }
});


test('wireLate: a part can build its circuit at a later stage of growth; until then it pays for no connections and nothing drives it; off by default, and the gene does nothing where the rule does not hold', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, C = A.organs.C, P = o => G.part(Object.assign({ len: 0.5, r0: 0.5, r1: 0.5, muscle: 0, nerve: 1, skin: 0.2, cilia: 1, nC: 1, mCil: 1 }, o));
  assert.strictEqual(A.engine.DEFAULTS.wireLate, 0, 'off by default');
  const plain = G.create({ parts: [P({})] }), late = G.create({ parts: [P({ nAt: 0.6 })] }), prof = (g, stage, on) => A.organs.profile(A.development.develop(g, { stage, late: on }));
  // before its stage: no wiring, and the upkeep is lower by exactly what the connections cost; from its stage on: the same body as without the gene
  for (const st of [0.3, 0.44, 0.58]) { const a = prof(plain, st, 1), b = prof(late, st, 1); assert.strictEqual(b.wiring, 0); assert.ok(Math.abs((a.basal - b.basal) - a.wiring * C.synapse) < 1e-12, 'stage ' + st); assert.strictEqual(a.V, b.V); assert.strictEqual(a.buildCost, b.buildCost); }
  for (const st of [0.6, 0.72, 1]) assert.deepStrictEqual(prof(late, st, 1), prof(plain, st, 1), 'stage ' + st);
  // where the rule does not hold the gene is not read
  for (const st of [0.3, 0.58, 1]) assert.deepStrictEqual(prof(late, st, 0), prof(plain, st, 0));
  // a gene at or below the stage of birth changes nothing
  assert.deepStrictEqual(prof(G.create({ parts: [P({ nAt: 0.3 })] }), 0.3, 1), prof(plain, 0.3, 1));
  // in a world: the young one's cilia beat at their plain rate and its signal stays at 0; when it has grown past its stage the circuit works
  const w = new A.engine.World({ seed: 2, n: 0, wireLate: 1 }), o = w.spawn(late, w.W / 2, w.H / 2, 0.3), q = w.spawn(plain, w.W / 2 + 6, w.H / 2, 0.3);
  for (let i = 0; i < 90; i++) w.step();
  assert.strictEqual(o.b.segs[0].circ, false); assert.strictEqual(o.b.segs[0].cd, 1); assert.strictEqual(o.b.segs[0].a, 0); assert.ok(q.b.segs[0].circ && q.b.segs[0].a !== 0, 'the plain one is wired from birth');
  assert.ok(o.prof.basal < q.prof.basal);
  o.stage = 0.72; o.nextCost = null; w.form(o, o.cx, o.cy, 0); for (let i = 0; i < 90; i++) w.step();
  assert.strictEqual(o.b.segs[0].circ, true); assert.ok(o.b.segs[0].a !== 0, 'grown past its stage, the circuit runs');
  // switching the rule off in a running world builds the circuits that were waiting; a saved world keeps the rule
  const w2 = new A.engine.World({ seed: 2, n: 0, wireLate: 1 }), y = w2.spawn(late, w2.W / 2, w2.H / 2, 0.3); for (let i = 0; i < 30; i++) w2.step();
  const back = A.engine.World.restore(JSON.parse(JSON.stringify(w2.save()))); assert.strictEqual(back.wireLate, 1); assert.strictEqual(back.bodies[0].b.segs[0].circ, false);
  w2.enable({ wireLate: 0 }); assert.strictEqual(y.b.segs[0].circ, true, 'rule switched off: the circuit is there');
  // the gene: never without the rule (nor in the explorer's mutate-everything mode), appears with it, stays within 0..1, and is drawn in mixing only where the rule holds
  const r = G.rng(5), base = G.primordial(1);
  let n0 = 0; for (let i = 0; i < 400; i++) { if (G.mutate(base, r, 1, 'gn').parts.some(p => p.nAt != null)) n0++; if (G.mutate(base, r, 1, true).parts.some(p => p.nAt != null)) n0++; } assert.strictEqual(n0, 0);
  let got = 0, after = 0; for (let i = 0; i < 2000; i++) { const m = G.mutate(base, r, 1, 'gnt'); for (const p of m.parts) if (p.nAt != null) { got++; assert.ok(p.nAt >= 0 && p.nAt <= 1); if (p.nAt > base.birth) after++; } } assert.ok(got > 20 && after > 10, 'the gene appears: ' + got + ', built after birth in ' + after);
  const ra = G.rng(7), rb = G.rng(7), a = G.create({ parts: [P({})] }), b = G.create({ parts: [P({ nAt: 0.8 })] });
  let mixed = 0; for (let i = 0; i < 200; i++) { const k = G.recombine(a, b, ra, 0, 0, 1); if (k.parts[0].nAt === 0.8) mixed++; } assert.ok(mixed > 60 && mixed < 140, 'with the rule, the gene comes from either parent: ' + mixed);
  for (let i = 0; i < 50; i++) assert.strictEqual(G.recombine(a, b, rb, 0, 0, 0).parts[0].nAt, undefined, 'without the rule it is not mixed');
  // a world without the rule draws the same random numbers whether or not genomes carry the gene
  const run = g => { const z = new A.engine.World({ seed: 9, n: 0 }); for (let i = 0; i < 6; i++) z.spawn(JSON.parse(JSON.stringify(g)), 20 + i * 8, 20, 1); for (let i = 0; i < 600; i++) z.step(); return [z.bodies.length, z.rand.state(), z.bodies.map(o => o.E)]; };
  assert.deepStrictEqual(run(late), run(plain));
});

test('wireEnds: a connection with nothing at its other end is not built and costs nothing; what the body does is unchanged; off by default', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, C = A.organs.C, P = o => G.part(Object.assign({ len: 0.5, r0: 0.5, r1: 0.5, muscle: 0, nerve: 1, skin: 0.2 }, o)), W = { scent: 0, vision: 1, contact: 0, sound: 0 };
  assert.strictEqual(A.engine.DEFAULTS.wireEnds, 0, 'off by default');
  const wiring = (g, ends) => A.development.develop(g, { ends }).segs.map(s => A.neural.wiring(s.p));
  // one segment with cilia and a taste->cilia circuit, plus: an eye gene with no eye, a joint gene on the root, a voice gene in a world without sound, a child to listen to that is not there
  const g = G.create({ parts: [P({ cilia: 1, nC: 1, mCil: 0.5, vE: 2, mJoint: 0.7, mVoice: 0.3, nK: 0.4, adapt: 0.5 })] });
  assert.ok(Math.abs(wiring(g, null)[0] - (1 + 0.5 + 2 + 0.7 + 0.3 + 0.4 + 0.5)) < 1e-12, 'without the rule every strength is paid for');
  assert.ok(Math.abs(wiring(g, W)[0] - (1 + 0.5 + 0.5)) < 1e-12, 'with it, only taste -> signal -> cilia and how the taste reports');
  // with an eye the eye connection stays; in a world without sight it goes
  const eyed = G.create({ parts: [P({ cilia: 1, eye: 0.8, vE: 2, mCil: 0.5 })] });
  assert.ok(Math.abs(wiring(eyed, W)[0] - 2.5) < 1e-12); assert.ok(Math.abs(wiring(eyed, { vision: 0 })[0] - 0.5) < 1e-12);
  // no nerve tissue: the senses are not read; a bias and what it drives stay
  assert.ok(Math.abs(wiring(G.create({ parts: [P({ nerve: 0, cilia: 1, nC: 1, nB: 0.3, mCil: 0.5 })] }), W)[0] - 0.8) < 1e-12);
  // a chain: the child has only connections that lead nowhere, so the parent listening to it hears nothing, and that connection goes too; where the child tastes, both stay
  const link = [G.link({ from: 0, to: 1 })], kid = o => P(Object.assign({ len: 0.4, r0: 0.3, r1: 0.3 }, o));
  assert.deepStrictEqual(wiring(G.create({ parts: [P({ cilia: 1, nK: 1, mCil: 1 }), kid({ vE: 1 })], links: link }), W).map(x => +x.toFixed(9)), [1, 0], 'the parent keeps only its cilia connection');
  assert.deepStrictEqual(wiring(G.create({ parts: [P({ cilia: 1, nK: 1, mCil: 1 }), kid({ nC: 1 })], links: link }), W).map(x => +x.toFixed(9)), [2, 1]);
  // parts with several neurons are left as they are
  const nn = G.create({ parts: [P({ cilia: 1, vE: 2, adapt: 0.5, nn: [{ b: 0, k: 0.5, in: [['c', 1]], out: [['C', 1]] }] })] }), before = wiring(nn, null)[0], after = wiring(nn, W)[0];
  assert.ok(Math.abs(before - after - 2) < 1e-12, 'only the eye connection goes; the neuron, and how the senses report, stay');
  // in a world: the upkeep falls by exactly what the endless connections cost, and the body does the same thing, number for number (with the upkeep held equal:
  // a body that pays less keeps more reserve, and hunger is one of the things a circuit reads)
  const mk = on => { const w = new A.engine.World({ seed: 4, n: 0, vision: 1, wireEnds: on }), o = w.spawn(JSON.parse(JSON.stringify(g)), w.W / 2, w.H / 2, 1); return [w, o]; }, [wa, a] = mk(0), [wb, b] = mk(1);
  assert.ok(Math.abs((a.prof.basal - b.prof.basal) - (2 + 0.7 + 0.3 + 0.4) * C.synapse) < 1e-12);
  for (let i = 0; i < 240; i++) { b.prof.basal = a.prof.basal; wa.step(); wb.step(); assert.deepStrictEqual([Array.from(b.b.x), Array.from(b.b.vx), b.absorbed, b.E, b.b.segs[0].a, b.b.segs[0].cd], [Array.from(a.b.x), Array.from(a.b.vx), a.absorbed, a.E, a.b.segs[0].a, a.b.segs[0].cd], 'tick ' + i); }
  assert.ok(a.b.segs[0].a !== 0, 'the circuit was running');
  // switching the rule in a running world rebuilds the bodies; a saved world keeps the rule
  const back = A.engine.World.restore(JSON.parse(JSON.stringify(wb.save()))); assert.strictEqual(back.wireEnds, 1); assert.ok(Math.abs(back.bodies[0].prof.wiring - 2) < 1e-12);
  wb.enable({ wireEnds: 0 }); assert.ok(Math.abs(b.prof.wiring - 5.4) < 1e-12);
});

test('the wiring-sorting tool: designed bodies whose every connection has an obvious class', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const { sort } = require('../tools/alife2-wiring-use.js'), G = A.genome, P = o => G.part(Object.assign({ len: 0.5, r0: 0.5, r1: 0.5, muscle: 0, nerve: 1, skin: 0.2 }, o)), kid = o => P(Object.assign({ len: 0.4, r0: 0.3, r1: 0.3 }, o)), link = [G.link({ from: 0, to: 1 })];
  const classes = (opt, parts, links) => { const w = new A.engine.World(Object.assign({ seed: 1, n: 0 }, opt)), o = w.spawn(G.create({ parts, links: links || [] }), w.W / 2, w.H / 2, 1); for (let i = 0; i < 30; i++) w.step(); const r = sort(w, o); assert.ok(Math.abs(r.check - r.wiring) < 1e-9, 'every strength is put in one class'); return Object.fromEntries(Object.entries(r.G).map(([k, m]) => [k, Object.keys(m).sort().join('+')])); };
  assert.deepStrictEqual(classes({}, [P({ cilia: 1, nC: 1, mCil: 1 })]), { nC: 'through', mCil: 'through' }, 'taste -> cilia');
  assert.deepStrictEqual(classes({ vision: 1 }, [P({ cilia: 1, nC: 1, mCil: 1, vE: 2 })]), { nC: 'through', mCil: 'through', vE: 'partner' }, 'an eye gene without an eye');
  assert.deepStrictEqual(classes({ vision: 1 }, [P({ cilia: 1, eye: 0.8, mCil: 1, vE: 2 })]), { mCil: 'through', vE: 'through' }, 'with an eye');
  assert.deepStrictEqual(classes({}, [P({ cilia: 1, eye: 0.8, mCil: 1, vE: 2 })]), { mCil: 'in', vE: 'partner' }, 'an eye in a world without sight');
  assert.deepStrictEqual(classes({}, [P({ nC: 1, mCil: 1 })]), { nC: 'out', mCil: 'partner' }, 'a cilia gene without cilia');
  assert.deepStrictEqual(classes({}, [P({ cilia: 1, nC: 1, mJoint: 1, mCil: 0.5 })]), { nC: 'through', mCil: 'through', mJoint: 'partner' }, 'a joint gene on the root');
  assert.deepStrictEqual(classes({}, [P({ cilia: 1, nB: 1, mCil: 1 })]), { nB: 'steady', mCil: 'steady' }, 'a bias alone');
  assert.deepStrictEqual(classes({}, [P({ cilia: 1, mCil: 1 })]), { mCil: 'in' }, 'nothing moves the signal');
  assert.deepStrictEqual(classes({}, [P({ cilia: 1, nC: 1, nH: 1 })]), { nC: 'out', nH: 'out' }, 'a sense that leads nowhere');
  assert.deepStrictEqual(classes({}, [P({ nerve: 0, cilia: 1, nC: 1, mCil: 1 })]), { nC: 'partner', mCil: 'in' }, 'no nerve tissue to read with');
  assert.deepStrictEqual(classes({}, [P({ cilia: 1, sT: 1, mCil: 1 })]), { sT: 'partner', mCil: 'in' }, 'touch in a world without touch');
  assert.deepStrictEqual(classes({ contact: 1 }, [P({ cilia: 1, sT: 1, mCil: 1 })]), { sT: 'through', mCil: 'through' }, 'touch in a world with it');
  assert.deepStrictEqual(classes({}, [P({ cilia: 1, nK: 1, mCil: 1 }), kid({ nC: 1 })], link), { nK: 'through', mCil: 'through', nC: 'through' }, 'the child tastes, the parent listens and beats its cilia');
  assert.deepStrictEqual(classes({}, [P({ cilia: 1, nK: 1, mCil: 1 })]), { nK: 'partner', mCil: 'in' }, 'listening to a child that is not there');
  assert.deepStrictEqual(classes({ vision: 1 }, [P({ cilia: 1, nK: 1, mCil: 1 }), kid({ vE: 1 })], link), { nK: 'partner', mCil: 'in', vE: 'partner' }, 'a child with nothing to say: listening to it is partner-less too');
  assert.deepStrictEqual(classes({}, [P({ cilia: 1, nC: 1, mCil: 1, adapt: 0.5 })]), { nC: 'through', mCil: 'through', adapt: 'through' }, 'how a sense reports, where a sense is read');
  assert.deepStrictEqual(classes({}, [P({ cilia: 1, nB: 1, mCil: 1, adapt: 0.5 })]), { nB: 'steady', mCil: 'steady', adapt: 'partner' }, 'and where none is');
});

test('a world saved before a gene existed resumes: genomes get the starting value of the genes they lack, and genomes that have every gene are left as they are', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, LATER = Object.keys(G.PART_FIELDS).filter(k => G.PART_FIELDS[k][4]); // the genes that came with later rules (smell, sight, touch, sound)
  assert.ok(LATER.includes('sT') && LATER.includes('mBite') && LATER.includes('vE') && LATER.includes('hE'));
  // complete(): nothing happens to a genome that has every gene; one that lacks some gets exactly those, at their starting values
  const g = G.primordial(3), text = JSON.stringify(g); assert.strictEqual(G.complete(g), 0); assert.strictEqual(JSON.stringify(g), text, 'a complete genome is not touched, not even in how it is written');
  const old = JSON.parse(text); for (const p of old.parts) for (const k of LATER) delete p[k]; delete old.odor; old.parts[0].nC = 'x';
  assert.strictEqual(G.complete(old), old.parts.length * LATER.length + 2); assert.deepStrictEqual(Object.assign(old, { odor: g.odor }), Object.assign(JSON.parse(text), { parts: JSON.parse(text).parts.map((p, i) => (i ? p : Object.assign(p, { nC: G.PART_FIELDS.nC[2] }))) }));
  assert.strictEqual(old.parts[0].nAt, undefined, 'a gene that only some worlds have stays absent');
  // a world with touch, sight, smell and sound is run and saved. From a copy of the save, every later gene that still has its starting value is taken out of
  // every genome: that is how the same world would have been written by a version that did not know those genes
  // (the bodies carry a circuit - taste to cilia - so that their segments' signals are computed: a body without any connection never reads these genes)
  const wiredBody = G.create({ parts: [G.part({ len: 0.5, r0: 0.5, r1: 0.5, muscle: 0, skin: 0.2, nerve: 0.5, cilia: 0.6, mouth: 0.4, gut: 0.5, gonad: 0.3, eye: 0.3, nC: 1, nH: 0.5, mCil: 0.5 })] });
  const w = new A.engine.World({ seed: 6, n: 0, contact: 1, vision: 1, scent: 1, sound: 1 }); for (let i = 0; i < 24; i++) w.spawn(JSON.parse(JSON.stringify(wiredBody)), 20 + (i % 8) * 15, 25 + Math.floor(i / 8) * 20, 1); for (let i = 0; i < 400; i++) w.step();
  const save = JSON.parse(JSON.stringify(w.save())), stripped = JSON.parse(JSON.stringify(save)); let taken = 0;
  const strip = q => { if (!q) return; for (const p of q.parts) for (const k of LATER) if (p[k] === G.PART_FIELDS[k][2]) { delete p[k]; taken++; } };
  for (const n of stripped.tree) strip(n.g); for (const c of stripped.clades || []) strip(c.g); assert.ok(taken > 100, 'genes were taken out: ' + taken);
  assert.ok(w.bodies.some(o => o.b.segs.some(q => q.circ && q.a !== 0)), 'the bodies\' circuits were running');
  const a = A.engine.World.restore(save), b = A.engine.World.restore(stripped);
  assert.ok(b.bodies.every(o => o.g.parts.every(p => LATER.every(k => Number.isFinite(p[k])))), 'every body has every gene again');
  const said = z => z.events.some(e => /補った/.test(JSON.stringify(e))); assert.ok(said(b), 'the world says that it filled genes in'); assert.ok(!said(a), 'a save of this version says nothing');
  // and it goes on exactly as the world that never lost them: touch, sight, smell and sound all read genes that had been missing
  const state = z => [z.bodies.length, z.rand.state(), z.bodies.map(o => [o.id, o.cx, o.cy, o.E, o.b.segs.map(s => s.a)])];
  for (let i = 0; i < 150; i++) { a.step(); b.step(); } assert.ok(b.bodies.length > 0); assert.ok(b.bodies.every(o => Number.isFinite(o.E) && o.b.segs.every(s => Number.isFinite(s.a))), 'no body lost its signal');
  assert.deepStrictEqual(state(b), state(a));
});

test('solid: a limb that was cut off is counted once, however often the body is rebuilt or reloaded, and the body no longer pays for its nerves', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, C = A.organs.C, body = () => G.create({ parts: [G.part({ len: 2, r0: 0.5, r1: 0.5, gut: 0.4, store: 0.4, nerve: 0.5, nC: 1, nK: 0.5, nB: 0.2 }), G.part({ len: 1, r0: 0.25, r1: 0.2, muscle: 0.3, amp: 0.3, range: 0.8, nerve: 0.5, nC: 0.7, mJoint: 0.6, nP: 0.4 })],
    links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.5, off: 0.9, angle: 1.3, scale: 1, repeat: 1 }), G.link({ from: 1, to: 1, sym: 'none', at: 1, off: 0, angle: 0.2, scale: 0.9, repeat: 2 })] });
  const cut = solid => { const w = new A.engine.World({ seed: 3, n: 0, contact: 1, solid }), o = w.spawn(body(), 40, 30, 1, null); for (let i = 0; i < 30; i++) w.step(); assert.strictEqual(o.b.segs.length, 7);
    const wiring0 = o.prof.wiring, first = o.b.segs.findIndex((q, i) => i > 0 && q.parent === 0); o.hp = new Array(7).fill(1); o.hp[first] = 0; w.wound(o); return { w, o, wiring0, first }; };
  { const { w, o, wiring0 } = cut(1), gone = () => o.b.segs.filter(q => q.gone).length;
    assert.strictEqual(gone(), 3, 'the limb and what is beyond it'); assert.strictEqual(w.counts.cut, 1);
    assert.ok(Math.abs((wiring0 - o.prof.wiring) - 3 * (0.7 + 0.6 + 0.4)) < 1e-9, 'the nerves of the three lost segments are no longer paid for: ' + wiring0 + ' -> ' + o.prof.wiring);
    const paid = o.prof.wiring, basal = o.prof.basal;
    for (let k = 0; k < 3; k++) { w.form(o, o.cx, o.cy, 0); assert.strictEqual(gone(), 3, 'rebuilt: still cut'); assert.strictEqual(w.counts.cut, 1, 'rebuilt: not cut, or counted, again'); assert.ok(Math.abs(o.prof.wiring - paid) < 1e-12 && Math.abs(o.prof.basal - basal) < 1e-12); }
    for (let i = 0; i < 60; i++) { w.step(); o.E = o.prof.Emax * 0.9; }
    const c = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))), o2 = c.bodies[0]; for (let i = 0; i < 60; i++) { w.step(); c.step(); o.E = o.prof.Emax * 0.9; o2.E = o2.prof.Emax * 0.9; }
    assert.strictEqual(c.counts.cut, 1, 'reloaded: the count is what it was'); assert.strictEqual(o2.b.segs.filter(q => q.gone).length, 3); assert.ok(Math.abs(o2.prof.wiring - paid) < 1e-12);
    assert.strictEqual(JSON.stringify([o2.cx, o2.cy]), JSON.stringify([o.cx, o.cy]), 'and it goes on as the world that was not reloaded'); }
  // as bodies were first built (without the rule) a segment eaten away stays, works and is paid for: unchanged
  { const { w, o, wiring0 } = cut(0); assert.strictEqual(o.b.segs.filter(q => q.gone).length, 0); assert.strictEqual(w.counts.cut || 0, 0); assert.ok(Math.abs(o.prof.wiring - wiring0) < 1e-12); }
});

test('the safety valve: a body whose numbers run away is taken out at once, and what broke is written down; the world goes on', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, swimmer = () => G.create({ parts: [G.part({ len: 0.8, r0: 0.4, r1: 0.4, muscle: 0, skin: 0.2, cilia: 0.8, mouth: 0.4, gut: 0.5, gonad: 0.3, nerve: 0.3, nC: 0.5, mCil: 0.5 })] });
  const mk = () => { const w = new A.engine.World({ seed: 8, contact: 1, vision: 1 }); w.seedWith(G.primordial(8)); w.spawn(swimmer(), 60, 40, 1, null); for (let i = 0; i < 60; i++) w.step(); return w; };
  // (the distances are chosen so that the test fails, and does not hang, on a version without the valve: beyond about 9e15 a search of the cells around a body
  // never ends, because adding 1 to such a number changes nothing - that is the fault the valve is for)
  for (const [name, spoil] of [['a huge speed', b => { for (let k = 0; k < b.np; k++) b.vx[k] = 3e7; }], ['far away', b => { for (let k = 0; k < b.np; k++) { b.x[k] += 1e6; b.ox[k] += 1e6; } }], ['not a number', b => { b.y[0] = NaN; }]]) {
    const w = mk(), o = w.bodies.find(q => !q.passive && q.b.segs[0].cil); assert.ok(o, 'a body that swims by itself'); spoil(o.b); w.step();
    assert.strictEqual(o.dead, 'broken', name + ': taken out in the same step'); assert.strictEqual(w.counts.broken, 1); assert.ok(!w.bodies.includes(o));
    const f = w.faults[0]; assert.strictEqual(f.id, o.id); assert.strictEqual(f.how, name === 'not a number' ? 'not a number' : 'far outside the world'); assert.ok(f.g && f.g.parts.length && f.body.x.length === o.b.np && Array.isArray(f.near), 'the record holds the genome, the body as it was left, and who was near');
    assert.ok(w.events.some(e => /物理の計算が破綻/.test(e.text) && e.id === o.id), 'and the world says so');
    for (let i = 0; i < 90; i++) w.step(); assert.ok(w.bodies.length > 0 && w.bodies.every(q => Number.isFinite(q.cx) && q.cx >= -1 && q.cx <= w.W + 1), name + ': the others go on');
    assert.strictEqual(w.census().unsound, 0); assert.strictEqual(w.census().broken, 1);
    const back = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); assert.strictEqual(back.faults.length, 1, 'the record is saved with the world'); assert.strictEqual(back.faults[0].id, o.id); }
  // a healthy world never trips it, and writes no record
  const w = mk(); for (let i = 0; i < 600; i++) w.step(); assert.strictEqual(w.counts.broken, 0); assert.strictEqual(w.faults, undefined); assert.strictEqual(JSON.parse(JSON.stringify(w.save())).faults, undefined);
});

test('the watch before the valve: a body an end of which moves at more than 60 a second is counted once and written down; nothing is done to it', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, swimmer = () => G.create({ parts: [G.part({ len: 0.8, r0: 0.4, r1: 0.4, muscle: 0, skin: 0.2, cilia: 0.8, mouth: 0.4, gut: 0.5, gonad: 0.3, nerve: 0.3, nC: 0.5, mCil: 0.5 })] });
  const w = new A.engine.World({ seed: 8, contact: 1, vision: 1 }); w.seedWith(G.primordial(8)); const o = w.spawn(swimmer(), 60, 40, 1, null); for (let i = 0; i < 60; i++) w.step();
  assert.strictEqual(w.counts.hasty, undefined); assert.strictEqual(w.nearFaults, undefined); assert.strictEqual(JSON.parse(JSON.stringify(w.save())).nearFaults, undefined, 'a healthy world writes nothing');
  const twin = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); // (the same world without the push: the watch must change nothing in it)
  for (let k = 0; k < o.b.np; k++) o.b.vx[k] = 4000; w.step();
  assert.ok(!o.dead && w.bodies.includes(o), 'the body stays'); assert.strictEqual(w.counts.hasty, 1); assert.strictEqual(w.counts.broken, 0);
  const f = w.nearFaults[0]; assert.strictEqual(f.id, o.id); assert.strictEqual(f.kind, 'fast'); assert.ok(f.speed > 60 && f.g && f.g.parts.length && 'build' in f && f.massMin > 0); assert.ok(w.events.some(e => /不具合の前ぶれ/.test(e.text) && e.id === o.id));
  for (let k = 0; k < o.b.np; k++) o.b.vx[k] = 5000; w.step(); assert.strictEqual(w.counts.hasty, 1, 'counted once a body'); assert.strictEqual(w.nearFaults.length, 1); assert.ok(w.nearFaults[0].speed >= f.speed, 'the record keeps the fastest');
  const back = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); assert.strictEqual(back.nearFaults.length, 1); assert.strictEqual(back.counts.hasty, 1); const ob = back.bodies.find(q => q.id === o.id); assert.ok(ob && ob.hasty > 60, 'and is not counted again after a reload');
  for (let k = 0; k < ob.b.np; k++) ob.b.vx[k] = 5000; back.step(); assert.strictEqual(back.counts.hasty, 1);
  // the fault record of the valve says which version of the program wrote it (null where the version is not loaded, as here)
  for (let k = 0; k < o.b.np; k++) o.b.vx[k] = 3e7; w.step(); assert.strictEqual(o.dead, 'broken'); assert.ok('build' in w.faults[0]);
  // and a world that is only watched goes exactly as an unwatched one would: the twin, stepped as far, is the same world as one stepped without ever being looked at
  const plain = A.engine.World.restore(JSON.parse(JSON.stringify(twin.save()))); for (let i = 0; i < 90; i++) { twin.step(); plain.step(); } assert.strictEqual(JSON.stringify(twin.save().bodies.map(b => [b.id, b.x, b.y, b.E])), JSON.stringify(plain.save().bodies.map(b => [b.id, b.x, b.y, b.E])));
});

test('a segment eaten down to a sliver does not make the body run away: the water never takes more than the momentum that is left', () => {
  // The fault of a user's world (v2.0.69, a body thrown out of the world at t = 5175): a chain of four segments whose last one had 6 % of its tissue left.
  // The water's drag was limited to "the momentum of the end in one step", counted with the segment's whole mass; what was left weighed a few thousandths
  // of that, so each step braked the end by hundreds of times its momentum and the speed grew. Here: the same kind of body, its last segment eaten down,
  // and a push on the end. Before the correction the push of 10 on a sliver of 0.005 ended at tens of thousands of units a second.
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, chain = () => G.create({ parts: [G.part({ len: 2.9, r0: 0.2, r1: 0.9, muscle: 0.04, skin: 0.08, cilia: 0.1, beat: 1, mouth: 0.4, gut: 0.5, gonad: 0.26, nerve: 0.26, range: 0.6, amp: 0.07, store: 0.09, stiff: 0.35 })], links: [G.link({ from: 0, to: 0, sym: 'none', n: 1, repeat: 3, at: 0.77, angle: -0.09, scale: 0.78 })] });
  for (const left of [0.2, 0.057, 0.02, 0.005, 0.001]) for (const push of [10, 300]) for (const along of [0, 1]) {
    const w = new A.engine.World({ seed: 5, founders: 0, contact: 1, solid: 1, flow: 0, grainRate: 0, bottomRate: 0 }), o = w.spawn(chain(), 60, 40, 1, null), b = o.b, n = b.segs.length;
    assert.ok(n >= 3 && !b.rigid, 'a jointed chain'); for (let i = 0; i < 30; i++) w.step();
    o.hp = new Array(n).fill(1); o.hp[n - 1] = left; w.wound(o); assert.ok(Math.min(...Array.from(b.m)) < 0.6 * left * b.segs[n - 1].mass, 'the end weighs what is left of it');
    const s = b.segs[n - 1], k = s.b; b.vx[k] += push * (along ? s.dx : -s.dy); b.vy[k] += push * (along ? s.dy : s.dx);
    let top = 0; for (let i = 0; i < 90; i++) { if (o.hp && o.hp[n - 1] !== left && !o.dead) { o.hp[n - 1] = left; w.wound(o); } /* (it heals fast: kept eaten) */ w.step(); if (o.dead) break; for (let q = 0; q < b.np; q++) top = Math.max(top, Math.abs(b.vx[q]) + Math.abs(b.vy[q])); }
    assert.ok(top < 60, 'left ' + left + ', push ' + push + (along ? ' along' : ' across') + ': the push dies away (fastest end after it: ' + top.toPrecision(3) + ')'); assert.strictEqual(w.counts.broken || 0, 0); assert.strictEqual(w.faults, undefined);
  }
  // a whole body is braked exactly as before: the limit only changes where tissue is missing
  { const w = new A.engine.World({ seed: 5, founders: 0, contact: 1, solid: 1, flow: 0, grainRate: 0, bottomRate: 0 }), o = w.spawn(chain(), 60, 40, 1, null); for (let i = 0; i < 60; i++) w.step(); assert.ok(o.b.segs.every(q => q.left == null), 'no segment of an unwounded body carries a reduced mass'); }
});

test('a reloaded world goes on exactly as the world that was not reloaded, also where neurons read the bend of a moving joint', () => {
  // (a neuron reads the bend its joint had before the last move; a reload used to hand it the bend the body was built with)
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, body = () => G.create({ parts: [G.part({ len: 2, r0: 0.5, r1: 0.5, gut: 0.4, store: 0.4, nerve: 0.5 }), G.part({ len: 1.2, r0: 0.25, r1: 0.2, muscle: 0.5, amp: 0.5, range: 0.9, nerve: 0.5, cilia: 0.6, nn: [{ b: 0, k: 0.6, in: [['j', 3]], out: [['C', 1.5], ['J', 0.5]] }] })],
    links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.5, off: 0.9, angle: 1.3, scale: 1, repeat: 1 }), G.link({ from: 1, to: 1, sym: 'none', at: 1, off: 0, angle: 0.2, scale: 0.9, repeat: 2 })] });
  const w = new A.engine.World({ seed: 3, n: 0, nerve2: 1 }), o = w.spawn(body(), 40, 30, 1, null); for (let i = 0; i < 47; i++) w.step();
  assert.ok(!o.b.rigid && o.b.segs.some(q => q.na && Math.abs(q.na[0]) > 0.01), 'the joints move and the neurons that read them are active');
  const c = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))), q = c.bodies[0], state = z => JSON.stringify([z.E, Array.from(z.b.x), Array.from(z.b.y), z.b.segs.map(s => [s.a, s.cd, s.theta, s.na ? Array.from(s.na) : 0])]);
  assert.deepStrictEqual(q.b.segs.map(s => s.theta), o.b.segs.map(s => s.theta), 'the bend the neurons will read');
  for (const n of [1, 30, 300]) { while (w.tick < 47 + n) { w.step(); c.step(); } assert.strictEqual(state(q), state(o), 'after ' + n + ' steps'); }
});

test('a crowded body that grows: parts of it that cannot be pushed apart make it tremble, not run away', () => {
  // The fault of a long run of a user's world (v2.0.71, four bodies of one lineage thrown out of the world within 150 s): a plan of 51 short, fat segments
  // on three kinds of part. While it grows, new segments a hundredth of a unit long appear among the others; its own parts push each other, the pushes turn
  // small segments over, the joints' stops throw them back, and each part of a step added speed. The genome is the recorded one (tests/fixtures).
  // Alone in the water, at the stage it had, it used to be gone in ten seconds.
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, d = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'crowded-body.json'), 'utf8')), body = () => G.create({ parts: d.parts.map(p => G.part(p)), links: d.links.map(l => G.link(l)), birth: d.birth, freq: d.freq });
  const rules = A.rules.normalize(Object.fromEntries(A.rules.catalog.filter(r => !['wave', 'vents', 'still'].includes(r.key)).map(r => [r.key, r.on])));
  for (const stage of [0.3, 0.46, 0.6]) { const w = new A.engine.World(Object.assign({}, rules, { seed: 11, map: 'coast', founders: 0 })), o = w.spawn(body(), 76.8, 100, stage, null);
    assert.ok(!o.b.rigid && o.b.segs.length >= 20 && o.self && o.self.length > 200, 'a jointed body of many segments that can touch itself'); assert.ok(Math.min(...o.b.segs.map(q => q.len)) < 0.06, 'with segments that have only begun to grow');
    let top = 0; for (let i = 0; i < 30 * 30; i++) { w.step(); if (o.dead) break; for (let k = 0; k < o.b.np; k++) top = Math.max(top, Math.hypot(o.b.vx[k], o.b.vy[k])); }
    assert.notStrictEqual(o.dead, 'broken', 'from stage ' + stage + ': not thrown out of the world'); assert.strictEqual(w.counts.broken || 0, 0); assert.ok(top < 3 * A.physics.K.vmax, 'no particle gets far past the limit on its speed against the body (fastest: ' + top.toPrecision(3) + ')');
    assert.ok(Math.abs(o.cx - 76.8) < 30 && Math.abs(o.cy - 100) < 30, 'and the body is still where a body can be');
    assert.strictEqual(w.counts.hasty, undefined, 'no end was fast without the limit holding it'); if (w.counts.trembled) { const f = w.nearFaults[0]; assert.strictEqual(f.kind, 'held'); assert.strictEqual(f.id, o.id); assert.ok(o.capped > 0); } }
});

test('every rule of the catalog at once: a world reloaded at any moment is the same world, down to every saved number, 150 steps later', () => {
  // Twice a new rule left something out of the save (the bend a neuron reads, a trace of matter), and the reloaded world went another way. The rules here are
  // taken from the catalog itself, so a rule added later is in this test without anyone remembering to add it; and what is compared is the whole save, so a
  // field added later is compared too. The bodies are a small zoo that makes the states a young world does not have: joints, wounds, neurons that have learnt
  // and rewired, matter in the water, pads that hold, a voice.
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, rules = A.rules.normalize(Object.fromEntries(A.rules.catalog.map(r => [r.key, r.on])));
  const zoo = [
    G.create({ parts: [G.part({ len: 2.9, r0: 0.2, r1: 0.9, muscle: 0.04, skin: 0.08, cilia: 0.1, beat: 1, mouth: 0.4, gut: 0.5, gonad: 0.26, nerve: 0.26, range: 0.6, amp: 0.07, store: 0.09, stiff: 0.35 })], links: [G.link({ from: 0, to: 0, sym: 'none', n: 1, repeat: 3, at: 0.77, angle: -0.09, scale: 0.78 })] }),
    G.create({ parts: [G.part({ len: 2, r0: 0.5, r1: 0.5, gut: 0.4, store: 0.4, nerve: 0.5, mouth: 0.3, cilia: 0.3, beat: 1 }), G.part({ len: 1.2, r0: 0.25, r1: 0.2, muscle: 0.5, amp: 0.5, range: 0.9, nerve: 0.5, cilia: 0.6, beat: 1, grip: 0.5, nLife: 0.5, nC: 1, sT: 1, mCil: 0.5, nn: [{ b: 0, k: 0.6, in: [['j', 3], ['t', 1, 0.5], ['c', 1, 0, 0.5]], out: [['C', 1.5], ['J', 0.5]] }] })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.5, off: 0.9, angle: 1.3, scale: 1, repeat: 1 }), G.link({ from: 1, to: 1, sym: 'none', at: 1, off: 0, angle: 0.2, scale: 0.9, repeat: 2 })] }),
    G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.5, skin: 0.1, cilia: 0.5, beat: 1, mouth: 0.4, gut: 0.5, gonad: 0.3, nerve: 0.4, gland: 0.3, mSec: 1, nB: 1, voice: 0.3, pitch: 0.4, mVoice: 1, ear: 0.3, hE: 1, eye: 0.2, vE: 1, sA: 1, sW: 1, mBite: -0.5 })] })];
  const w = new A.engine.World(Object.assign({}, rules, { seed: 7, map: 'coast' })); w.seedWith(G.primordial(7)); for (let i = 0; i < 18; i++) w.spawn(G.copy(zoo[i % 3]), 60 + (i % 6) * 2.2, 60 + Math.floor(i / 6) * 2.5, 1, null);
  for (const r of A.rules.catalog) assert.ok(w[r.key], 'the rule ' + r.key + ' is on');
  for (let i = 0; i < 240; i++) w.step();
  { const o = w.bodies.find(q => !q.b.rigid && q.b.segs.length >= 4); assert.ok(o, 'a jointed chain is alive'); if (!o.hp) o.hp = new Array(o.b.segs.length).fill(1); o.hp[o.b.segs.length - 1] = 0.3; w.wound(o); }
  const has = (name, n) => assert.ok(n > 0, 'the zoo makes ' + name);
  has('jointed bodies', w.bodies.filter(o => !o.b.rigid).length); has('wounded bodies', w.bodies.filter(o => o.hp && o.hp.some(h => h < 1)).length); has('neurons', w.bodies.filter(o => o.b.segs.some(q => q.na)).length);
  has('learnt connections', w.bodies.filter(o => o.b.segs.some(q => q.nw && q.nw.some(x => x !== 0))).length); has('connections that come and go', w.bodies.filter(o => o.b.segs.some(q => q.nz || q.sz)).length);
  has('matter in the water', Array.from(w.mat).filter(x => x > 0).length); has('vents', w.ventList.length); has('bodies that have sounded', w.bodies.filter(o => o.voN > 0).length); has('bodies that can touch themselves', w.bodies.filter(o => o.self).length); has('bodies that were held', w.bodies.filter(o => o.held != null).length); has('torn tissue', w.counts.torn);
  for (const more of [0, 150, 300]) { for (let i = 0; i < (more ? 150 : 0); i++) w.step(); const at = w.tick, c = A.engine.World.restore(JSON.parse(JSON.stringify(w.save())));
    for (let i = 0; i < 150; i++) { w.step(); c.step(); } const a = JSON.parse(JSON.stringify(w.save())), b = JSON.parse(JSON.stringify(c.save()));
    for (const k of Object.keys(a)) assert.strictEqual(JSON.stringify(b[k]), JSON.stringify(a[k]), 'reloaded at step ' + at + ': "' + k + '" of the save is the same 150 steps later'); assert.deepStrictEqual(Object.keys(b), Object.keys(a)); }
});

test('the written past stays within limits: old extinct plans and old ancestors keep their numbers but not their genomes; nothing in the world itself changes', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, mk = () => { const w = new A.engine.World({ seed: 7 }); w.seedWith(G.primordial(7)); for (let i = 0; i < 90; i++) w.step(); return w; }, w = mk(), plain = mk();
  // a long past, written in by hand: 500 extinct plans of 3 to 502 members, and a trunk of 300 dead ancestors under one living body (every fifth with a changed plan)
  const g0 = w.bodies[0].g, kind = w.bodies[0].kind;
  for (let i = 0; i < 500; i++) w.clades.set(900000 + i, { id: 900000 + i, from: 0, line: 1, kind, g: G.copy(g0), V: 1, born: -9000 + i, ended: -8000 + i, members: 3 + i, alive: 0, gen0: 1, genMax: 2, causes: {}, dead: 3 + i, eaten: 0, absorbed: 0, path: 0, lived: 0, kids: 0 });
  const live = w.tree.get(w.bodies[0].id), root0 = live.parent; let child = live;
  for (let i = 0; i < 300; i++) { const n = { id: 800000 + i, parent: null, line: live.line, gen: 0, born: -20000 - i * 10, died: -19990 - i * 10, cause: 'aged', kind, V: 1, hue: 1, kids: 1, changed: i % 5 === 0, g: Object.assign(G.copy(g0), { mutations: i }) }; w.tree.set(n.id, n); child.parent = n.id; child = n; }
  w.thin();
  const ended = [...w.clades.values()].filter(c => c.ended != null), kept = ended.filter(c => c.g);
  assert.strictEqual(kept.length, 200); assert.strictEqual(w.genomesDropped, 300); assert.strictEqual(ended.filter(c => c.id >= 900000).length, 500, 'the numbers of every plan stay');
  assert.ok(kept.some(c => c.members === 502) && kept.some(c => c.ended === -8000 + 499), 'the largest and the latest keep their genomes');
  const trunk = [...w.tree.values()].filter(n => n.id >= 800000), withG = trunk.filter(n => n.g);
  assert.ok(w.tree.get(800299).g, 'the one that began the line keeps its genome'); assert.strictEqual(withG.filter(n => n.changed && n.id !== 800299).length, 59 + (800299 % 5 === 0 ? 0 : 1), 'of the old ancestors whose plan changed, the latest sixty');
  assert.ok(trunk.filter(n => !n.changed && n.id !== 800299).every(n => n.g === null && typeof n.mut === 'number'), 'the others keep the count of their mutations, not the genome');
  assert.ok(w.bodies.every(o => w.tree.get(o.id).g === o.g), 'the living keep theirs');
  // the world itself: the same with the long past cut down as without any past written in; and it saves and reloads
  const state = z => JSON.stringify([z.t, z.rand.state(), z.bodies.map(o => [o.id, o.cx, o.cy, o.E, o.stage]), z.food.length, Array.from(z.nut).slice(0, 50)]);
  const c = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); for (let i = 0; i < 900; i++) { w.step(); plain.step(); c.step(); }
  assert.strictEqual(state(w), state(plain)); assert.strictEqual(state(c), state(plain)); assert.strictEqual(w.ancestors(w.bodies[0].id).filter(n => !n.g).length > 0, true);
  // limits set very high keep everything
  const all = mk(); Object.assign(all, { recordPlans: 1e9, recordAge: 1e12, recordSteps: 1e9 }); for (let i = 0; i < 300; i++) all.clades.set(900000 + i, { id: 900000 + i, kind, g: G.copy(g0), born: 0, ended: 1, members: 5, alive: 0, causes: {} }); all.thin(); assert.strictEqual([...all.clades.values()].filter(c => c.g && c.id >= 900000).length, 300);
});

test('brain: neurons can be wired to the root segment and to a name over the whole body; reach costs upkeep by distance; a part can hold 16 neurons; off by default', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, N = A.neural;
  // a chain of four segments: a trunk with cilia and neuron "0", two middle segments without neurons, a tip with neuron "1" that tastes
  const chain = (ref, w) => G.create({ parts: [G.part({ len: 1.2, r0: 0.5, r1: 0.45, cilia: 0.5, beat: -1, nerve: 0.5, gut: 0.5, mouth: 0.3, nn: [{ id: 0, b: 0, k: 1, in: [[ref, w == null ? 3 : w]], out: [['C', 1]] }] }), G.part({ len: 0.8, r0: 0.3, r1: 0.3, nerve: 0 }), G.part({ len: 0.6, r0: 0.25, r1: 0.2, nerve: 0.5, nn: [{ id: 1, b: 0, k: 1, in: [['c', 3]], out: [] }] })],
    links: [G.link({ from: 0, to: 1, at: 1, off: 0, angle: 0, scale: 1, repeat: 1 }), G.link({ from: 1, to: 1, at: 1, off: 0, angle: 0, scale: 1, repeat: 1 }), G.link({ from: 1, to: 2, at: 1, off: 0, angle: 0, scale: 1, repeat: 1, lo: 0.6, hi: 1 })] });
  const corr = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0; };
  // up: the trunk's cilia follow what the tip tastes only through the body-wide reading (d); the neighbour readings (children, parent, own segment) find nothing three segments away
  const up = ref => { const b = P.build(develop(chain(ref))), tip = b.segs.length - 1, taste = new Float64Array(b.segs.length).fill(0.5), xs = [], ys = []; assert.strictEqual(b.segs.length, 4);
    for (let i = 0; i < 600; i++) { taste[tip] = 0.5 + 0.45 * Math.sin(i / 25); N.local(b, taste, 0, null, null, false, false); if (i > 60) { xs.push(taste[tip]); ys.push(b.segs[0].cd); } } return corr(xs, ys); };
  assert.ok(up('d1') > 0.9, 'd reaches: ' + up('d1')); for (const ref of ['k1', 's1', 'p1']) assert.strictEqual(up(ref), 0, ref);
  // down: the tip's cilia follow what the trunk tastes through the reading of the root (r), not through the reading of the parent
  const down = ref => { const g = chain('c'); g.parts[2].cilia = 0.5; g.parts[2].nn = [{ id: 1, b: 0, k: 1, in: [[ref, 3]], out: [['C', 1]] }]; const b = P.build(develop(g)), tip = b.segs.length - 1, taste = new Float64Array(b.segs.length).fill(0.5), xs = [], ys = [];
    for (let i = 0; i < 600; i++) { taste[0] = 0.5 + 0.45 * Math.sin(i / 25); N.local(b, taste, 0, null, null, false, false); if (i > 60) { xs.push(taste[0]); ys.push(b.segs[tip].cd); } } return corr(xs, ys); };
  assert.ok(down('r0') > 0.9); assert.strictEqual(down('p0'), 0);
  // a neuron does not hear itself through d: alone with its name, it reads nothing
  { const g = chain('d0'); const b = P.build(develop(g)), taste = new Float64Array(4).fill(0.9); for (let i = 0; i < 50; i++) N.local(b, taste, 0, null, null, false, false); assert.strictEqual(b.segs[0].na[0], 0); }
  // reach costs: half the connection's strength per segment of distance (to the root: the segment's depth; to a name over the body: its depth and the body's mean depth)
  const pw = g => A.organs.profile(develop(g)).wiring, C = A.organs.C; assert.ok(Math.abs(pw(chain('d1')) - pw(chain('s1')) - C.far * 3 * 1.5) < 1e-12, 'trunk, d, strength 3, mean depth 1.5');
  { const g1 = chain('c'), g2 = chain('c'); g1.parts[2].nn = [{ id: 1, b: 0, k: 1, in: [['r0', 2]], out: [] }]; g2.parts[2].nn = [{ id: 1, b: 0, k: 1, in: [['s0', 2]], out: [] }]; assert.ok(Math.abs(pw(g1) - pw(g2) - C.far * 2 * 3) < 1e-12, 'tip, r, strength 2, depth 3'); }
  assert.strictEqual(pw(chain('s1')), pw(chain('k1')), 'neighbour connections cost what they did');
  // mutation: more than four neurons, far connections and copied blocks only where the world has the rule (and names: without names the rule does nothing)
  const count = flags => { let m = chain('s1'), big = 0, far = 0; const r = G.rng(11); for (let i = 0; i < 300; i++) { m = G.mutate(m, r, 1, flags); if (m.parts.some(p => p.nn && p.nn.length > G.NN_MAX)) big++; if (m.parts.some(p => (p.nn || []).some(q => q.in.some(e => e[0].length === 2 && G.NN_FAR.includes(e[0][0]))))) far++; assert.ok(m.parts.every(p => !p.nn || p.nn.length <= G.NN_BIG)); } return [big, far]; };
  assert.deepStrictEqual(count('nw'), [0, 0]); assert.deepStrictEqual(count('nb'), [0, 0]); const on = count('nwb'); assert.ok(on[0] > 50 && on[1] > 50, on.join());
  // a genome with far connections and many neurons survives sanitising, copying and a world's save and reload; the rule is off by default and asks for names
  const big = chain('d1'); big.parts[0].nn = Array.from({ length: 12 }, (_, i) => ({ id: i === 1 ? 20 : i, b: 0, k: 1, in: [['d1', 1], ['r0', 0.5]], out: i ? [] : [['C', 1]] })); assert.strictEqual(G.sanitize(G.copy(big)).parts[0].nn.length, 12);
  assert.strictEqual(new A.engine.World({ seed: 1 }).brain, 0); assert.deepStrictEqual([A.rules.normalize({ brain: 1 }).wire, A.rules.normalize({ brain: 1 }).nerve2], [1, 1]);
  const w = new A.engine.World({ seed: 5, founders: 0, cap: 0, nerve2: 1, wire: 1, brain: 1 }); w.spawn(G.copy(big), 60, 40, 1, null); for (let i = 0; i < 200; i++) w.step();
  const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))); for (let i = 0; i < 200; i++) { w.step(); w2.step(); } const sig = x => JSON.stringify(x.bodies.map(q => [q.cx, q.cy, q.E, q.b.segs.map(s => (s.na ? Array.from(s.na) : null))])); assert.strictEqual(sig(w2), sig(w)); assert.ok(w.bodies[0].b.segs[0].na.length === 12);
});

test('rewire: a connection withers while it is not used and forms while it is, at a heritable speed; the body pays only for what is there; the same genome wires differently in different lives; off by default', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, N = A.neural, C = A.organs.C, dt = 1 / 30;
  // one segment, one neuron that drives the cilia; its connections are given in each case
  const one = ins => G.create({ parts: [G.part({ len: 1.2, r0: 0.5, r1: 0.45, cilia: 0.5, beat: -1, nerve: 0.5, gut: 0.5, mouth: 0.3, nn: [{ id: 0, b: 0, k: 1, in: ins, out: [['C', 1]] }] })], links: [] });
  const live = (g, taste, secs, rew) => { const b = P.build(develop(g)), t = new Float64Array(1); for (let i = 0; i < secs * 30; i++) { t[0] = taste(i / 30); N.local(b, t, 0.6, null, null, false, true, 0, false, rew == null ? dt : rew); } return b; };
  const wave = s => 0.5 + 0.45 * Math.sin(s * 1.2), flat = () => 0.5, pw = g => A.organs.profile(develop(g)).wiring;
  // born present (+0.5): the taste connection, used, stays; the touch connection, never used (nothing touches), is gone after 200 s, and the wiring paid for shrinks by its share
  { const g = one([['c', 3, 0, 0.5], ['t', 2, 0, 0.5]]), b = live(g, wave, 200), z = b.segs[0].nz; assert.ok(z[0] > 0.8 && z[1] < 0.1, Array.from(z).join());
    assert.ok(Math.abs(b.wd - N.REW.share * (3 * (z[0] - 1) + 2 * (z[1] - 1))) < 1e-9, 'what it now pays less'); assert.ok(pw(g) + b.wd < pw(g) - 1.7);
    // the same genome in water that never changes: the taste connection is not used either, and goes
    const still = live(g, flat, 200); assert.ok(still.segs[0].nz[0] < 0.1 && z[0] - still.segs[0].nz[0] > 0.3, 'two lives, two circuits'); }
  // not there at birth (-0.5): costs a tenth of its strength until it forms; forms from a source that is active with the neuron (hunger), not from a silent one (touch)
  { const g = one([['c', 3], ['h', 2, 0, -0.5], ['t', 2, 0, -0.5]]), b0 = live(g, wave, 0.1), b = live(g, wave, 100), z = b.segs[0].nz; assert.ok(b0.segs[0].nz[1] < 0.02 && b0.segs[0].nz[0] === 1); assert.ok(z[1] > 0.8 && z[2] < 0.05, Array.from(z).join());
    assert.ok(Math.abs(pw(g) - (pw(one([['c', 3], ['h', 2], ['t', 2]])) - 2 * N.REW.share * 2 + 2 * N.REW.gene * 0.5)) < 1e-12, 'static cost: the share that is only paid once formed is left out, the ability itself is charged'); assert.ok(b.wd > 1.5); }
  // a connection that is not there carries nothing: with the taste connection withered, the neuron no longer follows the water
  { const g = one([['c', 3, 0, 1]]), b = live(g, flat, 300), t = new Float64Array(1); let lo = 9, hi = -9; assert.ok(b.segs[0].nz[0] < 0.01); for (let i = 0; i < 60; i++) { t[0] = wave(i / 30); N.local(b, t, 0.6, null, null, false, true, 0, false, 0.000001); lo = Math.min(lo, b.segs[0].na[0]); hi = Math.max(hi, b.segs[0].na[0]); } assert.ok(hi - lo < 0.05, 'deaf to it: ' + (hi - lo)); }
  // without the rule (no time passed to the rule): the genes do nothing, every connection is there in full, nothing is tracked
  { const b = live(one([['c', 3, 0, 0.5], ['t', 2, 0, -0.5]]), wave, 20, 0); assert.strictEqual(b.segs[0].nz, undefined); assert.strictEqual(b.wd, undefined); }
  // in a world: the upkeep really paid is lower by what has withered; the state survives save and reload exactly, and growth; off by default
  const spend = (ins, rewire) => { const w = new A.engine.World({ seed: 5, founders: 0, cap: 0, nerve2: 1, contact: 1, rewire, audit: 1 }), o = w.spawn(one(ins), 60, 40, 1, null); o.E = o.prof.Emax; for (let i = 0; i < 9000; i++) w.step(); return { w, basal: w.ledger.basal }; };
  const fixed = spend([['c', 3], ['t', 2]], 1), goes = spend([['c', 3], ['t', 2, 0, 0.5]], 1), off = spend([['c', 3], ['t', 2, 0, 0.5]], 0);
  assert.ok(fixed.basal - goes.basal > C.synapse * (0.9 * 2 * 200 - 0.1 * 300) && fixed.basal - goes.basal < C.synapse * 0.9 * 2 * 300, 'saved: ' + (fixed.basal - goes.basal)); assert.ok(off.basal > fixed.basal, 'where the rule is off the gene only costs');
  assert.strictEqual(new A.engine.World({ seed: 1 }).rewire, 0); assert.strictEqual(A.rules.normalize({ rewire: 1 }).nerve2, 1);
  const w = goes.w, w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))), nz = x => JSON.stringify(x.bodies.map(q => [q.E, q.b.segs.map(s => (s.nz ? Array.from(s.nz) : null))])); assert.strictEqual(nz(w2), nz(w)); for (let i = 0; i < 300; i++) { w.step(); w2.step(); } assert.strictEqual(nz(w2), nz(w));
  { const k = new A.engine.World({ seed: 5, founders: 0, cap: 0, nerve2: 1, contact: 1, rewire: 1, carry: 1 }), o = k.spawn(one([['c', 3], ['t', 2, 0, 0.5]]), 60, 40, 0.6, null); for (let i = 0; i < 3000; i++) k.step(); const before = Array.from(o.b.segs[0].nz); assert.ok(before[1] < 0.2); o.stage = Math.min(1, o.stage + 0.1); k.form(o, o.cx, o.cy, 0); assert.deepStrictEqual(Array.from(o.b.segs[0].nz), before, 'what a body has wired stays through growth'); }
  // mutation gives the genes only where the world has the rule
  const count = flags => { let m = one([['c', 3], ['t', 2]]), n = 0; const r = G.rng(11); for (let i = 0; i < 200; i++) { m = G.mutate(m, r, 1, flags); if (m.parts.some(p => (p.nn || []).some(q => q.u != null || q.in.some(e => e[3])))) n++; } return n; };
  assert.strictEqual(count('nwl'), 0); assert.ok(count('nwy') > 100);
});

test('nest: a gland lays matter into the water when its circuit drives it and the body pays for it; matter stays, fades slowly, calms the water and catches drifting grains; off by default', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, C = A.organs.C;
  // the primordial blob with a gland and a resting signal; `sec` = how hard that signal drives the gland
  const body = (sec, gland) => { const g = G.primordial(1); Object.assign(g.parts[0], { gland: gland == null ? 0.3 : gland, nerve: 0.3, nB: 1, mSec: sec }); return G.sanitize(g); };
  const world = (o, g) => { const w = new A.engine.World(Object.assign({ seed: 1, founders: 0, cap: 0, audit: 1 }, o)), b = g ? w.spawn(g, 60, 40, 1, null) : null; return { w, b }; }, total = w => w.mat.reduce((a, b) => a + b, 0);
  // it secretes as hard as it is driven, the matter is in the water, and every unit was paid for; a gland nobody drives lays nothing but still costs upkeep
  { const { w, b } = world({ nest: 1 }, body(1)); for (let i = 0; i < 900; i++) w.step(); const se = b.b.segs[0].se, rate = C.secrete * b.prof.V * 0.3 * se; assert.ok(Math.abs(se - Math.tanh(1)) < 0.01, 'driven by its resting signal: ' + se);
    assert.ok(Math.abs(b.secreted - rate * 30) < 0.02 * rate * 30, b.secreted + ' vs ' + rate * 30); assert.ok(Math.abs(w.ledger.secreted - b.secreted) < 1e-9 && Math.abs(w.counts.secreted - b.secreted) < 1e-9);
    assert.ok(total(w) > 0.97 * b.secreted / C.matter && total(w) <= b.secreted / C.matter + 1e-6, 'the matter laid, less what has faded: ' + total(w));
    const idle = world({ nest: 1 }, body(0)); for (let i = 0; i < 900; i++) idle.w.step(); assert.strictEqual(total(idle.w), 0); assert.strictEqual(idle.b.secreted, undefined);
    assert.ok(Math.abs(A.organs.profile(develop(body(0))).basal - A.organs.profile(develop(body(0, 0))).basal - C.upkeep.gland * 0.3 * b.prof.V) < 1e-9, 'gland tissue costs upkeep'); }
  // without the rule: the same genome lays nothing and nothing is tracked; the rule is off by default; a body that cannot move still runs its circuit where it has a gland to drive
  { const { w, b } = world({}, body(1)); for (let i = 0; i < 300; i++) w.step(); assert.strictEqual(w.mat, undefined); assert.strictEqual(b.secreted, undefined); assert.strictEqual(b.passive, true); assert.strictEqual(new A.engine.World({ seed: 1 }).nest, 0);
    assert.strictEqual(world({ nest: 1 }, body(1)).b.passive, false); assert.strictEqual(world({ nest: 1 }, body(1, 0)).b.passive, true); }
  // matter outlives its maker and fades by half in matHalf seconds
  { const { w, b } = world({ nest: 1, matHalf: 20 }, body(1)); for (let i = 0; i < 600; i++) w.step(); b.dead = 'aged'; w.step(); assert.strictEqual(w.bodies.length, 0); const m0 = total(w); assert.ok(m0 > 0.05); for (let i = 0; i < 600; i++) w.step(); assert.ok(Math.abs(total(w) / m0 - 0.5) < 0.03, 'half after 20 s: ' + total(w) / m0); }
  // water with matter in it moves less: the current is divided by 1 + matter / matCalm, exactly, and so is what carries a body
  { const a = world({ nest: 1 }).w, b = world({ nest: 1 }).w, ci = b.cellAt(60, 30); b.mat[ci] = 3; b.stepMatter(0); for (let i = 0; i < 40; i++) { a.step(); b.step(); } const fa = a.flowAt(60, 30), fb = b.flowAt(60, 30), k = 1 / (1 + b.mat[ci] / b.matCalm);
    assert.ok(Math.abs(fa[0]) > 1e-3); assert.ok(Math.abs(fb[0] - fa[0] * k) < 1e-6 && Math.abs(fb[1] - fa[1] * k) < 1e-6, fb + ' vs ' + fa); assert.deepStrictEqual(a.flowAt(20, 30), b.flowAt(20, 30), 'elsewhere the water is as it was'); }
  // drifting grains catch in it: after two minutes, a band of matter holds several times the grains of the same band without
  { const band = w => { let n = 0; for (const f of w.food) if (f.e > 0 && f.x >= 40 && f.x < 80 && f.y >= 20 && f.y < 44) n++; return n; }, a = world({ nest: 1 }).w, b = world({ nest: 1 }).w;
    for (let i = 0; i < b.mat.length; i++) { const x = (i % b.cols + 0.5) * b.cell, y = (Math.floor(i / b.cols) + 0.5) * b.cell; if (x >= 40 && x < 80 && y >= 20 && y < 44) b.mat[i] = 4; } b.stepMatter(0);
    for (let i = 0; i < 3600; i++) { a.step(); b.step(); } assert.ok(band(b) > 1.5 * band(a) + 3, 'grains in the band: ' + band(b) + ' with matter, ' + band(a) + ' without'); }
  // matter holds a body against the current, more strongly than it calms the water: the same body, 20 s, in a cell with matter and in one without
  { const drift = m => { const { w, b } = world({ nest: 1 }, body(0)); if (m) { for (let i = 0; i < w.mat.length; i++) w.mat[i] = m; w.stepMatter(0); } const x0 = b.cx, y0 = b.cy; for (let i = 0; i < 600; i++) w.step(); return Math.hypot(b.cx - x0, b.cy - y0); };
    const free = drift(0), held = drift(1), k = 1 / ((1 + 1 / 1) * (1 + 1 / 0.1)); assert.ok(free > 0.5, 'it drifts: ' + free); assert.ok(held < 0.12 * free && held > 0.2 * k * free, 'held: ' + held + ' against ' + free + ' (the current on it is ' + k.toFixed(3) + ' of what it was)'); }
  // a grain that runs out its time in matter rots into the water there, the more matter the larger the share; outside matter it is lost as before; the ledger shows both
  { const { w } = world({ nest: 1 }); for (let i = 0; i < 30; i++) w.step(); const ci = w.cellAt(60, 30), cj = w.cellAt(20, 30); w.mat[ci] = 3; w.stepMatter(0); w.food.length = 0; w.addFood(60, 30, 0.3, 2, true, 0.5); w.addFood(20, 30, 0.3, 2, true, 0.5);
    const n0 = [w.nut[ci], w.nut[cj]]; for (const k in w.ledger) w.ledger[k] = 0; for (let i = 0; i < 31; i++) w.step(); const gain = w.nut[ci] - n0[0], other = w.nut[cj] - n0[1];
    const m1 = 3 * Math.pow(0.5, 1 / w.matHalf), share = 2 * m1 / (m1 + 1); /* (the matter had faded for one second when the grain ran out) */ assert.ok(Math.abs(w.counts.composted - share) < 1e-5, 'about three quarters of it at matter 3: ' + w.counts.composted); assert.ok(gain > other + 0.3, 'the water there is richer for it (and it spreads to the cells around, as dissolved food does): ' + gain + ' against ' + other);
    assert.ok(Math.abs(w.ledger.composted - share) < 1e-5 && Math.abs(w.ledger.expire - (4 - share)) < 1e-5 && w.ledger.recycled >= share - 1e-5, JSON.stringify([w.ledger.composted, w.ledger.expire, w.ledger.recycled])); }
  // water with matter in it mixes less: a rich cell inside matter keeps its dissolved food longer than the same cell in open water; mixing itself neither makes nor loses any
  { const keep = m => { const { w } = world({ nest: 1, nutrientRegrow: 0 }); const ci = w.cellAt(60, 30); if (m) { for (let i = 0; i < w.mat.length; i++) { const x = (i % w.cols + 0.5) * w.cell, y = (Math.floor(i / w.cols) + 0.5) * w.cell; if (Math.abs(x - 60) < 6 && Math.abs(y - 30) < 6) w.mat[i] = m; } w.stepMatter(0); }
      w.nut.fill(0.3); w.nut[ci] = 1; const total = w.nut.reduce((a, b) => a + b, 0); for (let i = 0; i < 150; i++) { w.food.length = 0; w.step(); } return { left: w.nut[ci] - 0.3, drift: Math.abs(w.nut.reduce((a, b) => a + b, 0) - total) }; };
    const open = keep(0), mat = keep(4); assert.ok(open.left < 0.12, 'in open water it is gone in 5 s: ' + open.left); assert.ok(mat.left > 2 * open.left && mat.left > 0.15, 'in matter it stays: ' + mat.left + ' against ' + open.left); assert.ok(open.drift < 1e-3 && mat.drift < 1e-3, 'nothing made or lost: ' + open.drift + ' ' + mat.drift); }
  // saved and reloaded, the world goes on exactly as it was going
  { const { w } = world({ nest: 1 }, body(1)); for (let i = 0; i < 917; i++) w.step(); const c = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))), sig = x => JSON.stringify([Array.from(x.mat), Array.from(x.calm), x.bodies.map(o => [o.cx, o.cy, o.E, o.secreted]), x.food.length, x.rand.state()]); assert.strictEqual(sig(c), sig(w)); for (let i = 0; i < 600; i++) { w.step(); c.step(); } assert.strictEqual(sig(c), sig(w)); }
  // ... also where a gland is driven so weakly that a cell holds only a trace of matter, below what the next fading step keeps (a reload used to drop the trace at once,
  // and the grains passing through that cell then drew one random number fewer each than in the world that was not reloaded)
  { const { w } = world({ nest: 1 }, body(0.00005)); for (let i = 0; i < 917; i++) w.step(); const trace = Array.from(w.mat).filter(v => v > 0 && v < 1e-6).length; assert.ok(trace > 0, 'a cell with a trace of matter');
    const c = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))), sig = x => JSON.stringify([Array.from(x.mat), x.bodies.map(o => [o.cx, o.cy, o.E]), x.food.length, x.rand.state()]); assert.strictEqual(sig(c), sig(w)); for (let i = 0; i < 90; i++) { w.step(); c.step(); } assert.strictEqual(sig(c), sig(w)); }
  // the energy ledger still balances with matter being made
  { const { w } = world({ nest: 1 }, body(1)); for (const k in w.ledger) w.ledger[k] = 0; const s0 = w.stored(); for (let i = 0; i < 1500; i++) w.step(); const L = w.ledger, IN = ['rain', 'regrow', 'placed', 'mutation', 'recycled', 'arrived'], inflow = IN.reduce((x, k) => x + (L[k] || 0), 0), out = Object.keys(L).filter(k => !IN.includes(k)).reduce((x, k) => x + L[k], 0); assert.ok(L.secreted > 0.1); assert.ok(Math.abs((w.stored() - s0) - (inflow - out)) < 1e-6 * Math.max(1, inflow)); }
  // mutation gives glands, their drive and the neurons' new target only where the world has the rule
  const count = flags => { let m = G.primordial(3), n = 0; const r = G.rng(7); for (let i = 0; i < 300; i++) { m = G.mutate(m, r, 1, flags); if (m.parts.some(p => (p.gland || 0) > 0 || (p.mSec || 0) !== 0 || (p.nn || []).some(q => q.out.some(e => e[0] === 'S')))) n++; } return n; };
  assert.strictEqual(count('xvgcn'), 0); assert.ok(count('xvgcnq') > 100);
  // where genomes mix: the genes of glands join the row of genes that is cut only in worlds with the rule, so every other world draws the same cuts as before
  // (adding two genes to the row once shifted every cut in worlds that mix genomes; the six-world state check caught it)
  { const a = body(1), b = body(0, 0), kids = nest => { let moved = 0; for (let k = 0; k < 60; k++) { const c = G.recombine(a, b, G.rng(100 + k), false, false, false, nest); if (c.parts[0].gland !== a.parts[0].gland || c.parts[0].mSec !== a.parts[0].mSec) moved++; } return moved; };
    assert.strictEqual(kids(false), 0, 'without the rule the mother keeps her gland genes'); assert.ok(kids(true) > 5, 'with it they mix like any other gene');
    const row = f => Object.keys(G.PART_FIELDS).filter(k => !f.includes(G.PART_FIELDS[k][4])).length; assert.strictEqual(row(['s', 'q', 'y']), 45, 'the row that worlds without sound, glands and rewiring cut has the length it had'); }
});

test('vents: the water regains its dissolved food fast in a few small places and slowly elsewhere, the same capacity over the whole; vents close and open elsewhere; off by default', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const mk = o => new A.engine.World(Object.assign({ seed: 2, founders: 0, cap: 0, audit: 1 }, o));
  // off by default, and then nothing of it exists; the catalogue lists it as a kind of water, without a gene flag
  { const w = mk({}); assert.strictEqual(w.vents, 0); assert.strictEqual(w.ventList, undefined); const r = A.rules.catalog.find(q => q.key === 'vents'); assert.ok(r && r.flag === '' && r.requires.length === 0); }
  // one vent per ventArea of water; the factor on regrowth is ventLean outside and, inside the discs, as much more as keeps the mean over the water near 1
  { const w = mk({ map: 'coast', vents: 1 }); assert.strictEqual(w.ventList.length, 8); for (let i = 0; i < 1200; i++) w.step(); /* (every vent fully open: the first ones are given an age when the world starts, but a vent may be fading) */
    for (const v of w.ventList) { v.born = w.t - 100; v.until = w.t + 100; } const f = w.ventField(); let sum = 0, rich = 0, mx = 0; for (const v of f) { sum += v; if (v > w.ventLean) rich++; if (v > mx) mx = v; }
    assert.ok(Math.abs(sum / f.length - 1) < 0.12, 'mean factor ' + sum / f.length); assert.ok(mx > 15 && rich > 60 && rich < 140, mx + ' in ' + rich + ' cells'); assert.ok(Array.from(f).every(v => v === w.ventLean || Math.abs(v - mx) < 1e-6));
    // a fading vent is in between; a closed one is replaced by another somewhere else, and the count stays
    const v0 = w.ventList[0], at = [v0.x, v0.y]; v0.until = w.t + 15; const half = w.ventField()[w.cellAt(v0.x, v0.y)]; assert.ok(half > w.ventLean + 1 && half < mx - 1, 'half open: ' + half); v0.until = w.t - 1; w.ventField(); assert.strictEqual(w.ventList.length, 8); assert.ok(w.ventList[0].x !== at[0] && w.ventList[0].born === w.t && w.ventList[0].until > w.t + 0.7 * w.ventLife); }
  // what it does to the water: drained to the same level everywhere, a cell in a vent is well above the rest while a cell far from any vent has regained half as much as it would without vents
  { const drained = o => { const w = mk(Object.assign({ map: 'coast' }, o)); for (let i = 0; i < 60; i++) w.step(); if (w.ventList) for (const v of w.ventList) { v.born = w.t - 100; v.until = w.t + 1e6; } w.nut.fill(0.2); for (let i = 0; i < 600; i++) w.step(); return w; }, a = drained({ vents: 1 }), b = drained({});
    const far = (() => { let best = 0, bi = 0; for (let i = 0; i < a.nut.length; i++) { const d = a.ventDist((i % a.cols + 0.5) * a.cell, (Math.floor(i / a.cols) + 0.5) * a.cell); if (d > best && a.hRegrow[i] > 0.9) { best = d; bi = i; } } return bi; })(), v = a.ventList[0], vi = a.cellAt(v.x, v.y);
    assert.ok(a.nut[vi] > a.nut[far] + 0.25 && a.nut[vi] > b.nut[vi] + 0.2, 'in a vent: ' + a.nut[vi] + ' (it spreads into the water around, so a vent does not sit at the cap)'); assert.ok(a.nut[far] < b.nut[far] - 0.02 && a.nut[far] > 0.2 && Math.abs((a.nut[far] - 0.2) / (b.nut[far] - 0.2) - 0.5) < 0.15, 'far from any: ' + a.nut[far] + ' against ' + b.nut[far] + ' without vents');
    assert.ok(a.ledger.regrow > 0 && Number.isFinite(a.ledger.regrow)); }
  // a world saved with vents goes on exactly as it was going, through a vent closing and another opening; and the rule can be switched on in a running world
  { const w = mk({ vents: 1, ventLife: 20, founders: 20 }); w.seedWith(A.genome.primordial(2)); for (let i = 0; i < 400; i++) w.step(); const c = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))), sig = x => JSON.stringify([Array.from(x.nut), x.ventList, x.rand.state(), x.bodies.map(o => [o.cx, o.cy, o.E])]); assert.strictEqual(sig(c), sig(w)); const before = JSON.stringify(w.ventList);
    for (let i = 0; i < 1200; i++) { w.step(); c.step(); } assert.strictEqual(sig(c), sig(w)); assert.notStrictEqual(JSON.stringify(w.ventList), before, 'the vents have moved');
    const p = mk({ founders: 20 }); p.seedWith(A.genome.primordial(2)); for (let i = 0; i < 60; i++) p.step(); p.enable({ vents: 1 }); assert.ok(p.ventList.length >= 1); for (let i = 0; i < 60; i++) p.step(); p.enable({ vents: 0 }); assert.strictEqual(p.ventList, null); for (let i = 0; i < 30; i++) p.step(); }
});

test('rewire, the single signal: a segment\'s own input connections wither while unused and form while used, by one gene of the part; the body pays for what is there; off by default', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, N = A.neural, C = A.organs.C, dt = 1 / 30;
  // one segment whose single signal tastes (strength 3) and feels touch (strength 2) and drives the cilia
  const one = o => G.create({ parts: [G.part(Object.assign({ len: 1.2, r0: 0.5, r1: 0.45, cilia: 0.5, beat: -1, nerve: 0.5, gut: 0.5, mouth: 0.3, nC: 3, sT: 2, mCil: 1 }, o))], links: [] });
  const live = (g, taste, secs, rew) => { const b = P.build(develop(g)), t = new Float64Array(1); for (let i = 0; i < secs * 30; i++) { t[0] = taste(i / 30); N.local(b, t, 0.6, null, null, false, true, 0, false, rew == null ? dt : rew); } return b; };
  const wave = s => 0.5 + 0.45 * Math.sin(s * 1.2), flat = () => 0.5, pw = g => A.organs.profile(develop(g)).wiring, TASTE = N.INPUTS.indexOf('nC'), TOUCH = N.INPUTS.indexOf('sT'), HUNGER = N.INPUTS.indexOf('nH');
  // born present (+0.5): the taste input, used, stays; the touch input, never used, goes; the wiring paid for shrinks by nine tenths of what went
  { const g = one({ nLife: 0.5 }), b = live(g, wave, 200), z = b.segs[0].sz; assert.ok(z[TASTE] > 0.7 && z[TOUCH] < 0.1, Array.from(z).join()); assert.ok(Math.abs(b.wd - N.REW.share * (3 * (z[TASTE] - 1) + 2 * (z[TOUCH] - 1))) < 1e-9);
    assert.ok(Math.abs(pw(g) - pw(one({})) - N.REW.gene * 0.5) < 1e-12, 'the ability costs a fifth of the gene'); assert.ok(live(g, flat, 200).segs[0].sz[TASTE] < 0.1, 'in water that never changes the taste input goes too'); }
  // a withered input carries nothing: the signal no longer follows the water
  { const b = live(one({ nLife: 1 }), flat, 300), t = new Float64Array(1); let lo = 9, hi = -9; assert.ok(b.segs[0].sz[TASTE] < 0.01); for (let i = 0; i < 60; i++) { t[0] = wave(i / 30); N.local(b, t, 0.6, null, null, false, true, 0, false, 1e-6); lo = Math.min(lo, b.segs[0].a); hi = Math.max(hi, b.segs[0].a); } assert.ok(hi - lo < 0.05); }
  // not there at birth (-0.5): a signal with a resting level gathers the inputs that are active with it (taste, hunger) and not the silent one (touch); they cost a tenth until formed.
  // Without a resting level nothing is ever active together with the signal, and nothing forms.
  { const g = one({ nLife: -0.5, nH: 2, nB: 1 }), b = live(g, wave, 100), z = b.segs[0].sz; assert.ok(z[TASTE] > 0.5 && z[HUNGER] > 0.8 && z[TOUCH] < 0.05, Array.from(z).join());
    assert.ok(Math.abs(pw(g) - (pw(one({ nH: 2, nB: 1 })) - N.REW.share * (3 + 2 + 2) + N.REW.gene * 0.5)) < 1e-12); assert.ok(b.wd > 2);
    const dead = live(one({ nLife: -0.5, nH: 2 }), wave, 100).segs[0].sz; assert.ok(dead[TASTE] === 0 && dead[HUNGER] === 0, 'a silent signal gathers nothing'); }
  // without the rule the genes do nothing and nothing is tracked
  { const b = live(one({ nLife: 0.5 }), wave, 20, 0); assert.strictEqual(b.segs[0].sz, undefined); assert.strictEqual(b.wd, undefined); }
  // in a world: less upkeep is really paid; the state survives save and reload exactly, and growth; a part that builds its circuit late pays nothing for the ability before
  const spend = (o, rewire) => { const w = new A.engine.World({ seed: 5, founders: 0, cap: 0, contact: 1, rewire, audit: 1 }), b = w.spawn(one(o), 60, 40, 1, null); b.E = b.prof.Emax; for (let i = 0; i < 9000; i++) w.step(); return { w, basal: w.ledger.basal }; };
  const fixed = spend({}, 1), goes = spend({ nLife: 0.5 }, 1), off = spend({ nLife: 0.5 }, 0); assert.ok(fixed.basal - goes.basal > C.synapse * (0.9 * 2 * 200 - 0.1 * 300), 'saved: ' + (fixed.basal - goes.basal)); assert.ok(off.basal > fixed.basal, 'where the rule is off the gene only costs');
  { const w = goes.w, w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))), sig = x => JSON.stringify(x.bodies.map(q => [q.E, q.cx, q.b.segs.map(s => (s.sz ? Array.from(s.sz) : null))])); assert.strictEqual(sig(w2), sig(w)); for (let i = 0; i < 300; i++) { w.step(); w2.step(); } assert.strictEqual(sig(w2), sig(w)); }
  { const k = new A.engine.World({ seed: 5, founders: 0, cap: 0, contact: 1, rewire: 1, carry: 1 }), o = k.spawn(one({ nLife: 0.5 }), 60, 40, 0.6, null); for (let i = 0; i < 3000; i++) k.step(); const before = Array.from(o.b.segs[0].sz); assert.ok(before[TOUCH] < 0.2); o.stage = Math.min(1, o.stage + 0.1); k.form(o, o.cx, o.cy, 0); assert.deepStrictEqual(Array.from(o.b.segs[0].sz), before); }
  assert.strictEqual(A.organs.profile(develop(one({ nLife: 0.5, nAt: 0.9 }), { stage: 0.5, late: 1 })).wiring, 0, 'no circuit yet, nothing to pay');
  // mutation moves the two genes only where the world has the rule; where genomes mix they join the row only there too
  const count = flags => { let m = one({}), n = 0; const r = G.rng(11); for (let i = 0; i < 200; i++) { m = G.mutate(m, r, 1, flags); if (m.parts.some(p => p.nLife !== 0 || p.nUse !== 0.15)) n++; } return n; };
  assert.strictEqual(count('xvgcnl'), 0); assert.ok(count('xvgcny') > 100);
  { const a = one({ nLife: 0.7, nUse: 0.5 }), b = one({}), kids = rew => { let moved = 0; for (let k = 0; k < 60; k++) { const c = G.recombine(a, b, G.rng(100 + k), false, false, false, false, rew); if (c.parts[0].nLife !== 0.7 || c.parts[0].nUse !== 0.5) moved++; } return moved; }; assert.strictEqual(kids(false), 0); assert.ok(kids(true) > 5);
    assert.strictEqual(Object.keys(G.PART_FIELDS).filter(k => !['s', 'q', 'y'].includes(G.PART_FIELDS[k][4])).length, 45, 'the row that other worlds cut has the length it had'); }
});

test('still water: what is dissolved passes between cells more slowly, so a body\'s own surroundings stay drained and the water a few cells away stays rich; off by default', () => {
  for (const f of ['organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
  const G = A.genome, mk = o => new A.engine.World(Object.assign({ seed: 2, founders: 0, cap: 0, audit: 1, nutrientRegrow: 0 }, o));
  { const w = mk({}); assert.strictEqual(w.still, 0); const r = A.rules.catalog.find(q => q.key === 'still'); assert.ok(r && r.on === 25 && r.flag === ''); assert.strictEqual(A.rules.normalize({ still: 25 }).still, 25); }
  // one rich cell in even water: after 5 s it has all but gone in ordinary water and is mostly still there in still water; mixing neither makes nor loses any
  { const left = still => { const w = mk({ still }), ci = w.cellAt(60, 30); w.nut.fill(0.3); w.nut[ci] = 1; const total = w.nut.reduce((a, b) => a + b, 0); for (let i = 0; i < 150; i++) { w.food.length = 0; w.step(); } return { left: w.nut[ci] - 0.3, drift: Math.abs(w.nut.reduce((a, b) => a + b, 0) - total) }; };
    const open = left(0), slow = left(25); assert.ok(open.left < 0.12, 'ordinary water: ' + open.left); assert.ok(slow.left > 0.4, 'still water: ' + slow.left); assert.ok(open.drift < 1e-3 && slow.drift < 1e-3); }
  // the same holds for what bodies leak
  { const smell = still => { const w = new A.engine.World({ seed: 2, founders: 0, cap: 0, scent: 1, still }), ci = w.cellAt(60, 30); for (let i = 0; i < 12; i++) w.step(); w.scA.fill(0); w.scA[ci] = 1; for (let i = 0; i < 60; i++) w.step(); return w.scA[ci]; }; assert.ok(smell(25) > 2 * smell(0), smell(25) + ' against ' + smell(0)); }
  // a body in still water drains its own cell more, and the water two cells away stays richer than where it is
  { const around = still => { const w = new A.engine.World({ seed: 2, founders: 0, cap: 0, still, nutrientRegrow: 0.01 }), g = G.primordial(1), o = w.spawn(g, 60, 30, 1, null); for (let i = 0; i < 3000; i++) w.step(); const cx = Math.floor(o.cx / w.cell), cy = Math.floor(o.cy / w.cell), at = (dx, dy) => w.nut[(cy + dy) * w.cols + ((cx + dx) % w.cols + w.cols) % w.cols]; return [at(0, 0), (at(3, 0) + at(-3, 0) + at(0, 3) + at(0, -3)) / 4]; };
    const a = around(0), b = around(25); assert.ok(b[1] - b[0] > 2 * (a[1] - a[0]) && b[1] - b[0] > 0.02, 'still water: ' + b.map(v => v.toFixed(3)) + ', ordinary: ' + a.map(v => v.toFixed(3))); }
  // saved and reloaded it goes on as it was going; it can be switched in a running world
  { const w = new A.engine.World({ seed: 3, still: 25, scent: 1 }); w.seedWith(G.primordial(3)); for (let i = 0; i < 400; i++) w.step(); const c = A.engine.World.restore(JSON.parse(JSON.stringify(w.save()))), sig = x => JSON.stringify([Array.from(x.nut), Array.from(x.scA), x.rand.state(), x.bodies.map(o => [o.cx, o.E])]); for (let i = 0; i < 300; i++) { w.step(); c.step(); } assert.strictEqual(sig(c), sig(w)); assert.strictEqual(c.still, 25);
    w.enable({ still: 0 }); assert.strictEqual(w.still, 0); w.enable({ still: 25 }); assert.strictEqual(w.still, 25); for (let i = 0; i < 30; i++) w.step(); }
});
