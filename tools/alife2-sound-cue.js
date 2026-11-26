// What does the sound in the water tell about? In a saved world with sound: how loud each band is at 400 places over 90 seconds, against the food,
// the bodies and the eating within 6 units of each place (rank correlations). It counts; it changes nothing that is saved.
// Usage: node tools/alife2-sound-cue.js <world.json.gz> [...] [key=value ...]   (key=value: rules switched in the loaded world before measuring, after which it runs 60 s to settle)
const A=require('../alife2-genome.js');for(const f of ['development','neural','physics','organs','engine'])require('../alife2-'+f+'.js');
const zlib=require('zlib'),fs=require('fs');
const on={};for(const a of process.argv.slice(2))if(a.includes('=')&&!a.includes('/')){const [k,v]=a.split('=');on[k]=Number(v);}
for(const file of process.argv.slice(2).filter(a=>!(a.includes('=')&&!a.includes('/')))){const w=A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file))));if(Object.keys(on).length){w.enable(on);for(let i=0;i<1800;i++)w.step();}const out0=Object.assign({},w.aco.out);
  const pts=[];for(let k=0;k<400;k++)pts.push([ (k*37.7)%w.W, 4+((k*13.3)%(w.H-8)) ]);
  const acc=pts.map(()=>({s:new Array(6).fill(0),food:0,bodies:0,eat:0,n:0}));const eat0=new Map();
  const dist2=(x,y,a,b)=>{let dx=Math.abs(x-a);if(dx>w.W/2)dx=w.W-dx;return dx*dx+(y-b)*(y-b);};
  for(let i=0;i<30*90;i++){w.step();if(i%90===0){for(const o of w.bodies){if(!eat0.has(o.id))eat0.set(o.id,o.eaten);}
    pts.forEach((p,j)=>{const a=acc[j];for(let b=0;b<6;b++)a.s[b]+=w.nutAt(p[0],p[1],w.snd[b]);for(const f of w.food)if(dist2(f.x,f.y,p[0],p[1])<36)a.food+=f.e;for(const o of w.bodies)if(dist2(o.cx,o.cy,p[0],p[1])<36){a.bodies++;a.eat+=o.eaten-eat0.get(o.id);}a.n++;});
    for(const o of w.bodies)eat0.set(o.id,o.eaten);}}
  const rank=v=>{const idx=v.map((x,i)=>[x,i]).sort((a,b)=>a[0]-b[0]),r=new Array(v.length);for(let i=0;i<idx.length;){let j=i;while(j<idx.length&&idx[j][0]===idx[i][0])j++;for(let k=i;k<j;k++)r[idx[k][1]]=(i+j-1)/2;i=j;}return r;};
  const corr=(x,y)=>{const rx=rank(x),ry=rank(y),n=x.length,mx=(n-1)/2;let sxy=0,sxx=0,syy=0;for(let i=0;i<n;i++){sxy+=(rx[i]-mx)*(ry[i]-mx);sxx+=(rx[i]-mx)**2;syy+=(ry[i]-mx)**2;}return sxy/Math.sqrt(sxx*syy);};
  const food=acc.map(a=>a.food/a.n),bod=acc.map(a=>a.bodies/a.n),eat=acc.map(a=>a.eat/a.n);
  console.log('== '+file.split('/').pop()+(Object.keys(on).length?'  with '+JSON.stringify(on):'')+'  (400 places, 90 s; rank correlation of loudness with what is within 6 units)');
  console.log('   band      food there   bodies there   grains eaten there');
  for(let b=0;b<6;b++){const s=acc.map(a=>a.s[b]/a.n);console.log('   '+b+' ('+['lowest','low','mid-low','mid-high','high','highest'][b].padEnd(8)+')  '+corr(s,food).toFixed(2).padStart(6)+'       '+corr(s,bod).toFixed(2).padStart(6)+'          '+corr(s,eat).toFixed(2).padStart(6));}
  const all=acc.map(a=>a.s.reduce((x,y)=>x+y,0)/a.n);console.log('   all bands    '+corr(all,food).toFixed(2).padStart(6)+'       '+corr(all,bod).toFixed(2).padStart(6)+'          '+corr(all,eat).toFixed(2).padStart(6)+'     | bodies vs food '+corr(bod,food).toFixed(2)+', places with any food '+(food.filter(x=>x>0).length/4)+'%, with any body '+(bod.filter(x=>x>0).length/4)+'%');
  const K={};for(const k in w.aco.out)K[k]=w.aco.out[k]-out0[k];const tot=Object.values(K).reduce((a,b)=>a+b,0);console.log('   sound made while measuring: '+Object.entries(K).map(([k,v])=>k+' '+(v/tot*100).toFixed(1)+'%').join(', '));}
