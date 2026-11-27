// ALIFE 2.0 — development: expand a genome (graph grammar) into a body plan.
//
// The plan is a tree of segments. Each segment is a tapered piece of body with
// a joint to its parent. Nothing here knows what a "leg" or a "tail" is: those
// are only what the rules happen to build.
(function (G) {
  'use strict';
  const A = G.ALIFE2 = G.ALIFE2 || {};
  if (typeof require !== 'undefined' && !A.genome) require('./alife2-genome.js');
  const { chainScale, clamp } = A.genome;
  const PI = Math.PI, TAU = PI * 2;
  const MAX_SEGS = 160, TISSUE_ROOM = 1.5, TISSUES = ['muscle', 'gut', 'gonad', 'store', 'nerve', 'vessel'];
  const SUPPLY_REACH = 6;
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  // stage: 0 = newly born bud, 1 = adult.
  function develop(g, opt) {
    opt = opt || {};
    const stage = opt.stage == null ? 1 : clamp(opt.stage, 0, 1), cap = opt.maxSegs || MAX_SEGS;
    // One piece of body has limited room: tissues crowd each other. A single blob can hold a
    // little of everything; a body with several kinds of part can specialise them.
    const parts = g.parts.map(p => {
      const sum = p.muscle + p.gut + p.gonad + p.store + p.nerve + p.vessel, k = sum > TISSUE_ROOM ? TISSUE_ROOM / sum : 1, q = Object.assign({}, p);
      for (const t of TISSUES) q[t] = p[t] * k;
      if (opt.late && p.nAt > stage) { for (const c of A.neural.CIRCUIT) q[c] = 0; delete q.nn; } /* (wireLate) this part's circuit is built when the body has grown to stage `nAt`: until then its segments carry no connections, pay for none, and nothing drives them (cilia beat at their plain rate, the mouth stays open, joints follow the body's rhythm alone) */
      return q;
    });
    const chainLink = g.parts.map((_, i) => g.links.findIndex(l => l.from === i && l.to === i));
    const segs = [];
    // chainLi: the rule that makes this segment's axis (a chain keeps the rule it began with, whatever parts follow along it). zone: how many segments of this part in a row so far.
    const root = { id: 0, parent: -1, part: g.root, via: -1, idx: 0, chainBase: 1, mir: 1, angle: 0, at: 0, off: 0, phase0: 0, axial: true, counts: {}, chainRoot: 0, group: 0, kids: [], chainLi: chainLink[g.root], zone: 1, addr: 'r', axisAddr: 'r' };
    { const cl0 = chainLink[root.part]; root.scale0 = cl0 >= 0 ? chainScale(g.links[cl0], 0, g.links[cl0].repeat) : 1; }
    segs.push(root);
    let groups = 1;
    for (let q = 0; q < segs.length; q++) {
      const s = segs[q], cl = s.chainLi, own = chainLink[s.part];
      s.R = cl >= 0 ? g.links[cl].repeat : 0;
      s.f = s.R ? s.idx / s.R : 0;
      for (let li = 0; li < g.links.length; li++) {
        const l = g.links[li], chain = li === cl;
        if (!chain && (l.from !== s.part || li === own)) continue; // (a part inside another part's axis does not start its own axis there)
        const key = l.fam != null ? 'f' + l.fam : li, used = s.counts[key] || 0; // rules copied when a zone split share one count
        if (used >= l.repeat) continue;
        // along an axis the part changes where a zone ends
        const sp = g.parts[s.part], nx = sp.next == null ? -1 : sp.next, to = !chain ? l.to : nx >= 0 && nx < g.parts.length && s.zone >= (sp.span || 1) ? nx : s.part;
        if (!chain && s.R && (s.f < l.lo - 1e-6 || s.f > l.hi + 1e-6)) continue; // windows only mean something along a repeated axis
        let copies = l.sym === 'radial' ? l.n : l.sym === 'mirror' && (Math.abs(Math.sin(l.angle)) > 0.05 || l.off > 0.05 && Math.abs(Math.sin(l.angle)) > 0.01) ? 2 : 1;
        if (chain) copies = 1;
        for (let k = 0; k < copies; k++) {
          if (segs.length >= cap) break;
          const flip = l.sym === 'mirror' && k === 1, mir = s.mir * (flip ? -1 : 1);
          const c = {
            id: segs.length, parent: s.id, part: to, via: li, at: l.at, off: chain ? 0 : l.off,
            chainLi: chain ? cl : chainLink[to], zone: chain && to === s.part ? s.zone + 1 : 1,
            idx: chain ? s.idx + 1 : 0, mir, copy: k,
            angle: mir * l.angle + (l.sym === 'radial' ? TAU * k / l.n : 0),
            chainBase: chain ? s.chainBase : s.scale0 * l.scale,
            phase0: s.phase0 + (chain ? 0 : l.symPhase * k + l.axPhase * s.idx),
            axial: s.axial && copies === 1 && Math.abs(Math.sin(l.angle)) < 0.05,
            counts: Object.assign({}, s.counts, { [key]: used + 1 }),
            chainRoot: chain ? s.chainRoot : segs.length, group: chain ? s.group : groups++, chain, kids: []
          };
          c.scale0 = 0; // set below
          // where this segment is in the body, in terms that stay the same while it grows and from parent to child: its axis, and how far along it
          c.axisAddr = chain ? s.axisAddr : s.addr + '>' + (l.fam != null ? l.fam : l.id != null ? l.id : 'i' + li) + '.' + k; c.addr = chain ? c.axisAddr + '/' + c.idx : c.axisAddr;
          const ccl = c.chainLi, cR = ccl >= 0 ? g.links[ccl].repeat : 0;
          c.scale0 = c.chainBase * (ccl >= 0 ? chainScale(g.links[ccl], c.idx, cR) : 1);
          s.kids.push(c.id); segs.push(c);
        }
      }
    }
    // geometry at full size
    const n = segs.length, total = 0.3 + 0.7 * stage;
    const twins = new Map(); if (opt.pair) { const at = new Map(segs.map(s => [s.addr, s.id])); for (const s of segs) { const m = s.addr && s.addr.match(/^(.*>[^>.]+\.)([01])((?:\/\d+)?)$/); if (m) { const t = at.get(m[1] + (m[2] === '0' ? '1' : '0') + m[3]); if (t != null) twins.set(s.addr, t); } } }
    for (const s of segs) {
      const p = parts[s.part], cl = s.chainLi, l = cl >= 0 ? g.links[cl] : null;
      s.p = p;
      s.birth = n > 1 ? 0.62 * s.id / (n - 1) : 0;
      if (opt.pair && s.addr) { const t = twins.get(s.addr); if (t != null && t < s.id) s.birth = segs[t].birth; } // (pair) the two of a left-right pair appear together, at the stage the first of them would
      s.g = stage >= 1 ? 1 : smooth((stage - s.birth) / 0.3 + 0.12);
      s.chainKid = s.kids.find(k => segs[k].chain);
      const jr = x => p.r0 * s.chainBase * (l ? chainScale(l, x, s.R) : 1);
      s.len = p.len * s.scale0;
      s.r0 = jr(s.idx);
      s.tipR = p.r1 * s.scale0;
      s.r1 = s.chainKid != null ? jr(s.idx + 1) : s.tipR;
      s.depth = p.depth;
    }
    // growth: later segments are still buds
    const alive = segs.filter(s => s.g > 0.03 && (s.parent < 0 || segs[s.parent].alive !== false) || (s.alive = false));
    for (const s of alive) {
      const k = (0.35 + 0.65 * s.g) * total;
      s.len *= s.g * total; s.r0 *= k; s.tipR *= k;
      const c = s.chainKid != null ? segs[s.chainKid] : null;
      s.r1 = c && c.alive !== false ? s.tipR * (1 - c.g) + s.r1 * k * c.g : s.tipR;
      if (s.chain && s.parent >= 0) s.r0 = segs[s.parent].r1;
    }
    // reindex and lay out the rest pose
    const map = new Map(); alive.forEach((s, i) => map.set(s.id, i));
    const out = alive.map((s, i) => ({
      id: i, parent: s.parent < 0 ? -1 : map.get(s.parent), part: s.part, p: s.p, via: s.via, idx: s.idx, R: s.R, f: s.f, addr: s.addr,
      mir: s.mir, copy: s.copy || 0, at: s.at, off: s.off, angle: s.angle, len: Math.max(1e-3, s.len), r0: s.r0, r1: s.r1,
      z0: s.r0 * s.depth, z1: s.r1 * s.depth, phase: s.p.phase + s.p.lag * s.idx + s.phase0, axial: s.axial,
      chainRoot: map.get(s.chainRoot), group: s.group, chain: !!s.chain, g: s.g, kids: []
    }));
    for (const s of out) if (s.parent >= 0) out[s.parent].kids.push(s.id);
    for (const s of out) {
      s.tip = !s.kids.some(k => out[k].at > 0.9 && out[k].off < 0.3);
      s.leaf = s.kids.length === 0;
      if (s.parent < 0) { s.abs = 0; s.ax = 0; s.ay = 0; s.wr = 0; s.wi = 0; }
      else {
        const q = out[s.parent], rp = q.r0 + (q.r1 - q.r0) * s.at;
        s.abs = q.abs + s.angle;
        let cr = s.off * rp / q.len * Math.cos(s.angle), ci = s.off * rp / q.len * Math.sin(s.angle);
        const m = Math.hypot(cr, ci); if (m > 3) { cr *= 3 / m; ci *= 3 / m; }
        s.wr = s.at + cr; s.wi = ci; // attach point = parentA + (wr + i wi) * (parentB - parentA)
        const dx = q.bx - q.ax, dy = q.by - q.ay;
        s.ax = q.ax + s.wr * dx - s.wi * dy; s.ay = q.ay + s.wr * dy + s.wi * dx;
      }
      s.bx = s.ax + Math.cos(s.abs) * s.len; s.by = s.ay + Math.sin(s.abs) * s.len;
    }
    for (const s of out) s.az = out[s.chainRoot].abs;
    // supply: how well each segment is fed, by distance along the body from the nearest gut
    // (or, with no gut at all, from the skin: every segment feeds itself). Vessels shorten the distance.
    const anyGut = out.some(s => s.p.gut > 0.05), dist = out.map(s => !anyGut || s.p.gut > 0.05 ? 0 : Infinity);
    const hop = s => s.len * (1 - 0.9 * s.p.vessel);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = out.length - 1; i > 0; i--) { const s = out[i], q = out[s.parent]; dist[q.id] = Math.min(dist[q.id], dist[i] + hop(q)); }
      for (let i = 1; i < out.length; i++) { const s = out[i]; dist[i] = Math.min(dist[i], dist[s.parent] + hop(s)); }
    }
    for (const s of out) s.supply = Math.exp(-dist[s.id] / SUPPLY_REACH);
    // (wireEnds) A connection is made only where both of its ends are. One from a sense the segment does not have (no eye, no ear, no nerve tissue to read
    // with, a sense this world does not have), one to an effector it does not have (no cilia, no muscled joint, no mouth, no voice), one to a neighbouring
    // segment that is not there or carries no circuit: none of these could ever change what the body does, and the segment does not build or pay for them.
    // opt.ends tells which senses the world has ({ scent, vision, contact, sound }). The several-neuron circuits are left as they are.
    if (opt.ends) { const W = opt.ends, n2 = out.length, own = ['nC', 'nH', 'nB', 'sA', 'sB', 'sT', 'sW', 'vE', 'hE', 'mCil', 'mTurn', 'mJoint', 'mBite', 'mVoice'], senses = ['nC', 'sA', 'sB', 'vE', 'hE'];
      const has = out.map(s => { const p = s.p, gain = p.nerve > 0, cil = (p.cilia || 0) * (p.beat == null ? 1 : p.beat) !== 0;
        return { nC: gain, nH: true, nB: true, sA: !!W.scent && gain, sB: !!W.scent && gain, sT: !!W.contact && gain, sW: !!W.contact && gain, vE: !!W.vision && p.eye > 0.1 && gain, hE: !!W.sound && (p.ear || 0) > 0.02 && gain,
          mCil: cil, mTurn: cil, mJoint: s.id > 0 && p.muscle > 0 && p.range > 0, mBite: !!W.contact && p.mouth > 0.1 && s.tip, mVoice: !!W.sound && (p.voice || 0) > 0.02 }; });
      // which segments carry a circuit at all once the endless connections are gone: by their own connections, or by listening to a neighbour that does
      const wired = out.map((s, i) => !!(s.p.nn && s.p.nn.length) || own.some(k => has[i][k] && s.p[k]));
      for (let ch = true, it = 0; ch && it <= n2; it++) { ch = false; for (let i = 0; i < n2; i++) { if (wired[i]) continue; const s = out[i], p = s.p; if ((p.nP && s.parent >= 0 && wired[s.parent]) || (p.nK && s.kids.some(c => wired[c]))) { wired[i] = true; ch = true; } } }
      const views = new Map();
      for (let i = 0; i < n2; i++) { const s = out[i], p = s.p, off = own.filter(k => p[k] && !has[i][k]);
        if (p.nP && !(s.parent >= 0 && wired[s.parent])) off.push('nP'); if (p.nK && !s.kids.some(c => wired[c])) off.push('nK');
        if (p.adapt && !(p.nn && p.nn.length) && !senses.some(k => has[i][k] && p[k])) off.push('adapt'); // (how a sense reports: nothing to it where no sense is read)
        if (!off.length) continue; const key = s.part + '|' + off.join(); let q = views.get(key); if (!q) { q = Object.assign({}, p); for (const k of off) q[k] = 0; views.set(key, q); } s.p = q; } }
    return { segs: out, stage, hue: g.hue, freq: g.freq, origin: g.origin, truncated: segs.length >= cap };
  }

  // What an observer would call this body. Never used by the engine itself.
  function describe(plan) {
    const s = plan.segs;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, vol = 0, area = 0, muscle = 0, armor = 0;
    for (const q of s) {
      const r = Math.max(q.r0, q.r1);
      minX = Math.min(minX, q.ax - r, q.bx - r); maxX = Math.max(maxX, q.ax + r, q.bx + r);
      minY = Math.min(minY, q.ay - r, q.by - r); maxY = Math.max(maxY, q.ay + r, q.by + r);
      const rm = (q.r0 + q.r1) / 2, zm = (q.z0 + q.z1) / 2, v = PI * rm * zm * q.len;
      vol += v; area += PI * (rm + zm) * q.len; muscle += v * q.p.muscle; armor += v * q.p.armor;
    }
    const limbs = s.filter(q => q.parent >= 0 && !q.axial && q.chainRoot === q.id && s[q.parent].axial);
    const chainLen = id => { let n = 0; for (const q of s) if (q.chainRoot === id) n++; return n; };
    return {
      segments: s.length, joints: s.length - 1, axial: s.filter(q => q.axial).length,
      appendages: limbs.length, appendageJoints: limbs.length ? Math.max(...limbs.map(q => chainLen(q.id))) : 0,
      length: maxX - minX, width: maxY - minY, volume: vol, surface: area, muscleFraction: vol ? muscle / vol : 0, armorFraction: vol ? armor / vol : 0,
      eyes: s.filter(q => q.p.eye > 0.1).length, mouths: s.filter(q => q.p.mouth > 0.1 && q.tip).length,
      bbox: [minX, minY, maxX, maxY]
    };
  }

  A.development = { develop, describe, MAX_SEGS, TISSUE_ROOM, SUPPLY_REACH };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
