// Stage 1: does working sense-to-movement wiring settle in under natural selection? A reading device, outside the world.
// One saved evolved world is continued twice with the same random numbers: as it is, and with some settings changed (here: wireGrow=1).
// At the end the adults are read. Nothing is put back into a world and no body is chosen by what is read: the worlds are thrown away.
// What is read, how runs are paired and what counts as "settled" were fixed beforehand: docs/alife2/prereg/2026-11-27-stage1-wiring.md
// Usage: node tools/alife2-stage1.js <seconds> <world.json.gz> <key=value,...> <k> <0|1>     (one run: prints one JSON line)
//        node tools/alife2-stage1.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const mean = L => (L.length ? L.reduce((a, b) => a + b, 0) / L.length : NaN), med = L => { const s = L.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };

if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), pairs = [];
  for (const a of rows.filter(r => !r.on)) { const b = rows.find(r => r.on && r.world === a.world && r.k === a.k && r.T === a.T); if (b) pairs.push([a, b]); }
  const f = (x, d) => (Number.isFinite(x) ? x.toFixed(d == null ? 2 : d) : '—'), n = pairs.length;
  console.log('対 ' + n + ' 組（そのまま → ' + (pairs[0] ? pairs[0][1].opts : '') + '、' + (pairs[0] ? pairs[0][0].T : '?') + ' 秒）');
  console.log('世界・乱数 | 成体 | W 配線の量 | S 感覚・運動の配線 | F 感覚の利益 | M 育ち切る割合 | 神経を持つ | leak<0.9 | 個体数 | 世代');
  for (const [a, b] of pairs) console.log([a.world + '・' + a.k, a.adults + '→' + b.adults, f(a.W) + '→' + f(b.W) + '（' + f(b.W / a.W) + ' 倍）', f(a.S, 3) + '→' + f(b.S, 3) + '（' + (b.S - a.S >= 0 ? '+' : '') + f(b.S - a.S, 3) + '）', f(a.F, 3) + '→' + f(b.F, 3), f(a.M, 3) + '→' + f(b.M, 3) + '（' + f(b.M / a.M) + ' 倍）', f(a.neuronBodies, 3) + '→' + f(b.neuronBodies, 3), f(a.slow, 3) + '→' + f(b.slow, 3), a.n + '→' + b.n, f(a.gen, 1) + '→' + f(b.gen, 1)].join(' | '));
  if (!n) process.exit(0);
  // the decision, as fixed beforehand
  const dS = pairs.map(([a, b]) => b.S - a.S), rW = pairs.map(([a, b]) => b.W / a.W), need = Math.ceil(n * 7 / 8), needF = Math.ceil(n * 6 / 8);
  const c1 = mean(dS) >= 0.10 && dS.filter(x => x > 0).length >= need, c2 = rW.filter(x => x >= 1.15).length >= need;
  const Fon = pairs.map(p => p[1].F), seF = Math.sqrt(Fon.reduce((s, x) => s + (x - mean(Fon)) ** 2, 0) / Math.max(1, n - 1) / n);
  const c3 = Fon.filter(x => x > 0).length >= needF && mean(Fon) >= mean(pairs.map(p => p[0].F)) && mean(Fon) > 2 * seF, none = mean(dS) < 0.03 && mean(rW) < 1.05;
  const rM = pairs.map(([a, b]) => b.M / a.M);
  console.log('条件 1（S の差の平均 +0.10 以上、' + need + ' 対以上で正）：平均 ' + f(mean(dS), 3) + '、正 ' + dS.filter(x => x > 0).length + ' 対 → ' + (c1 ? '成立' : '不成立'));
  console.log('条件 2（W の比が ' + need + ' 対以上で 1.15 以上）：1.15 以上 ' + rW.filter(x => x >= 1.15).length + ' 対、平均 ' + f(mean(rW)) + ' 倍 → ' + (c2 ? '成立' : '不成立'));
  console.log('条件 3（規則ありの F が ' + needF + ' 本以上で正、平均がそのままの平均以上）：正 ' + pairs.filter(([, b]) => b.F > 0).length + ' 本、平均 ' + f(mean(pairs.map(p => p[1].F)), 3) + '（そのまま ' + f(mean(pairs.map(p => p[0].F)), 3) + '）、平均の標準誤差 ' + f(seF, 3) + '（平均がその 2 倍を超えること）→ ' + (c3 ? '成立' : '不成立'));
  console.log('仕組みの確認（M が 1.3 倍以上）：' + rM.filter(x => x >= 1.3).length + ' 対、平均 ' + f(mean(rM)) + ' 倍');
  console.log('判定：' + (n < 8 ? '（対が 8 組に足りない：仮の表示）' : '') + (c1 && c2 && c3 ? '定着した' : none ? '関門ではなかった' : c1 && c2 ? '決まらない（配線は増えたが、役に立っている証拠は無い）' : '決まらない'));
  process.exit(0);
}

const [secs, file, optStr, kArg, flag] = process.argv.slice(2), T = Number(secs), k = Number(kArg) || 1, on = {};
for (const s of (optStr || '').split(',').filter(Boolean)) { const [key, v] = s.split('='); on[key] = Number.isNaN(Number(v)) ? v : Number(v); }
const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file))));
w.rand = A.genome.rng(7000 + k); if (Number(flag)) w.enable(on);
// M: the young born in the first half of the last 600 seconds (of the whole stretch, if it is shorter): how many grow up before the end
const win = Math.min(600, T), t0 = w.t, from = t0 + T - win, to = from + win / 2, young = [], spawn0 = w.spawn.bind(w);
w.spawn = function (g, x, y, stage, parent) { const o = spawn0(g, x, y, stage, parent); if (parent && w.t >= from && w.t < to) young.push(o); return o; };
for (let i = 0; i < 30 * T && w.bodies.length; i++) { w.step(); for (const o of young) if (!o.up && !o.dead && o.stage >= 1) o.up = true; }
w.spawn = spawn0;

// S: a segment the body really has, where a sense it has there reaches something it can move there
const sm = (o, i) => { const s = o.plan.segs[i], p = s.p, a = Math.abs; if (!(p.nerve > 0.05)) return false;
  const sense = a(p.nC) > 0.2 || (w.scent && (a(p.sA) > 0.2 || a(p.sB) > 0.2)) || (w.vision && p.eye > 0.1 && a(p.vE) > 0.2) || (w.sound && p.ear > 0.02 && a(p.hE) > 0.2) || (w.contact && (a(p.sT) > 0.2 || a(p.sW) > 0.2));
  const act = (p.cilia > 0.05 && (a(p.mCil) > 0.1 || a(p.mTurn) > 0.1)) || (i > 0 && p.muscle > 0.02 && a(p.mJoint) > 0.1) || (w.contact && p.mouth > 0.1 && s.tip && a(p.mBite) > 0.1);
  return sense && act; };
const neuronSM = p => !!(p.nn && p.nn.some(q => q.out.length && q.in.some(e => 'cABvtwhjge'.includes(e[0][0]))));
const adults = w.bodies.filter(o => o.stage >= 1), share = f => mean(adults.map(o => (f(o) ? 1 : 0)));
const S = share(o => o.plan.segs.some((s, i) => sm(o, i) || neuronSM(s.p)));
const leaks = adults.flatMap(o => o.b.segs.filter(q => q.circ).map(q => q.p.leak));
// F: two copies of the finished world go on for 60 seconds with the same random numbers; in one, every sense a segment has is cut
const saved = JSON.stringify(w.save()), income = (cut, r) => { const c = A.engine.World.restore(JSON.parse(saved)); c.rand = A.genome.rng(8000 + 100 * r + k); if (cut) Object.assign(c, { numb: 1, anosmic: 1, sightless: 1, deaf: 1, numbSkin: 1 });
  const all = c.bodies.slice(), inc = o => o.absorbed + o.eaten * o.prof.eta, at0 = all.map(inc); for (let i = 0; i < 1800 && c.bodies.length; i++) c.step(); return all.reduce((s, o, i) => s + inc(o) - at0[i], 0); };
const Fs = adults.length ? [0, 1, 2].map(r => { const i = income(0, r), x = income(1, r); return { i, x, F: i / x - 1 }; }) : [], inI = mean(Fs.map(q => q.i)), inC = mean(Fs.map(q => q.x)), c = w.census(); // (three times, each with its own random numbers: one reading is within the noise)
console.log(JSON.stringify({ world: file.split('/').pop().replace(/-t\d+\.json\.gz$/, ''), k, on: Number(flag), opts: optStr, T, n: w.bodies.length, adults: adults.length, gen: c.gen,
  W: mean(adults.map(o => o.full.wiring)), S, F: mean(Fs.map(q => q.F)), Fs: Fs.map(q => q.F), incomeIntact: inI, incomeCut: inC, M: young.length ? young.filter(o => o.up).length / young.length : NaN, young: young.length,
  localSM: share(o => o.plan.segs.some((s, i) => sm(o, i))), neuronSM: share(o => o.plan.segs.some(s => neuronSM(s.p))), neuronBodies: share(o => o.plan.segs.some(s => s.p.nn && s.p.nn.length)), neurons: mean(adults.map(o => o.plan.segs.reduce((a, s) => a + (s.p.nn ? s.p.nn.length : 0), 0))),
  plastic: share(o => o.plan.segs.some(s => s.p.nn && s.p.nn.some(q => q.in.some(e => e[2])))), leakMedian: med(leaks), slow: share(o => o.plan.segs.some(s => A.neural.wiring(s.p) > 1e-6 && (s.p.leak < 0.9 || (s.p.nn && s.p.nn.some(q => q.k < 0.9))))),
  adultV: mean(adults.map(o => o.full.V)), segs: mean(adults.map(o => o.full.segs)), nutrient: c.nutrient, wireShareNewborn: med(w.bodies.filter(o => o.stage < 1).map(o => (o.prof.wireCost != null ? o.prof.wireCost : o.prof.wiring * A.organs.C.synapse) / o.prof.basal)) }));
