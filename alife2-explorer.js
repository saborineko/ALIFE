// Independent morphology search: no fitness function, no natural-selection claims.
(function(G){
'use strict';
const A=G.ALIFE2;
const {genome:g,development:d,organs:o,physics:p}=A;
function bin(n, cuts){return cuts.filter(x=>n>=x).length;}
function inspect(genome,cap=64){
  const plan=d.develop(genome,{maxSegs:cap}), shape=d.describe(plan), organ=o.profile(plan);
  const branches=plan.segs.filter(s=>s.kids.length>1).length;
  const cilia=organ.cilia;
  const key=[bin(shape.segments,[2,4,8,16,32,64,100]),bin(branches,[1,3,8]),bin(shape.length/Math.max(.001,shape.width),[.5,1,2,4]),bin(shape.mouths,[1,2,5,12]),shape.eyes>0?1:0,cilia>.05?1:0,bin(shape.armorFraction,[.15,.45])].join('/');
  return {genome,shape,branches,cilia,basal:organ.basal,storage:organ.Emax,gut:organ.gutCap,gape:organ.gape,key,truncated:!!plan.truncated};
}
class Explorer{
  constructor({seed=1,depth=50,cap=64,source='primordial'}={}){
    this.seed=seed;this.depth=depth;this.cap=cap;this.source=source;this.rand=g.rng(seed);this.archive=new Map();this.count=0;this.failed=0;this.truncated=0;this.next=0;
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
      for(let i=0;i<n;i++)base=g.mutate(base,this.rand);
      base.origin='artificial-mutated';
      const q=inspect(base,this.cap);q.id=++this.next;q.walk=n;
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
function motion(genome,ground=false,cap=64){
  const plan=d.develop(genome,{maxSegs:cap});
  const t=p.trial(plan,{env:{fluid:1,ground},seconds:3,warm:1,cmd:{drive:1,turn:0,heading:0}});
  return {ok:t.ok,speed:t.speed,power:t.power,work:t.work,distance:t.distance,path:t.path};
}
function makeWorld(genome,seed=1,competition=false){
  const w=new A.engine.World({seed,mutation:0,maxSegs:64});
  if(competition)w.seedWith(g.primordial(seed),20);
  const q=g.copy(genome);q.origin='artificial-mutated';
  const specimen=w.spawn(q,w.W*.5,w.yBottom*.45,1,null);
  return {w,specimen};
}
A.explorer={Explorer,inspect,motion,makeWorld};
if(typeof module!=='undefined')module.exports=A;
})(typeof globalThis!=='undefined'?globalThis:this);
