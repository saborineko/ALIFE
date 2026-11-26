// Compare sets of islands (tools/alife2-islands.js), for example with and without exchange of bodies.
// For every island: population, generations, share of bodies with several segments, how many kinds of body plan are alive, lasting novelties that
// arose there (plans brought in by arrivals are left out), kinds never seen there before, and the share of living bodies descended from arrivals.
// For every set: the kinds alive over all its islands together, and how far apart the islands are.
// Usage: node tools/alife2-islands-report.js <prefix> [<prefix> ...]   (reads <prefix>-<i>-t*.json.gz, the latest of each island)
const fs = require('fs'), zlib = require('zlib'), path = require('path'), M = 20, G = 5;
const rg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) + ' [' + Math.min(...a).toFixed(2) + '〜' + Math.max(...a).toFixed(2) + ']';
for (const prefix of process.argv.slice(2)) {
  const dir = path.dirname(prefix), base = path.basename(prefix), files = fs.readdirSync(dir).filter(f => f.startsWith(base + '-') && /-t\d+\.json\.gz$/.test(f)), latest = {};
  for (const f of files) { const m = f.slice(base.length + 1).match(/^(\d+)-t(\d+)/); if (m && (!latest[m[1]] || Number(m[2]) > latest[m[1]].t)) latest[m[1]] = { t: Number(m[2]), f }; }
  const rows = [], union = new Set();
  for (const i of Object.keys(latest).sort((a, b) => a - b)) {
    const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, latest[i].f)))), nodes = new Map(d.tree.map(n => [n.id, n])), cl = d.clades || [];
    // a line founded by an arrival: its founder's record says where it came from (lines are numbered by their founder)
    const fromAway = new Set(d.tree.filter(n => n.from).map(n => n.id)), alive = d.bodies.map(b => nodes.get(b.id)), kinds = new Set(alive.map(n => n.kind)); for (const k of kinds) union.add(k);
    const own = cl.filter(c => !(c.arrived || (c.from === 0 && c.born > 0))), lasting = own.filter(c => c.members >= M && (c.genMax - c.gen0) >= G).sort((a, b) => a.born - b.born), seen = new Set(); let firsts = 0, late = 0;
    for (const c of lasting) { if (!seen.has(c.kind)) { seen.add(c.kind); firsts++; } if (c.born >= d.t / 2) late++; }
    const segs = alive.map(n => Number(n.kind.split('/')[0])), multi = segs.filter(x => x > 1).length / Math.max(1, segs.length), gen = alive.reduce((a, n) => a + n.gen, 0) / Math.max(1, alive.length);
    rows.push({ i, t: Math.round(d.t), n: d.bodies.length, gen, multi, kinds: kinds.size, lasting: lasting.length, late, firsts, away: alive.filter(n => fromAway.has(n.line)).length / Math.max(1, alive.length), arrived: d.counts.arrived || 0, left: d.counts.left || 0 });
  }
  console.log('== ' + prefix + '（' + rows.length + ' 島）');
  for (const r of rows) console.log('  島 ' + r.i + '：' + r.t + ' 秒 / ' + r.n + ' 個体 / 平均世代 ' + r.gen.toFixed(1) + ' / 多体節 ' + (r.multi * 100).toFixed(0) + '% / 生きている体制 ' + r.kinds + ' 種類 / そこで生じて続いた新規性 ' + r.lasting + '（後半 ' + r.late + '）/ 初めての体制 ' + r.firsts + ' / 来た ' + r.arrived + '・出た ' + r.left + ' / 来た個体の子孫 ' + (r.away * 100).toFixed(1) + '%');
  const col = k => rows.map(r => r[k]);
  console.log('  まとめ：個体 ' + rg(col('n')) + ' / 多体節 ' + rg(col('multi')) + '（島間の開き ' + (Math.max(...col('multi')) - Math.min(...col('multi'))).toFixed(2) + '）/ 続いた新規性 ' + rg(col('lasting')) + ' / 初めての体制 ' + rg(col('firsts')) + ' / 生きている体制 ' + rg(col('kinds')) + ' / 全島を合わせた生きている体制 ' + union.size + ' 種類 / 来た個体の子孫 ' + rg(col('away')));
}
