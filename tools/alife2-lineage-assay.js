// When did a function begin? Follows one living body back to its founder and tests its ancestors' genomes.
// Copies of each sampled ancestor are placed in open water and on the bottom of fresh worlds, and compared with
// the same bodies with their joints stopped, and with their cilia stopped. So "it has joints" and "its joints do something"
// can be dated separately.
// Usage: node tools/alife2-lineage-assay.js <world.json|.gz> [body id | bottom] [generation step] [seconds] [world seeds...]
const A = require('../alife2-genome.js'), fs = require('fs'), zlib = require('zlib');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require('../alife2-' + f + '.js');
const [file, pick, stepArg, secs, ...seedArgs] = process.argv.slice(2), STEP = Number(stepArg) || 10, T = Number(secs) || 150, seeds = seedArgs.length ? seedArgs.map(Number) : [951, 952, 953, 954], C = A.organs.C;
const W = A.engine.World.restore(JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)));
const start = pick && pick !== 'bottom' ? W.bodies.find(o => o.id === Number(pick)) : W.bodies.filter(o => o.cy >= W.yBottom && o.stage >= 1).sort((a, b) => b.path / b.age - a.path / a.age)[0];
const chain = W.ancestors(start.id).filter(n => n.g).reverse(); // (ancestors older than the world's recordAge keep a genome only where the plan changed)
const joints = g => A.development.develop(g, { maxSegs: W.maxSegs }).segs.filter(s => s.id > 0 && s.p.muscle > 0.02 && s.p.amp > 0.02).length;
const firstJoint = chain.find(n => joints(n.g) > 0), pickGen = new Set();
for (const n of chain) if (n.gen % STEP === 0 || n === chain[chain.length - 1] || (firstJoint && Math.abs(n.gen - firstJoint.gen) <= 6 && (n.gen - firstJoint.gen) % 2 === 0)) pickGen.add(n.gen);
const sample = chain.filter(n => pickGen.has(n.gen));
console.log(`${file.split('/').pop()}: body #${start.id} (generation ${start.gen}), ${chain.length} ancestors on record; first working joint at generation ${firstJoint ? firstJoint.gen : '-'}; testing ${sample.length} of them, ${seeds.length} worlds, ${T} s`);
function run(seed, mode) {
  const w = new A.engine.World({ seed, founders: 0, cap: 0 }); for (let i = 0; i < 1500; i++) w.step();
  const sets = sample.map(n => { const set = { water: [], bottom: [] }; for (const place of ['water', 'bottom']) for (let i = 0; i < 4; i++) {
    const g = A.genome.sanitize(A.genome.copy(n.g)); if (mode === 'joints off') for (const p of g.parts) { p.amp = 0; p.mJoint = 0; } if (mode === 'cilia off') for (const p of g.parts) p.cilia = 0;
    const o = w.spawn(g, w.rand() * w.W, place === 'water' ? 4 + w.rand() * (w.yBottom - 8) : w.yBottom + 3 + w.rand() * (w.H - w.yBottom - 6), 1, null); o.E = o.prof.Emax * 0.5; set[place].push(o); } return set; });
  for (let i = 0; i < 30 * T; i++) w.step();
  const age = o => Math.max(1, o.age), m = (l, f) => l.reduce((a, o) => a + f(o), 0) / l.length;
  const stat = l => ({ speed: m(l, o => o.path / age(o)), mouth: m(l, o => o.eaten * o.prof.eta / age(o)), bal: m(l, o => (o.absorbed + o.eaten * o.prof.eta) / age(o) - o.prof.basal - (C.work * o.b.work + C.ciliaWork * o.b.ciliaUse + C.spike * o.b.nerveUse) / age(o)), alive: m(l, o => o.dead ? 0 : 1) });
  return sets.map(s => ({ water: stat(s.water), bottom: stat(s.bottom) }));
}
const res = {}; for (const mode of ['intact', 'joints off', 'cilia off']) res[mode] = seeds.map(s => run(s, mode));
const out = { file, body: start.id, firstJointGen: firstJoint ? firstJoint.gen : null, rows: [] };
const rng = v => [v.reduce((a, b) => a + b, 0) / v.length, Math.min(...v), Math.max(...v)], apart = (a, b) => a[1] > b[2] || a[2] < b[1];
console.log('世代 | 出生(秒) | 体節 関節 口 繊毛 体積 | 開水域: 自力移動(そのまま/関節停止/繊毛停止) 口から(そのまま/関節停止) | 底: 自力移動(そのまま/関節停止) 口から(そのまま/関節停止) 収支(そのまま/関節停止) 生存(そのまま/関節停止) | 関節の効果');
sample.forEach((n, i) => {
  const p = A.organs.profile(A.development.develop(n.g, { maxSegs: W.maxSegs })), q = (mode, place, k) => rng(res[mode].map(r => r[i][place][k]));
  const f = (mode, place, k, d = 3) => q(mode, place, k)[0].toFixed(d), eff = [];
  if (apart(q('intact', 'water', 'speed'), q('joints off', 'water', 'speed')) && Math.abs(q('intact', 'water', 'speed')[0] - q('joints off', 'water', 'speed')[0]) > 0.01) eff.push('水中の移動');
  if (apart(q('intact', 'bottom', 'speed'), q('joints off', 'bottom', 'speed')) && Math.abs(q('intact', 'bottom', 'speed')[0] - q('joints off', 'bottom', 'speed')[0]) > 0.01) eff.push('底の移動');
  if (apart(q('intact', 'bottom', 'mouth'), q('joints off', 'bottom', 'mouth'))) eff.push(q('intact', 'bottom', 'mouth')[0] > q('joints off', 'bottom', 'mouth')[0] ? '底の採食↑' : '底の採食↓');
  if (apart(q('intact', 'water', 'mouth'), q('joints off', 'water', 'mouth'))) eff.push(q('intact', 'water', 'mouth')[0] > q('joints off', 'water', 'mouth')[0] ? '水中の採食↑' : '水中の採食↓');
  if (apart(q('intact', 'bottom', 'bal'), q('joints off', 'bottom', 'bal'))) eff.push(q('intact', 'bottom', 'bal')[0] > q('joints off', 'bottom', 'bal')[0] ? '底の収支↑' : '底の収支↓');
  if (apart(q('intact', 'water', 'bal'), q('joints off', 'water', 'bal'))) eff.push(q('intact', 'water', 'bal')[0] > q('joints off', 'water', 'bal')[0] ? '水中の収支↑' : '水中の収支↓');
  const row = { gen: n.gen, born: Math.round(n.born), id: n.id, segs: p.segs, joints: joints(n.g), mouths: p.mouths.length, cilia: +p.cilia.toFixed(2), V: +p.V.toFixed(2), effects: eff, stats: {} };
  for (const mode of ['intact', 'joints off', 'cilia off']) for (const place of ['water', 'bottom']) for (const k of ['speed', 'mouth', 'bal', 'alive']) row.stats[mode + '/' + place + '/' + k] = q(mode, place, k).map(v => +v.toFixed(4));
  out.rows.push(row);
  console.log(`${String(n.gen).padStart(3)} | ${String(Math.round(n.born)).padStart(5)} | ${String(p.segs).padStart(2)} ${String(row.joints).padStart(2)} ${String(row.mouths).padStart(2)} ${p.cilia.toFixed(2)} ${p.V.toFixed(2)} | ${f('intact', 'water', 'speed')}/${f('joints off', 'water', 'speed')}/${f('cilia off', 'water', 'speed')} ${f('intact', 'water', 'mouth')}/${f('joints off', 'water', 'mouth')} | ${f('intact', 'bottom', 'speed')}/${f('joints off', 'bottom', 'speed')} ${f('intact', 'bottom', 'mouth')}/${f('joints off', 'bottom', 'mouth')} ${f('intact', 'bottom', 'bal')}/${f('joints off', 'bottom', 'bal')} ${f('intact', 'bottom', 'alive', 2)}/${f('joints off', 'bottom', 'alive', 2)} | ${eff.join('・') || '—'}`);
});
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out));
