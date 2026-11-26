// A finer record of novelty than tools/alife2-activity.js keeps. That one tells body plans apart by five things (segments, mouths, eye, working joint, cilia).
// This one reads the genome of every body in the ancestry of today's population and also tells apart: how many kinds of part the body is built of, whether an axis
// is divided, neurons, whether an eye or a nose is wired to anything, pads, armour, connections that learn, and size.
// Printed: how many such kinds have appeared in the ancestry by each time (does it keep rising?), how many are alive, and which features are spreading.
// It counts only what left descendants to this day: a novelty that died out is not in the ancestry any more. A record, never a reward.
// Two counts. "Seen in the ancestry": every kind any ancestor or living body has; the last stretch of time is inflated, because today's bodies include
// fresh variants that selection has not yet judged. "Established": kinds whose first carrier has many living descendants (20, or 4% of the population if that
// is more); here the last stretch is deflated instead, because a new kind has had no time to spread. The truth about recent times lies between the two.
// Usage: node tools/alife2-novelty.js <world.json | world.json.gz> [...more worlds]
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js'); for (const f of ['development', 'organs']) require('../alife2-' + f + '.js');
const cls = (x, edges) => { let i = 0; while (i < edges.length && x >= edges[i]) i++; return i; };
function features(g, maxSegs) {
  const plan = A.development.develop(g, { maxSegs }), pr = A.organs.profile(plan), used = new Set(plan.segs.map(s => s.part)), parts = [...used].map(i => g.parts[i]), segs = plan.segs;
  const neurons = segs.reduce((a, s) => a + (s.p.nn ? s.p.nn.length : 0), 0), srcs = new Set(); for (const p of parts) for (const q of p.nn || []) for (const e of q.in) srcs.add(e[0][0]);
  return { segs: cls(segs.length, [2, 3, 5, 9, 17, 33]), mouths: cls(pr.mouths.length, [1, 2, 3]), kinds: cls(used.size, [2, 3, 4]), zoned: parts.some(p => p.next != null && p.next >= 0) ? 1 : 0,
    joint: segs.some(s => s.id > 0 && s.p.amp > 0.02 && s.p.muscle > 0.02) ? 1 : 0, cilia: pr.cilia > 0.05 ? 1 : 0, eye: segs.some(s => s.p.eye > 0.05 && (Math.abs(s.p.vE || 0) > 0.05 || (s.p.nn || []).some(q => q.in.some(e => e[0] === 'v')))) ? 1 : 0,
    nose: parts.some(p => Math.abs(p.sA || 0) > 0.05 || Math.abs(p.sB || 0) > 0.05) || srcs.has('A') || srcs.has('B') ? 1 : 0, feel: parts.some(p => Math.abs(p.sT || 0) > 0.05 || Math.abs(p.sW || 0) > 0.05) || srcs.has('t') || srcs.has('w') ? 1 : 0,
    neurons: cls(neurons, [1, 3, 7]), across: srcs.has('p') || srcs.has('k') || srcs.has('m') ? 1 : 0, learns: parts.some(p => (p.nn || []).some(q => q.in.some(e => e[2]))) ? 1 : 0,
    pad: segs.some(s => s.leaf && s.p.grip > 0.05) ? 1 : 0, armor: parts.some(p => p.armor > 0.2) ? 1 : 0, size: cls(Math.log2(Math.max(1e-3, pr.V)), [-3, -1, 1, 3, 5]) };
}
const NAMES = { segs: '体節の数の階級', mouths: '口の数', kinds: '部品の種類', zoned: '軸の区分', joint: '働く関節', cilia: '繊毛', eye: '配線された眼', nose: '配線された嗅覚', feel: '配線された触覚・傷の感覚', neurons: '神経の数の階級', across: '体節をまたぐ神経結合', learns: '経験で変わる結合', pad: 'パッド', armor: '外骨格', size: '体積の階級' };
for (const file of process.argv.slice(2)) {
  const d = JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)), T = d.t, maxSegs = d.opt.maxSegs, bins = 8, w = T / bins, first = new Map(), firstF = {}, memo = new Map();
  const alive = new Set(d.bodies.map(b => b.id)), nodes = d.tree.filter(n => n.g).sort((a, b) => a.born - b.born), now = new Map(), share = {};
  const byId = new Map(d.tree.map(n => [n.id, n])), desc = new Map(), need = Math.max(20, Math.ceil(0.04 * d.bodies.length)), est = new Map();
  for (const b of d.bodies) { let n = byId.get(b.id); while (n) { desc.set(n.id, (desc.get(n.id) || 0) + 1); n = byId.get(n.parent); } }
  for (const n of nodes) { let f = memo.get(n.g); if (!f) { f = features(n.g, maxSegs); memo.set(n.g, f); } const key = Object.values(f).join('');
    if (!first.has(key)) first.set(key, n.born); if (!est.has(key) && (desc.get(n.id) || 0) >= need) est.set(key, n.born); for (const k in f) { const v = k + '=' + f[k]; if (!(v in firstF)) firstF[v] = n.born; }
    if (alive.has(n.id)) { now.set(key, (now.get(key) || 0) + 1); for (const k in f) if (f[k] > 0 && !['segs', 'mouths', 'kinds', 'neurons', 'size'].includes(k) || (['kinds', 'neurons'].includes(k) && f[k] > 0)) share[k] = (share[k] || 0) + 1; } }
  let cum = 0; const row = []; for (let b = 0; b < bins; b++) { const k = [...first.values()].filter(v => v >= b * w && (v < (b + 1) * w || b === bins - 1)).length; cum += k; row.push(Math.round((b + 1) * w) + '秒:' + cum + '(+' + k + ')'); }
  const late = [...first.values()].filter(v => v >= T / 2).length;
  console.log('== ' + file + '（t=' + Math.round(T) + '、個体 ' + d.bodies.length + '、系譜に残る祖先 ' + nodes.length + '）');
  console.log('  いまの個体の祖先に現れた、細かく分けた身体の種類：累計 ' + first.size + '、うち後半に初めて現れたもの ' + late + '（' + (first.size ? (100 * late / first.size).toFixed(0) : 0) + '%）、いま生きている種類 ' + now.size);
  console.log('  時刻ごとの累計（括弧内はその区間の新規。最後の区間は、まだ淘汰を受けていない新しい変異を含むので多く出る）：' + row.join(' '));
  { let c2 = 0; const r2 = []; for (let b = 0; b < bins; b++) { const k = [...est.values()].filter(v => v >= b * w && (v < (b + 1) * w || b === bins - 1)).length; c2 += k; r2.push(Math.round((b + 1) * w) + '秒:' + c2 + '(+' + k + ')'); }
    console.log('  定着した種類（最初の持ち主の子孫がいま ' + need + ' 個体以上）：累計 ' + est.size + '、うち後半に現れたもの ' + [...est.values()].filter(v => v >= T / 2).length + '。時刻ごと（最後の区間は、広がる時間がまだ無いので少なく出る）：' + r2.join(' ')); }
  console.log('  いまの個体が持つ特徴：' + Object.keys(NAMES).filter(k => share[k]).map(k => NAMES[k] + (['kinds', 'neurons'].includes(k) ? '（2 以上／1 個以上）' : '') + ' ' + (100 * share[k] / d.bodies.length).toFixed(0) + '%').join(' / '));
  console.log('  特徴が祖先に初めて現れた時刻：' + Object.entries(firstF).filter(([k, t]) => t > 0).sort((a, b) => a[1] - b[1]).map(([k, t]) => NAMES[k.split('=')[0]] + (['segs', 'mouths', 'kinds', 'neurons', 'size'].includes(k.split('=')[0]) ? ' ' + k.split('=')[1] : '') + ' ' + Math.round(t) + '秒').join('、'));
}
