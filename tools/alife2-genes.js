// What genomes carry, what bodies use of it, and what happened to the genes along a lineage.
// For a saved world: (1) the living population: parts carried / reachable / in the body, zones along axes, how far copies have diverged;
// (2) the ancestry of the commonest body: every generation in which the set of genes changed (duplication, split, loss, a dormant part
//     coming into use or going out of it, a change of which part follows which). Gene identities exist only in worlds with the newer rules.
// Usage: node tools/alife2-genes.js <world.json | world.json.gz> [out.json]
const fs = require('fs'), zlib = require('zlib'), A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [file, out] = process.argv.slice(2), G = A.genome, d = JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file));
const nodes = new Map(d.tree.map(n => [n.id, n])), maxSegs = (d.opt && d.opt.maxSegs) || 64;
const use = g => { const plan = A.development.develop(g, { maxSegs }), used = new Set(plan.segs.map(s => s.part)), live = G.reach(g); let zones = 0; for (const s of plan.segs) if (s.chain && s.parent >= 0 && plan.segs[s.parent].part !== s.part) zones++;
  let div = 0; for (const i of used) { const p = g.parts[i], q = p.src == null ? null : g.parts.find(x => x.id === p.src); if (q) div = Math.max(div, G.divergence(p, q)); }
  return { parts: g.parts.length, reach: live.size, used: used.size, usedSet: used, live, zones, div, segs: plan.segs.length }; };
const axis = g => { const li = G.axisOf(g, g.root); if (li < 0) return '軸なし'; return G.zones(g, li).map(z => '部品' + (g.parts[z.part].id != null ? '#' + g.parts[z.part].id : z.part) + '×' + z.len).join(' → '); };
const living = d.bodies.map(b => nodes.get(b.id)).filter(n => n && n.g), U = living.map(n => use(n.g)), m = f => U.reduce((a, u) => a + f(u), 0) / Math.max(1, U.length);
console.log('世界 t=' + Math.round(d.t) + ' / 生きている個体 ' + living.length + ' / 遺伝子の新しい規則 ' + (d.opt && d.opt.genome2 ? 'あり' : 'なし'));
console.log('部品：遺伝子にある数 ' + m(u => u.parts).toFixed(2) + '（最大 ' + Math.max(...U.map(u => u.parts)) + '） / 規則が届く数 ' + m(u => u.reach).toFixed(2) + ' / 身体に現れている種類 ' + m(u => u.used).toFixed(2) + '（最大 ' + Math.max(...U.map(u => u.used)) + '） / 休眠 ' + m(u => u.parts - u.reach).toFixed(2));
console.log('2 種類以上の部品でできた身体 ' + (m(u => u.used > 1 ? 1 : 0) * 100).toFixed(0) + '% / 軸に区分がある身体 ' + (m(u => u.zones > 0 ? 1 : 0) * 100).toFixed(0) + '% / 区分が元の部品から 5% 以上離れた身体 ' + (m(u => u.zones > 0 && u.div > 0.05 ? 1 : 0) * 100).toFixed(0) + '% / 上限（届く部品 ' + G.MAX_PARTS + '）に達している ' + (m(u => u.reach >= G.MAX_PARTS ? 1 : 0) * 100).toFixed(0) + '%' + (d.opt && d.opt.genome2 ? '' : ' / 旧規則の上限（遺伝子の部品 12）に達している ' + (m(u => u.parts >= 12 ? 1 : 0) * 100).toFixed(0) + '%'));
const byKind = new Map(); living.forEach((n, i) => { const k = axis(n.g) + ' ｜体節 ' + U[i].segs; byKind.set(k, (byKind.get(k) || 0) + 1); });
console.log('根の軸の構成（多い順）：'); for (const [k, c] of [...byKind].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log('  ' + c + ' 匹：' + k);
// ancestry of the commonest kind of body
const kinds = new Map(); for (const n of living) kinds.set(n.kind, (kinds.get(n.kind) || 0) + 1); const top = [...kinds].sort((a, b) => b[1] - a[1])[0];
const rep = top ? living.find(n => n.kind === top[0]) : null, line = []; for (let n = rep; n; n = nodes.get(n.parent)) if (n.g) line.push(n); line.reverse();
const idOf = (g, i) => (g.parts[i].id != null ? '#' + g.parts[i].id : '部品' + i), events = []; let prev = null;
for (const n of line) { const u = use(n.g), ev = [];
  if (prev) { const pg = prev.n.g, cg = n.g, hasIds = cg.parts.every(p => p.id != null) && pg.parts.every(p => p.id != null);
    if (hasIds) { const pid = new Map(pg.parts.map((p, i) => [p.id, i])), cid = new Map(cg.parts.map((p, i) => [p.id, i]));
      for (const [id, i] of cid) if (!pid.has(id)) ev.push((cg.parts[i].how === 'split' ? '分割：#' + cg.parts[i].src + ' の軸の後半が ' : '重複：#' + cg.parts[i].src + ' の複製 ') + '#' + id + (u.usedSet.has(i) ? '（身体に現れる）' : u.live.has(i) ? '' : '（休眠）'));
      for (const [id, i] of pid) if (!cid.has(id)) ev.push((prev.u.live.has(i) ? '喪失：' : '休眠していた部品の消滅：') + '#' + id);
      for (const [id, i] of cid) if (pid.has(id)) { const j = pid.get(id), was = prev.u.usedSet.has(j), now = u.usedSet.has(i); if (!was && now) ev.push((prev.u.live.has(j) ? '発現：' : '休眠からの再発現：') + '#' + id); if (was && !now) ev.push('身体から消える：#' + id + (u.live.has(i) ? '' : '（休眠へ）'));
        const nx = g2 => p => (G.nextOf(p) >= 0 && g2.parts[p.next] ? g2.parts[p.next].id : -1), a = nx(pg)(pg.parts[j]), b = nx(cg)(cg.parts[i]); if (a !== b && cg.parts[b === -1 ? i : cid.get(b)] && !(cg.parts[cid.get(b)] && !pid.has(b))) ev.push('軸で #' + id + ' の次に来る部品が変わる：' + (a < 0 ? 'なし' : '#' + a) + ' → ' + (b < 0 ? 'なし' : '#' + b)); }
    } else if (cg.parts.length !== pg.parts.length) ev.push('部品の数 ' + pg.parts.length + ' → ' + cg.parts.length + '（識別子なし）');
    if (u.used !== prev.u.used && !ev.length) ev.push('身体に現れる部品の種類 ' + prev.u.used + ' → ' + u.used);
  }
  if (ev.length) events.push({ gen: n.gen, t: Math.round(n.born), parts: u.parts, reach: u.reach, used: u.used, zones: u.zones, events: ev });
  prev = { n, u };
}
if (rep) { console.log('最も多い体制（' + top[0] + '、' + top[1] + ' 匹）の代表 #' + rep.id + ' の祖先 ' + line.length + ' 代で、遺伝子の構成が変わった世代：' + events.length);
  for (const e of events.slice(-40)) console.log('  世代 ' + e.gen + '（' + e.t + ' 秒）部品 ' + e.parts + '・届く ' + e.reach + '・身体に ' + e.used + '：' + e.events.join('、'));
  const sample = line.filter((_, i) => i % Math.max(1, Math.ceil(line.length / 12)) === 0).map(n => { const u = use(n.g); return n.gen + ':' + u.parts + '/' + u.reach + '/' + u.used; }); console.log('  推移（世代:遺伝子にある/届く/身体に現れる）：' + sample.join(' ')); }
if (out) fs.writeFileSync(out, JSON.stringify({ world: file, t: d.t, living: living.length, parts: m(u => u.parts), reach: m(u => u.reach), used: m(u => u.used), multiPart: m(u => u.used > 1 ? 1 : 0), zoned: m(u => u.zones > 0 ? 1 : 0), differed: m(u => u.zones > 0 && u.div > 0.05 ? 1 : 0), axes: [...byKind].sort((a, b) => b[1] - a[1]).slice(0, 20), lineage: events }, null, 1));
