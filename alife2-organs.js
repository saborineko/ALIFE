// ALIFE 2.0 — organs and energy budget.
//
// What a body can take in, hold, spend and pass on is computed from its
// tissues: how much there is, where it is, and how big the body is.
// Nothing here rewards complexity. It only prices everything:
//   - every tissue costs upkeep in proportion to its volume
//   - skin absorbs dissolved food in proportion to bare surface (small bodies win), and surface costs upkeep
//   - a mouth swallows particles up to its gape (wide heads reach rich food)
//   - a gut holds and digests in proportion to its volume
//   - reserves, and so starvation time, grow with volume and storage tissue
(function (G) {
  'use strict';
  const A = G.ALIFE2 = G.ALIFE2 || {};
  const PI = Math.PI;
  const C = {
    build: 10,            // energy to grow one unit of body volume
    store0: 6, store1: 14,  // reserve capacity per volume, and extra per storage tissue
    fixed: 0.012, eggFixed: 0.4,  // what any living thing costs however small: upkeep per second, and per offspring
    basal: 0.055,         // upkeep per volume per second of plain tissue
    upkeep: { muscle: 0.05, nerve: 0.04, gut: 0.03, vessel: 0.03, gonad: 0.03, store: 0.005, eye: 0.10, armor: 0.01, mouth: 0.02, ear: 0.06, voice: 0.05, gland: 0.04 },
    synapse: 0.001, spike: 0.004,         // nerve circuit: per unit of connection strength per second, and per unit of signal activity per second
    secrete: 0.1, matter: 1, // (nest) matter a unit volume of gland lays down per second at full drive, and the energy a unit of matter takes from the body
    far: 0.5,             // (brain) a connection that reaches beyond its neighbours costs this share of its strength more, per segment of distance
    ciliaUpkeep: 0.004, ciliaWork: 0.03,  // per ciliated surface: to keep the hairs, and per second of full beating
    surface: 0.008,       // upkeep per unit of body surface per second (thin, branched bodies pay for their skin)
    osm: 0.16,            // dissolved uptake per bare surface per second at full concentration
    gutCap: 6, digest: 1.0, eta0: 0.2, eta1: 0.7, etaHalf: 0.15,
    noGut: 0.05,          // a body with a mouth but no gut can still engulf a little
    gonad: 0.6,           // energy per second a unit of gonad can put into an egg
    work: 2e-4,           // energy per unit of muscle work
    birthStage: 0.3, eggReserve: 0.5, growReserve: 0.35, reproReserve: 0.45,
    life: 400, carrion: 0.5,
    bite: 0.5,            // body volume a mouth can tear from tissue it touches, per second, per gape squared (before its jaw muscle and the other's armour)
    call: 0.6,            // energy per second a unit volume of sound-making tissue spends when it sounds at full strength
    seep: 0.05,           // reserve that passes between two bodies in contact, per second, per unit of difference in how full they are, through bare surface
    flesh: 0.5            // share of the cost of building tissue that is still in it as food (the same share a dead body leaves)
  };

  function profile(plan) {
    const o = { V: 0, area: 0, Vgut: 0, Vgonad: 0, Vmuscle: 0, Vnerve: 0, Emax: 0, basal: 0, absorb: [], mouths: [], eye: 0, cilia: 0, wiring: 0, segs: plan.segs.length };
    let depth = null, meanDepth = 0, at = -1;
    for (const s of plan.segs) { at++;
      // hp: how much of this segment's tissue is left (1 = whole). What is gone does nothing and costs nothing.
      const p = s.p, hp = s.hp == null ? 1 : s.hp, rm = (s.r0 + s.r1) / 2, zm = (s.z0 + s.z1) / 2, v = PI * rm * zm * s.len * hp, a = PI * (rm + zm) * s.len * hp, u = C.upkeep;
      o.V += v; o.area += a; o.Vgut += v * p.gut; o.Vgonad += v * p.gonad; o.Vmuscle += v * p.muscle; o.Vnerve += v * p.nerve;
      o.Emax += v * (C.store0 + C.store1 * p.store);
      o.basal += v * (C.basal + u.muscle * p.muscle + u.nerve * p.nerve + u.gut * p.gut + u.vessel * p.vessel + u.gonad * p.gonad + u.store * p.store + u.eye * p.eye + u.armor * p.armor + u.mouth * p.mouth + u.ear * (p.ear || 0) + u.voice * (p.voice || 0) + u.gland * (p.gland || 0));
      o.basal += a * C.surface + a * (p.cilia || 0) * C.ciliaUpkeep; o.cilia += a * (p.cilia || 0);
      const wire = A.neural ? A.neural.wiring(p) : 0; o.wiring += wire; o.basal += wire * C.synapse; // every wired segment pays for its connections
      if (p.nn && A.neural && A.neural.far) { const f = A.neural.far(p.nn); if (f) { // (brain) reach costs: to the root, the segment's own depth; to a name over the whole body, its depth and the mean depth of the body
        if (!depth) { depth = new Float64Array(plan.segs.length); let sum = 0; for (let i = 1; i < plan.segs.length; i++) { const q = plan.segs[i]; depth[i] = q.parent >= 0 ? depth[q.parent] + 1 : 0; sum += depth[i]; } meanDepth = sum / plan.segs.length; }
        const more = C.far * (f.r * depth[at] + f.d * (depth[at] + meanDepth)); o.wiring += more; o.basal += more * C.synapse; } }
      o.absorb.push(a * Math.max(0, 1 - p.skin - p.armor));
      if (p.mouth > 0.1 && s.tip) o.mouths.push({ seg: s.id, gape: s.r1 * (0.3 + 0.7 * p.mouth) * hp });
      if (p.eye > 0.1) o.eye = Math.max(o.eye, p.eye * Math.max(s.r0, s.r1) * hp);
    }
    o.basal += C.fixed;
    const hasGut = o.Vgut > 1e-6;
    o.gutCap = hasGut ? C.gutCap * o.Vgut : C.gutCap * C.noGut * o.V;
    o.digest = hasGut ? C.digest * o.Vgut : C.digest * C.noGut * o.V;
    o.eta = hasGut ? C.eta0 + C.eta1 * o.Vgut / (o.Vgut + C.etaHalf * o.V) : C.eta0;
    o.gape = o.mouths.reduce((m, q) => Math.max(m, q.gape), 0);
    o.gonadRate = C.gonad * o.Vgonad;
    o.sense = Math.max(1 + 3 * Math.cbrt(o.Vnerve), o.eye > 0 ? 4 + 22 * Math.sqrt(o.eye) : 0);
    o.buildCost = C.build * o.V;
    o.life = C.life * Math.pow(Math.max(o.V, 0.05), 0.25) / Math.pow(0.39, 0.25);
    return o;
  }

  A.organs = { C, profile };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
