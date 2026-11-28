// Is there anything a body of an evolved world could gain by acting on what it senses? A designed circuit is put into the residents themselves.
// Every body that has beating cilia gets, on each such part, the same connection from one sense, enough nerve tissue to carry it, and nothing else
// (its own evolved wiring on those parts is taken out). In a random half of the bodies and in all their descendants ("driven") the signal moves the
// cilia; in the other half ("idle") the same signal is formed and paid for, and the connection to the cilia is replaced by one of the same strength
// to a gland that does nothing in a world without the nest rule. So both sides have the same bodies, sense the same and pay the same; only whether
// the sense acts differs. The side follows the mother, not a gene, and a child's genes on those parts are set again at birth, so mutation and
// mixing cannot blur the two sides. Read like tools/alife2-cut-assay.js: the same split is run twice (`other` gives the design to the other half),
// and the two runs are compared; a share is never read against 0.50.
// Designs (what the driven side does):
//   dwell  taste, how rich the water is against what is usual in that world: swims slower in richer water, harder in poorer water
//   chase  the opposite of dwell
//   turn   taste, the change against a second ago: keeps straight, and turns while the water is getting poorer
//   crowd  smell of bodies, against what is usual: swims harder where it smells of bodies, slower where it does not
//   flee   touch: swims harder while something pushes on it
//   hurt   wound: swims harder while it is torn or damaged
// Usage: node tools/alife2-design-assay.js <seconds> <world.json(.gz)> <design> run <k> [other|-] [key=value,…]   (one run: one JSON line)
//        (settings: rules to switch on in the saved world, e.g. vents=1 or still=25; and flow=0 for water that does not carry the bodies;
//         inherit=1: the circuit is given once, at the start, and from then on it is an ordinary part of the genome: mutation and mixing change it, a child
//         has whatever its parents' genes give it. The side still follows the mother. The run then also tells how much of the circuit is left, and where.)
//         CAUTION: with inherit=1 the two sides are no longer equal. The idle side's connection to the gland (mSec) neither mutates nor mixes in a world without the
//         nest rule, so the idle lineage can never shed that cost and the driven one can. Read only how much of the circuit is left, not which side grows.)
//        node tools/alife2-design-assay.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
const NAMES = { dwell: '濃い水で緩め、薄い水で強く泳ぐ（味覚）', chase: '濃い水で強く、薄い水で緩める（味覚）', turn: '水が薄くなっていくあいだだけ曲がる（味覚）', crowd: '身体の匂いが濃いところで強く泳ぐ（匂い）', flee: '押されているあいだ強く泳ぐ（触覚）', hurt: '傷を負っているあいだ強く泳ぐ（傷の感覚）' };
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), mean = l => l.reduce((a, b) => a + b, 0) / l.length, sd = l => { const m = mean(l); return l.length > 1 ? Math.sqrt(l.reduce((a, b) => a + (b - m) ** 2, 0) / (l.length - 1)) : 0; };
  const sg = (x, d) => (x >= 0 ? '+' : '') + x.toFixed(d), pm = (l, d) => sg(mean(l), d) + ' ± ' + (sd(l) / Math.sqrt(l.length)).toFixed(d) + '（' + l.map(x => sg(x, d)).join('、') + '）';
  for (const key of [...new Set(rows.map(r => r.design + '|' + r.world + '|' + (r.set || '') + '|' + r.T))]) {
    const [design, world, set, T] = key.split('|'), R = rows.filter(r => r.design === design && r.world === world && (r.set || '') === set && String(r.T) === T), ks = [...new Set(R.map(r => r.k))].sort((a, b) => a - b);
    console.log('設計「' + design + '」：' + (NAMES[design] || '') + ' ｜ 世界 ' + world + (set ? '（' + set + '）' : '') + '、' + T + ' 秒、' + R.length + ' 本');
    console.log('  回路の様子（動かす側）：繊毛の強さ 平均 ' + mean(R.map(r => r.cd[r.side])).toFixed(3) + '、その個体内の時間変動 ' + mean(R.map(r => r.cdSd[r.side])).toFixed(3) + '、舵 平均 ' + mean(R.map(r => r.ct[r.side])).toFixed(3) + ' ｜ 動かさない側：繊毛 ' + mean(R.map(r => r.cd[3 - r.side])).toFixed(3) + '、舵 ' + mean(R.map(r => r.ct[3 - r.side])).toFixed(3) + ' ｜ 回路を入れた個体 ' + mean(R.map(r => r.given)).toFixed(0) + ' 匹（全 ' + mean(R.map(r => r.bodies0)).toFixed(0) + ' 匹）、終わりの個体数 ' + mean(R.map(r => r.bodies)).toFixed(0));
    // each split read twice: the design on half 1, and on half 2. For any measure m: log(m1/m2) with the design on half 1, minus the same with it on half 2, halved = log(driven / idle), the split cancelled
    const pairs = ks.map(k => [R.find(r => r.k === k && r.side === 1), R.find(r => r.k === k && r.side === 2)]).filter(p => p[0] && p[1]);
    if (!pairs.length) { console.log('  同じ分け方の組がまだ無い'); continue; }
    const ratio = f => pairs.map(([a, b]) => (Math.exp((Math.log(f(a, 1) / f(a, 2)) - Math.log(f(b, 1) / f(b, 2))) / 2) - 1) * 100), diff = f => pairs.map(([a, b]) => ((f(a, 1) - f(a, 2)) - (f(b, 1) - f(b, 2))) / 2);
    console.log('  動かす側 ÷ 動かさない側（同じ分け方の 2 本から。' + pairs.length + ' 組、% の差 ± 標準誤差、かっこ内は組ごと）：');
    console.log('    いた場所の水 ' + pm(ratio((r, j) => r.water[j]), 1) + ' ｜ 収入（体表＋口）／個体・秒 ' + pm(ratio((r, j) => r.income[j]), 1) + ' ｜ 自力移動の速さ ' + pm(ratio((r, j) => r.speed[j]), 1));
    console.log('    出生／個体・1000 秒 ' + pm(ratio((r, j) => r.birth[j]), 1) + ' ｜ 死 ' + pm(ratio((r, j) => r.death[j]), 1));
    if (R[0].inherit && R[0].kept) { const n = R[0].kept.length, at = (r, i, j, q) => r.kept[Math.min(i, r.kept.length - 1)][j - 1][q], line = (j2, q) => Array.from({ length: n }, (_, i) => mean(R.map(r => at(r, i, j2(r), q))).toFixed(2)).filter((_, i) => i % 2 === 0 || i === n - 1).join(' ');
      console.log('  回路は最初に入れるだけ（遺伝子として受け継がれ、変異と交配で変わる）。回路が半分以上残っている個体の割合（100 秒ごと）：始めに動かす回路をもらった系統 ' + line(r => r.side, 0) + ' ｜ もらわなかった系統（交配で入ってくる分）' + line(r => 3 - r.side, 0));
      console.log('    回路の強さの平均（設計どおり = 1）：もらった系統 ' + line(r => r.side, 1) + ' ｜ もらわなかった系統 ' + line(r => 3 - r.side, 1)); }
    console.log('  増える速さの差（出生 − 死、個体・1000 秒あたり。動かす側 − 動かさない側）：' + pm(diff((r, j) => r.birth[j] - r.death[j]), 2) + ' ｜ 終わりの割合の差（動かす側が半分 2 のとき − 半分 1 のとき、を半分にして符号をそろえたもの＝動かす側の得）：' + pm(pairs.map(([a, b]) => (a.shareEnd - b.shareEnd) / 2), 3));
  }
  process.exit(0);
}
const [secs, file, design, , kArg, sideArg, setArg] = process.argv.slice(2), T = Number(secs), k = Number(kArg), G = A.genome, side = sideArg === 'other' ? 2 : 1;
if (!(design in NAMES)) { console.error('unknown design: ' + design); process.exit(1); }
const w = A.engine.World.restore(JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)));
let inherit = 0;
if (setArg) { const on = {}; for (const kv of setArg.split(',')) { const [key, v] = kv.split('='); if (key === 'inherit') inherit = Number(v); else on[key] = Number(v); } w.enable(on); if (on.flow != null) w.flow = on.flow; /* (flow: the strength of the current, which is not a rule the world switches by itself. flow=0: the water stands still) */ }
if (w.nest) { console.error('the idle side needs a world without the nest rule'); process.exit(1); }
w.rand = G.rng(7000 + k); const mr = G.rng(9100 + k);
// what is usual in this world, so that the signal of the level designs swings about zero: the median over the bodies, now
const med = l => { const s = l.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; }, clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const taste0 = med(w.bodies.map(o => (w.nutAt(o.cx, o.cy, w.nut) / w.nutrientCap - 0.5) * 2)), smell0 = w.scent ? med(w.bodies.map(o => { const a = w.nutAt(o.cx, o.cy, w.scA), b = w.nutAt(o.cx, o.cy, w.scB); return 2 * a / (a + 0.1) - 1 + 2 * b / (b + 0.1) - 1; })) : 0;
const ZERO = ['nC', 'nP', 'nK', 'nH', 'nB', 'mCil', 'mTurn', 'mJoint', 'adapt', 'sA', 'sB', 'vE', 'sT', 'sW', 'mBite', 'hE', 'mVoice', 'mSec', 'nLife'];
// the design on one part; driven: the signal moves the cilia. idle: the same strength goes to the gland (mSec), which does nothing here
function wire(p, driven) {
  for (const key of ZERO) if (p[key]) p[key] = 0; p.nn = []; p.leak = 1; if (!(p.nerve >= 0.5)) p.nerve = 0.5; let out = 0, turn = 0;
  if (design === 'dwell' || design === 'chase') { p.nC = 3; p.nB = clamp(-3 * taste0, -2, 2); out = design === 'dwell' ? -1 : 1; }
  else if (design === 'turn') { p.adapt = 1; p.nC = -2; p.nB = -1; turn = 0.75; }
  else if (design === 'crowd') { p.sA = 1.5; p.sB = 1.5; p.nB = clamp(-1.5 * smell0, -2, 2); out = 1; }
  else if (design === 'flee') { p.sT = 4; out = 1; }
  else if (design === 'hurt') { p.sW = 4; out = 1; }
  if (turn) { p.nn = [{ b: 1, k: 1, in: [], out: driven ? [['T', turn]] : [] }]; if (driven) p.mTurn = turn; else p.mSec = 2 * turn; } // (a neuron that is always at tanh(1) cancels the signal's resting value tanh(-1): the turn is 0 while the water is steady, about 0.57 when it gets poorer at half the sense's full swing)
  else if (driven) p.mCil = out; else p.mSec = Math.abs(out);
}
const ciliated = p => (p.cilia || 0) > 0.05 && p.beat !== 0;
// both sides must pay the same for their wiring: checked on a copy of one part, after the same tidying the genome gets
const wiringPart = (() => { const o = w.bodies.find(o => o.g.parts.some(ciliated)); if (!o) return [0, 0]; return [true, false].map(d => { const g = JSON.parse(JSON.stringify(o.g)); for (const p of g.parts) if (ciliated(p)) wire(p, d); G.sanitize(g); return +A.neural.wiring(g.parts.find(ciliated)).toFixed(6); }); })();
if (Math.abs(wiringPart[0] - wiringPart[1]) > 1e-6) { console.error('the two sides do not pay the same for their wiring: ' + wiringPart.join(' against ')); process.exit(1); }
const give = (g, driven) => { let any = false; for (const p of g.parts) if (ciliated(p)) { wire(p, driven); any = true; } if (any) G.sanitize(g); return any; };
// how much of the driven circuit a genome carries: on its ciliated parts, the strongest (sense connection x drive of the cilia) against the design's, with the nerve
// tissue and the kind of reading it needs. 1 = as designed, 0 = none, negative = the opposite. (Not defined for the turn design, which also needs a neuron.)
const IN = { dwell: ['nC', -1, 3], chase: ['nC', 1, 3], flee: ['sT', 1, 4], hurt: ['sW', 1, 4], crowd: ['sA', 1, 1.5] }[design];
const kept = g => { if (!IN) return null; let best = null; for (const p of g.parts) { if (!ciliated(p)) continue; const v = (p[IN[0]] || 0) * (p.mCil || 0) * IN[1] / IN[2] * Math.min(1, 2 * (p.nerve || 0)) * (design === 'dwell' || design === 'chase' || design === 'crowd' ? 1 - (p.adapt || 0) : 1); if (best == null || v > best) best = v; } return best == null ? 0 : best; };
const keptNow = () => { const o = [0, [0, 0, 0], [0, 0, 0]]; for (const b of w.bodies) { if (!b.tag) continue; const v = kept(b.g); o[b.tag][0]++; o[b.tag][1] += v; if (v >= 0.5) o[b.tag][2]++; } return [1, 2].map(j => (o[j][0] ? [+(o[j][2] / o[j][0]).toFixed(3), +(o[j][1] / o[j][0]).toFixed(3)] : [0, 0])); };
let given = 0; const bodies0 = w.bodies.length;
for (const o of w.bodies) { const tag = mr() < 0.5 ? 1 : 2; if (!give(o.g, tag === side)) continue; o.tag = tag; given++; o.nextCost = null; const root = o.b.segs[0]; w.form(o, o.cx, o.cy, Math.atan2(root.dy, root.dx)); }
const births = [0, 0, 0]; { const spawn0 = w.spawn.bind(w); w.spawn = function (g, x, y, stage, parent) { const tag = parent && parent.tag; if (tag && !inherit) give(g, tag === side); const o = spawn0(g, x, y, stage, parent); if (tag) { o.tag = tag; births[tag]++; } return o; }; }
const count = tag => { let n = 0; for (const o of w.bodies) if (o.tag === tag) n++; return n; }, share = () => { const a = count(1), b = count(2); return a + b ? a / (a + b) : 0; };
const was = [0, count(1), count(2)], share0 = share(), series = [], Z = () => [0, 0, 0], water = Z(), life = Z(), inc = Z(), dist = Z(), cdS = Z(), cdQ = Z(), cdN = Z(), ctS = Z(), sdS = Z(), sdN = Z();
const keptSeries = IN ? [keptNow()] : null; // (every 50 s: for half 1 and half 2, the share of bodies with at least half of the circuit, and the mean)
const wiringOf = tag => { const l = w.bodies.filter(o => o.tag === tag); return l.length ? l.reduce((a, o) => a + o.prof.wiring, 0) / l.length : 0; }, wiring0 = [0, wiringOf(1), wiringOf(2)];
for (let i = 0; i < 30 * T && w.bodies.length; i++) {
  w.step();
  if (i % 30 === 29) for (const o of w.bodies) { const j = o.tag; if (!j) continue; water[j] += w.nutAt(o.cx, o.cy, w.nut); life[j]++;
    const got = (o.absorbed || 0) + (o.eaten || 0); if (o._got != null) { inc[j] += got - o._got; dist[j] += o.path - o._path; } o._got = got; o._path = o.path;
    let c = 0, t = 0, n = 0; for (const q of o.b.segs) if (q.cil) { c += q.cd; t += q.ct < 0 ? -q.ct : q.ct; n++; } if (n) { c /= n; cdS[j] += c; cdQ[j] += c * c; ctS[j] += t / n; cdN[j]++; o._c1 = (o._c1 || 0) + c; o._c2 = (o._c2 || 0) + c * c; o._cn = (o._cn || 0) + 1; } }
  if (i % 1500 === 1499) { series.push(+share().toFixed(3)); if (keptSeries) keptSeries.push(keptNow()); }
}
for (const o of w.bodies) if (o.tag && o._cn > 5) { const m = o._c1 / o._cn; sdS[o.tag] += Math.sqrt(Math.max(0, o._c2 / o._cn - m * m)); sdN[o.tag]++; } // how much one body's cilia drive varied over its own time
const now = [0, count(1), count(2)], per = (a, j) => a[j] / Math.max(1, life[j]), rate = (n, j) => n / Math.max(1, life[j]) * 1000, two = f => [0, f(1), f(2)];
console.log(JSON.stringify({ design, world: file.split('/').pop().replace(/\.json(\.gz)?$/, ''), set: setArg || '', T, k, side, inherit, kept: keptSeries, t: Math.round(w.t), bodies0, given, bodies: w.bodies.length, taste0: +taste0.toFixed(3), smell0: +smell0.toFixed(3), wiringPart, wiring0, share0, shareEnd: share(), series,
  water: two(j => per(water, j)), income: two(j => per(inc, j)), speed: two(j => per(dist, j)), cd: two(j => cdS[j] / Math.max(1, cdN[j])), ct: two(j => ctS[j] / Math.max(1, cdN[j])), cdSd: two(j => sdS[j] / Math.max(1, sdN[j])),
  birth: two(j => rate(births[j], j)), death: two(j => rate(was[j] + births[j] - now[j], j)), bodySeconds: life.slice() }));
