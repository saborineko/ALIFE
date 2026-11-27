// ALIFE 2.0 — genome: indirect encoding of a body as a graph grammar.
//
// A genome does not list cells or segments. It holds
//   parts : templates for a piece of body (geometry, tissue, local rhythm, organs)
//   links : production rules "a part of type A grows a part of type B here",
//           with symmetry, recursion (repeat) and an expression window along
//           the body axis (lo..hi), so the same rule can make a head, a row of
//           legs, or a tail depending on where it is expressed.
// alife2-development.js expands this into an actual body.
(function (G) {
  'use strict';
  const A = G.ALIFE2 = G.ALIFE2 || {};
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const wrapPi = x => { x = (x + PI) % TAU; if (x < 0) x += TAU; return x - PI; };
  const copy = x => JSON.parse(JSON.stringify(x));

  function rng(seed) {
    let s = seed >>> 0 || 1;
    const f = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    f.gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += f(); return (u - 3) / Math.sqrt(0.5); };
    f.int = n => Math.floor(f() * n);
    f.state = v => { if (v != null) s = v >>> 0; return s >>> 0; }; // read or restore, for saving a world
    return f;
  }

  // name: [min, max, default, kind]   kind: 'n' number, 'a' angle (wraps)
  const PART_FIELDS = {
    len: [0.15, 8, 1, 'n'],        // length of one segment
    r0: [0.03, 4, 0.4, 'n'],       // half width at the base
    r1: [0.01, 4, 0.3, 'n'],       // half width at the free tip
    depth: [0.12, 3, 1, 'n'],      // thickness out of the plane, as a ratio of half width
    stiff: [0, 1, 0.4, 'n'],       // passive joint stiffness
    range: [0.02, 1.6, 0.6, 'n'],  // joint range of motion (rad, each way from rest)
    muscle: [0, 1, 0.5, 'n'],      // muscle mass -> maximum joint torque
    skin: [0, 1, 0.4, 'n'],        // skin thickness / opacity
    armor: [0, 1, 0, 'n'],         // exoskeleton: rigid, heavy, opaque plates
    amp: [0, 1, 0, 'n'],           // local rhythm amplitude (fraction of range)
    phase: [-PI, PI, 0, 'a'],      // local rhythm phase
    lag: [-PI, PI, 0, 'a'],        // phase step per repeated segment (travelling wave)
    freq: [0.25, 3, 1, 'n'],       // local rhythm frequency multiplier
    skew: [-0.9, 0.9, 0, 'n'],     // fast/slow stroke asymmetry
    bias: [-1, 1, 0, 'n'],         // tonic bend (fraction of range)
    steer: [0, 1, 0, 'n'],         // how much stroke depends on direction of travel
    grip: [0, 1, 0, 'n'],          // contact pad at the free tip (substrate friction)
    gripPhase: [-PI, PI, 0, 'a'],  // when in the stroke the pad is pressed down
    mouth: [0, 1, 0, 'n'], eye: [0, 1, 0, 'n'], gut: [0, 1, 0, 'n'],
    gonad: [0, 1, 0, 'n'], nerve: [0, 1, 0.2, 'n'], store: [0, 1, 0, 'n'],
    vessel: [0, 1, 0, 'n'],        // transport tissue: carries supply further from the gut
    cilia: [0, 1, 0, 'n'],         // beating hairs on the skin: push water along the body
    beat: [-1, 1, 1, 'n'],         // which way, and how hard, they beat (+ pushes the body towards its base end)
    // local nerve circuit of this kind of segment. Every segment built from the part gets its own copy:
    // signal <- signal + leak * (tanh(nC*taste + nP*parent's signal + nK*children's signal + nH*hunger + nB) - signal)
    nC: [-4, 4, 0, 'n'],           // from its own sense of dissolved food where it is (scaled by nerve tissue)
    nP: [-4, 4, 0, 'n'],           // from the segment it grows from
    nK: [-4, 4, 0, 'n'],           // from the segments growing from it
    nH: [-4, 4, 0, 'n'],           // from the body's hunger
    nB: [-2, 2, 0, 'n'],           // resting level
    leak: [0.02, 1, 1, 'n'],       // 1 = the signal is made afresh each moment (reflex); lower = it carries the past
    mCil: [-1.5, 1.5, 0, 'n'],     // signal -> how hard this segment's cilia beat
    mTurn: [-1.5, 1.5, 0, 'n'],    // signal -> this segment's cilia beat unevenly, side to side (it turns)
    mJoint: [-1, 1, 0, 'n'],       // signal -> bend of this segment's joint
    adapt: [0, 1, 0, 'n'],         // 0 = the sense reports how rich the water is; 1 = it adapts and reports only change
    // Bodies leak two substances into the water (see `odor`). A segment can sense how much of each is where it is.
    // These two genes only change in worlds where bodies leak (marked 'x'): elsewhere they stay 0 and cost no random draws.
    sA: [-4, 4, 0, 'n', 'x'],      // from its own sense of substance A
    sB: [-4, 4, 0, 'n', 'x'],      // from its own sense of substance B
    // Sight (marked 'v': these only change in worlds where eyes work this way). A segment with eye tissue is one receptor:
    // it looks one way, over a cone, and reports how much of its field is filled by things of the colour it is tuned to.
    vE: [-4, 4, 0, 'n', 'v'],      // from what its own eye reports
    gaze: [-PI, PI, 0, 'a', 'v'],  // which way the eye looks, against the segment's outward direction
    tune: [-PI, PI, 1, 'a', 'v'],  // the colour it responds to (an angle on the colour wheel; food grains are at about 0.9)
    // In worlds where bodies touch (marked 'c'): a segment feels being pushed and being torn, and a mouth can be held shut.
    sT: [-4, 4, 0, 'n', 'c'],      // from the push this segment is getting from another body right now
    sW: [-4, 4, 0, 'n', 'c'],      // from its wound: tissue being torn from it right now, and how much of it is gone
    mBite: [-1.5, 1.5, 0, 'n', 'c'], // signal -> how far this segment's mouth is open (0 = no effect: always open)
    // Sound (marked 's': these only change in worlds where sound exists). Any segment can carry hearing tissue and sound-making tissue.
    // An ear reports how loud the water is where the segment's outer end is, over the pitches it is tuned to; nothing tells it where a sound came from or who made it.
    ear: [0, 1, 0, 'n', 's'],       // hearing tissue (costs upkeep): how sensitive this segment is to sound
    hTune: [0, 1, 0.5, 'n', 's'],   // the pitch its ear answers best (0 = lowest, 1 = highest)
    hWide: [0.05, 1, 0.3, 'n', 's'], // how wide a range of pitches around that it takes in
    hE: [-4, 4, 0, 'n', 's'],       // from what its own ear reports
    voice: [0, 1, 0, 'n', 's'],     // sound-making tissue (costs upkeep, and energy for every sound): how loud this segment can be
    pitch: [0, 1, 0.5, 'n', 's'],   // the pitch of its voice at rest
    bend: [0, 0.5, 0.1, 'n', 's'],  // how far a neuron can push that pitch up or down
    mVoice: [-1.5, 1.5, 0, 'n', 's'] // signal -> how loudly this segment's voice sounds (0 = no effect: silent unless a neuron drives it)
  };
  const LINK_FIELDS = {
    at: [0, 1, 1, 'n'],            // where along the parent
    off: [0, 1.2, 0, 'n'],         // how far out from the parent's axis (in parent radii)
    angle: [-PI, PI, 0, 'a'],      // rest angle against the parent
    scale: [0.5, 1.25, 1, 'n'],    // size ratio per step
    swell: [-0.6, 2, 0, 'n'],      // mid-chain swelling
    lo: [0, 1, 0, 'n'], hi: [0, 1, 1, 'n'],   // expression window along the parent chain
    symPhase: [-PI, PI, 0, 'a'],   // rhythm offset between symmetric copies
    axPhase: [-PI, PI, 0, 'a']     // rhythm offset per parent chain index (metachronal wave)
  };
  // brain: 3 outputs (drive, turn, steer-to-food) x 5 inputs (1, food ahead, food left, hunger, wander)
  const BRAIN_IN = 5, BRAIN_OUT = 3;
  const MAX_PARTS = 12, MAX_LINKS = 24, MAX_REPEAT = 28;
  // In worlds with the newer gene rules ('g'), MAX_PARTS limits the parts a body can reach from its root, not the parts a genome may carry.
  // Parts no rule leads to stay in the genome as dormant genes (they can be linked in again) up to these storage limits, and decay slowly.
  const STORE_PARTS = 36, STORE_LINKS = 48;

  function part(o) { const p = {}; for (const k in PART_FIELDS) p[k] = PART_FIELDS[k][2]; return Object.assign(p, o || {}); }
  function link(o) {
    const l = { from: 0, to: 0, sym: 'none', n: 1, repeat: 1 };
    for (const k in LINK_FIELDS) l[k] = LINK_FIELDS[k][2];
    return Object.assign(l, o || {});
  }

  // Size profile along a repeated chain: x is the (fractional) step, R the repeat limit.
  function chainScale(l, x, R) {
    return Math.pow(l.scale, x) * Math.max(0.08, 1 + l.swell * Math.sin(PI * clamp(x / (R + 1), 0, 1)));
  }

  function sanitize(g) {
    g.parts = g.parts.slice(0, STORE_PARTS);
    for (const p of g.parts) for (const k in PART_FIELDS) {
      const [lo, hi, d, kind] = PART_FIELDS[k];
      let v = Number.isFinite(p[k]) ? p[k] : d;
      p[k] = kind === 'a' ? wrapPi(v) : clamp(v, lo, hi);
    }
    // zones along an axis: after `span` segments of this part, a chain goes on as part `next` (-1 or absent: it does not change)
    for (const p of g.parts) sanitizeNN(p);
    g.parts.forEach((p, i) => { if (p.next == null) return; p.next = Math.round(p.next); if (!(p.next >= 0 && p.next < g.parts.length) || p.next === i) p.next = -1; p.span = clamp(Math.round(p.span || 1), 1, MAX_REPEAT + 1); });
    g.links = g.links.slice(0, STORE_LINKS).filter(l => l.from < g.parts.length && l.to < g.parts.length && l.from >= 0 && l.to >= 0);
    for (const l of g.links) {
      for (const k in LINK_FIELDS) {
        const [lo, hi, d, kind] = LINK_FIELDS[k];
        let v = Number.isFinite(l[k]) ? l[k] : d;
        l[k] = kind === 'a' ? wrapPi(v) : clamp(v, lo, hi);
      }
      if (l.lo > l.hi) [l.lo, l.hi] = [l.hi, l.lo];
      if (!['none', 'mirror', 'radial'].includes(l.sym)) l.sym = 'none';
      l.n = clamp(Math.round(l.n || 1), 1, 12);
      l.repeat = clamp(Math.round(l.repeat || 1), 1, MAX_REPEAT);
    }
    g.root = clamp(g.root | 0, 0, g.parts.length - 1);
    g.hue = ((g.hue % 360) + 360) % 360;
    g.freq = clamp(Number.isFinite(g.freq) ? g.freq : 1, 0.2, 4);
    g.odor = clamp(Number.isFinite(g.odor) ? g.odor : 0.5, 0, 1); // what the body leaks: this share as substance A, the rest as B. Inherited, so relatives smell alike
    if (g.mut != null) g.mut = clamp(Number.isFinite(g.mut) ? g.mut : 1, 0.1, 3); // how strongly this lineage mutates (only in worlds where that evolves)
    if (g.mutW != null) g.mutW = clamp(Number.isFinite(g.mutW) ? g.mutW : 1, 0.1, 3); // how wide its steps are (only in worlds that keep frequency and width apart)
    if (g.cast != null) g.cast = clamp(Number.isFinite(g.cast) ? g.cast : 0, 0, 40); // how much farther from itself a body lays its eggs, in units of length (only in worlds where that evolves)
    if (g.yolk != null) g.yolk = clamp(Number.isFinite(g.yolk) ? g.yolk : 0.5, 0.05, 3); // how much reserve an egg is given, as a share of what the young can hold (only in worlds where that evolves)
    g.birth = clamp(Number.isFinite(g.birth) ? g.birth : 0.3, 0.2, 0.9); // how developed offspring are when released (bigger young cost more each)
    if (!Array.isArray(g.brain) || g.brain.length !== BRAIN_IN * BRAIN_OUT) g.brain = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    g.brain = g.brain.map(v => clamp(Number.isFinite(v) ? v : 0, -4, 4));
    return g;
  }

  function create(o) {
    return sanitize(Object.assign({ format: 'alife2-genome-1', origin: 'artificial', mutations: 0, hue: 170, freq: 1, root: 0, parts: [part()], links: [] }, o));
  }

  // The smallest possible life: one blob with a mouth and a gut. Starting point for evolution.
  function primordial(seed) {
    const r = rng(seed || 1);
    return create({ origin: 'primordial', hue: r() * 360, parts: [part({ len: 0.5, r0: 0.5, r1: 0.5, muscle: 0, skin: 0.2, mouth: 0.4, gut: 0.5, gonad: 0.3 })] });
  }

  // Mutation acts on the grammar, never on a finished body.
  // ---- the newer gene rules (worlds with 'g') ----
  // Every part and rule has an identity that is inherited, so that what happened to a gene can be read from a genealogy
  // (and, later, so that genes of two parents can be matched). Old genomes get theirs the first time they are needed.
  const newId = r => 1000000 + r.int(1073741824);
  function ensureIds(g) { g.parts.forEach((p, i) => { if (p.id == null) p.id = i + 1; }); g.links.forEach((l, i) => { if (l.id == null) l.id = 1000 + i; }); return g; }
  const nextOf = p => (p.next == null ? -1 : p.next);
  // parts a body can be built from: reachable from the root by rules or by zone succession
  function reach(g) {
    const seen = new Set([g.root]); let grew = true;
    while (grew) { grew = false; for (const l of g.links) if (seen.has(l.from) && !seen.has(l.to)) { seen.add(l.to); grew = true; } for (const i of [...seen]) { const n = nextOf(g.parts[i]); if (n >= 0 && n < g.parts.length && !seen.has(n)) { seen.add(n); grew = true; } } }
    return seen;
  }
  const axisOf = (g, i) => g.links.findIndex(l => l.from === i && l.to === i); // a part's own axis rule: its first rule onto itself
  // the stretches of one kind of part along an axis: [{ part, start, len }]
  function zones(g, li) {
    const L = g.links[li], out = [{ part: L.from, start: 0, len: 1 }]; let cur = L.from, z = 1;
    for (let idx = 1; idx <= L.repeat; idx++) { const p = g.parts[cur], n = nextOf(p); if (n >= 0 && n < g.parts.length && z >= (p.span || 1)) { cur = n; z = 1; out.push({ part: cur, start: idx, len: 1 }); } else { z++; out[out.length - 1].len++; } }
    return out;
  }
  // Split a stretch: its first k segments stay as they are; from there on the axis is made of a COPY of the part, carrying copies
  // of the part's other rules. The body this builds is the same body, to the last number. Afterwards the two parts mutate apart.
  // Returns the new part's index, or -1 if there was no room.
  function splitZone(g, li, zi, k, r) {
    ensureIds(g); const zs = zones(g, li), Z = zs[zi]; if (!Z || k < 1 || k >= Z.len) return -1;
    const P = Z.part, p = g.parts[P], own = axisOf(g, P), mine = g.links.map((l, i) => i).filter(i => g.links[i].from === P && i !== own);
    if (g.parts.length >= STORE_PARTS || reach(g).size >= MAX_PARTS || g.links.length + mine.length > STORE_LINKS) return -1;
    const Q = g.parts.length, q = copy(p); q.id = newId(r); q.src = p.id; q.how = 'split';
    q.next = nextOf(p); q.span = q.next >= 0 ? Math.max(1, (p.span || 1) - k) : Z.len - k; p.next = Q; p.span = k; g.parts.push(q);
    for (let j = mine.length - 1; j >= 0; j--) { const i = mine[j], l = g.links[i], c = copy(l); if (l.fam == null) l.fam = l.id; c.fam = l.fam; c.id = newId(r); c.src = l.id; c.from = Q; g.links.splice(i + 1, 0, c); } // each copy right after its source: the order in which a segment grows its children stays the same
    return Q;
  }
  // ---- neurons (worlds with 'n') ----
  // A part may carry up to NN_MAX neurons; every segment built from the part gets its own copy of them.
  // A neuron: { b: resting level, k: how fast it follows its input (1 = at once), in: [[source, weight]...], out: [[target, weight]...] }.
  // Sources are named by where they are, seen from the neuron's own segment (after Framsticks' relative references):
  //   own senses    c taste, A B the two leaked substances, v eye, t push, w wound, h hunger, j bend of own joint, o own rhythm, 1 a constant, a the segment's older single signal
  //   other neurons s0..s3 in the same segment, p0..p3 in the segment it grows from, k0..k3 the mean over segments growing from it, m0..m3 its mirror twin on the other side
  // Targets, all in its own segment: C how hard the cilia beat, T their turning, J the joint's bend, M how far the mouth is open, P how hard its pad presses.
  const NN_MAX = 4, NN_IN = 6, NN_OUT = 3, NN_SENSE = ['c', 'A', 'B', 'v', 't', 'w', 'h', 'j', 'o', '1', 'a'], NN_REF = ['s', 'p', 'k', 'm'], NN_EFF = ['C', 'T', 'J', 'M', 'P'];
  //   g  (only in worlds where connections learn) the segment's own mouth has just swallowed something
  //   e  (only in worlds with sound) what the segment's own ear reports
  // and two more targets there: V how loudly the segment's voice sounds, Q how far its pitch is pushed up or down.
  const NN_POOL = [NN_SENSE, NN_SENSE.concat('g'), NN_SENSE.concat('e'), NN_SENSE.concat('g', 'e')], NN_SENSE_L = NN_POOL[3], NN_EFF_S = NN_EFF.concat('V', 'Q');
  const nnSource = (r, L, S) => { const pool = NN_POOL[(L ? 1 : 0) + (S ? 2 : 0)]; return r() < 0.6 ? pool[r.int(pool.length)] : NN_REF[r.int(NN_REF.length)] + r.int(NN_MAX); };
  const nnValid = c => typeof c === 'string' && (NN_SENSE_L.includes(c) || (c.length === 2 && NN_REF.includes(c[0]) && ((c[1] >= '0' && c[1] <= '9') || (c[1] >= 'a' && c[1] <= 'z'))));
  // (wire) In worlds where neurons have names, a neuron carries `id` (0..35, written 0-9 a-z) and a reference names the neuron it means, wherever that neuron stands
  // in its part's list. Without names a reference counts places (s1 = the second neuron of this segment), and removing a neuron makes every reference to a later
  // one read its neighbour instead. A neuron without a name is known by its place, so genomes from before the rule keep their wiring when names are given out.
  const NAME = '0123456789abcdefghijklmnopqrstuvwxyz';
  function nameNeurons(p) { if (!p.nn) return; const used = new Set(); p.nn.forEach(q => { if (Number.isInteger(q.id)) used.add(q.id); }); p.nn.forEach((q, i) => { if (Number.isInteger(q.id)) return; let id = used.has(i) ? 0 : i; while (used.has(id)) id++; q.id = id; used.add(id); }); }
  function freshName(g, p, r) { const here = new Set((p.nn || []).map(q => q.id)), meant = new Set(); for (const p2 of g.parts) for (const q of p2.nn || []) for (const e of q.in) if (e[0].length === 2) meant.add(NAME.indexOf(e[0][1]));
    for (let k = 0; k < 12; k++) { const id = r.int(36); if (!here.has(id) && !meant.has(id)) return id; } for (let id = 0; id < 36; id++) if (!here.has(id)) return id; return 0; }
  function sanitizeNN(p) {
    if (p.nn == null) return; if (!Array.isArray(p.nn)) { delete p.nn; return; }
    p.nn = p.nn.slice(0, NN_MAX).filter(q => q && typeof q === 'object').map(q => ({
      b: clamp(Number.isFinite(q.b) ? q.b : 0, -2, 2), k: clamp(Number.isFinite(q.k) ? q.k : 1, 0.02, 1),
      in: (Array.isArray(q.in) ? q.in : []).filter(e => Array.isArray(e) && nnValid(e[0]) && Number.isFinite(e[1])).slice(0, NN_IN).map(e => (Number.isFinite(e[2]) && e[2] !== 0 ? [e[0], clamp(e[1], -4, 4), clamp(e[2], -1, 1)] : [e[0], clamp(e[1], -4, 4)])), // (a third number: how fast this connection changes with use, in worlds where connections can)
      m: q.m,
      out: (Array.isArray(q.out) ? q.out : []).filter(e => Array.isArray(e) && NN_EFF_S.includes(e[0]) && Number.isFinite(e[1])).slice(0, NN_OUT).map(e => [e[0], clamp(e[1], -2, 2)]),
      id: q.id
    }));
    { const seen = new Set(); let named = false; for (const q of p.nn) { if (Number.isInteger(q.id) && q.id >= 0 && q.id < 36 && !seen.has(q.id)) { seen.add(q.id); named = true; } else delete q.id; } if (named) nameNeurons(p); }
    for (const q of p.nn) if (!(Number.isInteger(q.m) && q.m >= 0 && q.m < q.in.length)) delete q.m; // (which of its own inputs gates the changing of its connections; none: they change with use alone)
    if (!p.nn.length) delete p.nn;
  }
  function mutateNN(p, r, s, L, S, t, W) {
    if (t == null) t = s; // t: how often the wiring changes; s: how wide the steps are (the same number, unless the world keeps them as two genes)
    const nn = p.nn || [], EFF = S ? NN_EFF_S : NN_EFF;
    // (wire: W = { g, all }) a new reference is made to a neuron that exists: one of this part for `s` and `m`, one of any part for `p` and `k`
    const src = W ? () => { if (r() < 0.6) { const pool = NN_POOL[(L ? 1 : 0) + (S ? 2 : 0)]; return pool[r.int(pool.length)]; } const kind = NN_REF[r.int(NN_REF.length)], from = kind === 's' || kind === 'm' ? nn.map(q => q.id) : W.all; if (!from.length) { const pool = NN_POOL[(L ? 1 : 0) + (S ? 2 : 0)]; return pool[r.int(pool.length)]; } return kind + NAME[from[r.int(from.length)]]; } : () => nnSource(r, L, S);
    for (const q of nn) {
      if (L) { for (const e of q.in) if (r() < 0.08) { const v = clamp((e[2] || 0) + r.gauss() * 0.15 * s, -1, 1); if (v !== 0) e[2] = v; else e.length = 2; } if (r() < 0.03 * t) { if (q.m == null && q.in.length) q.m = r.int(q.in.length); else delete q.m; } }
      if (r() < 0.12) q.b += r.gauss() * 0.3 * s; if (r() < 0.12) q.k += r.gauss() * 0.07 * s;
      for (const e of q.in) if (r() < 0.12) e[1] += r.gauss() * 0.5 * s; for (const e of q.out) if (r() < 0.12) e[1] += r.gauss() * 0.3 * s;
      if (r() < 0.05 * t && q.in.length < NN_IN) q.in.push([src(), r.gauss()]);
      if (r() < 0.03 * t && q.in.length > 1) { const i = r.int(q.in.length); q.in.splice(i, 1); if (q.m != null) { if (q.m === i) delete q.m; else if (q.m > i) q.m--; } }
      if (r() < 0.03 * t && q.in.length) q.in[r.int(q.in.length)][0] = src();
      if (r() < 0.03 * t && q.out.length < NN_OUT) q.out.push([EFF[r.int(EFF.length)], r.gauss() * 0.5]);
      if (r() < 0.02 * t && q.out.length) q.out.splice(r.int(q.out.length), 1);
    }
    if (r() < 0.04 * t && nn.length < NN_MAX) {
      // a new neuron: half the time a copy of one that is there, with all its connections (it can then drift apart); otherwise a fresh one with a sense and an effect
      if (nn.length && r() < 0.5) { nn.push(copy(nn[r.int(nn.length)])); if (W) nn[nn.length - 1].id = freshName(W.g, { nn }, r); } else if (W) { const q = { b: 0, k: 1, in: [], out: [], id: freshName(W.g, { nn }, r) }; nn.push(q); q.in.push([src(), r.gauss()]); q.out.push([EFF[r.int(EFF.length)], r.gauss() * 0.5]); W.all.push(q.id); } else nn.push({ b: 0, k: 1, in: [[nnSource(r, L, S), r.gauss()]], out: [[EFF[r.int(EFF.length)], r.gauss() * 0.5]] });
    }
    if (r() < 0.02 * t && nn.length) nn.splice(r.int(nn.length), 1);
    if (nn.length) p.nn = nn; else delete p.nn;
  }

  // remove a part no rule leads to, with the rules that touch it
  function dropPart(g, i) {
    g.parts.splice(i, 1); g.links = g.links.filter(l => l.from !== i && l.to !== i); for (const l of g.links) { if (l.from > i) l.from--; if (l.to > i) l.to--; }
    for (const p of g.parts) if (p.next != null) { if (p.next === i) p.next = -1; else if (p.next > i) p.next--; }
    if (g.root > i) g.root--;
  }
  // how far a part's numbers are from another's, as a share of each gene's range (0 = a perfect copy)
  function divergence(a, b) { let d = 0, n = 0; for (const k in PART_FIELDS) { const [lo, hi, , kind, flag] = PART_FIELDS[k]; if (flag === 's' && a[k] === b[k]) continue; /* (genes of sound count only where they differ: the measure reads as before in worlds without sound) */ d += Math.abs(kind === 'a' ? wrapPi(a[k] - b[k]) / TAU : (a[k] - b[k]) / (hi - lo)); n++; } return d / n; }

  // strength: how wide the steps are, and — unless `structural` is given — also how often the plan of the body and the wiring change.
  function mutate(g0, r, strength, extra, structural) {
    const g = copy(g0), s = strength == null ? 1 : strength, t = structural == null ? s : structural, G2 = extra === true || !!(extra && extra.includes('g'));
    if (G2) ensureIds(g);
    const num = (o, F) => {
      for (const k in F) {
        if (F[k][4] && !(extra === true || (extra && extra.includes(F[k][4])))) continue;
        if (r() > 0.12) continue;
        const [lo, hi, , kind] = F[k], span = kind === 'a' ? 1.2 : hi - lo;
        o[k] += r.gauss() * span * 0.07 * s;
      }
    };
    for (const p of g.parts) num(p, PART_FIELDS);
    if (extra === true || (extra && extra.includes('n'))) { let W = null; if (extra && extra !== true && extra.includes('w')) { for (const p of g.parts) nameNeurons(p); W = { g, all: g.parts.flatMap(p => (p.nn || []).map(q => q.id)) }; }
      for (const p of g.parts) mutateNN(p, r, s, !!(extra && extra !== true && extra.includes('l')), !!(extra && extra !== true && extra.includes('s')), t, W); }
    for (const l of g.links) {
      num(l, LINK_FIELDS);
      if (r() < 0.14 * t) l.repeat += r() < 0.5 ? -1 : 1;
      if (r() < 0.03 * t) l.sym = ['none', 'mirror', 'radial'][r.int(3)];
      if (l.sym === 'radial' && r() < 0.15 * t) l.n += r() < 0.5 ? -1 : 1;
      if (l.sym === 'radial' && l.n < 3) l.n = 3;
    }
    if (r() < 0.07 * t && (G2 ? g.parts.length < STORE_PARTS && reach(g).size < MAX_PARTS && g.links.length < STORE_LINKS : g.parts.length < MAX_PARTS && g.links.length < MAX_LINKS)) {
      // gene duplication: copy a part and let one rule make the copy instead
      const i = r.int(g.parts.length); g.parts.push(copy(g.parts[i]));
      if (G2) { const q = g.parts[g.parts.length - 1]; q.src = g.parts[i].id; q.id = newId(r); q.how = 'dup'; q.next = -1; }
      const cand = g.links.filter(l => l.to === i && l.from !== i);
      if (cand.length) cand[r.int(cand.length)].to = g.parts.length - 1;
      else g.links.push(link({ from: i, to: g.parts.length - 1, at: r(), off: 0.6, angle: (r() - 0.5) * TAU, sym: r() < 0.6 ? 'mirror' : 'none', scale: 0.7 }));
    }
    if (r() < 0.06 * t && g.links.length < (G2 ? STORE_LINKS : MAX_LINKS)) {
      const from = r.int(g.parts.length), to = r.int(g.parts.length);
      g.links.push(link({ from, to, at: r(), off: from === to ? 0 : 0.6, angle: from === to ? r.gauss() * 0.15 : (r() - 0.5) * TAU, sym: from === to ? 'none' : (r() < 0.6 ? 'mirror' : 'none'), repeat: 1 + r.int(3), scale: 0.75 + r() * 0.2, lo: 0, hi: 1 }));
    }
    if (r() < 0.02 * t && g.links.length > 1) g.links.splice(r.int(g.links.length), 1);
    if (G2) {
      for (const l of g.links) if (l.id == null) l.id = newId(r);
      // a stretch of an axis splits in two (the body does not change by it)
      if (r() < 0.05 * t) { const axes = g.parts.map((_, i) => axisOf(g, i)).filter(i => i >= 0); if (axes.length) { const li = axes[r.int(axes.length)], zs = zones(g, li).map((z, i) => [z, i]).filter(q => q[0].len >= 2); if (zs.length) { const [z, zi] = zs[r.int(zs.length)]; splitZone(g, li, zi, 1 + r.int(z.len - 1), r); } } }
      // a zone grows or shrinks by a segment; rarely, a part comes to be followed by another part altogether (or by none)
      g.parts.forEach(p => { if (nextOf(p) >= 0 && r() < 0.14 * t) p.span = (p.span || 1) + (r() < 0.5 ? -1 : 1); });
      if (r() < 0.02 * t && g.parts.length > 1) { const i = r.int(g.parts.length), p = g.parts[i]; if (r() < 0.5) p.next = -1; else { let n = r.int(g.parts.length - 1); if (n >= i) n++; p.next = n; p.span = 1 + r.int(4); } }
      // a dormant part (one nothing leads to) decays
      if (r() < 0.10 * t) { const live = reach(g), idle = g.parts.map((_, i) => i).filter(i => !live.has(i)); if (idle.length) dropPart(g, idle[r.int(idle.length)]); }
    }
    g.hue += r.gauss() * 6 * s;
    g.freq += r.gauss() * 0.05 * s;
    if (r() < 0.2) g.birth += r.gauss() * 0.06 * s;
    if (extra === true || (extra && extra.includes('m'))) g.mut = (g.mut == null ? 1 : g.mut) * Math.exp(r.gauss() * 0.15); // the mutation strength itself drifts, by a step that does not depend on it
    if ((extra === true || (extra && extra.includes('x'))) && r() < 0.2) g.odor += r.gauss() * 0.08 * s;
    if ((extra === true || (extra && extra.includes('i'))) && r() < 0.2) g.yolk = (g.yolk == null ? 0.5 : g.yolk) * Math.exp(r.gauss() * 0.2 * s);
    if (extra && extra !== true && extra.includes('d') && r() < 0.2) g.cast = (g.cast == null ? 0 : g.cast) + r.gauss() * 2 * s; // (it starts at 0 and moves by steps: nothing favours a longer throw by itself)
    for (let i = 0; i < g.brain.length; i++) if (r() < 0.2) g.brain[i] += r.gauss() * 0.35 * s;
    g.mutations = (g.mutations || 0) + 1;
    if (g.origin === 'artificial') g.origin = 'artificial-mutated';
    return sanitize(g);
  }

  // An egg of `a` that also carries genes of `b` (world option `mix`). The plan of the body is the mother's: which parts exist, which rule
  // joins which, how axes are divided. Where both genomes have the same part (known by its id; by position in genomes without ids), the part's
  // genes lie in a row and are cut at one place: one side comes from one parent, the rest from the other — neighbouring genes tend to stay
  // together, genes far apart are easily parted. A part's neurons go with the far end of the row. A shared rule is tuned as in one parent or
  // the other. The genes of the whole body are drawn one by one. A part or rule that the other genome lacks stays as it is.
  function recombine(a, b, r, sound, cast) {
    const g = copy(a), ids = g.parts.some(p => p.id != null) && b.parts.some(p => p.id != null), K = Object.keys(PART_FIELDS).filter(k => sound || PART_FIELDS[k][4] !== 's') /* (the genes of sound join the row only where sound exists: other worlds mix exactly as before) */, pb = new Map(), lb = new Map();
    b.parts.forEach((p, i) => { if (!ids || p.id != null) pb.set(ids ? p.id : i, p); }); b.links.forEach((l, i) => { if (!ids || l.id != null) lb.set(ids ? l.id : i, l); });
    g.parts.forEach((p, i) => {
      const q = pb.get(ids ? p.id : i); if (!q) return;
      const cut = r.int(K.length + 1), head = r() < 0.5; // genes before the cut from the mother (head) or from the other
      for (let k = 0; k < K.length; k++) if ((k < cut) !== head && q[K[k]] !== undefined) p[K[k]] = q[K[k]];
      if (head && cut < K.length) { if (q.nn) p.nn = copy(q.nn); else delete p.nn; } // (the far end is the other's: its neurons come with it)
    });
    g.links.forEach((l, i) => {
      const m = lb.get(ids ? l.id : i); if (!m) return;
      const same = ids ? (g.parts[l.from] && b.parts[m.from] && g.parts[l.from].id === b.parts[m.from].id && g.parts[l.to] && b.parts[m.to] && g.parts[l.to].id === b.parts[m.to].id) : (l.from === m.from && l.to === m.to);
      if (r() < 0.5 && same) for (const k in LINK_FIELDS) l[k] = m[k];
    });
    for (const k of ['hue', 'freq', 'odor', 'birth', 'mut', 'yolk']) if (r() < 0.5 && g[k] != null && b[k] != null) g[k] = b[k];
    if (cast && r() < 0.5 && b.cast != null) g.cast = b.cast; // (drawn only in worlds where the laying distance is a gene: other worlds draw the same numbers as before)
    if (r() < 0.5 && b.brain && b.brain.length === g.brain.length) g.brain = b.brain.slice();
    return sanitize(g);
  }

  function crossover(a, b, r) {
    const g = copy(a);
    for (let i = 0; i < g.parts.length && i < b.parts.length; i++) for (const k in PART_FIELDS) { if (PART_FIELDS[k][4] && g.parts[i][k] === b.parts[i][k]) continue; if (r() < 0.5) g.parts[i][k] = b.parts[i][k]; }
    for (let i = 0; i < g.links.length && i < b.links.length; i++) {
      const x = g.links[i], y = b.links[i];
      if (x.from !== y.from || x.to !== y.to) continue;
      for (const k in LINK_FIELDS) if (r() < 0.5) x[k] = y[k];
      if (r() < 0.5) { x.repeat = y.repeat; x.sym = y.sym; x.n = y.n; }
    }
    if (r() < 0.5) g.hue = b.hue;
    for (let i = 0; i < g.brain.length; i++) if (r() < 0.5) g.brain[i] = b.brain[i];
    return sanitize(g);
  }

  A.genome = { BRAIN_IN, BRAIN_OUT, PART_FIELDS, LINK_FIELDS, MAX_PARTS, MAX_LINKS, STORE_PARTS, STORE_LINKS, part, link, create, primordial, sanitize, mutate, crossover, recombine, chainScale, rng, copy, clamp, wrapPi, ensureIds, reach, zones, axisOf, splitZone, dropPart, divergence, nextOf, NN_MAX, NN_SENSE, NN_REF, NN_EFF };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
