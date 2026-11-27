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
  // snd: sound exists in this world; each segment with an ear carries how loud the water is at its outer end, over the pitches it is tuned to, in s.e.
  // Then a segment's signal and neurons can also drive its voice: s.vo (0 silent .. 1 full) and s.vq (its pitch pushed down -1 .. up 1).
  function local(body, taste, hunger, smA, smB, vis, con, learn, snd, rew, sec) {
    const segs = body.segs; let use = 0, hd = 0, bus = false, wd = 0; // wd (rewire): how much more, or less, wiring this body has now than it was born with; hd (record only): how hard what the ears report is pushing on this body's circuit right now
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]; if (!s.circ) continue;
      const p = s.p, kids = s.kids; let kid = 0;
      if (kids.length) { for (let j = 0; j < kids.length; j++) kid += segs[kids[j]].a; kid /= kids.length; }
      const gain = p.nerve >= 0.5 ? 1 : p.nerve * 2, par = s.parent >= 0 ? segs[s.parent].a : 0;
      // a sense can adapt: it keeps a slow average of what it tastes and, as far as it adapts, reports the change against it
      const c = taste[i]; if (s.m == null) s.m = c; s.m += 0.03 * (c - s.m);
      let rel = (c - s.m) / (0.03 + 0.15 * s.m); rel = rel < -1 ? -1 : rel > 1 ? 1 : rel;
      const sense = (1 - p.adapt) * (c - 0.5) * 2 + p.adapt * rel;
      let x;
      if (rew && p.nLife) { // (rewire) the segment's own input connections come and go with use, like a neuron's: each has a presence that this body's life has given it
        const L = p.nLife, z = s.sz && s.sz.length === SZ ? s.sz : (s.sz = new Float64Array(SZ).fill(L < 0 ? 0 : 1)), v = szV, wt = szW;
        v[0] = gain * sense; wt[0] = p.nC; v[1] = par; wt[1] = p.nP; v[2] = kid; wt[2] = p.nK; v[3] = hunger; wt[3] = p.nH;
        if (smA && (p.sA !== 0 || p.sB !== 0)) { v[4] = gain * smell(s, 'mA', smA[i], p.adapt); wt[4] = p.sA; v[5] = gain * smell(s, 'mB', smB[i], p.adapt); wt[5] = p.sB; } else { wt[4] = 0; wt[5] = 0; }
        if (con && p.sT !== 0) { v[6] = gain * (s.tch / (s.tch + 0.05)); wt[6] = p.sT; } else wt[6] = 0;
        if (con && p.sW !== 0) { const w = 5 * s.torn + 1 - (s.hp == null ? 1 : s.hp); v[7] = gain * (w > 1 ? 1 : w); wt[7] = p.sW; } else wt[7] = 0;
        if (vis && p.vE !== 0 && s.v != null) { v[8] = gain * smell(s, 'mV', s.v, p.adapt, 0.3); wt[8] = p.vE; } else wt[8] = 0;
        if (snd && p.hE !== 0 && s.e != null) { const sg = smell(s, 'mE', s.e, p.adapt, 0.1), ev = gain * p.hE * (sg + 1 - p.adapt) * z[9]; v[9] = gain * sg; wt[9] = p.hE; hd += ev < 0 ? -ev : ev; } else wt[9] = 0;
        x = p.nB; for (let k = 0; k < SZ; k++) if (wt[k] !== 0) x += wt[k] * v[k] * z[k];
        const a2 = s.a + p.leak * (Math.tanh(x) - s.a), sp = L < 0 ? -L : L, u = p.nUse == null ? 0.15 : p.nUse, z0 = L < 0 ? 0 : 1; // (what the signal is about to be: used together with it or not)
        for (let k = 0; k < SZ; k++) { if (wt[k] === 0) continue; const c2 = v[k] * a2; let q = z[k]; q += rew * sp * ((c2 < 0 ? -c2 : c2) > u ? REW.up * (1 - q) : -REW.down * q); z[k] = q < 0 ? 0 : q > 1 ? 1 : q; wd += REW.share * (wt[k] < 0 ? -wt[k] : wt[k]) * (z[k] - z0); }
      } else {
      x = p.nC * gain * sense + p.nP * par + p.nK * kid + p.nH * hunger + p.nB;
      if (smA && (p.sA !== 0 || p.sB !== 0)) x += gain * (p.sA * smell(s, 'mA', smA[i], p.adapt) + p.sB * smell(s, 'mB', smB[i], p.adapt));
      if (con) { if (p.sT !== 0) x += gain * p.sT * (s.tch / (s.tch + 0.05)); if (p.sW !== 0) { const w = 5 * s.torn + 1 - (s.hp == null ? 1 : s.hp); x += gain * p.sW * (w > 1 ? 1 : w); } }
      if (vis && p.vE !== 0 && s.v != null) x += gain * p.vE * smell(s, 'mV', s.v, p.adapt, 0.3);
      if (snd && p.hE !== 0 && s.e != null) { const sg = smell(s, 'mE', s.e, p.adapt, 0.1), ev = gain * p.hE * (sg + 1 - p.adapt); x += gain * p.hE * sg; hd += ev < 0 ? -ev : ev; } // (hd counts what sound adds over silence: an ear in silence reports its lowest value, not nothing)
      }
      s.a += p.leak * (Math.tanh(x) - s.a);
      const cd = 1 + p.mCil * s.a; s.cd = cd < 0 ? 0 : cd > 2 ? 2 : cd; s.ct = p.mTurn * s.a;
      if (con && p.mBite !== 0) { const mo = 1 + p.mBite * s.a; s.mo = mo < 0 ? 0 : mo > 1 ? 1 : mo; }
      if (snd) { const vo = p.mVoice * s.a; s.vo = vo < 0 ? 0 : vo > 1 ? 1 : vo; s.vq = 0; }
      if (sec) { const se = (p.mSec || 0) * s.a; s.se = se < 0 ? 0 : se > 1 ? 1 : se; } // (nest) how hard this segment's gland secretes: 0 idle .. 1 full
      use += s.a < 0 ? -s.a : s.a;
      if (p.nn) { // several neurons in this segment. Each reads what it is wired to (its own senses; neurons here, in the parent, in the children, in its mirror twin: their values of a moment ago) and acts on this segment
        const nn = compile(p.nn), n = nn.length; if (!s.na || s.na.length !== n) { s.na = new Float64Array(n); s.nb = new Float64Array(n); }
        const na = s.na, nb = s.nb, parentSeg = s.parent >= 0 ? segs[s.parent] : null, twin = s.twin >= 0 ? segs[s.twin] : null; let eC = 0, eT = 0, eJ = 0, eM = 0, eP = 0, eV = 0, eQ = 0, eS = 0, any = 0;
        // (learn) connections that change with use: each has, beside the strength its genes give it, a part that this body has acquired in its life
        const lw = learn && nn.learns ? (s.nw && s.nw.length === nn.total ? s.nw : (s.nw = new Float64Array(nn.total))) : null;
        // (rewire) connections that come and go with use: each has a presence, 0 (not there) to 1 (there), that this body's life has given it. A connection born present
        // (its gene > 0) starts at 1, one that must form (gene < 0) at 0. While the neuron and the source are active together it moves towards 1, otherwise towards 0,
        // at a speed set by the gene. What is not there carries no signal and costs no upkeep.
        const lz = rew && nn.rewires ? (s.nz && s.nz.length === nn.total ? s.nz : (s.nz = presence(nn))) : null;
        for (let q = 0; q < n; q++) { const N = nn[q]; let y = N.b;
          for (let e = 0; e < N.src.length; e++) { let v = 0; const j = N.idx[e];
            switch (N.src[e]) {
              case 0: v = sense; break; case 1: v = smA ? smell(s, 'nA', smA[i], p.adapt) : 0; break; case 2: v = smB ? smell(s, 'nB', smB[i], p.adapt) : 0; break;
              case 3: v = vis && s.v != null ? smell(s, 'nV', s.v, p.adapt, 0.3) : 0; break; case 4: v = con ? s.tch / (s.tch + 0.05) : 0; break;
              case 5: if (con) { const w = 5 * s.torn + 1 - (s.hp == null ? 1 : s.hp); v = w > 1 ? 1 : w; } break; case 6: v = hunger; break;
              case 7: v = i > 0 ? (s.theta - s.rest) / (p.range || 1) : 0; break; case 8: v = Math.sin(s.osc); break; case 9: v = 1; break; case 10: v = s.a; break;
              case 11: v = j < n ? na[j] : 0; break; case 12: v = nn.pos ? named(parentSeg, j) : other(parentSeg, j); break;
              case 13: if (kids.length) { for (let c2 = 0; c2 < kids.length; c2++) v += nn.pos ? named(segs[kids[c2]], j) : other(segs[kids[c2]], j); v /= kids.length; } break;
              case 14: v = other(twin, j); break;
              case 15: v = s.ate ? s.ate / (s.ate + 0.1) : 0; break; // (learn) this segment's mouth has just swallowed something
              case 16: v = snd && s.e != null ? smell(s, 'nE', s.e, p.adapt, 0.1) : 0; break; // (sound) what this segment's ear reports
              case 17: v = named(segs[0], j); break; // (brain) the neuron of that name in the root segment
              case 18: { if (!bus) bus = busOf(segs); const own = nn.pos ? nn.pos.get(j) : (j < n ? j : null), k2 = busN[j] - (own != null ? 1 : 0); v = k2 > 0 ? (busSum[j] - (own != null ? na[own] : 0)) / k2 : 0; } break; // (brain) the mean of the neurons of that name in all the other segments
            }
            if (lz) { pre[e] = v; y += (lw ? N.w[e] + lw[N.off + e] : N.w[e]) * (N.life[e] !== 0 ? lz[N.off + e] : 1) * v; } else if (lw) { pre[e] = v; y += (N.w[e] + lw[N.off + e]) * v; } else y += N.w[e] * v;
            if (snd && N.src[e] === 16 && s.e != null) { const ev = N.w[e] * (v + 1 - p.adapt); hd += ev < 0 ? -ev : ev; } } // (record; only where the segment has an ear: a neuron that reads an ear the segment lacks reads nothing)
          const v2 = na[q] + N.k * (Math.tanh(y) - na[q]); nb[q] = v2; use += v2 < 0 ? -v2 : v2;
          if (lw && N.plastic) { // used together, a connection grows (or shrinks, by its gene); where one input gates the change, only while that input is active. What was acquired fades slowly.
            const gate = N.m >= 0 && N.m < N.src.length ? pre[N.m] : 1;
            for (let e = 0; e < N.eta.length; e++) if (N.eta[e] !== 0) { let d = lw[N.off + e]; d += learn * (N.eta[e] * pre[e] * v2 * gate - 0.005 * d); lw[N.off + e] = d < -2 ? -2 : d > 2 ? 2 : d; } }
          if (lz && N.rew) for (let e = 0; e < N.life.length; e++) { const L = N.life[e]; if (L === 0) continue; let z = lz[N.off + e]; const a2 = pre[e] * v2, sp = L < 0 ? -L : L;
            z += rew * sp * ((a2 < 0 ? -a2 : a2) > N.u ? REW.up * (1 - z) : -REW.down * z); lz[N.off + e] = z < 0 ? 0 : z > 1 ? 1 : z; wd += REW.share * N.aw[e] * (z - (L < 0 ? 0 : 1)); }
          for (let e = 0; e < N.eff.length; e++) { const z = N.ew[e] * v2; any = 1; switch (N.eff[e]) { case 0: eC += z; break; case 1: eT += z; break; case 2: eJ += z; break; case 3: eM += z; break; case 4: eP += z; break; case 5: eV += z; break; case 6: eQ += z; break; case 7: eS += z; } } }
        if (any) { const c3 = s.cd + eC; s.cd = c3 < 0 ? 0 : c3 > 2 ? 2 : c3; s.ct += eT; s.nj = eJ; s.np = eP; if (eM !== 0) { const mo = (s.mo == null ? 1 : s.mo) + eM; s.mo = mo < 0 ? 0 : mo > 1 ? 1 : mo; } if (snd) { const vo = s.vo + eV; s.vo = vo < 0 ? 0 : vo > 1 ? 1 : vo; s.vq = eQ < -1 ? -1 : eQ > 1 ? 1 : eQ; } if (sec && eS !== 0) { const se = s.se + eS; s.se = se < 0 ? 0 : se > 1 ? 1 : se; } }
      }
    }
    for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (s.na && s.nb) { const t = s.na; s.na = s.nb; s.nb = t; } } // all neurons step together
    if (snd) body.hd = hd;
    if (rew) body.wd = wd;
    return use;
  }
  // One smell receptor: the same two readings as taste (how much there is; or, as far as it adapts, the change against a slow average).
  function smell(s, key, c, adapt, half) {
    if (s[key] == null) s[key] = c; s[key] += 0.03 * (c - s[key]);
    let rel = (c - s[key]) / (0.02 + 0.15 * s[key]); rel = rel < -1 ? -1 : rel > 1 ? 1 : rel;
    return (1 - adapt) * (2 * c / (c + (half || 0.1)) - 1) + adapt * rel;
  }
  const CIRCUIT = ['nC', 'nP', 'nK', 'nH', 'nB', 'mCil', 'mTurn', 'mJoint', 'adapt', 'sA', 'sB', 'vE', 'sT', 'sW', 'mBite', 'hE', 'mVoice', 'mSec'];
  // what a part's wiring costs to keep: the strengths of the single signal's connections, and for each neuron its connections and a share for the cell itself
  // (rewire) REW: how fast presence follows use (per second, times the gene: towards 1 while used, towards 0 while not), the share of a connection's upkeep that is only
  // paid while it is there, and what the ability itself costs (per unit of the gene, like the ability to learn).
  const REW = { up: 0.2, down: 0.05, share: 0.9, gene: 0.2 };
  // (rewire) the single signal's own inputs, in the order their presences are kept: taste, parent, children, hunger, scent A, scent B, touch, wound, eye, ear
  const INPUTS = ['nC', 'nP', 'nK', 'nH', 'sA', 'sB', 'sT', 'sW', 'vE', 'hE'], SZ = INPUTS.length, szV = new Float64Array(SZ), szW = new Float64Array(SZ);
  const wiring = p => { let w = 0; for (const k of CIRCUIT) w += Math.abs(p[k] || 0); if (p.nLife) { w += REW.gene * Math.abs(p.nLife); if (p.nLife < 0) for (const k of INPUTS) w -= REW.share * Math.abs(p[k] || 0); /* (inputs that are not there at birth cost their share only once they have formed) */ } if (p.nn) for (const q of p.nn) { w += 0.5 + Math.abs(q.b); for (const e of q.in) { w += Math.abs(e[1]) + (e[2] ? 0.5 * Math.abs(e[2]) : 0); if (e[3]) w += REW.gene * Math.abs(e[3]) - (e[3] < 0 ? REW.share * Math.abs(e[1]) : 0); /* (a connection that is not there at birth costs its share only once it has formed: see local) */ } for (const e of q.out) w += Math.abs(e[1]); } return w; };
  const presence = nn => { const z = new Float64Array(nn.total); for (const N of nn) for (let e = 0; e < N.life.length; e++) z[N.off + e] = N.life[e] < 0 ? 0 : 1; return z; };
  // neurons, made ready to run: sources and targets as numbers. Done once per part.
  const SRC = { c: 0, A: 1, B: 2, v: 3, t: 4, w: 5, h: 6, j: 7, o: 8, 1: 9, a: 10, s: 11, p: 12, k: 13, m: 14, g: 15, e: 16, r: 17, d: 18 }, EFF = { C: 0, T: 1, J: 2, M: 3, P: 4, V: 5, Q: 6, S: 7 }, ready = new WeakMap();
  function compile(nn) { let c = ready.get(nn); if (!c) { let off = 0; const named = nn.some(q => q.id != null), pos = named ? new Map(nn.map((q, i) => [q.id == null ? i : q.id, i])) : null, at = e => { const id = NAME.indexOf(e[0][1]); if (e[0][0] === 'p' || e[0][0] === 'k' || e[0][0] === 'r' || e[0][0] === 'd') return id; const i = pos.get(id); return i == null ? 255 : i; }; /* (wire) neurons with names: a reference means the neuron of that name. Those to this part (s, m) are settled here; those to another segment (p, k) when read; a name nobody has reads 0 */
    c = nn.map(q => { const N = { b: q.b, k: q.k, src: q.in.map(e => SRC[e[0][0]]), idx: q.in.map(e => (e[0].length > 1 ? (named ? at(e) : +e[0][1]) : 0)), w: q.in.map(e => e[1]), eff: q.out.map(e => EFF[e[0]]), ew: q.out.map(e => e[1]), eta: q.in.map(e => e[2] || 0), m: q.m == null ? -1 : q.m, off, life: q.in.map(e => e[3] || 0), aw: q.in.map(e => Math.abs(e[1])), u: q.u == null ? 0.15 : q.u }; N.plastic = N.eta.some(x => x !== 0); N.rew = N.life.some(x => x !== 0); off += q.in.length; return N; }); c.total = off; c.pos = pos; c.learns = c.some(N => N.plastic); c.rewires = c.some(N => N.rew); c.sees = nn.some(q => q.in.some(e => e[0] === 'v')); c.ids = nn.map((q, i) => (q.id == null ? i : q.id)); /* (brain) the name of each neuron, for the body-wide reading */ ready.set(nn, c); } return c; }
  const pre = new Float64Array(8); // (the inputs of the neuron being worked on)
  // (brain) every name's sum and count over the whole body, from the neurons' values of a moment ago. Made once per body per step, and only if some neuron asks.
  const busSum = new Float64Array(36), busN = new Float64Array(36);
  function busOf(segs) { busSum.fill(0); busN.fill(0); for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (!s.circ || !s.na || !s.p.nn) continue; const ids = compile(s.p.nn).ids; for (let q = 0; q < ids.length && q < s.na.length; q++) { const id = ids[q]; if (id < 36) { busSum[id] += s.na[q]; busN[id]++; } } } return true; }
  // (brain) how much of a part's wiring reaches far: the summed strength of its connections to the root (r) and to a name over the whole body (d). Null where there is none.
  const farOf = new WeakMap();
  function far(nn) { let f = farOf.get(nn); if (f === undefined) { let r = 0, d = 0; for (const q of nn) for (const e of q.in) if (e[0].length === 2) { if (e[0][0] === 'r') r += Math.abs(e[1]); else if (e[0][0] === 'd') d += Math.abs(e[1]); } f = r || d ? { r, d } : null; farOf.set(nn, f); } return f; }
  const other = (seg, i) => (seg && seg.na && i < seg.na.length ? seg.na[i] : 0);
  const NAME = '0123456789abcdefghijklmnopqrstuvwxyz';
  // (wire) the neuron called `id` in another segment: found by its name in that segment's own part (or by its place, if that part's neurons have no names)
  const named = (seg, id) => { if (!seg || !seg.na || !seg.p.nn) return 0; const c = compile(seg.p.nn), i = c.pos ? c.pos.get(id) : id; return i != null && i < seg.na.length ? seg.na[i] : 0; };

  A.neural = { cpg, command, local, wiring, CIRCUIT, compile, far, presence, REW, INPUTS };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
