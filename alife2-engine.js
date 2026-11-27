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
  if (typeof require !== 'undefined' && !A.rules) require('./alife2-rules.js');
  if (typeof require !== 'undefined' && !A.organs) { require('./alife2-genome.js'); require('./alife2-development.js'); require('./alife2-neural.js'); require('./alife2-physics.js'); require('./alife2-organs.js'); }
  const TAU = Math.PI * 2, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const wrapPi = x => { x = (x + Math.PI) % TAU; if (x < 0) x += TAU; return x - Math.PI; };
  const sig = x => 1 / (1 + Math.exp(-x));
  // ---- sound (world option `sound`) ----
  // Sound is energy in the water, kept as six fields, one for each band of pitch from low (0) to high (5). What is made at a place is added to the
  // field there; every tick each field spreads to the neighbouring cells and fades. Low sound fades slowly, so it carries far and lingers; high sound
  // is gone within a few body lengths and a fraction of a second. Fields of different makers simply add up. The water itself is never silent.
  // Nothing in a field says who made a sound, where, or why.
  const SND = {
    B: 6, D: 0.22,                                   // bands; share that moves to each of the four neighbouring cells per tick
    fade: [0.012, 0.019, 0.03, 0.048, 0.076, 0.12],  // share lost per tick, low band to high: reach about 17 units down to about 5, lingering about 2.8 s down to 0.3 s
    amb: [3e-5, 2.4e-5, 1.8e-5, 1.2e-5, 8e-6, 5e-6], // the water's own noise per tick (more where there is current), low band to high
    bursts: 3, burst: 0.02,                          // and a few random crackles per tick, anywhere, in any band
    // sound that a body cannot help making, per unit of what it does (all of it far fainter than a voice):
    cilia: 0.5,     // per unit of cilia beating
    muscle: 0.02,   // per unit of muscle work
    hit: 6,         // per unit of energy of two bodies pushing on each other
    tear: 60,       // per unit volume of tissue torn
    scrape: 4,      // per unit of body volume dragged one unit over a bottom
    crunch: 0.3,    // per unit of food taken in through a mouth
    voice: 6,       // a voice: per unit volume of sound-making tissue per tick at full strength
    ear: 6          // an ear's reading: loudness times this, times its hearing tissue
  };
  const MOUTH = { ax: 0, ay: 0, bx: 0, by: 0 }; // (solid) a mouth as a point, for finding the nearest place on another body's segment
  // (keep) what a segment's nerves hold from one moment to the next: its signal and what it does to cilia, joint and mouth; its rhythm; what each sense reads and has
  // adapted to (taste A and B, sight, hearing — for the single signal and for neurons); the trace of a swallow; what drives its voice
  const MIND = ['a', 'm', 'cd', 'ct', 'mo', 'osc', 'dir', 'mA', 'mB', 'mV', 'v', 'nA', 'nB', 'nV', 'mE', 'nE', 'ate', 'nj', 'np', 'vo', 'vq'];
  // the pitch of a sound a body cannot help making follows the size of what makes it: small things sound high
  const pitchOfR = r => clamp(0.5 - Math.log2(Math.max(r, 1e-3) / 0.25) / 5, 0, 1);
  const b64 = f => { const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength); if (typeof Buffer !== 'undefined') return Buffer.from(u).toString('base64'); let t = ''; for (let i = 0; i < u.length; i += 8192) t += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(t); };
  const unb64 = t => { let u; if (typeof Buffer !== 'undefined') u = new Uint8Array(Buffer.from(t, 'base64')); else { const q = atob(t); u = new Uint8Array(q.length); for (let i = 0; i < q.length; i++) u[i] = q.charCodeAt(i); } return new Float32Array(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength)); };

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
    anosmic: 0,                           // control experiment: no segment in this world can sense what bodies leak
    vision: 0,                            // 1 = a segment with eye tissue is a receptor that looks one way and sees coloured things: food grains and other bodies alike. 0 = the worlds before this existed
    foodHue: 50,                          // the colour of food grains (degrees). Bodies have the colour their genome gives them
    sightless: 0,                         // control experiment: no eye in this world reports anything
    nerve2: 0,                            // 1 = parts can carry several neurons each, wired by where things are on the body (own senses; neurons in the same segment, the parent,
                                          // the children, the mirror twin), acting on the segment's cilia, joint and mouth. They arise, duplicate with their wiring, and vanish by mutation.
                                          // The older single signal per segment stays as it is.
    recycle: 0,                           // 1 = what bodies lose as matter goes back into the water where they are, as dissolved food: the part of a meal the gut does not
                                          // take up, reserve above what the body can hold, what a dead body or a lost egg does not leave as grains, and torn tissue that
                                          // is not food. Not returned: heat (upkeep, work, the fixed cost of an egg) and grains nobody ate. 0 = all of these simply vanish
    mutsplit: 0,                          // 1 = how often a lineage's births mutate (gene `mut`) and how wide the steps are (gene `mutW`) are two inherited genes, each 0.1..3 times
                                          //     the world's value. Both drift at every birth, by a step and at a rate that do not depend on them. How often the plan of the body
                                          //     changes follows from the first alone. (Under `metamut` one gene scaled the chance that a birth mutates, the chance of each change
                                          //     of plan within it, and the width of steps — so changes of plan went with its square — and it could only drift when a birth mutated.)
    metamut: 0,                           // 1 = how often and how strongly a lineage mutates is itself inherited and mutates (gene `mut`, 0.1..3 times the world's rate)
    nibble: 0,                            // 1 = a mouth that reaches a grain it cannot swallow whole (too big for it, or for the room left in its gut) tears pieces from it,
                                          // at the rate at which it tears tissue. 0 = the earlier rule: a grain is swallowed whole or not at all
    budget: 0,                            // 1 = an egg holds what its parent put into it, and the young is built from that with its own (mutated) genes: it develops as far
                                          // as the egg pays for (never past the stage its genes aim at), keeps what is left as yolk, and is stillborn if not even a bud can be made.
                                          // 0 = the earlier rule: the young is born at the stage and size its own genes describe, whatever the parent paid
    carry: 0,                             // 1 = when a body is rebuilt for growth, each segment keeps its nerve signal, what its senses had adapted to, and the body keeps its rhythm
                                          // (a segment is known by its address). 0 = the earlier rule: these start from nothing at every growth step
    brain: 0,                             // 1 (needs wire) = the nervous system can grow apart from the body. A part may carry up to 16 neurons instead of 4; a neuron can be wired
                                          // to the neuron of a given name in the root segment (r) or to the mean of that name over all the other segments (d), so a centre can gather
                                          // from the whole body and speak to all of it; mutation can copy a block of neurons from one part into another. Reach costs upkeep: a far
                                          // connection costs half its strength more per segment of depth (see organs C.far). Nothing here makes a brain: it only stops forbidding one.
    wire: 0,                              // 1 = neurons have names. A connection between neurons names the neuron it means, so removing or adding a neuron leaves every other
                                          //     connection where it was (a connection to a neuron that is gone reads nothing), and a new connection is made to a neuron that exists.
                                          //     0 = connections count places in the part's list: removing a neuron makes the connections to later ones read their neighbours instead,
                                          //     and three in four of new connections to a neuron of the same segment point at no neuron.
    wireLate: 0,                          // 1 = the stage of growth at which a part's circuit is built is inherited and mutates (part gene `nAt`, 0..1; absent or below the stage of birth =
                                          //     from birth, as before). Until a part's circuit is built, its segments carry no connections: they pay no upkeep for them, read no sense
                                          //     and drive nothing (cilia beat at their plain rate). From that stage on the circuit is whole and costs what it always cost. No new cost
                                          //     and no reward. 0 = every circuit is there from birth, and a newborn pays for it what the adult pays, whatever its size.
    wireEnds: 0,                          // 1 = a connection of a segment's circuit is made only where both of its ends are in that body and that world: none from a sense
                                          //     the segment lacks (no eye, no ear, no nerve tissue, a sense the world does not have), none to an effector it lacks (no cilia, no
                                          //     muscled joint, no mouth, no voice), none to a neighbour that is not there or carries no circuit. Such a connection could never
                                          //     change what the body does; with this rule it is not built and costs no upkeep. What bodies do is exactly as before; only what they
                                          //     pay changes. 0 = every connection the genes name is paid for, whether or not anything is at its other end.
    keep: 0,                              // 1 = a body keeps what its nerves hold through everything that rebuilds or moves it. When it is rebuilt for growth, every segment that was
                                          //     there before keeps its nerve signal, the activity of its neurons, the connections it has acquired, what each sense had adapted to
                                          //     (taste, smell, sight, hearing), the state of its mouth and its rhythm — and the body keeps its motion: its speed, its spin and the
                                          //     angles of its joints, instead of starting again at rest in the pose it was born with. The same holds when it moves to another island
                                          //     and when the population is moved to another map (there it lands at rest, but with its mind). Includes all of `carry`.
    audit: 0,                             // 1 = keep a ledger of all energy entering, leaving and changing form (counting only: nothing behaves differently)
    // How much of its own past the world keeps written down. These records are notes only: nothing in the world reads them, so the limits change no body and no number
    // of the world itself. Without limits a save grew for as long as the world ran (28 MB at 149,000 s), and so did the pause of every automatic save.
    recordPlans: 200,                     // extinct body plans that keep their genome: the half with the most members and the half that ended last. The others keep their numbers
    recordAge: 6000,                      // an ancestor that died longer ago than this many seconds keeps its genome only if its plan differed from its parent's, or it began a line
    recordSteps: 60,                      // ... and of those older ancestors whose plan differed, only the latest this many keep it
    genome2: 0,                           // 1 = the newer gene rules: a stretch of an axis can split into two parts without changing the body (and then mutate apart);
                                          // parts nothing leads to are dormant, can be linked in again, and decay slowly; only parts in use count against the limit; genes carry identities
    contact: 0,                           // 1 = bodies cannot pass through one another, and a mouth tears tissue from whatever body it touches. What is torn is lost to its owner:
                                          // that segment's muscle, gut, eye, cilia... work that much less. Nothing here knows hunter from hunted, kin from stranger
    cast: 0,                              // 1 = how far from itself a body lays its eggs is inherited and mutates (gene `cast`, 0..40 units of length added to the usual distance,
                                          //     starting at 0). 0 = every egg is laid beside its mother (her own size + 1), whatever she is. Nothing is paid for the throw and
                                          //     nothing rewards it: an egg thrown far lands in water its mother has not eaten down, or in a place her kind cannot live.
    pair: 0,                              // 1 = the two segments of a left-right pair appear at the same stage of growth. 0 = each segment appears in its turn, so a growing body has
                                          //     one of a pair before the other: one eye, one ear, cilia on one side (a quarter to a half of the stages a paired body grows through).
    solid: 0,                             // 1 = (where bodies touch) a body is a solid thing along its whole length. Each segment is a rod with rounded sides from its near end to
                                          //     its far end, not just a disc at its far end: two bodies meet wherever their segments come together, a mouth can reach the side of a
                                          //     segment, and a body cannot pass through itself (segments that do not overlap as the body is built push each other apart). The end of a
                                          //     joint's range is a stop. Tissue that has been torn away weighs nothing and catches no water. A segment torn through is cut off with
                                          //     everything beyond it: what is cut off becomes food where it is, and does not grow back.
    adhere: 0,                            // 1 (needs contact) = two more things happen where bodies touch. A pad pressed against another body grips it: it drags on it and
                                          // holds it close. And reserve seeps between touching bodies through bare surface, from the fuller to the emptier (skin and armour block it).
                                          // Nothing says what this is for: clinging, sharing, feeding young, stealing are all the same two rules
    sound: 0,                             // 1 = sound exists. Every body makes faint sound by what it does (beating cilia, working muscle, pushing on another body, tearing tissue,
                                          // dragging over a bottom, taking food in), at a pitch set by its size. A segment can grow hearing tissue (an ear: how loud the water is at
                                          // its outer end, over the pitches it is tuned to) and sound-making tissue (a voice, driven by its nerve circuit, costing energy for every
                                          // sound). Sound spreads, fades and adds up (see SND above). No sound has a meaning given to it.
    soundWork: 0,                         // 1 = the sound of beating cilia follows the work they do against the water (their thrust times the speed at which the body moves through
                                          //     the water), turned to sound as muscle work is. 0 = in proportion to the beating itself, as first calibrated — which made swimming by
                                          //     cilia by far the loudest thing in the water (about three quarters of all sound), louder than eating, striking or scraping.
                                          //     No new number: the thrust is the one the physics uses, the efficiency is the one muscle has.
    deaf: 0,                              // control experiment: no ear in this world hears anything
    mute: 0,                              // control experiment: no voice in this world makes a sound (bodies still make the sounds they cannot help making)
    soundLag: 0,                          // control experiment: ears hear the water as it was this many seconds ago (what is heard no longer follows what just happened)
    wave: 0, waveLength: 120, waveDepth: 0.8, // wave > 0 = richness travels: the regrowth of dissolved food and the supply of grains are multiplied by 1 + depth x sin, a wave of this
                                          // length that moves along the world once per `wave` seconds (so every place is rich and lean in turn, and the crest moves at length / wave).
                                          // The supply averaged over time is the same everywhere as without the wave; grains that would fall in lean water fall elsewhere instead.
    learn: 0,                             // 1 (needs nerve2) = a neuron's connections can change with use during life. Each connection has a heritable rate (0 = fixed, as before);
                                          // the change is rate x input x the neuron's activity, optionally only while one chosen input of the neuron is active, and it fades slowly.
                                          // What a body acquires is not inherited; the rates and the gate are.
    invest: 0,                            // 1 = how much reserve a mother puts into each egg is inherited and mutates (gene `yolk`, a share of what the young can hold; 0.5 without
                                          // this rule). Richer eggs cost more each, so fewer are laid; what the young cannot hold at once goes to its growth.
    mix: 0,                               // 1 (needs contact) = where two bodies touch bare surface to bare surface, each takes up the other's genetic material. The next egg a body
                                          // lays is then made from both genomes (genome.recombine) and the material is used up. Skin and armour let none through.
                                          // Nobody chooses a partner and no two kinds are forbidden to mix: what comes of a mixture is for selection to judge.
    noSeep: 0,                            // control experiment: bodies can grip, but no reserve passes between them
    noBite: 0,                            // control experiment: bodies touch and push, but mouths take nothing from them
    numbSkin: 0,                          // control experiment: no segment in this world feels being pushed or torn
    shore: 0                              // maps with regions: 0 = the floor begins as a step at a border (the worlds before this existed). >0 = over this width, centred on the border,
                                          // the weight a body rests on the floor with (and so its friction and what its pads can hold) rises smoothly from one region's value to the next
  };

  Object.assign(DEFAULTS, A.rules.defaults);

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
      this.counts = { births: 0, starved: 0, aged: 0, broken: 0, blocked: 0, eaten: 0, killed: 0, flesh: 0, torn: 0, stillborn: 0 };
      this.taste = new Float64Array(256);
      this.ledger = this.audit ? { rain: 0, regrow: 0, placed: 0, mutation: 0, recycled: 0, basal: 0, work: 0, cilia: 0, nerve: 0, digest: 0, clip: 0, eggFixed: 0, death: 0, expire: 0, bite: 0, growth: 0, stillborn: 0 } : null;
      this.grains = this.audit ? {} : null; // per size of grain: energy arrived, eaten, gone uneaten, and how much of it a mouth ever reached but could not take (too big for it / its gut was full)
      if (this.vision || this.contact) this.bgrid = Array.from({ length: this.cols * this.rows }, () => []);
      if (this.scent) { const n = this.cols * this.rows; this.scA = new Float32Array(n); this.scB = new Float32Array(n); this.sc2 = new Float32Array(n); this.smA = new Float64Array(256); this.smB = new Float64Array(256); }
      if (this.sound) this.soundInit();
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
    // With a sloping border (shore > 0): how much there is a floor at x (0..1), and the weight a body rests on it with.
    // Each is the region's own value, blended with the neighbouring region's across the border. Both are continuous in x.
    slope(x, weighted) {
      x = ((x % this.W) + this.W) % this.W; const R = this.regions, q = R[this.regionAt(x)], left = x - q.x0 < q.x1 - x, edge = left ? x - q.x0 : q.x1 - x;
      const v = r => r.ground ? (weighted ? (r.weight == null ? 1 : r.weight) : 1) : 0;
      if (edge >= this.shore / 2) return v(q);
      const nb = R[(q.id + (left ? R.length - 1 : 1)) % R.length], k = 0.5 + edge / this.shore; return v(q) * k + v(nb) * (1 - k);
    }
    // the first x at which the floor counts, for drawing a stepped border where the physics has it (cells belong to the region their centre is in)
    borderX(q) { return this.shore > 0 ? q.x1 : Math.ceil(q.x1 / this.cell - 0.5) * this.cell; }
    isGround(x, y) { return this.regions ? (this.shore > 0 ? this.slope(x, false) > 0.5 : this.hGround[this.cellAt(x, clamp(y, 0, this.H - 0.01))] === 1) : y >= this.yBottom; }
    seedWith(genome, n) { for (let i = 0; i < (n || this.founders); i++) this.spawn(A.genome.copy(genome), this.rand() * this.W, this.rand() * this.H, 1, null); }

    // Human intervention adds founders to this world, never resets or advances it.
    introduce(data, opt = {}) {
      const source = data && data.format === 'alife2-specimen-1' ? data : null;
      if (source) data = source.genome;
      if (!data || data.format !== 'alife2-genome-1' || !Number.isFinite(data.hue) || !Array.isArray(data.parts) || !data.parts.length || !Array.isArray(data.links) || data.parts.some(p => !p || typeof p !== 'object') || data.links.some(l => !l || typeof l !== 'object')) throw new Error('探索で保存した遺伝子 JSON を選んでください');
      const count = Number(opt.count == null ? 1 : opt.count), place = opt.place || 'random', age = opt.age || 'adult';
      if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new Error('投入数は 1〜1000 の整数で指定してください');
      if (!['random', 'center', 'ocean', 'bottom'].includes(place) || !['adult', 'juvenile'].includes(age)) throw new Error('投入条件が不正です');
      const g = A.genome.sanitize(A.genome.copy(data)); g.origin = 'artificial-introduced';
      const stage = age === 'adult' ? 1 : g.birth;
      // Validate development before changing world state. spawn owns bodies, genealogy and energy accounting.
      A.development.develop(g, { stage, maxSegs: this.maxSegs, pair: this.pair });
      let sites = null;
      if (place === 'ocean' || place === 'bottom') {
        sites = [];
        for (let y = this.cell / 2; y < this.H; y += this.cell) for (let x = this.cell / 2; x < this.W; x += this.cell) {
          const ground = this.isGround(x, y), ocean = this.regions ? this.regions[this.regionAt(x)].name === '外洋' && !ground : !ground;
          if (place === 'bottom' ? ground : ocean) sites.push([x, y]);
        }
        if (!sites.length) throw new Error('この世界には指定された投入場所がありません');
      }
      const center = opt.center || { x: this.W / 2, y: this.H / 2 };
      if (place === 'center' && (!Number.isFinite(center.x) || !Number.isFinite(center.y))) throw new Error('画面中央の座標が不正です');
      const group = { seed: this.seed, root: this.nextId, t: this.t, count, place, age };
      if (source) group.explorationRules = A.rules.normalize(source.rules);
      const got = [];
      for (let i = 0; i < count; i++) {
        const xy = sites ? sites[this.rand.int(sites.length)] : place === 'center' ? [((center.x % this.W) + this.W) % this.W, clamp(center.y, 2, this.H - 2)] : [this.rand() * this.W, 2 + this.rand() * (this.H - 4)];
        const o = this.spawn(A.genome.copy(g), xy[0], xy[1], stage, null), node = this.tree.get(o.id);
        o.introduction = node.introduction = group;
        o.line = node.line = group.root; this.clades.get(o.clade).line = group.root;
        got.push(o);
      }
      (this.introductions || (this.introductions = [])).push(group);
      this.counts.introduced = (this.counts.introduced || 0) + count;
      this.log('人為的な外来個体の投入：系統 ' + group.root + '、' + count + ' 匹、' + ({ random: 'ランダム', center: '画面中央', ocean: '外洋', bottom: '海底' }[place]) + '、' + (age === 'adult' ? '成体' : '幼体') + '（自然進化による出現ではない）');
      return got;
    }

    spawn(g, x, y, stage, parent) {
      if (this.noCilia) for (const p of g.parts) p.cilia = 0;
      const o = { id: this.nextId++, g, stage, taxDot: 0, taxLen: 0, taxN: 0, sx: x, sy: y, age: 0, G: 0, egg: 0, grow: 0, dead: false, noise: 0, wander: this.rand() * TAU, path: 0, eaten: 0, absorbed: 0, kids: 0,
        parent: parent ? parent.id : 0, line: parent ? parent.line : this.nextId - 1, gen: parent ? parent.gen + 1 : 0, born: this.t };
      if (parent && (parent.introduction || parent.introFrom)) o.introduction = parent.introduction || parent.introFrom;
      const C = A.organs.C, baby = A.organs.profile(A.development.develop(g, { stage: g.birth, maxSegs: this.maxSegs, pair: this.pair }));
      { const plan = A.development.develop(g, { maxSegs: this.maxSegs }); o.full = A.organs.profile(plan); o.gu = this.geneUse(g, plan); } o.life = o.full.life * (0.85 + 0.3 * this.rand());
      { const y = this.yolkOf(g); o.eggCost = C.eggFixed + baby.buildCost + y * baby.Emax; o.eggE = y * baby.Emax; }
      this.form(o, x, y, this.rand() * TAU);
      o.E = parent ? Math.min(o.prof.Emax, parent.eggE) : o.prof.Emax * 0.6; o.V0 = o.prof.V; o.stage0 = stage;
      if (this.ledger && !parent) this.ledger.placed += o.E + o.prof.buildCost;
      // genealogy: what kind of body this is, and whether that differs from its parent's
      o.home = this.regions ? this.regionAt(x) : 0; // the region it was born in
      o.kind = [o.full.segs, o.full.mouths.length, o.full.eye > 0 ? 1 : 0, this.motile(g) ? 1 : 0, o.full.cilia > 0.05 ? 1 : 0].join('/');
      const pn = parent ? this.tree.get(parent.id) : null;
      this.tree.set(o.id, { id: o.id, parent: o.parent, line: o.line, gen: o.gen, born: this.t, died: null, cause: null, kind: o.kind, V: o.full.V, hue: g.hue, kids: 0, changed: !pn || pn.kind !== o.kind, g });
      if (o.introduction) this.tree.get(o.id).introduction = o.introduction;
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
      // wounds stay with the segments they are on while the body is rebuilt for growth (a segment is known by its address, not its number)
      const was = o.hp && o.plan ? new Map(o.plan.segs.map((s, i) => [s.addr, o.hp[i]])) : null;
      const kept = this.keep && o.b && o.plan ? this.mindOf(o, true) : null;
      const mind = !kept && this.carry && o.b && o.plan ? { t: o.b.t, seg: new Map(o.plan.segs.map((s, i) => { const q = o.b.segs[i]; return [s.addr, [q.a, q.m, q.mA, q.mB, q.mV, q.v, q.na ? Float64Array.from(q.na) : null, q.nA, q.nB, q.nV, q.nw ? Float64Array.from(q.nw) : null]]; })) } : null;
      o.plan = A.development.develop(o.g, { stage: o.stage, maxSegs: this.maxSegs, pair: this.pair, late: this.wireLate, ends: this.wireEnds ? this : null }); o.prof = A.organs.profile(o.plan);
      if (was) { o.hp = o.plan.segs.map(s => (was.has(s.addr) ? was.get(s.addr) : 1)); if (this.solid) for (let i = 1; i < o.hp.length; i++) { const pa = o.plan.segs[i].parent; if (pa > 0 && o.hp[pa] <= 0) o.hp[i] = 0; } } // (solid) nothing grows beyond a cut
      o.b = A.physics.build(o.plan, { x, y, angle: ang, env: { fluid: 1, ground: false, gravity: 4, flowX: 0, flowY: 0 } });
      // lay the body's own centre on (x, y)
      const c = A.physics.com(o.b); for (let k = 0; k < o.b.np; k++) { o.b.x[k] += x - c[0]; o.b.y[k] += y - c[1]; }
      A.physics.pose(o.b); o.cx = x; o.cy = y; o.work0 = 0;
      if (this.solid) { o.b.hard = true; o.self = this.selfPairs(o); } // (as the body is built, before its joints are set to where they were)
      if (kept) this.mindTo(o, kept, true);
      if (mind) { o.b.t = mind.t; o.plan.segs.forEach((s, i) => { const v = mind.seg.get(s.addr); if (!v) return; const q = o.b.segs[i]; q.a = v[0]; q.m = v[1]; if (v[2] != null) q.mA = v[2]; if (v[3] != null) q.mB = v[3]; if (v[4] != null) q.mV = v[4]; if (v[5] != null) q.v = v[5]; if (v[6] && q.p.nn && q.p.nn.length === v[6].length) { q.na = v[6]; q.nb = new Float64Array(v[6].length); } if (v[7] != null) q.nA = v[7]; if (v[8] != null) q.nB = v[8]; if (v[9] != null) q.nV = v[9]; if (v[10] && q.p.nn && A.neural.compile(q.p.nn).total === v[10].length) q.nw = v[10]; }); }
      // a body with no working joint cannot do anything but drift: move it with the water instead of simulating it
      if (!this.rigid) o.b.rigid = false; // control experiment: solve every body with the jointed solver
      if (o.b.rigid) o.self = null;
      o.passive = !o.b.hasCilia && o.b.rigid && !this.contact && !this.sound; o.cil0 = 0; // where bodies touch, every body is simulated: even one that cannot move can be pushed
      o.cleanV = o.prof.V; o.cleanBuild = o.prof.buildCost; if (o.hp) { while (o.hp.length < o.b.segs.length) o.hp.push(1); o.hp.length = o.b.segs.length; this.lost(o); this.wound(o); }
      if (this.sound) this.soundBody(o);
      o.cil0 = 0; o.nerve0 = 0; o.b.nerveUse = 0; if (o.sig) { for (let i = 0; i < o.b.segs.length && i < o.sig.length; i++) o.b.segs[i].a = o.sig[i]; o.sig = null; }
    }
    // (solid) Which pairs of a body's own segments may collide: all that are not parent and child, and that do not already overlap as the body is built —
    // a limb that starts inside the trunk, or two limbs that leave it at the same place, must not be pushed apart.
    selfPairs(o) {
      const b = o.b, segs = b.segs, n = segs.length, P = A.physics, list = []; if (n < 3) return null;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const p = segs[i], q = segs[j]; if (q.parent === i || p.parent === j) continue;
        const d = P.nearest(p, q, 0, 0), R = p.r0 + (p.r1 - p.r0) * P.near.s + q.r0 + (q.r1 - q.r0) * P.near.t; if (d < R * 1.1) continue; list.push(i, j); }
      return list.length ? Int16Array.from(list) : null;
    }
    selfTouch(o, dt) {
      const b = o.b, segs = b.segs, L = o.self, P = A.physics, N = P.near; let moved = false;
      for (let k = 0; k < L.length; k += 2) { const p = segs[L[k]], q = segs[L[k + 1]]; if (p.gone || q.gone) continue;
        const ex = q.bx - p.bx, ey = q.by - p.by, far = p.len + q.len + p.r0 + p.r1 + q.r0 + q.r1; if (ex * ex + ey * ey > far * far) continue;
        const d = P.nearest(p, q, 0, 0), R = p.r0 + (p.r1 - p.r0) * N.s + q.r0 + (q.r1 - q.r0) * N.t; if (d >= R) continue;
        const d0 = d || 1e-6, ma = b.m[p.b], mb = b.m[q.b], J = ma * mb / (ma + mb) * Math.min(0.2, 12 * (R - d) * dt), jx = J * N.x / d0, jy = J * N.y / d0, s1 = N.s, t1 = N.t;
        P.impulseAt(b, p, s1, -jx, -jy); P.impulseAt(b, q, t1, jx, jy); p.tch += J / ma; q.tch += J / mb; o.selfHit = (o.selfHit || 0) + 1;
        // and they are moved apart, each by as much as it gives way: half of the overlap now, the rest over the next moments (the joints then settle around it)
        const wp = P.ease(b, p, s1), wq = P.ease(b, q, t1), lam = 0.5 * (R - d) / (wp + wq), nx = N.x / d0, ny = N.y / d0; P.shiftAt(b, p, s1, -lam * nx, -lam * ny); P.shiftAt(b, q, t1, lam * nx, lam * ny); moved = true; }
      if (moved) P.pose(b);
    }
    // (solid) A segment torn through is cut off, with everything beyond it. What is left of the tissue beyond becomes food at the cut, with that tissue's share
    // of the body's reserve and gut contents — the same accounting as a bite.
    // (solid) What has been cut off stays cut off, and carries no circuit. unwire: the plan's segment gets a copy of its part without connections, so the body's
    // profile no longer charges it the upkeep of nerves it has lost. lost: on a body that has just been rebuilt (growth, a reloaded world, arrival from another
    // island), the segments cut off earlier are marked as gone again without being cut - and counted - a second time.
    // The safety valve. A body's arithmetic can run away: its numbers grow without bound and, some steps later, stop being numbers. On the way they pass through
    // values that are numbers still but astronomically large, and a search of the cells around such a place never ends (adding 1 to 1e18 changes nothing): the
    // whole world would stop. So a body any part of which is a whole world's width or height outside the world is taken out at once, as one whose numbers are
    // no longer numbers is. No body gets there by swimming: the world wraps sideways, and its floor and surface hold. fault: what broke is written down
    // (the last few, with their genomes), so that the cause can be found; the record is saved with the world and changes nothing in it.
    flung(b) { const W = this.W, H = this.H; for (let k = 0; k < b.np; k++) { const x = b.x[k], y = b.y[k]; if (x < -W || x > 2 * W || y < -H || y > 2 * H) return true; } return false; }
    fault(o) { const b = o.b; let n = 0, far = 0; for (let k = 0; k < b.np; k++) { if (!Number.isFinite(b.x[k]) || !Number.isFinite(b.y[k])) n++; else if (Math.abs(b.x[k]) > 2 * this.W || Math.abs(b.y[k]) > 2 * this.H) far++; }
      if (!this.faults) this.faults = []; this.faults.push({ t: this.t, id: o.id, parent: o.parent, gen: o.gen, stage: o.stage, age: o.age, kind: o.kind, segs: b.segs.length, how: n ? 'not a number' : 'far outside the world', notNumbers: n, far, was: [o.cx, o.cy], E: o.E, hp: o.hp ? Array.from(o.hp) : null, g: A.genome.copy(o.g),
        /* for finding the cause: the body as the physics left it and as it stood a step before, what it is made of, and who was near */
        body: { rigid: !!b.rigid, passive: !!o.passive, mass: b.mass, inertia: b.inertia, massMin: Math.min(...Array.from(b.m)), x: Array.from(b.x), y: Array.from(b.y), vx: Array.from(b.vx), vy: Array.from(b.vy), ox: b.ox ? Array.from(b.ox) : null, oy: b.oy ? Array.from(b.oy) : null, len: b.segs.map(q => q.len), tauMax: b.segs.map(q => q.tauMax), cil: b.segs.map(q => q.cil), target: b.segs.map(q => q.target), cd: b.segs.map(q => q.cd), a: b.segs.map(q => q.a), ground: this.isGround(o.cx, o.cy), held: o.held || 0, tick: this.tick },
        near: this.bodies.filter(q => q !== o && !q.dead && Math.abs(q.cy - o.cy) < 12 && Math.min(Math.abs(q.cx - o.cx), this.W - Math.abs(q.cx - o.cx)) < 12).slice(0, 12).map(q => ({ id: q.id, kind: q.kind, stage: q.stage, at: [q.cx, q.cy], V: q.prof.V, rigid: !!q.b.rigid })) }); if (this.faults.length > 8) this.faults.shift();
      this.log('不具合：身体 #' + o.id + ' の物理の計算が破綻した（' + (n ? '数でない値' : '世界の外へ飛び出した') + '。' + b.segs.length + ' 体節、成長段階 ' + o.stage.toFixed(2) + '、' + o.age.toFixed(0) + ' 秒齢）。世界の出来事ではない。この身体は取り除かれ、遺伝子型は保存に残る', o.id); }
    unwire(q) { if (!q || q.cut) return; const p = Object.assign({}, q.p); for (const k of A.neural.CIRCUIT) p[k] = 0; delete p.nn; q.p = p; q.cut = true; }
    lost(o) { if (!this.solid || !o.hp) return; const segs = o.b.segs, ps = o.plan.segs; for (let i = 1; i < segs.length && i < o.hp.length; i++) if (o.hp[i] <= 0) { segs[i].gone = true; this.unwire(ps[i]); } }
    sever(o, j) {
      const C = A.organs.C, segs = o.b.segs, hp = o.hp, lg = this.ledger, at = segs[j]; let vol = 0; const stack = segs[j].kids.slice(); segs[j].gone = true; this.unwire(o.plan.segs[j]);
      while (stack.length) { const k = stack.pop(), q = segs[k]; if (hp[k] > 0) vol += Math.PI * (q.r0 + q.r1) / 2 * (q.z0 + q.z1) / 2 * q.len * hp[k]; hp[k] = 0; q.gone = true; this.unwire(o.plan.segs[k]); for (const c of q.kids) stack.push(c); }
      this.counts.cut = (this.counts.cut || 0) + 1; if (vol <= 1e-9) return;
      const share = Math.min(1, vol / Math.max(1e-9, o.prof.V)), eE = Math.max(0, o.E) * share, eG = o.G * share; o.E -= eE; o.G -= eG; o.lost = (o.lost || 0) + C.flesh * C.build * vol + eE + eG;
      let e = C.flesh * C.build * vol + eE + eG; this.corpse = true;
      while (e > 0.05) { const size = 0.25 + this.rand() * 0.25, pe = Math.min(e, this.grainEnergy * size ** 3); this.addFood(at.bx + this.rand.gauss() * 0.3, at.by + this.rand.gauss() * 0.3, size, pe, this.isGround(at.bx, at.by), this.grainLife); e -= pe; }
      this.corpse = false; const gone = (1 - C.flesh) * C.build * vol + e; if (lg) lg.bite += gone; if (this.recycle) this.giveBack(at.bx, at.by, gone);
    }
    // (keep) What a body's nerves hold, segment by segment (a segment is known by its address in the body, not by its number), and — with `motion` — how the
    // body is moving: the speed of its centre, its spin, and the angle of every joint. Plain numbers and lists, so that it can travel between islands.
    mindOf(o, motion) {
      const b = o.b, P = A.physics, seg = o.plan.segs.map((s, i) => { const q = b.segs[i], e = {}; for (const k of MIND) if (q[k] != null) e[k] = q[k]; if (q.na) e.na = Array.from(q.na); if (q.nw) e.nw = Array.from(q.nw); if (motion && i) e.th = Math.atan2(b.segs[q.parent].dx * q.dy - b.segs[q.parent].dy * q.dx, b.segs[q.parent].dx * q.dx + b.segs[q.parent].dy * q.dy); return [s.addr, e]; });
      const mind = { t: b.t, seg };
      if (motion) { const c = P.com(b), mo = P.momentum(b); let I = 0; for (let k = 0; k < b.np; k++) I += b.m[k] * ((b.x[k] - c[0]) ** 2 + (b.y[k] - c[1]) ** 2); mind.vx = mo[0] / b.mass; mind.vy = mo[1] / b.mass; mind.om = I > 1e-12 ? (mo[2] - b.mass * (c[0] * mind.vy - c[1] * mind.vx)) / I : 0; }
      return mind;
    }
    mindTo(o, mind, motion) {
      const b = o.b, P = A.physics, at = new Map(mind.seg); b.t = mind.t;
      o.plan.segs.forEach((s, i) => { const e = at.get(s.addr); if (!e) return; const q = b.segs[i]; for (const k of MIND) if (e[k] != null) q[k] = e[k];
        if (e.na && q.p.nn && q.p.nn.length === e.na.length) { q.na = Float64Array.from(e.na); q.nb = new Float64Array(e.na.length); }
        if (e.nw && q.p.nn && A.neural.compile(q.p.nn).total === e.nw.length) q.nw = Float64Array.from(e.nw); });
      if (!motion || mind.vx == null) return;
      // the joints that were there before stand at the angle they had (a body that keeps its shape has no joint to set), then the whole body moves on as it did
      if (!b.rigid) { const c0 = P.com(b), ang = new Float64Array(b.segs.length); ang[0] = Math.atan2(b.segs[0].dy, b.segs[0].dx);
        for (let i = 1; i < b.segs.length; i++) { const q = b.segs[i], e = at.get(o.plan.segs[i].addr), th = e && e.th != null ? clamp(e.th, q.rest - q.p.range - 0.2, q.rest + q.p.range + 0.2) : q.rest; ang[i] = ang[q.parent] + th;
          let ax = 0, ay = 0; for (const [k, r, im] of q.aw) { ax += r * b.x[k] - im * b.y[k]; ay += r * b.y[k] + im * b.x[k]; } b.x[q.b] = ax + q.len * Math.cos(ang[i]); b.y[q.b] = ay + q.len * Math.sin(ang[i]); }
        const c1 = P.com(b); for (let k = 0; k < b.np; k++) { b.x[k] += c0[0] - c1[0]; b.y[k] += c0[1] - c1[1]; } P.pose(b); }
      const c = P.com(b); for (let k = 0; k < b.np; k++) { b.vx[k] = mind.vx - mind.om * (b.y[k] - c[1]); b.vy[k] = mind.vy + mind.om * (b.x[k] - c[0]); } if (b.rigid) b.om = mind.om;
    }
    // counts for taxis only if it went somewhere by itself: at least 2 units while perceiving food, at 0.02 units/s or more over its life
    traveller(o) { return o.taxLen >= 2 && o.age > 5 && o.path / o.age >= 0.02; }
    motile(g) { const p = A.development.develop(g, { maxSegs: this.maxSegs }); return p.segs.some(q => q.id > 0 && q.p.amp > 0.02 && q.p.muscle > 0.02); }
    // Turn sight, smell or the old food-direction shortcut on or off in a world that is already running.
    // The bodies, their genomes and the genealogy carry on; only what the world lets them sense changes from here.
    // The new genes of living bodies start at their neutral values (no wire from eye or nose), so nothing behaves
    // differently until mutation finds a use. It is a branch: the world no longer continues as it would have.
    enable(o) {
      const F = A.genome.PART_FIELDS, n = this.cols * this.rows, names = { vision: '視覚', scent: '他個体の匂い', blind: '餌の方向の近道の切断' };
      if (o.shore != null && o.shore !== this.shore) { this.shore = o.shore; this.log('世界の設定を変更：海域の境界を' + (o.shore > 0 ? 'なだらかにした（幅 ' + o.shore + '）' : '段差に戻した')); }
      if (o.contact != null && !!o.contact !== !!this.contact) { this.contact = o.contact ? 1 : 0; this.log('世界の設定を変更：身体の接触と、口による組織の摂取を' + (o.contact ? '有効にした' : '無効にした')); for (const b of this.bodies) b.passive = !this.contact && !b.b.hasCilia && b.b.rigid; for (const k of ['killed', 'flesh', 'torn']) if (this.counts[k] == null) this.counts[k] = 0; }
      if ((this.vision || this.contact) && !this.bgrid) this.bgrid = Array.from({ length: n }, () => []);
      if (o.adhere != null && !!o.adhere !== !!this.adhere) { this.adhere = o.adhere ? 1 : 0; this.log('世界の設定を変更：パッドが他の身体を掴み、触れ合う身体のあいだで蓄えが染み出す規則を' + (o.adhere ? '有効にした' : '無効にした')); }
      if (o.wave != null && o.wave !== this.wave) { this.wave = o.wave > 0 ? o.wave : 0; this.log('世界の設定を変更：豊かさの波（溶存栄養の回復と粒の供給が、波として世界を移動する）を' + (this.wave > 0 ? '有効にした（周期 ' + this.wave + ' 秒）' : '無効にした')); }
      if (o.soundWork != null && !!o.soundWork !== !!this.soundWork) { this.soundWork = o.soundWork ? 1 : 0; this.log('世界の設定を変更：繊毛の音を、水に対してした仕事（推力 × 水の中を進む速さ）から決める規則を' + (o.soundWork ? '有効にした（繊毛で泳ぐ音はごく小さくなる）' : '無効にした（打った量に比例する元の決め方）')); }
      if (o.sound != null && !!o.sound !== !!this.sound) { this.sound = o.sound ? 1 : 0; this.log('世界の設定を変更：音（身体の活動から生じる音、耳、声）を' + (o.sound ? '有効にした' : '無効にした')); if (this.sound && !this.snd) this.soundInit(); }
      for (const k of ['deaf', 'mute']) if (o[k] != null && !!o[k] !== !!this[k]) { this[k] = o[k] ? 1 : 0; this.log('世界の設定を変更（対照実験）：' + (k === 'deaf' ? 'すべての耳が何も聞こえない' : 'すべての声が出ない') + (o[k] ? '状態にした' : '状態を解いた')); }
      if (o.soundLag != null && o.soundLag !== this.soundLag) { this.soundLag = o.soundLag > 0 ? o.soundLag : 0; this.sndRing = []; this.log('世界の設定を変更（対照実験）：耳が聞く音を ' + this.soundLag + ' 秒前のものにした'); }
      if (o.learn != null && !!o.learn !== !!this.learn) { this.learn = o.learn ? 1 : 0; this.log('世界の設定を変更：神経の結合が使われ方で変わる（学習する）規則を' + (o.learn ? '有効にした' : '無効にした')); }
      if (o.invest != null && !!o.invest !== !!this.invest) { this.invest = o.invest ? 1 : 0; this.log('世界の設定を変更：卵に持たせる蓄えの量が遺伝し、変異する規則を' + (o.invest ? '有効にした' : '無効にした')); for (const b of this.bodies) { const baby = A.organs.profile(A.development.develop(b.g, { stage: b.g.birth, maxSegs: this.maxSegs })), y = this.yolkOf(b.g), C = A.organs.C; b.eggCost = C.eggFixed + baby.buildCost + y * baby.Emax; b.eggE = y * baby.Emax; } }
      if (o.mix != null && !!o.mix !== !!this.mix) { this.mix = o.mix ? 1 : 0; this.log('世界の設定を変更：裸の表面どうしが触れると遺伝物質が渡り、次の卵が 2 つの遺伝子から作られる規則を' + (o.mix ? '有効にした' : '無効にした')); }
      if (o.nerve2 != null && !!o.nerve2 !== !!this.nerve2) { this.nerve2 = o.nerve2 ? 1 : 0; this.log('世界の設定を変更：体節あたり複数の神経（相対位置の結合）を' + (o.nerve2 ? '有効にした' : '無効にした')); }
      if (o.recycle != null && !!o.recycle !== !!this.recycle) { this.recycle = o.recycle ? 1 : 0; this.log('世界の設定を変更：身体が失った物質を、その場の溶存栄養に戻す規則を' + (o.recycle ? '有効にした' : '無効にした')); }
      if (o.mutsplit != null && !!o.mutsplit !== !!this.mutsplit) { this.mutsplit = o.mutsplit ? 1 : 0; this.log('世界の設定を変更：変異の頻度と幅を別々の遺伝子として受け継ぐ規則を' + (o.mutsplit ? '有効にした（体のつくりが変わる確率は頻度だけに比例する）' : '無効にした')); }
      if (o.metamut != null && !!o.metamut !== !!this.metamut) { this.metamut = o.metamut ? 1 : 0; this.log('世界の設定を変更：変異の強さが遺伝し、それ自体も変異する規則を' + (o.metamut ? '有効にした' : '無効にした')); }
      if (o.nibble != null && !!o.nibble !== !!this.nibble) { this.nibble = o.nibble ? 1 : 0; this.log('世界の設定を変更：飲み込めない粒を口が削って食べられる規則を' + (o.nibble ? '有効にした' : '無効にした')); }
      if (o.budget != null && !!o.budget !== !!this.budget) { this.budget = o.budget ? 1 : 0; this.log('世界の設定を変更：出生の収支を合わせる規則（子は卵の予算で作れる段階で生まれる）を' + (o.budget ? '有効にした' : '無効にした')); }
      if (o.cast != null && !!o.cast !== !!this.cast) { this.cast = o.cast ? 1 : 0; this.log('世界の設定を変更：卵を親からどれだけ離して産むかが遺伝し、変異する規則を' + (o.cast ? '有効にした（0 から始まる）' : '無効にした（卵は親のすぐ脇に産まれる）')); }
      if (o.pair != null && !!o.pair !== !!this.pair) { this.pair = o.pair ? 1 : 0; for (const q of this.bodies) if (q.stage < 1) { q.nextCost = null; const root = q.b.segs[0]; this.form(q, q.cx, q.cy, Math.atan2(root.dy, root.dx)); } this.log('世界の設定を変更：左右の対が成長の同じ段階で一緒に現れる規則を' + (o.pair ? '有効にした' : '無効にした')); }
      if (o.solid != null && !!o.solid !== !!this.solid) { this.solid = o.solid ? 1 : 0; for (const q of this.bodies) { q.b.hard = !!this.solid; q.self = this.solid && !q.b.rigid ? this.selfPairs(q) : null; if (q.hp) this.wound(q); } this.log('世界の設定を変更：身体を全長にわたって固い物体として扱う規則（側面の接触・自分自身との接触・関節の止まり・失った組織の重さ・切断）を' + (o.solid ? '有効にした' : '無効にした')); }
      if (o.wireEnds != null && !!o.wireEnds !== !!this.wireEnds) { this.wireEnds = o.wireEnds ? 1 : 0; for (const q of this.bodies) { q.nextCost = null; const root = q.b.segs[0]; this.form(q, q.cx, q.cy, Math.atan2(root.dy, root.dx)); } this.log('世界の設定を変更：相手（感覚・効果器・隣の体節）のある結合だけを作り、相手の無い結合には維持費がかからない規則を' + (o.wireEnds ? '有効にした（身体のすることは変わらない）' : '無効にした')); }
      if (o.wireLate != null && !!o.wireLate !== !!this.wireLate) { this.wireLate = o.wireLate ? 1 : 0; for (const q of this.bodies) if (q.stage < 1 && q.g.parts.some(p => p.nAt > q.stage)) { q.nextCost = null; const root = q.b.segs[0]; this.form(q, q.cx, q.cy, Math.atan2(root.dy, root.dx)); } this.log('世界の設定を変更：部品ごとに、回路を作る成長の段階が遺伝し、変異する規則を' + (o.wireLate ? '有効にした（遺伝子の無い部品は、これまでどおり生まれたときから回路を持つ）' : '無効にした（どの回路も生まれたときからある）')); }
      if (o.brain != null && !!o.brain !== !!this.brain) { this.brain = o.brain ? 1 : 0; this.log('世界の設定を変更：神経系が身体と別に増える・遠くへつながる規則を' + (o.brain ? '有効にした（部品あたり 16 神経まで、根の体節と全身への結合、神経のまとまりの複製）' : '無効にした（いまある神経と結合はそのまま働く）')); }
      if (o.wire != null && !!o.wire !== !!this.wire) { this.wire = o.wire ? 1 : 0; this.log('世界の設定を変更：神経に名前を付け、結合が相手を名前で指す規則を' + (o.wire ? '有効にした（神経が減っても増えても、ほかの結合はずれない）' : '無効にした')); }
      if (o.keep != null && !!o.keep !== !!this.keep) { this.keep = o.keep ? 1 : 0; this.log('世界の設定を変更：身体が作り直されても・移されても、神経の状態・身につけた結合・動きを保つ規則を' + (o.keep ? '有効にした' : '無効にした')); }
      if (o.carry != null && !!o.carry !== !!this.carry) { this.carry = o.carry ? 1 : 0; this.log('世界の設定を変更：成長の前後で神経の状態と律動を引き継ぐ規則を' + (o.carry ? '有効にした' : '無効にした')); }
      if (o.genome2 != null && !!o.genome2 !== !!this.genome2) { this.genome2 = o.genome2 ? 1 : 0; this.log('世界の設定を変更：遺伝子の新しい規則（軸の分割・休眠遺伝子・識別子）を' + (o.genome2 ? '有効にした' : '無効にした')); }
      for (const k of ['vision', 'scent', 'blind']) { if (o[k] == null || !!o[k] === !!this[k]) continue; this[k] = o[k] ? 1 : 0; this.log('世界の設定を変更：' + names[k] + (o[k] ? 'を有効にした' : 'を無効にした')); }
      if (this.scent && !this.scA) { this.scA = new Float32Array(n); this.scB = new Float32Array(n); this.sc2 = new Float32Array(n); this.smA = new Float64Array(256); this.smB = new Float64Array(256); }
      if (this.vision && !this.bgrid) this.bgrid = Array.from({ length: n }, () => []);
      for (const b of this.bodies) { A.genome.sanitize(b.g); for (const q of b.b.segs) for (const k in F) if (!Number.isFinite(q.p[k])) q.p[k] = F[k][2]; if (this.sound) { b.passive = false; this.soundBody(b); } }
    }
    log(text, id) { this.events.push({ t: Math.round(this.t), text, id }); if (this.events.length > 400) this.events.shift(); }
    // things that happen for the first time in this world (observation only; nothing is rewarded)
    // What a genome carries and what the body uses of it: parts in the genome, parts a rule leads to, kinds of part actually in the adult body,
    // places along an axis where the part changes (zones), and how far the most changed copy in use is from the part it was copied from.
    geneUse(g, plan) {
      const G = A.genome, used = new Set(); let zones = 0, div = 0;
      for (const s of plan.segs) { used.add(s.part); if (s.chain && s.parent >= 0 && plan.segs[s.parent].part !== s.part) zones++; }
      for (const i of used) { const p = g.parts[i]; if (p.src == null) continue; const q = g.parts.find(x => x.id === p.src); if (q) div = Math.max(div, G.divergence(p, q)); }
      return { parts: g.parts.length, reach: G.reach(g).size, expr: used.size, zones, div };
    }
    // How far a young with these genes can develop on an egg holding B: the stage its genes aim at if the egg pays for that body and the usual
    // reserve; otherwise the latest stage it does pay for; a mere bud with less reserve if that is all there is; null if not even a bud.
    // ---- sound ----
    soundInit() {
      const n = this.cols * this.rows, mk = () => Array.from({ length: SND.B }, () => new Float32Array(n));
      this.snd = mk(); this.sndIn = mk(); this.snd2 = new Float32Array(n);
      this.sndV = mk(); this.sndVIn = mk(); // the part of the sound that voices made: the same water, kept apart only for the record and for a human listener. No body can tell it from the rest.
      this.sndPast = null; this.sndRing = []; // (soundLag) the water as it was
      this.aco = this.aco || this.acoNew(); this.sndPend = []; this.sndQuiet = 0; for (let b = 0; b < SND.B; b++) this.sndQuiet += 0.5 * SND.amb[b] / SND.fade[b]; // (record) voices fainter than half the water's own noise: quiet
    }
    // The record of sound: an observer's notebook. Nothing in the world reads it (a test wipes it again and again and requires the world to go on exactly the same).
    // Several of its measures follow the call statistics of LIFE — Digital Evolution Observatory (github.com/dominikvytisk/life-simulation, analysis/acoustics.ts):
    // what listeners did after a call, calls after calls against how often a body has just heard a call anyway, how like a reply is to what it followed
    // against an unrelated call, the order of call shapes, differences between regions, shapes that outlast a generation, and firsts that must persist.
    acoNew() { const cell = () => ({ n: 0, m: 0, m2: 0, eat: 0, eat2: 0, pre: 0, post: 0, hn: 0, h: 0, h2: 0, ids: {} });
      return { out: { cilia: 0, muscle: 0, hit: 0, tear: 0, scrape: 0, crunch: 0, voice: 0 }, recent: [], onsets: 0, after: 0, expect: 0, toward: 0, away: 0, tab: {}, spent: 0,
        on: 0, replied: 0, hearN: 0, hearYes: 0, resD: 0, resN: 0, chD: 0, chN: 0, pool: [], shape: new Array(18).fill(0), gen: [], reg: {}, seqN: 0, seqRep: 0, seqExp: 0,
        lis: [cell(), cell(), cell()], who: {}, first: {} }; } // lis: what bodies did after a call began near them, less what the same bodies did just before: [no ear, working ear, an ear that is cut (deaf world or body)]
    // Firsts of sound (after LIFE's chronicle): written to the world's log only when a measure has stayed past its threshold for five half-minute
    // censuses in a row — once is a twitch, not a finding. Each says what was measured, never what it means. If none of it happens, nothing is written.
    soundFirsts(c) {
      const F = this.aco.first, tests = {
        calls: [(c.callsEnded >= 20 || c.calling >= 0.02) && c.callTime > 0.005, '声が続けて出ている（最近終わった鳴き声 ' + Math.round(c.callsEnded) + ' 回、いま鳴いている個体は声を持つ個体の ' + (c.calling * 100).toFixed(0) + '%）'], // (a voice that never stops ends no call: it is counted by who is sounding now)
        shapes: [c.callShapes >= 1, '同じ形の鳴き声が繰り返されている（' + c.callShapes + ' 種類が 25 回以上）'],
        state: [c.callsEnded >= 25 && c.signalBits >= 0.05, '鳴くことが鳴く側の状態（' + c.signalOf + '）と結びついている（' + c.signalBits.toFixed(2) + ' ビット）'],
        follow: [c.answerN >= 20 && c.alternation > 0.05 && c.answer > 1.5, '鳴き声のあとに他個体の鳴き声が続く（偶然の ' + c.answer.toFixed(1) + ' 倍。同じものに反応しただけかは、片方を黙らせないと分からない）'],
        listen: [Math.abs(c.lisEffect) >= 0.25, '鳴き声が始まると、聞こえる個体のふるまい（' + c.lisOf + '）が、その直前の静かなときと変わる（' + c.lisEffect.toFixed(2) + ' 標準偏差。' + (c.lisControl === 'both' ? '聞こえない個体に起きた変化は引いてある' : '聞こえない個体との比較はまだない') + '）'],
        resemble: [c.resembleN >= 20 && c.resemble > 0.05, '直後の鳴き声は、無関係な鳴き声より、直前の鳴き声に音程が近い（血縁なら元から似る）'],
        order: [c.sequenceN >= 50 && Math.abs(c.sequenceOrder) >= 0.1, '同じ個体の鳴き声の形の順序が、その個体の持ち歌から無作為に選んだ場合と違う（' + (c.sequenceOrder > 0 ? '同じ形を続ける' : '形を入れ替える') + '。差 ' + c.sequenceOrder.toFixed(2) + '）'],
        dialect: [c.dialectRegions >= 2 && c.dialectBits >= 0.1, '海域によって鳴き声の形が違う（' + c.dialectBits.toFixed(2) + ' ビット。遺伝の違いだけでも起きる）'],
        outlive: [c.shapeGenerations >= 3, '同じ形の鳴き声が ' + c.shapeGenerations + ' 世代にわたって使われている（遺伝だけでも起きる）'] };
      for (const k in tests) { const f = F[k] || (F[k] = { run: 0, at: null }); if (f.at != null) continue; f.run = tests[k][0] && c.callers >= 3 ? f.run + 1 : 0; /* (never on the strength of one or two bodies) */ if (f.run >= 5) { f.at = this.t; f.text = tests[k][1]; /* (kept with the notebook: the world's log forgets its oldest lines) */ this.log('音（観測）：' + tests[k][1] + '。5 回続けて観測。意味は与えていない'); } }
    }
    // The record of sound (counting only). It keeps apart four things that are easily taken for one another:
    //   sound is made      — voices exist and sound (voiced, calling, callsPer100s, voiceShare of all sound made)
    //   it goes with a state — how much knowing that a body sounds tells about its state, in bits (signalBits, signalOf): the sender's side only
    //   it moves a listener  — how hard what ears report pushes on their owners' circuits (listening, hearDrive): the receiver's side, by the wiring;
    //                          whether behaviour really changes takes a world with ears or voices cut (deaf, mute, soundLag)
    //   it is answered       — beginnings of sound that follow another body's beginning nearby, against what those neighbours' own rates would give by chance (answer);
    //                          and, where a neuron pushed the pitch, whether towards the pitch just heard (pitchToward)
    soundCensus() {
      const K = this.aco, L = this.bodies, n = Math.max(1, L.length); let voiced = 0, eared = 0, calling = 0, hd = 0, hl = 0, voT = 0, voN = 0, age = 0, pS = 0, pS2 = 0, pN = 0;
      for (const o of L) { const b = o.b; if (b.hasVoice) { voiced++; if (o.voOn) calling++; voN += o.voN || 0; voT += o.voT || 0; age += o.age; for (const q of b.segs) if (q.voxV > 0) { pS += q.p.pitch; pS2 += q.p.pitch * q.p.pitch; pN++; } } if (b.hasEar) { eared++; hd += b.hd || 0; if ((b.hd || 0) > 0.05) hl++; } }
      let best = 0, of = ''; for (const k in K.tab) { const t = K.tab[k], N = t[0] + t[1] + t[2] + t[3]; if (N < 50) continue; let mi = 0; for (let c = 0; c < 2; c++) for (let s2 = 0; s2 < 2; s2++) { const pj = t[c * 2 + s2] / N, pc = (t[c * 2] + t[c * 2 + 1]) / N, ps = (t[s2] + t[2 + s2]) / N; if (pj > 0) mi += pj * Math.log2(pj / (pc * ps)); } if (mi > best) { best = mi; of = k; } }
      const out = K.out, all = out.cilia + out.muscle + out.hit + out.tear + out.scrape + out.crunch + out.voice; let loud = 0; for (let b = 0; b < SND.B; b++) { const f = this.snd[b]; let a = 0; for (let i = 0; i < f.length; i += 7) a += f[i]; loud += a / Math.ceil(f.length / 7); }
      return { voiced: voiced / n, eared: eared / n, calling: voiced ? calling / voiced : 0, callsPer100s: age > 0 ? voN / age * 100 : 0, callTime: age > 0 ? voT / age : 0, voiceShare: all > 0 ? out.voice / all : 0, soundMade: all, loudness: loud,
        pitchMean: pN ? pS / pN : 0, pitchSpread: pN ? Math.sqrt(Math.max(0, pS2 / pN - (pS / pN) ** 2)) : 0, signalBits: best, signalOf: of, hearDrive: eared ? hd / eared : 0, listening: eared ? hl / eared : 0,
        answer: K.expect > 0 ? K.after / K.expect : 0, answerN: K.after, answerBase: K.expect,
        ...this.soundDerived(), onsets: K.onsets, pitchToward: K.toward + K.away > 0 ? K.toward / (K.toward + K.away) : 0, pitchN: K.toward + K.away, soundCost: K.spent };
    }
    // Measures worked out from the notebook (after LIFE's call statistics). Each has a floor of samples and a floor of raw difference below which it reads 0.
    soundDerived() {
      const K = this.aco, sum = a => a.reduce((x, y) => x + y, 0), ent = a => { const N = sum(a); let h = 0; if (N > 0) for (const v of a) if (v > 0) h -= v / N * Math.log2(v / N); return h; };
      const replyRate = K.on > 1 ? K.replied / K.on : 0, heardAnyway = K.hearN > 1 ? K.hearYes / K.hearN : 0;
      const shapes = K.shape.filter(v => v >= 25).length, calls = sum(K.shape), top = calls ? Math.max(...K.shape) / calls : 0;
      // regions: how much knowing the region tells about the shape of a call, in bits (different lineages in different regions give this too)
      let dialect = 0; const regs = Object.values(K.reg).filter(a => sum(a) >= 40); if (regs.length >= 2) { const pooled = new Array(18).fill(0); let tot = 0; for (const a of regs) { tot += sum(a); a.forEach((v, i) => { pooled[i] += v; }); } dialect = ent(pooled); for (const a of regs) dialect -= sum(a) / tot * ent(a); }
      let span = 0; K.gen.forEach((g, i) => { if (g && K.shape[i] >= 25 && g[1] - g[0] > span) span = g[1] - g[0]; });
      // listeners: what bodies with a working ear did in the seconds after a call began within 16 units of them, less what the same bodies did in the seconds
      // before it, when no voice could be heard there. From that, where there are enough of them, the same difference for bodies without a working ear at the
      // same calls is taken off: a call is also a body that moves, and a caller may call because something is coming — neither is hearing.
      // (Whether a body calls after a call is not counted here: bodies near a caller are often its kin and call anyway. That is what `answer` is for.)
      // Three things are looked at: how far the body moved per second; whether it ate; and, for bodies that were moving before and after, whether their heading
      // turned towards the place of the call (in radians: how far off the call the heading was before, less how far off after). Distance to the caller is not
      // used: a body that merely goes straight past, or one that speeds up in any direction, ends up farther away, and would read as fleeing.
      const L = K.lis, mean = (c, f) => { const n = f === 'h' ? c.hn : c.n; return n > 0 ? c[f] / n : 0; }, sdOf = (c, f) => Math.sqrt(Math.max(0, c[f + '2'] / Math.max(1, f === 'h' ? c.hn : c.n) - mean(c, f) ** 2));
      const count = o => { let n = 0; for (const k in o) n++; return n; }, callers = count(K.who), ears = count(L[1].ids), bare = count(L[0].ids);
      // enough cases, from enough different bodies: at least three callers, and at least six different listeners in a group
      const both = L[0].n >= 25 && bare >= 6, ok = L[1].n >= 25 && ears >= 6 && callers >= 3; let eff = 0, of = '', raw = 0, z = 0;
      if (ok) for (const [f, name, floor, sd0] of [['h', '声の方へ向きを変える', 0.1, 0.1], ['m', '動く', 0.02, 0.02], ['eat', '食べる', 0.02, 0.1]]) {
        const n1 = f === 'h' ? L[1].hn : L[1].n, n0 = f === 'h' ? L[0].hn : L[0].n, two = both && n0 >= 25; if (n1 < 25) continue;
        const d = mean(L[1], f) - (two ? mean(L[0], f) : 0); if (Math.abs(d) < floor) continue;
        // The difference is measured against the spread of both groups, and must stand clear of its own uncertainty (2.5 standard errors): with a few dozen cases
        // the mean of the bodies without ears wanders by itself, and taking it off must not create a finding. (The first version divided by the spread of the
        // bodies with ears alone, and logged a "first" in an evolved world that came from 36 earless bodies and nothing else.)
        const s1 = sdOf(L[1], f), s0 = two ? sdOf(L[0], f) : 0, se = Math.sqrt(s1 * s1 / n1 + (two ? s0 * s0 / n0 : 0)); if (Math.abs(d) < 2.5 * se) continue;
        const e = d / Math.max(sd0, two ? Math.sqrt((s1 * s1 + s0 * s0) / 2) : s1); if (Math.abs(e) > Math.abs(eff)) { eff = e; of = name; raw = d; z = se > 0 ? d / se : 0; } }
      return { replyRate, heardAnyway, alternation: replyRate - heardAnyway, resemble: K.resN >= 5 && K.chN >= 5 ? K.chD / K.chN - K.resD / K.resN : 0, resembleN: K.resN, callShapes: shapes, callsEnded: calls, topShape: top,
        sequenceOrder: K.seqN >= 5 ? (K.seqRep - K.seqExp) / K.seqN : 0, sequenceN: K.seqN, dialectBits: dialect, dialectRegions: regs.length, shapeGenerations: span,
        callers, lisBodies: ears, lisDeafBodies: bare, lisEffect: eff, lisOf: of, lisRaw: raw, lisZ: z, lisControl: ok ? (both ? 'both' : 'self') : '', lisN: L[1].n, lisDeafN: L[0].n,
        cutN: L[2].n, cutMoved: mean(L[2], 'm'), cutEat: mean(L[2], 'eat'), cutTurn: mean(L[2], 'h'), cutTurnN: L[2].hn, lisTurn: mean(L[1], 'h'), lisTurnN: L[1].hn, lisMoved: mean(L[1], 'm'), lisMovedSd: sdOf(L[1], 'm'), lisEat: mean(L[1], 'eat'), lisEatSd: sdOf(L[1], 'eat'), lisMovedBefore: mean(L[1], 'pre'), lisMovedAfter: mean(L[1], 'post'), deafTurn: mean(L[0], 'h'), deafMoved: mean(L[0], 'm'), deafEat: mean(L[0], 'eat') };
    }
    // The notebook read out for a person, sorted by how much each line may claim (after LIFE's labels: observed / correlated / inferred / unknown):
    //   観測 what was counted · 相関 what goes together, cause not settled · 推定 what a comparison with ears or voices cut supports (the notebook alone never does) · 不明 too few cases yet
    soundReading(c) {
      const p = v => (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%', R = { seen: [], goes: [], inferred: [], unknown: [] }, names = { ate: 'この 1 秒に食べた', hungry: '空腹', fed: '消化管に餌がある', touched: '押されている', hurt: '傷がある', seeing: '何か見えている', hearing: '何か聞こえている', young: '幼体' };
      R.seen.push('声を持つ個体 ' + p(c.voiced) + '・耳を持つ個体 ' + p(c.eared) + '・最近の鳴き声 ' + Math.round(c.callsEnded) + ' 回、鳴いた個体 ' + c.callers + ' 匹（声を持つ個体が鳴いていた時間 ' + p(c.callTime) + '）');
      if (c.callShapes >= 1) R.seen.push('繰り返される鳴き声の形 ' + c.callShapes + ' 種類（25 回以上。最も多い形が全体の ' + p(c.topShape) + '）'); else R.unknown.push('鳴き声の形（どの形も 25 回に届いていない）');
      if (c.callsEnded >= 25 && c.signalOf) R.goes.push('鳴くことと鳴く側の状態：' + c.signalBits.toFixed(3) + ' ビット（' + (names[c.signalOf] || c.signalOf) + '。0 なら状態と無関係）'); else R.unknown.push('鳴くことと状態の結びつき（鳴き声 ' + Math.round(c.callsEnded) + ' 回、25 回から）');
      if (c.answerN >= 20) R.goes.push('他個体の鳴き始めの直後に鳴き始める：偶然の ' + c.answer.toFixed(2) + ' 倍（1 前後なら応答ではない）。直後だった割合 ' + p(c.replyRate) + '、鳴く個体がふだん「聞いたばかり」である割合 ' + p(c.heardAnyway)); else R.unknown.push('鳴き声への鳴き返し（直後の鳴き始め ' + Math.round(c.answerN) + ' 回、20 回から）');
      if (c.lisControl) R.goes.push('鳴き声が始まった前後の、聞こえる個体のふるまい' + (c.lisOf ? '：「' + c.lisOf + '」が ' + c.lisEffect.toFixed(2) + ' 標準偏差だけ変わる' : '：変化なし（下限未満）') + '。動く速さ ' + c.lisMovedBefore.toFixed(2) + ' → ' + c.lisMovedAfter.toFixed(2) + '（' + Math.round(c.lisN) + ' 例' + (c.lisControl === 'both' ? '。聞こえない個体 ' + Math.round(c.lisDeafN) + ' 例に起きた変化は引いてある' : '。聞こえない個体との比較はまだない') + '）');
      else R.unknown.push('聞き手のふるまい（静かな所で鳴き声に出会った聞こえる個体 ' + Math.round(c.lisN) + ' 例・' + c.lisBodies + ' 匹、鳴いた個体 ' + c.callers + ' 匹。25 例・6 匹・鳴き手 3 匹から）');
      if (c.cutN >= 25) R.goes.push('耳を切られた個体（' + Math.round(c.cutN) + ' 例）の、鳴き声が始まった前後の変化：動く ' + c.cutMoved.toFixed(3) + '・食べる ' + c.cutEat.toFixed(3) + (c.cutTurnN >= 25 ? '・声の方へ向きを変える ' + c.cutTurn.toFixed(2) : '') + '（聞こえる個体での変化と比べるためのもの）');
      if (c.resembleN >= 20) R.goes.push('直後の鳴き声と直前の鳴き声の音程の近さ：無関係な鳴き声との差 ' + c.resemble.toFixed(3) + '（正なら似ている。血縁は元から似る）・音程を寄せた割合 ' + (c.pitchN ? p(c.pitchToward) : '—')); else R.unknown.push('鳴き声が似てくるか（' + Math.round(c.resembleN) + ' 例、20 例から）');
      if (c.sequenceN >= 50) R.goes.push('同じ個体の中での形の順序：持ち歌から無作為に選んだ場合との差 ' + c.sequenceOrder.toFixed(2) + '（正：同じ形を続ける、負：入れ替える、0：順序なし）'); else R.unknown.push('鳴き声の順序（2 種類以上の形を使う個体の鳴き声 ' + Math.round(c.sequenceN) + ' 回、50 回から）');
      if (c.dialectRegions >= 2) R.goes.push('海域による鳴き声の形の違い：' + c.dialectBits.toFixed(2) + ' ビット（遺伝の違いだけでも起きる）'); else R.unknown.push('海域による違い（鳴き声が 40 回以上ある海域が ' + c.dialectRegions + ' つ、2 つから）');
      if (c.shapeGenerations >= 1) R.goes.push('同じ形の鳴き声が使われた世代の幅：' + c.shapeGenerations + ' 世代（遺伝だけでも起きる）');
      R.inferred.push(this.deaf || this.mute ? '対照実験中（' + (this.deaf ? '耳' : '') + (this.deaf && this.mute ? 'と' : '') + (this.mute ? '声' : '') + 'が切られている）：切らない分岐との差が、聞こえること・鳴くことの効果' : 'この記録だけからは何も言えない。聞こえること・鳴くことが生存や行動を変えているかは、同じ世界から耳や声を切って分岐させた比較でしか分からない');
      return R;
    }
    // what a body has to hear and to sound with, worked out when the body is built: for each segment with hearing tissue the bands its ear takes in
    // (a bell around the pitch it is tuned to) and its sensitivity; for each segment with sound-making tissue the volume of that tissue.
    soundBody(o) {
      const b = o.b, segs = b.segs; b.hasEar = false; b.hasVoice = false; o.sp = pitchOfR(0.5 * Math.cbrt(o.prof.V));
      for (let i = 0; i < segs.length; i++) { const q = segs[i], p = q.p, hp = o.hp ? o.hp[i] : 1; q.earW = null; q.voxV = 0;
        if (p.ear > 0.02 && q.circ) { const w = new Float32Array(SND.B), wide = Math.max(0.05, p.hWide || 0.3); for (let k = 0; k < SND.B; k++) { const d = (k / (SND.B - 1) - (p.hTune == null ? 0.5 : p.hTune)) / wide; w[k] = Math.exp(-2 * d * d); } q.earW = w; q.earG = SND.ear * p.ear * hp; b.hasEar = true; }
        if (p.voice > 0.02 && q.circ) { const rm = (q.r0 + q.r1) / 2, zm = (q.z0 + q.z1) / 2; q.voxV = Math.PI * rm * zm * q.len * p.voice * hp; b.hasVoice = true; } }
    }
    // sound is made at a place, at a pitch (0 low .. 1 high). It enters the water at the start of the next tick, so that within one tick no body hears another before the other could hear it.
    emit(x, y, pitch, power, kind) {
      if (!(power > 0)) return;
      const i = this.cellAt(x, clamp(y, 0, this.H - 0.01)), q = clamp(pitch, 0, 1) * (SND.B - 1), b0 = Math.min(SND.B - 2, Math.floor(q)), f = q - b0;
      this.sndIn[b0][i] += power * (1 - f); this.sndIn[b0 + 1][i] += power * f; this.aco.out[kind] += power;
      if (kind === 'voice') { this.sndVIn[b0][i] += power * (1 - f); this.sndVIn[b0 + 1][i] += power * f; }
    }
    stepSound() {
      const B = SND.B, cols = this.cols, rows = this.rows, n = cols * rows, D = SND.D, r = this.rand, hF = this.hFlow || null;
      for (let k = 0; k < SND.bursts; k++) { const i = r.int(n), b = r.int(B); this.sndIn[b][i] += SND.burst * r() * r(); } // the water crackles
      for (let pass = 0; pass < 2; pass++) { const F = pass ? this.sndV : this.snd, IN = pass ? this.sndVIn : this.sndIn;
        for (let b = 0; b < B; b++) { const f = F[b], inn = IN[b], g = this.snd2, keep = 1 - SND.fade[b], amb = pass ? 0 : SND.amb[b];
          for (let i = 0; i < n; i++) if (inn[i] !== 0) { f[i] += inn[i]; inn[i] = 0; }
          for (let y = 0; y < rows; y++) { const row = y * cols, up = y ? row - cols : row, dn = y < rows - 1 ? row + cols : row;
            for (let x = 0; x < cols; x++) { const i = row + x, c = f[i]; g[i] = (c + D * (f[row + (x ? x - 1 : cols - 1)] + f[row + (x < cols - 1 ? x + 1 : 0)] + f[up + x] + f[dn + x] - 4 * c)) * keep + (amb ? amb * (hF ? 0.4 + hF[i] : 1) : 0); } }
          F[b] = g; this.snd2 = f; } }
      if (this.soundLag > 0) { // (control) keep the water of the last seconds, a snapshot every third tick; ears then read an old one
        if (this.tick % 3 === 0) { this.sndRing.push(this.snd.map(f => Float32Array.from(f))); const keepN = Math.ceil(this.soundLag * 10) + 1; while (this.sndRing.length > keepN) this.sndRing.shift(); }
        this.sndPast = this.sndRing.length ? this.sndRing[0] : null;
      } else this.sndPast = null;
      if (this.sndPend.length) this.voiceAfter();
      const rec = this.aco.recent, t0 = this.t - 8; while (rec.length && rec[0].t < t0) rec.shift();
      if (this.tick % 30 === 0) { // the notebook forgets: counts fade over about eight minutes, so that what it shows is the world as it is now (totals of sound made and paid for do not fade)
        const K = this.aco, T = K.tab, f = 0.998; for (const k in T) for (let i = 0; i < 4; i++) T[k][i] *= f;
        for (const k of ['after', 'expect', 'toward', 'away', 'on', 'replied', 'hearN', 'hearYes', 'resD', 'resN', 'chD', 'chN', 'seqN', 'seqRep', 'seqExp']) K[k] *= f;
        for (let i = 0; i < 18; i++) K.shape[i] *= f; for (const k in K.reg) { const a = K.reg[k]; for (let i = 0; i < 18; i++) a[i] *= f; } for (const c of K.lis) { for (const k in c) if (k !== 'ids') c[k] *= f; if (this.tick % 900 === 0) for (const id in c.ids) if (c.ids[id] < this.t - 500) delete c.ids[id]; } if (this.tick % 900 === 0) for (const id in K.who) if (K.who[id] < this.t - 500) delete K.who[id];
        // and it notes, once a second, where each body is, how far it has come, what it has eaten, and how loud the voices are there (the last three notes are kept)
        const V = this.sndV; for (const o of this.bodies) { const z = o.vs2 || {}; o.vs2 = o.vs1; o.vs1 = o.vs0; o.vs0 = z; z.t = this.t; z.path = o.path; z.eaten = o.eaten; z.x = o.cx; z.y = o.cy; const i = this.cellAt(o.cx, clamp(o.cy, 0, this.H - 0.01)); let v = 0; for (let b = 0; b < SND.B; b++) v += V[b][i]; z.v = v; } }
    }
    // what a body's ears take in, each at its own place: how loud the water is at the outer end of the segment, over the pitches the ear is tuned to
    hear(o) {
      const segs = o.b.segs, F = this.sndPast || this.snd, cut = this.deaf || o.deaf;
      for (let i = 0; i < segs.length; i++) { const q = segs[i], w = q.earW; if (!w) continue; if (cut) { q.e = 0; continue; }
        let L = 0; for (let b = 0; b < SND.B; b++) if (w[b] > 0.01) L += w[b] * this.nutAt(q.bx, q.by, F[b]); q.e = L * q.earG; }
    }
    // a voice sounds as hard as the segment's nerve circuit drives it, at its own pitch (pushed up or down by a neuron), and the body pays for the sound
    voiceOut(o, dt) {
      const C = A.organs.C, segs = o.b.segs; let cost = 0, loud = 0, pit = 0, shift = 0, base = 0;
      for (let i = 0; i < segs.length; i++) { const q = segs[i]; if (!(q.voxV > 0) || !(q.vo > 0)) continue;
        const p = clamp(q.p.pitch + q.p.bend * (q.vq || 0), 0, 1), pw = SND.voice * q.voxV * q.vo; this.emit(q.bx, q.by, p, pw, 'voice'); cost += C.call * q.voxV * q.vo * dt; if (q.vo > loud) { loud = q.vo; pit = p; shift = q.vq || 0; base = q.p.pitch; } }
      if (cost > 0) { o.E -= cost; o.voE = (o.voE || 0) + cost; this.aco.spent += cost; if (this.ledger) this.ledger.sound = (this.ledger.sound || 0) + cost; }
      o.voL = loud; o.voP = pit;
      // (record) A call begins when the voice rises above a fifth of its full strength, and has ended when it has stayed below a tenth for a fifth of a second.
      // A voice that hovers at one level, or one that a ringing circuit switches on and off many times a second, is one call, not many.
      const above = loud > (o.voOn ? 0.1 : 0.2); o.voGap = above ? 0 : (o.voGap || 0) + 1; this.voiceRecord(o, above || (!!o.voOn && o.voGap < 6), pit, shift, base, dt, loud > 0.2);
    }
    // The record of voices (counting only; no body ever sees it).
    voiceRecord(o, on, pit, shift, base, dt, sounding) {
      const K = this.aco; if (sounding) o.voT = (o.voT || 0) + dt;
      if (on && !o.voOn) { // --- a call begins
        o.voN = (o.voN || 0) + 1; o.voAt = this.t; o.voPit = pit; K.onsets++; K.on++;
        // Had other bodies within 16 units begun to sound just before (0.05-0.5 s)? Against that: how many would have, if those neighbours began at their
        // usual rates with no regard to anyone (their rate x 0.45 s). After / expected well above 1: beginnings follow beginnings — bodies are answering,
        // or are set off by the same thing (only silencing one side can tell). Two bodies that each keep their own rhythm give about 1.
        const seen = new Map(); let near = null;
        for (const e of K.recent) { if (e.id === o.id) continue; let dx = e.x - o.cx; if (dx > this.W / 2) dx -= this.W; else if (dx < -this.W / 2) dx += this.W; const dy = e.y - o.cy; if (dx * dx + dy * dy > 256) continue;
          const age = this.t - e.t, was = seen.get(e.id); seen.set(e.id, { r: e.r, hit: (was && was.hit) || (age >= 0.05 && age <= 0.5) }); if (age >= 0.05 && age <= 0.5) near = e; }
        for (const v of seen.values()) { K.expect += v.r * 0.45; if (v.hit) K.after++; }
        if (near) { K.replied++; // is the reply like what it followed? against how like it is to an unrelated recent call (kin sound alike anyway: see pitchToward for the stricter test)
          K.resD += Math.abs(pit - near.p); K.resN++;
          // if its neuron pushed its pitch: towards the pitch of the call it followed, or away from it?
          if (Math.abs(shift) > 0.02 && Math.abs(near.p - base) > 0.02) { if ((pit - base) * (near.p - base) > 0) K.toward++; else K.away++; } }
        if (K.pool.length > 8) { K.chD += Math.abs(pit - K.pool[(K.onsets * 7) % K.pool.length]); K.chN++; } K.pool.push(pit); if (K.pool.length > 32) K.pool.shift();
        K.recent.push({ id: o.id, t: this.t, x: o.cx, y: o.cy, p: pit, r: o.voN / Math.max(8, o.age) });
        K.who[o.id] = this.t; // (who has called lately: findings must rest on several callers, not on one body calling many times)
        if (this.sndPend.length < 1200 && this.t - (o.voMarkAt == null ? -9 : o.voMarkAt) >= 3) { o.voMarkAt = this.t; this.voiceMark(o); } // (the bodies around one caller are looked at once in three seconds: the stretches before and after must not overlap)
      } else if (!on && o.voOn) { // --- a call ends: its shape (band of pitch x short, middling, long), who uses it, where, and what shape this body made before
        const dur = Math.max(0, this.t - (o.voAt || this.t) - 6 * dt); this.voiceShape(o, Math.min(5, Math.floor((o.voPit || 0) * 6)) * 3 + (dur < 0.4 ? 0 : dur < 1.5 ? 1 : 2));
      }
      o.voOn = on;
    }
    // (record) a call of a given shape has ended
    voiceShape(o, sh) {
      const K = this.aco; K.shape[sh]++; const g = K.gen[sh] || (K.gen[sh] = [o.gen, o.gen]); if (o.gen < g[0]) g[0] = o.gen; if (o.gen > g[1]) g[1] = o.gen;
      const rg = this.regions ? this.regionAt(o.cx) : 0, R = K.reg[rg] || (K.reg[rg] = new Array(18).fill(0)); R[sh]++;
      // Order: did this body make the same shape as the last time? Against how often it would, if it drew each call from its own repertoire so far without regard
      // to the one before. (Pooling bodies would not do: bodies that each keep to one shape would look like order.) Only bodies that have used two shapes count.
      const rep = o.voRep || (o.voRep = {}), N = o.voRepN || 0; let kinds = 0, same = 0; for (const k in rep) { kinds++; same += rep[k] * (rep[k] - 1); }
      if (N >= 4 && kinds >= 2) { K.seqN++; if (o.voPrev === sh) K.seqRep++; K.seqExp += same / (N * (N - 1)); }
      rep[sh] = (rep[sh] || 0) + 1; o.voRepN = N + 1; o.voPrev = sh;
    }
    // (record) What do the bodies around do when a call begins? Up to eight within 16 units, around which no voice could be heard for the last two to three
    // seconds, are noted — with what they did in those seconds — and looked at again after as long a time.
    voiceMark(o) {
      let k = 0; const t = this.t, Q = this.sndQuiet, half = this.W / 2;
      for (const q of this.bodies) { if (q === o || q.dead) continue; const z = q.vs2; if (!z || !(z.v < Q && q.vs1.v < Q && q.vs0.v < Q)) continue;
        let dx = q.cx - o.cx; if (dx > half) dx -= this.W; else if (dx < -half) dx += this.W; const dy = q.cy - o.cy, d2 = dx * dx + dy * dy; if (d2 > 256) continue;
        const L = t - z.t; if (L < 1.5) continue; let px = q.cx - z.x; if (px > half) px -= this.W; else if (px < -half) px += this.W; // (px, py): where it came from in those seconds
        this.sndPend.push({ o: q, due: t + L, L, bx: -dx, by: -dy, qx: q.cx, qy: q.cy, px, py: q.cy - z.y, path: q.path, eaten: q.eaten, ear: q.b.hasEar ? (this.deaf || q.deaf ? 2 : 1) : 0, pm: (q.path - z.path) / L, pe: q.eaten > z.eaten ? 1 : 0 });
        if (++k >= 8) break; }
    }
    voiceAfter() {
      const P = this.sndPend, K = this.aco, half = this.W / 2; let n = 0;
      for (let i = 0; i < P.length; i++) { const e = P[i]; if (e.due > this.t) { P[n++] = e; continue; } const q = e.o; if (q.dead) continue;
        let dx = q.cx - e.qx; if (dx > half) dx -= this.W; else if (dx < -half) dx += this.W; const dy = q.cy - e.qy;
        const pm = (q.path - e.path) / e.L, m = pm - e.pm, eat = (q.eaten > e.eaten ? 1 : 0) - e.pe, L = K.lis[e.ear];
        L.n++; L.m += m; L.m2 += m * m; L.eat += eat; L.eat2 += eat * eat; L.pre += e.pm; L.post += pm; L.ids[q.id] = this.t;
        if (dx * dx + dy * dy > 0.01 && e.px * e.px + e.py * e.py > 0.01) { const to = Math.atan2(e.by, e.bx), off = a => Math.abs(wrapPi(a - to)), h = off(Math.atan2(e.py, e.px)) - off(Math.atan2(dy, dx)); L.hn++; L.h += h; L.h2 += h * h; } }
      P.length = n;
    }
    // (record) once a second, for a body with a voice: is it sounding, and what state is it in? Kept as counts, old ones fading (about 8 minutes).
    voiceNote(o) {
      if (o.voOn) this.aco.who[o.id] = this.t;
      const T = this.aco.tab, segs = o.b.segs, call = o.voOn ? 1 : 0, pr = o.prof; let touched = 0, seeing = 0, hearing = 0;
      for (let i = 0; i < segs.length; i++) { const q = segs[i]; if (q.tch > 0.01) touched = 1; if (q.v > 0.2) seeing = 1; if (q.e > 0.15) hearing = 1; }
      const st = { ate: o.eaten > (o.voEaten == null ? o.eaten : o.voEaten) ? 1 : 0, hungry: o.E < 0.35 * pr.Emax ? 1 : 0, fed: o.G > 0.3 * pr.gutCap ? 1 : 0, touched, hurt: o.hp && o.hp.some(h => h < 1) ? 1 : 0, seeing, hearing, young: o.stage < 1 ? 1 : 0 };
      o.voEaten = o.eaten; for (const k in st) { const t = T[k] || (T[k] = [0, 0, 0, 0]); t[call * 2 + st[k]]++; }
      const K = this.aco; let heard = 0; for (const e of K.recent) { if (e.id === o.id) continue; const age = this.t - e.t; if (age < 0.05 || age > 0.5) continue; let dx = e.x - o.cx; if (dx > this.W / 2) dx -= this.W; else if (dx < -this.W / 2) dx += this.W; const dy = e.y - o.cy; if (dx * dx + dy * dy <= 256) { heard = 1; break; } }
      K.hearN++; K.hearYes += heard;
    }
    // (wave) how rich the water is at x just now, as a multiple of the usual; the wave fits the world's length a whole number of times
    waveAt(x) { const L = this.W / Math.max(1, Math.round(this.W / this.waveLength)); return 1 + this.waveDepth * Math.sin(TAU * (x / L - this.t / this.wave)); }
    waveCols() { const f = this.wcol || (this.wcol = new Float64Array(this.cols)); for (let x = 0; x < this.cols; x++) f[x] = this.waveAt((x + 0.5) * this.cell); return f; }
    yolkOf(g) { return this.invest && g.yolk != null ? g.yolk : A.organs.C.eggReserve; }
    afford(g, B, rf) { // rf: the share of reserve the mother meant the egg to have, where that is hers to set (never counted above the usual share)
      const C = A.organs.C, re = rf == null ? C.eggReserve : Math.min(rf, C.eggReserve), cost = s => { const p = A.organs.profile(A.development.develop(g, { stage: s, maxSegs: this.maxSegs, pair: this.pair })); return [p.buildCost + re * p.Emax, p.buildCost]; };
      if (cost(g.birth)[0] <= B + 1e-9) return g.birth;
      const bud = 0.05, c = cost(bud); if (c[1] > B) return null; if (c[0] > B) return bud;
      let lo = bud, hi = g.birth; for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (cost(mid)[0] <= B) lo = mid; else hi = mid; }
      return lo;
    }
    note(o) {
      const F = this.firsts, f = o.full, once = (k, text) => { if (!F[k]) { F[k] = o.id; this.log(text, o.id); } };
      if (o.gen === 0 || o.introduction) return; // introduced ancestry is not a natural-evolution first
      if (f.segs > 1) once('multi', '初の多体節（' + f.segs + ' 体節）');
      if (f.mouths.length > 1) once('mouths', '初の複数の口（' + f.mouths.length + ' 個）');
      if (f.eye > 0) once('eye', '初の眼');
      if (this.genome2) { if (o.gu.expr > 1) once('parts2', '初めて 2 種類以上の部品でできた身体（' + o.gu.expr + ' 種類）'); if (o.gu.zones > 0) once('zones', '初の体軸の区分（軸の途中で部品が切り替わる身体）'); if (o.gu.zones > 0 && o.gu.div > 0.05) once('differ', '初の区分の分化（切り替わった先の部品が、元の部品と 5% 以上違う）'); }
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
    // Keep the written past within limits (see recordPlans, recordAge, recordSteps). Only records are touched: genomes of plans and of ancestors that nothing alive carries.
    thin() {
      const P = this.recordPlans, ended = []; for (const c of this.clades.values()) if (c.ended != null && c.g) ended.push(c);
      if (ended.length > P) { const keep = new Set(); ended.sort((a, b) => b.members - a.members || b.ended - a.ended || a.id - b.id); for (let i = 0; i < Math.ceil(P / 2); i++) keep.add(ended[i]);
        ended.sort((a, b) => b.ended - a.ended || a.id - b.id); for (let i = 0; i < ended.length && keep.size < P; i++) keep.add(ended[i]);
        for (const c of ended) if (!keep.has(c)) { c.g = null; this.genomesDropped = (this.genomesDropped || 0) + 1; } }
      const old = this.t - this.recordAge, turned = []; // ancestors: the trunk of the genealogy is one body per generation for as long as the world has run
      for (const n of this.tree.values()) { if (!n.g || n.died == null || n.died >= old || n.introduction || !this.tree.has(n.parent)) continue; if (n.changed) turned.push(n); else { n.mut = n.g.mutations; n.g = null; } }
      if (turned.length > this.recordSteps) { turned.sort((a, b) => b.died - a.died || b.id - a.id); for (let i = this.recordSteps; i < turned.length; i++) { turned[i].mut = turned[i].g.mutations; turned[i].g = null; } }
      if (this.clades.size > 4000) { // the records of one and two bodies went first (above); if plans with more members alone are too many, the smallest and oldest of the extinct go
        const gone = [...this.clades.values()].filter(c => c.ended != null).sort((a, b) => a.members - b.members || a.ended - b.ended || a.id - b.id);
        for (let i = 0; i < gone.length && this.clades.size > 3500; i++) { this.clades.delete(gone[i].id); this.cladesDropped = (this.cladesDropped || 0) + 1; } }
    }
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
    // which bodies are in which cell (for sight and for contact)
    index() { const bg = this.bgrid; for (let i = 0; i < bg.length; i++) bg[i].length = 0; for (const o of this.bodies) { o.rad = Math.sqrt(o.prof.V / Math.PI); bg[this.cellAt(o.cx, clamp(o.cy, 0, this.H - 0.01))].push(o); } }
    // ---- bodies meet ----
    // Every segment is, for this purpose, a disc at its far end. Discs of two bodies that overlap push each other apart
    // (equal and opposite, so nothing is gained). A mouth that reaches another body's segment tears tissue from it.
    touch(dt) {
      const bg = this.bgrid, cell = this.cell, W = this.W, half = W / 2; let maxExt = 0; const hurt = [];
      for (const o of this.bodies) { let e = 0; for (const s of o.b.segs) { s.tch = 0; s.torn = 0; let dx = s.bx - o.cx; dx -= W * Math.round(dx / W); const d = Math.sqrt(dx * dx + (s.by - o.cy) * (s.by - o.cy)) + s.r1; if (d > e) e = d; if (this.solid && s.id === 0) { let ax = s.ax - o.cx; ax -= W * Math.round(ax / W); const d0 = Math.sqrt(ax * ax + (s.ay - o.cy) * (s.ay - o.cy)) + s.r0; if (d0 > e) e = d0; } } o.ext = e; if (e > maxExt) maxExt = e; }
      for (const a of this.bodies) {
        const R = a.ext + maxExt, c0 = Math.floor((a.cx - R) / cell), c1 = Math.floor((a.cx + R) / cell), r0 = Math.max(0, Math.floor((a.cy - R) / cell)), r1 = Math.min(this.rows - 1, Math.floor((a.cy + R) / cell));
        if (c1 - c0 >= this.cols) continue; // (a body as wide as the world: not handled)
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) for (const b of bg[r * this.cols + ((c % this.cols) + this.cols) % this.cols]) {
          if (b.id <= a.id || a.dead || b.dead) continue;
          let dx = b.cx - a.cx; if (dx > half) dx -= W; else if (dx < -half) dx += W; const dy = b.cy - a.cy, reach = a.ext + b.ext;
          if (dx * dx + dy * dy < reach * reach) this.meet(a, b, dt, hurt);
        }
      }
      if (this.solid) for (const o of this.bodies) if (o.self && !o.dead) this.selfTouch(o, dt); // a body cannot pass through itself
      for (const o of hurt) if (!o.dead) this.wound(o);
    }
    meet(a, b, dt, hurt) {
      const P = A.physics, W = this.W, half = W / 2, A2 = a.b, B2 = b.b, sa = A2.segs, sb = B2.segs, near = this.adhere ? 0.15 : 0, mix = this.mix, S = this.solid, N = P.near; let touch = 0, bare = false;
      for (let i = 0; i < sa.length; i++) { const p = sa[i]; for (let j = 0; j < sb.length; j++) { const q = sb[j];
        let dx, dy, R, d2, ts = 1, tt = 1; // (ts, tt: how far along each segment they touch; 1 = the far end)
        if (S) { if (p.gone || q.gone) continue; const ex = q.bx - p.bx, sh = ex > half ? -W : ex < -half ? W : 0, ey = q.by - p.by, far = p.len + q.len + p.r0 + p.r1 + q.r0 + q.r1 + near; if ((ex + sh) * (ex + sh) + ey * ey > far * far) continue;
          const dn = P.nearest(p, q, sh, 0); ts = N.s; tt = N.t; dx = N.x; dy = N.y; d2 = dn * dn; R = p.r0 + (p.r1 - p.r0) * ts + q.r0 + (q.r1 - q.r0) * tt; }
        else { dx = q.bx - p.bx; if (dx > half) dx -= W; else if (dx < -half) dx += W; dy = q.by - p.by; R = p.r1 + q.r1; d2 = dx * dx + dy * dy; }
        if (d2 >= (R + near) * (R + near)) continue;
        if (near) { // (adhere) surfaces within reach of each other
          const d0 = Math.sqrt(d2) || 1e-6, gap = d0 > R ? d0 - R : 0, close = 1 - gap / near, ma = A2.rigid ? A2.mass : A2.m[p.b], mb = B2.rigid ? B2.mass : B2.m[q.b], mr = ma * mb / (ma + mb);
          const hold = (p.pad ? p.p.grip * p.press : 0) + (q.pad ? q.p.grip * q.press : 0); // a pressed pad on either side
          if (hold > 0) { const k = Math.min(0.5, 6 * hold * dt) * close, rvx = B2.vx[q.b] - A2.vx[p.b], rvy = B2.vy[q.b] - A2.vy[p.b], pull = Math.min(0.1, 8 * gap * hold * dt), jx = mr * (k * rvx + pull * dx / d0), jy = mr * (k * rvy + pull * dy / d0); // drag towards the other's speed, and a pull across the gap
            if (S) { P.impulseAt(A2, p, ts, jx, jy); P.impulseAt(B2, q, tt, -jx, -jy); } else { P.impulse(A2, p.b, jx, jy); P.impulse(B2, q.b, -jx, -jy); } a.held = b.held = this.tick; }
          const c = Math.max(0, 1 - p.p.skin - p.p.armor) * Math.max(0, 1 - q.p.skin - q.p.armor) * close; if (c > touch) touch = c;
          if (d0 >= R) continue;
        }
        const d = Math.sqrt(d2) || 1e-6, ma = A2.rigid ? A2.mass : A2.m[p.b], mb = B2.rigid ? B2.mass : B2.m[q.b], J = ma * mb / (ma + mb) * Math.min(0.2, 12 * (R - d) * dt), jx = J * dx / d, jy = J * dy / d;
        if (mix && !bare && p.p.skin + p.p.armor < 1 && q.p.skin + q.p.armor < 1) bare = true;
        if (S) { P.impulseAt(A2, p, ts, -jx, -jy); P.impulseAt(B2, q, tt, jx, jy); } else { P.impulse(A2, p.b, -jx, -jy); P.impulse(B2, q.b, jx, jy); } p.tch += J / ma; q.tch += J / mb; // each feels the change of speed the push gives it
        if (this.sound) this.emit((S ? p.ax + (p.bx - p.ax) * ts : p.bx) + dx * 0.5, (S ? p.ay + (p.by - p.ay) * ts : p.by) + dy * 0.5, pitchOfR(Math.min(p.r1, q.r1)), SND.hit * J * J * (ma + mb) / (ma * mb), 'hit');
      } }
      if (bare) { if (!a.got || a.got.id !== b.id) a.got = { id: b.id, g: b.g }; if (!b.got || b.got.id !== a.id) b.got = { id: a.id, g: a.g }; } // (mix) each now carries the other's genetic material, in place of any it had
      if (touch > 0 && !this.noSeep) { // reserve seeps towards the emptier body, never past the point where they are equally full, never more than the receiver can hold
        const C = A.organs.C, fa = a.E / a.prof.Emax, fb = b.E / b.prof.Emax, to = fa > fb ? b : a, from = fa > fb ? a : b, diff = Math.abs(fa - fb);
        const flow = Math.max(0, Math.min(C.seep * touch * diff * dt, 0.25 * diff * Math.min(a.prof.Emax, b.prof.Emax), to.prof.Emax - to.E, from.E));
        if (flow > 0) { from.E -= flow; to.E += flow; from.seepOut = (from.seepOut || 0) + flow; to.seepIn = (to.seepIn || 0) + flow; }
      }
      if (this.noBite) return;
      for (let k = 0; k < 2; k++) { const e = k ? b : a, v = k ? a : b; // each one's mouths on the other
        for (const m of e.prof.mouths) { const s = e.b.segs[m.seg], gape = m.gape * (s.mo == null ? 1 : s.mo); if (gape <= 0) continue; let best = -1, bd = Infinity; // (a mouth held shut takes nothing)
          for (let j = 0; j < v.b.segs.length; j++) { const q = v.b.segs[j]; if (v.hp && v.hp[j] <= 0) continue; let dx = q.bx - s.bx; if (dx > half) dx -= W; else if (dx < -half) dx += W;
            let d; if (S) { MOUTH.ax = MOUTH.bx = s.bx; MOUTH.ay = MOUTH.by = s.by; const sh = q.bx - s.bx > half ? -W : q.bx - s.bx < -half ? W : 0; d = P.nearest(MOUTH, q, sh, 0) - (q.r0 + (q.r1 - q.r0) * N.t); } else d = Math.sqrt(dx * dx + (q.by - s.by) * (q.by - s.by)) - q.r1;
            if (d < gape && d < bd) { bd = d; best = j; } }
          if (best >= 0 && this.bite(e, m, s, v, best, dt, gape) && hurt.indexOf(v) < 0) hurt.push(v);
        } }
    }
    // A mouth takes tissue: as much as its gape and jaw muscle tear in this moment, less through armour and skin, and no more than its gut can hold.
    // What the eater's gut receives is exactly what leaves the other body: the food still in that tissue, and that tissue's share of its reserve and gut contents.
    bite(e, m, s, v, j, dt, gape) {
      const C = A.organs.C, room = e.prof.gutCap - e.G; if (room <= 1e-9 || v.prof.V <= 1e-9) return false;
      const q = v.b.segs[j], hp = v.hp || (v.hp = new Array(v.b.segs.length).fill(1)), vol = Math.PI * (q.r0 + q.r1) / 2 * (q.z0 + q.z1) / 2 * q.len;
      if (gape == null) gape = m.gape;
      let dv = Math.min(C.bite * gape * gape * (0.4 + 1.2 * s.p.muscle) * Math.max(0.05, 1 - 0.85 * q.p.armor - 0.3 * q.p.skin) * dt, vol * hp[j]); if (dv <= 0) return false;
      const per = C.flesh * C.build + (Math.max(0, v.E) + v.G) / v.prof.V; if (dv * per > room) dv = room / per;
      const share = Math.min(1, dv / v.prof.V), eE = Math.max(0, v.E) * share, eG = v.G * share, got = C.flesh * C.build * dv + eE + eG;
      v.E -= eE; v.G -= eG; hp[j] -= dv / vol; if (hp[j] < 1e-6) hp[j] = 0; q.torn += dv / vol / dt;
      if (this.ledger) this.ledger.bite += (1 - C.flesh) * C.build * dv; if (this.recycle) this.giveBack(q.bx, q.by, (1 - C.flesh) * C.build * dv);
      if (this.learn) s.ate = (s.ate || 0) + got / e.prof.gutCap;
      if (this.sound) this.emit(q.bx, q.by, pitchOfR(q.r1), SND.tear * dv, 'tear');
      e.G += got; e.flesh = (e.flesh || 0) + got; e.eaten += got; this.counts.flesh += got; this.counts.torn += got; v.lost = (v.lost || 0) + got; v.biter = e.id;
      return true;
    }
    // Bring a wounded body's functions in line with the tissue it has left: metabolism, gut, gonad, reserve, mouth and eye through the
    // organ profile; muscle torque, cilia and pads in the physics. It dies of its wounds when the root segment or most of the body is gone.
    wound(o) {
      const hp = o.hp, segs = o.b.segs; if (!hp) return;
      if (this.solid) for (let i = 1; i < segs.length; i++) if (hp[i] <= 0 && !segs[i].gone) this.sever(o, i);
      for (let i = 0; i < segs.length; i++) { const h = hp[i], s = segs[i]; o.plan.segs[i].hp = h; if (s.base == null) s.base = [s.tauMax, s.cil, s.padCap || 0]; s.tauMax = s.base[0] * h; s.cil = s.base[1] * h; s.padCap = s.base[2] * h; s.hp = h; }
      o.prof = A.organs.profile(o.plan); if (this.sound) this.soundBody(o);
      if (this.solid) { A.physics.remass(o.b, hp); for (let i = 1; i < segs.length; i++) { const s = segs[i]; if (s.gone) { s.circ = false; s.a = 0; if (s.na) s.na.fill(0); s.vk = 0; } } } // (what is gone weighs nothing, catches no water and carries no signal)
      if (hp[0] < 0.05 || o.prof.V < 0.3 * o.cleanV) o.dead = 'killed';
    }
    // Sight. Each segment with eye tissue and a wire from it looks along its own direction (turned by `gaze`), over a cone
    // that is narrower and reaches further the more eye tissue it has. It reports one number: how much of that field is
    // filled by things of the colour it is tuned to. Food grains and other bodies are the same kind of thing to it.
    // Nothing hides anything else (no shadows yet).
    see(o) {
      const b = o.b, segs = b.segs, off = o.sightless || this.sightless, cell = this.cell, W = this.W;
      for (let i = 0; i < segs.length; i++) {
        const q = segs[i], p = q.p; if (p.eye <= 0.1 || (p.vE === 0 && !(p.nn && A.neural.compile(p.nn).sees))) continue;
        if (off) { q.v = 0; continue; }
        const sgn = i === 0 ? -1 : 1, ca = Math.cos(p.gaze), sa = Math.sin(p.gaze), ux = sgn * (q.dx * ca - q.dy * sa), uy = sgn * (q.dx * sa + q.dy * ca);
        const ex = (q.ax + q.bx) * 0.5, ey = (q.ay + q.by) * 0.5, R = 4 + 22 * Math.sqrt(p.eye * Math.max(q.r0, q.r1)), cosHalf = Math.cos(1.2 - 0.8 * p.eye), tune = p.tune;
        let sum = 0; const c0 = Math.floor((ex - R) / cell), c1 = Math.floor((ex + R) / cell), r0 = Math.max(0, Math.floor((ey - R) / cell)), r1 = Math.min(this.rows - 1, Math.floor((ey + R) / cell));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const ci = r * this.cols + ((c % this.cols) + this.cols) % this.cols;
          const look = (x, y, size, hue) => {
            let dx = x - ex; if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
            const dy = y - ey, d2 = dx * dx + dy * dy; if (d2 > R * R || d2 < 1e-9) return;
            const d = Math.sqrt(d2); if ((dx * ux + dy * uy) / d < cosHalf) return;
            const m = Math.cos(hue * Math.PI / 180 - tune); if (m <= 0) return;
            sum += m * m * Math.min(1, size / d);
          };
          for (const f of this.grid[ci]) look(f.x, f.y, f.size, this.foodHue);
          for (const q2 of this.bgrid[ci]) if (q2 !== o) look(q2.cx, q2.cy, q2.rad, q2.g.hue);
        }
        q.v = sum * (q.hp == null ? 1 : q.hp); // an eye that has lost tissue sees that much less
      }
    }
    nutAt(x, y, field) {
      const c = this.cell, fx = x / c - 0.5, fy = clamp(y / c - 0.5, 0, this.rows - 1), x0 = Math.floor(fx), y0 = Math.min(this.rows - 2, Math.floor(fy)), tx = fx - x0, ty = fy - y0, n = this.cols, N = field || this.nut;
      const a = ((x0 % n) + n) % n, b = (a + 1) % n, r0 = Math.max(0, y0) * n, r1 = Math.max(0, y0 + 1) * n;
      return (N[r0 + a] * (1 - tx) + N[r0 + b] * tx) * (1 - ty) + (N[r1 + a] * (1 - tx) + N[r1 + b] * tx) * ty;
    }
    // For 0 <= x < W, ((x % W) + W) % W is exactly (x + W) - W (the sum lies in [W, 2W], where subtracting W is exact), or 0 if the sum rounded up to 2W.
    // Written out so, it costs no remainder; every result is bit-for-bit what the plain formula gives.
    cellAt(x, y) { const W = this.W; let m; if (x >= 0 && x < W) { m = x + W; m = m < W + W ? m - W : 0; } else m = ((x % W) + W) % W; return clamp(Math.floor(y / this.cell), 0, this.rows - 1) * this.cols + Math.floor(m / this.cell); }
    wrapX(u) { const W = this.W; if (u >= 0) { if (u < W) { u += W; return u < W + W ? u - W : 0; } } else if (u > -W) { u += W; return u < W ? u : 0; } return ((u % W) + W) % W; }
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
    // ---- the energy ledger (audit: 1) ----
    // Everything that holds energy at this moment: dissolved food, grains, and in every body its reserve, gut contents, savings for growth and eggs, and the cost of the tissue it has.
    stored() { let s = 0; for (let i = 0; i < this.nut.length; i++) s += this.nut[i]; for (const f of this.food) if (f.e > 0) s += f.e; for (const o of this.bodies) s += o.E + o.G + o.grow + o.egg + o.prof.buildCost; return s; }
    // matter a body loses goes into the water at that place (recycle: 1). In the ledger it stays listed under what it was lost as, and again as inflow under 'recycled'.
    giveBack(x, y, e) { if (!(e > 0)) return; this.nut[this.cellAt(x, clamp(y, 0, this.H - 0.01))] += e; if (this.ledger) this.ledger.recycled += e; }
    grainClass(k) { if (!this.rainSizes) { this.rainSizes = new Set([...this.grainSizes, ...this.bottomSize].map(String)); if (this.regions) for (const q of this.regions) for (const z of q.grains.sizes) this.rainSizes.add(String(z)); } if (!this.rainSizes.has(k)) k = '死骸'; return this.grains[k] || (this.grains[k] = { in: 0, eaten: 0, expired: 0, tooBig: 0, gutFull: 0 }); } // grains of any other size came from dead bodies
    addFood(x, y, size, e, fixed, life) { const f = { x: ((x % this.W) + this.W) % this.W, y: clamp(y, 0.5, this.H - 0.5), size, e, fixed, die: this.t + life }; if (this.ledger) { if (!this.corpse) this.ledger.rain += e; f.c = this.corpse ? '死骸' : String(size); this.grainClass(f.c).in += e; } this.food.push(f); }

    stepFood(dt) {
      const r = this.rand;
      if (this.regions) return this.stepFoodMap(dt);
      // drifting grains appear inside moving patches
      this.grainDebt = (this.grainDebt || 0) + this.grainRate * dt;
      while (this.grainDebt > 0) {
        const i = this.pick(this.grainSizes, this.grainShare);
        const size = this.grainSizes[i], e = this.grainEnergy * size * size * size, p = this.patch[r.int(this.patch.length)], a = r() * TAU, d = Math.sqrt(r()) * this.patchRadius;
        if (this.wave > 0 && r() * (1 + this.waveDepth) > this.waveAt(p.x + Math.cos(a) * d)) continue; // (wave) lean water here: this grain falls somewhere else instead
        this.addFood(p.x + Math.cos(a) * d, clamp(p.y + Math.sin(a) * d, 1, this.yBottom - 1), size, e, false, this.grainLife); this.grainDebt -= e;
      }
      this.bottomDebt = (this.bottomDebt || 0) + this.bottomRate * dt;
      while (this.bottomDebt > 0) { const size = this.bottomSize[this.pick(this.bottomSize, null)], e = this.grainEnergy * size * size * size, bx = r() * this.W; if (this.wave > 0 && r() * (1 + this.waveDepth) > this.waveAt(bx)) continue; this.addFood(bx, this.yBottom + 1 + r() * (this.H - this.yBottom - 2), size, e, true, this.bottomLife); this.bottomDebt -= e; }
      for (const p of this.patch) { p.a += (r() - 0.5) * 0.3; p.x = ((p.x + Math.cos(p.a) * 0.6 * dt) % this.W + this.W) % this.W; p.y = clamp(p.y + Math.sin(p.a) * 0.6 * dt, 6, this.yBottom - 6); }
      for (const c of this.grid) c.length = 0;
      // drifting grains are jostled in turns, a quarter of them each step for four steps' worth: the same spreading, a quarter of the work
      const every = this.jostleEvery; let n = 0; const ph = this.tick % every, dt4 = dt * every, jit = this.jitter * Math.sqrt(dt4); const yB = this.yBottom, fw = this.flow;
      for (let i = 0; i < this.food.length; i++) {
        const f = this.food[i];
        if (f.e <= 0 || f.die < this.t) { if (this.ledger && f.e > 0) { this.ledger.expire += f.e; this.grainClass(f.c || String(f.size)).expired += f.e; } continue; }
        if (!f.fixed && i % every === ph) { // (the current of flowAt, written out: no array is made per grain)
          let vx = 0, vy = 0; if (!(f.y >= yB)) { const k = clamp((yB - f.y) / 8, 0, 1); vx = fw * k * Math.sin(TAU * (f.y / yB * 1.5 + this.t / 180)); vy = fw * 0.5 * k * Math.sin(TAU * (f.x / this.W * 2 + this.t / 130)); }
          f.x = this.wrapX(f.x + vx * dt4 + (r() + r() + r() - 1.5) * 2 * jit); f.y = clamp(f.y + (vy + this.sink) * dt4 + (r() + r() + r() - 1.5) * 2 * jit, 0.5, this.H - 0.5); if (f.y >= yB) f.fixed = true; }
        this.food[n++] = f; this.grid[this.cellAt(f.x, f.y)].push(f);
      }
      this.food.length = n;
      if (this.tick % 6 === 0) { // dissolved food regrows and spreads
        const { nut, nut2, cols, rows } = this, k = this.nutrientDiffuse, g = this.nutrientRegrow * dt * 6, wf = this.wave > 0 ? this.waveCols() : null;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const i = y * cols + x, l = y * cols + (x + cols - 1) % cols, rr = y * cols + (x + 1) % cols, u = y ? i - cols : i, d = y < rows - 1 ? i + cols : i;
          nut2[i] = nut[i] + k * (nut[l] + nut[rr] + nut[u] + nut[d] - 4 * nut[i]) + (wf ? g * wf[x] : g) * (this.nutrientCap - nut[i]);
        }
        if (this.ledger) { let a = 0, b = 0; for (let i = 0; i < nut.length; i++) { a += nut[i]; b += nut2[i]; } this.ledger.regrow += b - a; }
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
          if (this.wave > 0 && r() * (1 + this.waveDepth) > this.waveAt(x)) continue; // (wave) lean water here: this grain falls somewhere else instead
          const fixed = g.settle >= 1; this.addFood(x, y, size, e, fixed, fixed ? this.bottomLife : this.grainLife); q.debt -= e;
        }
        for (const p of q.patch) { p.a += (r() - 0.5) * 0.3; p.x = clamp(p.x + Math.cos(p.a) * 0.6 * dt, q.x0 + g.radius, q.x1 - g.radius); p.y = clamp(p.y + Math.sin(p.a) * 0.6 * dt, 8, this.H - 8); }
      }
      for (const c of this.grid) c.length = 0;
      let n = 0; const sq = Math.sqrt(dt), H = this.H, safe = H - 0.01, hFlow = this.hFlow, hJit = this.hJit, hSettle = this.hSettle;
      for (let i = 0; i < this.food.length; i++) {
        const f = this.food[i];
        if (f.e <= 0 || f.die < this.t) { if (this.ledger && f.e > 0) { this.ledger.expire += f.e; this.grainClass(f.c || String(f.size)).expired += f.e; } continue; }
        let ci = this.cellAt(f.x, f.y);
        if (!f.fixed) {
          let vx, vy; // (the current of flowAt, written out; a grain's y is always inside the world, so its cell is the one just found)
          if (f.y >= 0 && f.y <= safe) { const k = this.flow * hFlow[ci]; vx = k * Math.sin(TAU * (f.y / H * 1.5 + this.t / 180)); vy = 0.5 * k * Math.sin(TAU * (f.x / 160 * 2 + this.t / 130)); } else { const v = this.flowAt(f.x, f.y); vx = v[0]; vy = v[1]; }
          const jit = this.jitter * hJit[ci] * sq;
          f.x = this.wrapX(f.x + vx * dt + (r() + r() + r() - 1.5) * 2 * jit); f.y = clamp(f.y + vy * dt + (r() + r() + r() - 1.5) * 2 * jit, 0.5, H - 0.5);
          ci = this.cellAt(f.x, f.y); const st = hSettle[ci]; if (st > 0 && r() < st * dt) f.fixed = true;
        }
        this.food[n++] = f; this.grid[ci].push(f);
      }
      this.food.length = n;
      if (this.tick % 6 === 0) {
        const { nut, nut2, cols, rows } = this, k = this.nutrientDiffuse, g = this.nutrientRegrow * dt * 6, wf = this.wave > 0 ? this.waveCols() : null;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const i = y * cols + x, l = y * cols + (x + cols - 1) % cols, rr = y * cols + (x + 1) % cols, u = y ? i - cols : i, d = y < rows - 1 ? i + cols : i;
          nut2[i] = nut[i] + k * (nut[l] + nut[rr] + nut[u] + nut[d] - 4 * nut[i]) + (wf ? g * wf[x] : g) * this.hRegrow[i] * (this.nutrientCap - nut[i]);
        }
        if (this.ledger) { let a = 0, b = 0; for (let i = 0; i < nut.length; i++) { a += nut[i]; b += nut2[i]; } this.ledger.regrow += b - a; }
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
      const dt = this.dt, C = A.organs.C, P = A.physics, lg = this.ledger;
      this.stepFood(dt);
      if (this.sound) this.stepSound();
      if (this.scent && this.tick % 6 === 0) this.stepScent(dt * 6);
      if (this.vision || this.contact) this.index();
      if (this.contact) this.touch(dt);
      const born = [];
      for (const o of this.bodies) {
        if (o.dead) continue;
        const b = o.b; let pr = o.prof;
        const ground0 = this.regions ? this.hGround[this.cellAt(o.cx, clamp(o.cy, 0, this.H - 0.01))] === 1 : o.cy >= this.yBottom, fl = this.flowAt(o.cx, o.cy);
        let ground = ground0;
        if (this.regions && this.shore > 0) { const L = this.slope(o.cx, true); ground = L > 1e-6; b.env.gravity = 4 * L; } // the load, and with it friction and grip, comes on gradually
        else if (this.regions) b.env.gravity = 4 * this.hWeight[this.cellAt(o.cx, clamp(o.cy, 0, this.H - 0.01))];
        b.env.ground = ground; b.env.flowX = fl[0]; b.env.flowY = fl[1];
        if ((this.tick + o.id) % 5 === 0) { this.sense(o); if (this.vision && !o.passive) this.see(o); }
        if (b.hasCircuit && !o.passive) { // each wired segment tastes the water where it is; the circuit does the rest
          const taste = this.taste, cut = o.numb || this.numb, segs = b.segs;
          for (let i = 0; i < segs.length; i++) taste[i] = cut || !segs[i].circ ? 0.5 : this.nutAt((segs[i].ax + segs[i].bx) * 0.5, (segs[i].ay + segs[i].by) * 0.5) / this.nutrientCap;
          let smA = null, smB = null;
          if (this.scent) { // and what bodies have leaked there
            smA = this.smA; smB = this.smB; const off = o.anosmic || this.anosmic;
            for (let i = 0; i < segs.length; i++) { const q = segs[i]; if (off || !q.circ) { smA[i] = smB[i] = 0; continue; } const x = (q.ax + q.bx) * 0.5, y = (q.ay + q.by) * 0.5; smA[i] = this.nutAt(x, y, this.scA); smB[i] = this.nutAt(x, y, this.scB); }
          }
          if (this.contact && (this.numbSkin || o.numbSkin)) for (let i = 0; i < segs.length; i++) { segs[i].tch = 0; segs[i].torn = 0; }
          if (this.sound && b.hasEar) this.hear(o);
          b.nerveUse += A.neural.local(b, taste, 1 - o.E / pr.Emax, smA, smB, this.vision, this.contact, this.learn ? dt : 0, this.sound) * dt;
          if (this.sound && b.hasVoice) { if (this.mute || o.mute) { o.voOn = false; o.voL = 0; } else this.voiceOut(o, dt); if ((this.tick + o.id) % 30 === 0 && (o.voN > 0 || o.voOn)) this.voiceNote(o); /* (only bodies that have ever sounded: the record is about when a caller calls, not about who has a voice) */ }
        }
        // a body that cannot move itself is simply carried by the water, and lies still on a stepped floor. On a sloping floor it gets the same physics as any body: the current drags it, the floor holds it by its weight
        if (o.passive && !(ground && this.shore > 0)) { if (!ground) for (let k = 0; k < b.np; k++) { b.x[k] += fl[0] * dt; b.y[k] += fl[1] * dt; } P.pose(b); }
        else P.step(b, dt, this.substeps);
        if (!P.finite(b) || this.flung(b)) { this.fault(o); o.dead = 'broken'; continue; } // (a fault of the arithmetic, not an event of the world: see flung)
        let c = P.com(b);
        if (c[0] < 0 || c[0] >= this.W) { const s = c[0] < 0 ? this.W : -this.W; for (let k = 0; k < b.np; k++) b.x[k] += s; c[0] += s; P.pose(b); }
        if (c[1] < 2 || c[1] > this.H - 2) { const push = (c[1] < 2 ? 2 - c[1] : this.H - 2 - c[1]) * 0.5; for (let k = 0; k < b.np; k++) { b.y[k] += push; b.vy[k] *= 0.5; } c[1] += push; P.pose(b); }
        // own travel: displacement with the water's drift removed. A body resting on a bottom is not carried by the water,
        // so nothing is removed there; a body with nothing to move itself with has travelled nowhere by itself.
        { const jx = c[0] - o.cx, jy = c[1] - o.cy, ux = ground ? 0 : fl[0] * dt, uy = ground ? 0 : fl[1] * dt; if (!o.passive && jx * jx + jy * jy < 25) o.path += Math.sqrt((jx - ux) * (jx - ux) + (jy - uy) * (jy - uy)); if (this.soundWork) o.vSelf = jx * jx + jy * jy < 25 ? Math.sqrt((jx - ux) * (jx - ux) + (jy - uy) * (jy - uy)) / dt : 0; /* (how fast it moved through the water in this tick; used a few lines below, not kept) */ if (this.sound && ground && jx * jx + jy * jy < 25) this.emit(c[0], c[1], o.sp, SND.scrape * pr.V * Math.sqrt(jx * jx + jy * jy), 'scrape'); o.cx = c[0]; o.cy = c[1]; }
        // income: skin
        for (let i = 0; i < b.segs.length; i++) {
          const a = pr.absorb[i]; if (a <= 0) continue;
          const s = b.segs[i], ci = this.cellAt((s.ax + s.bx) / 2, clamp((s.ay + s.by) / 2, 0, this.H - 0.01)), take = Math.min(this.nut[ci] * 0.5, C.osm * a * this.nut[ci] / this.nutrientCap * dt);
          this.nut[ci] -= take; o.E += take; o.absorbed += take;
        }
        // income: mouth -> gut
        for (const m0 of pr.mouths) {
          const s = b.segs[m0.seg], ci = this.cellAt(s.bx, clamp(s.by, 0, this.H - 0.01)), m = s.mo == null || s.mo >= 1 ? m0 : { seg: m0.seg, gape: m0.gape * s.mo }, g0 = o.G; if (this.learn && s.ate) s.ate = s.ate > 1e-6 ? s.ate * 0.97 : 0; if (m.gape <= 0) continue;
          for (const f of this.grid[ci]) {
            if (this.nibble && f.e > 0 && (f.size > m.gape * 1.3 || o.G + f.e > pr.gutCap) && o.G < pr.gutCap) { // too much to swallow: take a piece
              let dx = f.x - s.bx; if (dx > this.W / 2) dx -= this.W; else if (dx < -this.W / 2) dx += this.W;
              if (Math.sqrt(dx * dx + (f.y - s.by) * (f.y - s.by)) < m.gape + f.size * 0.5) {
                const take = Math.min(f.e, pr.gutCap - o.G, C.bite * m.gape * m.gape * (0.4 + 1.2 * s.p.muscle) * this.grainEnergy * dt);
                if (lg) this.grainClass(f.c || String(f.size)).eaten += take;
                f.e -= take; o.G += take; o.eaten += take; this.counts.eaten += take; f.size = Math.cbrt(Math.max(f.e, 0) / this.grainEnergy) || f.size; if (f.e < 1e-9) f.e = 0;
              }
              continue;
            }
            if (lg && f.e > 0 && (f.size > m.gape * 1.3 || o.G + f.e > pr.gutCap)) { // (ledger only) a mouth that reaches a grain it cannot take: note once why
              let dx = f.x - s.bx; if (dx > this.W / 2) dx -= this.W; else if (dx < -this.W / 2) dx += this.W;
              if (Math.sqrt(dx * dx + (f.y - s.by) * (f.y - s.by)) < m.gape + f.size * 0.5) { const gc = this.grainClass(f.c || String(f.size)); if (f.size > m.gape * 1.3) { if (!f.tb) { f.tb = 1; gc.tooBig += f.e; } } else if (!f.gf) { f.gf = 1; gc.gutFull += f.e; } }
            }
            if (f.e <= 0 || f.size > m.gape * 1.3 || o.G + f.e > pr.gutCap) continue;
            let dx = f.x - s.bx; if (dx > this.W / 2) dx -= this.W; else if (dx < -this.W / 2) dx += this.W;
            if (Math.sqrt(dx * dx + (f.y - s.by) * (f.y - s.by)) < m.gape + f.size * 0.5) { if (lg) this.grainClass(f.c || String(f.size)).eaten += f.e; o.G += f.e; o.eaten += f.e; this.counts.eaten += f.e; f.e = 0; }
          }
          if (this.learn && o.G > g0) s.ate = (s.ate || 0) + (o.G - g0) / pr.gutCap; // (learn) this mouth has just taken something in
          if (this.sound && o.G > g0) this.emit(s.bx, s.by, pitchOfR(s.r1), SND.crunch * (o.G - g0), 'crunch');
        }
        const dg = Math.min(o.G, pr.digest * dt); o.G -= dg; o.E += dg * pr.eta; if (lg) lg.digest += dg * (1 - pr.eta); if (this.recycle) this.giveBack(o.cx, o.cy, dg * (1 - pr.eta));
        // spending
        if (this.sound) { const dC = b.ciliaUse - o.cil0, dW = b.work - o.work0; if (dC > 0) this.emit(o.cx, o.cy, o.sp, this.soundWork ? SND.muscle * P.K.cilia * dC * (o.vSelf || 0) : SND.cilia * dC, 'cilia'); if (dW > 0) this.emit(o.cx, o.cy, o.sp, SND.muscle * dW, 'muscle'); }
        if (lg) { lg.basal += pr.basal * dt; lg.work += C.work * (b.work - o.work0); lg.cilia += C.ciliaWork * (b.ciliaUse - o.cil0); lg.nerve += C.spike * (b.nerveUse - o.nerve0); }
        o.E -= pr.basal * dt + C.work * (b.work - o.work0) + C.ciliaWork * (b.ciliaUse - o.cil0) + C.spike * (b.nerveUse - o.nerve0); o.work0 = b.work; o.cil0 = b.ciliaUse; o.nerve0 = b.nerveUse;
        if (o.E > pr.Emax) { if (lg) lg.clip += o.E - pr.Emax; if (this.recycle) this.giveBack(o.cx, o.cy, o.E - pr.Emax); o.E = pr.Emax; }
        o.age += dt;
        if (o.E <= 0) { o.dead = 'starved'; continue; }
        if (o.age > o.life) { o.dead = 'aged'; continue; }
        if (o.hp && o.E > C.growReserve * pr.Emax) { // mending: lost tissue is rebuilt at the price of building it, most damaged segment first
          let worst = -1; for (let i = 0; i < o.hp.length; i++) if (o.hp[i] < 1 && !b.segs[i].gone && (worst < 0 || o.hp[i] < o.hp[worst])) worst = i;
          if (worst < 0) { if (!o.hp.some(h => h <= 0)) o.hp = null; }
          else { const q = b.segs[worst], vol = Math.PI * (q.r0 + q.r1) / 2 * (q.z0 + q.z1) / 2 * q.len, dv = Math.min(Math.min(o.E - C.growReserve * pr.Emax, pr.basal * 3 * dt + 0.01 * dt) / C.build, vol * (1 - o.hp[worst])); o.E -= dv * C.build; o.hp[worst] = Math.min(1, o.hp[worst] + dv / vol); this.wound(o); pr = o.prof; }
        }
        if (o.stage < 1) { // growth: surplus is set aside until it pays for the next piece of body
          if (o.E > C.growReserve * pr.Emax) { const put = Math.min(o.E - C.growReserve * pr.Emax, pr.basal * 6 * dt + 0.02 * dt); o.E -= put; o.grow += put; }
          if (o.nextCost == null) { o.nextStage = Math.min(1, o.stage + 0.14); o.nextCost = A.organs.profile(A.development.develop(o.g, { stage: o.nextStage, maxSegs: this.maxSegs, pair: this.pair })).buildCost - o.cleanBuild; }
          if (o.grow >= o.nextCost) { const paid = o.nextCost, had = pr.buildCost; o.grow -= o.nextCost; o.stage = o.nextStage; o.nextCost = null; const root = b.segs[0]; this.form(o, o.cx, o.cy, Math.atan2(root.dy, root.dx)); if (lg) lg.growth += paid - (o.prof.buildCost - had); }
        } else if (pr.gonadRate > 0 && o.E > C.reproReserve * pr.Emax) {
          const put = Math.max(0, Math.min(pr.gonadRate * dt, o.E - C.reproReserve * pr.Emax, o.eggCost - o.egg)); o.E -= put; o.egg += put;
          if (o.egg >= o.eggCost) {
            if (this.bodies.length + born.length >= this.cap) this.counts.blocked++;
            else { o.egg -= o.eggCost; o.kids++; born.push(o); }
          }
        }
      }
      for (const o of born) {
        const split = this.mutsplit, mm = this.metamut || split ? (o.g.mut == null ? 1 : o.g.mut) : 1, mw = split ? (o.g.mutW == null ? mm : o.g.mutW) : 1; // (a lineage that comes from the one-gene rule starts with the width it had)
        let src = o.g, two = 0, mate = null; if (this.mix && o.got) { src = A.genome.recombine(o.g, o.got.g, this.rand, this.sound, this.cast, this.wireLate); two = o.got.id; mate = o.got.g.origin; o.got = null; } // an egg made from two genomes; the material taken up is used
        const g = this.rand() < this.mutation * mm ? A.genome.mutate(src, this.rand, split ? mw : this.metamut ? mm : undefined, A.rules.flags(this), split ? 1 : undefined) : two ? src : A.genome.copy(o.g);
        if (split) { if (this.rand() < this.mutation) g.mut = clamp(mm * Math.exp(this.rand.gauss() * 0.15), 0.1, 3); if (this.rand() < this.mutation) g.mutW = clamp(mw * Math.exp(this.rand.gauss() * 0.15), 0.1, 3); } // the two genes drift whether or not this birth mutates
        // born in a world under selection: 'evolved' only if the whole ancestry is; a line started from a designed or explored genome stays marked
        // (an egg made from two genomes is of natural descent only if both are: genes of a designed, explored or introduced body carry their mark through mixing too)
        g.origin = (o.g.origin === 'primordial' || o.g.origin === 'evolved') && (!two || mate === 'primordial' || mate === 'evolved') ? 'evolved' : 'evolved-from-artificial';
        const a = this.rand() * TAU, d = Math.sqrt(o.prof.V) + 1 + (this.cast && o.g.cast ? o.g.cast : 0), bx = this.cast ? (((o.cx + Math.cos(a) * d) % this.W) + this.W) % this.W : o.cx + Math.cos(a) * d, by = clamp(o.cy + Math.sin(a) * d, 2, this.H - 2), B = o.eggCost - C.eggFixed; // B: what the egg holds
        let stage = g.birth;
        if (this.budget) {
          stage = this.afford(g, B, this.invest ? this.yolkOf(o.g) : undefined);
          if (stage == null) { // the egg cannot make even a bud of this body: it is lost, and what a dead thing leaves of it lies where it was laid
            let e = C.carrion * B; const e0 = e; this.corpse = true; while (e > 0.05) { const size = 0.25 + this.rand() * 0.25, pe = Math.min(e, this.grainEnergy * size ** 3); this.addFood(bx + this.rand.gauss() * 0.5, by + this.rand.gauss() * 0.5, size, pe, this.isGround(bx, by), this.grainLife); e -= pe; } this.corpse = false;
            this.counts.stillborn++; o.kids--; if (lg) { lg.eggFixed += C.eggFixed; lg.stillborn += B - (e0 - e); } if (this.recycle) this.giveBack(bx, by, B - (e0 - e)); continue;
          }
        }
        if (two && !o.introduction) { const n2 = this.tree.get(two); if (n2 && n2.introduction) o.introFrom = n2.introduction; } // the other genome came from an introduced line: the young is of that line's making too
        const kid = this.spawn(g, bx, by, stage, o); this.counts.births++; if (o.introFrom) o.introFrom = null; if (two) { kid.p2 = two; this.tree.get(kid.id).p2 = two; this.counts.mixed = (this.counts.mixed || 0) + 1; }
        if (this.budget) { const left = B - kid.prof.buildCost; kid.E = Math.min(kid.prof.Emax, left); const yolk = left - kid.E; if (yolk > 0) { if (kid.stage < 1) kid.grow += yolk; else kid.egg += yolk; } } // what the body and its reserve do not use stays with the young as yolk
        if (lg) { lg.eggFixed += C.eggFixed; lg.mutation += kid.prof.buildCost + kid.E + kid.grow + kid.egg - B; } // (earlier rule: the parent paid for the young its own genes describe, the young is built from its own)
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
          const had = o.E + o.G + o.grow + o.egg + o.prof.buildCost; let e = C.carrion * (o.prof.buildCost * 0.5 + Math.max(0, o.E) + o.G); const e0 = e; this.corpse = true;
          while (e > 0.05) { const size = 0.25 + this.rand() * 0.25, pe = Math.min(e, this.grainEnergy * size ** 3); this.addFood(o.cx + this.rand.gauss() * 0.5, o.cy + this.rand.gauss() * 0.5, size, pe, this.isGround(o.cx, o.cy), this.grainLife); e -= pe; }
          this.corpse = false; if (lg) lg.death += had - (e0 - e); if (this.recycle) this.giveBack(o.cx, o.cy, had - (e0 - e));
        }
        this.bodies = this.bodies.filter(o => !o.dead);
      }
      this.t += dt; this.tick++;
      if (this.tick % 900 === 0) {
        this.prune();
        if (this.clades.size > 4000) { let drop = this.clades.size - 3500; for (const [id, c] of this.clades) { if (drop <= 0) break; if (c.ended != null && c.members <= 2) { this.clades.delete(id); drop--; this.cladesDropped = (this.cladesDropped || 0) + 1; } } }
        this.thin();
        const c = this.census(); this.history.push(c); if (this.history.length > 1500) this.history.splice(0, 300);
        if (this.sound) this.soundFirsts(c);
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
        snd: this.sound && this.snd ? { f: this.snd.map(b64), i: this.sndIn.map(b64), v: this.sndV.map(b64), vi: this.sndVIn.map(b64), aco: this.aco } : undefined,
        patch: this.patch, grainDebt: this.grainDebt || 0, bottomDebt: this.bottomDebt || 0, liveLines: this.liveLines ? [...this.liveLines] : null, regionState: this.regions ? this.regions.map(q => ({ debt: q.debt, patch: q.patch })) : null,
        introductions: this.introductions, counts: this.counts, events: this.events, history: this.history, firsts: this.firsts, pruned: this.pruned, tree: [...this.tree.values()],
        // body plans that only one or two bodies ever had keep their numbers but not their genome (worlds begun before this rule still carry them)
        clades: [...this.clades.values()].map(c => c.ended != null && c.members <= 2 && c.g ? Object.assign({}, c, { g: null }) : c), cladesDropped: this.cladesDropped || 0, genomesDropped: this.genomesDropped || undefined, faults: this.faults && this.faults.length ? this.faults : undefined /* (bodies taken out by the safety valve: written only if there are any) */,
        bodies: this.bodies.map(o => { const b = o.b, r = b.segs[0]; return { id: o.id, stage: o.stage, age: o.age, E: o.E, G: o.G, egg: o.egg, grow: o.grow, x: o.cx, y: o.cy, angle: Math.atan2(r.dy, r.dx), life: o.life, eaten: o.eaten, absorbed: o.absorbed, kids: o.kids, path: o.path, born: o.born, home: o.home, v0: o.V0, s0: o.stage0, si: o.seepIn || undefined, so: o.seepOut || undefined, hd: o.held == null ? undefined : o.held, p2: o.p2 || undefined, got: o.got ? [o.got.id, o.got.g] : undefined, vo: o.voN ? [o.voOn ? 1 : 0, o.voN, o.voT || 0, o.voE || 0] : undefined, hp: o.hp || undefined, flesh: o.flesh || undefined, lost: o.lost || undefined,
          sig: b.hasCircuit ? b.segs.map(q => q.a) : undefined,
          st: { x: Array.from(b.x), y: Array.from(b.y), vx: Array.from(b.vx), vy: Array.from(b.vy), t: b.t, work: b.work, heat: b.heat, cilia: b.ciliaUse, nerve: b.nerveUse, om: b.om || 0, th: b.th || 0, loc: b.loc ? Array.from(b.loc) : null, inertia: b.inertia == null ? null : b.inertia, carried: b.carried == null ? null : b.carried, cmd: b.cmd,
            segs: b.segs.map(q => [q.a, q.m, q.cd, q.ct, q.press, q.target, q.act, q.osc, q.dir, q.mA == null ? null : q.mA, q.mB == null ? null : q.mB, q.v == null ? null : q.v, q.mV == null ? null : q.mV, q.mo == null ? null : q.mo, q.na ? Array.from(q.na) : null, q.na ? [q.nA == null ? null : q.nA, q.nB == null ? null : q.nB, q.nV == null ? null : q.nV] : null].concat(q.nw || q.ate || q.mE != null || q.nE != null || q.theta != null ? [q.nw ? Array.from(q.nw) : null, q.ate || 0, q.mE == null ? null : q.mE, q.nE == null ? null : q.nE].concat(q.theta != null ? [q.theta] : []) : [])), /* (the last number: the bend of the segment's joint as its neurons will read it at the next step, which is the bend before the last move, not the one the saved positions give) */ noise: o.noise, wander: o.wander, seen: o.seen || null, sx: o.sx, sy: o.sy, sdt: o.sdt || 0, taxDot: o.taxDot, taxLen: o.taxLen, taxN: o.taxN, work0: o.work0, cil0: o.cil0, nerve0: o.nerve0, nextCost: o.nextCost == null ? null : o.nextCost, nextStage: o.nextStage == null ? null : o.nextStage } }; })
      };
    }
    // Older saves (without `exact`) lack pose, velocities, rhythm phase, sensory memory and birth region: bodies then restart from rest.
    static restore(d) {
      if (!d || d.format !== 'alife2-world-1') throw new Error('not an ALIFE 2.0 world');
      const w = new World(d.opt); w.introductions = d.introductions; w.t = d.t; w.tick = d.tick; w.nut.set(d.nut); if (w.scent && d.scA) { w.scA.set(d.scA); w.scB.set(d.scB); } w.patch = d.patch; w.counts = Object.assign({}, d.counts); for (const k of ['killed', 'flesh', 'torn', 'stillborn']) if (w.counts[k] == null) w.counts[k] = 0; /* worlds saved before bodies could touch */ w.events = d.events; w.history = d.history; w.firsts = d.firsts; w.pruned = d.pruned || 0; if (d.faults) w.faults = d.faults; w.clades = new Map((d.clades || []).map(c => [c.id, c])); w.cladesDropped = d.cladesDropped || 0; if (d.genomesDropped) w.genomesDropped = d.genomesDropped;
      if (w.sound && d.snd) { w.snd = d.snd.f.map(unb64); w.sndIn = d.snd.i.map(unb64); w.sndV = d.snd.v.map(unb64); w.sndVIn = d.snd.vi.map(unb64); w.aco = Object.assign(w.acoNew(), d.snd.aco || {}); while (w.aco.lis.length < 3) w.aco.lis.push(w.acoNew().lis[0]); for (const c of w.aco.lis) if (!c.ids) c.ids = {}; /* (worlds saved before the notebook grew keep what they had) */ }
      for (const f of d.food) w.food.push({ x: f[0], y: f[1], size: f[2], e: f[3], fixed: !!f[4], die: d.exact ? f[5] : w.t + f[5] });
      if (d.exact) { w.grainDebt = d.grainDebt; w.bottomDebt = d.bottomDebt; if (d.liveLines) w.liveLines = new Set(d.liveLines); if (d.regionState && w.regions) d.regionState.forEach((q, i) => { w.regions[i].debt = q.debt; w.regions[i].patch = q.patch; }); }
      const nodes = new Map(d.tree.map(n => [n.id, n]));
      // A world saved before a gene existed: its genomes lack that gene, and a rule that reads it would compute with nothing (bodies in a world with touch,
      // saved before the genes of touch, lost their nerve signal at the first step and died). Every genome the save holds gets the starting value of the genes
      // it lacks; genomes that have every gene are left exactly as they are, so a world saved by this version resumes as before.
      { let filled = 0, of = 0; const fill = g => { const k = A.genome.complete(g); if (k) { filled += k; of++; } };
        for (const n of d.tree) if (n.g) fill(n.g); for (const c of w.clades.values()) if (c.g) fill(c.g); for (const s of d.bodies) if (s.got && s.got[1]) fill(s.got[1]);
        if (filled) w.log('保存のあとに足された遺伝子を、初期値で補った（' + of + ' 個の遺伝子型に、合わせて ' + filled + ' か所）。古い版で保存した世界を再開したため'); }
      for (const s of d.bodies) {
        const n = nodes.get(s.id), o = { id: s.id, g: n.g, stage: s.stage, age: s.age, G: s.G, egg: s.egg, grow: s.grow, dead: false, noise: 0, wander: 0, path: s.path, eaten: s.eaten, absorbed: s.absorbed, kids: s.kids, parent: n.parent, line: n.line, gen: n.gen, born: s.born, kind: n.kind, clade: n.clade, sig: s.sig || null, home: s.home || 0, taxDot: 0, taxLen: 0, taxN: 0, V0: s.v0, stage0: s.s0, seepIn: s.si || 0, seepOut: s.so || 0, held: s.hd == null ? undefined : s.hd, p2: s.p2 || 0, got: s.got ? { id: s.got[0], g: s.got[1] } : null, voOn: s.vo ? !!s.vo[0] : false, voN: s.vo ? s.vo[1] : 0, voT: s.vo ? s.vo[2] : 0, voE: s.vo ? s.vo[3] : 0, hp: s.hp || null, flesh: s.flesh || 0, lost: s.lost || 0 };
        if (n.introduction) o.introduction = n.introduction;
        const baby = A.organs.profile(A.development.develop(o.g, { stage: o.g.birth, maxSegs: w.maxSegs, pair: w.pair })), C = A.organs.C;
        { const plan = A.development.develop(o.g, { maxSegs: w.maxSegs }); o.full = A.organs.profile(plan); o.gu = w.geneUse(o.g, plan); } o.life = s.life; { const y = w.yolkOf(o.g); o.eggCost = C.eggFixed + baby.buildCost + y * baby.Emax; o.eggE = y * baby.Emax; }
        w.form(o, s.x, s.y, s.angle); o.E = s.E;
        const st = s.st;
        if (st) { // put the body back exactly as it was
          const b = o.b; b.x.set(st.x); b.y.set(st.y); b.vx.set(st.vx); b.vy.set(st.vy); b.t = st.t; b.work = st.work; b.heat = st.heat; b.ciliaUse = st.cilia; b.nerveUse = st.nerve; b.carried = st.carried == null ? undefined : st.carried; b.cmd = st.cmd;
          if (b.rigid && st.loc) { b.om = st.om; b.th = st.th; b.loc.set(st.loc); b.inertia = st.inertia; } // the same numbers, not the same quantities recomputed in another orientation
          st.segs.forEach((v, i) => { const q = b.segs[i]; q.a = v[0]; q.m = v[1]; q.cd = v[2]; q.ct = v[3]; q.press = v[4]; q.target = v[5]; q.act = v[6]; q.osc = v[7]; q.dir = v[8]; if (v[9] != null) q.mA = v[9]; if (v[10] != null) q.mB = v[10]; if (v[11] != null) q.v = v[11]; if (v[12] != null) q.mV = v[12]; if (v[13] != null) q.mo = v[13]; if (v[14]) { q.na = Float64Array.from(v[14]); q.nb = new Float64Array(q.na.length); } if (v[15]) { if (v[15][0] != null) q.nA = v[15][0]; if (v[15][1] != null) q.nB = v[15][1]; if (v[15][2] != null) q.nV = v[15][2]; } if (v[16]) q.nw = Float64Array.from(v[16]); if (v[17]) q.ate = v[17]; if (v[18] != null) q.mE = v[18]; if (v[19] != null) q.nE = v[19]; if (v[20] != null) q.theta = v[20]; });
          A.physics.pose(b); o.cx = s.x; o.cy = s.y;
          Object.assign(o, { noise: st.noise, wander: st.wander, seen: st.seen, sx: st.sx, sy: st.sy, sdt: st.sdt, taxDot: st.taxDot, taxLen: st.taxLen, taxN: st.taxN, work0: st.work0, cil0: st.cil0, nerve0: st.nerve0, nextCost: st.nextCost, nextStage: st.nextStage });
        }
        w.bodies.push(o);
      }
      w.tree = nodes; w.nextId = d.nextId; w.rand.state(d.rng); return w;
    }
    // ---- islands: bodies leave this world for another one, or arrive from one ----
    // A body moves with everything it is: genome, age, size, reserves, wounds. Its pose, speed and nerve state start from rest in the new place,
    // at the same relative position, and its record there begins a new line (where it came from is kept). Nothing is created or lost:
    // what leaves is booked as leaving, what arrives as arriving. Which bodies leave is drawn from this world's own random numbers.
    // A world that never calls these two is not changed by their existence.
    emigrate(n) {
      const out = [], lg = this.ledger;
      for (let k = 0; k < n && this.bodies.length > 1; k++) {
        const i = this.rand.int(this.bodies.length), o = this.bodies[i]; this.bodies.splice(i, 1); o.dead = 'left'; this.counts.left = (this.counts.left || 0) + 1;
        const cl = this.clades.get(o.clade);
        if (cl) { cl.alive--; cl.dead++; cl.causes.left = (cl.causes.left || 0) + 1; cl.eaten += o.eaten; cl.absorbed += o.absorbed; cl.path += o.path; cl.lived += o.age; cl.kids += o.kids; if (cl.alive === 0) { cl.ended = this.t; if (cl.members <= 2) cl.g = null; } }
        const node = this.tree.get(o.id); if (node) { node.died = this.t; node.cause = 'left'; node.life = { eaten: o.eaten, absorbed: o.absorbed, path: o.path, kids: o.kids, stage: o.stage }; }
        if (lg) lg.left = (lg.left || 0) + o.E + o.G + o.grow + o.egg + o.prof.buildCost;
        out.push({ introduction: o.introduction, g: A.genome.copy(o.g), stage: o.stage, age: o.age, E: o.E, G: o.G, egg: o.egg, grow: o.grow, life: o.life, gen: o.gen, x: o.cx / this.W, y: o.cy / this.H, hp: o.hp ? Array.from(o.hp) : null, flesh: o.flesh || 0, lost: o.lost || 0,
          eaten: o.eaten, absorbed: o.absorbed, path: o.path, kids: o.kids, v0: o.V0, s0: o.stage0, nextCost: o.nextCost == null ? null : o.nextCost, nextStage: o.nextStage == null ? null : o.nextStage, mind: this.keep ? this.mindOf(o, false) : undefined, from: { id: o.id, line: o.line, t: this.t } });
      }
      return out;
    }
    immigrate(list, island) {
      const lg = this.ledger, got = [];
      for (const s of list || []) {
        const o = this.spawn(A.genome.copy(s.g), ((s.x * this.W) % this.W + this.W) % this.W, clamp(s.y * this.H, 2, this.H - 2), s.stage, null);
        if (lg) lg.placed -= o.E + o.prof.buildCost; // (spawn booked it as a founder; it is booked below as an arrival, with what it really carries)
        if (s.hp && s.hp.length === o.b.segs.length && s.hp.some(h => h < 1)) { o.hp = Array.from(s.hp); this.lost(o); this.wound(o); }
        Object.assign(o, { age: s.age, life: s.life, gen: s.gen, E: s.E, G: s.G, egg: s.egg, grow: s.grow, eaten: s.eaten, absorbed: s.absorbed, path: s.path, kids: s.kids, flesh: s.flesh || 0, lost: s.lost || 0, V0: s.v0, stage0: s.s0, nextCost: s.nextCost == null ? undefined : s.nextCost, nextStage: s.nextStage == null ? undefined : s.nextStage });
        if (this.keep && s.mind) this.mindTo(o, s.mind, false); // (it arrives with what it knew)
        const node = this.tree.get(o.id); if (s.introduction) o.introduction = node.introduction = s.introduction; node.gen = s.gen; node.from = Object.assign({ island: island == null ? null : island }, s.from);
        const cl = this.clades.get(o.clade); if (cl && cl.id === o.id) { cl.gen0 = cl.genMax = s.gen; cl.arrived = 1; /* this plan did not arise here: records of novelty leave it out */ } else if (cl && s.gen > cl.genMax) cl.genMax = s.gen;
        if (lg) lg.arrived = (lg.arrived || 0) + o.E + o.G + o.grow + o.egg + o.prof.buildCost;
        this.counts.arrived = (this.counts.arrived || 0) + 1; got.push(o);
      }
      return got;
    }
    // Move a world's living population, with its genomes, genealogy and records, into another map.
    // Bodies land at the same relative place (left-right and depth), at rest. Food and dissolved food are the new map's own.
    // It is a migration, not a continuation: many may die where they land.
    static transplant(old, map) {
      const d = old.save(), opt = Object.assign({}, d.opt, { map: map || '' }); delete opt.cap; delete opt.founders;
      if (!map) Object.assign(opt, { W: DEFAULTS.W, H: DEFAULTS.H, cap: DEFAULTS.cap, founders: DEFAULTS.founders });
      const fresh = new World(opt), name = m => m ? (MAPS[m] && MAPS[m].name) || m : '小さな水槽';
      Object.assign(d, { opt: Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, fresh[k]])), nut: Array.from(fresh.nut), food: [], patch: fresh.patch, regionState: null, scA: undefined, scB: undefined, snd: undefined /* (the new map's water starts with its own sound) */, grainDebt: 0, bottomDebt: 0 });
      for (const s of d.bodies) { s.x = s.x / old.W * fresh.W; s.y = clamp(s.y / old.H * fresh.H, 2, fresh.H - 2); delete s.st; s.home = 0; }
      const minds = old.keep ? new Map(old.bodies.map(o => [o.id, old.mindOf(o, false)])) : null;
      const w = World.restore(d); if (minds) for (const o of w.bodies) { const m = minds.get(o.id); if (m) w.mindTo(o, m, false); } /* (keep) they land at rest, but with what their nerves held */ w.log('世界を移した：' + name(old.map) + ' → ' + name(map) + '（' + w.bodies.length + ' 個体）'); return w;
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
        seepShare: mean(o => { const inc = o.absorbed + o.eaten * o.prof.eta + (o.seepIn || 0); return inc > 0 ? (o.seepIn || 0) / inc : 0; }), holding: mean(o => (o.held != null && this.tick - o.held < 30 ? 1 : 0)), grainEaters: (() => { let n = 0, k = 0; for (const o of this.bodies) if (o.age > 60) { n++; const m = o.eaten * o.prof.eta; if (m >= 0.3 * (m + o.absorbed) && m > 0) k++; } return n ? k / n : 0; })(), /* of the bodies older than a minute: those that took 30% or more of their lifetime income through the mouth */ twoParents: mean(o => (o.p2 ? 1 : 0)), carrying: mean(o => (o.got ? 1 : 0)),
        ...(this.sound ? this.soundCensus() : null),
        castGene: mean(o => (o.g.cast == null ? 0 : o.g.cast)), lateBodies: mean(o => (o.g.parts.some((p, i) => p.nAt > o.g.birth && o.plan.segs.some(q => q.part === i)) ? 1 : 0)) /* (wireLate) bodies some part of which, as it stands in the body now, is born without its circuit */, lateWiring: (() => { let all = 0, late = 0; for (const o of this.bodies) o.g.parts.forEach((p, i) => { if (!o.plan.segs.some(q => q.part === i)) return; const v = A.neural.wiring(p); all += v; if (p.nAt > o.g.birth) late += v; }); return all ? late / all : 0; })() /* share of the wiring, by strength, that is built after birth */, mutGene: mean(o => (o.g.mut == null ? 1 : o.g.mut)), mutWidth: mean(o => (o.g.mutW == null ? (o.g.mut == null ? 1 : o.g.mut) : o.g.mutW)), mutLow: mean(o => ((o.g.mut == null ? 1 : o.g.mut) < 0.3 ? 1 : 0)), plastic: mean(o => (o.g.parts.some(p => p.nn && p.nn.some(q => q.in.some(e => e[2]))) ? 1 : 0)), senseNeurons: mean(o => (o.b.segs.some(q => q.p.nn && q.p.nn.some(n => n.out.length && n.in.some(e => 'cABvtwhjg'.includes(e[0])))) ? 1 : 0)), /* a neuron that reads a sense of its segment and moves something: the least a neuron must do to be more than a constant */ yolkGene: mean(o => this.yolkOf(o.g)), neurons: mean(o => o.b.segs.reduce((a, q) => a + (q.p.nn ? q.p.nn.length : 0), 0)), neuronBodies: mean(o => o.b.segs.some(q => q.p.nn) ? 1 : 0),
        birthV: (l => l.length ? l.reduce((a, o) => a + o.V0, 0) / l.length : 0)(this.bodies.filter(o => o.V0 != null && o.gen > 0)), birthStage: (l => l.length ? l.reduce((a, o) => a + o.stage0, 0) / l.length : 0)(this.bodies.filter(o => o.stage0 != null && o.gen > 0)), birthGene: mean(o => o.g.birth), eggCost: mean(o => o.eggCost), adultV: mean(o => o.full.V),
        partsTotal: mean(o => o.gu.parts), partsReach: mean(o => o.gu.reach), partsUsed: mean(o => o.gu.expr), multiPart: mean(o => o.gu.expr > 1 ? 1 : 0), zoned: mean(o => o.gu.zones > 0 ? 1 : 0), differed: mean(o => o.gu.zones > 0 && o.gu.div > 0.05 ? 1 : 0),
        fleshShare: mean(o => o.eaten > 0 ? (o.flesh || 0) / o.eaten : 0), fleshEaters: mean(o => (o.flesh || 0) > 0.2 * o.eaten && o.eaten > 0 ? 1 : 0), wounded: mean(o => o.hp ? 1 : 0), armor: mean(o => o.g.parts.reduce((a, p) => a + p.armor, 0) / o.g.parts.length),
        // nerve circuits: share of bodies that are wired at all, mean wiring, and share whose taste reaches cilia or a joint
        wired: mean(o => o.full.wiring > 0.2 ? 1 : 0), wiring: mean(o => o.full.wiring), tasteWired: mean(o => o.g.parts.some(p => Math.abs(p.nC) > 0.2 && (Math.abs(p.mCil) > 0.1 || Math.abs(p.mJoint) > 0.1)) ? 1 : 0),
        // per region: who lives there, what they are like, and how many were born elsewhere
        regions: this.regions ? this.regions.map(q => { const l = this.bodies.filter(o => this.regionAt(o.cx) === q.id), m = f => l.length ? l.reduce((a, o) => a + f(o), 0) / l.length : 0; return { name: q.name, n: l.length, seg: m(o => o.full.segs), cilia: m(o => o.full.cilia > 0.05 ? 1 : 0), speed: m(o => o.age > 5 ? o.path / o.age : 0), sessile: m(o => o.full.mouths.length >= 3 && (o.age > 5 ? o.path / o.age : 0) < 0.01 ? 1 : 0), volume: m(o => o.prof.V), mouth: m(o => o.eaten + o.absorbed > 0 ? o.eaten / (o.eaten + o.absorbed) : 0), immigrants: m(o => o.home !== q.id ? 1 : 0), lines: new Set(l.map(o => o.line)).size }; }) : null, cilia: mean(o => o.full.cilia > 0.05 ? 1 : 0), mouths: mean(o => o.full.mouths.length), sense: mean(o => o.full.sense),
        // taxis: of the distance bodies moved by themselves while perceiving food, the fraction that went towards it.
        // Weighted by distance, and only bodies that really travelled count: a body that merely trembles says nothing.
        taxis: (() => { const l = this.bodies.filter(o => this.traveller(o)); const len = l.reduce((a, o) => a + o.taxLen, 0); return len ? l.reduce((a, o) => a + o.taxDot, 0) / len : 0; })(), taxisN: this.bodies.filter(o => this.traveller(o)).length,
        turnGain: mean(o => Math.abs(o.g.brain[7])), sessileMulti: mean(o => o.full.mouths.length >= 3 && (o.age > 5 ? o.path / o.age : 0) < 0.01 ? 1 : 0), food: this.food.length, unsound: this.bodies.reduce((k, o) => k + (Number.isFinite(o.E) && Number.isFinite(o.cx) && Number.isFinite(o.cy) && o.b.segs.every(q => Number.isFinite(q.a)) ? 0 : 1), 0) /* (a watch, not a rule) living bodies that hold something that is not a number - a reserve, a place, a nerve signal. The world's physics never makes one: any is a fault of the program */, nutrient: this.nut.reduce((a, b) => a + b, 0) / this.nut.length, ...this.counts
      };
    }
  }
  A.engine = { World, DEFAULTS };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
