// ALIFE 2.0 — morphology laboratory UI.
(function () {
  'use strict';
  const A = window.ALIFE2, $ = id => document.getElementById(id);
  const cv = $('specimen'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const renderer = new A.render.Renderer();
  const query = new URLSearchParams(location.search);
  let params = A.bodyplan.defaults(), genome = null, plan = null, body = null, info = null;
  let view = { cx: 0, cy: 0, scale: 30, w: W, h: H }, paused = false, sampleId = null, detached = false;
  let track = null, gallery = null, lastT = 0, rngM = A.genome.rng(12345);
  const ENV = { fluid: { fluid: 1, ground: false }, ground: { fluid: 1, ground: true }, vacuum: { fluid: 0, ground: false } };

  // ---- controls
  const groups = {};
  for (const [id, label, min, max, step, def, grp] of A.bodyplan.PARAMS) {
    if (!groups[grp]) {
      const d = document.createElement('details'); d.open = ['体制', '胴体', '付属肢'].includes(grp);
      d.innerHTML = '<summary>' + grp + '</summary><div class="sliders"></div>'; $('groups').append(d); groups[grp] = d.querySelector('.sliders');
    }
    const el = document.createElement('label');
    el.innerHTML = '<span>' + label + '</span><output id="o_' + id + '">' + def + '</output><input id="p_' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + def + '">';
    groups[grp].append(el);
    el.querySelector('input').oninput = e => { params[id] = Number(e.target.value); $('o_' + id).textContent = e.target.value; detached = false; rebuild(false); };
  }
  for (const s of A.bodyplan.SAMPLES) {
    const b = document.createElement('button'); b.textContent = s.name; b.id = 's_' + s.id; b.onclick = () => loadSample(s.id); $('samples').append(b);
  }
  function syncSliders() { for (const q of A.bodyplan.PARAMS) { $('p_' + q[0]).value = params[q[0]]; $('o_' + q[0]).textContent = params[q[0]]; } }
  function loadSample(id) {
    const s = A.bodyplan.SAMPLES.find(q => q.id === id); sampleId = id;
    params = Object.assign(A.bodyplan.defaults(), s.params); $('env').value = s.env; detached = false; syncSliders();
    for (const q of A.bodyplan.SAMPLES) $('s_' + q.id).classList.toggle('on', q.id === id);
    rebuild(true);
  }

  // ---- build
  function rebuild(refit) {
    if (!detached) genome = A.bodyplan.design(params);
    plan = A.development.develop(genome, { stage: Number($('stage').value) });
    info = A.development.describe(plan);
    body = A.physics.build(plan, { env: ENV[$('env').value], cmd: cmd() });
    const [x0, y0, x1, y1] = info.bbox, fit = Math.min((W - 120) / (x1 - x0 + 2), (H - 120) / (y1 - y0 + 2));
    if (refit || !view.locked) view.scale = Math.min(90, fit) * ($('mode').value === 'live' ? 0.8 : 1);
    const c = A.physics.com(body); view.cx = c[0]; view.cy = c[1];
    track = { t0: 0, c0: c, trail: [], w0: 0, win: [] };
    $('origin').textContent = '遺伝子の由来：' + ({ artificial: '人工設計（スライダー）', 'artificial-mutated': '人工設計 ＋ 突然変異 ' + genome.mutations + ' 回（淘汰なし）' }[genome.origin] || genome.origin)
      + '\n文法：部品 ' + genome.parts.length + ' 種 / 生成規則 ' + genome.links.length + ' 本 → 体節 ' + info.segments + '・関節 ' + info.joints + (plan.truncated ? '（上限で打ち切り）' : '');
  }
  function cmd() { return { drive: Number($('drive').value), turn: Number($('turn').value), heading: Number($('heading').value) * Math.PI / 180 }; }

  // ---- drawing
  function backdrop(v, ground) {
    const g = ctx.createRadialGradient(W * 0.45, H * 0.4, 0, W * 0.5, H * 0.5, W * 0.8);
    if (ground) { g.addColorStop(0, '#1b2a2a'); g.addColorStop(1, '#070d10'); } else { g.addColorStop(0, '#12283a'); g.addColorStop(1, '#040912'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // particles fixed in the world, so travel is visible against them
    const cell = 6, x0 = Math.floor((v.cx - W / 2 / v.scale) / cell) - 1, x1 = Math.ceil((v.cx + W / 2 / v.scale) / cell) + 1, y0 = Math.floor((v.cy - H / 2 / v.scale) / cell) - 1, y1 = Math.ceil((v.cy + H / 2 / v.scale) / cell) + 1;
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) for (let k = 0; k < 3; k++) {
      const h = n => { let z = Math.imul(i * 73856093 ^ j * 19349663 ^ (k + n) * 83492791, 0x45d9f3b); z ^= z >>> 15; return ((Math.imul(z, 0x2c1b3c6d) ^ z >>> 12) >>> 0) / 4294967295; };
      const x = ((i + h(1)) * cell - v.cx) * v.scale + W / 2, y = ((j + h(2)) * cell - v.cy) * v.scale + H / 2, r = (0.05 + 0.16 * h(3)) * v.scale * (ground ? 1.6 : 1);
      const big = h(5) > 0.8 ? 4 : 1, rr = Math.max(0.8, r * big), al = (0.05 + 0.14 * h(4)) / (big > 1 ? 2.2 : 1), col = ground ? '130,160,125' : '150,205,230';
      const gd = ctx.createRadialGradient(x, y, 0, x, y, rr); gd.addColorStop(0, 'rgba(' + col + ',' + al + ')'); gd.addColorStop(0.6, 'rgba(' + col + ',' + al * 0.6 + ')'); gd.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = gd; ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.3); ctx.fill();
    }
  }
  function scaleBar(v) {
    let u = 1; while (u * v.scale < 60) u *= u.toString()[0] === '2' ? 2.5 : 2;
    ctx.strokeStyle = ctx.fillStyle = 'rgba(230,245,240,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(24, H - 24); ctx.lineTo(24 + u * v.scale, H - 24); ctx.stroke();
    ctx.font = '12px system-ui'; ctx.fillText(u + ' u', 24, H - 32);
  }
  function drawOne(segs, v, o) {
    renderer.draw(ctx, segs, v, o);
    if ($('skeleton').checked) { ctx.save(); ctx.globalAlpha = 0.8; renderer.blueprint(ctx, segs, v); ctx.restore(); }
  }
  function frame(ms) {
    const mode = $('mode').value, dt = 1 / 60, ground = $('env').value === 'ground';
    if (mode === 'gallery') { drawGallery(dt); requestAnimationFrame(frame); return; }
    const sp = track && track.win.length > 30 ? Math.hypot(track.win[track.win.length - 1][1] - track.win[0][1], track.win[track.win.length - 1][2] - track.win[0][2]) / Math.max(1e-6, track.win[track.win.length - 1][0] - track.win[0][0]) : 0;
    const o = { speed: mode === 'live' ? sp : 0, gpu: $('gfx').value === 'gpu', hue: genome.hue, internals: $('internals').checked, shadow: ground && mode !== 'design', time: body.t };
    if (mode === 'live') {
      if (!paused) {
        body.cmd = cmd(); A.physics.step(body, dt);
        if (!A.physics.finite(body)) { rebuild(false); }
        const c = A.physics.com(body); track.trail.push(c); if (track.trail.length > 900) track.trail.shift();
        track.win.push([body.t, c[0], c[1], body.work]); while (track.win.length > 300) track.win.shift();
        view.cx += (c[0] - view.cx) * 0.06; view.cy += (c[1] - view.cy) * 0.06;
      }
      backdrop(view, ground);
      ctx.strokeStyle = 'rgba(160,230,210,.28)'; ctx.lineWidth = 1.5; ctx.beginPath();
      track.trail.forEach((c, i) => { const x = (c[0] - view.cx) * view.scale + W / 2, y = (c[1] - view.cy) * view.scale + H / 2; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      drawOne(body.segs, view, o);
    } else {
      const v = Object.assign({}, view, { cx: (info.bbox[0] + info.bbox[2]) / 2, cy: (info.bbox[1] + info.bbox[3]) / 2 });
      backdrop(v, false);
      if (mode === 'design') renderer.blueprint(ctx, plan.segs, v); else drawOne(plan.segs, v, o);
      scaleBar(v);
    }
    if (mode === 'live') scaleBar(view);
    stats(mode);
    requestAnimationFrame(frame);
  }
  function stats(mode) {
    let t = '体長 ' + info.length.toFixed(1) + ' u / 幅 ' + info.width.toFixed(1) + ' u / 体積 ' + info.volume.toFixed(1) + ' / 表面積 ' + info.surface.toFixed(1)
      + '\n体軸の体節 ' + info.axial + ' / 付属肢 ' + info.appendages + ' 本（最大 ' + info.appendageJoints + ' 節）/ 筋肉 ' + (info.muscleFraction * 100).toFixed(0) + '% / 外骨格 ' + (info.armorFraction * 100).toFixed(0) + '%';
    if (mode === 'live' && track.win.length > 30) {
      const a = track.win[0], b = track.win[track.win.length - 1], T = b[0] - a[0], d = Math.hypot(b[1] - a[1], b[2] - a[2]), pw = (b[3] - a[3]) / T;
      t += '\n実測（直近 ' + T.toFixed(1) + ' 秒）：速度 ' + (d / T).toFixed(2) + ' u/s ＝ ' + (d / T / info.length).toFixed(3) + ' 体長/s / 筋仕事率 ' + pw.toFixed(0)
        + ' / 移動コスト ' + (d > 0.05 ? (pw * T / (body.mass * d)).toFixed(0) : '—（ほぼ移動なし）') + (body.env.ground ? ' / 脚が支える体重 ' + ((body.carried || 0) * 100).toFixed(0) + '%' : '');
    }
    $('stats').textContent = t + '\n描画：' + (renderer.used === 'gpu' ? 'GPU (WebGL2)' : 'CPU') + (renderer.gpuSkin && !renderer.gpuSkin.ok ? '（GPU不可：' + (renderer.gpuSkin.error || '浮動小数点描画非対応') + '）' : '');
  }
  function drawGallery(dt) {
    if (!gallery) gallery = A.bodyplan.SAMPLES.map(s => {
      const g = A.bodyplan.design(s.params), p = A.development.develop(g), d = A.development.describe(p);
      return { s, g, d, b: A.physics.build(p, { env: ENV[s.env] }), r: new A.render.Renderer(), cx: 0, cy: 0 };
    });
    ctx.fillStyle = '#050a12'; ctx.fillRect(0, 0, W, H);
    const cells = [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [0, H / 2, W / 3, H / 2], [W / 3, H / 2, W / 3, H / 2], [2 * W / 3, H / 2, W / 3, H / 2]];
    gallery.forEach((q, i) => {
      const [x, y, w, h] = cells[i];
      if (!paused) A.physics.step(q.b, dt);
      const c = A.physics.com(q.b); q.cx += (c[0] - q.cx) * 0.08; q.cy += (c[1] - q.cy) * 0.08;
      const sc = Math.min((w - 40) / (q.d.length + 3), (h - 60) / (q.d.width + 3)) * 0.9, v = { cx: q.cx, cy: q.cy, scale: sc, w: Math.round(w), h: Math.round(h) };
      ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      const g = ctx.createRadialGradient(w * 0.45, h * 0.4, 0, w / 2, h / 2, w * 0.8); g.addColorStop(0, q.s.env === 'ground' ? '#1b2a2a' : '#12283a'); g.addColorStop(1, '#050a12'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      q.r.draw(ctx, q.b.segs, v, { gpu: $('gfx').value === 'gpu', hue: q.g.hue, internals: $('internals').checked, shadow: q.s.env === 'ground', time: q.b.t });
      ctx.fillStyle = '#e8f5f0'; ctx.font = '600 15px system-ui'; ctx.fillText(q.s.name, 14, 24);
      ctx.fillStyle = '#9fb8bd'; ctx.font = '12px system-ui'; ctx.fillText('体節 ' + q.d.segments + ' / 付属肢 ' + q.d.appendages + ' / ' + (q.s.env === 'ground' ? '底面' : '水中'), 14, 42);
      ctx.strokeStyle = '#2b414c'; ctx.strokeRect(0.5, 0.5, w - 1, h - 1); ctx.restore();
    });
    $('stats').textContent = '5系統はすべて同じ発生・物理・描画エンジンから生成した人工試験遺伝子。';
  }

  // ---- events
  for (const id of ['stage', 'drive', 'turn', 'heading']) $(id).oninput = e => { $(id + 'Out').textContent = Number(e.target.value).toFixed(id === 'heading' ? 0 : 2); if (id === 'stage') rebuild(true); };
  $('env').onchange = () => rebuild(false);
  $('mode').onchange = () => rebuild(true);
  $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? '再開' : '一時停止'; };
  const mut = n => { for (let i = 0; i < n; i++) genome = A.genome.mutate(genome, rngM); detached = true; rebuild(true); };
  $('mutate').onclick = () => mut(1); $('mutate10').onclick = () => mut(10);
  $('reset').onclick = () => { detached = false; rebuild(true); };
  $('export').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(genome, null, 2)], { type: 'application/json' })); a.download = 'alife2-genome.json'; a.click(); };

  // test hooks: ?sample=tail&mode=body&stage=0.5&mutate=20&seed=3&t=4 (seconds to pre-run)
  if (query.get('mode')) $('mode').value = query.get('mode');
  if (query.get('stage')) { $('stage').value = query.get('stage'); $('stageOut').textContent = Number(query.get('stage')).toFixed(2); }
  loadSample(query.get('sample') || 'soft');
  if (query.get('env')) { $('env').value = query.get('env'); rebuild(true); }
  if (query.get('seed')) rngM = A.genome.rng(Number(query.get('seed')));
  if (query.get('mutate')) mut(Number(query.get('mutate')));
  if (query.get('gfx')) $('gfx').value = query.get('gfx');
  if (query.get('internals') === '0') $('internals').checked = false;
  if (query.get('skeleton') === '1') $('skeleton').checked = true;
  const pre = Number(query.get('t') || 0);
  for (let t = 0; t < pre; t += 1 / 60) { A.physics.step(body, 1 / 60); if (gallery) for (const q of gallery) A.physics.step(q.b, 1 / 60); }
  if (pre) { const c = A.physics.com(body); view.cx = c[0]; view.cy = c[1]; }
  window.ALIFE2_LAB = { get body() { return body; }, get plan() { return plan; }, get genome() { return genome; }, get info() { return info; } };
  requestAnimationFrame(frame);
})();
