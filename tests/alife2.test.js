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
