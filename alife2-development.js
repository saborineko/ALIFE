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
  const MAX_SEGS = 160;
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  // stage: 0 = newly born bud, 1 = adult.
  function develop(g, opt) {
    opt = opt || {};
    const stage = opt.stage == null ? 1 : clamp(opt.stage, 0, 1), cap = opt.maxSegs || MAX_SEGS;
    const chainLink = g.parts.map((_, i) => g.links.findIndex(l => l.from === i && l.to === i));
    const segs = [];
    const root = { id: 0, parent: -1, part: g.root, via: -1, idx: 0, chainBase: 1, mir: 1, angle: 0, at: 0, off: 0, phase0: 0, axial: true, counts: {}, chainRoot: 0, group: 0, kids: [] };
    { const cl0 = chainLink[root.part]; root.scale0 = cl0 >= 0 ? chainScale(g.links[cl0], 0, g.links[cl0].repeat) : 1; }
    segs.push(root);
    let groups = 1;
    for (let q = 0; q < segs.length; q++) {
      const s = segs[q], cl = chainLink[s.part];
      s.R = cl >= 0 ? g.links[cl].repeat : 0;
      s.f = s.R ? s.idx / s.R : 0;
      for (let li = 0; li < g.links.length; li++) {
        const l = g.links[li];
        if (l.from !== s.part) continue;
        const used = s.counts[li] || 0;
        if (used >= l.repeat) continue;
        const chain = li === cl;
        if (!chain && s.R && (s.f < l.lo - 1e-6 || s.f > l.hi + 1e-6)) continue; // windows only mean something along a repeated axis
        let copies = l.sym === 'radial' ? l.n : l.sym === 'mirror' && (Math.abs(Math.sin(l.angle)) > 0.05 || l.off > 0.05 && Math.abs(Math.sin(l.angle)) > 0.01) ? 2 : 1;
        if (chain) copies = 1;
        for (let k = 0; k < copies; k++) {
          if (segs.length >= cap) break;
          const flip = l.sym === 'mirror' && k === 1, mir = s.mir * (flip ? -1 : 1);
          const c = {
            id: segs.length, parent: s.id, part: l.to, via: li, at: l.at, off: chain ? 0 : l.off,
            idx: chain ? s.idx + 1 : 0, mir, copy: k,
            angle: mir * l.angle + (l.sym === 'radial' ? TAU * k / l.n : 0),
            chainBase: chain ? s.chainBase : s.scale0 * l.scale,
            phase0: s.phase0 + (chain ? 0 : l.symPhase * k + l.axPhase * s.idx),
            axial: s.axial && copies === 1 && Math.abs(Math.sin(l.angle)) < 0.05,
            counts: Object.assign({}, s.counts, { [li]: used + 1 }),
            chainRoot: chain ? s.chainRoot : segs.length, group: chain ? s.group : groups++, chain, kids: []
          };
          c.scale0 = 0; // set below
          const ccl = chainLink[c.part], cR = ccl >= 0 ? g.links[ccl].repeat : 0;
          c.scale0 = c.chainBase * (ccl >= 0 ? chainScale(g.links[ccl], c.idx, cR) : 1);
          s.kids.push(c.id); segs.push(c);
        }
      }
    }
    // geometry at full size
    const n = segs.length, total = 0.3 + 0.7 * stage;
    for (const s of segs) {
      const p = g.parts[s.part], cl = chainLink[s.part], l = cl >= 0 ? g.links[cl] : null;
      s.p = p;
      s.birth = n > 1 ? 0.62 * s.id / (n - 1) : 0;
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
      id: i, parent: s.parent < 0 ? -1 : map.get(s.parent), part: s.part, p: s.p, via: s.via, idx: s.idx, R: s.R, f: s.f,
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

  A.development = { develop, describe, MAX_SEGS };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
