// Does anything other than the world's own physics kill or damage bodies? Each operation that rebuilds, moves or reloads bodies is done to a saved evolved
// world, and what follows is set beside the same world left alone. It reads and copies; nothing is saved.
//   1. save, reload, go on: is it the same world, number for number?
//   2. every rule switched on or off in the running world: any body with a number that is not a number, any death "broken", any mass death in the next 2 s?
//   3. the world moved to another map and back; bodies sent to another island and taken in; a foreign body introduced
//   4. energy: with the ledger on, is every change in what the world holds accounted for (nothing made or lost by the bookkeeping)?
//   5. a long watch: any non-finite number anywhere (bodies, water, food), any death "broken", any birth blocked by the body limit
// Usage: node tools/alife2-safety-check.js <world.json.gz> [...]
const A = require('../alife2-genome.js'); for (const f of ['development', 'neural', 'physics', 'organs', 'rules', 'engine']) require('../alife2-' + f + '.js');
const zlib = require('zlib'), fs = require('fs'), crypto = require('crypto');
const print = w => crypto.createHash('sha256').update(JSON.stringify({ t: w.t, rng: w.rand.state(), nut: Array.from(w.nut), food: w.food.filter(q => q.e > 0).map(q => [q.x, q.y, q.size, q.e]), counts: w.counts, bodies: w.bodies.map(o => [o.id, o.cx, o.cy, o.E, o.G, o.egg, o.grow, o.stage, o.age, o.prof.V, o.prof.basal, o.hp ? Array.from(o.hp) : 0, Array.from(o.b.x), Array.from(o.b.vx), o.b.segs.map(q => [q.a, q.cd, q.ct, q.m, q.na ? Array.from(q.na) : 0, q.nw ? Array.from(q.nw) : 0])]) })).digest('hex').slice(0, 12);
const bad = w => { let n = 0; for (const o of w.bodies) { if (![o.E, o.G, o.egg, o.grow, o.cx, o.cy, o.prof.basal, o.prof.V].every(Number.isFinite) || !A.physics.finite(o.b) || o.b.segs.some(s => !Number.isFinite(s.a) || !Number.isFinite(s.cd) || (s.na && s.na.some(v => !Number.isFinite(v))))) n++; } return n; };
const badField = w => { let n = 0; for (let i = 0; i < w.nut.length; i++) if (!Number.isFinite(w.nut[i]) || w.nut[i] < -1e-9) n++; for (const f of w.food) if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.e)) n++; return n; };
const deaths = w => (w.counts.starved || 0) + (w.counts.aged || 0) + (w.counts.killed || 0) + (w.counts.broken || 0);
for (const file of process.argv.slice(2)) { const text = zlib.gunzipSync(fs.readFileSync(file)), load = () => A.engine.World.restore(JSON.parse(text)), name = file.split('/').pop().replace('.json.gz', ''); let trouble = 0; const say = (ok, s) => { if (!ok) trouble++; console.log((ok ? '  ok    ' : '  TROUBLE ') + s); };
  console.log('== ' + name);
  // 1. save, reload, go on
  { const a = load(), b0 = load(); for (let i = 0; i < 150; i++) { a.step(); b0.step(); } const b = A.engine.World.restore(JSON.parse(JSON.stringify(b0.save()))); for (let i = 0; i < 150; i++) { a.step(); b.step(); }
    say(print(a) === print(b), '1. 保存して読み直して続けた世界は、続けただけの世界と' + (print(a) === print(b) ? '完全に同じ' : '違う（身体 ' + a.bodies.length + ' 対 ' + b.bodies.length + '）')); }
  // the same world left alone for 2 s: how many die
  const base = load(), d0 = deaths(base); for (let i = 0; i < 60; i++) base.step(); const usual = deaths(base) - d0, n0 = load().bodies.length;
  // 2. every rule, on or off
  { const rows = []; for (const r of A.rules.catalog) { const w = load(), was = w[r.key], to = was ? 0 : r.on; let err = null, dd = 0; try { const d1 = deaths(w); w.enable({ [r.key]: to }); for (let i = 0; i < 60; i++) w.step(); dd = deaths(w) - d1; } catch (e) { err = String(e.message).slice(0, 60); }
      const nb = err ? 0 : bad(w) + badField(w), br = err ? 0 : (w.counts.broken || 0) - (base.counts.broken || 0), mass = dd > Math.max(3 * usual + 10, 0.05 * n0);
      if (err || nb || br || mass) rows.push(r.label + (to ? ' を入れる' : ' を切る') + '：' + (err ? '例外 ' + err : '数でない値を持つ身体・格子 ' + nb + '・broken ' + br + '・2 秒の死 ' + dd + '（そのままなら ' + usual + '）')); }
    say(!rows.length, '2. 規則 ' + A.rules.catalog.length + ' 個を 1 つずつ切り替えて 2 秒：' + (rows.length ? rows.join(' ｜ ') : '数でない値・broken・大量死なし（そのままの世界の 2 秒の死 ' + usual + '、' + n0 + ' 匹中）')); }
  // 3. another map and back; another island; a foreign body
  { let msg = []; try { const w = load(), there = A.engine.World.transplant(w, w.map ? '' : 'coast'); const d1 = deaths(there); for (let i = 0; i < 60; i++) there.step(); const back = A.engine.World.transplant(there, w.map || ''); for (let i = 0; i < 60; i++) back.step();
      msg.push('地図を移して戻す：' + n0 + ' → ' + there.bodies.length + ' → ' + back.bodies.length + ' 匹、数でない値 ' + (bad(there) + bad(back) + badField(there) + badField(back)) + '、broken ' + ((there.counts.broken || 0) + (back.counts.broken || 0) - 2 * (w.counts.broken || 0)) + '、移した先の 2 秒の死 ' + (deaths(there) - d1)); if (bad(there) + bad(back) + badField(back)) trouble++; } catch (e) { msg.push('地図の移し替えで例外 ' + String(e.message).slice(0, 80)); trouble++; }
    try { const a = load(), b = load(); b.rand = A.genome.rng(4242); const out = a.emigrate(20), got = b.immigrate(out, 1); for (let i = 0; i < 60; i++) { a.step(); b.step(); } const alive = (got || []).filter(o => !o.dead).length;
      msg.push('島の移動：20 匹を出して別の世界に入れる → 出した ' + out.length + '、入れた ' + (got ? got.length : '?') + '、2 秒後に生きている ' + alive + '、数でない値 ' + (bad(a) + bad(b)) + '、broken ' + ((b.counts.broken || 0) - (a.counts.broken || 0))); if (bad(a) + bad(b)) trouble++; } catch (e) { msg.push('島の移動で例外 ' + String(e.message).slice(0, 80)); trouble++; }
    try { const w = load(), g = JSON.parse(JSON.stringify(w.bodies[0].g)); for (const p of g.parts) { delete p.sT; delete p.mBite; delete p.hE; } const r = w.introduce(g, { count: 5 }); for (let i = 0; i < 60; i++) w.step();
      msg.push('遺伝子の欠けた外来個体 5 匹を投入：数でない値 ' + (bad(w) + badField(w))); if (bad(w)) trouble++; } catch (e) { msg.push('投入：' + String(e.message).slice(0, 80)); }
    say(true, '3. ' + msg.join(' ｜ ')); }
  // 4. energy: as the world was saved, and with the newest rules switched on as well
  for (const [label, extra] of [['保存されたままの規則', null], ['加えて、卵を産む距離・回路を作る時期・相手のある結合だけを作る', { cast: 1, wireLate: 1, wireEnds: 1 }]]) { const d = JSON.parse(text); d.opt.audit = 1; const w = A.engine.World.restore(d); if (extra) w.enable(extra); for (const k in w.ledger) w.ledger[k] = 0; const s0 = w.stored(); for (let i = 0; i < 1800; i++) w.step();
    const L = w.ledger, IN = ['rain', 'regrow', 'placed', 'mutation', 'recycled', 'arrived'], inflow = IN.reduce((x, k) => x + (L[k] || 0), 0), out = Object.keys(L).filter(k => !IN.includes(k)).reduce((x, k) => x + L[k], 0), gap = Math.abs((w.stored() - s0) - (inflow - out));
    say(gap < 1e-6 * Math.max(1, inflow) && Object.values(L).every(Number.isFinite), '4. エネルギーの帳尻（60 秒、' + label + '。流入 ' + inflow.toFixed(1) + '）：説明のつかない差 ' + gap.toExponential(2) + (gap < 1e-6 * inflow ? '' : '｜帳簿 ' + JSON.stringify(Object.fromEntries(Object.entries(L).map(([k, v]) => [k, +v.toFixed(3)]))))); }
  // 5. a long watch
  { const w = load(), c0 = Object.assign({}, w.counts); let worstB = 0, worstF = 0; for (let i = 0; i < 3000; i++) { w.step(); if (i % 10 === 0) { worstB = Math.max(worstB, bad(w)); worstF = Math.max(worstF, badField(w)); } }
    const br = (w.counts.broken || 0) - (c0.broken || 0), bl = (w.counts.blocked || 0) - (c0.blocked || 0), st = (w.counts.stillborn || 0) - (c0.stillborn || 0);
    say(!worstB && !worstF && !br && !bl, '5. 100 秒の見張り：数でない値を持つ身体 ' + worstB + '・格子や粒 ' + worstF + '・broken ' + br + '・上限で阻まれた出生 ' + bl + '・死産 ' + st + '（出生 ' + (w.counts.births - c0.births) + '、死 ' + (deaths(w) - deaths({ counts: c0 })) + '）'); }
  console.log(trouble ? '  → 問題 ' + trouble + ' 件' : '  → 問題なし'); }
