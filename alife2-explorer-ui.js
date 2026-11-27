(function(){
'use strict';
const A=window.ALIFE2,$=id=>document.getElementById(id),E=A.explorer,R=new A.render.Renderer();
const preview=$('preview'), ctx=preview.getContext('2d');
let ex=null,selected=null,page=0,target=0,running=false,token=0,anim=null,lastGround=false,busy=false,obs=null,observed=null;
for(const r of A.rules.catalog){const label=document.createElement('label'),input=document.createElement('input');input.id='rule-'+r.key;input.type='checkbox';label.append(input,document.createTextNode(r.label));$('rules').append(label);input.onchange=()=>{if(input.checked){const rules=readRules();for(const q of A.rules.catalog)$('rule-'+q.key).checked=!!rules[q.key];}else for(const q of A.rules.catalog)if(q.requires.includes(r.key))$('rule-'+q.key).checked=false;};}
const readRules=()=>A.rules.normalize(Object.fromEntries(A.rules.catalog.map(r=>[r.key,$('rule-'+r.key).checked?r.on:0])));
$('allRules').onclick=()=>{for(const r of A.rules.catalog)$('rule-'+r.key).checked=true;};
$('noRules').onclick=()=>{for(const r of A.rules.catalog)$('rule-'+r.key).checked=false;};
const develop=q=>A.development.develop(q.genome,{maxSegs:ex.cap,pair:ex.rules.pair});
const f=(x,n=3)=>Number.isFinite(x)?x.toFixed(n):'—';
function val(id,min,max){return Math.max(min,Math.min(max,Math.floor(Number($(id).value)||min)));}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function paint(canvas,segs,q,pose=false){
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;
 for(const s of segs){const rad=Math.max(s.r0,s.r1);l=Math.min(l,s.ax-rad,s.bx-rad);r=Math.max(r,s.ax+rad,s.bx+rad);t=Math.min(t,s.ay-rad,s.by-rad);b=Math.max(b,s.ay+rad,s.by+rad);}
 c.fillStyle='#08131e';c.fillRect(0,0,w,h);
 const scale=Math.min((w-16)/Math.max(.05,r-l),(h-16)/Math.max(.05,b-t),120);
 R.draw(c,segs,{cx:(l+r)/2,cy:(t+b)/2,scale,w,h},{gpu:false,hue:q.genome.hue,internals:true,shadow:false,time:pose&&anim?anim.t:0});
}
function sorted(){const arr=ex?ex.list():[],k=$('sort').value;return arr.sort((a,b)=>k==='rare'?a.seen-b.seen||a.id-b.id:(k==='branches'?b.branches-a.branches:(b.anatomy[k]??b.shape[k])-(a.anatomy[k]??a.shape[k]))||a.id-b.id);}
function gallery(){const arr=sorted(),n=12;page=Math.max(0,Math.min(page,Math.ceil(arr.length/n)-1));$('gallery').replaceChildren();$('page').textContent=arr.length?String(page+1)+' / '+Math.ceil(arr.length/n):'0 / 0';$('prev').disabled=page===0;$('next').disabled=(page+1)*n>=arr.length;
 for(const q of arr.slice(page*n,(page+1)*n)){const btn=document.createElement('button');btn.className='tile'+(selected&&selected.id===q.id?' on':'');const cv=document.createElement('canvas');cv.width=160;cv.height=105;btn.append(cv);const s=document.createElement('span');s.textContent='#'+q.id+' / '+q.shape.segments+'体節・口'+q.shape.mouths+'・眼'+q.shape.eyes+(q.cilia>.05?'・繊毛':'')+'・神経'+q.anatomy.neurons+'・耳'+q.anatomy.ears+'・声器官'+q.anatomy.voices+' / '+q.seen+'回';btn.append(s);btn.onclick=()=>{if(busy||running)return;select(q);gallery();};$('gallery').append(btn);paint(cv,develop(q).segs,q);}
}
function buttons(){for(const id of ['water','ground','genome','animate','energy','competition','world','specimen','observe'])$(id).disabled=!selected||busy||running;$('start').disabled=running||busy;$('stop').disabled=!running;$('more').disabled=running||!ex||busy;$('archive').disabled=!ex||!ex.archive.size||busy||running;$('observation').disabled=!observed||busy||running;$('observeStop').disabled=!obs;for(const id of ['allRules','noRules'])$(id).disabled=busy||running;}
function stopAnim(){anim=null;$('animate').textContent='強制駆動表示';}
function select(q){showCircuit(q);selected=q;stopAnim();observed=q.observation||null;drawTrace(observed?observed.samples:[]);$('trial').textContent='';const s=q.shape;paint(preview,develop(q).segs,q);$('detail').textContent='人工探索 #'+q.id+' / 変異累計 '+q.genome.mutations+'\n体節 '+s.segments+'・分岐 '+q.branches+'・口 '+s.mouths+'・眼 '+s.eyes+'\n体長 '+f(s.length)+' / 幅 '+f(s.width)+' / 体積 '+f(s.volume)+'\n基礎維持費 '+f(q.basal)+'/s / 蓄え容量 '+f(q.storage)+' / 消化容量 '+f(q.gut)+'\n繊毛面積 '+f(q.cilia)+' / 外骨格 '+f(s.armorFraction*100,1)+'%'+ '\n神経 '+q.anatomy.neurons+'（配線あり '+q.anatomy.wiredNeurons+'） / 結合 '+q.anatomy.connections+' / 再帰参照 '+q.anatomy.recurrent+' / 可塑結合 '+q.anatomy.plastic+'\n耳 '+q.anatomy.ears+' / 発音器官 '+q.anatomy.voices+' / 化学感覚の体節 '+q.anatomy.chemical+' / 接触感覚の体節 '+q.anatomy.touch+'\nこれらは構造の分類。働きは観察で確認する。';buttons();}
function showCircuit(q){const rows=[];for(const s of develop(q).segs)for(const [i,n] of (s.p.nn||[]).entries())rows.push('体節 '+s.id+' / 神経 '+(n.id??i)+' / b='+f(n.b)+'\n  入力 '+n.in.map(e=>e[0]+'×'+f(e[1])+(e[2]?' η='+f(e[2]):'')).join(', ')+'\n  出力 '+n.out.map(e=>e[0]+'×'+f(e[1])).join(', '));$('circuit').textContent=rows.length?rows.slice(0,24).join('\n')+(rows.length>24?'\n…全 '+rows.length+' 神経（先頭24個を表示）':''):'複数神経の配線なし。従来の単一局所信号と脳は、遺伝子の規則に従って動く。';}
function status(){ $('activeRules').textContent='今回の探索規則：'+(A.rules.catalog.filter(r=>ex.rules[r.key]).map(r=>r.label).join('、')||'すべて切'); $('progress').max=target||1;$('progress').value=ex.count;$('status').textContent='探索 '+ex.count+' / '+target+'・構造区分 '+ex.archive.size+'・上限除外 '+ex.truncated+'・発生失敗 '+ex.failed+(running?'（実行中）':'（停止）');}
function run(){running=true;const t=++token;buttons();function chunk(){if(!running||t!==token)return;const end=performance.now()+24;do{ex.one();}while(ex.count<target&&performance.now()<end);if(ex.count>=target){running=false;status();gallery();buttons();if(!selected&&ex.archive.size)select(sorted()[0]);return;}status();setTimeout(chunk,0);}chunk();}
$('start').onclick=()=>{stopAnim();selected=null;observed=null;drawTrace([]);page=0;ex=new E.Explorer({seed:val('seed',1,2147483647),depth:val('depth',1,150),source:$('source').value,cap:Number($('cap').value),rules:readRules()});target=val('count',1,20000);$('gallery').replaceChildren();$('detail').textContent='探索中';$('trial').textContent='';ctx.clearRect(0,0,preview.width,preview.height);run();};
$('stop').onclick=()=>{running=false;token++;status();gallery();buttons();if(!selected&&ex.archive.size)select(sorted()[0]);};
$('more').onclick=()=>{target=ex.count+val('count',1,20000);run();};
$('sort').onchange=()=>{page=0;gallery();};$('prev').onclick=()=>{page--;gallery();};$('next').onclick=()=>{page++;gallery();};
$('archive').onclick=()=>download('alife2-exploration.json',{format:'alife2-exploration-2',rules:ex.rules,seed:ex.seed,source:ex.source,depth:ex.depth,cap:ex.cap,count:ex.count,failed:ex.failed,truncated:ex.truncated,archive:ex.list()});
$('genome').onclick=()=>download('alife2-exploration-'+selected.id+'.json',selected.genome);
function motion(ground){if(!selected)return;lastGround=ground;stopAnim();busy=true;buttons();$('trial').textContent='物理試験中';const q=selected;setTimeout(()=>{try{const t=E.motion(q.genome,ground,ex.cap,ex.rules);$('trial').textContent=(ground?'底面':'水中')+'・駆動指令1・3秒\n速度 '+f(t.speed)+' u/s / 移動距離 '+f(t.distance)+' / 筋仕事率 '+f(t.power)+' / 数値安定 '+t.ok;}catch(e){$('trial').textContent=String(e);}finally{busy=false;buttons();}},10);}
$('water').onclick=()=>motion(false);$('ground').onclick=()=>motion(true);
$('animate').onclick=()=>{if(anim){stopAnim();return;}const q=selected;anim=A.physics.build(develop(q),{env:{fluid:1,ground:lastGround},cmd:{drive:1,turn:0,heading:0}});const b=anim;$('animate').textContent='停止';function frame(){if(anim!==b)return;A.physics.step(b,1/30);if(!A.physics.finite(b)){stopAnim();return;}paint(preview,b.segs,q,true);requestAnimationFrame(frame);}requestAnimationFrame(frame);};
function life(comp){stopAnim();busy=true;buttons();const q=selected,{w,specimen:o}=E.makeWorld(q.genome,ex.seed,comp,{rules:ex.rules,cap:ex.cap});const e0=o.E;function chunk(){try{const end=performance.now()+20;while(w.t<30&&!o.dead&&performance.now()<end)w.step();$('trial').textContent=(comp?'競争':'単独')+'生活 '+f(w.t,1)+' 秒\n生存 '+(!o.dead?'はい':o.dead)+' / 口から '+f(o.eaten)+' / 体表から '+f(o.absorbed)+' / 蓄え '+f(e0)+' → '+f(o.E)+' / 子 '+o.kids+' / 自力移動 '+f(o.path);if(w.t<30&&!o.dead){setTimeout(chunk,0);return;}}catch(e){$('trial').textContent=String(e);}busy=false;buttons();}setTimeout(chunk,0);}
$('energy').onclick=()=>life(false);$('competition').onclick=()=>life(true);
$('world').onclick=()=>{try{const {w}=E.makeWorld(selected.genome,ex.seed,true,{rules:ex.rules,cap:ex.cap,count:Number($('worldCount').value),place:$('worldPlace').value,age:$('worldAge').value});w.mutation=A.engine.DEFAULTS.mutation;download('alife2-exploration-world.json',w.save());}catch(e){$('trial').textContent='新規世界を作れない：'+e.message;}};
$('specimen').onclick=()=>download('alife2-specimen-'+selected.id+'.json',E.specimenFile(selected.genome,ex.rules,ex.cap));
function drawTrace(samples){const cv=$('trace'),c=cv.getContext('2d');c.fillStyle='#08131e';c.fillRect(0,0,cv.width,cv.height);if(!samples.length)return;
 const end=samples[samples.length-1].t||1;if(samples.some(s=>s.pulse)){c.fillStyle='#293d42';c.fillRect(2/end*cv.width,0,Math.max(0,Math.min(end,4)-2)/end*cv.width,cv.height);}
 for(const [key,color] of [['neural','#7cc9ed'],['controlNeural','#8b939a'],['voice','#f4d07e'],['learning','#8ed6af']]){const max=Math.max(.00001,...samples.map(s=>key==='neural'||key==='controlNeural'?Math.max(s.neural,s.controlNeural):s[key]));c.strokeStyle=color;c.beginPath();samples.forEach((s,i)=>{const x=s.t/end*cv.width,y=cv.height-10-s[key]/max*(cv.height-20);if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.stroke();}
}
$('observeStop').onclick=()=>{obs=null;};
$('observation').onclick=()=>download('alife2-observation-'+selected.id+'.json',observed);
$('observe').onclick=()=>{
 stopAnim();const q=selected;try{obs=new E.Observation(q.genome,{seed:ex.seed,rules:ex.rules,cap:ex.cap,seconds:val('observeSeconds',4,30),stimulus:$('stimulus').value});}catch(e){$('observationNote').textContent=e.message;return;}
 const trial=obs;busy=true;buttons();
 function chunk(){try{const until=performance.now()+20;while(obs===trial&&!trial.done&&performance.now()<until)trial.step();const result=trial.result(),samples=result.samples,last=samples[samples.length-1];observed=result;q.observation=result;
  if(last){drawTrace(samples);paint(preview,trial.specimen.b.segs,q);const max=k=>Math.max(...samples.map(s=>s[k]));$('observationNote').textContent='自律観察 '+f(result.seconds,1)+' 秒'+(!result.complete&&obs!==trial?'（手動停止）':'')+' / '+(result.dead?'死亡：'+result.dead:'生存')+'\n自力移動 '+f(last.path)+'（無刺激対照 '+f(last.controlPath)+'） / 発声への支出 '+f(last.voiceEnergy,6)+' / 発声強度 最大 '+f(max('voice'),5)+'\n神経活動の対照差 最大 '+f(max('neuralDelta'),5)+' / 耳の入力 最大 '+f(max('hearing'),5)+'\n生存中の結合変化 最大 '+f(max('learning'),6)+' / 結合変化の対照差 最大 '+f(max('learningDelta'),6)+'\n刺激：'+({none:'無刺激',sound:'音',nutrient:'溶存栄養',visual:'視覚・餌の粒'}[result.stimulus])+'。未反応や変化なしも観察結果。対照差は適応・意味理解の証明ではない。';}
  if(obs===trial&&!trial.done){setTimeout(chunk,0);return;}
 }catch(e){$('observationNote').textContent='観察を完了できない：'+e.message;}
 obs=null;busy=false;buttons();}
 setTimeout(chunk,0);
};
buttons();gallery();
})();