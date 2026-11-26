// ALIFE 2.0 — motor control.
//
// Phase 1 controller: every joint has a local oscillator whose amplitude,
// phase, wave lag and stroke timing come from the genome. The command
// (drive, turn, heading) is the interface a brain will use in Phase 2;
// here it is set by the experimenter.
(function (G) {
  'use strict';
  const A = G.ALIFE2 = G.ALIFE2 || {};
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function command(o) { return Object.assign({ drive: 1, turn: 0, heading: 0 }, o || {}); }

  // Writes joint targets (seg.target, rad relative to parent) and pad contact (seg.press 0..1).
  function cpg(body, t, cmd) {
    const segs = body.segs, base = TAU * body.freq * t;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], p = s.p;
      const phi = base * p.freq + s.phase;
      const dir = (1 - p.steer) + p.steer * Math.sin(s.az - cmd.heading);
      s.osc = phi; s.dir = dir;
      if (i === 0) continue;
      const w = Math.sin(phi + p.skew * Math.sin(phi));
      const swing = s.mir * (cmd.drive * p.amp * dir * w + p.bias + (s.circ ? p.mJoint * s.a : 0)) + (s.axial ? cmd.turn * 0.5 : 0);
      s.target = s.rest + p.range * clamp(swing, -1, 1);
    }
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (!s.pad) { s.press = 0; continue; }
      const r = segs[s.padRef], rp = r.p;
      const st = Math.sin(r.osc + rp.skew * Math.sin(r.osc) + s.p.gripPhase);
      s.press = cmd.drive < 0.05 ? 1 : clamp(st * 4 + 0.5, 0, 1) * clamp(Math.abs(r.dir) * 3, 0, 1);
    }
  }

  // Local circuits. Each segment has one signal. It hears its own sense (taste[i] = dissolved food where that
  // segment is, 0..1), its neighbours along the body, and the body's hunger; it speaks to its own cilia and joint.
  // Nothing here knows what the signal is for. Returns the summed activity (it costs energy).
  // smA, smB (optional): how much of the two substances bodies leak is in the water at each segment.
  // vis: eyes work as receptors in this world; each seeing segment carries what its eye reports in s.v.
  function local(body, taste, hunger, smA, smB, vis) {
    const segs = body.segs; let use = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]; if (!s.circ) continue;
      const p = s.p, kids = s.kids; let kid = 0;
      if (kids.length) { for (let j = 0; j < kids.length; j++) kid += segs[kids[j]].a; kid /= kids.length; }
      const gain = p.nerve >= 0.5 ? 1 : p.nerve * 2, par = s.parent >= 0 ? segs[s.parent].a : 0;
      // a sense can adapt: it keeps a slow average of what it tastes and, as far as it adapts, reports the change against it
      const c = taste[i]; if (s.m == null) s.m = c; s.m += 0.03 * (c - s.m);
      let rel = (c - s.m) / (0.03 + 0.15 * s.m); rel = rel < -1 ? -1 : rel > 1 ? 1 : rel;
      const sense = (1 - p.adapt) * (c - 0.5) * 2 + p.adapt * rel;
      let x = p.nC * gain * sense + p.nP * par + p.nK * kid + p.nH * hunger + p.nB;
      if (smA && (p.sA !== 0 || p.sB !== 0)) x += gain * (p.sA * smell(s, 'mA', smA[i], p.adapt) + p.sB * smell(s, 'mB', smB[i], p.adapt));
      if (vis && p.vE !== 0 && s.v != null) x += gain * p.vE * smell(s, 'mV', s.v, p.adapt, 0.3);
      s.a += p.leak * (Math.tanh(x) - s.a);
      const cd = 1 + p.mCil * s.a; s.cd = cd < 0 ? 0 : cd > 2 ? 2 : cd; s.ct = p.mTurn * s.a;
      use += s.a < 0 ? -s.a : s.a;
    }
    return use;
  }
  // One smell receptor: the same two readings as taste (how much there is; or, as far as it adapts, the change against a slow average).
  function smell(s, key, c, adapt, half) {
    if (s[key] == null) s[key] = c; s[key] += 0.03 * (c - s[key]);
    let rel = (c - s[key]) / (0.02 + 0.15 * s[key]); rel = rel < -1 ? -1 : rel > 1 ? 1 : rel;
    return (1 - adapt) * (2 * c / (c + (half || 0.1)) - 1) + adapt * rel;
  }
  const CIRCUIT = ['nC', 'nP', 'nK', 'nH', 'nB', 'mCil', 'mTurn', 'mJoint', 'adapt', 'sA', 'sB', 'vE'];
  const wiring = p => { let w = 0; for (const k of CIRCUIT) w += Math.abs(p[k] || 0); return w; };

  A.neural = { cpg, command, local, wiring, CIRCUIT };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
