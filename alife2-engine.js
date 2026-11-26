// ALIFE 2.0 — the world: water, a bottom, food, and bodies that must pay for themselves.
//
// Three ways to make a living are offered, none is preferred by the code:
//   dissolved food  everywhere, thin, absorbed through bare skin, locally exhaustible
//   drifting grains in open water, in patches that move; small ones common, large ones rare and rich
//   bottom grains   on the benthic strip, dense and fixed, where nothing drifts and bellies drag
// Bodies are born small, grow by spending energy, reproduce by budding with mutation, starve or age.
// There is no fitness function and no reward for size, parts or movement.
(function (G) {
  'use strict';
  const A = G.ALIFE2 = G.ALIFE2 || {};
  if (typeof require !== 'undefined' && !A.organs) { require('./alife2-genome.js'); require('./alife2-development.js'); require('./alife2-neural.js'); require('./alife2-physics.js'); require('./alife2-organs.js'); }
  const TAU = Math.PI * 2, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const wrapPi = x => { x = (x + Math.PI) % TAU; if (x < 0) x += TAU; return x - Math.PI; };
  const sig = x => 1 / (1 + Math.exp(-x));

  const DEFAULTS = {
    seed: 1, W: 160, H: 100, benthic: 0.25, cell: 4, cap: 400, dt: 1 / 30, substeps: 4,
    nutrientCap: 1, nutrientRegrow: 0.01, nutrientStart: 0.6, nutrientDiffuse: 0.08,
    grainRate: 60,                       // energy per second arriving as drifting grains
    grainSizes: [0.15, 0.3, 0.6, 1.2], grainShare: [0.2, 0.3, 0.3, 0.2], grainEnergy: 40, grainLife: 90,
    patches: 4, patchRadius: 12,
    bottomRate: 25, bottomSize: [0.15, 0.3, 0.6], bottomLife: 150,
    flow: 0.35, sink: 0.12, jitter: 0.25, mutation: 0.7, founders: 20, maxSegs: 64,
    map: '',                              // '' = the original world (open water over a bottom strip); 'coast' = regions side by side
    numb: 0,                              // control experiment: no segment in this world can taste dissolved food
    blind: 0,                             // control experiment: nothing in this world is told where food is
    rigid: 1,                             // 0 = never use the rigid-body shortcut (control experiment)
    jostleEvery: 1,                       // 1 = every drifting grain is jostled every step. Larger values are faster but starve stationary feeders (measured: -15% at 4)
    noCilia: 0,                           // control experiment: cilia genes cannot be expressed in this world
    scent: 0,                             // 1 = bodies leak two substances into the water as they live, and segments can sense them. 0 = the worlds before this existed
    scentRate: 1, scentDecay: 0.05,       // leaked per unit of resting metabolism; share lost per second
    anosmic: 0                            // control experiment: no segment in this world can sense what bodies leak
  };

  // Maps: a world can be one continuous place whose regions differ in what they offer.
  // Regions are stretches of x (the world joins left to right). Nothing separates them: bodies and food cross freely.
  //   ground  : there is a bottom to touch and drag on        flow    : strength of the current
  //   weight  : how hard a body presses on that bottom (1 = full; water carries most of a body's weight)
  //   jitter  : how much drifting grains are jostled          regrow  : dissolved food, relative
  //   grains  : rate (energy/s), sizes and energy shares, patches (0 = spread evenly), settle (per second; 1 = appear fixed)
  const MAPS = {
    coast: { W: 480, H: 160, cap: 1600, founders: 60, regions: [
      { name: '外洋', x1: 190, ground: 0, flow: 1, jitter: 1, regrow: 1, grains: { rate: 60, sizes: [0.15, 0.3, 0.6, 1.2], share: [0.2, 0.3, 0.3, 0.2], patches: 5, radius: 12, settle: 0 } },
      { name: '流れのある海底', x1: 300, ground: 1, weight: 0.35, flow: 0.6, jitter: 1, regrow: 0.6, grains: { rate: 25, sizes: [0.15, 0.3, 0.6], share: [0.34, 0.33, 0.33], patches: 0, settle: 0.02 } },
      { name: '浅瀬', x1: 380, ground: 1, weight: 0.12, flow: 0.15, jitter: 0.3, regrow: 0.4, grains: { rate: 18, sizes: [0.3, 0.6], share: [0.5, 0.5], patches: 0, settle: 1 } },
      { name: '大粒の海', x1: 480, ground: 0, flow: 0.7, jitter: 0.5, regrow: 0.5, grains: { rate: 40, sizes: [0.6, 1.2, 2.0], share: [0.3, 0.4, 0.3], patches: 3, radius: 16, settle: 0 } }
    ] }
  };

  class World {
    constructor(opt) {
      Object.assign(this, DEFAULTS, opt || {});
      const M = this.map ? MAPS[this.map] : null;
      if (M) { this.W = M.W; this.H = M.H; if (!opt || opt.cap == null) this.cap = M.cap; if (!opt || opt.founders == null) this.founders = M.founders; }
      this.rand = A.genome.rng(this.seed); this.t = 0; this.tick = 0; this.nextId = 1;
      this.cols = Math.ceil(this.W / this.cell); this.rows = Math.ceil(this.H / this.cell);
      this.nut = new Float32Array(this.cols * this.rows).fill(this.nutrientStart); this.nut2 = new Float32Array(this.nut.length);
      this.food = []; this.grid = Array.from({ length: this.cols * this.rows }, () => []);
      this.bodies = []; this.yBottom = this.H * (1 - this.benthic);
      this.patch = Array.from({ length: this.patches }, () => ({ x: this.rand() * this.W, y: this.rand() * this.yBottom, a: this.rand() * TAU }));
      if (M) this.buildMap(M);
      this.counts = { births: 0, starved: 0, aged: 0, broken: 0, blocked: 0, eaten: 0 };
      this.taste = new Float64Array(256);
      if (this.scent) { const n = this.cols * this.rows; this.scA = new Float32Array(n); this.scB = new Float32Array(n); this.sc2 = new Float32Array(n); this.smA = new Float64Array(256); this.smB = new Float64Array(256); }
      this.tree = new Map(); this.events = []; this.history = []; this.firsts = {}; this.pruned = 0; this.clades = new Map();
    }
    buildMap(M) {
      this.yBottom = this.H + 1; this.patch = []; // the strip world's bottom line does not exist here
      const n = this.cols * this.rows, R = this.regions = M.regions.map((q, i) => Object.assign({ id: i, x0: i ? M.regions[i - 1].x1 : 0, debt: 0, patch: [] }, q));
      this.hGround = new Uint8Array(n); this.hFlow = new Float32Array(n); this.hJit = new Float32Array(n); this.hRegrow = new Float32Array(n); this.hSettle = new Float32Array(n); this.hReg = new Uint8Array(n); this.hWeight = new Float32Array(n);
      for (let c = 0; c < this.cols; c++) {
        const x = (c + 0.5) * this.cell, q = R[this.regionAt(x)], edge = Math.min(x - q.x0, q.x1 - x), nb = R[(q.id + (x - q.x0 < q.x1 - x ? R.length - 1 : 1)) % R.length], k = clamp(0.5 + edge / 16, 0.5, 1); // blend over 8 units each side of a border
        for (let r = 0; r < this.rows; r++) { const i = r * this.cols + c; this.hReg[i] = q.id; this.hGround[i] = q.ground; this.hWeight[i] = q.weight == null ? 1 : q.weight; this.hSettle[i] = q.grains.settle; this.hFlow[i] = q.flow * k + nb.flow * (1 - k); this.hJit[i] = q.jitter * k + nb.jitter * (1 - k); this.hRegrow[i] = q.regrow * k + nb.regrow * (1 - k); }
      }
      for (const q of R) for (let i = 0; i < q.grains.patches; i++) q.patch.push({ x: q.x0 + q.grains.radius + this.rand() * (q.x1 - q.x0 - 2 * q.grains.radius), y: 8 + this.rand() * (this.H - 16), a: this.rand() * TAU });
    }
    regionAt(x) { x = ((x % this.W) + this.W) % this.W; const R = this.regions; for (let i = 0; i < R.length; i++) if (x < R[i].x1) return i; return R.length - 1; }
    isGround(x, y) { return this.regions ? this.hGround[this.cellAt(x, clamp(y, 0, this.H - 0.01))] === 1 : y >= this.yBottom; }
    seedWith(genome, n) { for (let i = 0; i < (n || this.founders); i++) this.spawn(A.genome.copy(genome), this.rand() * this.W, this.rand() * this.H, 1, null); }

    spawn(g, x, y, stage, parent) {
      if (this.noCilia) for (const p of g.parts) p.cilia = 0;
      const o = { id: this.nextId++, g, stage, taxDot: 0, taxLen: 0, taxN: 0, sx: x, sy: y, age: 0, G: 0, egg: 0, grow: 0, dead: false, noise: 0, wander: this.rand() * TAU, path: 0, eaten: 0, absorbed: 0, kids: 0,
        parent: parent ? parent.id : 0, line: parent ? parent.line : this.nextId - 1, gen: parent ? parent.gen + 1 : 0, born: this.t };
      const C = A.organs.C, baby = A.organs.profile(A.development.develop(g, { stage: g.birth, maxSegs: this.maxSegs }));
      o.full = A.organs.profile(A.development.develop(g, { maxSegs: this.maxSegs })); o.life = o.full.life * (0.85 + 0.3 * this.rand());
      o.eggCost = C.eggFixed + baby.buildCost + C.eggReserve * baby.Emax; o.eggE = C.eggReserve * baby.Emax;
      this.form(o, x, y, this.rand() * TAU);
      o.E = parent ? Math.min(o.prof.Emax, parent.eggE) : o.prof.Emax * 0.6;
      // genealogy: what kind of body this is, and whether that differs from its parent's
      o.home = this.regions ? this.regionAt(x) : 0; // the region it was born in
      o.kind = [o.full.segs, o.full.mouths.length, o.full.eye > 0 ? 1 : 0, this.motile(g) ? 1 : 0, o.full.cilia > 0.05 ? 1 : 0].join('/');
      const pn = parent ? this.tree.get(parent.id) : null;
      this.tree.set(o.id, { id: o.id, parent: o.parent, line: o.line, gen: o.gen, born: this.t, died: null, cause: null, kind: o.kind, V: o.full.V, hue: g.hue, kids: 0, changed: !pn || pn.kind !== o.kind, g });
      if (pn) pn.kids++;
      // a clade = everything descended from the individual in which a body plan first appeared, until the plan changes again.
      // Its record is kept after it dies out: extinct ways of living are evidence too.
      const node = this.tree.get(o.id); o.clade = node.clade = node.changed ? o.id : parent.clade;
      if (node.changed) this.clades.set(o.id, { id: o.id, from: parent ? parent.clade : 0, line: o.line, kind: o.kind, g, V: o.full.V, born: this.t, ended: null, members: 0, alive: 0, gen0: o.gen, genMax: o.gen, causes: {}, dead: 0, eaten: 0, absorbed: 0, path: 0, lived: 0, kids: 0 });
      const cl = this.clades.get(o.clade); cl.members++; cl.alive++; if (o.gen > cl.genMax) cl.genMax = o.gen;
      this.note(o);
      this.bodies.push(o); return o;
    }
    // (re)build the body for its current stage, keeping place
    form(o, x, y, ang) {
      o.plan = A.development.develop(o.g, { stage: o.stage, maxSegs: this.maxSegs }); o.prof = A.organs.profile(o.plan);
      o.b = A.physics.build(o.plan, { x, y, angle: ang, env: { fluid: 1, ground: false, gravity: 4, flowX: 0, flowY: 0 } });
      // lay the body's own centre on (x, y)
      const c = A.physics.com(o.b); for (let k = 0; k < o.b.np; k++) { o.b.x[k] += x - c[0]; o.b.y[k] += y - c[1]; }
      A.physics.pose(o.b); o.cx = x; o.cy = y; o.work0 = 0;
      // a body with no working joint cannot do anything but drift: move it with the water instead of simulating it
      if (!this.rigid) o.b.rigid = false; // control experiment: solve every body with the jointed solver
      o.passive = !o.b.hasCilia && o.b.rigid; o.cil0 = 0; o.nerve0 = 0; o.b.nerveUse = 0; if (o.sig) { for (let i = 0; i < o.b.segs.length && i < o.sig.length; i++) o.b.segs[i].a = o.sig[i]; o.sig = null; }
    }
    // counts for taxis only if it went somewhere by itself: at least 2 units while perceiving food, at 0.02 units/s or more over its life
    traveller(o) { return o.taxLen >= 2 && o.age > 5 && o.path / o.age >= 0.02; }
    motile(g) { const p = A.development.develop(g, { maxSegs: this.maxSegs }); return p.segs.some(q => q.id > 0 && q.p.amp > 0.02 && q.p.muscle > 0.02); }
    log(text, id) { this.events.push({ t: Math.round(this.t), text, id }); if (this.events.length > 400) this.events.shift(); }
    // things that happen for the first time in this world (observation only; nothing is rewarded)
    note(o) {
      const F = this.firsts, f = o.full, once = (k, text) => { if (!F[k]) { F[k] = o.id; this.log(text, o.id); } };
      if (o.gen === 0) return;
      if (f.segs > 1) once('multi', '初の多体節（' + f.segs + ' 体節）');
      if (f.mouths.length > 1) once('mouths', '初の複数の口（' + f.mouths.length + ' 個）');
      if (f.eye > 0) once('eye', '初の眼');
      if (o.kind.split('/')[3] === '1') once('motile', '初の動く関節');
      if (o.kind.split('/')[4] === '1') once('cilia', '初の繊毛');
      if (f.segs > (F.maxSegs || 1)) { if (f.segs >= (F.maxSegs || 1) * 1.5 + 1) this.log('体節数の最大を更新：' + f.segs, o.id); F.maxSegs = f.segs; }
      if (f.V > (F.maxV || 0.5) * 1.5) { F.maxV = f.V; this.log('体積の最大を更新：' + f.V.toFixed(2), o.id); }
    }
    // keep only the living and their ancestors: that is the genealogy that still matters
    prune() {
      const keep = new Set();
      for (const o of this.bodies) { let n = this.tree.get(o.id); while (n && !keep.has(n.id)) { keep.add(n.id); n = this.tree.get(n.parent); } }
      for (const id of this.tree.keys()) if (!keep.has(id)) { this.tree.delete(id); this.pruned++; }
    }
    ancestors(id) { const out = []; let n = this.tree.get(id); while (n) { out.push(n); n = this.tree.get(n.parent); } return out; }
    // dissolved food at a point, interpolated between cell centres (so a body can, in principle, tell one side from the other)
    // What bodies leak spreads through the water and fades. Every living body leaks where it is, in proportion to its resting metabolism.
    stepScent(dt) {
      const { cols, rows } = this, k = this.nutrientDiffuse, keep = 1 - this.scentDecay * dt;
      for (const o of this.bodies) { const i = this.cellAt(o.cx, clamp(o.cy, 0, this.H - 0.01)), e = this.scentRate * o.prof.basal * dt; this.scA[i] += e * o.g.odor; this.scB[i] += e * (1 - o.g.odor); }
      for (const key of ['scA', 'scB']) {
        const a = this[key], b = this.sc2;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const i = y * cols + x, l = y * cols + (x + cols - 1) % cols, rr = y * cols + (x + 1) % cols, u = y ? i - cols : i, d = y < rows - 1 ? i + cols : i;
          b[i] = (a[i] + k * (a[l] + a[rr] + a[u] + a[d] - 4 * a[i])) * keep;
        }
        this[key] = b; this.sc2 = a;
      }
    }
    nutAt(x, y, field) {
      const c = this.cell, fx = x / c - 0.5, fy = clamp(y / c - 0.5, 0, this.rows - 1), x0 = Math.floor(fx), y0 = Math.min(this.rows - 2, Math.floor(fy)), tx = fx - x0, ty = fy - y0, n = this.cols, N = field || this.nut;
      const a = ((x0 % n) + n) % n, b = (a + 1) % n, r0 = Math.max(0, y0) * n, r1 = Math.max(0, y0 + 1) * n;
      return (N[r0 + a] * (1 - tx) + N[r0 + b] * tx) * (1 - ty) + (N[r1 + a] * (1 - tx) + N[r1 + b] * tx) * ty;
    }
    cellAt(x, y) { const c = Math.floor(((x % this.W) + this.W) % this.W / this.cell), r = clamp(Math.floor(y / this.cell), 0, this.rows - 1); return r * this.cols + c; }
    flowAt(x, y) {
      if (this.regions) { const k = this.flow * this.hFlow[this.cellAt(x, clamp(y, 0, this.H - 0.01))]; return [k * Math.sin(TAU * (y / this.H * 1.5 + this.t / 180)), 0.5 * k * Math.sin(TAU * (x / 160 * 2 + this.t / 130))]; }
      if (y >= this.yBottom) return [0, 0];
      const f = this.flow, k = clamp((this.yBottom - y) / 8, 0, 1);
      return [f * k * Math.sin(TAU * (y / this.yBottom * 1.5 + this.t / 180)), f * 0.5 * k * Math.sin(TAU * (x / this.W * 2 + this.t / 130))];
    }
    // choose a grain class so that each class receives its share of ENERGY (not of count)
    pick(sizes, share) {
      const w = sizes.map((z, i) => (share ? share[i] : 1 / sizes.length) / (z * z * z)); let u = this.rand() * w.reduce((a, b) => a + b, 0), i = 0;
      while (i < w.length - 1 && u > w[i]) { u -= w[i]; i++; } return i;
    }
    addFood(x, y, size, e, fixed, life) { this.food.push({ x: ((x % this.W) + this.W) % this.W, y: clamp(y, 0.5, this.H - 0.5), size, e, fixed, die: this.t + life }); }

    stepFood(dt) {
      const r = this.rand;
      if (this.regions) return this.stepFoodMap(dt);
      // drifting grains appear inside moving patches
      this.grainDebt = (this.grainDebt || 0) + this.grainRate * dt;
      while (this.grainDebt > 0) {
        const i = this.pick(this.grainSizes, this.grainShare);
        const size = this.grainSizes[i], e = this.grainEnergy * size * size * size, p = this.patch[r.int(this.patch.length)], a = r() * TAU, d = Math.sqrt(r()) * this.patchRadius;
        this.addFood(p.x + Math.cos(a) * d, clamp(p.y + Math.sin(a) * d, 1, this.yBottom - 1), size, e, false, this.grainLife); this.grainDebt -= e;
      }
      this.bottomDebt = (this.bottomDebt || 0) + this.bottomRate * dt;
      while (this.bottomDebt > 0) { const size = this.bottomSize[this.pick(this.bottomSize, null)], e = this.grainEnergy * size * size * size; this.addFood(r() * this.W, this.yBottom + 1 + r() * (this.H - this.yBottom - 2), size, e, true, this.bottomLife); this.bottomDebt -= e; }
      for (const p of this.patch) { p.a += (r() - 0.5) * 0.3; p.x = ((p.x + Math.cos(p.a) * 0.6 * dt) % this.W + this.W) % this.W; p.y = clamp(p.y + Math.sin(p.a) * 0.6 * dt, 6, this.yBottom - 6); }
      for (const c of this.grid) c.length = 0;
      // drifting grains are jostled in turns, a quarter of them each step for four steps' worth: the same spreading, a quarter of the work
      const every = this.jostleEvery; let n = 0; const ph = this.tick % every, dt4 = dt * every, jit = this.jitter * Math.sqrt(dt4);
      for (let i = 0; i < this.food.length; i++) {
        const f = this.food[i];
        if (f.e <= 0 || f.die < this.t) continue;
        if (!f.fixed && i % every === ph) { const [vx, vy] = this.flowAt(f.x, f.y); f.x = ((f.x + vx * dt4 + (r() + r() + r() - 1.5) * 2 * jit) % this.W + this.W) % this.W; f.y = clamp(f.y + (vy + this.sink) * dt4 + (r() + r() + r() - 1.5) * 2 * jit, 0.5, this.H - 0.5); if (f.y >= this.yBottom) f.fixed = true; }
        this.food[n++] = f; this.grid[this.cellAt(f.x, f.y)].push(f);
      }
      this.food.length = n;
      if (this.tick % 6 === 0) { // dissolved food regrows and spreads
        const { nut, nut2, cols, rows } = this, k = this.nutrientDiffuse, g = this.nutrientRegrow * dt * 6;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const i = y * cols + x, l = y * cols + (x + cols - 1) % cols, rr = y * cols + (x + 1) % cols, u = y ? i - cols : i, d = y < rows - 1 ? i + cols : i;
          nut2[i] = nut[i] + k * (nut[l] + nut[rr] + nut[u] + nut[d] - 4 * nut[i]) + g * (this.nutrientCap - nut[i]);
        }
        this.nut = nut2; this.nut2 = nut;
      }
    }

    // Food in a mapped world: each region is supplied in its own way; grains then drift, are jostled and settle by the rules of wherever they are.
    stepFoodMap(dt) {
      const r = this.rand;
      for (const q of this.regions) {
        const g = q.grains; q.debt += g.rate * dt;
        while (q.debt > 0) {
          const size = g.sizes[this.pick(g.sizes, g.share)], e = this.grainEnergy * size * size * size; let x, y;
          if (q.patch.length) { const p = q.patch[r.int(q.patch.length)], a = r() * TAU, d = Math.sqrt(r()) * g.radius; x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d; }
          else { x = q.x0 + r() * (q.x1 - q.x0); y = 1 + r() * (this.H - 2); }
          const fixed = g.settle >= 1; this.addFood(x, y, size, e, fixed, fixed ? this.bottomLife : this.grainLife); q.debt -= e;
        }
        for (const p of q.patch) { p.a += (r() - 0.5) * 0.3; p.x = clamp(p.x + Math.cos(p.a) * 0.6 * dt, q.x0 + g.radius, q.x1 - g.radius); p.y = clamp(p.y + Math.sin(p.a) * 0.6 * dt, 8, this.H - 8); }
      }
      for (const c of this.grid) c.length = 0;
      let n = 0; const sq = Math.sqrt(dt);
      for (let i = 0; i < this.food.length; i++) {
        const f = this.food[i];
        if (f.e <= 0 || f.die < this.t) continue;
        let ci = this.cellAt(f.x, f.y);
        if (!f.fixed) {
          const [vx, vy] = this.flowAt(f.x, f.y), jit = this.jitter * this.hJit[ci] * sq;
          f.x = ((f.x + vx * dt + (r() + r() + r() - 1.5) * 2 * jit) % this.W + this.W) % this.W; f.y = clamp(f.y + vy * dt + (r() + r() + r() - 1.5) * 2 * jit, 0.5, this.H - 0.5);
          ci = this.cellAt(f.x, f.y); const st = this.hSettle[ci]; if (st > 0 && r() < st * dt) f.fixed = true;
        }
        this.food[n++] = f; this.grid[ci].push(f);
      }
      this.food.length = n;
      if (this.tick % 6 === 0) {
        const { nut, nut2, cols, rows } = this, k = this.nutrientDiffuse, g = this.nutrientRegrow * dt * 6;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const i = y * cols + x, l = y * cols + (x + cols - 1) % cols, rr = y * cols + (x + 1) % cols, u = y ? i - cols : i, d = y < rows - 1 ? i + cols : i;
          nut2[i] = nut[i] + k * (nut[l] + nut[rr] + nut[u] + nut[d] - 4 * nut[i]) + g * this.hRegrow[i] * (this.nutrientCap - nut[i]);
        }
        this.nut = nut2; this.nut2 = nut;
      }
    }
    sense(o) {
      const b = o.b, root = b.segs[0], R = o.prof.sense, fx = -root.dx, fy = -root.dy, hx = root.ax, hy = root.ay;
      const edible = o.prof.gape * 1.3;
      let sx = 0, sy = 0; const c0 = Math.floor((hx - R) / this.cell), c1 = Math.floor((hx + R) / this.cell), r0 = Math.max(0, Math.floor((hy - R) / this.cell)), r1 = Math.min(this.rows - 1, Math.floor((hy + R) / this.cell));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) for (const f of this.grid[r * this.cols + ((c % this.cols) + this.cols) % this.cols]) {
        let dx = f.x - hx; if (dx > this.W / 2) dx -= this.W; else if (dx < -this.W / 2) dx += this.W;
        if (f.size > edible) continue; // it only notices what it could swallow
        const dy = f.y - hy, d2 = dx * dx + dy * dy; if (d2 > R * R) continue;
        const w = f.e / (d2 + 1), d = Math.sqrt(d2) + 1e-6; sx += w * dx / d; sy += w * dy / d;
      }
      const m = Math.sqrt(sx * sx + sy * sy), k = m / (m + 0.2) / (m + 1e-9), ahead = (sx * fx + sy * fy) * k, left = (-sx * fy + sy * fx) * k;
      o.noise += (this.rand.gauss() - o.noise * 0.3) * 0.3; o.wander += this.rand.gauss() * 0.15;
      // taxis: over the last interval, how much of its own movement went towards the food it perceived then
      if (o.seen && Math.abs(o.cx - o.sx) < 5) { const fl = this.flowAt(o.cx, o.cy), mx = o.cx - o.sx - fl[0] * o.sdt, my = o.cy - o.sy - fl[1] * o.sdt, d = Math.sqrt(mx * mx + my * my); o.taxDot += mx * o.seen[0] + my * o.seen[1]; o.taxLen += d; o.taxN++; }
      o.seen = m > 1e-6 ? [sx / m, sy / m] : null; o.sx = o.cx; o.sy = o.cy; o.sdt = 5 * this.dt;
      // ablation for experiments: this body, or this whole world, gets no information about where food is
      const cut = o.blind || this.blind;
      const inp = [1, cut ? 0 : ahead, cut ? 0 : left, 1 - o.E / o.prof.Emax, o.noise], w = o.g.brain, out = [0, 0, 0];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) out[j] += w[j * 5 + i] * inp[i];
      const toFood = Math.atan2(-left, -ahead), g = m > 1e-6 && !cut ? sig(out[2] * 2 + 1) : 0; // angle in the root's own frame
      b.cmd.drive = sig(out[0]); b.cmd.turn = Math.tanh(out[1]); b.cmd.heading = wrapPi(o.wander + g * wrapPi(toFood - o.wander));
    }

    step() {
      const dt = this.dt, C = A.organs.C, P = A.physics;
      this.stepFood(dt);
      if (this.scent && this.tick % 6 === 0) this.stepScent(dt * 6);
      const born = [];
      for (const o of this.bodies) {
        const b = o.b, pr = o.prof;
        const ground = this.regions ? this.hGround[this.cellAt(o.cx, clamp(o.cy, 0, this.H - 0.01))] === 1 : o.cy >= this.yBottom, fl = this.flowAt(o.cx, o.cy);
        b.env.ground = ground; b.env.flowX = fl[0]; b.env.flowY = fl[1]; if (this.regions) b.env.gravity = 4 * this.hWeight[this.cellAt(o.cx, clamp(o.cy, 0, this.H - 0.01))];
        if ((this.tick + o.id) % 5 === 0) this.sense(o);
        if (b.hasCircuit && !o.passive) { // each wired segment tastes the water where it is; the circuit does the rest
          const taste = this.taste, cut = o.numb || this.numb, segs = b.segs;
          for (let i = 0; i < segs.length; i++) taste[i] = cut || !segs[i].circ ? 0.5 : this.nutAt((segs[i].ax + segs[i].bx) * 0.5, (segs[i].ay + segs[i].by) * 0.5) / this.nutrientCap;
          let smA = null, smB = null;
          if (this.scent) { // and what bodies have leaked there
            smA = this.smA; smB = this.smB; const off = o.anosmic || this.anosmic;
            for (let i = 0; i < segs.length; i++) { const q = segs[i]; if (off || !q.circ) { smA[i] = smB[i] = 0; continue; } const x = (q.ax + q.bx) * 0.5, y = (q.ay + q.by) * 0.5; smA[i] = this.nutAt(x, y, this.scA); smB[i] = this.nutAt(x, y, this.scB); }
          }
          b.nerveUse += A.neural.local(b, taste, 1 - o.E / pr.Emax, smA, smB) * dt;
        }
        if (o.passive) { if (!ground) for (let k = 0; k < b.np; k++) { b.x[k] += fl[0] * dt; b.y[k] += fl[1] * dt; } P.pose(b); }
        else P.step(b, dt, this.substeps);
        if (!P.finite(b)) { o.dead = 'broken'; continue; }
        let c = P.com(b);
        if (c[0] < 0 || c[0] >= this.W) { const s = c[0] < 0 ? this.W : -this.W; for (let k = 0; k < b.np; k++) b.x[k] += s; c[0] += s; P.pose(b); }
        if (c[1] < 2 || c[1] > this.H - 2) { const push = (c[1] < 2 ? 2 - c[1] : this.H - 2 - c[1]) * 0.5; for (let k = 0; k < b.np; k++) { b.y[k] += push; b.vy[k] *= 0.5; } c[1] += push; P.pose(b); }
        // own travel: displacement with the water's drift removed. A body resting on a bottom is not carried by the water,
        // so nothing is removed there; a body with nothing to move itself with has travelled nowhere by itself.
        { const jx = c[0] - o.cx, jy = c[1] - o.cy, ux = ground ? 0 : fl[0] * dt, uy = ground ? 0 : fl[1] * dt; if (!o.passive && jx * jx + jy * jy < 25) o.path += Math.sqrt((jx - ux) * (jx - ux) + (jy - uy) * (jy - uy)); o.cx = c[0]; o.cy = c[1]; }
        // income: skin
        for (let i = 0; i < b.segs.length; i++) {
          const a = pr.absorb[i]; if (a <= 0) continue;
          const s = b.segs[i], ci = this.cellAt((s.ax + s.bx) / 2, clamp((s.ay + s.by) / 2, 0, this.H - 0.01)), take = Math.min(this.nut[ci] * 0.5, C.osm * a * this.nut[ci] / this.nutrientCap * dt);
          this.nut[ci] -= take; o.E += take; o.absorbed += take;
        }
        // income: mouth -> gut
        for (const m of pr.mouths) {
          const s = b.segs[m.seg], ci = this.cellAt(s.bx, clamp(s.by, 0, this.H - 0.01));
          for (const f of this.grid[ci]) {
            if (f.e <= 0 || f.size > m.gape * 1.3 || o.G + f.e > pr.gutCap) continue;
            let dx = f.x - s.bx; if (dx > this.W / 2) dx -= this.W; else if (dx < -this.W / 2) dx += this.W;
            if (Math.sqrt(dx * dx + (f.y - s.by) * (f.y - s.by)) < m.gape + f.size * 0.5) { o.G += f.e; o.eaten += f.e; this.counts.eaten += f.e; f.e = 0; }
          }
        }
        const dg = Math.min(o.G, pr.digest * dt); o.G -= dg; o.E += dg * pr.eta;
        // spending
        o.E -= pr.basal * dt + C.work * (b.work - o.work0) + C.ciliaWork * (b.ciliaUse - o.cil0) + C.spike * (b.nerveUse - o.nerve0); o.work0 = b.work; o.cil0 = b.ciliaUse; o.nerve0 = b.nerveUse;
        if (o.E > pr.Emax) o.E = pr.Emax;
        o.age += dt;
        if (o.E <= 0) { o.dead = 'starved'; continue; }
        if (o.age > o.life) { o.dead = 'aged'; continue; }
        if (o.stage < 1) { // growth: surplus is set aside until it pays for the next piece of body
          if (o.E > C.growReserve * pr.Emax) { const put = Math.min(o.E - C.growReserve * pr.Emax, pr.basal * 6 * dt + 0.02 * dt); o.E -= put; o.grow += put; }
          if (o.nextCost == null) { o.nextStage = Math.min(1, o.stage + 0.14); o.nextCost = A.organs.profile(A.development.develop(o.g, { stage: o.nextStage, maxSegs: this.maxSegs })).buildCost - pr.buildCost; }
          if (o.grow >= o.nextCost) { o.grow -= o.nextCost; o.stage = o.nextStage; o.nextCost = null; const root = b.segs[0]; this.form(o, o.cx, o.cy, Math.atan2(root.dy, root.dx)); }
        } else if (pr.gonadRate > 0 && o.E > C.reproReserve * pr.Emax) {
          const put = Math.max(0, Math.min(pr.gonadRate * dt, o.E - C.reproReserve * pr.Emax, o.eggCost - o.egg)); o.E -= put; o.egg += put;
          if (o.egg >= o.eggCost) {
            if (this.bodies.length + born.length >= this.cap) this.counts.blocked++;
            else { o.egg -= o.eggCost; o.kids++; born.push(o); }
          }
        }
      }
      for (const o of born) {
        const g = this.rand() < this.mutation ? A.genome.mutate(o.g, this.rand, undefined, this.scent) : A.genome.copy(o.g);
        // born in a world under selection: 'evolved' only if the whole ancestry is; a line started from a designed or explored genome stays marked
        g.origin = o.g.origin === 'primordial' || o.g.origin === 'evolved' ? 'evolved' : 'evolved-from-artificial';
        const a = this.rand() * TAU, d = Math.sqrt(o.prof.V) + 1; this.spawn(g, o.cx + Math.cos(a) * d, clamp(o.cy + Math.sin(a) * d, 2, this.H - 2), g.birth, o); this.counts.births++;
      }
      if (this.bodies.some(o => o.dead)) {
        for (const o of this.bodies) if (o.dead) {
          this.counts[o.dead]++;
          const cl = this.clades.get(o.clade);
          if (cl) {
            cl.alive--; cl.dead++; cl.causes[o.dead] = (cl.causes[o.dead] || 0) + 1; cl.eaten += o.eaten; cl.absorbed += o.absorbed; cl.path += o.path; cl.lived += o.age; cl.kids += o.kids;
            if (cl.alive === 0) { cl.ended = this.t; if (cl.members <= 2) cl.g = null; /* a plan that one or two bodies ever had keeps its numbers, not its genome: these are most of the record's size */ const k = cl.kind.split('/'); if (cl.members >= 5 || k[3] === '1' || k[4] === '1' || k[2] === '1') this.log('体制の絶滅：' + k[0] + '体節・口' + k[1] + (k[2] === '1' ? '・眼' : '') + (k[3] === '1' ? '・関節' : '') + (k[4] === '1' ? '・繊毛' : '') + '（' + cl.members + '匹、' + (cl.genMax - cl.gen0 + 1) + '世代、' + Math.round(this.t - cl.born) + '秒）', cl.id); }
          }
          const node = this.tree.get(o.id); if (node) { node.died = this.t; node.cause = o.dead; node.life = { eaten: o.eaten, absorbed: o.absorbed, path: o.path, kids: o.kids, stage: o.stage }; }
          let e = C.carrion * (o.prof.buildCost * 0.5 + Math.max(0, o.E) + o.G);
          while (e > 0.05) { const size = 0.25 + this.rand() * 0.25, pe = Math.min(e, this.grainEnergy * size ** 3); this.addFood(o.cx + this.rand.gauss() * 0.5, o.cy + this.rand.gauss() * 0.5, size, pe, this.isGround(o.cx, o.cy), this.grainLife); e -= pe; }
        }
        this.bodies = this.bodies.filter(o => !o.dead);
      }
      this.t += dt; this.tick++;
      if (this.tick % 900 === 0) {
        this.prune();
        if (this.clades.size > 4000) { let drop = this.clades.size - 3500; for (const [id, c] of this.clades) { if (drop <= 0) break; if (c.ended != null && c.members <= 2) { this.clades.delete(id); drop--; this.cladesDropped = (this.cladesDropped || 0) + 1; } } }
        const c = this.census(); this.history.push(c); if (this.history.length > 1500) this.history.splice(0, 300);
        const lines = new Set(this.bodies.map(o => o.line)); for (const k of this.liveLines || []) if (!lines.has(k)) this.log('系統 ' + k + ' が絶滅');
        this.liveLines = lines;
      }
    }

    // A save holds everything the next step depends on: pose, velocities, rhythm phase, nerve signals and sensory memory of
    // every body, the food, the water, the random state. A restored world continues exactly as the saved one would have.
    save() {
      return {
        format: 'alife2-world-1', exact: 1, opt: Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, this[k]])), t: this.t, tick: this.tick, nextId: this.nextId, rng: this.rand.state(),
        nut: Array.from(this.nut), scA: this.scent ? Array.from(this.scA) : undefined, scB: this.scent ? Array.from(this.scB) : undefined, food: this.food.filter(f => f.e > 0).map(f => [f.x, f.y, f.size, f.e, f.fixed ? 1 : 0, f.die]),
        patch: this.patch, grainDebt: this.grainDebt || 0, bottomDebt: this.bottomDebt || 0, liveLines: this.liveLines ? [...this.liveLines] : null, regionState: this.regions ? this.regions.map(q => ({ debt: q.debt, patch: q.patch })) : null,
        counts: this.counts, events: this.events, history: this.history, firsts: this.firsts, pruned: this.pruned, tree: [...this.tree.values()],
        // body plans that only one or two bodies ever had keep their numbers but not their genome (worlds begun before this rule still carry them)
        clades: [...this.clades.values()].map(c => c.ended != null && c.members <= 2 && c.g ? Object.assign({}, c, { g: null }) : c), cladesDropped: this.cladesDropped || 0,
        bodies: this.bodies.map(o => { const b = o.b, r = b.segs[0]; return { id: o.id, stage: o.stage, age: o.age, E: o.E, G: o.G, egg: o.egg, grow: o.grow, x: o.cx, y: o.cy, angle: Math.atan2(r.dy, r.dx), life: o.life, eaten: o.eaten, absorbed: o.absorbed, kids: o.kids, path: o.path, born: o.born, home: o.home,
          sig: b.hasCircuit ? b.segs.map(q => q.a) : undefined,
          st: { x: Array.from(b.x), y: Array.from(b.y), vx: Array.from(b.vx), vy: Array.from(b.vy), t: b.t, work: b.work, heat: b.heat, cilia: b.ciliaUse, nerve: b.nerveUse, om: b.om || 0, th: b.th || 0, loc: b.loc ? Array.from(b.loc) : null, inertia: b.inertia == null ? null : b.inertia, carried: b.carried == null ? null : b.carried, cmd: b.cmd,
            segs: b.segs.map(q => [q.a, q.m, q.cd, q.ct, q.press, q.target, q.act, q.osc, q.dir, q.mA == null ? null : q.mA, q.mB == null ? null : q.mB]), noise: o.noise, wander: o.wander, seen: o.seen || null, sx: o.sx, sy: o.sy, sdt: o.sdt || 0, taxDot: o.taxDot, taxLen: o.taxLen, taxN: o.taxN, work0: o.work0, cil0: o.cil0, nerve0: o.nerve0, nextCost: o.nextCost == null ? null : o.nextCost, nextStage: o.nextStage == null ? null : o.nextStage } }; })
      };
    }
    // Older saves (without `exact`) lack pose, velocities, rhythm phase, sensory memory and birth region: bodies then restart from rest.
    static restore(d) {
      if (!d || d.format !== 'alife2-world-1') throw new Error('not an ALIFE 2.0 world');
      const w = new World(d.opt); w.t = d.t; w.tick = d.tick; w.nut.set(d.nut); if (w.scent && d.scA) { w.scA.set(d.scA); w.scB.set(d.scB); } w.patch = d.patch; w.counts = d.counts; w.events = d.events; w.history = d.history; w.firsts = d.firsts; w.pruned = d.pruned || 0; w.clades = new Map((d.clades || []).map(c => [c.id, c])); w.cladesDropped = d.cladesDropped || 0;
      for (const f of d.food) w.food.push({ x: f[0], y: f[1], size: f[2], e: f[3], fixed: !!f[4], die: d.exact ? f[5] : w.t + f[5] });
      if (d.exact) { w.grainDebt = d.grainDebt; w.bottomDebt = d.bottomDebt; if (d.liveLines) w.liveLines = new Set(d.liveLines); if (d.regionState && w.regions) d.regionState.forEach((q, i) => { w.regions[i].debt = q.debt; w.regions[i].patch = q.patch; }); }
      const nodes = new Map(d.tree.map(n => [n.id, n]));
      for (const s of d.bodies) {
        const n = nodes.get(s.id), o = { id: s.id, g: n.g, stage: s.stage, age: s.age, G: s.G, egg: s.egg, grow: s.grow, dead: false, noise: 0, wander: 0, path: s.path, eaten: s.eaten, absorbed: s.absorbed, kids: s.kids, parent: n.parent, line: n.line, gen: n.gen, born: s.born, kind: n.kind, clade: n.clade, sig: s.sig || null, home: s.home || 0, taxDot: 0, taxLen: 0, taxN: 0 };
        const baby = A.organs.profile(A.development.develop(o.g, { stage: o.g.birth, maxSegs: w.maxSegs })), C = A.organs.C;
        o.full = A.organs.profile(A.development.develop(o.g, { maxSegs: w.maxSegs })); o.life = s.life; o.eggCost = C.eggFixed + baby.buildCost + C.eggReserve * baby.Emax; o.eggE = C.eggReserve * baby.Emax;
        w.form(o, s.x, s.y, s.angle); o.E = s.E;
        const st = s.st;
        if (st) { // put the body back exactly as it was
          const b = o.b; b.x.set(st.x); b.y.set(st.y); b.vx.set(st.vx); b.vy.set(st.vy); b.t = st.t; b.work = st.work; b.heat = st.heat; b.ciliaUse = st.cilia; b.nerveUse = st.nerve; b.carried = st.carried == null ? undefined : st.carried; b.cmd = st.cmd;
          if (b.rigid && st.loc) { b.om = st.om; b.th = st.th; b.loc.set(st.loc); b.inertia = st.inertia; } // the same numbers, not the same quantities recomputed in another orientation
          st.segs.forEach((v, i) => { const q = b.segs[i]; q.a = v[0]; q.m = v[1]; q.cd = v[2]; q.ct = v[3]; q.press = v[4]; q.target = v[5]; q.act = v[6]; q.osc = v[7]; q.dir = v[8]; if (v[9] != null) q.mA = v[9]; if (v[10] != null) q.mB = v[10]; });
          A.physics.pose(b); o.cx = s.x; o.cy = s.y;
          Object.assign(o, { noise: st.noise, wander: st.wander, seen: st.seen, sx: st.sx, sy: st.sy, sdt: st.sdt, taxDot: st.taxDot, taxLen: st.taxLen, taxN: st.taxN, work0: st.work0, cil0: st.cil0, nerve0: st.nerve0, nextCost: st.nextCost, nextStage: st.nextStage });
        }
        w.bodies.push(o);
      }
      w.tree = nodes; w.nextId = d.nextId; w.rand.state(d.rng); return w;
    }
    census() {
      const n = this.bodies.length, mean = f => n ? this.bodies.reduce((a, o) => a + f(o), 0) / n : 0;
      const adultSegs = o => o.full.segs;
      const segs = this.bodies.map(adultSegs), lines = new Set(this.bodies.map(o => o.line));
      return {
        t: Math.round(this.t), n, lines: lines.size, gen: mean(o => o.gen), segMean: n ? segs.reduce((a, b) => a + b, 0) / n : 0, segMax: n ? Math.max(...segs) : 0,
        multi: n ? segs.filter(s => s > 1).length / n : 0, volume: mean(o => o.prof.V), speed: mean(o => o.age > 5 ? o.path / o.age : 0),
        mouthShare: mean(o => o.eaten + o.absorbed > 0 ? o.eaten / (o.eaten + o.absorbed) : 0), eyes: mean(o => o.prof.eye > 0 ? 1 : 0),
        bottom: mean(o => this.isGround(o.cx, o.cy) ? 1 : 0),
        // nerve circuits: share of bodies that are wired at all, mean wiring, and share whose taste reaches cilia or a joint
        wired: mean(o => o.full.wiring > 0.2 ? 1 : 0), wiring: mean(o => o.full.wiring), tasteWired: mean(o => o.g.parts.some(p => Math.abs(p.nC) > 0.2 && (Math.abs(p.mCil) > 0.1 || Math.abs(p.mJoint) > 0.1)) ? 1 : 0),
        // per region: who lives there, what they are like, and how many were born elsewhere
        regions: this.regions ? this.regions.map(q => { const l = this.bodies.filter(o => this.regionAt(o.cx) === q.id), m = f => l.length ? l.reduce((a, o) => a + f(o), 0) / l.length : 0; return { name: q.name, n: l.length, seg: m(o => o.full.segs), cilia: m(o => o.full.cilia > 0.05 ? 1 : 0), speed: m(o => o.age > 5 ? o.path / o.age : 0), sessile: m(o => o.full.mouths.length >= 3 && (o.age > 5 ? o.path / o.age : 0) < 0.01 ? 1 : 0), volume: m(o => o.prof.V), mouth: m(o => o.eaten + o.absorbed > 0 ? o.eaten / (o.eaten + o.absorbed) : 0), immigrants: m(o => o.home !== q.id ? 1 : 0), lines: new Set(l.map(o => o.line)).size }; }) : null, cilia: mean(o => o.full.cilia > 0.05 ? 1 : 0), mouths: mean(o => o.full.mouths.length), sense: mean(o => o.full.sense),
        // taxis: of the distance bodies moved by themselves while perceiving food, the fraction that went towards it.
        // Weighted by distance, and only bodies that really travelled count: a body that merely trembles says nothing.
        taxis: (() => { const l = this.bodies.filter(o => this.traveller(o)); const len = l.reduce((a, o) => a + o.taxLen, 0); return len ? l.reduce((a, o) => a + o.taxDot, 0) / len : 0; })(), taxisN: this.bodies.filter(o => this.traveller(o)).length,
        turnGain: mean(o => Math.abs(o.g.brain[7])), sessileMulti: mean(o => o.full.mouths.length >= 3 && (o.age > 5 ? o.path / o.age : 0) < 0.01 ? 1 : 0), food: this.food.length, nutrient: this.nut.reduce((a, b) => a + b, 0) / this.nut.length, ...this.counts
      };
    }
  }
  A.engine = { World, DEFAULTS };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
