// The energy ledger of a world: what came in, what left and how, and whether anything is unaccounted for.
// The world is run with audit: 1 (counting only; it behaves exactly as without). Stored energy = dissolved food + grains +
// every body's reserve, gut contents, savings and the cost of its tissue. "Unexplained" is the change in stored energy that
// no counted flow accounts for; it should be zero up to rounding.
// Usage: node tools/alife2-audit.js <seconds> [key=value ...]   (e.g. map=coast contact=1) or resume=<world.json(.gz)>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [secs, ...kv] = process.argv.slice(2), T = Number(secs) || 600, opt = { seed: 1, audit: 1 }; for (const s of kv) { const [k, v] = s.split('='); opt[k] = Number.isNaN(Number(v)) ? v : Number(v); }
let w; if (opt.resume) { const d = JSON.parse(String(opt.resume).endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(opt.resume)) : fs.readFileSync(opt.resume)); d.opt.audit = 1; w = A.engine.World.restore(d); const on = {}; for (const k of ['contact', 'vision', 'scent', 'blind', 'genome2', 'shore', 'budget', 'carry', 'nibble', 'metamut', 'recycle']) if (opt[k] != null) on[k] = opt[k]; w.enable(on); } else { w = new A.engine.World(opt); w.seedWith(A.genome.primordial(opt.seed)); }
const zero = () => { for (const k in w.ledger) w.ledger[k] = 0; for (const k in w.grains) delete w.grains[k]; }; for (let i = 0; i < 30 * 60 && !opt.resume; i++) w.step(); zero();
const s0 = w.stored(), n0 = w.bodies.length; let worst = 0, last = s0, lastIn = 0;
const IN = ['rain', 'regrow', 'placed', 'mutation', 'recycled'], NAMES = { recycled: '身体が失った物質のうち、水に戻った分', rain: '降ってくる粒', regrow: '溶存栄養の回復', placed: '置いた身体', mutation: '変異で生じた子の差（親が払った額と、子の身体・蓄えの差）', basal: '基礎代謝', work: '筋肉の仕事', cilia: '繊毛の仕事', nerve: '神経の活動', digest: '消化で失われる分', clip: '蓄えの上限を超えて捨てた分', eggFixed: '産むときの固定費', death: '死骸に残らない分', expire: '食べられずに消えた粒', bite: '削った組織のうち食物にならない分', growth: '成長の積立と実際の建造費の差', stillborn: '死産した卵のうち残らない分' };
for (let i = 0; i < 30 * T; i++) { w.step(); const f = w.ledger, net = IN.reduce((a, k) => a + f[k], 0) - Object.keys(f).filter(k => !IN.includes(k)).reduce((a, k) => a + f[k], 0), s = w.stored(), miss = (s - last) - (net - lastIn); if (Math.abs(miss) > worst) worst = Math.abs(miss); last = s; lastIn = net; }
const f = w.ledger, inflow = IN.reduce((a, k) => a + f[k], 0), outflow = Object.keys(f).filter(k => !IN.includes(k)).reduce((a, k) => a + f[k], 0), s1 = w.stored(), gap = (s1 - s0) - (inflow - outflow), base = f.rain + f.regrow;
console.log('世界 ' + (w.map || '水槽') + (w.contact ? '・接触あり' : '') + (w.genome2 ? '・遺伝子の新しい規則' : '') + (w.budget ? '・出生の収支を合わせる' : '') + ' / ' + T + ' 秒 / 個体 ' + n0 + ' → ' + w.bodies.length + ' / 貯蔵 ' + s0.toFixed(1) + ' → ' + s1.toFixed(1));
console.log('流入（毎秒）'); for (const k of IN) console.log('  ' + NAMES[k].padEnd(30, '　') + (f[k] / T).toFixed(4).padStart(10) + (base ? '  ' + (f[k] / base * 100).toFixed(1).padStart(6) + '%' : ''));
console.log('散逸（毎秒、流入〔粒＋回復〕に対する割合）'); for (const k of Object.keys(f).filter(k => !IN.includes(k)).sort((a, b) => Math.abs(f[b]) - Math.abs(f[a]))) console.log('  ' + NAMES[k].padEnd(30, '　') + (f[k] / T).toFixed(4).padStart(10) + '  ' + (f[k] / base * 100).toFixed(1).padStart(6) + '%');
console.log('貯蔵の増加 ' + ((s1 - s0) / T).toFixed(4) + '/秒 / 説明のつかない差 ' + gap.toExponential(2) + '（流入の ' + (Math.abs(gap) / (base || 1) * 100).toExponential(1) + '%、1 ステップの最大 ' + worst.toExponential(1) + '）');
// why grains go uneaten: by size of grain
{ const gs = w.grains, keys = Object.keys(gs).sort((a, b) => (a === '死骸') - (b === '死骸') || Number(a) - Number(b)), n = w.bodies.length || 1, pct = (a, b) => (b > 0 ? (a / b * 100).toFixed(1) : '-').padStart(6) + '%';
  console.log('粒の大きさごと（この ' + T + ' 秒に現れた粒のエネルギーに対する割合。消えた分は、それ以前に現れた粒も含む）');
  console.log('  大きさ    現れた/秒   食べられた  消えた   口が届いたが大きすぎた  口が届いたが消化管が一杯  この大きさを飲める個体');
  for (const k of keys) { const g = gs[k], size = k === '死骸' ? 0.375 : Number(k), can = w.bodies.filter(o => o.prof.gape * 1.3 >= size).length / n;
    console.log('  ' + (k === '死骸' ? '死骸の粒' : k).padEnd(8) + (g.in / T).toFixed(3).padStart(10) + '  ' + pct(g.eaten, g.in) + '   ' + pct(g.expired, g.in) + '        ' + pct(g.tooBig, g.in) + '                  ' + pct(g.gutFull, g.in) + '              ' + (can * 100).toFixed(0).padStart(4) + '%'); }
  const gap = w.bodies.map(o => o.prof.gape).sort((a, b) => a - b); console.log('  口の開き：中央 ' + (gap[gap.length >> 1] || 0).toFixed(2) + '、最大 ' + (gap[gap.length - 1] || 0).toFixed(2) + '（飲めるのは開きの 1.3 倍まで）'); }
