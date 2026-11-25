// Do evolved bodies use what they perceive, and does it do them any good? Two separate questions.
// Takes the body plans alive at the end of a selection trial, puts copies in fresh worlds of the same kind, and compares:
//   intact / told nothing about where food is (blind) / unable to taste dissolved food (numb)
// BEHAVIOUR: travel, how straight, turning, cilia activity, nerve activity.   OUTCOME: intake, income, survival, energy put into eggs.
// A difference counts only if the ranges over worlds do not overlap. Works for the original world and for mapped worlds.
// Usage: node tools/alife2-ablate.js <result.json> [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [file, secs, ...seedArgs] = process.argv.slice(2), d = require(require('path').resolve(file)), T = Number(secs) || 150, seeds = seedArgs.length ? seedArgs.map(Number) : [801, 802, 803, 804];
const map = (d.options && d.options.map) || '', MODES = [['intact', 'そのまま'], ['blind', '餌の方向を切断'], ['numb', '味覚を切断']];
const BEH = [['speed', '自力移動 u/s'], ['straight', '直進度'], ['turn', '旋回 rad/s'], ['cilia', '繊毛の活動'], ['nerve', '神経の活動']], OUT = [['mouth', '口から /s'], ['income', '収入 /s'], ['alive', '生存'], ['eggs', '卵への投資 /s']];
function run(seed, mode) {
  const w = new A.engine.World({ seed, map, founders: 0, cap: 0, blind: mode === 'blind' ? 1 : 0, numb: mode === 'numb' ? 1 : 0 }); for (let i = 0; i < 1200; i++) w.step();
  for (const k of d.top) for (let i = 0; i < Math.max(1, Math.round(k.count / 3)); i++) w.spawn(A.genome.sanitize(A.genome.copy(k.genome)), w.rand() * w.W, 3 + w.rand() * (Math.min(w.H, w.yBottom) - 6), 1, null);
  const all = w.bodies.slice(), ang = o => Math.atan2(o.b.segs[0].dy, o.b.segs[0].dx);
  for (const o of all) { o.start = w.regions ? w.regionAt(o.cx) : 0; o.x0 = o.cx; o.y0 = o.cy; o.th = ang(o); o.turned = 0; o.net = 0; }
  for (let i = 0; i < 30 * T; i++) { w.step(); if (i % 5 === 4) for (const o of all) if (!o.dead) { const a = ang(o); let da = a - o.th; da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI; o.turned += Math.abs(da); o.th = a; let dx = o.cx - o.x0; dx -= Math.round(dx / w.W) * w.W; o.net = Math.hypot(dx, o.cy - o.y0); } }
  const groups = w.regions ? w.regions.map(q => all.filter(o => o.start === q.id)) : [all], age = o => Math.max(1, o.age);
  return groups.map(l => { const m = f => l.length ? l.reduce((a, o) => a + f(o), 0) / l.length : 0; return { n: l.length,
    speed: m(o => o.path / age(o)), straight: m(o => o.path > 0.5 ? Math.min(1, o.net / o.path) : 0), turn: m(o => o.turned / age(o)), cilia: m(o => o.b.ciliaUse / age(o)), nerve: m(o => o.b.nerveUse / age(o)),
    mouth: m(o => o.eaten * o.prof.eta / age(o)), income: m(o => (o.absorbed + o.eaten * o.prof.eta) / age(o)), alive: m(o => o.dead ? 0 : 1), eggs: m(o => (o.egg + o.kids * o.eggCost) / age(o)) }; });
}
const names = map ? new A.engine.World({ map, founders: 0 }).regions.map(q => q.name) : ['世界全体'], res = {};
for (const [mode] of MODES) res[mode] = seeds.map(s => run(s, mode));
console.log(file.split('/').pop() + (map ? '（' + map + '）' : '') + ' — ' + seeds.length + ' 世界、' + T + ' 秒');
const verdicts = [];
names.forEach((nm, g) => {
  const vals = (mode, k) => res[mode].map(r => r[g][k]), mean = v => v.reduce((a, b) => a + b, 0) / v.length, fmt = v => mean(v).toFixed(3) + ' [' + Math.min(...v).toFixed(3) + '〜' + Math.max(...v).toFixed(3) + ']';
  console.log('  ' + nm + '（' + res.intact[0][g].n + ' 体）');
  for (const [title, list] of [['行動', BEH], ['結果', OUT]]) for (const [k, label] of list) {
    const base = vals('intact', k), line = ['    ' + title + ' ' + label.padEnd(10, '　') + ' そのまま ' + fmt(base)];
    for (const [mode, ml] of MODES.slice(1)) { const v = vals(mode, k), apart = Math.min(...v) > Math.max(...base) || Math.max(...v) < Math.min(...base); line.push(ml + ' ' + fmt(v) + (apart ? ' ★' : '')); if (apart) verdicts.push(nm + '：' + ml + 'で' + title + '「' + label + '」が変わる（' + mean(base).toFixed(3) + ' → ' + mean(v).toFixed(3) + '）'); }
    console.log(line.join(' ｜ '));
  }
});
console.log(verdicts.length ? '世界ごとの範囲が重ならない差：\n  ' + verdicts.join('\n  ') : '世界ごとの範囲が重ならない差は、行動にも結果にも無い。');
