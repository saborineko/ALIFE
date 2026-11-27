const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../alife2-genome.js');
for (const f of ['development','neural','physics','organs','rules','engine','observer']) require('../alife2-'+f+'.js');
const make = opt => { const w = new A.engine.World({ seed: 81, founders: 12, ...opt }); w.seedWith(A.genome.primordial(81)); return w; };
const plain = w => JSON.parse(JSON.stringify(w.save()));
const advance = (w, n) => { for(let i=0;i<n;i++) w.step(); };
test('observer ON, OFF, toggled and restored have identical full world state and RNG', () => {
  for (const opt of [{}, { map:'coast', ...A.rules.normalize(Object.fromEntries(A.rules.catalog.map(r=>[r.key,r.on]))) }]) {
    const a=make(opt), b=A.engine.World.restore(plain(a)), o=A.observer.attach(b);
    advance(a,2100); advance(b,2100); assert.deepEqual(plain(b),plain(a));
    o.setEnabled(false); advance(a,60); advance(b,60); o.setEnabled(true);
    advance(a,60); advance(b,60); assert.deepEqual(plain(b),plain(a));
    const c=A.observer.restoreWorld(JSON.parse(JSON.stringify(A.observer.saveWorld(b))));
    advance(a,180); advance(b,180); advance(c,180); assert.deepEqual(plain(c),plain(a)); assert.deepEqual(plain(b),plain(a));
    assert.deepEqual(A.observer.get(c).window(60).counts,A.observer.get(b).window(60).counts);
  }
});
test('global and regional balances include introduced bodies, births, deaths and island exchange', () => {
  const w=make({map:'coast'}), o=A.observer.attach(w), other=make({map:'coast'});
  w.introduce(A.genome.primordial(7),{count:3});
  const packets=w.emigrate(2); other.immigrate(packets,1); w.immigrate(other.emigrate(1),2);
  // A known crossing, then a recorded death, including crossing on the death tick.
  const b=w.bodies[0]; b.cx=w.regions[1].x0+5; b.E=-100;
  advance(w,2100);
  const z=o.window(1000); assert.equal(z.residual,0); assert.equal(z.counts.introduced,3); assert.equal(z.counts.arrived,1); assert.equal(z.counts.left,2);
  for(const r of z.regions) assert.equal(r.residual,0,JSON.stringify(r));
  assert.equal(z.regions.reduce((n,r)=>n+r.counts.in,0),z.regions.reduce((n,r)=>n+r.counts.out,0));
});
test('history round trip preserves dedup, records, sequence, balances and bounded memory', () => {
  const w=make(), o=A.observer.attach(w); advance(w,2100);
  const saved=JSON.parse(JSON.stringify(A.observer.saveWorld(w))), r=A.observer.restoreWorld(saved), b=A.observer.get(r);
  assert.deepEqual(b.events,o.events); assert.deepEqual(b.window(60),o.window(60));
  advance(w,600); advance(r,600); assert.deepEqual(b.events,o.events);
  for(let i=0;i<2500;i++) o.emit(w.t,'fake'+i,'title','text');
  assert.equal(o.events.length,300); assert.equal(new Set(o.events.map(e=>e.id)).size,300);
  for(let i=0;i<600;i++) { w.t+=2; o.sample(w,true); } assert.equal(o.samples.length,502);
});
test('no success claim for birth, rare temporary structure, immigration or missing historical group', () => {
  const w=make(), o=A.observer.attach(w); w.introduce(A.genome.primordial(9),{count:10}); advance(w,2100);
  assert.ok(!o.events.some(e=>e.key.startsWith('established-')));
  assert.ok(!o.events.some(e=>e.title.includes('成功')));
  const q=new A.observer.Notebook(); q.emit(0,'x','test','text'); q.emit(0,'x','test','text'); assert.equal(q.events.length,1);
  q.emit(301,'x','test','text'); assert.equal(q.events.length,2);
  o.setEnabled(false); advance(w,300); o.setEnabled(true); assert.equal(o.window(60).elapsed,0); assert.equal(o.window(60).residual,0);
});
test('save does not mutate engine serialization; mismatched notebook starts a fresh baseline', () => {
  const w=make(), before=plain(w); A.observer.attach(w); const d=A.observer.saveWorld(w); assert.deepEqual(plain(w),before);
  assert.ok(d.ecosystemObserver); d.ecosystemObserver.tick++; const r=A.observer.restoreWorld(d); assert.equal(A.observer.get(r).samples.length,1);
});
test('all three windows use simulation time and never bridge a gap; birth-only growth is not establishment', () => {
  const w=make({founders:1}), o=A.observer.attach(w);
  // Synthetic clock fixtures exercise the notebook without pretending these are evolved outcomes.
  for(let t=2;t<=1020;t+=2) { w.t=t; o.sample(w,true); }
  for(const seconds of [60,300,1000]) { const z=o.window(seconds); assert.ok(z.complete); assert.equal(z.elapsed,seconds); assert.equal(z.residual,0); }
  o.setEnabled(false); w.t+=100; o.setEnabled(true); assert.equal(o.window(1000).elapsed,0); assert.equal(o.window(1000).complete,false);
  const d=o.save(w); assert.equal(o.restore(w,d),true); w.rand(); assert.equal(o.restore(w,d),false);
});
test('record thresholds and extinct/rare/introduced clades cannot masquerade as successful establishment', () => {
  const w=make({founders:1}), o=A.observer.attach(w), b=w.bodies[0], c=w.clades.get(b.clade);
  c.members=100; c.genMax=9; c.ended=w.t; c.alive=0; c.dead=100; c.causes={left:100};
  o.analyse(w,o.samples.at(-1)); assert.equal(o.extinctions.departures,1); o.analyse(w,o.samples.at(-1)); assert.equal(o.extinctions.departures,1);
  assert.ok(!o.events.some(e=>e.key.startsWith('established-')||e.key.startsWith('extinct-')));
  o.records.segments=b.full.segs; o.analyse(w,o.samples.at(-1)); assert.ok(!o.events.some(e=>e.key==='record-segments'));
});
test('island worker observes, saves, swaps and toggles without changing its world', async () => {
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'), root=path.join(__dirname,'..'), messages=[];
  let clock=0;
  const ctx=vm.createContext({ console, Blob, Response, Buffer, atob, btoa, performance:{now:()=>clock+=30}, location:{search:''}, postMessage:m=>messages.push(m), MessageChannel:class { constructor(){this.port1={};this.port2={postMessage(){}};} } });
  ctx.self=ctx; ctx.importScripts=(...files)=>files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f}));
  vm.runInContext(fs.readFileSync(path.join(root,'alife2-island.js'),'utf8'),ctx);
  const source=make({founders:2}), d=JSON.stringify(plain(source)); ctx.packet={type:'start',text:d,count:0,paused:false};
  await vm.runInContext('handle(packet)',ctx);
  for(let i=0;i<50;i++) vm.runInContext('ch.port1.onmessage()',ctx);
  const raw=JSON.parse(vm.runInContext('JSON.stringify(w.save())',ctx));
  advance(source,raw.tick); assert.deepEqual(raw,plain(source));
  ctx.packet={type:'save',id:1}; await vm.runInContext('handle(packet)',ctx); const saved=JSON.parse(await messages.find(m=>m.type==='saved').blob.text()); assert.ok(saved.ecosystemObserver);
  ctx.packet={type:'observer',enabled:false}; await vm.runInContext('handle(packet)',ctx); assert.equal(vm.runInContext('A.observer.get(w).enabled',ctx),false);
  ctx.packet={type:'swap',id:2,text:JSON.stringify(saved)}; await vm.runInContext('handle(packet)',ctx);
  assert.equal(vm.runInContext('A.observer.get(w).events.length',ctx),saved.ecosystemObserver.events.length);
  assert.ok(messages.some(m=>m.type==='status'&&m.s.observer)); assert.ok(messages.some(m=>m.type==='swapped'));
});
test('UI snapshots freeze event-time state; optional speech stays off and throttles without a queue', async () => {
  const vm=require('node:vm'), fs=require('node:fs'), path=require('node:path'); let now=100000, said=0, downloaded=null;
  const elements=new Map(), pen=new Proxy({}, {get:()=>()=>{}});
  const el=()=>({checked:false,value:'60',textContent:'',style:{},children:[],width:420,height:130,append(...xs){this.children.push(...xs);},replaceChildren(){this.children=[];},getContext:()=>pen,click(){if(this.href)downloaded=this.href;}});
  const document={getElementById:id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);},createElement:()=>el()};
  const ctx=vm.createContext({ALIFE2:A,document,Blob,performance:{now:()=>now},URL:{createObjectURL:b=>b,revokeObjectURL(){}},setTimeout(){},speechSynthesis:{speaking:false,cancel(){},speak(){said++;}},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},CustomEvent:class{},dispatchEvent(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../alife2-observer-ui.js'),'utf8'),ctx);
  const w=make({founders:2}); A.observerUI.bind(w,()=>{}); const o=A.observer.get(w);
  assert.equal(elements.get('observerSpeech').checked,false); assert.equal(elements.get('observerSnapshot').checked,false);
  elements.get('observerSnapshot').checked=true; const before=plain(w);
  o.emit(w.t,'snapshot-test','検証','検証',{},null,'観測事実',true); advance(w,30); A.observerUI.render(); elements.get('observerSnapshotSave').onclick();
  const data=JSON.parse(await downloaded.text()); delete data.ecosystemObserver; assert.deepEqual(data,before); assert.equal(said,0);
  elements.get('observerSpeech').checked=true; o.emit(w.t,'speak-1','検証','検証',{},null,'観測事実',true); A.observerUI.render(); assert.equal(said,1);
  now+=29999; o.emit(w.t,'speak-2','検証','検証',{},null,'観測事実',true); A.observerUI.render(); assert.equal(said,1);
  now++; o.emit(w.t,'speak-3','検証','検証',{},null,'観測事実',true); A.observerUI.render(); assert.equal(said,2);
});
