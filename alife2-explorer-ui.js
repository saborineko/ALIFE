(function(){
'use strict';
const A=window.ALIFE2,$=id=>document.getElementById(id),E=A.explorer,R=new A.render.Renderer();
const preview=$('preview'), ctx=preview.getContext('2d');
let ex=null,selected=null,page=0,target=0,running=false,token=0,anim=null,lastGround=false,busy=false;
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
function sorted(){const arr=ex?ex.list():[],k=$('sort').value;return arr.sort((a,b)=>k==='rare'?a.seen-b.seen||a.id-b.id:(k==='branches'?b.branches-a.branches:b.shape[k]-a.shape[k])||a.id-b.id);}
function gallery(){const arr=sorted(),n=12;page=Math.max(0,Math.min(page,Math.ceil(arr.length/n)-1));$('gallery').replaceChildren();$('page').textContent=arr.length?String(page+1)+' / '+Math.ceil(arr.length/n):'0 / 0';$('prev').disabled=page===0;$('next').disabled=(page+1)*n>=arr.length;
 for(const q of arr.slice(page*n,(page+1)*n)){const btn=document.createElement('button');btn.className='tile'+(selected&&selected.id===q.id?' on':'');const cv=document.createElement('canvas');cv.width=160;cv.height=105;btn.append(cv);const s=document.createElement('span');s.textContent='#'+q.id+' / '+q.shape.segments+'体節・口'+q.shape.mouths+'・眼'+q.shape.eyes+(q.cilia>.05?'・繊毛':'')+' / '+q.seen+'回';btn.append(s);btn.onclick=()=>{select(q);gallery();};$('gallery').append(btn);paint(cv,A.development.develop(q.genome,{maxSegs:ex.cap}).segs,q);}
}
function buttons(){for(const id of ['water','ground','genome','animate','energy','competition','world'])$(id).disabled=!selected||busy||(['energy','competition','world'].includes(id)&&ex.cap!==64);$('start').disabled=running||busy;$('stop').disabled=!running;$('more').disabled=running||!ex||busy;$('archive').disabled=!ex||!ex.archive.size||busy;}
function stopAnim(){anim=null;$('animate').textContent='運動表示';}
function select(q){selected=q;stopAnim();$('trial').textContent='';const s=q.shape;paint(preview,A.development.develop(q.genome,{maxSegs:ex.cap}).segs,q);$('detail').textContent='人工探索 #'+q.id+' / 変異累計 '+q.genome.mutations+'\n体節 '+s.segments+'・分岐 '+q.branches+'・口 '+s.mouths+'・眼 '+s.eyes+'\n体長 '+f(s.length)+' / 幅 '+f(s.width)+' / 体積 '+f(s.volume)+'\n基礎維持費 '+f(q.basal)+'/s / 蓄え容量 '+f(q.storage)+' / 消化容量 '+f(q.gut)+'\n繊毛面積 '+f(q.cilia)+' / 外骨格 '+f(s.armorFraction*100,1)+'%';buttons();}
function status(){ $('progress').max=target||1;$('progress').value=ex.count;$('status').textContent='探索 '+ex.count+' / '+target+'・形態区分 '+ex.archive.size+'・上限除外 '+ex.truncated+'・発生失敗 '+ex.failed+(running?'（実行中）':'（停止）');}
function run(){running=true;const t=++token;buttons();function chunk(){if(!running||t!==token)return;const end=performance.now()+24;do{ex.one();}while(ex.count<target&&performance.now()<end);if(ex.count>=target){running=false;status();gallery();buttons();if(!selected&&ex.archive.size)select(sorted()[0]);return;}status();setTimeout(chunk,0);}chunk();}
$('start').onclick=()=>{stopAnim();selected=null;page=0;ex=new E.Explorer({seed:val('seed',1,2147483647),depth:val('depth',1,150),source:$('source').value,cap:Number($('cap').value)});target=val('count',1,20000);$('gallery').replaceChildren();$('detail').textContent='探索中';$('trial').textContent='';ctx.clearRect(0,0,preview.width,preview.height);run();};
$('stop').onclick=()=>{running=false;token++;status();gallery();buttons();if(!selected&&ex.archive.size)select(sorted()[0]);};
$('more').onclick=()=>{target=ex.count+val('count',1,20000);run();};
$('sort').onchange=()=>{page=0;gallery();};$('prev').onclick=()=>{page--;gallery();};$('next').onclick=()=>{page++;gallery();};
$('archive').onclick=()=>download('alife2-exploration.json',{format:'alife2-exploration-1',seed:ex.seed,source:ex.source,depth:ex.depth,cap:ex.cap,count:ex.count,failed:ex.failed,truncated:ex.truncated,archive:ex.list()});
$('genome').onclick=()=>download('alife2-exploration-'+selected.id+'.json',selected.genome);
function motion(ground){if(!selected)return;lastGround=ground;stopAnim();busy=true;buttons();$('trial').textContent='物理試験中';const q=selected;setTimeout(()=>{try{const t=E.motion(q.genome,ground,ex.cap);$('trial').textContent=(ground?'底面':'水中')+'・駆動指令1・3秒\n速度 '+f(t.speed)+' u/s / 移動距離 '+f(t.distance)+' / 筋仕事率 '+f(t.power)+' / 数値安定 '+t.ok;}catch(e){$('trial').textContent=String(e);}finally{busy=false;buttons();}},10);}
$('water').onclick=()=>motion(false);$('ground').onclick=()=>motion(true);
$('animate').onclick=()=>{if(anim){stopAnim();return;}const q=selected;anim=A.physics.build(A.development.develop(q.genome,{maxSegs:ex.cap}),{env:{fluid:1,ground:lastGround},cmd:{drive:1,turn:0,heading:0}});const b=anim;$('animate').textContent='停止';function frame(){if(anim!==b)return;A.physics.step(b,1/30);if(!A.physics.finite(b)){stopAnim();return;}paint(preview,b.segs,q,true);requestAnimationFrame(frame);}requestAnimationFrame(frame);};
function life(comp){stopAnim();busy=true;buttons();const q=selected,{w,specimen:o}=E.makeWorld(q.genome,ex.seed,comp);const e0=o.E;function chunk(){try{const end=performance.now()+20;while(w.t<30&&!o.dead&&performance.now()<end)w.step();$('trial').textContent=(comp?'競争':'単独')+'生活 '+f(w.t,1)+' 秒\n生存 '+(!o.dead?'はい':o.dead)+' / 口から '+f(o.eaten)+' / 体表から '+f(o.absorbed)+' / 蓄え '+f(e0)+' → '+f(o.E)+' / 子 '+o.kids+' / 自力移動 '+f(o.path);if(w.t<30&&!o.dead){setTimeout(chunk,0);return;}}catch(e){$('trial').textContent=String(e);}busy=false;buttons();}setTimeout(chunk,0);}
$('energy').onclick=()=>life(false);$('competition').onclick=()=>life(true);
$('world').onclick=()=>{const {w}=E.makeWorld(selected.genome,ex.seed,true);download('alife2-exploration-world.json',w.save());};
buttons();gallery();
})();