// Does an evolved world reward a designed ability? Artificial bodies are put into a saved, evolved world, and their descendants are counted.
// Compared: a body with an eye on each side that compares the two and turns towards what it sees (the wiring of tools/alife2-nerve2-assay.js that
// took 3.7 times the food of its cut-sight control in an empty tank), and the same body without any neuron.
// Each run is a branch of the same saved world: the same bodies, food and water, other random numbers from the moment of introduction.
// Usage: node tools/alife2-introduce.js <world.json.gz> <seconds> run <kind: wired|plain|none> <k>     (prints one line)
//        node tools/alife2-introduce.js report <lines.txt>
const A = require('../alife2-genome.js'), fs = require('fs'), zlib = require('zlib');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const G = A.genome, RAD = Math.PI / 180, args = process.argv.slice(2);
if (args[0] === 'report') {
  const rows = fs.readFileSync(args[1], 'utf8').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)), rg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) + ' [' + Math.min(...a) + '〜' + Math.max(...a) + ']';
  for (const kind of [...new Set(rows.map(r => r.kind))]) { const R = rows.filter(r => r.kind === kind); console.log('== ' + ({ wired: '配線あり（左右の眼を比べる）', plain: '配線なし（同じ身体）', none: '何も入れない' }[kind] || kind) + '：' + R.length + ' 分岐');
    console.log('  時刻ごとの生存子孫（各分岐）：' + R[0].series.map((_, i) => R[0].series[i][0] + '秒:' + R.map(r => r.series[i][1]).join('/')).join('  '));
    console.log('  生まれた子孫の総数 ' + rg(R.map(r => r.born)) + ' / 終了時の生存 ' + rg(R.map(r => r.alive)) + ' / 終了時の全個体に占める割合 ' + rg(R.map(r => +(100 * r.alive / Math.max(1, r.n)).toFixed(1))) + '% / 最大世代 ' + rg(R.map(r => r.genMax)) + ' / 絶滅した分岐 ' + R.filter(r => r.alive === 0).length + ' / 住民の個体数 ' + rg(R.map(r => r.n - r.alive))); }
} else {
  const [file, secs, , kind, k] = args, T = Number(secs) || 1500, N = 30;
  const two = nn => { const g = G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3, beat: -1, nerve: 0.5, mouth: 0.6, gut: 0.5, gonad: 0.3 }), G.part({ len: 0.5, r0: 0.25, r1: 0.2, cilia: 0.6, beat: -1, nerve: 0.5, eye: 0.5, tune: 50 * RAD })], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 })] }); if (nn) g.parts[1].nn = nn; g.hue = 300; return G.ensureIds(g); };
  const w = A.engine.World.restore(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))); w.rand = G.rng(9000 + Number(k)); const lines = new Set(), t0 = w.t;
  if (kind !== 'none') for (let i = 0; i < N; i++) { const o = w.spawn(two(kind === 'wired' ? [{ b: 0, k: 1, in: [['v', 3], ['m0', -2]], out: [['C', -1]] }] : null), w.rand() * w.W, 4 + w.rand() * (w.H - 8), 1, null); lines.add(o.line); }
  const series = [], seen = new Map(); let next = t0 + 100; // (the genealogy forgets lines that died out, so every body of the introduced lines is noted here as it is seen)
  while (w.t < t0 + T) { w.step(); if (w.tick % 15 === 0) for (const o of w.bodies) if (lines.has(o.line) && !seen.has(o.id)) seen.set(o.id, o.gen); if (w.t >= next) { next += 100; series.push([Math.round(w.t - t0), w.bodies.filter(o => lines.has(o.line)).length]); } }
  const alive = w.bodies.filter(o => lines.has(o.line));
  console.log(JSON.stringify({ kind, k: Number(k), n: w.bodies.length, alive: alive.length, born: seen.size - lines.size, genMax: [...seen.values()].reduce((a, n) => Math.max(a, n), 0), wiredAlive: alive.filter(o => o.g.parts.some(p => p.nn)).length, series }));
}
