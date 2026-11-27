// What would an evolved body's controller do if it were taken out of its world and wired to something else (a robot)?
// Reads a saved world (.json.gz). For every living body, runs only its controller (whole-body brain, local circuit, joint
// oscillators) on made-up senses; no world is stepped and nothing is written back. Counts, per body, the largest change in
// any output (drive, turn, guide; per segment: cilia, cilia turn, joint push, mouth, pad) under:
//   clock  : nothing changes; how much the joint targets move (the oscillators)
//   self   : nothing changes and the brain's noise input is held at 0; anything that still varies is the circuit's own
//   noise  : the same with the brain's noise input running (the engine's random walk, through an evolved weight)
//   hunger : hunger 0.1 against 0.9
//   dir    : food seen ahead / to the left against none. `guide` is the engine's own steering towards food and switches
//            on by construction when food is seen, so `dirBrain` counts drive and turn only
//   taste, sight : a step in what the segments taste / see, and how long the change outlasts the stimulus
// Sound is left out (ears are given nothing). Scent is held at 0.
// Usage: node tools/alife2-detach-probe.js <world.json.gz> [out.json]
// Predictions fixed before the first run (2026-11-27, Claude): self <5% of bodies; noise 60%; hunger 50%; dir 60%;
// taste 30%; sight (of eyed bodies) 30%; a response held >1 s in <10%.
const R = __dirname + '/../';
const A = require(R + 'alife2-genome.js'), fs = require('fs'), zlib = require('zlib');
for (const f of ['development', 'neural', 'physics', 'organs', 'engine']) require(R + 'alife2-' + f + '.js');
try { require(R + 'alife2-rules.js'); } catch (e) {}
const file = process.argv[2], saved = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
const W = A.engine.World.restore(saved), dt = 1 / 30;
const sig = x => 1 / (1 + Math.exp(-x));
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) * Math.SQRT2; };
// one step of the controller only. inp: {taste, hunger, ahead, left, v, noiseOn}
function tick(o, st, inp) {
  const b = o.b, segs = b.segs, n = segs.length;
  if (inp.noiseOn) st.noise += (gauss() - st.noise * 0.3) * 0.3; else st.noise = 0;
  const x = [1, inp.ahead, inp.left, inp.hunger, st.noise], w = o.g.brain, out = [0, 0, 0];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) out[j] += w[j * 5 + i] * x[i];
  b.cmd.drive = sig(out[0]); b.cmd.turn = Math.tanh(out[1]); const guide = (inp.ahead || inp.left) ? sig(out[2] * 2 + 1) : 0;
  const taste = st.taste; for (let i = 0; i < n; i++) { taste[i] = segs[i].circ ? inp.taste : 0.5; const p = segs[i].p; if (p.eye > 0.1) segs[i].v = inp.v; segs[i].tch = 0; segs[i].torn = 0; }
  const zero = st.zero;
  if (b.hasCircuit) A.neural.local(b, taste, inp.hunger, W.scent ? zero : null, W.scent ? zero : null, W.vision, W.contact, W.learn ? dt : 0, 0);
  b.t += dt; A.neural.cpg(b, b.t, b.cmd);
  // outputs: clock = joint targets; nonclock = everything a circuit or brain sets
  const non = [b.cmd.drive, b.cmd.turn, guide]; const clock = [];
  for (let i = 0; i < n; i++) { const s = segs[i]; non.push(s.cd == null ? 1 : s.cd, s.ct || 0, s.nj || 0, s.mo == null ? 1 : s.mo, s.np || 0); if (i > 0) clock.push(s.target - s.rest); }
  return { non, clock };
}
const base = { taste: 0.3, hunger: 0.5, ahead: 0, left: 0, v: 0.1, noiseOn: false };
function run(o, st, secs, inp) { const rec = []; for (let i = 0; i < secs * 30; i++) rec.push(tick(o, st, typeof inp === 'function' ? inp(i / 30) : inp)); return rec; }
const stat = (rec, key) => { const m = rec[0][key].length, mean = new Float64Array(m), sd = new Float64Array(m); for (const r of rec) for (let k = 0; k < m; k++) mean[k] += r[key][k] / rec.length; for (const r of rec) for (let k = 0; k < m; k++) sd[k] += (r[key][k] - mean[k]) ** 2 / rec.length; return { mean, sd: sd.map(Math.sqrt) }; };
const maxd = (a, b) => { let d = 0; for (let k = 0; k < a.length; k++) d = Math.max(d, Math.abs(a[k] - b[k])); return d; };
const max = a => a.reduce((x, y) => Math.max(x, y), 0);
const snap = o => JSON.stringify(o.b.segs.map(s => [s.a, s.m, s.na ? [...s.na] : 0, s.nw ? [...s.nw] : 0, s.mV, s.mA, s.mB, s.osc]));
const res = [];
for (const o of W.bodies) {
  if (o.dead || !o.b || !o.g.brain) continue;
  const n = o.b.segs.length, st = { noise: 0, taste: new Float64Array(n), zero: new Float64Array(n) };
  const hasNN = o.b.segs.some(s => s.p.nn && s.p.nn.length), eyed = o.b.segs.some(s => s.p.eye > 0.1 && (s.p.vE !== 0 || (s.p.nn && A.neural.compile(s.p.nn).sees)));
  const joints = o.b.segs.filter((s, i) => i > 0 && s.p.muscle > 0.02 && s.p.amp > 0.02).length, cil = o.b.segs.some(s => s.p.cilia > 0.05);
  run(o, st, 20, base); // settle
  const c0 = run(o, st, 20, base), s0 = stat(c0, 'non'), k0 = stat(c0, 'clock');
  const cN = run(o, st, 20, Object.assign({}, base, { noiseOn: true })), sN = stat(cN, 'non'); run(o, st, 10, base);
  const meanOf = inp => { run(o, st, 10, inp); return stat(run(o, st, 5, inp), 'non').mean; };
  const hLo = meanOf(Object.assign({}, base, { hunger: 0.1 })), hHi = meanOf(Object.assign({}, base, { hunger: 0.9 }));
  const b0 = meanOf(base);
  const fA = meanOf(Object.assign({}, base, { ahead: 1 })), fL = meanOf(Object.assign({}, base, { left: 1 })), fR = meanOf(Object.assign({}, base, { left: -1 }));
  meanOf(base);
  // step responses: peak change within 3 s, and how long it stays above 1/e of the peak after the stimulus is gone
  const step = ch => { const b1 = stat(run(o, st, 3, base), 'non').mean; const on = run(o, st, 3, Object.assign({}, base, ch)); let peak = 0; for (const r of on) peak = Math.max(peak, maxd(r.non, b1)); const off = run(o, st, 15, base); let last = -1; if (peak > 0.02) off.forEach((r, i) => { if (maxd(r.non, b1) > peak / Math.E) last = i; }); return { peak, hold: (last + 1) / 30 }; };
  const tS = step({ taste: 0.8 }), vS = eyed ? step({ v: 0.8 }) : null;
  res.push({ id: o.id, n, hasCircuit: !!o.b.hasCircuit, hasNN, eyed, joints, cil, clock: max(k0.sd), self: max(s0.sd), noise: max(sN.sd), hunger: maxd(hLo, hHi), dir: Math.max(maxd(fA, b0), maxd(fL, b0)), dirBrain: Math.max(maxd(fA.slice(0, 2), b0.slice(0, 2)), maxd(fL.slice(0, 2), b0.slice(0, 2)), maxd(fL.slice(0, 2), fR.slice(0, 2))), lr: maxd(fL, fR), taste: tS.peak, tasteHold: tS.hold, sight: vS ? vS.peak : null, sightHold: vS ? vS.hold : null });
}
const N = res.length, pc = f => (100 * res.filter(f).length / N).toFixed(1) + '%', q = (k, f) => { const a = res.filter(f || (() => true)).map(r => r[k]).filter(v => v != null).sort((x, y) => x - y); return a.length ? `med ${a[a.length >> 1].toFixed(3)} p90 ${a[Math.floor(a.length * 0.9)].toFixed(3)} max ${a[a.length - 1].toFixed(3)} (n=${a.length})` : 'n=0'; };
const T = 0.05;
console.log(file.split('/').pop(), 't=' + W.t.toFixed(0), 'bodies', N, 'rules', JSON.stringify({ vision: W.vision, nerve2: W.nerve2, learn: W.learn, contact: W.contact, scent: W.scent, sound: W.sound }));
console.log('has local circuit', pc(r => r.hasCircuit), '| several neurons', pc(r => r.hasNN), '| wired eye', pc(r => r.eyed), '| moving joints', pc(r => r.joints > 0), '| cilia', pc(r => r.cil));
console.log('clock (joint rhythm sd>0.05)      ', pc(r => r.clock > T), q('clock'));
console.log('P1 self-variation, no noise (>0.05)', pc(r => r.self > T), q('self'));
console.log('P2 variation with brain noise      ', pc(r => r.noise > T), q('noise'));
console.log('P3 hunger 0.1 vs 0.9               ', pc(r => r.hunger > T), q('hunger'));
console.log('P4a food direction vs none         ', pc(r => r.dir > T), q('dir'), '| drive and turn only', pc(r => r.dirBrain > T), q('dirBrain'));
console.log('P4b taste step 0.3->0.8 peak       ', pc(r => r.taste > T), q('taste'));
const E = res.filter(r => r.eyed); console.log('P4c sight step (of eyed bodies)    ', E.length ? (100 * E.filter(r => r.sight > T).length / E.length).toFixed(1) + '%' : '-', q('sight', r => r.eyed));
console.log('P5 taste response held >1 s        ', pc(r => r.taste > T && r.tasteHold > 1), q('tasteHold', r => r.taste > T), '| sight held >1 s', E.length ? (100 * E.filter(r => r.sight > T && r.sightHold > 1).length / E.length).toFixed(1) + '%' : '-');
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(res));
