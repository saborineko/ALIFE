// ALIFE 2.0 — ecosystem viewer: the world, one observed individual, its ancestry,
// the living body plans, a record of firsts, and saving. Observation only: nothing here feeds back into the world.
(function () {
  'use strict';
  const A = ALIFE2, $ = id => document.getElementById(id), cv = $('world'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const zc = $('zoom'), zx = zc.getContext('2d'), zoomR = new A.render.Renderer(), thumbR = new A.render.Renderer(), bodyR = new A.render.Renderer();
  let gpuOn = new URLSearchParams(location.search).get('gfx') !== 'cpu';
  const q = new URLSearchParams(location.search), KEY = 'alife2_world_v1';
  let grainSprites = null;
  let field = null, fimg = null, sand = null, motes = null, frameNo = 0; const trails = new WeakMap();
  let w, view, paused = false, sel = null, shown = null, follow = false, loaded = window.ALIFE2_LOAD || null, lastPanels = 0, lastSave = 0;

  // a food grain: a few lobes of stippled matter with a soft ragged edge (drifting ones greenish, bottom ones ochre)
  function clump(kind, seed) {
    const n = 64, c = Object.assign(document.createElement('canvas'), { width: n, height: n }), g = c.getContext('2d'), img = g.createImageData(n, n), d = img.data;
    let s = seed * 7919 + kind * 104729 + 13; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const lobes = Array.from({ length: 3 + ((rnd() * 4) | 0) }, () => { const a = rnd() * 6.283, r = rnd() * 0.20; return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 0.13 + rnd() * 0.11]; });
    const tone = kind ? [[214, 190, 112], [150, 120, 70], [240, 225, 160]] : [[120, 205, 165], [70, 150, 150], [190, 245, 205]], hue = rnd();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let f = 0; for (const [cx, cy, r] of lobes) { const q = ((x / n - cx) ** 2 + (y / n - cy) ** 2) / (r * r); f += Math.exp(-q * 1.3); }
      const st = rnd(), dens = Math.max(0, Math.min(1, (f - 0.38) * 1.6)), core = Math.max(0, Math.min(1, (f - 1.0) * 0.9)), j = (y * n + x) * 4;
      const a = dens * (0.30 + 0.75 * st * st) + core * 0.25, t = st > 0.82 ? tone[2] : hue > 0.5 ? tone[0] : tone[1], m = 0.55 + 0.6 * core;
      d[j] = Math.min(255, t[0] * m + tone[0][0] * core * 0.3); d[j + 1] = Math.min(255, t[1] * m + tone[0][1] * core * 0.3); d[j + 2] = Math.min(255, t[2] * m); d[j + 3] = Math.min(255, a * 235);
    }
    g.putImageData(img, 0, 0); return c;
  }
  function start(world) {
    if (world) w = world;
    else {
      w = new A.engine.World({ seed: Number($('seed').value) || 1, map: $('map').value });
      if (loaded) for (const k of loaded.top) for (let i = 0; i < Math.max(1, Math.round(k.count / 4)); i++) w.spawn(A.genome.sanitize(A.genome.copy(k.genome)), w.rand() * w.W, w.rand() * w.H, 1, null); // older result files lack newer genes
      else w.seedWith(A.genome.primordial(w.seed));
    }
    fit(); sel = null; shown = null; lastPanels = 0;
  }
  function fit() { view = { cx: w.W / 2, cy: w.H / 2, scale: Math.min(W / w.W, H / w.H) }; }
  const sx = x => (x - view.cx) * view.scale + W / 2, sy = y => (y - view.cy) * view.scale + H / 2;
  const speedOf = o => o.age > 5 ? o.path / o.age : 0;

  // a body drawn from a genome alone (an ancestor, or a body plan in the atlas)
  function thumb(canvas, g, R) {
    const p = A.development.develop(g, { maxSegs: w.maxSegs }), d = A.development.describe(p), c = canvas.getContext('2d');
    const sc = Math.min((canvas.width - 10) / (d.length + 0.6), (canvas.height - 10) / (d.width + 0.6), 160);
    c.fillStyle = '#07121d'; c.fillRect(0, 0, canvas.width, canvas.height);
    (R || thumbR).draw(c, p.segs, { cx: (d.bbox[0] + d.bbox[2]) / 2, cy: (d.bbox[1] + d.bbox[3]) / 2, scale: sc, w: canvas.width, h: canvas.height }, { gpu: gpuOn, quality: 3, hue: g.hue, glow: false });
  }
  function card(parent, g, caption, onclick, on) {
    const f = document.createElement('figure'), c = document.createElement('canvas'), t = document.createElement('figcaption');
    c.width = 96; c.height = 72; thumb(c, g); t.textContent = caption; f.append(c, t); f.onclick = onclick; if (on) f.classList.add('on'); parent.append(f);
  }
  const kindText = k => { const [s, m, e, v, c] = k.split('/'); return s + '体節 口' + m + (e === '1' ? ' 眼' : '') + (v === '1' ? ' 関節' : '') + (c === '1' ? ' 繊毛' : ''); };
  const CAUSE = { starved: '餓死', aged: '老衰', broken: '物理破綻' };

  function panels() {
    const c0 = w.census();
    $('stats').textContent = '時刻 ' + c0.t + ' 秒 / 個体数 ' + c0.n + ' / 系統 ' + c0.lines + ' / 平均世代 ' + c0.gen.toFixed(1)
      + '\n成体の体節数：平均 ' + c0.segMean.toFixed(2) + '・最大 ' + c0.segMax + ' / 多体節 ' + (c0.multi * 100).toFixed(0) + '%'
      + '\n平均体積 ' + c0.volume.toFixed(2) + ' / 自力移動 ' + c0.speed.toFixed(3) + ' u/s / 口から ' + (c0.mouthShare * 100).toFixed(0) + '% / 眼 ' + (c0.eyes * 100).toFixed(0) + '% / 底面 ' + (c0.bottom * 100).toFixed(0) + '%'
      + '\n溶存栄養 ' + c0.nutrient.toFixed(2) + ' / 粒 ' + c0.food + ' / 出生 ' + c0.births + ' / 餓死 ' + c0.starved + ' / 老衰 ' + c0.aged + ' / 上限で不成立 ' + c0.blocked
      + (c0.regions ? '\n' + c0.regions.map(q => q.name + '：' + q.n + '匹・体節 ' + q.seg.toFixed(1) + '・繊毛 ' + (q.cilia * 100).toFixed(0) + '%・口から ' + (q.mouth * 100).toFixed(0) + '%・他の海域生まれ ' + (q.immigrants * 100).toFixed(0) + '%').join('\n') : '')
      + '\n系譜に残る個体 ' + w.tree.size + '（子孫が絶えて除いた ' + w.pruned + '）';
    chart(c0);
    // atlas of living body plans
    const kinds = new Map(); for (const o of w.bodies) { if (!kinds.has(o.kind)) kinds.set(o.kind, []); kinds.get(o.kind).push(o); }
    $('atlas').textContent = '';
    for (const [k, list] of [...kinds].sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
      const rep = list.reduce((a, b) => (b.kids > a.kids ? b : a));
      card($('atlas'), rep.g, list.length + '匹\n' + kindText(k), () => { select(rep); }, sel && sel.kind === k);
    }
    // top 10
    const key = $('rank').value, val = { kids: o => o.kids, age: o => o.age, V: o => o.prof.V, segs: o => o.b.segs.length, eaten: o => o.eaten, speed: speedOf }[key];
    $('top').textContent = w.bodies.slice().sort((a, b) => val(b) - val(a)).slice(0, 10).map((o, i) => (i + 1) + '. #' + o.id + '  ' + val(o).toFixed(key === 'kids' || key === 'segs' ? 0 : 2) + '  （系統 ' + o.line + '・世代 ' + o.gen + '・' + kindText(o.kind) + '）').join('\n');
    $('top').onclick = e => { const m = (window.getSelection().anchorNode || {}).textContent; };
    $('events').textContent = w.events.length ? w.events.slice().reverse().map(e => e.t + ' 秒  ' + e.text + (e.id ? '（#' + e.id + '）' : '')).join('\n') : 'まだ何も起きていない';
    ancestry();
    // extinct body plans
    const f = $('lostFilter').value, all = [...w.clades.values()].filter(c => c.ended != null);
    let list = all.filter(c => { const k = c.kind.split('/'); return f === 'moved' ? k[3] === '1' || k[4] === '1' : f === 'eye' ? k[2] === '1' : true; });
    list.sort(f === 'recent' ? (a, b) => b.ended - a.ended : (a, b) => b.members - a.members);
    $('lost').textContent = '';
    for (const c of list.slice(0, 12)) card($('lost'), c.g, c.members + '匹 ' + (c.genMax - c.gen0 + 1) + '世代\n' + kindText(c.kind), () => { shown = c; }, shown === c);
    $('lostNote').textContent = '体制の記録 ' + w.clades.size + '（うち絶滅 ' + all.length + '、該当 ' + list.length + '）' + (w.cladesDropped ? ' / 容量のため省いた2匹以下の記録 ' + w.cladesDropped : '');
  }
  function ancestry() {
    const box = $('ancestry'); box.textContent = '';
    if (!sel) return;
    const chain = w.ancestors(sel.id), steps = chain.filter((n, i) => i === 0 || n.changed || i === chain.length - 1);
    for (const n of steps.slice(0, 16)) card(box, n.g, '#' + n.id + ' 世代' + n.gen + '\n' + kindText(n.kind), () => { shown = n; }, shown === n);
    if (!steps.length) box.textContent = '記録なし';
  }
  function chart(now) {
    const c = $('chart'), x = c.getContext('2d'), h = w.history.concat([now]), n = h.length; x.fillStyle = '#07121d'; x.fillRect(0, 0, c.width, c.height);
    const line = (f, col) => { const m = Math.max(1e-9, ...h.map(f)); x.strokeStyle = col; x.lineWidth = 1.5; x.beginPath(); h.forEach((d, i) => { const px = n > 1 ? i / (n - 1) * (c.width - 8) + 4 : 4, py = c.height - 6 - f(d) / m * (c.height - 14); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); return m; };
    const a = line(d => d.n, '#8fd0ff'), b = line(d => d.segMean, '#ffd27a'); line(d => d.mouthShare, '#ff9a9a'); const s = line(d => d.speed, '#9af0b0');
    x.fillStyle = '#9fb8bd'; x.font = '10px system-ui'; x.fillText('最大：個体数 ' + a.toFixed(0) + ' / 体節 ' + b.toFixed(1) + ' / 速度 ' + s.toFixed(3), 6, 11);
  }
  // how the observed individual was chosen: by a rule (so the rule can pick again when it dies) or by hand
  let rule = null, ruleName = '', notice = '';
  function select(o, keepRule) { sel = o; shown = null; follow = follow && !!o; lastPanels = 0; if (!keepRule) { rule = null; ruleName = ''; notice = ''; } }

  function draw() {
    if (follow && sel && !sel.dead) { view.cx += (sel.cx - view.cx) * 0.15; view.cy += (sel.cy - view.cy) * 0.15; }
    view.cx = ((view.cx % w.W) + w.W) % w.W;
    const wrapX = x => { let d = x - view.cx; if (d > w.W / 2) d -= w.W; else if (d < -w.W / 2) d += w.W; return d; };
    const X = x => wrapX(x) * view.scale + W / 2, Y = y => (y - view.cy) * view.scale + H / 2, sc = view.scale;
    ctx.fillStyle = '#03070d'; ctx.fillRect(0, 0, W, H);
    // dissolved food as a smooth field (the world joins left to right, so it is tiled)
    if (!field || field.width !== w.cols) { field = Object.assign(document.createElement('canvas'), { width: w.cols, height: w.rows }); fimg = field.getContext('2d').createImageData(w.cols, w.rows); }
    for (let i = 0; i < w.nut.length; i++) { const n = Math.min(1, w.nut[i]), bottom = w.regions ? w.hGround[i] === 1 : Math.floor(i / w.cols) * w.cell >= w.yBottom, j = i * 4; fimg.data[j] = bottom ? 30 + 26 * n : 6 + 14 * n; fimg.data[j + 1] = bottom ? 30 + 30 * n : 22 + 46 * n; fimg.data[j + 2] = bottom ? 24 + 14 * n : 38 + 60 * n; fimg.data[j + 3] = 255; }
    field.getContext('2d').putImageData(fimg, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const y0w = Y(0), hw = w.H * sc, ww = w.W * sc, x0w = (-view.cx) * sc + W / 2;
    for (const k of [-1, 0, 1]) ctx.drawImage(field, x0w + k * ww - 0.5, y0w, ww + 1, hw);
    // light from above in open water, sediment on the bottom
    const yb = Y(Math.min(w.yBottom, w.H)), lg = ctx.createLinearGradient(0, y0w, 0, yb); lg.addColorStop(0, 'rgba(120,200,240,.16)'); lg.addColorStop(0.5, 'rgba(60,130,190,.04)'); lg.addColorStop(1, 'rgba(0,10,20,.18)');
    ctx.fillStyle = lg; ctx.fillRect(0, Math.max(0, y0w), W, Math.min(H, yb) - Math.max(0, y0w));
    if (yb < H && !w.regions) {
      if (!sand) { sand = document.createElement('canvas'); sand.width = sand.height = 256; const d = sand.getContext('2d'); for (let i = 0; i < 2600; i++) { const v = Math.random(); d.fillStyle = v > 0.5 ? 'rgba(210,200,150,' + 0.05 * v + ')' : 'rgba(0,0,0,' + 0.16 * (1 - v) + ')'; d.beginPath(); d.arc(Math.random() * 256, Math.random() * 256, 0.6 + Math.random() * 2.4, 0, 6.3); d.fill(); } }
      const pat = ctx.createPattern(sand, 'repeat'), k = sc / 7; pat.setTransform(new DOMMatrix([k, 0, 0, k, x0w, y0w]));
      ctx.fillStyle = pat; ctx.fillRect(0, yb, W, Math.min(H, Y(w.H)) - yb);
      const bg = ctx.createLinearGradient(0, yb - 10, 0, yb + 16); bg.addColorStop(0, 'rgba(190,210,150,0)'); bg.addColorStop(0.45, 'rgba(190,210,150,.22)'); bg.addColorStop(1, 'rgba(190,210,150,0)'); ctx.fillStyle = bg; ctx.fillRect(0, yb - 10, W, 26);
    }
    if (y0w > 0) { ctx.fillStyle = '#02050a'; ctx.fillRect(0, 0, W, y0w); } if (Y(w.H) < H) { ctx.fillStyle = '#02050a'; ctx.fillRect(0, Y(w.H), W, H - Y(w.H)); }
    // motes carried by the real current: where they streak, the water is moving
    if (!motes || motes.w !== w) { motes = Array.from({ length: 420 }, () => ({ x: Math.random() * w.W, y: Math.random() * w.H, a: 0.25 + Math.random() * 0.5 })); motes.w = w; }
    const adv = paused ? 0 : Number($('speed').value) * w.dt; ctx.lineCap = 'round';
    for (const m of motes) {
      const [vx, vy] = w.flowAt(m.x, m.y); m.x = ((m.x + vx * adv) % w.W + w.W) % w.W; m.y += vy * adv; if (m.y < 0 || m.y > Math.min(w.yBottom, w.H)) { m.y = Math.random() * Math.min(w.yBottom, w.H); m.x = Math.random() * w.W; }
      const x = X(m.x), y = Y(m.y); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const l = Math.min(26, 2.2 * sc); ctx.strokeStyle = 'rgba(170,215,240,' + 0.22 * m.a + ')'; ctx.lineWidth = Math.max(0.8, 0.05 * sc); ctx.beginPath(); ctx.moveTo(x - vx * l, y - vy * l); ctx.lineTo(x + 0.01, y); ctx.stroke();
    }
    // food grains: clumps of the same grainy matter as the bodies, not discs.
    // Their drawn position follows the true one with a short lag: in the model a grain is jostled every step,
    // which at high speed reads as trembling; the simulation itself is not changed by this.
    if (!grainSprites) grainSprites = [0, 1].map(kind => Array.from({ length: 8 }, (_, i) => clump(kind, i)));
    const lag = paused ? 1 : Math.min(1, 0.10 + 0.04 * Number($('speed').value));
    ctx.fillStyle = 'rgba(150,215,190,.5)'; const dots = [[], []];
    for (const f of w.food) {
      if (f._x == null) { f._x = f.x; f._y = f.y; f._v = (Math.random() * 8) | 0; }
      let dx = f.x - f._x; dx -= Math.round(dx / w.W) * w.W; f._x += dx * lag; f._y += (f.y - f._y) * lag;
      const x = X(f._x), y = Y(f._y); if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
      const d = f.size * sc * 1.9;
      if (d < 3.2) dots[f.fixed ? 1 : 0].push(x, y, Math.max(1, d * 0.5)); else ctx.drawImage(grainSprites[f.fixed ? 1 : 0][f._v], x - d / 2, y - d / 2, d, d);
    }
    for (const k of [0, 1]) { ctx.fillStyle = k ? 'rgba(205,190,125,.55)' : 'rgba(140,210,185,.5)'; ctx.beginPath(); const q = dots[k]; for (let i = 0; i < q.length; i += 3) ctx.rect(q[i] - q[i + 2] / 2, q[i + 1] - q[i + 2] / 2, q[i + 2], q[i + 2]); ctx.fill(); }
    frameNo++;
    for (const o of w.bodies) {
      const b = o.b; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const s of b.segs) { const r = Math.max(s.r0, s.r1); x0 = Math.min(x0, s.ax - r, s.bx - r); x1 = Math.max(x1, s.ax + r, s.bx + r); y0 = Math.min(y0, s.ay - r, s.by - r); y1 = Math.max(y1, s.ay + r, s.by + r); }
      // how fast it is really moving through the water (its own path, the current removed), smoothed
      if (!paused) { const v = (o.path - (o._p == null ? o.path : o._p)) / Math.max(1e-6, w.t - (o._t == null ? w.t - 1 : o._t)); o._v = (o._v || 0) * 0.9 + 0.1 * Math.max(0, v); o._p = o.path; o._t = w.t; }
      const mxw = (x0 + x1) / 2, shift = wrapX(mxw) - (mxw - view.cx), px = (x1 - x0) * sc, py = (y1 - y0) * sc, mx = X(mxw), my = Y((y0 + y1) / 2);
      // wake: where a self-propelled body has just been (its own movement, not the drift)
      if (!o.passive) {
        let t = trails.get(o); if (!t) trails.set(o, t = []);
        if (frameNo % 3 === 0 && !paused) { t.push([o.cx, o.cy]); if (t.length > 22) t.shift(); }
        if (t.length > 2 && sc > 5) { ctx.lineWidth = Math.max(1, Math.min(px, py) * 0.25); for (let i = 1; i < t.length; i++) { let dx = t[i][0] - t[i - 1][0]; dx -= Math.round(dx / w.W) * w.W; const xa = X(t[i - 1][0]); /* second point is placed from the first, so a step never spans the seam */ ctx.strokeStyle = 'hsla(' + o.g.hue + ',60%,75%,' + 0.16 * i / t.length + ')'; ctx.beginPath(); ctx.moveTo(xa, Y(t[i - 1][1])); ctx.lineTo(xa + dx * sc, Y(t[i][1])); ctx.stroke(); } }
      }
      if (mx < -px || my < -py || mx > W + px || my > H + py) continue;
      if (Math.max(px, py) < 9) { // far away: still a body with a shape and a heading, not a dot
        ctx.lineCap = 'round';
        for (const [wd, col] of [[2.6, 'hsla(' + o.g.hue + ',40%,80%,.16)'], [1.5, 'hsla(' + o.g.hue + ',35%,82%,.5)'], [0.8, 'hsla(' + (o.g.hue + 25) + ',45%,60%,.9)']]) { ctx.strokeStyle = col; ctx.beginPath(); for (const s of b.segs) { ctx.lineWidth = Math.max(1.6, (s.r0 + s.r1) * sc * wd); const xa = mx + (s.ax - mxw) * sc; ctx.moveTo(xa, Y(s.ay)); ctx.lineTo(xa + (s.bx - s.ax) * sc + 0.01, Y(s.by)); } ctx.stroke(); }
      } else {
        // each body gets its own small picture, drawn larger than shown when the body is small
        const size = Math.ceil(Math.max(px, py) + 18), ss = Math.max(1, Math.min(4, Math.floor(440 / size)));
        ctx.save(); ctx.translate(Math.round(mx - size / 2), Math.round(my - size / 2));
        bodyR.draw(ctx, b.segs, { cx: mxw, cy: (y0 + y1) / 2, scale: sc, w: size, h: size }, { gpu: gpuOn, quality: gpuOn ? ss : Math.min(2, ss), hue: o.g.hue, glow: sc > 18, shadow: w.isGround(o.cx, o.cy), time: b.t, clock: w.t, gut: o.G / Math.max(1e-6, o.prof.gutCap), speed: o._v || 0, fill: o.E / o.prof.Emax, drive: b.cmd.drive, bristles: sc > 20, internals: sc > 6, pads: w.isGround(o.cx, o.cy) });
        ctx.restore();
      }
      if (o === sel) { ctx.strokeStyle = '#eafff4'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(mx, my, Math.max(px, py) / 2 + 8, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); }
    }
    if (w.regions) { // region names along the top, and the borders between regions
      ctx.font = '13px system-ui'; ctx.textAlign = 'center';
      for (const q of w.regions) { const xm = X((q.x0 + q.x1) / 2), xb = X(q.x1 % w.W); ctx.fillStyle = 'rgba(235,245,240,.75)'; ctx.fillText(q.name, xm, Math.max(16, y0w + 16)); ctx.strokeStyle = 'rgba(200,225,235,.14)'; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(xb, Math.max(0, y0w)); ctx.lineTo(xb, Math.min(H, Y(w.H))); ctx.stroke(); ctx.setLineDash([]); }
      ctx.textAlign = 'start';
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,4,10,.5)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (shown && shown.members != null) { // a body plan that arose here, living or extinct
      const c = shown, inc = c.eaten + c.absorbed; thumb(zc, c.g, zoomR);
      $('info').textContent = '体制の記録（始まりの個体 #' + c.id + ' の遺伝子から発生させた成体）\n' + kindText(c.kind) + ' / 成体の体積 ' + c.V.toFixed(2) + ' / 系統 ' + c.line
        + '\n出現 ' + Math.round(c.born) + ' 秒' + (c.ended != null ? ' → 絶滅 ' + Math.round(c.ended) + ' 秒（' + Math.round(c.ended - c.born) + ' 秒間）' : ' / 存続中（' + c.alive + '匹）')
        + '\n個体数 ' + c.members + ' / 世代 ' + c.gen0 + '〜' + c.genMax + ' / 産んだ子 ' + c.kids
        + '\n死因：' + (Object.entries(c.causes).map(([k, v]) => (CAUSE[k] || k) + ' ' + v).join('・') || '—')
        + (c.dead ? '\n死んだ個体の平均：寿命 ' + (c.lived / c.dead).toFixed(0) + ' 秒 / 収入のうち口から ' + (inc ? c.eaten / inc * 100 : 0).toFixed(0) + '% / 自力移動 ' + (c.path / Math.max(1, c.lived)).toFixed(3) + ' u/s' : '');
    } else if (shown) { // an ancestor, drawn from its recorded genome
      thumb(zc, shown.g, zoomR);
      $('info').textContent = '祖先 #' + shown.id + '（記録された遺伝子から発生させた成体）\n系統 ' + shown.line + ' / 世代 ' + shown.gen + ' / 出生 ' + Math.round(shown.born) + ' 秒' + (shown.died != null ? ' / 死亡 ' + Math.round(shown.died) + ' 秒（' + (CAUSE[shown.cause] || shown.cause) + '）' : ' / 生存中')
        + '\n体制 ' + kindText(shown.kind) + ' / 成体の体積 ' + shown.V.toFixed(2) + ' / 子 ' + shown.kids + ' / 変異 ' + shown.g.mutations + ' 回'
        + (shown.life ? '\n生涯：口から ' + shown.life.eaten.toFixed(2) + '・体表から ' + shown.life.absorbed.toFixed(2) + ' / 自力移動 ' + shown.life.path.toFixed(1) + ' u' : '');
    } else if (sel && !sel.dead) {
      const d = A.development.describe(sel.plan), sc = Math.min((zc.width - 30) / (d.length + 1), (zc.height - 30) / (d.width + 1), 120), cm = A.physics.com(sel.b);
      zx.fillStyle = '#07121d'; zx.fillRect(0, 0, zc.width, zc.height);
      zoomR.draw(zx, sel.b.segs, { cx: cm[0], cy: cm[1], scale: sc, w: zc.width, h: zc.height }, { hue: sel.g.hue, glow: false, time: sel.b.t, clock: w.t, gut: sel.G / Math.max(1e-6, sel.prof.gutCap), speed: sel._v || 0, fill: sel.E / sel.prof.Emax, drive: sel.b.cmd.drive });
      const p = sel.prof, inc = sel.eaten + sel.absorbed;
      $('info').textContent = (notice ? notice + '\n' : '') + (ruleName ? '［' + ruleName + 'を自動で観察中］ ' : '') + '#' + sel.id + ' / 由来 ' + ({ evolved: 'evolved（自然進化）', primordial: 'primordial（始祖）', 'evolved-from-artificial': 'evolved-from-artificial（人工個体の子孫）' }[sel.g.origin] || sel.g.origin + '（人工）') + ' / 系統 ' + sel.line + ' / 世代 ' + sel.gen + ' / 変異 ' + sel.g.mutations + ' 回\n齢 ' + sel.age.toFixed(0) + ' / ' + sel.life.toFixed(0) + ' 秒 / 成熟段階 ' + sel.stage.toFixed(2) + ' / 子 ' + sel.kids + ' / 出生時の大きさ ' + sel.g.birth.toFixed(2)
        + '\n体節 ' + sel.b.segs.length + '（成体 ' + sel.full.segs + '）/ 体積 ' + p.V.toFixed(2) + ' / 口 ' + p.mouths.length + ' / 部品 ' + sel.g.parts.length + ' 種・規則 ' + sel.g.links.length + ' 本'
        + '\nエネルギー ' + sel.E.toFixed(2) + ' / ' + p.Emax.toFixed(2) + ' / 消化管内 ' + sel.G.toFixed(2) + ' / 維持費 ' + p.basal.toFixed(3) + '/s'
        + '\n生涯の収入：口 ' + (inc ? sel.eaten / inc * 100 : 0).toFixed(0) + '%・体表 ' + (inc ? sel.absorbed / inc * 100 : 0).toFixed(0) + '% / 自力移動 ' + speedOf(sel).toFixed(3) + ' u/s' + (sel.passive ? '（動く関節なし）' : '');
    } else if (sel) {
      // the observed individual has died: carry on with the next one by the same rule, or with a living descendant
      const gone = sel, cause = CAUSE[gone.dead] || gone.dead, wasFollowing = follow;
      if (rule && w.bodies.length) { const r = rule, n = ruleName; pick(r, n); notice = '#' + gone.id + ' が' + cause + '。「' + n + '」で次の個体 #' + sel.id + ' を選び直した。'; }
      else { const heir = w.bodies.find(o => w.ancestors(o.id).some(n => n.id === gone.id)); if (heir) { select(heir, true); follow = wasFollowing; notice = '#' + gone.id + ' が' + cause + '。その子孫 #' + heir.id + ' に移った。'; } else { $('info').textContent = '#' + gone.id + ' は' + cause + '。生きている子孫はいない。記録は「絶滅した体制の記録」に残る。'; sel = null; } }
    }
  }
  function loop(ms) {
    if (!paused) { const n = Number($('speed').value); for (let i = 0; i < n; i++) w.step(); }
    draw();
    if (ms - lastPanels > 1000) { lastPanels = ms; panels(); }
    if ($('auto').checked && ms - lastSave > 30000) { lastSave = ms; autosave(); }
    requestAnimationFrame(loop);
  }
  function autosave() { try { localStorage.setItem(KEY, JSON.stringify(w.save())); $('saveNote').textContent = '自動保存した（' + Math.round(w.t) + ' 秒時点）。保存領域 ' + KEY + '。ALIFE 23 の保存とは別。'; } catch (e) { $('saveNote').textContent = '自動保存に失敗（容量超過の可能性）：' + e.message + '。JSON保存を使ってください。'; } }

  // ---- input
  cv.addEventListener('wheel', e => { e.preventDefault(); view.scale = Math.max(2, Math.min(200, view.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); }, { passive: false });
  let drag = null;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false }; });
  cv.addEventListener('pointermove', e => { if (!drag) return; const k = W / cv.clientWidth; if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) { drag.moved = true; follow = false; $('follow').textContent = '追跡'; } view.cx -= (e.clientX - drag.x) * k / view.scale; view.cy -= (e.clientY - drag.y) * k / view.scale; drag.x = e.clientX; drag.y = e.clientY; });
  cv.addEventListener('pointerup', e => {
    if (drag && !drag.moved) { const r = cv.getBoundingClientRect(), k = W / r.width, x = ((e.clientX - r.left) * k - W / 2) / view.scale + view.cx, y = ((e.clientY - r.top) * k - H / 2) / view.scale + view.cy; let best = null, bd = 1e9; for (const o of w.bodies) { let dx = o.cx - x; dx -= Math.round(dx / w.W) * w.W; const d = Math.hypot(dx, o.cy - y); if (d < bd) { bd = d; best = o; } } select(bd < 6 + 20 / view.scale ? best : null); }
    drag = null;
  });
  const pick = (f, name) => { if (!w.bodies.length) return; rule = f; ruleName = name || ruleName; select(w.bodies.reduce((a, b) => (f(b) > f(a) ? b : a)), true); follow = true; $('follow').textContent = '追跡中'; view.scale = Math.max(view.scale, 30); };
  $('biggest').onclick = () => pick(o => o.prof.V, '最大の身体'); $('mover').onclick = () => pick(speedOf, '最も動く個体');
  $('oldest').onclick = () => { const count = new Map(); for (const o of w.bodies) for (const n of w.ancestors(o.id)) count.set(n.id, (count.get(n.id) || 0) + 1); pick(o => count.get(o.id) || 0, '最多の子孫'); rule = o => w.ancestors(o.id).length ? w.bodies.filter(b => w.ancestors(b.id).some(n => n.id === o.id)).length : 0; };
  $('follow').onclick = () => { follow = !follow && !!sel; $('follow').textContent = follow ? '追跡中' : '追跡'; if (follow) view.scale = Math.max(view.scale, 30); };
  $('restart').onclick = () => start(); $('map').onchange = () => start(); $('fit').onclick = () => { fit(); follow = false; $('follow').textContent = '追跡'; };
  $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? '再開' : '一時停止'; };
  $('founder').onchange = () => { if ($('founder').value === 'file') $('file').click(); else { loaded = null; start(); } };
  $('file').onchange = async e => { loaded = JSON.parse(await e.target.files[0].text()); start(); };
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
  $('save').onclick = () => download('alife2-world-t' + Math.round(w.t) + '.json', JSON.stringify(w.save()), 'application/json');
  $('load').onclick = () => $('loadFile').click();
  $('loadFile').onchange = async e => { try { start(A.engine.World.restore(JSON.parse(await e.target.files[0].text()))); $('saveNote').textContent = '読み込んだ（' + Math.round(w.t) + ' 秒時点、' + w.bodies.length + ' 個体）。'; } catch (err) { $('saveNote').textContent = '読み込めない：' + err.message; } };
  $('resume').onclick = () => { try { const d = localStorage.getItem(KEY); if (!d) { $('saveNote').textContent = '自動保存は無い。'; return; } start(A.engine.World.restore(JSON.parse(d))); $('saveNote').textContent = '自動保存から再開（' + Math.round(w.t) + ' 秒時点）。'; } catch (err) { $('saveNote').textContent = '再開できない：' + err.message; } };
  $('csv').onclick = () => { const rows = ['id,parent,line,generation,born,died,cause,segments,mouths,eye,working_joint,adult_volume,children,mutations']; for (const n of w.tree.values()) rows.push([n.id, n.parent, n.line, n.gen, Math.round(n.born), n.died == null ? '' : Math.round(n.died), n.cause || '', ...n.kind.split('/'), n.V.toFixed(3), n.kids, n.g.mutations].join(',')); download('alife2-lineage-t' + Math.round(w.t) + '.csv', rows.join('\n'), 'text/csv'); };
  $('rank').onchange = $('lostFilter').onchange = () => { lastPanels = 0; };

  if (q.get('seed')) $('seed').value = q.get('seed');
  if (q.get('map')) $('map').value = q.get('map');
  (async () => {
    if (!loaded && q.get('load')) loaded = await (await fetch(q.get('load'))).json().catch(() => null);
    start();
    const pre = Number(q.get('t') || 0); for (let i = 0; i < pre * 30; i++) w.step();
    if (q.get('zoom')) { view.scale = Number(q.get('zoom')); const o = w.bodies.slice().sort((a, b) => b.full.segs - a.full.segs)[0]; if (o) { view.cx = o.cx; view.cy = o.cy; select(o); } }
    window.ALIFE2_WORLD = { get w() { return w; }, select }; document.body.dataset.ready = '1'; requestAnimationFrame(loop);
  })();
})();
