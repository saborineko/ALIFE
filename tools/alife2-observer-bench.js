// Read-only overhead measurement on isolated copies. No live world is opened or changed.
const A = require('../alife2-genome.js');
for (const f of ['development','neural','physics','organs','rules','engine','observer']) require('../alife2-'+f+'.js');
const w = new A.engine.World({seed:37,map:'coast',founders:120}); w.seedWith(A.genome.primordial(37));
const saved=JSON.parse(JSON.stringify(w.save())), rows=[];
for(let round=0;round<4;round++) for(const on of (round%2?[true,false]:[false,true])) {
  const x=A.engine.World.restore(saved); if(on) A.observer.attach(x);
  const t=performance.now(); for(let tick=0;tick<600;tick++) x.step(); const ms=performance.now()-t;
  rows.push({round,on,ms});
}
const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
const off=median(rows.filter(r=>!r.on).map(r=>r.ms)), on=median(rows.filter(r=>r.on).map(r=>r.ms));
console.log(JSON.stringify({scenario:'120 primordial coast founders, 600 ticks, 4 alternating rounds',offMs:off,onMs:on,overheadPercent:100*(on/off-1),rows},null,2));
