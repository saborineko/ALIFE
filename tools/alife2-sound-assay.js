// Sound, checked with artificial bodies. Three questions:
//  A. Can a nerve circuit use where a sound comes from? One body sounds without pause; twelve listeners with an ear on each side start around it.
//     Compared: each side compares its ear with the other's and slows its own cilia when it wins; the same wired the other way; the same in a deaf world; no neuron.
//  B. Can it use pitch? A low voice and a high voice 40 units apart; listeners whose ears are tuned low, and listeners tuned high.
//  C. Does the record tell apart sound that is merely made, sound that goes with a state, sound that is answered, and a pitch that is copied?
//     A body with its own rhythm beside an answerer (which sounds only when it hears a rise); the same in a deaf world; two bodies each with its own rhythm;
//     a parrot (its pitch is pushed towards what it hears) and its opposite; twenty bodies that sound only when hungry, twenty that sound in rhythm.
// Usage: node tools/alife2-sound-assay.js [part: A|B|C|all] [world seeds...]
const A = require('../alife2-genome.js');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [part = 'all', ...seedArgs] = process.argv.slice(2), seeds = seedArgs.length ? seedArgs.map(Number) : [901, 902, 903, 904, 905, 906], G = A.genome;
const W = o => new A.engine.World(Object.assign({ founders: 0, cap: 0, sound: 1, nerve2: 1, blind: 1 }, o));
const one = (o, nn) => { const g = G.create({ parts: [G.part(Object.assign({ len: 0.6, r0: 0.3, r1: 0.3, nerve: 0.5, voice: 0.3, pitch: 0.5, bend: 0.4, store: 0.5 }, o))], links: [] }); g.parts[0].nn = nn; return g; };
const ALWAYS = [{ b: 0, k: 1, in: [['1', 3]], out: [['V', 1]] }], BEAT = [{ b: -1.5, k: 1, in: [['o', 3]], out: [['V', 1]] }], ANS = [{ b: -1, k: 1, in: [['e', 4]], out: [['V', 1]] }], HUNGRY = [{ b: -3, k: 1, in: [['h', 6]], out: [['V', 1]] }];
const twoEars = (nn, ear) => { const g = G.create({ parts: [G.part({ len: 1, r0: 0.5, r1: 0.4, cilia: 0.3, beat: -1, nerve: 0.5, mouth: 0.6, gut: 0.5 }), G.part(Object.assign({ len: 0.5, r0: 0.25, r1: 0.2, cilia: 0.6, beat: -1, nerve: 0.5, ear: 0.6, hTune: 0.5, hWide: 0.6 }, ear || {}))], links: [G.link({ from: 0, to: 1, sym: 'mirror', at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 })] }); if (nn) g.parts[1].nn = nn; return g; };
const CMP = sign => [{ b: 0, k: 1, in: [['e', 3], ['m0', -2]], out: [['C', sign]] }];
const parrot = sign => { const g = G.create({ parts: [G.part({ len: 0.6, r0: 0.3, r1: 0.3, nerve: 0.5, voice: 0.3, pitch: 0.5, bend: 0.4, store: 0.5 }), G.part({ len: 0.3, r0: 0.15, r1: 0.15, nerve: 0.5, ear: 0.6, hTune: 0.95, hWide: 0.2, adapt: 1 }), G.part({ len: 0.3, r0: 0.15, r1: 0.15, nerve: 0.5, ear: 0.6, hTune: 0.05, hWide: 0.2, adapt: 1 })], links: [G.link({ from: 0, to: 1, at: 0.3, off: 0.8, angle: 1.0, scale: 1, repeat: 1 }), G.link({ from: 0, to: 2, at: 0.7, off: 0.8, angle: -1.0, scale: 1, repeat: 1 })] });
  g.parts[1].nn = [{ b: 0, k: 1, in: [['e', 3]], out: [] }]; g.parts[2].nn = [{ b: 0, k: 1, in: [['1', 0]], out: [] }, { b: 0, k: 1, in: [['e', 3]], out: [] }];
  g.parts[0].nn = [{ b: -0.6, k: 1, in: [['k0', 6], ['k1', 6]], out: [['V', 1]] }, { b: 0, k: 1, in: [['k0', 8 * sign], ['k1', -8 * sign]], out: [['Q', 1]] }]; return g; };
const rg = (a, d) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(d) + ' [' + Math.min(...a).toFixed(d) + '〜' + Math.max(...a).toFixed(d) + ']';
const dist = (w, a, b) => { let dx = a.cx - b.cx; dx -= Math.round(dx / w.W) * w.W; return Math.hypot(dx, a.cy - b.cy); };
if (part === 'A' || part === 'all') {
  console.log('== A. 音の来る方向を使えるか：声を出し続ける個体 1 匹と、左右に耳を持つ聞き手 12 匹（約 17 離れた円周上から開始、90 秒、' + seeds.length + ' 世界）。最後の 30 秒の、声の主までの平均距離');
  for (const [name, nn, opt] of [['左右の耳を比べ、勝った側を弱める', CMP(-1), {}], ['同じ身体・すべての耳を切断（deaf）', CMP(-1), { deaf: 1 }], ['左右の耳を比べ、勝った側を強める（逆）', CMP(1), {}], ['神経なし', null, {}]]) {
    const R = seeds.map(seed => { const w = W(Object.assign({ seed }, opt)); for (let i = 0; i < 300; i++) w.step(); const s = w.spawn(one({ pitch: 0.3 }, ALWAYS), 80, 30, 1, null), L = []; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; L.push(w.spawn(twoEars(nn), 80 + Math.cos(a) * 20, 30 + Math.sin(a) * 14, 1, null)); }
      let d = 0, k = 0, near = 0, hd = 0; for (let i = 0; i < 2700; i++) { w.step(); s.E = s.prof.Emax; for (const o of L) o.E = o.prof.Emax * 0.8; if (i >= 1800 && i % 15 === 0) for (const o of L) { const x = dist(w, o, s); d += x; k++; if (x < 10) near++; hd += o.b.hd || 0; } } return { d: d / k, near: near / k, hd: hd / k }; });
    console.log('  ' + name.padEnd(20, '　') + ' 距離 ' + rg(R.map(r => r.d), 1) + ' / 10 以内にいた時間 ' + rg(R.map(r => r.near), 2) + ' / 聞こえが回路を押す強さ ' + rg(R.map(r => r.hd), 2)); }
}
if (part === 'B' || part === 'all') {
  console.log('== B. 音程を使えるか：低い声（音程 0.05）と高い声（0.95）の個体を 40 離して置き（どちらが左かは世界ごとに入れ替える）、その中間から聞き手 12 匹（90 秒、' + seeds.length + ' 世界）。最後の 30 秒の「耳を合わせていない声までの距離 − 合わせた声までの距離」（正なら、合わせた声の側にいる）');
  for (const [name, tune, deaf] of [['耳を低い音に合わせた聞き手', 0.05, 0], ['耳を高い音に合わせた聞き手', 0.95, 0], ['耳を切断（deaf）・低い音に合わせた身体', 0.05, 1]]) {
    const R = seeds.map((seed, n) => { const w = W(Object.assign({ seed }, deaf ? { deaf: 1 } : {})); for (let i = 0; i < 300; i++) w.step(); const xl = n % 2 ? 100 : 60, lo = w.spawn(one({ pitch: 0.05, voice: 0.5 }, ALWAYS), xl, 30, 1, null), hi = w.spawn(one({ pitch: 0.95, voice: 0.5 }, ALWAYS), 160 - xl, 30, 1, null), L = [], mine = tune < 0.5 ? lo : hi, other = tune < 0.5 ? hi : lo;
      for (let i = 0; i < 12; i++) L.push(w.spawn(twoEars(CMP(-1), { hTune: tune, hWide: 0.2 }), 80 + (i % 4 - 1.5) * 2, 22 + Math.floor(i / 4) * 8, 1, null));
      let d = 0, k = 0; for (let i = 0; i < 2700; i++) { w.step(); lo.E = lo.prof.Emax; hi.E = hi.prof.Emax; for (const o of L) o.E = o.prof.Emax * 0.8; if (i >= 1800 && i % 15 === 0) for (const o of L) { d += dist(w, o, other) - dist(w, o, mine); k++; } } return d / k; });
    console.log('  ' + name.padEnd(20, '　') + ' ' + rg(R, 1) + '（世界ごと：' + R.map(v => v.toFixed(0)).join(' ') + '）'); }
}
if (part === 'C' || part === 'all') {
  const S4 = seeds, pair = (ga, gb, opt, seed) => { const w = W(Object.assign({ seed }, opt)); for (let i = 0; i < 300; i++) w.step(); const r = G.rng(seed * 31 + 7), gap = 3 + 3 * r(), ang = r() * 6.283, x0 = 30 + 100 * r(), y0 = 12 + 30 * r(); ga.parts[0].freq *= 0.8 + 0.5 * r(); if (gb.parts[0].nn && gb.parts[0].nn[0].in[0][0] === 'o') gb.parts[0].freq *= 0.8 + 0.5 * r(); /* (each world: another place, another distance, other rhythms) */ const a = w.spawn(ga, x0, y0, 1, null), b = w.spawn(gb, x0 + Math.cos(ang) * gap, y0 + Math.sin(ang) * gap, 1, null); for (let i = 0; i < 1800; i++) { w.step(); a.E = a.prof.Emax; b.E = b.prof.Emax; } const c = w.census(); return { a: a.voN || 0, b: b.voN || 0, answer: c.answer, toward: c.pitchToward, pn: c.pitchN, bits: c.signalBits }; };
  console.log('== C. 記録は区別できるか（2 匹を 3〜6 離して置く。場所・距離・リズムの速さは世界ごとに違う。60 秒、' + S4.length + ' 世界）。応答＝他個体の鳴き始めの直後に鳴き始めた回数 ÷ 偶然なら起きる回数');
  for (const [name, ga, gb, opt] of [['リズムで鳴く個体＋聞こえたら鳴く個体', () => one({ pitch: 0.3, freq: 0.5 }, BEAT), () => one({ pitch: 0.7, ear: 0.6, hTune: 0.3, hWide: 0.25, adapt: 1 }, ANS), {}], ['同じ 2 匹・耳を切断（deaf）', () => one({ pitch: 0.3, freq: 0.5 }, BEAT), () => one({ pitch: 0.7, ear: 0.6, hTune: 0.3, hWide: 0.25, adapt: 1 }, ANS), { deaf: 1 }],
    ['各自のリズムで鳴く 2 匹', () => one({ pitch: 0.3, freq: 0.5 }, BEAT), () => one({ pitch: 0.7, freq: 0.62 }, BEAT), {}], ['低い声の個体＋鸚鵡返し', () => one({ pitch: 0.05, freq: 0.5 }, BEAT), () => parrot(1), {}], ['高い声の個体＋鸚鵡返し', () => one({ pitch: 0.95, freq: 0.5 }, BEAT), () => parrot(1), {}], ['低い声の個体＋逆に動かす個体', () => one({ pitch: 0.05, freq: 0.5 }, BEAT), () => parrot(-1), {}]]) {
    const R = S4.map(seed => pair(ga(), gb(), opt, seed)); console.log('  ' + name.padEnd(20, '　') + ' 鳴き始め ' + rg(R.map(r => r.a), 0) + ' と ' + rg(R.map(r => r.b), 0) + ' / 応答 ' + rg(R.map(r => r.answer), 2) + ' / 聞いた音程へ寄せた割合 ' + rg(R.map(r => r.toward), 2) + '（' + rg(R.map(r => r.pn), 0) + ' 回）'); }
  console.log('  鳴くことは、鳴く側の状態について何かを教えるか（20 匹、蓄えをばらばらにして開始、120 秒）：');
  for (const [name, nn] of [['空腹のときだけ鳴く', HUNGRY], ['リズムで鳴く', BEAT]]) { const R = S4.map(seed => { const w = W({ seed }); for (let i = 0; i < 300; i++) w.step(); const L = []; for (let i = 0; i < 20; i++) { const o = w.spawn(one({ voice: 0.15 }, nn), w.rand() * w.W, 6 + w.rand() * 40, 1, null); o.E = o.prof.Emax * (0.05 + 0.9 * w.rand()); L.push(o); } for (let i = 0; i < 3600; i++) w.step(); const c = w.census(); return { bits: c.signalBits, of: c.signalOf, time: c.callTime, cost: L.reduce((a, o) => a + (o.voE || 0), 0) / 20 / 120, alive: L.filter(o => !o.dead).length }; });
    console.log('  ' + name.padEnd(12, '　') + ' ' + rg(R.map(r => r.bits), 3) + ' ビット（状態：' + [...new Set(R.map(r => r.of || '—'))].join('・') + '）/ 鳴いていた時間の割合 ' + rg(R.map(r => r.time), 2) + ' / 声に使ったエネルギー 毎秒 ' + rg(R.map(r => r.cost), 4) + ' / 生存 ' + rg(R.map(r => r.alive), 0)); }
}
