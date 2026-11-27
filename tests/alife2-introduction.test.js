const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine', 'bodyplan', 'explorer']) require('../alife2-' + f + '.js');
const W = opt => new A.engine.World(Object.assign({ seed: 42 }, opt));
const genome = () => A.genome.primordial(7);
const saved = w => JSON.parse(JSON.stringify(w.save()));

test('introduce 1, 50, 100 explored genomes without resetting existing state', () => {
  const ex = new A.explorer.Explorer({seed: 7,depth:3}); ex.one(); // the explorer exports a raw genome
  const w = W(); w.seedWith(genome(), 2); for(let i=0;i<3;i++) w.step();
  const before = saved(w), bodies = w.bodies.slice(), input = ex.list()[0].genome, original = JSON.stringify(input);
  for(const count of [1,50,100]) {
    const got = w.introduce(input, {count});
    assert.equal(got.length,count); assert.equal(new Set(got.map(o=>o.line)).size,1);
    assert.ok(got.every(o=>o.g.origin==='artificial-introduced' && o.stage===1));
  }
  const after = saved(w);
  for(const k of ['t','tick','nut','food','opt','history','firsts']) assert.deepEqual(after[k],before[k],k);
  assert.deepEqual(after.bodies.slice(0,2),before.bodies);
  assert.ok(bodies.every((o,i)=>o===w.bodies[i])); assert.equal(JSON.stringify(input),original);
  assert.equal(w.counts.introduced,151); assert.equal(w.introductions.length,3);
  assert.ok(w.events.some(e=>e.text.includes('人為的')));
});

test('placement and growth stage obey choices in tank and coast', () => {
  for(const map of ['', 'coast']) for(const place of ['random','center','ocean','bottom']) for(const age of ['adult','juvenile']) {
    const w=W({map}), g=genome(), got=w.introduce(g,{count:5,place,age,center:{x:27,y:33}});
    for(const o of got) {
      assert.equal(o.stage,age==='adult'?1:g.birth);
      if(place==='center') { assert.ok(Math.abs(o.cx-27)<1e-8); assert.ok(Math.abs(o.cy-33)<1e-8); }
      if(place==='bottom') assert.ok(w.isGround(o.cx,o.cy));
      if(place==='ocean') { assert.ok(!w.isGround(o.cx,o.cy)); if(w.regions) assert.equal(w.regions[w.regionAt(o.cx)].name,'外洋'); }
    }
  }
});

test('invalid input leaves world and random stream untouched', () => {
  const w=W();
  for(const [g,opt] of [[{},{}],[Object.assign(genome(),{hue:null}),{}],[genome(),{count:0}],[genome(),{count:1.5}],[genome(),{count:1001}],[genome(),{place:'bad'}],[genome(),{age:'bad'}],[genome(),{place:'center',center:{x:NaN,y:0}}]]) {
    const before=saved(w); assert.throws(()=>w.introduce(g,opt)); assert.deepEqual(saved(w),before);
  }
});

test('introduction ancestry survives birth, save/restore, map transfer and island migration', () => {
  const w=W({keep:1}), root=w.introduce(genome(),{count:2,age:'juvenile'})[0];
  const child=w.spawn(A.genome.copy(root.g),20,20,root.g.birth,root);
  assert.deepEqual(child.introduction,root.introduction);
  assert.deepEqual(w.tree.get(child.id).introduction,root.introduction);
  const restore=A.engine.World.restore(saved(w));
  assert.deepEqual(restore.bodies.map(o=>o.introduction),w.bodies.map(o=>o.introduction));
  w.step();restore.step();assert.deepEqual(saved(restore),saved(w));
  const moved=A.engine.World.transplant(w,'coast'); assert.deepEqual(moved.bodies[0].introduction,root.introduction);
  const list=w.emigrate(2), island=W({seed:99,keep:1}), arrivals=island.immigrate(list,0);
  assert.equal(arrivals.length,2); assert.ok(arrivals.every(o=>o.introduction.root===root.introduction.root));
  const kid=island.spawn(A.genome.copy(arrivals[0].g),20,20,0.3,arrivals[0]); assert.deepEqual(kid.introduction,root.introduction);
  assert.deepEqual(A.engine.World.restore(saved(island)).tree.get(kid.id).introduction,root.introduction);
});

test('ordinary reproduction marks descendants as artificial ancestry', () => {
  const w=W(), root=w.introduce(genome())[0]; root.E=root.prof.Emax; root.egg=root.eggCost;
  w.step();
  const kid=w.bodies.find(o=>o.parent===root.id);
  assert.ok(kid); assert.equal(kid.g.origin,'evolved-from-artificial');
  assert.deepEqual(kid.introduction,root.introduction); assert.equal(kid.line,root.line);
  assert.deepEqual(w.firsts,{});
});

test('where genes mix, a young that carries an introduced body\'s genes is marked as of artificial descent, whichever parent laid the egg', () => {
  const w = W({ contact: 1, mix: 1, mutation: 0 }); w.seedWith(genome(), 2); for (let i = 0; i < 3; i++) w.step();
  const mother = w.bodies[0]; mother.g.origin = 'evolved'; const guest = w.introduce(Object.assign(A.genome.primordial(9), { hue: 300 }), { count: 1 })[0];
  mother.got = { id: guest.id, g: guest.g }; mother.E = mother.prof.Emax; mother.egg = mother.eggCost;
  for (let i = 0; i < 5 && !w.bodies.some(o => o.parent === mother.id); i++) w.step();
  const kid = w.bodies.find(o => o.parent === mother.id); assert.ok(kid && kid.p2 === guest.id);
  assert.equal(kid.g.origin, 'evolved-from-artificial'); assert.deepEqual(kid.introduction, guest.introduction); assert.deepEqual(w.tree.get(kid.id).introduction, guest.introduction);
  assert.equal(kid.line, mother.line); assert.equal(mother.introduction, undefined); assert.deepEqual(w.firsts, {});
  // two natural parents: nothing changes
  const v = W({ contact: 1, mix: 1, mutation: 0 }); v.seedWith(genome(), 2); for (let i = 0; i < 3; i++) v.step(); const [a, b] = v.bodies; a.g.origin = b.g.origin = 'evolved';
  a.got = { id: b.id, g: b.g }; a.E = a.prof.Emax; a.egg = a.eggCost; for (let i = 0; i < 5 && !v.bodies.some(o => o.parent === a.id); i++) v.step();
  const k2 = v.bodies.find(o => o.parent === a.id); assert.ok(k2 && k2.p2 === b.id); assert.equal(k2.g.origin, 'evolved'); assert.equal(k2.introduction, undefined);
});
