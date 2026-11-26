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
      const swing = s.mir * (cmd.drive * p.amp * dir * w + p.bias + (s.circ ? p.mJoint * s.a + (s.nj || 0) : 0)) + (s.axial ? cmd.turn * 0.5 : 0);
      s.target = s.rest + p.range * clamp(swing, -1, 1);
    }
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (!s.pad) { s.press = 0; continue; }
      const r = segs[s.padRef], rp = r.p;
      const st = Math.sin(r.osc + rp.skew * Math.sin(r.osc) + s.p.gripPhase);
      s.press = cmd.drive < 0.05 ? 1 : clamp(st * 4 + 0.5, 0, 1) * clamp(Math.abs(r.dir) * 3, 0, 1);
      if (s.np) s.press = clamp(s.press + s.np, 0, 1); // (a neuron can press or lift the pad)
    }
  }

  // Local circuits. Each segment has one signal. It hears its own sense (taste[i] = dissolved food where that
  // segment is, 0..1), its neighbours along the body, and the body's hunger; it speaks to its own cilia and joint.
  // Nothing here knows what the signal is for. Returns the summed activity (it costs energy).
  // smA, smB (optional): how much of the two substances bodies leak is in the water at each segment.
  // vis: eyes work as receptors in this world; each seeing segment carries what its eye reports in s.v.
  // con: bodies touch in this world; each segment carries the push on it (s.tch), the tearing of it (s.torn) and what is left of it (s.hp).
  function local(body, taste, hunger, smA, smB, vis, con, learn) {
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
      if (con) { if (p.sT !== 0) x += gain * p.sT * (s.tch / (s.tch + 0.05)); if (p.sW !== 0) { const w = 5 * s.torn + 1 - (s.hp == null ? 1 : s.hp); x += gain * p.sW * (w > 1 ? 1 : w); } }
      if (vis && p.vE !== 0 && s.v != null) x += gain * p.vE * smell(s, 'mV', s.v, p.adapt, 0.3);
      s.a += p.leak * (Math.tanh(x) - s.a);
      const cd = 1 + p.mCil * s.a; s.cd = cd < 0 ? 0 : cd > 2 ? 2 : cd; s.ct = p.mTurn * s.a;
      if (con && p.mBite !== 0) { const mo = 1 + p.mBite * s.a; s.mo = mo < 0 ? 0 : mo > 1 ? 1 : mo; }
      use += s.a < 0 ? -s.a : s.a;
      if (p.nn) { // several neurons in this segment. Each reads what it is wired to (its own senses; neurons here, in the parent, in the children, in its mirror twin: their values of a moment ago) and acts on this segment
        const nn = compile(p.nn), n = nn.length; if (!s.na || s.na.length !== n) { s.na = new Float64Array(n); s.nb = new Float64Array(n); }
        const na = s.na, nb = s.nb, parentSeg = s.parent >= 0 ? segs[s.parent] : null, twin = s.twin >= 0 ? segs[s.twin] : null; let eC = 0, eT = 0, eJ = 0, eM = 0, eP = 0, any = 0;
        // (learn) connections that change with use: each has, beside the strength its genes give it, a part that this body has acquired in its life
        const lw = learn && nn.learns ? (s.nw && s.nw.length === nn.total ? s.nw : (s.nw = new Float64Array(nn.total))) : null;
        for (let q = 0; q < n; q++) { const N = nn[q]; let y = N.b;
          for (let e = 0; e < N.src.length; e++) { let v = 0; const j = N.idx[e];
            switch (N.src[e]) {
              case 0: v = sense; break; case 1: v = smA ? smell(s, 'nA', smA[i], p.adapt) : 0; break; case 2: v = smB ? smell(s, 'nB', smB[i], p.adapt) : 0; break;
              case 3: v = vis && s.v != null ? smell(s, 'nV', s.v, p.adapt, 0.3) : 0; break; case 4: v = con ? s.tch / (s.tch + 0.05) : 0; break;
              case 5: if (con) { const w = 5 * s.torn + 1 - (s.hp == null ? 1 : s.hp); v = w > 1 ? 1 : w; } break; case 6: v = hunger; break;
              case 7: v = i > 0 ? (s.theta - s.rest) / (p.range || 1) : 0; break; case 8: v = Math.sin(s.osc); break; case 9: v = 1; break; case 10: v = s.a; break;
              case 11: v = j < n ? na[j] : 0; break; case 12: v = other(parentSeg, j); break;
              case 13: if (kids.length) { for (let c2 = 0; c2 < kids.length; c2++) v += other(segs[kids[c2]], j); v /= kids.length; } break;
              case 14: v = other(twin, j); break;
              case 15: v = s.ate ? s.ate / (s.ate + 0.1) : 0; break; // (learn) this segment's mouth has just swallowed something
            }
            if (lw) { pre[e] = v; y += (N.w[e] + lw[N.off + e]) * v; } else y += N.w[e] * v; }
          const v2 = na[q] + N.k * (Math.tanh(y) - na[q]); nb[q] = v2; use += v2 < 0 ? -v2 : v2;
          if (lw && N.plastic) { // used together, a connection grows (or shrinks, by its gene); where one input gates the change, only while that input is active. What was acquired fades slowly.
            const gate = N.m >= 0 && N.m < N.src.length ? pre[N.m] : 1;
            for (let e = 0; e < N.eta.length; e++) if (N.eta[e] !== 0) { let d = lw[N.off + e]; d += learn * (N.eta[e] * pre[e] * v2 * gate - 0.005 * d); lw[N.off + e] = d < -2 ? -2 : d > 2 ? 2 : d; } }
          for (let e = 0; e < N.eff.length; e++) { const z = N.ew[e] * v2; any = 1; switch (N.eff[e]) { case 0: eC += z; break; case 1: eT += z; break; case 2: eJ += z; break; case 3: eM += z; break; case 4: eP += z; } } }
        if (any) { const c3 = s.cd + eC; s.cd = c3 < 0 ? 0 : c3 > 2 ? 2 : c3; s.ct += eT; s.nj = eJ; s.np = eP; if (eM !== 0) { const mo = (s.mo == null ? 1 : s.mo) + eM; s.mo = mo < 0 ? 0 : mo > 1 ? 1 : mo; } }
      }
    }
    for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (s.na && s.nb) { const t = s.na; s.na = s.nb; s.nb = t; } } // all neurons step together
    return use;
  }
  // One smell receptor: the same two readings as taste (how much there is; or, as far as it adapts, the change against a slow average).
  function smell(s, key, c, adapt, half) {
    if (s[key] == null) s[key] = c; s[key] += 0.03 * (c - s[key]);
    let rel = (c - s[key]) / (0.02 + 0.15 * s[key]); rel = rel < -1 ? -1 : rel > 1 ? 1 : rel;
    return (1 - adapt) * (2 * c / (c + (half || 0.1)) - 1) + adapt * rel;
  }
  const CIRCUIT = ['nC', 'nP', 'nK', 'nH', 'nB', 'mCil', 'mTurn', 'mJoint', 'adapt', 'sA', 'sB', 'vE', 'sT', 'sW', 'mBite'];
  // what a part's wiring costs to keep: the strengths of the single signal's connections, and for each neuron its connections and a share for the cell itself
  const wiring = p => { let w = 0; for (const k of CIRCUIT) w += Math.abs(p[k] || 0); if (p.nn) for (const q of p.nn) { w += 0.5 + Math.abs(q.b); for (const e of q.in) w += Math.abs(e[1]) + (e[2] ? 0.5 * Math.abs(e[2]) : 0); for (const e of q.out) w += Math.abs(e[1]); } return w; };
  // neurons, made ready to run: sources and targets as numbers. Done once per part.
  const SRC = { c: 0, A: 1, B: 2, v: 3, t: 4, w: 5, h: 6, j: 7, o: 8, 1: 9, a: 10, s: 11, p: 12, k: 13, m: 14, g: 15 }, EFF = { C: 0, T: 1, J: 2, M: 3, P: 4 }, ready = new WeakMap();
  function compile(nn) { let c = ready.get(nn); if (!c) { let off = 0; c = nn.map(q => { const N = { b: q.b, k: q.k, src: q.in.map(e => SRC[e[0][0]]), idx: q.in.map(e => (e[0].length > 1 ? +e[0][1] : 0)), w: q.in.map(e => e[1]), eff: q.out.map(e => EFF[e[0]]), ew: q.out.map(e => e[1]), eta: q.in.map(e => e[2] || 0), m: q.m == null ? -1 : q.m, off }; N.plastic = N.eta.some(x => x !== 0); off += q.in.length; return N; }); c.total = off; c.learns = c.some(N => N.plastic); c.sees = nn.some(q => q.in.some(e => e[0] === 'v')); ready.set(nn, c); } return c; }
  const pre = new Float64Array(8); // (the inputs of the neuron being worked on)
  const other = (seg, i) => (seg && seg.na && i < seg.na.length ? seg.na[i] : 0);

  A.neural = { cpg, command, local, wiring, CIRCUIT, compile };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
