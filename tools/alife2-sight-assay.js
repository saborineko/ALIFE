// Can a body see things other than food, and use what it sees? Artificial bodies only (nothing here evolved).
// An eye is one receptor on one segment: it looks one way and reports how much of its field is filled by its colour.
// Each wiring is run again with sight cut (sightless).
// 1) others: 12 swimmers whose eye is tuned to one colour, among 24 bodies that do not move, of that colour or of another.
//    The wiring: "rest while something of that colour is in view, swim otherwise".
// 2) food: a one-eyed swimmer that "turns until food is in view, then goes straight".
// Usage: node tools/alife2-sight-assay.js [seconds] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [secs, ...seedArgs] = process.argv.slice(2), T = Number(secs) || 200, seeds = seedArgs.length ? seedArgs.map(Number) : [811, 812, 813, 814], C = A.organs.C, RAD = Math.PI / 180;
const body = (o, hue) => { const g = A.genome.primordial(1); Object.assign(g.parts[0], { cilia: 0.5, beat: -1, nerve: 0.5 }, o); g.hue = hue; return g; };
const world = (seed, cut) => { const w = new A.engine.World({ seed, founders: 0, cap: 0, vision: 1, sightless: cut ? 1 : 0 }); for (let i = 0; i < 900; i++) w.step(); return w; };
const put = (w, g) => { const o = w.spawn(g, w.rand() * w.W, 4 + w.rand() * (w.yBottom - 8), 1, null); o.E = o.prof.Emax * 0.4; return o; };
const stats = (all, seen) => { const m = f => all.reduce((a, o) => a + f(o), 0) / all.length, age = o => Math.max(1, o.age);
  return { mouth: m(o => o.eaten * o.prof.eta / age(o)), income: m(o => (o.absorbed + o.eaten * o.prof.eta) / age(o)), cost: m(o => o.prof.basal + (C.ciliaWork * o.b.ciliaUse + C.spike * o.b.nerveUse) / age(o) + C.synapse * o.prof.wiring), alive: all.filter(o => !o.dead).length / all.length, path: m(o => o.path), seen }; };
const line = (name, r) => { const mean = k => r.reduce((a, x) => a + x[k], 0) / r.length, rng = (f, d) => '[' + Math.min(...r.map(f)).toFixed(d) + '〜' + Math.max(...r.map(f)).toFixed(d) + ']';
  console.log('  ' + name.padEnd(20, '　') + ' 移動 ' + mean('path').toFixed(1) + ' ' + rng(x => x.path, 1) + ' 口からの収入 ' + mean('mouth').toFixed(4) + ' ' + rng(x => x.mouth, 4) + ' 収支 ' + (mean('income') - mean('cost')).toFixed(3) + ' ' + rng(x => x.income - x.cost, 3) + ' 生存 ' + (mean('alive') * 100).toFixed(0) + '% 眼の読み（平均） ' + mean('seen').toFixed(3)); };
const run = (make, cut, others) => seeds.map(seed => { const w = world(seed, cut), all = []; for (let i = 0; i < 12; i++) all.push(put(w, make()));
  if (others != null) for (let i = 0; i < 24; i++) put(w, body({ cilia: 0, r0: 1, r1: 1, len: 1 }, others));
  let seen = 0, n = 0; for (let i = 0; i < 30 * T; i++) { w.step(); if (i % 30 === 0) for (const o of all) if (!o.dead && o.b.segs[0].v != null) { seen += o.b.segs[0].v; n++; } }
  return stats(all, n ? seen / n : 0); });

const only = process.env.ONLY;
// 3) added after seeing 1): there the 24 others ate the water bare and most watchers starved within the run, so movement
//    said little. Here: 8 small others in one place, the watchers start around them; speed is taken per second alive.
if (!only || only === '3') {
  const w3 = { eye: 0.5, vE: -4, nB: -2, mCil: 1, tune: 200 * RAD };
  const run3 = (cut, hue) => seeds.map(seed => { const w = world(seed, cut), all = [], cx = 80, cy = 35;
    for (let i = 0; i < 8; i++) w.spawn(body({ cilia: 0 }, hue), cx + Math.cos(i) * 3, cy + Math.sin(i) * 3, 1, null);
    for (let i = 0; i < 12; i++) { const a = i / 12 * 2 * Math.PI, o = w.spawn(body(w3, 200), cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, 1, null); o.E = o.prof.Emax * 0.6; all.push(o); }
    let seen = 0, n = 0, rest = 0; for (let i = 0; i < 30 * T; i++) { w.step(); if (i % 30 === 0) for (const o of all) if (!o.dead) { seen += o.b.segs[0].v || 0; rest += o.b.segs[0].cd < 0.5 ? 1 : 0; n++; } }
    const live = all.filter(o => !o.dead), m = f => all.reduce((a, o) => a + f(o), 0) / all.length;
    return { speed: m(o => o.path / Math.max(1, o.age)), rest: rest / Math.max(1, n), dist: live.length ? live.reduce((a, o) => a + Math.hypot(Math.min(Math.abs(o.cx - cx), w.W - Math.abs(o.cx - cx)), o.cy - cy), 0) / live.length : NaN, alive: live.length / all.length, seen: seen / Math.max(1, n) }; });
  const line3 = (name, r) => { const mean = k => r.reduce((a, x) => a + x[k], 0) / r.length, rng = (k, d) => '[' + Math.min(...r.map(x => x[k])).toFixed(d) + '〜' + Math.max(...r.map(x => x[k])).toFixed(d) + ']';
    console.log('  ' + name.padEnd(18, '　') + ' 速さ ' + mean('speed').toFixed(3) + ' ' + rng('speed', 3) + ' 休んでいた時間 ' + (mean('rest') * 100).toFixed(0) + '% ' + rng('rest', 2) + ' 群れの中心まで ' + mean('dist').toFixed(1) + ' ' + rng('dist', 1) + ' 生存 ' + (mean('alive') * 100).toFixed(0) + '% 眼の読み ' + mean('seen').toFixed(3)); };
  console.log('== 3) 他個体を見る（追加）：動かない 8 匹の群れのまわりに 12 匹。「色 200° が見えている間は休む」');
  line3('群れが色 200°', run3(false, 200)); line3('同・視覚を切断', run3(true, 200)); line3('群れが色 290°', run3(false, 290)); line3('同・視覚を切断　', run3(true, 290));
}
if (only === '3') process.exit(0);
const watcher = { eye: 0.5, vE: -4, nB: -2, mCil: 1, tune: 200 * RAD }; // something of its colour in view -> rest; nothing -> swim
console.log('== 1) 他個体を見る：色 200° に調律した眼。「見えている間は休み、見えなければ泳ぐ」');
line('動かない他個体が色 200°', run(() => body(watcher, 200), false, 200));
line('同・視覚を切断', run(() => body(watcher, 200), true, 200));
line('動かない他個体が色 290°', run(() => body(watcher, 200), false, 290));
line('同・視覚を切断　', run(() => body(watcher, 200), true, 290));
line('他個体なし', run(() => body(watcher, 200), false, null));
const seeker = { eye: 0.5, vE: -2, nB: 1.5, mTurn: 1.5, tune: 50 * RAD }; // food in view -> straight; none -> turn
console.log('== 2) 餌を見る：色 50°（餌の色）に調律した片眼。「見えるまで回り、見えたら直進」');
line('繊毛・回路なし（眼なし）', run(() => body({}, 200), false, null));
line('眼はあるが配線なし', run(() => body({ eye: 0.5 }, 200), false, null));
line('見えるまで回り、見えたら直進', run(() => body(seeker, 200), false, null));
line('同・視覚を切断', run(() => body(seeker, 200), true, null));
line('逆（見えると回る）', run(() => body(Object.assign({}, seeker, { vE: 2, nB: 1.5 }), 200), false, null));
const change = { eye: 1, adapt: 1, vE: 2, nB: -2, mTurn: 1.5, tune: 50 * RAD }; // not registered beforehand: a narrow eye that reports change
line('狭い眼・増えていれば直進', run(() => body(change, 200), false, null));
line('同・視覚を切断　', run(() => body(change, 200), true, null));
