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
      const swing = s.mir * (cmd.drive * p.amp * dir * w + p.bias) + (s.axial ? cmd.turn * 0.5 : 0);
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

  A.neural = { cpg, command };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
