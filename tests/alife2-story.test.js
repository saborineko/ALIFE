const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../alife2-genome.js');
for(const f of ['development','neural','physics','organs','rules','engine','observer']) require('../alife2-'+f+'.js');
// Synthetic census fixtures: test what is said, not pretend these populations evolved in a trial.
const target={id:7,line:7,clade:7,kind:'2/2/0/0/1'};
function fixture() {
  const w=new A.engine.World({seed:9,founders:1}); w.seedWith(A.genome.primordial(9));
  const o=A.observer.attach(w), base=JSON.parse(JSON.stringify(o.samples[0]));
  const sample=(t,n,births,starved,lineN,introduced=false)=>({...JSON.parse(JSON.stringify(base)),t,n,counts:{...base.counts,births,starved},regions:[{name:'水槽',n,counts:{...base.regions[0].counts,births,starved}}],lines:lineN==null?{}:{7:{n:lineN,maxGen:2,target,introduced}},kinds:{},clades:{}});
  const say=(...args)=>{const s=sample(...args); w.t=s.t;o.samples.push(s);const seq=o.seq;o.narrate(w,s);return o.seq>seq?o.events.at(-1):null;};
  o.samples=[sample(0,100,0,0,3)]; return {w,o,sample,say};
}
test('world decline and an exceptional expanding lineage become one grounded short account',()=>{
  const {say}=fixture(),e=say(60,80,10,30,8);
  assert.match(e.text,/全体は20匹減って80匹/);assert.match(e.text,/出生10匹に対し死亡30匹/);assert.match(e.text,/全体が減る中でも、系統7は3匹から8匹/);
  assert.match(e.spoken,/出生より死亡が20匹/);assert.doesNotMatch(e.spoken,/未検証|未確定|因果|成功|数値根拠/);
  assert.equal(e.evidence.residual,0);assert.equal(e.target.line,7);assert.ok(e.spoken.length<180);
});
test('the next account follows the same lineage and detects reversal, without inventing causes',()=>{
  const {say,o}=fixture();say(60,80,10,30,8);
  let e=say(120,70,20,50,12);assert.match(e.text,/系統7は8匹から12匹/);assert.match(e.title,/注目系統は拡大/);
  e=say(180,60,25,65,5);assert.match(e.text,/前に注目した系統7は、12匹から5匹へ減って/);
  assert.equal(o.story.focus.line,'7');assert.ok(e.evidence.previousMinute);assert.doesNotMatch(e.text,/餌が枯渇|優秀|適応した/);
});
test('introduced bodies are named; missing or unbalanced data never produces a false story',()=>{
  const {say,o,w,sample}=fixture();
  const s=sample(60,110,0,0,10,true);s.counts.introduced=10;o.samples.push(s);w.t=60;o.narrate(w,s);
  assert.match(o.events.at(-1).spoken,/人が加えた10匹/);assert.equal(o.story.focus,null);
  const before=o.events.length;const broken=sample(120,20,0,0,12);o.samples.push(broken);w.t=120;o.narrate(w,broken);assert.equal(o.events.length,before);
  o.setEnabled(false);w.t=200;o.setEnabled(true);assert.equal(o.story.focus,null);assert.equal(o.window(60).complete,false);
});
test('falling out of the top groups is not extinction; absence is scoped to this island',()=>{
  const {say,w}=fixture();say(60,80,10,30,8);w.bodies[0].line=7;
  let e=say(120,70,20,50,null);assert.equal(e,null);
  const f=fixture();f.say(60,80,10,30,8);e=f.say(120,70,20,50,null);assert.match(e.text,/この島から姿を消しました/);assert.doesNotMatch(e.text,/絶滅しました/);
});
test('no record or rare structure is voiced; focus and timing survive history restoration',()=>{
  const {say,o,w}=fixture();say(60,80,10,30,8);
  const d=JSON.parse(JSON.stringify(A.observer.saveWorld(w))),r=A.observer.restoreWorld(d),b=A.observer.get(r);
  assert.deepEqual(b.story,o.story);assert.equal(b.events.at(-1).spoken,o.events.at(-1).spoken);
  const before=o.events.length;o.narrate(w,o.samples.at(-1));assert.equal(o.events.length,before);
  assert.equal(o.events.filter(e=>e.spoken).length,1);
});
test('a quiet unchanged world does not repeat the same spoken report every minute',()=>{
  const {say}=fixture();assert.ok(say(60,100,0,0,3).spoken);assert.equal(say(120,100,0,0,3),null);
});
test('a burst of observation notes cannot evict the narrative before the UI or speaker sees it',()=>{
  const {say,o,w}=fixture(),story=say(60,80,10,30,8);
  for(let i=0;i<400;i++)o.emit(w.t,'note-'+i,'詳細','詳細');
  assert.equal(o.events.length,300);assert.ok(o.events.some(e=>e.id===story.id&&e.spoken));
  assert.ok(o.events.every((e,i)=>!i||o.events[i-1].id<e.id));
});
test('an hour of stable population, small fluctuations and starvation stays silent after the first report, including restore',()=>{
  const f=fixture();f.o.samples=[f.sample(0,1000,0,0,3)];
  for(let i=1;i<=60;i++) { const n=1000+(i%3)*5;f.say(i*60,n,i*40,i*40-(n-1000),3); }
  const stories=f.o.events.filter(e=>e.key.startsWith('story-'));assert.equal(stories.length,1);assert.equal(stories.filter(e=>e.spoken).length,1);
  const r=A.observer.restoreWorld(JSON.parse(JSON.stringify(A.observer.saveWorld(f.w)))),o=A.observer.get(r),s=f.sample(3660,1000,2440,2440,3);
  r.t=s.t;o.samples.push(s);const seq=o.seq;o.narrate(r,s);assert.equal(o.seq,seq);assert.equal(o.story.report.t,60);
});
test('a lineage update does not repeat an unchanged population report or unchanged starvation cause',()=>{
  const {say}=fixture();say(60,80,10,30,8);say(120,80,40,60,8);
  const e=say(180,80,70,90,12);assert.match(e.spoken,/系統7/);assert.doesNotMatch(e.spoken,/全体|餓死|出生|死亡/);
});
test('a material shift in death classification is announced once rather than repeating the usual cause',()=>{
  const {o,w,sample,say}=fixture();say(60,100,30,30,3);
  const update=(t,births,killed)=>{const s=sample(t,100,births,30,3);s.counts.killed=s.regions[0].counts.killed=killed;o.samples.push(s);w.t=t;const seq=o.seq;o.narrate(w,s);return o.seq>seq?o.events.at(-1):null;};
  const e=update(120,60,30);assert.match(e.spoken,/餓死から傷/);assert.doesNotMatch(e.spoken,/ほぼ横ばい/);assert.equal(update(180,90,60),null);
});
test('a sudden population loss after a quiet period still explains the measured birth and death change',()=>{
  const f=fixture();f.o.samples=[f.sample(0,1000,0,0,3)];f.say(60,1000,40,40,3);
  const e=f.say(120,700,90,390,3);assert.match(e.text,/300匹減って700匹/);assert.match(e.text,/出生50匹に対し死亡350匹/);
  assert.match(e.text,/前の1分より死亡が310匹/);assert.match(e.spoken,/最多|最も多い死因は餓死/);assert.equal(e.evidence.triggers.deathSurge,true);
});
