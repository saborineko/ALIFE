// Every body of a saved world is taken as a founder, and the world is run on: how many bodies descend from each founder (through mothers) at the end?
// Nothing is changed in the world; the founder's number is handed from mother to child outside the genome. Run from the same saved world with
// several random numbers, it tells how much of a line's success was already decided at the start (the same founders and the same body plans grow
// again) and how much is the draw of one run. It also gives the size of chance for any test that follows a marked half of that world
// (tools/alife2-cut-assay.js): the end share of a random half has the standard deviation printed here, with nothing cut at all.
// Usage: node tools/alife2-founders.js <seconds> <world.json(.gz)> run <k>     (one run: one JSON line, about 120 kB)
//        node tools/alife2-founders.js report <lines.txt>
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const SENSE = { taste: [['nC'], 'c'], scent: [['sA', 'sB'], 'AB'], touch: [['sT', 'sW'], 'tw'], eye: [['vE'], 'v'], ear: [['hE'], 'e'] };
if (process.argv[2] === 'report') {
  const runs = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)).sort((a, b) => a.k - b.k), N = runs[0].founders.length, K = runs.length, F = runs.map(r => r.founders);
  const corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; } return ab / Math.sqrt(aa * bb); };
  const pairs = []; for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) pairs.push([i, j]);
  console.log('始まりの世界：' + N + ' 匹。それぞれを始祖として ' + Math.round(runs[0].t - runs[0].t0) + ' 秒、乱数 ' + runs.map(r => r.k).join('・') + ' の ' + K + ' 本');
  for (const r of runs) { const f = r.founders, tot = f.reduce((a, x) => a + x.end, 0), s = f.map(x => x.end).sort((a, b) => b - a); let acc = 0, n50 = 0; for (const x of s) { if (acc >= tot / 2) break; acc += x; n50++; }
    console.log('  乱数 ' + r.k + '：終わりの個体数 ' + r.bodies + '、子孫を残した始祖 ' + f.filter(x => x.end).length + ' 匹（' + (f.filter(x => x.end).length / N * 100).toFixed(1) + '%）、終わりの世界の半分を占める始祖 ' + n50 + ' 匹、いちばん大きい家系 ' + s.slice(0, 5).join('・') + ' 匹'); }
  console.log('無作為に半分へ分けたとき、終わりの割合がどれだけ散るか（何も切らない。始祖の集まりごと、各 2 万通りの分け方）：');
  for (const [name, inSet] of [['全個体', () => 1], ['匂いを配線', x => x.scent], ['触覚か傷の感覚を配線', x => x.touch], ['味覚を配線', x => x.taste]]) {
    const out = runs.map(r => { const l = r.founders.filter(inSet), t = l.reduce((a, x) => a + x.end, 0), ne = 1 / l.reduce((a, x) => a + (x.end / t) ** 2, 0), rg = A.genome.rng(4242), ends = []; for (let i = 0; i < 20000; i++) { let a = 0; for (const x of l) if (rg() < 0.5) a += x.end; ends.push(a / t); }
      const m = ends.reduce((x, y) => x + y, 0) / ends.length; return { n: l.length, left: l.filter(x => x.end).length, ne, sd: Math.sqrt(ends.reduce((x, y) => x + (y - m) ** 2, 0) / ends.length), out: ends.filter(x => x < 0.38 || x > 0.62).length / ends.length }; });
    console.log('  ' + name + '（' + out[0].n + ' 匹）：子孫を残した ' + out.map(o => o.left).join('・') + ' 匹、実質の始祖の数 ' + out.map(o => o.ne.toFixed(1)).join('・') + '、終わりの割合の標準偏差 ' + out.map(o => o.sd.toFixed(3)).join('・') + '、0.38〜0.62 の外に出る確率 ' + out.map(o => o.out.toFixed(2)).join('・')); }
  if (K > 1) {
    console.log('別の乱数でも同じ始祖が残るか：子孫を残したかどうかの相関 ' + pairs.map(([i, j]) => corr(F[i].map(x => x.end ? 1 : 0), F[j].map(x => x.end ? 1 : 0)).toFixed(2)).join('・') + '、log(1 + 子孫の数) の相関 ' + pairs.map(([i, j]) => corr(F[i].map(x => Math.log(1 + x.end)), F[j].map(x => Math.log(1 + x.end))).toFixed(2)).join('・') +
      '。両方で残した始祖 ' + pairs.map(([i, j]) => { let a = 0, b = 0, ab = 0; for (let q = 0; q < N; q++) { const x = F[i][q].end > 0, y = F[j][q].end > 0; if (x) a++; if (y) b++; if (x && y) ab++; } return ab + ' 匹（偶然なら ' + (a * b / N).toFixed(1) + '）'; }).join('・'));
    const group = (title, key, min, order) => { const m = new Map(); F[0].forEach((x, q) => { const k = key(x); if (!m.has(k)) m.set(k, { n: 0, e: runs.map(() => 0) }); const c = m.get(k); c.n++; for (let r = 0; r < K; r++) c.e[r] += F[r][q].end; });
      let l = [...m.entries()].filter(e => e[1].n >= (min || 1)); l = order ? l.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])) : l.sort((a, b) => b[1].n - a[1].n); console.log(title);
      for (const [k, c] of l) console.log('  ' + String(k).padEnd(12) + ' 始祖 ' + String(c.n).padStart(4) + ' 匹 → 子孫 ' + c.e.map(x => String(x).padStart(4)).join(' ') + ' 匹（始祖 1 匹あたり ' + c.e.map(x => (x / c.n).toFixed(2)).join('・') + '）'); return l; };
    group('体制（始祖が 10 匹以上のもの）：', x => x.clade, 10);
    const all5 = (() => { const m = new Map(); F[0].forEach((x, q) => { if (!m.has(x.clade)) m.set(x.clade, { n: 0, e: runs.map(() => 0) }); const c = m.get(x.clade); c.n++; for (let r = 0; r < K; r++) c.e[r] += F[r][q].end; }); return [...m.values()].filter(c => c.n >= 5); })();
    console.log('  始祖が 5 匹以上の体制 ' + all5.length + ' 個で、増え方 log((1 + 子孫) ÷ 始祖) の乱数どうしの相関：' + pairs.map(([i, j]) => corr(all5.map(c => Math.log((1 + c.e[i]) / c.n)), all5.map(c => Math.log((1 + c.e[j]) / c.n))).toFixed(2)).join('・'));
    group('身体の部品の数：', x => Math.min(x.segs, 4) + (x.segs >= 4 ? ' 以上' : ''), 1);
    group('卵を産む距離の遺伝子：', x => x.cast < 1 ? '1 未満' : x.cast < 3 ? '1〜3' : x.cast < 6 ? '3〜6' : x.cast < 10 ? '6〜10' : '10 以上', 1, ['1 未満', '1〜3', '3〜6', '6〜10', '10 以上']);
    group('始まりの育ち具合：', x => x.stage >= 1 ? '成体' : x.stage >= 0.6 ? '6 割以上' : '6 割未満', 1, ['6 割未満', '6 割以上', '成体']);
    for (const [name, key] of [['匂いを配線', 'scent'], ['触覚か傷の感覚を配線', 'touch'], ['味覚を配線', 'taste'], ['耳を配線', 'ear'], ['眼を配線', 'eye'], ['神経細胞を持つ', 'neurons']]) group(name + '：', x => x[key] ? 'している' : 'していない', 1, ['している', 'していない']);
  }
  process.exit(0);
}
const [secs, file, , kArg] = process.argv.slice(2), T = Number(secs), k = Number(kArg);
const w = A.engine.World.restore(JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file))), t0 = Math.round(w.t);
w.rand = A.genome.rng(7000 + k);
const wired = (o, s) => { const [genes, letters] = SENSE[s]; return o.b.segs.some(q => q.p && (genes.some(g => Math.abs(q.p[g] || 0) > 0.2) || (q.p.nn && q.p.nn.some(n => n.in.some(e => letters.includes(e[0])))))) ? 1 : 0; };
const F = w.bodies.map((o, i) => { o.founder = i; return { i, clade: o.clade, kind: o.kind, age: +o.age.toFixed(1), stage: o.stage, gen: o.gen, speed: o.age > 5 ? +(o.path / o.age).toFixed(4) : null, cast: o.g.cast == null ? 0 : +o.g.cast.toFixed(2),
  segs: o.b.segs.length, taste: wired(o, 'taste'), scent: wired(o, 'scent'), touch: wired(o, 'touch'), eye: wired(o, 'eye'), ear: wired(o, 'ear'), neurons: o.b.segs.some(q => q.p && q.p.nn && q.p.nn.length) ? 1 : 0, births: 0, end: 0 }; });
{ const spawn0 = w.spawn.bind(w); w.spawn = function (g, x, y, stage, parent) { const o = spawn0(g, x, y, stage, parent); if (parent && parent.founder != null) { o.founder = parent.founder; F[o.founder].births++; } return o; }; }
for (let i = 0; i < 30 * T && w.bodies.length; i++) w.step();
let untraced = 0; for (const o of w.bodies) { if (o.founder == null) untraced++; else F[o.founder].end++; }
console.log(JSON.stringify({ k, t0, t: Math.round(w.t), bodies: w.bodies.length, untraced, founders: F }));
