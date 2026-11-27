// How much of an evolved body's nerve wiring can do anything? In saved evolved worlds, every connection strength a body pays upkeep for is sorted by
// what stands at its two ends in that body and that world. It reads; nothing is changed (each world is stepped 10 s first, then 60 s to watch the signals).
//   no partner : the sense, the effector or the neighbouring segment the connection speaks of does not exist there (an eye gene in a part with no eye,
//                a cilia gene on a segment without cilia, a sense the world does not have, a sense read through no nerve tissue, a child that is not there)
//   no way out : both ends exist, but the segment's signal reaches no effector, directly or through its neighbours
//   no way in  : a connection to an effector from a signal that nothing ever moves and that has no bias (it stays at 0)
//   steady     : a bias, or a connection to an effector from a signal that only a bias sets: it shifts what the body does, by a fixed amount
//   through    : from a sense (or hunger, or a driven neighbour) by way of the signal to an effector that exists
//   neurons    : the several-neuron circuits (not sorted further here)
// Usage: node tools/alife2-wiring-use.js <world.json.gz> [...]
const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const zlib = require('zlib'), fs = require('fs'), abs = Math.abs, pct = x => (Number.isFinite(x) ? (x * 100).toFixed(0) + '%' : '—');
const CLASSES = ['partner', 'out', 'in', 'steady', 'through', 'neurons'], JA = { partner: '相手が無い', out: '出口が無い', in: '入口が無い', steady: '一定の駆動', through: '感覚から効果器まで通っている', neurons: '複数神経の回路（未分類）' };
// one body: every strength it pays for, by class and by gene
function sort(w, o) {
  const segs = o.b.segs, n = segs.length, mouth = new Set(o.prof.mouths.map(m => m.seg)), info = [];
  // what stands at the ends of each segment's own connections; then which segments carry a circuit at all once the connections with nothing at their other end
  // are left out: by their own connections, or by listening to a neighbour that does (a neighbour all of whose connections lead nowhere never says anything)
  const OWN = ['nC', 'nH', 'nB', 'sA', 'sB', 'sT', 'sW', 'vE', 'hE', 'mCil', 'mTurn', 'mJoint', 'mBite', 'mVoice'], ends = segs.map((s, i) => { const p = s.p, gain = p.nerve > 0;
    return { nC: gain, nH: true, nB: true, sA: !!w.scent && gain, sB: !!w.scent && gain, sT: !!w.contact && gain, sW: !!w.contact && gain, vE: !!w.vision && p.eye > 0.1 && gain, hE: !!w.sound && (p.ear || 0) > 0.02 && gain,
      mCil: !!s.cil, mTurn: !!s.cil, mJoint: i > 0 && s.tauMax > 0 && p.range > 0, mBite: !!w.contact && mouth.has(i), mVoice: !!w.sound && (p.voice || 0) > 0.02 }; });
  const wired = segs.map((s, i) => s.circ && !s.gone && (!!(s.p.nn && s.p.nn.length) || OWN.some(k => ends[i][k] && s.p[k])));
  for (let ch = true, it = 0; ch && it <= n; it++) { ch = false; for (let i = 0; i < n; i++) { const s = segs[i], p = s.p; if (wired[i] || !s.circ || s.gone) continue; if ((p.nP && s.parent >= 0 && wired[s.parent]) || (p.nK && s.kids.some(c => wired[c]))) { wired[i] = true; ch = true; } } }
  for (let i = 0; i < n; i++) { const s = segs[i], p = s.p; if (!s.circ || s.gone) { info.push(null); continue; }
    const gain = p.nerve >= 0.5 ? 1 : p.nerve * 2, parent = s.parent >= 0 && wired[s.parent] ? s.parent : -1, kids = s.kids.filter(k => segs[k] && wired[k]);
    const src = { nC: ends[i].nC, nP: parent >= 0, nK: kids.length > 0, nH: true, sA: ends[i].sA, sB: ends[i].sB, sT: ends[i].sT, sW: ends[i].sW, vE: ends[i].vE, hE: ends[i].hE };
    const eff = { mCil: ends[i].mCil, mTurn: ends[i].mTurn, mJoint: ends[i].mJoint, mBite: ends[i].mBite, mVoice: ends[i].mVoice };
    // several neurons that read the signal and act on something here also carry it out
    const nnOut = !!(p.nn && p.nn.some(q => q.in.some(e => e[0][0] === 'a')) && p.nn.some(q => q.out.length));
    info.push({ i, s, p, parent, kids, src, eff, nnOut, direct: Object.keys(eff).some(k => eff[k] && p[k]) || nnOut, driven0: ['nC', 'nH', 'sA', 'sB', 'sT', 'sW', 'vE', 'hE'].some(k => src[k] && p[k]) }); }
  // a signal has a way out if it moves an effector itself, or a neighbour that has a way out listens to it; it is driven if a sense moves it, or a driven neighbour it listens to
  for (const q of info) if (q) { q.out = q.direct; q.driven = q.driven0; }
  for (let it = 0, ch = true; ch && it < 50; it++) { ch = false; for (const q of info) { if (!q) continue;
    if (!q.out && ((q.parent >= 0 && info[q.parent] && info[q.parent].out && info[q.parent].p.nK) || q.kids.some(k => info[k] && info[k].out && info[k].p.nP))) { q.out = true; ch = true; }
    if (!q.driven && ((q.parent >= 0 && q.p.nP && info[q.parent] && info[q.parent].driven) || (q.p.nK && q.kids.some(k => info[k] && info[k].driven)))) { q.driven = true; ch = true; } } }
  const T = {}, G = {}, add = (c, k, v) => { if (!v) return; T[c] = (T[c] || 0) + v; G[k] = G[k] || {}; G[k][c] = (G[k][c] || 0) + v; }, per = [];
  for (const q of info) { if (!q) { per.push(null); continue; } const p = q.p, own = {}; const put = (c, k, v) => { add(c, k, v); if (v) own[c] = (own[c] || 0) + v; };
    for (const k of ['nC', 'nP', 'nK', 'nH', 'sA', 'sB', 'sT', 'sW', 'vE', 'hE']) { const v = abs(p[k] || 0); put(!q.src[k] ? 'partner' : !q.out ? 'out' : k === 'nP' ? (info[q.parent] && (info[q.parent].driven || info[q.parent].p.nB) ? 'through' : 'in') : k === 'nK' ? (q.kids.some(c => info[c] && (info[c].driven || info[c].p.nB)) ? 'through' : 'in') : 'through', k, v); }
    put(!q.out ? 'out' : 'steady', 'nB', abs(p.nB || 0));
    for (const k of ['mCil', 'mTurn', 'mJoint', 'mBite', 'mVoice']) put(!q.eff[k] ? 'partner' : q.driven ? 'through' : p.nB ? 'steady' : 'in', k, abs(p[k] || 0));
    put(p.nn && p.nn.length ? 'neurons' : ['nC', 'sA', 'sB', 'vE', 'hE'].some(k => q.src[k] && p[k]) ? (q.out ? 'through' : 'out') : 'partner', 'adapt', abs(p.adapt || 0)); // how a sense reports: of use only where a sense is read and the signal goes somewhere
    if (p.nLife) { let v = A.neural.REW.gene * abs(p.nLife); if (p.nLife < 0) for (const k of A.neural.INPUTS) v -= A.neural.REW.share * abs(p[k] || 0); put('neurons', 'nLife', v); } // (rewire) what the ability costs, less the share of inputs that are not there at birth
    if (p.nn) for (const z of p.nn) { let v = 0.5 + abs(z.b); for (const e of z.in) v += abs(e[1]) + (e[2] ? 0.5 * abs(e[2]) : 0); for (const e of z.out) v += abs(e[1]); put('neurons', 'nn', v); }
    per.push(own); }
  // (brain) what reaching far costs on top: half a connection's strength per segment of distance, as the body pays it (see organs). Counted with the neurons.
  let far = 0; { const depth = new Float64Array(n); let sum = 0; for (let i = 1; i < n; i++) { depth[i] = segs[i].parent >= 0 ? depth[segs[i].parent] + 1 : 0; sum += depth[i]; } const mean = n ? sum / n : 0, C = A.organs.C;
    info.forEach((q, i) => { if (!q || !q.p.nn || !A.neural.far) return; const f = A.neural.far(q.p.nn); if (!f) return; const v = C.far * (f.r * depth[i] + f.d * (depth[i] + mean)); add('neurons', 'far', v); if (per[i]) per[i].neurons = (per[i].neurons || 0) + v; far += v; }); }
  return { T, G, per, check: Object.values(T).reduce((a, b) => a + b, 0), wiring: info.reduce((a, q) => a + (q ? A.neural.wiring(q.p) : 0), 0) + far };
}
// For other tools: watch the wired segments of these bodies while the world runs (call tick() after each step), then read, per body that lived through it
// unchanged: the strength it pays for by class, and whether its circuit moved what any effector is told (weight x signal) by more than 0.02.
function watch(w, bodies) {
  const st = new Map(); for (const o of bodies) st.set(o.id, { o, plan: o.plan, seg: o.b.segs.map(() => ({ n: 0, a: 0, a2: 0 })) }); let i = 0;
  return { tick() { if (i++ % 3) return; for (const r of st.values()) { const o = r.o; if (r.lost) continue; if (o.dead || o.plan !== r.plan) { r.lost = true; continue; } o.b.segs.forEach((s, j) => { const q = r.seg[j]; q.n++; q.a += s.a; q.a2 += s.a * s.a; }); } },
    result() { const out = []; for (const r of st.values()) { if (r.lost) continue; const o = r.o, R = sort(w, o), mouth = new Set(o.prof.mouths.map(m => m.seg)); let commands = false;
      o.b.segs.forEach((s, j) => { const q = r.seg[j]; if (!R.per[j] || q.n < 50) return; const p = s.p, m = q.a / q.n, sd = Math.sqrt(Math.max(0, q.a2 / q.n - m * m));
        const wOut = Math.max(s.cil ? abs(p.mCil || 0) : 0, s.cil ? abs(p.mTurn || 0) : 0, j > 0 && s.tauMax > 0 && p.range > 0 ? abs(p.mJoint || 0) : 0, w.contact && mouth.has(j) ? abs(p.mBite || 0) : 0, w.sound && s.voxV > 0 ? abs(p.mVoice || 0) : 0); if (wOut * sd > 0.02) commands = true; });
      out.push({ o, T: R.T, total: R.check, commands }); } return out; } };
}
module.exports = { sort, watch };
if (require.main === module) for (const file of process.argv.slice(2)) {
  const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))), name = file.split('/').pop().replace('-t3000.json.gz', ''); for (let i = 0; i < 300; i++) w.step();
  const tot = L => { const T = {}, G = {}; let sum = 0, chk = 0, wir = 0; for (const o of L) { const r = sort(w, o); chk += r.check; wir += r.wiring; for (const c in r.T) { T[c] = (T[c] || 0) + r.T[c]; sum += r.T[c]; } for (const k in r.G) { G[k] = G[k] || {}; for (const c in r.G[k]) G[k][c] = (G[k][c] || 0) + r.G[k][c]; } } return { T, G, sum, chk, wir, n: L.length }; };
  const adults = w.bodies.filter(o => o.stage >= 1), young = w.bodies.filter(o => o.stage < 1), Ad = tot(adults), Yo = tot(young);
  const line = R => CLASSES.map(c => JA[c] + ' ' + pct((R.T[c] || 0) / R.sum)).join('・');
  console.log('== ' + name + '：成体 ' + Ad.n + ' 匹（配線の強さの合計 ' + (Ad.sum / Ad.n).toFixed(2) + '／匹。分類の合計 ÷ 費用の計算に使う合計 = ' + (Ad.chk / Ad.wir).toFixed(4) + '）：' + line(Ad));
  console.log('  育つ途中の身体 ' + Yo.n + ' 匹（' + (Yo.sum / Math.max(1, Yo.n)).toFixed(2) + '／匹）：' + line(Yo));
  const dead = R => ((R.T.partner || 0) + (R.T.out || 0) + (R.T.in || 0)) / R.sum;
  console.log('  何もできない結合（相手が無い＋出口が無い＋入口が無い）：成体 ' + pct(dead(Ad)) + '・育つ途中 ' + pct(dead(Yo)));
  console.log('  成体、遺伝子ごと（費用に占める割合：うち何もできない）：' + Object.entries(Ad.G).map(([k, m]) => [k, Object.values(m).reduce((a, b) => a + b, 0), (m.partner || 0) + (m.out || 0) + (m.in || 0)]).sort((a, b) => b[1] - a[1]).map(([k, v, d]) => k + ' ' + pct(v / Ad.sum) + '：' + pct(d / v)).join('・'));
  // do the signals move? adults that live through the next 60 s: each wired segment's signal, and what it tells its cilia
  const st = new Map(); for (const o of adults) st.set(o.id, { o, plan: o.plan, seg: o.b.segs.map(() => ({ n: 0, a: 0, a2: 0, c: 0, c2: 0 })) });
  for (let i = 0; i < 1800; i++) { w.step(); if (i % 3) continue; for (const r of st.values()) { const o = r.o; if (o.dead || o.plan !== r.plan) { r.lost = true; continue; } if (r.lost) continue; o.b.segs.forEach((s, j) => { const q = r.seg[j]; q.n++; q.a += s.a; q.a2 += s.a * s.a; q.c += s.cd; q.c2 += s.cd * s.cd; }); } }
  // an effector is told (weight x signal): the command moves as far as the signal moves, times the weight. "Moved": by more than 0.02 (cilia drive runs 0..2, mouth 0..1, voice 0..1, a joint's swing -1..1)
  let thr = 0, thrMove = 0, all = 0, allMove = 0, effMove = 0, nSeg = 0, nMove = 0, nEff = 0, bodies = 0, bodiesMove = 0, bodiesEff = 0, still = 0, sat = 0, silent = 0;
  const mouthOf = o => new Set(o.prof.mouths.map(m => m.seg));
  for (const r of st.values()) { if (r.lost) continue; const cls = sort(w, r.o).per, mouth = mouthOf(r.o); let any = false, anyE = false; bodies++;
    r.o.b.segs.forEach((s, j) => { const own = cls[j], q = r.seg[j]; if (!own || q.n < 100) return; const p = s.p, mean = q.a / q.n, sd = Math.sqrt(Math.max(0, q.a2 / q.n - mean * mean)), cost = Object.values(own).reduce((a, b) => a + b, 0);
      const wOut = Math.max(s.cil ? abs(p.mCil || 0) : 0, s.cil ? abs(p.mTurn || 0) : 0, j > 0 && s.tauMax > 0 && p.range > 0 ? abs(p.mJoint || 0) : 0, w.contact && mouth.has(j) ? abs(p.mBite || 0) : 0, w.sound && s.voxV > 0 ? abs(p.mVoice || 0) : 0);
      nSeg++; all += cost; thr += own.through || 0;
      if (sd > 0.02) { nMove++; allMove += cost; thrMove += own.through || 0; any = true; } else if (own.through) { still += own.through; if (abs(mean) > 0.9) sat += own.through; else if (abs(mean) < 0.1) silent += own.through; }
      if (wOut * sd > 0.02) { nEff++; effMove += cost; anyE = true; } });
    if (any) bodiesMove++; if (anyE) bodiesEff++; }
  console.log('  信号は動いているか（60 秒を生き通した成体 ' + bodies + ' 匹、配線のある体節 ' + nSeg + ' 個。「動いた」＝標準偏差が 0.02 超）：信号が動いた体節 ' + pct(nMove / nSeg) + '（そういう体節を持つ個体 ' + pct(bodiesMove / bodies) + '）・配線の費用のうち、信号が動いた体節にあるもの ' + pct(allMove / all) + '・「通っている」結合の費用のうち、信号が動いた体節にあるもの ' + pct(thrMove / thr));
  console.log('  効果器への指示は動いているか（指示＝結合の強さ × 信号。その体節にある繊毛・関節・口・声のどれかへの指示が 0.02 を超えて動いた）：体節 ' + pct(nEff / nSeg) + '（そういう体節を持つ個体 ' + pct(bodiesEff / bodies) + '）・配線の費用のうち、そういう体節にあるもの ' + pct(effMove / all));
  console.log('  「通っている」のに信号が動かなかった結合（費用で）：信号が ±0.9 を超えて張り付いている ' + pct(sat / still) + '・0 の近く（±0.1 以内） ' + pct(silent / still) + '・その間で一定 ' + pct(1 - (sat + silent) / still));
  console.log('JSON ' + JSON.stringify({ name, adults: Ad.n, perAdult: Ad.sum / Ad.n, deadAdult: dead(Ad), deadYoung: dead(Yo), classesAdult: Object.fromEntries(CLASSES.map(c => [c, (Ad.T[c] || 0) / Ad.sum])), throughMoving: thrMove / thr, costMoving: allMove / all, costCommandMoving: effMove / all, bodiesMoving: bodiesMove / bodies, bodiesCommandMoving: bodiesEff / bodies }));
}
