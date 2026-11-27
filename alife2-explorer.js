// Independent morphology search: no fitness function, no natural-selection claims.
(function(G){
'use strict';
const A=G.ALIFE2;
const {genome:g,development:d,organs:o,physics:p}=A;
function bin(n, cuts){return cuts.filter(x=>n>=x).length;}
function inspect(genome,cap=64,rules={}){
  const plan=d.develop(genome,{maxSegs:cap,pair:rules.pair}), shape=d.describe(plan), organ=o.profile(plan);
  const branches=plan.segs.filter(s=>s.kids.length>1).length;
  const cilia=organ.cilia;
  const anatomy={neurons:0,connections:0,recurrent:0,plastic:0,ears:0,voices:0,chemical:0,touch:0};
  for(const seg of plan.segs){const p=seg.p;for(const n of p.nn||[]){anatomy.neurons++;anatomy.connections+=n.in.length+n.out.length;anatomy.recurrent+=n.in.filter(e=>/^[spkm]/.test(e[0])).length;anatomy.plastic+=n.in.filter(e=>e[2]).length;}if(p.ear>.02)anatomy.ears++;if(p.voice>.02)anatomy.voices++;if(p.nerve>0&&(p.nC||p.sA||p.sB||(p.nn||[]).some(n=>n.in.some(e=>['c','A','B'].includes(e[0])))))anatomy.chemical++;if(p.sT||p.sW||(p.nn||[]).some(n=>n.in.some(e=>['t','w'].includes(e[0]))))anatomy.touch++;}
  anatomy.wiredNeurons=plan.segs.reduce((n,s)=>n+(A.neural.wiring(s.p)>1e-6?(s.p.nn||[]).length:0),0);
  const key=[bin(shape.segments,[2,4,8,16,32,64,100]),bin(branches,[1,3,8]),bin(shape.length/Math.max(.001,shape.width),[.5,1,2,4]),bin(shape.mouths,[1,2,5,12]),shape.eyes>0?1:0,cilia>.05?1:0,bin(shape.armorFraction,[.15,.45]),bin(anatomy.neurons,[1,4,16]),bin(anatomy.connections,[1,8,32]),bin(anatomy.recurrent,[1,4]),bin(anatomy.plastic,[1,4]),bin(anatomy.ears,[1,4]),bin(anatomy.voices,[1,4]),anatomy.chemical?1:0,anatomy.touch?1:0].join('/');
  return {genome,shape,anatomy,branches,cilia,basal:organ.basal,storage:organ.Emax,gut:organ.gutCap,gape:organ.gape,key,truncated:!!plan.truncated};
}
class Explorer{
  constructor({seed=1,depth=50,cap=64,source='primordial',rules={}}={}){
    this.rules=A.rules.normalize(rules);this.seed=seed;this.depth=depth;this.cap=cap;this.source=source;this.rand=g.rng(seed);this.archive=new Map();this.count=0;this.failed=0;this.truncated=0;this.next=0;
  }
  one(){
    // Independent random walks; some walks branch off an archived morphology.
    let base;
    if(this.source==='mixed' && this.archive.size && this.rand()<.45){
      const all=[...this.archive.values()];base=g.copy(all[this.rand.int(all.length)].genome);
    } else if(this.source==='samples'){
      base=A.bodyplan.design(A.bodyplan.SAMPLES[this.rand.int(A.bodyplan.SAMPLES.length)].params);
    } else base=g.primordial(this.rand.int(2147483647)+1);
    const n=1+this.rand.int(this.depth);
    this.count++;
    try{
      for(let i=0;i<n;i++)base=A.rules.mutate(base,this.rand,this.rules);
      base.origin='artificial-mutated';
      const q=inspect(base,this.cap,this.rules);q.id=++this.next;q.walk=n;
      if(!Number.isFinite(q.shape.volume)||q.shape.volume<=0){this.failed++;return null;}
      if(q.truncated)this.truncated++;
      if(q.truncated)return null; // do not archive cap-clipped anatomy
      const old=this.archive.get(q.key);
      const seen=old?old.seen+1:1;
      if(!old||this.rand()<1/seen){q.seen=seen;this.archive.set(q.key,q);}else old.seen=seen;
      return q;
    }catch(e){this.failed++;return null;}
  }
  list(){return [...this.archive.values()];}
}
function motion(genome,ground=false,cap=64,rules={}){
  const plan=d.develop(genome,{maxSegs:cap,pair:rules.pair});
  const t=p.trial(plan,{env:{fluid:1,ground},seconds:3,warm:1,cmd:{drive:1,turn:0,heading:0}});
  return {ok:t.ok,speed:t.speed,power:t.power,work:t.work,distance:t.distance,path:t.path};
}
function specimenFile(genome,rules={},cap=64){return {format:'alife2-specimen-1',genome:g.copy(genome),rules:A.rules.normalize(rules),cap};}
function makeWorld(genome,seed=1,competition=false,options={}){
  const rules=A.rules.normalize(options.rules),w=new A.engine.World({...rules,seed,mutation:0,maxSegs:options.cap||64,map:options.map||''});
  if(competition)w.seedWith(g.primordial(seed),20);
  const specimens=w.introduce(specimenFile(genome,rules,options.cap||64),{count:options.count==null?1:options.count,place:options.place||'center',age:options.age||'adult',center:{x:w.W*.5,y:w.yBottom*.45}});
  return {w,specimen:specimens[0],specimens};
}
function signals(o){
 const values=[],weights=[],segs=o.b.segs;
 for(const s of segs){values.push(s.a||0,...Array.from(s.na||[]));weights.push(...Array.from(s.nw||[]));}
 return {values,weights,neural:values.reduce((a,v)=>a+Math.abs(v),0)/Math.max(1,values.length),learning:weights.reduce((a,v)=>Math.max(a,Math.abs(v)),0),voice:o.voL||0,voiceEnergy:o.voE||0,path:o.path,hearing:segs.reduce((a,s)=>Math.max(a,s.e||0),0)};
}
function delta(a,b){let sum=0;for(let i=0;i<Math.max(a.length,b.length);i++)sum+=Math.abs((a[i]||0)-(b[i]||0));return sum/Math.max(1,a.length,b.length);}
class Observation{
 constructor(genome,{seed=1,rules={},cap=64,seconds=8,stimulus='none'}={}){
  if(!Number.isFinite(seconds)||seconds<1||seconds>30||!['none','sound','nutrient','visual'].includes(stimulus))throw new Error('観察条件が不正です');
  const {w,specimen}=makeWorld(genome,seed,false,{rules,cap});if(stimulus==='sound'&&!w.sound)throw new Error('音の刺激には音規則を選択してください');if(stimulus==='visual'&&!w.vision)throw new Error('視覚刺激には視覚規則を選択してください');this.w=w;this.specimen=specimen;
  this.control=A.engine.World.restore(JSON.parse(JSON.stringify(w.save())));this.other=this.control.bodies.find(o=>o.id===specimen.id);
  this.seconds=seconds;this.stimulus=stimulus;this.samples=[];this.next=0;this.source=specimenFile(genome,rules,cap);
 }
 get done(){return this.w.t>=this.seconds||!!this.specimen.dead;}
 step(){
  if(this.done)return;
  const w=this.w,o=this.specimen,pulse=w.t>=2&&w.t<4;
  if(pulse){
   if(this.stimulus==='sound'&&w.sound){const i=w.cellAt(o.cx,o.cy);for(const band of w.sndIn)band[i]+=.03;}
   if(this.stimulus==='nutrient'){for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)w.nut[w.cellAt(o.cx+x*w.cell,o.cy+y*w.cell)]=w.nutrientCap;}
   if(this.stimulus==='visual'&&w.tick%15===0)w.addFood(o.cx+3,o.cy,.6,.6,false,2);
  }
  w.step();this.control.step();
  if(w.t>=this.next||this.done){this.next=w.t+.2;const s=signals(o),c=signals(this.other);this.samples.push({t:w.t,pulse:pulse&&this.stimulus!=='none',neural:s.neural,controlNeural:c.neural,neuralDelta:delta(s.values,c.values),voice:s.voice,voiceEnergy:s.voiceEnergy,hearing:s.hearing,learning:s.learning,learningDelta:delta(s.weights,c.weights),path:s.path,controlPath:c.path});}
 }
 result(){return {format:'alife2-observation-1',specimen:this.source,version:A.version?A.version.label:null,rules:A.rules.normalize(this.w),seed:this.w.seed,seconds:this.w.t,duration:this.seconds,complete:this.done,stimulus:this.stimulus,stimulusWindow:[2,4],dead:this.specimen.dead||false,samples:this.samples.slice(),note:'同じ初期状態の無刺激対照との差。結合の変化は適応的な学習の証明ではない。'};}
}
A.explorer={Explorer,inspect,motion,makeWorld,specimenFile,Observation,signals};
if(typeof module!=='undefined')module.exports=A;
})(typeof globalThis!=='undefined'?globalThis:this);
