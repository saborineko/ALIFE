// Premise probe for sound x learning: is there anything to gain from following the sound of eating? Artificial bodies with an ear on each side, wired from birth
// (no learning yet): unwired, slowing the louder side, speeding the louder side, and the first in a world with ears cut. 24 bodies, standard tank.
// Usage: node tools/alife2-sound-follow-probe.js [seconds]
const A=require('../alife2-genome.js');for(const f of ['development','neural','physics','organs','engine'])require('../alife2-'+f+'.js');const G=A.genome;
const body=(w0,eta,sign,tune)=>{const g=G.create({parts:[G.part({len:1,r0:0.5,r1:0.4,cilia:0.3,beat:-1,nerve:0.5,mouth:0.6,gut:0.5,gonad:0.3}),G.part({len:0.5,r0:0.25,r1:0.2,cilia:0.6,beat:-1,nerve:0.5,ear:0.6,hTune:tune,hWide:0.15,adapt:0.5})],links:[G.link({from:0,to:1,sym:'mirror',at:0.3,off:0.8,angle:1.0,scale:1,repeat:1})]});
  g.parts[0].nn=[{b:0,k:1,in:[['g',4]],out:[]}];
  g.parts[1].nn=[{b:0.3,k:1,in:[eta?['e',w0,eta]:['e',w0],['p0',0]],out:[],m:1},{b:0,k:1,in:[['s0',3],['m1',-2]],out:[['C',sign]]}];return g;};
const T=Number(process.argv[2])||300,seeds=[881,882,883];
const rg=(r,k,d)=>(r.reduce((a,x)=>a+x[k],0)/r.length).toFixed(d)+' ['+Math.min(...r.map(x=>x[k])).toFixed(d)+'〜'+Math.max(...r.map(x=>x[k])).toFixed(d)+']';
{ const w=new A.engine.World({seed:1,founders:0,cap:0,sound:1,nerve2:1,blind:1,learn:1}),o=w.spawn(body(0,0,-1,0.36),40,30,1,null);console.log('pitch: crunch',(0.5-Math.log2(0.4/0.25)/5).toFixed(3),'body (cilia, scrape)',o.sp.toFixed(3),'V',o.prof.V.toFixed(2),'W',w.W,'H',w.H,'patches',w.patch.length,'radius',w.patchRadius); }
for(const [name,w0,sign,opt] of [['unwired',0,-1,{}],['wired, slows the louder side',2,-1,{}],['wired, speeds the louder side',2,1,{}],['wired, slows the louder side, deaf world',2,-1,{deaf:1}]]){
  const R=seeds.map(seed=>{const w=new A.engine.World(Object.assign({seed,founders:0,cap:0,sound:1,nerve2:1,blind:1,learn:1},opt));for(let i=0;i<900;i++)w.step();const all=[];
    for(let i=0;i<24;i++){const o=w.spawn(body(w0,0,sign,0.36),w.rand()*w.W,4+w.rand()*(w.yBottom-8),1,null);o.E=o.prof.Emax*0.4;all.push(o);}
    let eS=0,eN=0,eEat=0,nEat=0;for(let i=0;i<30*T;i++){w.step();if(i%10===0)for(const o of all)if(!o.dead)for(const q of o.b.segs)if(q.earW){eS+=q.e;eN++;if(o.b.segs[0].ate>0.001){eEat+=q.e;nEat++;}}}
    const m=f=>all.reduce((a,o)=>a+f(o),0)/all.length;const K=w.aco.out,tot=Object.values(K).reduce((a,b)=>a+b,0);
    return {mouth:m(o=>o.eaten*o.prof.eta/Math.max(1,o.age)),alive:all.filter(o=>!o.dead).length/all.length,ear:eS/Math.max(1,eN),earEat:eEat/Math.max(1,nEat),crunch:K.crunch/tot,cilia:K.cilia/tot,path:m(o=>o.path/Math.max(1,o.age))};});
  console.log(name.padEnd(42),'mouth income',rg(R,'mouth',4),'| alive',rg(R,'alive',2),'| ear reading',rg(R,'ear',3),'while swallowing',rg(R,'earEat',3),'| speed',rg(R,'path',3),'| sound made: crunch',rg(R,'crunch',2),'cilia',rg(R,'cilia',2));}
