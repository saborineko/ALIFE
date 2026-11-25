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
    beat: [-1, 1, 1, 'n']          // which way, and how hard, they beat (+ pushes the body towards its base end)
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
    g.parts = g.parts.slice(0, MAX_PARTS);
    for (const p of g.parts) for (const k in PART_FIELDS) {
      const [lo, hi, d, kind] = PART_FIELDS[k];
      let v = Number.isFinite(p[k]) ? p[k] : d;
      p[k] = kind === 'a' ? wrapPi(v) : clamp(v, lo, hi);
    }
    g.links = g.links.slice(0, MAX_LINKS).filter(l => l.from < g.parts.length && l.to < g.parts.length && l.from >= 0 && l.to >= 0);
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
  function mutate(g0, r, strength) {
    const g = copy(g0), s = strength == null ? 1 : strength;
    const num = (o, F) => {
      for (const k in F) {
        if (r() > 0.12) continue;
        const [lo, hi, , kind] = F[k], span = kind === 'a' ? 1.2 : hi - lo;
        o[k] += r.gauss() * span * 0.07 * s;
      }
    };
    for (const p of g.parts) num(p, PART_FIELDS);
    for (const l of g.links) {
      num(l, LINK_FIELDS);
      if (r() < 0.14 * s) l.repeat += r() < 0.5 ? -1 : 1;
      if (r() < 0.03 * s) l.sym = ['none', 'mirror', 'radial'][r.int(3)];
      if (l.sym === 'radial' && r() < 0.15 * s) l.n += r() < 0.5 ? -1 : 1;
      if (l.sym === 'radial' && l.n < 3) l.n = 3;
    }
    if (r() < 0.07 * s && g.parts.length < MAX_PARTS && g.links.length < MAX_LINKS) {
      // gene duplication: copy a part and let one rule make the copy instead
      const i = r.int(g.parts.length); g.parts.push(copy(g.parts[i]));
      const cand = g.links.filter(l => l.to === i && l.from !== i);
      if (cand.length) cand[r.int(cand.length)].to = g.parts.length - 1;
      else g.links.push(link({ from: i, to: g.parts.length - 1, at: r(), off: 0.6, angle: (r() - 0.5) * TAU, sym: r() < 0.6 ? 'mirror' : 'none', scale: 0.7 }));
    }
    if (r() < 0.06 * s && g.links.length < MAX_LINKS) {
      const from = r.int(g.parts.length), to = r.int(g.parts.length);
      g.links.push(link({ from, to, at: r(), off: from === to ? 0 : 0.6, angle: from === to ? r.gauss() * 0.15 : (r() - 0.5) * TAU, sym: from === to ? 'none' : (r() < 0.6 ? 'mirror' : 'none'), repeat: 1 + r.int(3), scale: 0.75 + r() * 0.2, lo: 0, hi: 1 }));
    }
    if (r() < 0.02 * s && g.links.length > 1) g.links.splice(r.int(g.links.length), 1);
    g.hue += r.gauss() * 6 * s;
    g.freq += r.gauss() * 0.05 * s;
    if (r() < 0.2) g.birth += r.gauss() * 0.06 * s;
    for (let i = 0; i < g.brain.length; i++) if (r() < 0.2) g.brain[i] += r.gauss() * 0.35 * s;
    g.mutations = (g.mutations || 0) + 1;
    if (g.origin === 'artificial') g.origin = 'artificial-mutated';
    return sanitize(g);
  }

  function crossover(a, b, r) {
    const g = copy(a);
    for (let i = 0; i < g.parts.length && i < b.parts.length; i++) for (const k in PART_FIELDS) if (r() < 0.5) g.parts[i][k] = b.parts[i][k];
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

  A.genome = { BRAIN_IN, BRAIN_OUT, PART_FIELDS, LINK_FIELDS, MAX_PARTS, MAX_LINKS, part, link, create, primordial, sanitize, mutate, crossover, chainScale, rng, copy, clamp, wrapPi };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
