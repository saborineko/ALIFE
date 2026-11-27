const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../alife2-genome.js');for(const f of ['development','neural','physics','organs','engine','bodyplan','explorer'])require('../alife2-'+f+'.js');
const all=A.rules.normalize(Object.fromEntries(A.rules.catalog.map(r=>[r.key,r.on])));
const diagnostic=()=>A.genome.create({parts:[A.genome.part({nerve:1,ear:.8,voice:.5,cilia:.4,nn:[{b:1,k:1,in:[['e',2,.4]],out:[['V',1],['C',1]]}]})],links:[]});
const observe=(g,opt)=>{const x=new A.explorer.Observation(g,opt);while(!x.done)x.step();return x;};

test('shared catalog covers engine defaults and preserves legacy mutation flag ordering',()=>{
 assert.equal(A.rules.flags(all),'xvgcnidlswtbyq');
 assert.equal(A.rules.flags({...all,mutsplit:0}),'xvgmcnidlswtbyq');
 assert.equal(A.rules.flags({}),'');
 for(const r of A.rules.catalog)assert.equal(A.engine.DEFAULTS[r.key],r.default,r.key);
 const q=A.rules.normalize({learn:1,wire:1,solid:1,soundWork:1,mix:1});
 assert.equal(q.nerve2,1);assert.equal(q.contact,1);assert.equal(q.sound,1);
});
test('optional mutation creates neural, acoustic and plastic genes and remains reproducible',()=>{
 function run(rules){const x=new A.explorer.Explorer({seed:42,depth:100,rules});const items=[];for(let i=0;i<200;i++){const q=x.one();if(q)items.push(q);}return {x,items};}
 const a=run(all),b=run(all);assert.deepEqual(a.x.list(),b.x.list());assert.equal(a.x.failed,0);
 assert.ok(a.items.some(q=>q.anatomy.neurons>0));assert.ok(a.items.some(q=>q.anatomy.voices>0));assert.ok(a.items.some(q=>q.anatomy.ears>0));assert.ok(a.items.some(q=>q.anatomy.plastic>0));
 const old=run({});assert.ok(old.items.every(q=>q.anatomy.neurons===0&&q.anatomy.voices===0&&q.anatomy.ears===0));
});
test('classification distinguishes equal anatomy with different neurons, receptors and effectors',()=>{
 const plain=A.genome.create(),rich=diagnostic();
 const a=A.explorer.inspect(plain,64,all),b=A.explorer.inspect(rich,64,all);
 assert.equal(a.shape.segments,b.shape.segments);assert.notEqual(a.key,b.key);
 assert.equal(b.anatomy.neurons,1);assert.equal(b.anatomy.plastic,1);assert.equal(b.anatomy.ears,1);assert.equal(b.anatomy.voices,1);
 assert.equal(A.explorer.inspect(rich,64,{}).anatomy.wiredNeurons,1); // the existing engine retains encoded circuits even when neural mutation is off
});
test('autonomous observation uses real neural, voice and learning state; neutral trials have exact controls',()=>{
 const rules={sound:1,nerve2:1,learn:1,keep:1};
 const neutral=observe(diagnostic(),{rules,seconds:5}),a=neutral.result();
 assert.ok(a.samples.length>20);assert.ok(a.samples.every(s=>s.neuralDelta===0&&s.learningDelta===0));
 assert.ok(a.samples.some(s=>s.voiceEnergy>0&&s.learning>0));
 const stim=observe(diagnostic(),{rules,seconds:6,stimulus:'sound'}).result();
 assert.ok(stim.samples.filter(s=>s.t<2).every(s=>s.neuralDelta===0));
 assert.ok(stim.samples.some(s=>s.t>2&&s.neuralDelta>1e-5));
 assert.ok(stim.samples.some(s=>s.learningDelta>1e-5));
 assert.ok(stim.samples.every(s=>Object.entries(s).every(([k,v])=>typeof v!=='number'||Number.isFinite(v))));
 assert.throws(()=>new A.explorer.Observation(diagnostic(),{stimulus:'sound'}),/音規則/);
});
test('exported specimen preserves rules but introduction does not alter current ecosystem configuration',()=>{
 const file=A.explorer.specimenFile(diagnostic(),all,160),w=new A.engine.World({seed:8,sound:0,keep:1});
 w.seedWith(A.genome.primordial(2),2);w.step();const t=w.t,old=w.bodies.slice();
 const got=w.introduce(JSON.parse(JSON.stringify(file)),{count:100,age:'juvenile',place:'ocean'});
 assert.equal(got.length,100);assert.equal(w.t,t);assert.equal(w.sound,0);assert.equal(w.keep,1);assert.equal(w.maxSegs,64);assert.ok(old.every(o=>w.bodies.includes(o)));
 assert.deepEqual(got[0].introduction.explorationRules,all);
 const trial=A.explorer.makeWorld(diagnostic(),4,true,{rules:all,cap:160,count:50,place:'bottom',age:'juvenile'});
 assert.equal(trial.w.bodies.length,70);assert.equal(trial.w.maxSegs,160);assert.equal(trial.w.sound,1);assert.ok(trial.specimens.every(o=>trial.w.isGround(o.cx,o.cy)&&o.stage===o.g.birth));
});
