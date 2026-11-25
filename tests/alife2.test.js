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
});

test('a saved world comes back with the same bodies, reserves, genealogy and record', () => {
  const w = new A.engine.World({ seed: 4 }); w.seedWith(A.genome.primordial(4));
  for (let i = 0; i < 30 * 120; i++) w.step();
  const w2 = A.engine.World.restore(JSON.parse(JSON.stringify(w.save())));
  assert.strictEqual(w2.bodies.length, w.bodies.length); assert.strictEqual(w2.tree.size, w.tree.size); assert.strictEqual(w2.events.length, w.events.length);
  const sum = x => x.bodies.reduce((a, o) => a + o.E, 0); assert.ok(Math.abs(sum(w) - sum(w2)) < 1e-9);
  assert.deepStrictEqual(w2.bodies.map(o => [o.id, o.gen, o.line, o.stage]), w.bodies.map(o => [o.id, o.gen, o.line, o.stage]));
  for (let i = 0; i < 300; i++) w2.step(); assert.ok(w2.bodies.length > 0);
  assert.throws(() => A.engine.World.restore({ format: 'alife16' }));
});
