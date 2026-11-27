// Shared evolution-rule registry. Add a rule here and to World's implementation/defaults;
// explorer controls, mutation flags, exports and ecosystem controls consume this catalog.
(function(G){
'use strict';
const A=G.ALIFE2=G.ALIFE2||{};
const catalog=[
 ['scent','他個体の匂い','x'],['vision','視覚','v'],['genome2','遺伝子の新しい規則','g'],
 ['metamut','変異の強さの進化','m'],['contact','身体の接触と組織の摂取','c'],
 ['nerve2','体節あたり複数の神経','n'],['invest','卵の蓄えの進化','i'],['cast','卵を産む距離の進化','d'],
 ['learn','経験で変わる神経結合','l',['nerve2']],['sound','音・耳・発音器官','s'],
 ['wire','名前で結ぶ神経','w',['nerve2']],['wireLate','回路を作る時期の進化','t'],['wireEnds','相手のある結合だけを作る'],['blind','餌の方向の近道を切る'],
 ['budget','出生の収支を合わせる'],['carry','成長で神経状態を引き継ぐ'],
 ['keep','経験と運動を失わない'],['pair','左右の対は一緒に生える'],
 ['solid','身体を固い物体として扱う','',['contact']],['mutsplit','変異の頻度と幅を別々に進化させる'],
 ['nibble','粒を削って食べる'],['recycle','物質を水に戻す'],
 ['adhere','掴む・蓄えの染み出し','',['contact']],['mix','触れた相手と遺伝子が混ざる','',['contact']],
 ['soundWork','繊毛の音を仕事から決める','',['sound']],
 ['brain','神経系が身体と別に増え、遠くへつながる','b',['wire']],
 ['rewire','使われ方で結合が細る・できる','y',['nerve2']],
 ['nest','分泌した物質が水に残る','q'],
 ['shore','なだらかな境界','',[],24],['wave','豊かさの波','',[],1200],['vents','栄養の湧き場（供給が場所に偏る）']
].map(([key,label,flag='',requires=[],on=1])=>Object.freeze({key,label,flag,requires:Object.freeze(requires),on,default:0}));
function normalize(input={}){
 input=input||{};const out={};for(const r of catalog){const v=Number(input[r.key]);out[r.key]=r.on===1?(v?1:0):(Number.isFinite(v)?Math.max(0,Math.min(v,10000)):0);}
 let changed;do{changed=false;for(const r of catalog)if(out[r.key])for(const key of r.requires)if(!out[key]){out[key]=1;changed=true;}}while(changed);
 return out;
}
// Preserve the ecosystem's historical ordering and random-number stream.
function flags(r){return catalog.filter(q=>q.flag&&r[q.key]&&!(q.key==='metamut'&&r.mutsplit)).map(q=>q.flag).join('');}
function mutate(genome,rand,rules){
 const split=rules.mutsplit,mm=rules.metamut||split?(genome.mut==null?1:genome.mut):1,mw=genome.mutW==null?mm:genome.mutW;
 const g=A.genome.mutate(genome,rand,split?mw:rules.metamut?mm:undefined,flags(rules),split?1:undefined);
 if(split){const rate=rules.mutation==null?.7:rules.mutation;if(rand()<rate)g.mut=A.genome.clamp(mm*Math.exp(rand.gauss()*.15),.1,3);if(rand()<rate)g.mutW=A.genome.clamp(mw*Math.exp(rand.gauss()*.15),.1,3);}
 return g;
}
A.rules={catalog,normalize,flags,mutate,defaults:Object.fromEntries(catalog.map(r=>[r.key,r.default]))};
if(typeof module!=='undefined')module.exports=A;
})(typeof globalThis!=='undefined'?globalThis:this);
