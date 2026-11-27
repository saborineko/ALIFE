// wireGrow (optional rule): the upkeep of a segment's nerve connections follows how much of the segment has grown.
const test = require('node:test'), assert = require('node:assert');
const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const G = A.genome, wired = () => { const g = G.primordial(1); Object.assign(g.parts[0], { nerve: 0.5, nC: 1.5, mCil: 0.8, cilia: 0.3 }); return g; };

test('wireGrow: an adult pays what it paid before; the young pay less, by the share of the segment that has grown; without the rule nothing differs', () => {
  const g = wired(), C = A.organs.C, adult = A.development.develop(g, {}), baby = A.development.develop(g, { stage: g.birth });
  assert.deepStrictEqual(A.organs.profile(adult, 0), A.organs.profile(adult), 'rule off: the same profile');
  const a0 = A.organs.profile(adult), a1 = A.organs.profile(adult, 1); assert.strictEqual(a1.basal, a0.basal, 'adult: the same upkeep'); assert.strictEqual(a1.wireCost, a0.wiring * C.synapse);
  const b0 = A.organs.profile(baby), b1 = A.organs.profile(baby, 1); assert.ok(b0.wiring > 1 && b1.wiring === b0.wiring, 'the circuit is the same');
  const v = p => p.segs.reduce((s, q) => s + Math.PI * (q.r0 + q.r1) / 2 * (q.z0 + q.z1) / 2 * q.len, 0), share = v(baby) / v(adult);
  assert.ok(Math.abs(b1.wireCost / (b0.wiring * C.synapse) - share) < 0.02, 'the young pay by volume: ' + b1.wireCost / (b0.wiring * C.synapse) + ' against ' + share);
  assert.ok(Math.abs((b0.basal - b1.basal) - (b0.wiring * C.synapse - b1.wireCost)) < 1e-12, 'nothing else in the upkeep changes');
  for (const k of ['V', 'Emax', 'buildCost', 'gutCap']) assert.strictEqual(b1[k], b0[k]);
});

test('wireGrow in a world: off by default, not in the catalog of rules, can be switched in a running world, and such a world restores exactly', () => {
  assert.strictEqual(A.engine.DEFAULTS.wireGrow, 0); assert.ok(!A.rules.catalog.some(r => r.key === 'wireGrow'), 'not offered by the pages');
  const mk = o => { const w = new A.engine.World(Object.assign({ seed: 6, founders: 0 }, o)); for (let i = 0; i < 6; i++) w.spawn(wired(), 20 + 10 * i, 30, 0.3, null); return w; };
  const off = mk({}), on = mk({ wireGrow: 1 }); assert.ok(on.bodies[0].prof.basal < off.bodies[0].prof.basal);
  off.enable({ wireGrow: 1 }); assert.strictEqual(off.bodies[0].prof.basal, on.bodies[0].prof.basal, 'switched on in a running world'); off.enable({ wireGrow: 0 }); assert.strictEqual(off.bodies[0].prof.basal, mk({}).bodies[0].prof.basal);
  for (let i = 0; i < 300; i++) on.step(); const copy = A.engine.World.restore(JSON.parse(JSON.stringify(on.save()))); assert.strictEqual(copy.wireGrow, 1);
  for (let i = 0; i < 300; i++) { on.step(); copy.step(); } assert.strictEqual(JSON.stringify(copy.bodies.map(o => [o.id, o.cx, o.E, o.prof.basal])), JSON.stringify(on.bodies.map(o => [o.id, o.cx, o.E, o.prof.basal])));
});
