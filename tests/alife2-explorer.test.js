// Run: node --test tests/alife2-explorer.test.js
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../alife2-genome.js');
for(const n of ['development','neural','physics','organs','engine','bodyplan','explorer'])require('../alife2-'+n+'.js');
test('same seed produces the same diverse archive, with no natural-evolution labels',()=>{
 function run(){const x=new A.explorer.Explorer({seed:42,depth:50});for(let i=0;i<240;i++)x.one();return x;}
 const a=run(),b=run();assert.deepEqual(a.list(),b.list());assert.equal(a.count,240);assert.equal(a.failed,0);assert.ok(a.list().length>20);assert.ok(a.list().some(q=>q.shape.segments>10));assert.ok(a.list().every(q=>!q.truncated&&q.genome.origin==='artificial-mutated'&&q.shape.segments<=64));
});
test('explored genome is accepted by physics, ecology and world save/restore',()=>{
 const x=new A.explorer.Explorer({seed:42,depth:50});for(let i=0;i<60;i++)x.one();
 const q=x.list().find(q=>q.shape.segments>2);
 assert.ok(q);assert.ok(A.explorer.motion(q.genome).ok);
 const {w,specimen}=A.explorer.makeWorld(q.genome,42,true);assert.equal(w.bodies.length,21);
 for(let i=0;i<90;i++)w.step();
 assert.ok(Number.isFinite(specimen.E));assert.ok(A.engine.World.restore(w.save()).bodies.length>0);
});
test('descendants of an explored genome are never labelled as natural evolution',()=>{
 const x=new A.explorer.Explorer({seed:42,depth:50});for(let i=0;i<60;i++)x.one();
 const q=x.list().find(q=>q.shape.segments>2),{w,specimen}=A.explorer.makeWorld(q.genome,42,true);w.mutation=0.7;specimen.E=specimen.prof.Emax;
 for(let i=0;i<30*400&&specimen.kids===0&&!specimen.dead;i++)w.step();
 const kids=w.bodies.filter(o=>o.parent===specimen.id);assert.ok(kids.length>0);assert.ok(kids.every(k=>k.g.origin==='evolved-from-artificial'));
 assert.ok(w.bodies.filter(o=>o.gen>0&&o.line!==specimen.line).every(o=>o.g.origin==='evolved'));
});
