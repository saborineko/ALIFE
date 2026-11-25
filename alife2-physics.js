// ALIFE 2.0 — body physics.
//
// A body is a tree of rigid-length segments joined by muscle-driven joints.
// Nothing sets a speed. Muscles apply equal and opposite torques across a
// joint (so they cannot move the centre of mass by themselves); the body only
// travels because water resists sideways motion more than lengthwise motion,
// or because a pressed pad grips the ground.
//
// Each segment owns one particle (its far end). Its near end is a point fixed
// in the parent's frame, written as a complex-weighted sum of particles:
//   A = sum_k w_k * p_k   (w complex, sum w = 1)
// which keeps attachment exact and conserves linear and angular momentum.
(function (G) {
  'use strict';
  const A = G.ALIFE2 = G.ALIFE2 || {};
  if (typeof require !== 'undefined' && !A.neural) require('./alife2-neural.js');
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const wrapPi = x => { x = (x + PI) % TAU; if (x < 0) x += TAU; return x - PI; };

  const K = {
    density: 1, armorDensity: 0.8,      // extra mass of exoskeleton
    muscleStress: 2600,                 // max torque = stress * muscle * r^2 * z
    damping: 0.06,                      // joint damping time (s)
    passive: 0.25, limit: 8,
    cn: 1.1, cf: 0.03, cform: 0.4, visc: 0.03,
    hold: 0.15,                         // cost of holding tension without moving
    padStress: 9000, muFoot: 1.3, muBelly: 0.55, slip: 0.05,
    substeps: 8, iters: 6
  };

  function environment(o) { return Object.assign({ fluid: 1, ground: false, gravity: 4, flowX: 0, flowY: 0 }, o || {}); }

  function build(plan, opt) {
    opt = opt || {};
    const ps = plan.segs, n = ps.length, np = n + 1;
    const b = {
      plan, freq: plan.freq, n, np, t: 0, work: 0, heat: 0, env: environment(opt.env), cmd: A.neural.command(opt.cmd),
      x: new Float64Array(np), y: new Float64Array(np), vx: new Float64Array(np), vy: new Float64Array(np),
      fx: new Float64Array(np), fy: new Float64Array(np), m: new Float64Array(np), im: new Float64Array(np),
      ox: new Float64Array(np), oy: new Float64Array(np), segs: []
    };
    const ox = opt.x || 0, oy = opt.y || 0, rot = opt.angle || 0, c = Math.cos(rot), s = Math.sin(rot);
    const place = (i, x, y) => { b.x[i] = ox + x * c - y * s; b.y[i] = oy + x * s + y * c; };
    for (let i = 0; i < n; i++) {
      const q = ps[i], rm = (q.r0 + q.r1) / 2, zm = (q.z0 + q.z1) / 2;
      const seg = {
        id: i, parent: q.parent, p: q.p, part: q.part, len: q.len, r0: q.r0, r1: q.r1, z0: q.z0, z1: q.z1, rest: q.angle, mir: q.mir,
        phase: q.phase, az: q.az, axial: q.axial, chainRoot: q.chainRoot, group: q.group, idx: q.idx, tip: q.tip, leaf: q.leaf,
        b: i + 1, aw: null, target: q.angle, press: 0, act: 0, theta: q.angle, osc: 0, dir: 1,
        mass: Math.max(1e-4, K.density * PI * rm * zm * q.len * (1 + K.armorDensity * q.p.armor)),
        sideArea: q.len * (q.z0 + q.z1), wetArea: PI * (rm + zm) * q.len,
        formArea: Math.abs(PI * q.r0 * q.z0 - PI * q.r1 * q.z1) + (q.leaf ? PI * q.r1 * q.z1 : 0) + (i === 0 ? PI * q.r0 * q.z0 : 0),
        tauMax: K.muscleStress * q.p.muscle * q.r0 * q.r0 * q.z0,
        pad: q.leaf && q.p.grip > 0.05, ax: 0, ay: 0, bx: 0, by: 0, dx: 1, dy: 0
      };
      if (i === 0) { seg.aw = [[0, 1, 0]]; place(0, q.ax, q.ay); }
      else {
        const P = b.segs[q.parent], wr = q.wr, wi = q.wi, list = [];
        for (const [k, ur, ui] of P.aw) { const ar = 1 - wr, ai = -wi, r = ar * ur - ai * ui, im = ar * ui + ai * ur; if (r * r + im * im > 1e-18) list.push([k, r, im]); }
        if (wr * wr + wi * wi > 1e-18) list.push([P.b, wr, wi]);
        seg.aw = list;
      }
      place(seg.b, q.bx, q.by);
      b.segs.push(seg);
    }
    // lump mass: half on the far end, half shared by whatever carries the near end
    for (const s of b.segs) {
      b.m[s.b] += s.mass / 2;
      let tot = 0; for (const [, r, i] of s.aw) tot += Math.hypot(r, i);
      for (const [k, r, i] of s.aw) b.m[k] += s.mass / 2 * Math.hypot(r, i) / tot;
    }
    b.mass = 0; for (let i = 0; i < np; i++) { b.im[i] = 1 / b.m[i]; b.mass += b.m[i]; }
    pose(b);
    // joint gains from the inertia each joint actually has to move
    const sub = b.segs.map(() => []);
    for (let i = n - 1; i >= 0; i--) { sub[i].push(b.segs[i].b); if (i) for (const k of sub[i]) sub[b.segs[i].parent].push(k); }
    b.segs[0].padRef = 0; b.segs[0].padCap = b.segs[0].pad ? K.padStress * b.segs[0].p.grip * (0.2 + b.segs[0].p.muscle) * b.segs[0].r0 ** 2 * b.segs[0].z0 : 0;
    for (let i = 1; i < n; i++) {
      const s = b.segs[i]; let ic = 0, it = 0;
      for (let k = 0; k < np; k++) it += b.m[k] * ((b.x[k] - s.ax) ** 2 + (b.y[k] - s.ay) ** 2);
      for (const k of sub[i]) ic += b.m[k] * ((b.x[k] - s.ax) ** 2 + (b.y[k] - s.ay) ** 2);
      const ip = Math.max(1e-6, it - ic); ic = Math.max(1e-6, ic);
      s.inertia = ic * ip / (ic + ip);
      // a muscle is as stiff as it is strong: full force at ~0.12 rad of error
      s.kp = Math.max(1e-9, s.tauMax / 0.12);
      s.kPassive = Math.max(1e-6, K.passive * K.muscleStress * (0.15 + s.p.stiff + 3 * s.p.armor) * s.r0 * s.r0 * s.z0);
      s.kLimit = Math.max(s.kp, s.kPassive) * K.limit + 1e-6;
      // a pad is timed and carried by the limb it sits on: the nearest moving chain above it
      let ref = b.segs[s.chainRoot];
      while (ref.p.amp < 0.02 && ref.parent > 0 && !b.segs[ref.parent].axial) ref = b.segs[b.segs[ref.parent].chainRoot];
      s.padRef = ref.id;
      s.padCap = s.pad ? K.padStress * s.p.grip * (0.2 + ref.p.muscle) * ref.r0 * ref.r0 * ref.z0 : 0;
    }
    b.start = com(b);
    return b;
  }

  // refresh segment endpoints and directions from particles
  function pose(b) {
    for (const s of b.segs) {
      let ax = 0, ay = 0;
      for (const [k, r, i] of s.aw) { ax += r * b.x[k] - i * b.y[k]; ay += r * b.y[k] + i * b.x[k]; }
      s.ax = ax; s.ay = ay; s.bx = b.x[s.b]; s.by = b.y[s.b];
      const dx = s.bx - ax, dy = s.by - ay, l = Math.hypot(dx, dy) || 1e-9;
      s.dx = dx / l; s.dy = dy / l; s.cur = l;
    }
  }
  function velA(b, s) { let vx = 0, vy = 0; for (const [k, r, i] of s.aw) { vx += r * b.vx[k] - i * b.vy[k]; vy += r * b.vy[k] + i * b.vx[k]; } return [vx, vy]; }
  function forceA(b, s, fx, fy) { for (const [k, r, i] of s.aw) { b.fx[k] += r * fx + i * fy; b.fy[k] += r * fy - i * fx; } }

  // One compliant angle constraint between segment s and its parent P.
  // free > 0 makes it a limit: nothing happens inside +-free of the target.
  const gk = [], gxs = [], gys = [];
  function joint(b, s, P, target, alpha, damp, lamMax, free, dt) {
    let n = 0;
    const add = (k, x, y) => { for (let j = 0; j < n; j++) if (gk[j] === k) { gxs[j] += x; gys[j] += y; return; } gk[n] = k; gxs[n] = x; gys[n] = y; n++; };
    const pt = q => { let x = 0, y = 0; for (const [k, r, i] of q.aw) { x += r * b.x[k] - i * b.y[k]; y += r * b.y[k] + i * b.x[k]; } return [x, y]; };
    const [cax, cay] = pt(s), [pax, pay] = pt(P);
    let cx = b.x[s.b] - cax, cy = b.y[s.b] - cay, px = b.x[P.b] - pax, py = b.y[P.b] - pay;
    const lc = Math.hypot(cx, cy) || 1e-9, lp = Math.hypot(px, py) || 1e-9; cx /= lc; cy /= lc; px /= lp; py /= lp;
    let C = wrapPi(Math.atan2(px * cy - py * cx, px * cx + py * cy) - target);
    if (free > 0) { if (C > free) C -= free; else if (C < -free) C += free; else return 0; }
    const gcx = -cy / lc, gcy = cx / lc, gpx = py / lp, gpy = -px / lp; // d(theta)/d(B_child), d(theta)/d(B_parent)
    add(s.b, gcx, gcy); for (const [k, r, i] of s.aw) add(k, -(r * gcx + i * gcy), -(r * gcy - i * gcx));
    add(P.b, gpx, gpy); for (const [k, r, i] of P.aw) add(k, -(r * gpx + i * gpy), -(r * gpy - i * gpx));
    let den = 0, rate = 0;
    for (let j = 0; j < n; j++) { const k = gk[j]; den += b.im[k] * (gxs[j] * gxs[j] + gys[j] * gys[j]); rate += gxs[j] * (b.x[k] - b.ox[k]) + gys[j] * (b.y[k] - b.oy[k]); }
    const gamma = alpha * damp * dt; // damping proportional to stiffness
    let lam = -(C + gamma * rate) / ((1 + gamma) * den + alpha);
    lam = clamp(lam, -lamMax, lamMax);
    for (let j = 0; j < n; j++) { const k = gk[j], g = lam * b.im[k]; b.x[k] += g * gxs[j]; b.y[k] += g * gys[j]; }
    return lam;
  }

  function substep(b, dt) {
    const { segs, env } = b, np = b.np;
    b.fx.fill(0); b.fy.fill(0);
    pose(b);
    A.neural.cpg(b, b.t, b.cmd);
    // kinematics
    for (const s of segs) {
      const [vx, vy] = velA(b, s); s.vax = vx; s.vay = vy; s.vbx = b.vx[s.b]; s.vby = b.vy[s.b];
      s.w = (s.dx * (s.vby - vy) - s.dy * (s.vbx - vx)) / s.len;
    }
    for (let i = 1; i < segs.length; i++) { const s = segs[i], P = segs[s.parent]; s.theta = Math.atan2(P.dx * s.dy - P.dy * s.dx, P.dx * s.dx + P.dy * s.dy); }
    // water: resists sideways motion of a segment far more than sliding along it
    if (env.fluid > 0) for (const s of segs) {
      const kn = 0.25 * env.fluid * K.cn * s.sideArea, kt = 0.25 * env.fluid * (K.cf * s.wetArea + K.cform * s.formArea), kv = K.visc * s.len * env.fluid;
      for (let e = 0; e < 2; e++) {
        const vx = (e ? s.vbx : s.vax) - env.flowX, vy = (e ? s.vby : s.vay) - env.flowY;
        const vt = vx * s.dx + vy * s.dy, vn = -vx * s.dy + vy * s.dx;
        const ft = -(kt * Math.abs(vt) + kv) * vt, fn = -(kn * Math.abs(vn) + 2 * kv) * vn;
        const fx = ft * s.dx - fn * s.dy, fy = ft * s.dy + fn * s.dx;
        if (e) { b.fx[s.b] += fx; b.fy[s.b] += fy; } else forceA(b, s, fx, fy);
        b.heat -= (fx * vx + fy * vy) * dt;
      }
    }
    // ground: pressed pads grip, whatever the pads cannot carry drags on the belly
    if (env.ground) {
      const W = b.mass * env.gravity; let cap = 0;
      for (const s of segs) if (s.pad) cap += s.padCap * s.press;
      const carried = Math.min(1, cap / W); b.carried = carried;
      if (cap > 0) for (const s of segs) {
        if (!s.pad || s.press <= 0) continue;
        const N = carried * W * s.padCap * s.press / cap, v = Math.hypot(s.vbx, s.vby), f = -K.muFoot * s.p.grip * N / (v + K.slip);
        b.fx[s.b] += f * s.vbx; b.fy[s.b] += f * s.vby;
      }
      if (carried < 1) for (let k = 0; k < np; k++) {
        const v = Math.hypot(b.vx[k], b.vy[k]), f = -K.muBelly * (1 - carried) * b.m[k] * env.gravity / (v + K.slip);
        b.fx[k] += f * b.vx[k]; b.fy[k] += f * b.vy[k];
      }
    }
    // integrate, then restore segment lengths
    for (let k = 0; k < np; k++) {
      b.ox[k] = b.x[k]; b.oy[k] = b.y[k];
      b.vx[k] += b.fx[k] * b.im[k] * dt; b.vy[k] += b.fy[k] * b.im[k] * dt;
      b.x[k] += b.vx[k] * dt; b.y[k] += b.vy[k] * dt;
    }
    // muscles and connective tissue act on joint angles (compliant constraints: a spring
    // whose force is capped by muscle size). They push child and parent equally and oppositely.
    const dt2 = dt * dt;
    for (let i = 1; i < segs.length; i++) {
      const s = segs[i], P = segs[s.parent], w = s.w - P.w;
      let lam = 0;
      if (s.tauMax > 0) lam = joint(b, s, P, s.target, 1 / (s.kp * dt2), K.damping, s.tauMax * dt2, 0, dt);
      s.act = s.tauMax > 0 ? lam / (s.tauMax * dt2) : 0;
      b.work += (Math.abs(lam / dt2 * w) + K.hold * Math.abs(lam / dt2)) * dt;
      joint(b, s, P, s.rest, 1 / (s.kPassive * dt2), K.damping, Infinity, 0, dt);
      joint(b, s, P, s.rest, 1 / (s.kLimit * dt2), K.damping, Infinity, s.p.range * 1.1 + 0.03, dt);
    }
    for (let it = 0; it < K.iters; it++) for (const s of segs) {
      let ax = 0, ay = 0, wsum = b.im[s.b];
      for (const [k, r, i] of s.aw) { ax += r * b.x[k] - i * b.y[k]; ay += r * b.y[k] + i * b.x[k]; wsum += (r * r + i * i) * b.im[k]; }
      let nx = b.x[s.b] - ax, ny = b.y[s.b] - ay; const l = Math.hypot(nx, ny) || 1e-9; nx /= l; ny /= l;
      const lam = -(l - s.len) / wsum;
      b.x[s.b] += lam * b.im[s.b] * nx; b.y[s.b] += lam * b.im[s.b] * ny;
      for (const [k, r, i] of s.aw) { const g = lam * b.im[k]; b.x[k] -= g * (r * nx + i * ny); b.y[k] -= g * (r * ny - i * nx); }
    }
    for (let k = 0; k < np; k++) { b.vx[k] = (b.x[k] - b.ox[k]) / dt; b.vy[k] = (b.y[k] - b.oy[k]) / dt; }
    b.t += dt;
  }

  function step(b, dt) { const n = K.substeps; for (let i = 0; i < n; i++) substep(b, dt / n); pose(b); }

  function com(b) { let x = 0, y = 0; for (let k = 0; k < b.np; k++) { x += b.x[k] * b.m[k]; y += b.y[k] * b.m[k]; } return [x / b.mass, y / b.mass]; }
  function momentum(b) { let x = 0, y = 0, L = 0; for (let k = 0; k < b.np; k++) { x += b.vx[k] * b.m[k]; y += b.vy[k] * b.m[k]; L += b.m[k] * (b.x[k] * b.vy[k] - b.y[k] * b.vx[k]); } return [x, y, L]; }
  function finite(b) { for (let k = 0; k < b.np; k++) if (!Number.isFinite(b.x[k]) || !Number.isFinite(b.y[k])) return false; return true; }

  // Run a body for `seconds` and report what its shape and muscles achieved.
  function trial(plan, opt) {
    opt = opt || {};
    const b = build(plan, opt), dt = 1 / 60, warm = opt.warm == null ? 2 : opt.warm, T = opt.seconds || 8;
    for (let t = 0; t < warm; t += dt) step(b, dt);
    const c0 = com(b), w0 = b.work; let path = 0, last = c0, maxBend = 0;
    for (let t = 0; t < T; t += dt) {
      step(b, dt); const c = com(b); path += Math.hypot(c[0] - last[0], c[1] - last[1]); last = c;
      for (let i = 1; i < b.segs.length; i++) maxBend = Math.max(maxBend, Math.abs(wrapPi(b.segs[i].theta - b.segs[i].rest)));
    }
    const dist = Math.hypot(last[0] - c0[0], last[1] - c0[1]), work = b.work - w0;
    return { ok: finite(b), distance: dist, path, speed: dist / T, work, power: work / T, mass: b.mass, costOfTransport: dist > 1e-6 ? work / (b.mass * dist) : Infinity, maxBend, body: b };
  }

  A.physics = { K, build, step, pose, com, momentum, finite, trial, environment };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
