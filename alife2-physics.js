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
    cilia: 0.14,                        // thrust per unit of ciliated surface
    padStress: 9000, muFoot: 1.3, muBelly: 0.55, slip: 0.05,
    substeps: 8, iters: 6,
    vmax: 60 // In water, no particle of a jointed body leaves a part of a step moving faster than this through the water. Swimming is under 1 a second and the hardest push
             // tried on a whole body left 14: a faster particle is the constraints of a body fighting each other (parts of a crowded body that cannot be pushed apart),
             // and each part of a step would add to it. What is beyond the limit is taken away, as water takes speed, so the fight dies down to a tremor of a few
             // steps; the body counts how often (b.capped), and the world's watch writes it down as a fault to be looked at. Without water there is no limit
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
        a: 0, cd: 1, ct: 0, m: null, tch: 0, torn: 0, addr: q.addr, twin: -1, kids: q.kids || [], circ: A.neural.wiring(q.p) > 1e-6, // local nerve signal, its effect on this segment's cilia, and whether the segment is wired at all
        mass: Math.max(1e-4, K.density * PI * rm * zm * q.len * (1 + K.armorDensity * q.p.armor)),
        sideArea: q.len * (q.z0 + q.z1), wetArea: PI * (rm + zm) * q.len,
        formArea: Math.abs(PI * q.r0 * q.z0 - PI * q.r1 * q.z1) + (q.leaf ? PI * q.r1 * q.z1 : 0) + (i === 0 ? PI * q.r0 * q.z0 : 0),
        tauMax: K.muscleStress * q.p.muscle * q.r0 * q.r0 * q.z0 * (q.supply == null ? 1 : q.supply),
        cil: (q.p.cilia || 0) * PI * (rm + zm) * q.len * (q.p.beat == null ? 1 : q.p.beat),
        pad: q.leaf && q.p.grip > 0.05, ax: 0, ay: 0, bx: 0, by: 0, dx: 1, dy: 0, vk: 1
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
      let tot = 0; for (const [, r, i] of s.aw) tot += Math.sqrt(r * r + i * i);
      for (const [k, r, i] of s.aw) b.m[k] += s.mass / 2 * Math.sqrt(r * r + i * i) / tot;
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
    // the segment that is this one's mirror image on the other side of the body (same place in the twin branch), if there is one
    if (b.segs.some(q => q.p.nn)) { const at = new Map(b.segs.map((q, i) => [q.addr, i])); for (const q of b.segs) { if (!q.addr) continue; const m = q.addr.match(/^(.*>[^>.]+\.)([01])((?:\/\d+)?)$/); if (m) { const t = at.get(m[1] + (m[2] === '0' ? '1' : '0') + m[3]); if (t != null) q.twin = t; } } }
    b.hasCilia = b.segs.some(q => q.cil !== 0); b.ciliaUse = 0; b.hasCircuit = b.segs.some(q => q.circ);
    // A body with no working joint keeps its shape: it is solved as one rigid body (same forces, far less work).
    b.rigid = !b.segs.some(q => q.id > 0 && q.tauMax > 0 && (q.p.amp > 0.02 || Math.abs(q.p.mJoint || 0) > 0.02));
    if (b.rigid) {
      const c = com(b); b.loc = new Float64Array(2 * np); b.th = 0; b.om = 0; b.inertia = 1e-9;
      for (let k = 0; k < np; k++) { b.loc[2 * k] = b.x[k] - c[0]; b.loc[2 * k + 1] = b.y[k] - c[1]; b.inertia += b.m[k] * (b.loc[2 * k] ** 2 + b.loc[2 * k + 1] ** 2); }
    }
    b.start = com(b);
    return b;
  }

  // refresh segment endpoints and directions from particles
  function pose(b) {
    const segs = b.segs, X = b.x, Y = b.y;
    for (let q = 0; q < segs.length; q++) {
      const s = segs[q], aw = s.aw; let ax = 0, ay = 0;
      for (let j = 0; j < aw.length; j++) { const w = aw[j], k = w[0], r = w[1], i = w[2]; ax += r * X[k] - i * Y[k]; ay += r * Y[k] + i * X[k]; }
      s.ax = ax; s.ay = ay; s.bx = X[s.b]; s.by = Y[s.b];
      const dx = s.bx - ax, dy = s.by - ay, l = Math.sqrt(dx * dx + dy * dy) || 1e-9;
      s.dx = dx / l; s.dy = dy / l; s.cur = l;
    }
  }
  function velA(b, s) { let vx = 0, vy = 0; for (const [k, r, i] of s.aw) { vx += r * b.vx[k] - i * b.vy[k]; vy += r * b.vy[k] + i * b.vx[k]; } return [vx, vy]; }
  function forceA(b, s, fx, fy) { for (const [k, r, i] of s.aw) { b.fx[k] += r * fx + i * fy; b.fy[k] += r * fy - i * fx; } }

  // One compliant angle constraint between segment s and its parent P.
  // free > 0 makes it a limit: nothing happens inside +-free of the target.
  const gk = new Int32Array(64), gxs = new Float64Array(64), gys = new Float64Array(64);
  function joint(b, s, P, target, alpha, damp, lamMax, free, dt) {
    const X = b.x, Y = b.y, IM = b.im, OX = b.ox, OY = b.oy, sa = s.aw, pa = P.aw;
    let cax = 0, cay = 0, pax = 0, pay = 0;
    for (let j = 0; j < sa.length; j++) { const w = sa[j], k = w[0]; cax += w[1] * X[k] - w[2] * Y[k]; cay += w[1] * Y[k] + w[2] * X[k]; }
    for (let j = 0; j < pa.length; j++) { const w = pa[j], k = w[0]; pax += w[1] * X[k] - w[2] * Y[k]; pay += w[1] * Y[k] + w[2] * X[k]; }
    let cx = X[s.b] - cax, cy = Y[s.b] - cay, px = X[P.b] - pax, py = Y[P.b] - pay;
    const lc = Math.sqrt(cx * cx + cy * cy) || 1e-9, lp = Math.sqrt(px * px + py * py) || 1e-9; cx /= lc; cy /= lc; px /= lp; py /= lp;
    let C = wrapPi(Math.atan2(px * cy - py * cx, px * cx + py * cy) - target);
    if (free > 0) { if (C > free) C -= free; else if (C < -free) C += free; else return 0;
      // A stop is put right by moving particles along the tangent, which is only right for a small angle. A joint found far beyond its stop (a small segment
      // turned over by the push of another part of its own body: 5 rad was seen) would be thrown several lengths sideways in one go, further out of place than
      // before, and the body's speed grew a thousandfold in each part of a step. So one call brings a joint back by half a radian at the most; the next calls
      // (several in every part of a step) do the rest. A joint that merely reaches its stop is never that far past it, and is treated exactly as before.
      if (C > 0.5) C = 0.5; else if (C < -0.5) C = -0.5; }
    const gcx = -cy / lc, gcy = cx / lc, gpx = py / lp, gpy = -px / lp; // d(theta)/d(B_child), d(theta)/d(B_parent)
    let n = 0;
    // gradient on each particle; a particle can receive several contributions
    gk[n] = s.b; gxs[n] = gcx; gys[n] = gcy; n++;
    for (let j = 0; j < sa.length; j++) { const w = sa[j], k = w[0], x = -(w[1] * gcx + w[2] * gcy), y = -(w[1] * gcy - w[2] * gcx); let q = 0; while (q < n && gk[q] !== k) q++; if (q === n) { gk[n] = k; gxs[n] = x; gys[n] = y; n++; } else { gxs[q] += x; gys[q] += y; } }
    { const k = P.b; let q = 0; while (q < n && gk[q] !== k) q++; if (q === n) { gk[n] = k; gxs[n] = gpx; gys[n] = gpy; n++; } else { gxs[q] += gpx; gys[q] += gpy; } }
    for (let j = 0; j < pa.length; j++) { const w = pa[j], k = w[0], x = -(w[1] * gpx + w[2] * gpy), y = -(w[1] * gpy - w[2] * gpx); let q = 0; while (q < n && gk[q] !== k) q++; if (q === n) { gk[n] = k; gxs[n] = x; gys[n] = y; n++; } else { gxs[q] += x; gys[q] += y; } }
    let den = 0, rate = 0;
    for (let j = 0; j < n; j++) { const k = gk[j]; den += IM[k] * (gxs[j] * gxs[j] + gys[j] * gys[j]); rate += gxs[j] * (X[k] - OX[k]) + gys[j] * (Y[k] - OY[k]); }
    const gamma = alpha * damp * dt; // damping proportional to stiffness
    let lam = -(C + gamma * rate) / ((1 + gamma) * den + alpha);
    lam = lam < -lamMax ? -lamMax : lam > lamMax ? lamMax : lam;
    for (let j = 0; j < n; j++) { const k = gk[j], g = lam * IM[k]; X[k] += g * gxs[j]; Y[k] += g * gys[j]; }
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
      const kn = 0.25 * env.fluid * K.cn * s.sideArea, kt = 0.25 * env.fluid * (K.cf * s.wetArea + K.cform * s.formArea), kv = K.visc * s.len * env.fluid * s.vk;
      for (let e = 0; e < 2; e++) {
        const vx = (e ? s.vbx : s.vax) - env.flowX, vy = (e ? s.vby : s.vay) - env.flowY;
        const vt = vx * s.dx + vy * s.dy, vn = -vx * s.dy + vy * s.dx;
        const me = 0.6 * (s.left == null ? s.mass : s.left) / dt; // never remove more than the end's own momentum in one step (s.left: the mass a wounded segment still has. With the whole mass here, a segment eaten down to a few thousandths was braked by hundreds of times its momentum each step, and its speed grew without bound)
        const ft = -Math.min(kt * Math.abs(vt) + kv, me) * vt, fn = -Math.min(kn * Math.abs(vn) + 2 * kv, me) * vn;
        const fx = ft * s.dx - fn * s.dy, fy = ft * s.dy + fn * s.dx;
        if (e) { b.fx[s.b] += fx; b.fy[s.b] += fy; } else forceA(b, s, fx, fy);
        b.heat -= (fx * vx + fy * vy) * dt;
      }
    }
    // cilia: the skin pushes water backwards along the segment and is pushed forwards. Needs water.
    if (env.fluid > 0 && b.hasCilia) for (const s of segs) {
      if (!s.cil) continue;
      const f = -K.cilia * s.cil * b.cmd.drive * s.cd * env.fluid * 0.5, t = K.cilia * Math.abs(s.cil) * (b.cmd.turn + s.ct) * env.fluid * 0.35;
      b.fx[s.b] += f * s.dx - t * s.dy; b.fy[s.b] += f * s.dy + t * s.dx; forceA(b, s, f * s.dx + t * s.dy, f * s.dy - t * s.dx);
      b.ciliaUse += Math.abs(s.cil) * (Math.abs(b.cmd.drive) * s.cd + 0.35 * Math.abs(b.cmd.turn + s.ct)) * dt;
    }
    // ground: pressed pads grip, whatever the pads cannot carry drags on the belly
    if (env.ground) {
      const W = b.mass * env.gravity; let cap = 0;
      for (const s of segs) if (s.pad) cap += s.padCap * s.press;
      const carried = Math.min(1, cap / W); b.carried = carried;
      if (cap > 0) for (const s of segs) {
        if (!s.pad || s.press <= 0) continue;
        const N = carried * W * s.padCap * s.press / cap, v = Math.sqrt(s.vbx * s.vbx + s.vby * s.vby), f = -K.muFoot * s.p.grip * N / (v + K.slip);
        b.fx[s.b] += f * s.vbx; b.fy[s.b] += f * s.vby;
      }
      if (carried < 1) for (let k = 0; k < np; k++) {
        const v = Math.sqrt(b.vx[k] * b.vx[k] + b.vy[k] * b.vy[k]), f = -K.muBelly * (1 - carried) * b.m[k] * env.gravity / (v + K.slip);
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
      joint(b, s, P, s.rest, b.hard ? 0 : 1 / (s.kLimit * dt2), K.damping, Infinity, s.p.range * 1.1 + 0.03, dt); // (b.hard: the end of a joint's range is a stop, not a stiffer spring)
    }
    { const X = b.x, Y = b.y, IM = b.im;
      for (let it = 0; it < K.iters; it++) for (let q = 0; q < segs.length; q++) {
        const s = segs[q], aw = s.aw, sb = s.b; let ax = 0, ay = 0, wsum = IM[sb];
        for (let j = 0; j < aw.length; j++) { const w = aw[j], k = w[0], r = w[1], i = w[2]; ax += r * X[k] - i * Y[k]; ay += r * Y[k] + i * X[k]; wsum += (r * r + i * i) * IM[k]; }
        let nx = X[sb] - ax, ny = Y[sb] - ay; const l = Math.sqrt(nx * nx + ny * ny) || 1e-9; nx /= l; ny /= l;
        const lam = -(l - s.len) / wsum;
        X[sb] += lam * IM[sb] * nx; Y[sb] += lam * IM[sb] * ny;
        for (let j = 0; j < aw.length; j++) { const w = aw[j], k = w[0], g = lam * IM[k]; X[k] -= g * (w[1] * nx + w[2] * ny); Y[k] -= g * (w[1] * ny - w[2] * nx); }
        if (b.hard && q === segs.length - 1) for (let i = 1; i < segs.length; i++) { const s2 = segs[i]; joint(b, s2, segs[s2.parent], s2.rest, 0, 0, Infinity, s2.p.range * 1.1 + 0.03, dt); } // (b.hard) the stops hold while the lengths are put right
      }
    }
    for (let k = 0; k < np; k++) { b.vx[k] = (b.x[k] - b.ox[k]) / dt; b.vy[k] = (b.y[k] - b.oy[k]) / dt; }
    if (env.fluid > 0) { const top = K.vmax, top2 = top * top; // (see K.vmax) in water: what a particle has beyond the limit, against the water, is gone, as if the water had taken it
      for (let k = 0; k < np; k++) { const rx = b.vx[k] - env.flowX, ry = b.vy[k] - env.flowY, r2 = rx * rx + ry * ry; if (r2 > top2) { const f = top / Math.sqrt(r2); b.vx[k] = env.flowX + rx * f; b.vy[k] = env.flowY + ry * f; b.x[k] = b.ox[k] + b.vx[k] * dt; b.y[k] = b.oy[k] + b.vy[k] * dt; b.capped = (b.capped || 0) + 1; } } }
    b.t += dt;
  }

  // Rigid body: forces on every segment are the same as in the jointed solver (water, cilia, ground);
  // they are summed into one force and one torque about the centre of mass.
  function rigidStep(b, dt, n) {
    n = Math.max(1, n >> 1); // no stiff joints to resolve: half the substeps are enough
    const { segs, env } = b, np = b.np, M = b.mass, h = dt / n;
    A.neural.cpg(b, b.t, b.cmd);
    let cx = 0, cy = 0, vx = 0, vy = 0;
    for (let k = 0; k < np; k++) { cx += b.x[k] * b.m[k]; cy += b.y[k] * b.m[k]; vx += b.vx[k] * b.m[k]; vy += b.vy[k] * b.m[k]; }
    cx /= M; cy /= M; vx /= M; vy /= M; let om = b.om, th = b.th;
    for (let it = 0; it < n; it++) {
      const c = Math.cos(th), sn = Math.sin(th);
      for (let k = 0; k < np; k++) { const lx = b.loc[2 * k], ly = b.loc[2 * k + 1]; b.x[k] = cx + lx * c - ly * sn; b.y[k] = cy + lx * sn + ly * c; }
      pose(b);
      let Fx = 0, Fy = 0, T = 0;
      const fluid = env.fluid, drive = b.cmd.drive, turn = b.cmd.turn, fwx = env.flowX, fwy = env.flowY;
      for (let q = 0; q < segs.length; q++) {
        const s = segs[q], dx = s.dx, dy = s.dy;
        if (fluid > 0) {
          const kn = 0.25 * fluid * K.cn * s.sideArea, kt = 0.25 * fluid * (K.cf * s.wetArea + K.cform * s.formArea), kv = K.visc * s.len * fluid * s.vk, me = 0.6 * (s.left == null ? s.mass : s.left) / h;
          for (let e = 0; e < 2; e++) {
            const px = e ? s.bx : s.ax, py = e ? s.by : s.ay, rx = vx - om * (py - cy) - fwx, ry = vy + om * (px - cx) - fwy, vt = rx * dx + ry * dy, vn = -rx * dy + ry * dx;
            const at = kt * (vt < 0 ? -vt : vt) + kv, an = kn * (vn < 0 ? -vn : vn) + 2 * kv, ft = -(at < me ? at : me) * vt, fn = -(an < me ? an : me) * vn;
            let fx = ft * dx - fn * dy, fy = ft * dy + fn * dx;
            if (s.cil) { const f = -K.cilia * s.cil * drive * s.cd * fluid * 0.5, t = K.cilia * (s.cil < 0 ? -s.cil : s.cil) * (turn + s.ct) * fluid * 0.35 * (e ? -1 : 1); fx += f * dx + t * dy; fy += f * dy - t * dx; }
            Fx += fx; Fy += fy; T += (px - cx) * fy - (py - cy) * fx;
          }
          if (s.cil) b.ciliaUse += (s.cil < 0 ? -s.cil : s.cil) * ((drive < 0 ? -drive : drive) * s.cd + 0.35 * Math.abs(turn + s.ct)) * h;
        }
        s.vbx = vx - om * (s.by - cy); s.vby = vy + om * (s.bx - cx);
      }
      if (env.ground) {
        const W = M * env.gravity; let cap = 0;
        for (const s of segs) if (s.pad) cap += s.padCap * s.press;
        const carried = Math.min(1, cap / W); b.carried = carried;
        if (cap > 0) for (const s of segs) { if (!s.pad || s.press <= 0) continue; const N = carried * W * s.padCap * s.press / cap, v = Math.sqrt(s.vbx * s.vbx + s.vby * s.vby), f = -K.muFoot * s.p.grip * N / (v + K.slip), fx = f * s.vbx, fy = f * s.vby; Fx += fx; Fy += fy; T += (s.bx - cx) * fy - (s.by - cy) * fx; }
        if (carried < 1) for (let k = 0; k < np; k++) { const ux = vx - om * (b.y[k] - cy), uy = vy + om * (b.x[k] - cx), v = Math.sqrt(ux * ux + uy * uy), f = -K.muBelly * (1 - carried) * b.m[k] * env.gravity / (v + K.slip), fx = f * ux, fy = f * uy; Fx += fx; Fy += fy; T += (b.x[k] - cx) * fy - (b.y[k] - cy) * fx; }
      }
      vx += Fx / M * h; vy += Fy / M * h; om += T / b.inertia * h; cx += vx * h; cy += vy * h; th += om * h; b.t += h;
    }
    const c = Math.cos(th), sn = Math.sin(th);
    for (let k = 0; k < np; k++) { const lx = b.loc[2 * k], ly = b.loc[2 * k + 1], rx = lx * c - ly * sn, ry = lx * sn + ly * c; b.x[k] = cx + rx; b.y[k] = cy + ry; b.vx[k] = vx - om * ry; b.vy[k] = vy + om * rx; }
    b.om = om; b.th = th; pose(b);
  }

  function step(b, dt, sub) { const n = sub || K.substeps; if (b.rigid) return rigidStep(b, dt, n); for (let i = 0; i < n; i++) substep(b, dt / n); pose(b); }

  // A push from outside (another body): an impulse on the particle at a segment's far end.
  // A rigid body takes it as a whole (linear and angular); a jointed one on that particle, and its joints pass it on.
  function impulse(b, k, jx, jy) {
    if (b.rigid) {
      const M = b.mass; let cx = 0, cy = 0; for (let i = 0; i < b.np; i++) { cx += b.x[i] * b.m[i]; cy += b.y[i] * b.m[i]; } cx /= M; cy /= M;
      const dw = ((b.x[k] - cx) * jy - (b.y[k] - cy) * jx) / b.inertia; b.om += dw;
      for (let i = 0; i < b.np; i++) { b.vx[i] += jx / M - dw * (b.y[i] - cy); b.vy[i] += jy / M + dw * (b.x[i] - cx); }
    } else { b.vx[k] += jx / b.m[k]; b.vy[k] += jy / b.m[k]; }
  }
  // (solid) A push at a place along a segment: t = 0 its near end, 1 its far end. A rigid body takes it as a whole. In a jointed one the far end's share goes
  // to the segment's particle and the near end's share to whatever carries the near end (the same weights that fix the near end in the parent's frame).
  function impulseAt(b, s, t, jx, jy) {
    if (b.rigid) {
      const M = b.mass; let cx = 0, cy = 0; for (let i = 0; i < b.np; i++) { cx += b.x[i] * b.m[i]; cy += b.y[i] * b.m[i]; } cx /= M; cy /= M;
      const x = s.ax + (s.bx - s.ax) * t, y = s.ay + (s.by - s.ay) * t, dw = ((x - cx) * jy - (y - cy) * jx) / b.inertia; b.om += dw;
      for (let i = 0; i < b.np; i++) { b.vx[i] += jx / M - dw * (b.y[i] - cy); b.vy[i] += jy / M + dw * (b.x[i] - cx); }
    } else { const k = s.b, u = 1 - t; b.vx[k] += t * jx / b.m[k]; b.vy[k] += t * jy / b.m[k];
      if (u > 0) for (const [k2, r, i] of s.aw) { b.vx[k2] += u * (r * jx + i * jy) / b.m[k2]; b.vy[k2] += u * (r * jy - i * jx) / b.m[k2]; } }
  }
  // (solid) For a push of 1 at a place along a segment (and for a shift of 1 there): the largest change it makes to the speed (the place) of any single particle,
  // the far end's own or one that carries the near end. A push is sized by the particle at the far end; a carrier can be hundreds of times lighter (a segment that
  // has only begun to grow, with a full-grown one hanging on it) and can sit on a long lever. Callers use this to keep every particle within what the push was meant
  // to give: without it a growing body of fifty segments, alone in the water, threw itself out of the world in ten seconds.
  function reach(b, s, t) { if (b.rigid) return 1 / b.mass; const u = 1 - t; let m = t * b.im[s.b]; if (u > 0) for (const [k, r, i] of s.aw) { const f = u * Math.sqrt(r * r + i * i) * b.im[k]; if (f > m) m = f; } return m; }
  // (solid) Move a point of a jointed body by (dx, dy) times the share its carriers can take: returns how readily that point moves (the sum of the weights
  // squared over the masses), and with `go` does the moving. Used to part two segments of one body that have run into each other.
  function ease(b, s, t) { const u = 1 - t; let w = t * t * b.im[s.b]; if (u > 0) for (const [k, r, i] of s.aw) w += u * u * (r * r + i * i) * b.im[k]; return w; }
  function shiftAt(b, s, t, lx, ly) { const u = 1 - t, k = s.b; b.x[k] += t * b.im[k] * lx; b.y[k] += t * b.im[k] * ly; if (u > 0) for (const [k2, r, i] of s.aw) { b.x[k2] += u * b.im[k2] * (r * lx + i * ly); b.y[k2] += u * b.im[k2] * (r * ly - i * lx); } }
  // (solid) Tissue that is gone weighs nothing and catches no water: each segment's mass and the areas the water acts on follow the share of it that is left.
  function remass(b, left) {
    const np = b.np; b.m.fill(0);
    for (const s of b.segs) { const h = left[s.id] == null ? 1 : left[s.id], m = Math.max(1e-5, s.mass * h); s.left = m; b.m[s.b] += m / 2; let tot = 0; for (const [, r, i] of s.aw) tot += Math.sqrt(r * r + i * i); for (const [k, r, i] of s.aw) b.m[k] += m / 2 * Math.sqrt(r * r + i * i) / tot;
      if (s.area0 == null) s.area0 = [s.sideArea, s.wetArea, s.formArea]; s.sideArea = s.area0[0] * h; s.wetArea = s.area0[1] * h; s.formArea = s.area0[2] * h; }
    b.mass = 0; for (let k = 0; k < np; k++) { b.im[k] = 1 / b.m[k]; b.mass += b.m[k]; }
    if (b.rigid) { let cx = 0, cy = 0; for (let k = 0; k < np; k++) { cx += b.loc[2 * k] * b.m[k]; cy += b.loc[2 * k + 1] * b.m[k]; } cx /= b.mass; cy /= b.mass; b.inertia = 1e-9;
      for (let k = 0; k < np; k++) { b.loc[2 * k] -= cx; b.loc[2 * k + 1] -= cy; b.inertia += b.m[k] * (b.loc[2 * k] ** 2 + b.loc[2 * k + 1] ** 2); } }
  }
  // (solid) Where two segments are nearest each other. Each is a line from its near end to its far end; (ox, oy) is added to the second (for a world that wraps).
  // Returns the distance and sets near.s, near.t (how far along each, 0..1) and near.x, near.y (from the point on the first to the point on the second).
  const near = { s: 0, t: 0, x: 0, y: 0 };
  function nearest(p, q, ox, oy) {
    const d1x = p.bx - p.ax, d1y = p.by - p.ay, d2x = q.bx - q.ax, d2y = q.by - q.ay, rx = p.ax - (q.ax + ox), ry = p.ay - (q.ay + oy);
    const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry; let s2, t2;
    if (a <= 1e-12 && e <= 1e-12) { s2 = 0; t2 = 0; }
    else if (a <= 1e-12) { s2 = 0; t2 = clamp(f / e, 0, 1); }
    else { const c = d1x * rx + d1y * ry;
      if (e <= 1e-12) { t2 = 0; s2 = clamp(-c / a, 0, 1); }
      else { const bb = d1x * d2x + d1y * d2y, den = a * e - bb * bb; s2 = den > 1e-12 ? clamp((bb * f - c * e) / den, 0, 1) : 0; t2 = (bb * s2 + f) / e;
        if (t2 < 0) { t2 = 0; s2 = clamp(-c / a, 0, 1); } else if (t2 > 1) { t2 = 1; s2 = clamp((bb - c) / a, 0, 1); } } }
    near.s = s2; near.t = t2; near.x = (q.ax + ox + d2x * t2) - (p.ax + d1x * s2); near.y = (q.ay + oy + d2y * t2) - (p.ay + d1y * s2);
    return Math.sqrt(near.x * near.x + near.y * near.y);
  }
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
      step(b, dt); const c = com(b); path += Math.sqrt((c[0] - last[0]) * (c[0] - last[0]) + (c[1] - last[1]) * (c[1] - last[1])); last = c;
      for (let i = 1; i < b.segs.length; i++) maxBend = Math.max(maxBend, Math.abs(wrapPi(b.segs[i].theta - b.segs[i].rest)));
    }
    const dist = Math.sqrt((last[0] - c0[0]) * (last[0] - c0[0]) + (last[1] - c0[1]) * (last[1] - c0[1])), work = b.work - w0;
    return { ok: finite(b), distance: dist, path, speed: dist / T, work, power: work / T, mass: b.mass, costOfTransport: dist > 1e-6 ? work / (b.mass * dist) : Infinity, maxBend, body: b };
  }

  A.physics = { K, build, step, pose, com, momentum, finite, trial, environment, impulse, impulseAt, remass, nearest, near, ease, shiftAt, reach };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
