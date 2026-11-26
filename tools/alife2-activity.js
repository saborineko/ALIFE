// Is new kind of body still appearing and lasting, or has it stopped? A measure of how open a world's evolution is (after Bedau and
// Packard's evolutionary activity statistics, used to judge Geb), kept as a record, never as a reward.
// A body plan counts as a lasting novelty if the lineage that first had it lived through at least G generations with at least M members.
// Printed: how many lasting novelties had appeared by each time (does the curve keep rising?), how many are alive now, and the
// activity of the living plans (members so far), old against new.
// Usage: node tools/alife2-activity.js <world.json | world.json.gz> [M=20] [G=5]
const fs = require('fs'), zlib = require('zlib');
const [file, mArg, gArg] = process.argv.slice(2), M = Number(mArg) || 20, G = Number(gArg) || 5;
const d = JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)), T = d.t, cl = d.clades || [];
const lasting = cl.filter(c => c.members >= M && (c.genMax - c.gen0) >= G).sort((a, b) => a.born - b.born), bins = 12, w = T / bins;
console.log('世界 t=' + Math.round(T) + ' / 記録にある体制 ' + cl.length + '（1〜2 個体で消えたものの一部は記録から落としてある：' + (d.cladesDropped || 0) + '）');
console.log('続いた新規性（' + M + ' 個体以上・' + G + ' 世代以上続いた体制）：累計 ' + lasting.length + '、うち いま生きている ' + lasting.filter(c => c.ended == null).length);
let cum = 0; const row = []; for (let b = 0; b < bins; b++) { const n = lasting.filter(c => c.born >= b * w && c.born < (b + 1) * w).length; cum += n; row.push(Math.round((b + 1) * w) + '秒:' + cum + '(+' + n + ')'); }
console.log('  時刻ごとの累計（括弧内はその区間の新規）：' + row.join(' '));
{ const seen = new Set(), firsts = []; for (const c of lasting) if (!seen.has(c.kind)) { seen.add(c.kind); firsts.push(c.born); } let cu = 0; const r2 = []; for (let b = 0; b < bins; b++) { const n = firsts.filter(v => v >= b * w && v < (b + 1) * w).length; cu += n; r2.push(cu + '(+' + n + ')'); }
  console.log('  そのうち、それまでに無かった体制（体節数・口の数・眼・関節・繊毛の組み合わせが初めてのもの）の累計：' + r2.join(' ') + '。後半に初めて現れたもの ' + firsts.filter(v => v >= T / 2).length + ' / ' + firsts.length); }
const half = lasting.filter(c => c.born >= T / 2).length, q4 = lasting.filter(c => c.born >= T * 0.75).length;
console.log('  後半に現れたもの ' + half + '（全体の ' + (lasting.length ? (half / lasting.length * 100).toFixed(0) : 0) + '%）、最後の 1/4 に現れたもの ' + q4 + '。新規が止まっていれば 0 に近づき、一定の率で続いていれば後半は 50% 前後になる。');
const alive = cl.filter(c => c.ended == null && c.alive > 0).sort((a, b) => b.members - a.members), tot = alive.reduce((a, c) => a + c.alive, 0);
console.log('いま生きている体制 ' + alive.length + '（個体 ' + tot + '）。個体数の多い順：'); for (const c of alive.slice(0, 6)) { const k = c.kind.split('/'); console.log('  ' + c.alive + ' 匹：体節 ' + k[0] + '・口 ' + k[1] + (k[2] === '1' ? '・眼' : '') + (k[3] === '1' ? '・関節' : '') + (k[4] === '1' ? '・繊毛' : '') + '、現れた時刻 ' + Math.round(c.born) + '、これまでの個体 ' + c.members + '、世代 ' + (c.genMax - c.gen0)); }
const old = alive.filter(c => c.born < T / 2).reduce((a, c) => a + c.alive, 0); console.log('  いまの個体のうち、前半に現れた体制のもの ' + (tot ? (old / tot * 100).toFixed(0) : 0) + '%');
