// ALIFE 2.0 — procedural body renderer.
//
// The body is not drawn as cells. Every segment is a tapered capsule in a
// signed distance field; segments of one chain are unioned exactly, different
// chains are blended smoothly, and the result is treated as a height field
// (thickness out of the plane) that is lit and made translucent. Organs are
// drawn underneath from the same body plan, so any change of shape or pose
// changes the picture. There are no sprites and no per-species code.
(function (G) {
  'use strict';
  const A = G.ALIFE2 = G.ALIFE2 || {};
  const PI = Math.PI, TAU = PI * 2, BIG = 1e9;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hash = n => { n = Math.imul(n ^ n >>> 16, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return ((n ^ n >>> 16) >>> 0) / 4294967295; };
  function hsl(h, s, l) { h = ((h % 360) + 360) % 360 / 360; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = t => { t = (t % 1 + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)]; }
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const h = (a, b) => hash(a * 374761393 + b * 668265263 | 0), a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  const COL = { nerve: '190,140,255', gut: '236,214,96', gutCore: '255,150,70', muscle: '255,96,96', gonad: '255,150,205', store: '255,236,170' };

  class Renderer {
    constructor() { this.w = 0; this.h = 0; this.canvas = null; }
    resize(w, h) {
      if (w === this.w && h === this.h) return;
      this.w = w; this.h = h; const n = w * h;
      for (const k of ['S', 'R', 'Z', 'AR', 'SK', 'H', 'U', 'V', 's2', 'r2', 'z2', 'a2', 'k2', 'u2', 'v2']) this[k] = new Float32Array(n);
      this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null;
      this.img = this.canvas ? this.canvas.getContext('2d').createImageData(w, h) : { data: new Uint8ClampedArray(n * 4), width: w, height: h };
    }

    // Pixel-space segments grouped by chain, thickest chain first, with a running body coordinate u0.
    layout(segs, view, q) {
      const w = Math.max(8, Math.round(view.w * q)), h = Math.max(8, Math.round(view.h * q)), sc = view.scale * q;
      const ps = segs.map(s => ({
        ax: (s.ax - view.cx) * sc + w / 2, ay: (s.ay - view.cy) * sc + h / 2, bx: (s.bx - view.cx) * sc + w / 2, by: (s.by - view.cy) * sc + h / 2,
        r0: Math.max(0.35, s.r0 * sc), r1: Math.max(0.35, s.r1 * sc), z0: Math.max(0.35, s.z0 * sc), z1: Math.max(0.35, s.z1 * sc), armor: s.p.armor, skin: s.p.skin, group: s.group,
        gut: s.p.gut, muscle: s.parent >= 0 ? s.p.muscle : 0, nerve: s.p.nerve, gonad: s.p.gonad, store: s.p.store, act: s.act || 0
      }));
      const groups = new Map();
      for (const p of ps) { if (!groups.has(p.group)) groups.set(p.group, []); groups.get(p.group).push(p); }
      const order = [...groups.values()].sort((a, b) => Math.max(...b.map(p => p.r0)) - Math.max(...a.map(p => p.r0)));
      for (const grp of order) { let run = grp[0].group * 37.3; for (const p of grp) { p.u0 = run; run += Math.hypot(p.bx - p.ax, p.by - p.ay); } }
      return order;
    }
    colors(hue) { return { body: hsl(hue, 0.30, 0.60), rim: hsl(hue + 25, 0.45, 0.88), arm: hsl(hue - 25, 0.22, 0.55), deep: hsl(hue + 200, 0.5, 0.3) }; }

    // segs: world-space segments (plan.segs or body.segs). view: {cx, cy, scale, w, h}.
    // Returns the RGBA field; the bounding box drawn is left in this.box.
    field(segs, view, opt) {
      opt = opt || {};
      const q = opt.quality || 1, w = Math.max(8, Math.round(view.w * q)), h = Math.max(8, Math.round(view.h * q)), sc = view.scale * q;
      this.resize(w, h);
      const { S, R, Z, AR, SK, H, U, V, s2, r2, z2, a2, k2, u2, v2 } = this;
      S.fill(BIG);
      const order = this.layout(segs, view, q);
      let X0 = w, Y0 = h, X1 = 0, Y1 = 0;
      for (const grp of order) {
        let gx0 = w, gy0 = h, gx1 = 0, gy1 = 0, rmax = 0;
        for (const p of grp) rmax = Math.max(rmax, p.r0, p.r1);
        const pad = rmax * 0.6 + 3;
        for (const p of grp) {
          const r = Math.max(p.r0, p.r1) + pad;
          p.x0 = Math.max(0, Math.floor(Math.min(p.ax, p.bx) - r)); p.x1 = Math.min(w - 1, Math.ceil(Math.max(p.ax, p.bx) + r));
          p.y0 = Math.max(0, Math.floor(Math.min(p.ay, p.by) - r)); p.y1 = Math.min(h - 1, Math.ceil(Math.max(p.ay, p.by) + r));
          gx0 = Math.min(gx0, p.x0); gy0 = Math.min(gy0, p.y0); gx1 = Math.max(gx1, p.x1); gy1 = Math.max(gy1, p.y1);
        }
        if (gx1 < gx0 || gy1 < gy0) continue;
        for (let y = gy0; y <= gy1; y++) s2.fill(BIG, y * w + gx0, y * w + gx1 + 1);
        for (const p of grp) {
          const u0 = p.u0;
          const ex = p.bx - p.ax, ey = p.by - p.ay, L2 = ex * ex + ey * ey || 1e-9, dr = p.r1 - p.r0, dz = p.z1 - p.z0;
          for (let y = p.y0; y <= p.y1; y++) {
            const dy = y + 0.5 - p.ay; let i = y * w + p.x0;
            for (let x = p.x0; x <= p.x1; x++, i++) {
              const dx = x + 0.5 - p.ax, tr = (dx * ex + dy * ey) / L2; let t = tr < 0 ? 0 : tr > 1 ? 1 : tr;
              const qx = dx - t * ex, qy = dy - t * ey, s = Math.sqrt(qx * qx + qy * qy) - (p.r0 + dr * t);
              if (s < s2[i] && s < pad) { s2[i] = s; r2[i] = p.r0 + dr * t; z2[i] = p.z0 + dz * t; a2[i] = p.armor; k2[i] = p.skin; u2[i] = u0 + tr * Math.sqrt(L2); v2[i] = (dx * ey - dy * ex) / Math.sqrt(L2); }
            }
          }
        }
        // smooth union of this chain into the body
        for (let y = gy0; y <= gy1; y++) for (let x = gx0, i = y * w + gx0; x <= gx1; x++, i++) {
          const g = s2[i]; if (g >= BIG) continue;
          const f = S[i];
          if (f >= BIG) { S[i] = g; R[i] = r2[i]; Z[i] = z2[i]; AR[i] = a2[i]; SK[i] = k2[i]; U[i] = u2[i]; V[i] = v2[i]; continue; }
          const k = 0.55 * Math.min(R[i], r2[i]) + 1.2; let m = 0.5 + 0.5 * (g - f) / k; m = m < 0 ? 0 : m > 1 ? 1 : m;
          S[i] = g + (f - g) * m - k * m * (1 - m); R[i] = r2[i] + (R[i] - r2[i]) * m; Z[i] = z2[i] + (Z[i] - z2[i]) * m;
          AR[i] = a2[i] + (AR[i] - a2[i]) * m; SK[i] = k2[i] + (SK[i] - k2[i]) * m; if (m < 0.5) { U[i] = u2[i]; V[i] = v2[i]; }
        }
        X0 = Math.min(X0, gx0); Y0 = Math.min(Y0, gy0); X1 = Math.max(X1, gx1); Y1 = Math.max(Y1, gy1);
      }
      const d = this.img.data; d.fill(0);
      this.box = [X0, Y0, X1, Y1, q];
      if (X1 < X0) return this.img;
      X0 = Math.max(1, X0); Y0 = Math.max(1, Y0); X1 = Math.min(w - 2, X1); Y1 = Math.min(h - 2, Y1);
      for (let y = Y0 - 1; y <= Y1 + 1; y++) for (let x = X0 - 1, i = y * w + X0 - 1; x <= X1 + 1; x++, i++) {
        const s = S[i]; if (s > 0.5) { H[i] = 0; continue; }
        let u = -s / R[i]; u = u < 0 ? 0 : u > 1 ? 1 : u;
        H[i] = Z[i] * Math.sqrt(u * (2 - u));
      }
      const hue = opt.hue == null ? 170 : opt.hue;
      const { body, rim: rimC, arm, deep } = this.colors(hue);
      const lx = -0.42, ly = -0.58, lz = 0.70, hx = lx, hy = ly, hz = lz + 1, hn = Math.hypot(hx, hy, hz);
      for (let y = Y0; y <= Y1; y++) for (let x = X0, i = y * w + X0; x <= X1; x++, i++) {
        const s = S[i]; if (s > 0.5) continue;
        const cov = s < -0.5 ? 1 : 0.5 - s;
        let nx = (H[i - 1] - H[i + 1]) * 0.5, ny = (H[i - w] - H[i + w]) * 0.5; const nl = 1 / Math.sqrt(nx * nx + ny * ny + 1); nx *= nl; ny *= nl; const nz = nl;
        const diff = Math.max(0, nx * lx + ny * ly + nz * lz), back = Math.max(0, -(nx * lx + ny * ly) * 0.6 + nz * 0.2);
        const a = AR[i], k = SK[i];
        let sp = Math.max(0, (nx * hx + ny * hy + nz * hz) / hn); sp = Math.pow(sp, 26 + 50 * a) * (0.55 + 0.6 * a);
        const rim = Math.pow(1 - nz, 2.2), thick = H[i] / (Z[i] + 1e-6), e = -s;
        // body-fixed texture: cytoplasm granules and fine rings around the body
        const gr = noise(U[i] * 0.42, V[i] * 0.42), fine = noise(U[i] * 1.3 + 9, V[i] * 1.3), ring = 0.5 + 0.5 * Math.sin(U[i] * 6.283 / Math.max(2.6, R[i] * 0.16));
        const tex = 0.72 + 0.4 * gr + 0.16 * fine + (0.10 + 0.14 * a) * ring * thick;
        const small = R[i] < 14 ? 0.3 + 0.05 * R[i] : 1; // a thin body gets a thin cuticle, not a drawn outline
        const cut = small * Math.exp(-(e - 0.9) * (e - 0.9) * 0.9), gap = small * Math.exp(-(e - 3.2) * (e - 3.2) * 0.35);
        const lit = (0.22 + 0.60 * diff) * tex, bl = 0.20 * back, speck = fine > 0.86 ? (fine - 0.86) * 3 * thick : 0;
        let r = body[0] + (arm[0] - body[0]) * a, g = body[1] + (arm[1] - body[1]) * a, b = body[2] + (arm[2] - body[2]) * a;
        const edge = rim * 0.6 * small + cut * 0.4 + speck;
        r = r * lit + deep[0] * bl + rimC[0] * edge + sp; g = g * lit + deep[1] * bl + rimC[1] * edge + sp; b = b * lit + deep[2] * bl + rimC[2] * edge + sp;
        let al = (0.05 + 0.34 * k + 0.40 * a) * (0.35 + 0.65 * thick) * (0.65 + 0.7 * gr) * (1 - 0.45 * gap) + rim * (0.2 + 0.35 * small) + cut * 0.42 + sp * small + speck * 0.6 + (1 - small) * 0.22 * thick; al = (al > 0.96 ? 0.96 : al) * cov;
        const j = i * 4; d[j] = r * 255; d[j + 1] = g * 255; d[j + 2] = b * 255; d[j + 3] = al * 255;
      }
      return this.img;
    }

    // Full picture: shadow, organs, skin, surface structures.
    draw(ctx, segs, view, opt) {
      opt = opt || {};
      // quality > 1 draws the body larger and scales it down: a small body keeps its shading instead of turning into an outline
      const q = opt.quality || 1, organs = opt.internals !== false; let skin = null, src = null; this.used = 'cpu';
      if (opt.gpu !== false && A.gpu) {
        const g = this.gpuSkin = A.gpu.shared();
        if (g.ok && segs.length <= A.gpu.MAXS) { skin = g.render(this.layout(segs, view, q), Math.max(8, Math.round(view.w * q)), Math.max(8, Math.round(view.h * q)), this.colors(opt.hue == null ? 170 : opt.hue), organs); if (skin) { this.used = 'gpu'; src = g.region; } }
      }
      if (!skin) { const img = this.field(segs, view, opt); this.canvas.getContext('2d').putImageData(img, 0, 0); skin = this.canvas; src = [0, 0, this.w, this.h]; }
      const blit = (dx, dy) => ctx.drawImage(skin, src[0], src[1], src[2], src[3], dx, dy, view.w, view.h);
      const T = (x, y) => [(x - view.cx) * view.scale + view.w / 2, (y - view.cy) * view.scale + view.h / 2], sc = view.scale;
      ctx.save();
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      if (opt.shadow) { ctx.save(); ctx.globalAlpha = 0.45; ctx.filter = 'brightness(0) blur(' + Math.max(2, sc * 0.35) + 'px)'; blit(sc * 0.35, sc * 0.5); ctx.restore(); }
      if (opt.glow !== false) { ctx.save(); ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(' + Math.max(3, sc * 0.5) + 'px)'; blit(0, 0); ctx.restore(); }
      // on the GPU the organs are part of the body picture; only the eyes are drawn here, under the skin
      if (organs) this.organs(ctx, segs, T, sc, this.used === 'gpu' ? Object.assign({}, opt, { eyesOnly: true }) : opt);
      blit(0, 0);
      this.surface(ctx, segs, T, sc, opt);
      ctx.restore();
    }

    organs(ctx, segs, T, sc, opt) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const blob = (x, y, rx, ry, ang, col, a) => {
        if (rx < 0.4 || ry < 0.4) return;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(-rx * 0.25, -rx * 0.3, 0, 0, 0, rx); g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(0.35, 'rgba(' + col + ',' + a + ')'); g.addColorStop(1, 'rgba(' + col + ',' + a * 0.15 + ')');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
      };
      for (const s of segs) {
        const p = s.p, [ax, ay] = T(s.ax, s.ay), [bx, by] = T(s.bx, s.by), ang = Math.atan2(by - ay, bx - ax), L = Math.hypot(bx - ax, by - ay);
        const rm = (s.r0 + s.r1) / 2 * sc, mx = (ax + bx) / 2, my = (ay + by) / 2, nx = -Math.sin(ang), ny = Math.cos(ang);
        // muscle: two antagonist bands, the working side lights up
        const eo = opt.eyesOnly;
        if (!eo && p.muscle > 0.05 && s.parent >= 0 && rm > 1.2) {
          const act = s.act || 0;
          for (const side of [-1, 1]) for (let fb = 0; fb < 4; fb++) {
            const on = Math.max(0, side * act), o = side * (0.42 + 0.13 * fb), k0 = s.r0 * sc * o, k1 = s.r1 * sc * o;
            ctx.strokeStyle = 'rgba(' + COL.muscle + ',' + (0.05 + 0.13 * p.muscle + 0.45 * on) + ')'; ctx.lineWidth = Math.max(0.5, rm * 0.05 * (0.6 + p.muscle) * (1 + 0.6 * on));
            ctx.beginPath(); ctx.moveTo(ax + nx * k0, ay + ny * k0); ctx.lineTo(bx + nx * k1, by + ny * k1); ctx.stroke();
          }
        }
        if (!eo && p.gut > 0.05) { blob(mx, my, L * 0.62 + rm * 0.2, rm * (0.25 + 0.4 * p.gut), ang, COL.gut, 0.75); blob(mx, my, L * 0.3, rm * 0.3 * p.gut, ang, COL.gutCore, 0.6);
          for (let k = 0; k < 7; k++) { const u = hash(s.id * 41 + k * 3) - 0.5, v = hash(s.id * 23 + k * 19) - 0.5; ctx.fillStyle = k % 2 ? 'rgba(90,60,20,.45)' : 'rgba(255,245,200,.5)'; ctx.beginPath(); ctx.arc(mx + Math.cos(ang) * u * L - Math.sin(ang) * v * rm * 0.6 * p.gut, my + Math.sin(ang) * u * L + Math.cos(ang) * v * rm * 0.6 * p.gut, Math.max(0.5, rm * 0.06), 0, TAU); ctx.fill(); } }
        if (!eo && p.store > 0.1) for (let k = 0; k < 3; k++) { const u = hash(s.id * 31 + k * 7), v = hash(s.id * 17 + k * 13) - 0.5; blob(ax + (bx - ax) * u + nx * v * rm, ay + (by - ay) * u + ny * v * rm, rm * 0.22 * p.store + 0.5, rm * 0.22 * p.store + 0.5, 0, COL.store, 0.7); }
        if (!eo && p.gonad > 0.1) for (let k = 0; k < 5; k++) { const u = 0.3 + 0.4 * hash(s.id * 53 + k * 11), v = (hash(s.id * 29 + k * 5) - 0.5) * 1.1; blob(ax + (bx - ax) * u + nx * v * rm, ay + (by - ay) * u + ny * v * rm, rm * 0.2 * p.gonad + 0.5, rm * 0.2 * p.gonad + 0.5, 0, COL.gonad, 0.75); }
        if (p.eye > 0.1) {
          const ux = Math.cos(ang), uy = Math.sin(ang), re = s.r0 * sc + (s.r1 - s.r0) * sc * 0.45, er = Math.max(1, re * 0.17 * (0.5 + p.eye));
          for (const side of s.axial ? [-1, 1] : [0]) {
            const x = ax + ux * L * 0.45 + nx * side * re * 0.62, y = ay + uy * L * 0.45 + ny * side * re * 0.62;
            const g = ctx.createRadialGradient(x, y, 0, x, y, er * 1.5); g.addColorStop(0, 'rgba(8,4,6,.95)'); g.addColorStop(0.55, 'rgba(60,14,18,.9)'); g.addColorStop(0.8, 'rgba(150,50,30,.45)'); g.addColorStop(1, 'rgba(150,50,30,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, er * 1.5, 0, TAU); ctx.fill();
          }
        }
        if (!eo && p.nerve > 0.05 && rm > 0.8) {
          ctx.strokeStyle = 'rgba(' + COL.nerve + ',' + (0.25 + 0.55 * p.nerve) + ')'; ctx.lineWidth = Math.max(0.6, rm * 0.10 * (0.5 + p.nerve));
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          blob(ax, ay, rm * 0.2 * (0.4 + p.nerve), rm * 0.2 * (0.4 + p.nerve), 0, COL.nerve, 0.8);
          if (p.nerve > 0.7) blob(mx, my, L * 0.3 + rm * 0.25, rm * 0.5, ang, COL.nerve, 0.7);
        }
      }
      ctx.restore();
    }

    surface(ctx, segs, T, sc, opt) {
      ctx.save(); ctx.lineCap = 'round';
      for (const s of segs) {
        const p = s.p, [ax, ay] = T(s.ax, s.ay), [bx, by] = T(s.bx, s.by), ang = Math.atan2(by - ay, bx - ax), L = Math.hypot(bx - ax, by - ay);
        const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, r0 = s.r0 * sc, r1 = s.r1 * sc;
        // cilia: rows of beating hairs. The wave runs at the rate, and in the direction, they actually beat.
        if (p.cilia > 0.05 && L > 2 && r0 + r1 > 3) {
          const n = Math.min(60, Math.max(4, Math.round(L / 2.4 * (0.4 + p.cilia)))), beat = p.beat == null ? 1 : p.beat, ph = (opt.time || 0) * 14 * beat * (opt.drive == null ? 1 : opt.drive);
          ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(225,245,255,' + (0.25 + 0.4 * p.cilia) + ')'; ctx.beginPath();
          for (let k = 0; k < n; k++) for (const side of [-1, 1]) {
            const u = (k + 0.5) / n, r = r0 + (r1 - r0) * u, len = 2.5 + r * 0.42, wv = Math.sin(ph - u * n * 0.55 + (side > 0 ? 0 : 1.3));
            const lean = side * (1.15 - 0.55 * wv * Math.sign(beat || 1)), x = ax + ux * L * u + nx * side * r * 0.98, y = ay + uy * L * u + ny * side * r * 0.98, a1 = ang + lean, a2 = a1 - side * 0.5 * wv;
            ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a1) * len * 0.55, y + Math.sin(a1) * len * 0.55, x + Math.cos(a1) * len * 0.55 + Math.cos(a2) * len * 0.5, y + Math.sin(a1) * len * 0.55 + Math.sin(a2) * len * 0.5);
          }
          ctx.stroke();
        }
        // sensory bristles: as many as the part has nerve
        if (p.nerve > 0.25 && L > 3 && opt.bristles !== false) {
          const n = Math.min(14, Math.round(L / 5 * p.nerve)); ctx.lineWidth = 0.5;
          for (let k = 0; k < n; k++) for (const side of [-1, 1]) {
            const u = (k + 0.5) / n, r = r0 + (r1 - r0) * u, j = hash(s.id * 97 + k * 13 + side), len = (2 + r * 0.6) * (0.3 + 1.1 * j * j), lean = side * (0.9 + 0.5 * j) + (opt.time ? Math.sin(opt.time * 3 + s.id + k) * 0.08 : 0);
            const x = ax + ux * L * u + nx * side * r * 0.97, y = ay + uy * L * u + ny * side * r * 0.97, c = Math.cos(ang + lean), d = Math.sin(ang + lean);
            ctx.strokeStyle = 'rgba(215,240,255,' + (0.12 + 0.25 * j) + ')'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + c * len, y + d * len); ctx.stroke();
          }
        }
        // exoskeleton: a plate edge across each armoured joint
        if (p.armor > 0.3 && s.parent >= 0 && r0 > 2.5) {
          ctx.strokeStyle = 'rgba(10,20,30,' + 0.45 * p.armor + ')'; ctx.lineWidth = Math.max(1, r0 * 0.09);
          ctx.beginPath(); ctx.moveTo(ax + nx * r0 * 0.93, ay + ny * r0 * 0.93); ctx.quadraticCurveTo(ax + ux * r0 * 0.35, ay + uy * r0 * 0.35, ax - nx * r0 * 0.93, ay - ny * r0 * 0.93); ctx.stroke();
          ctx.strokeStyle = 'rgba(235,250,255,' + 0.4 * p.armor + ')'; ctx.lineWidth = Math.max(0.6, r0 * 0.04);
          ctx.beginPath(); ctx.moveTo(ax + nx * r0 * 0.9 + ux * 1.5, ay + ny * r0 * 0.9 + uy * 1.5); ctx.quadraticCurveTo(ax + ux * (r0 * 0.35 + 1.5), ay + uy * (r0 * 0.35 + 1.5), ax - nx * r0 * 0.9 + ux * 1.5, ay - ny * r0 * 0.9 + uy * 1.5); ctx.stroke();
        }
        if (p.eye > 0.1 && p.armor + p.skin > 0.6) { // eyes sit in the cuticle of thick-skinned bodies
          const re = r0 + (r1 - r0) * 0.45, er = Math.max(1, re * 0.17 * (0.5 + p.eye));
          for (const side of s.axial ? [-1, 1] : [0]) {
            const x = ax + ux * L * 0.45 + nx * side * re * 0.62, y = ay + uy * L * 0.45 + ny * side * re * 0.62;
            ctx.fillStyle = 'rgba(14,6,8,' + Math.min(0.9, p.armor + p.skin - 0.3) + ')'; ctx.beginPath(); ctx.arc(x, y, er, 0, TAU); ctx.fill();
          }
        }
        if (p.mouth > 0.1 && s.tip && r1 > 1.5) {
          const mr = r1 * (0.14 + 0.22 * p.mouth), far = Math.min(r1 * 0.6, L * 0.5), x = bx + ux * far, y = by + uy * far;
          const g = ctx.createRadialGradient(x, y, 0, x, y, mr * 1.25); g.addColorStop(0, 'rgba(6,3,10,.9)'); g.addColorStop(0.55, 'rgba(30,10,20,.7)'); g.addColorStop(0.8, 'rgba(255,170,150,.35)'); g.addColorStop(1, 'rgba(255,170,150,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, mr * 0.8, mr * 1.25, ang, 0, TAU); ctx.fill();
        }
        if (s.pad && opt.pads !== false && r1 * 2 > 1) {
          ctx.fillStyle = 'rgba(255,240,190,' + (0.12 + 0.5 * (s.press || 0)) + ')'; ctx.beginPath(); ctx.arc(bx, by, Math.max(1.2, r1 * 0.7), 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }

    // Blueprint: the skeleton the genome specifies, joints and their range.
    blueprint(ctx, segs, view, opt) {
      const T = (x, y) => [(x - view.cx) * view.scale + view.w / 2, (y - view.cy) * view.scale + view.h / 2], sc = view.scale;
      ctx.save(); ctx.lineCap = 'round';
      for (const s of segs) {
        const [ax, ay] = T(s.ax, s.ay), [bx, by] = T(s.bx, s.by), ang = Math.atan2(by - ay, bx - ax), nx = -Math.sin(ang), ny = Math.cos(ang), c = 'hsl(' + (s.part * 67 + 150) % 360 + ',70%,68%)';
        ctx.fillStyle = 'hsla(' + (s.part * 67 + 150) % 360 + ',70%,60%,.16)'; ctx.strokeStyle = c; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ax + nx * s.r0 * sc, ay + ny * s.r0 * sc); ctx.lineTo(bx + nx * s.r1 * sc, by + ny * s.r1 * sc); ctx.lineTo(bx - nx * s.r1 * sc, by - ny * s.r1 * sc); ctx.lineTo(ax - nx * s.r0 * sc, ay - ny * s.r0 * sc); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        if (s.parent >= 0) {
          const rr = Math.max(5, Math.min(16, s.r0 * sc * 0.9)), rg = s.p.range;
          ctx.strokeStyle = 'rgba(255,225,150,.75)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(ax, ay, rr, ang - rg, ang + rg); ctx.stroke();
          ctx.fillStyle = s.p.amp > 0.02 ? '#ff8f8f' : '#e8f4ff'; ctx.beginPath(); ctx.arc(ax, ay, 2.6, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  A.render = { Renderer, hsl };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
