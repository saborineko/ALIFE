// ALIFE 2.0 — ecosystem viewer: the world, one observed individual, its ancestry,
// the living body plans, a record of firsts, and saving. Observation only: nothing here feeds back into the world.
(function () {
  'use strict';
  const A = ALIFE2, $ = id => document.getElementById(id), cv = $('world'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const zc = $('zoom'), zx = zc.getContext('2d'), zoomR = new A.render.Renderer(), thumbR = new A.render.Renderer(), pool = new Map();
  const q = new URLSearchParams(location.search), KEY = 'alife2_world_v1';
  let w, view, paused = false, sel = null, shown = null, follow = false, loaded = window.ALIFE2_LOAD || null, lastPanels = 0, lastSave = 0;

  function start(world) {
    if (world) w = world;
    else {
      w = new A.engine.World({ seed: Number($('seed').value) || 1 });
      if (loaded) for (const k of loaded.top) for (let i = 0; i < Math.max(1, Math.round(k.count / 4)); i++) w.spawn(A.genome.copy(k.genome), w.rand() * w.W, w.rand() * w.H, 1, null);
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
    (R || thumbR).draw(c, p.segs, { cx: (d.bbox[0] + d.bbox[2]) / 2, cy: (d.bbox[1] + d.bbox[3]) / 2, scale: sc, w: canvas.width, h: canvas.height }, { gpu: false, hue: g.hue, glow: false });
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
  function select(o) { sel = o; shown = null; follow = follow && !!o; lastPanels = 0; }

  function draw() {
    if (follow && sel && !sel.dead) { view.cx += (sel.cx - view.cx) * 0.15; view.cy += (sel.cy - view.cy) * 0.15; }
    ctx.fillStyle = '#050a12'; ctx.fillRect(0, 0, W, H);
    const c = w.cell * view.scale;
    for (let r = 0; r < w.rows; r++) for (let k = 0; k < w.cols; k++) {
      const x = sx(k * w.cell), y = sy(r * w.cell); if (x > W || y > H || x + c < 0 || y + c < 0) continue;
      const n = w.nut[r * w.cols + k], bottom = r * w.cell >= w.yBottom;
      ctx.fillStyle = bottom ? 'rgb(' + Math.round(20 + 18 * n) + ',' + Math.round(26 + 26 * n) + ',' + Math.round(22 + 14 * n) + ')' : 'rgb(' + Math.round(8 + 10 * n) + ',' + Math.round(20 + 34 * n) + ',' + Math.round(34 + 44 * n) + ')';
      ctx.fillRect(x, y, c + 1, c + 1);
    }
    for (const f of w.food) { const x = sx(f.x), y = sy(f.y); if (x < 0 || y < 0 || x > W || y > H) continue; const r = Math.max(0.7, f.size * 0.5 * view.scale); ctx.fillStyle = f.fixed ? 'rgba(190,220,120,.75)' : 'rgba(150,235,170,.75)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); }
    for (const o of w.bodies) {
      const b = o.b; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const s of b.segs) { const r = Math.max(s.r0, s.r1); x0 = Math.min(x0, s.ax - r, s.bx - r); x1 = Math.max(x1, s.ax + r, s.bx + r); y0 = Math.min(y0, s.ay - r, s.by - r); y1 = Math.max(y1, s.ay + r, s.by + r); }
      const px = (x1 - x0) * view.scale, py = (y1 - y0) * view.scale, mx = sx((x0 + x1) / 2), my = sy((y0 + y1) / 2);
      if (mx < -px || my < -py || mx > W + px || my > H + py) continue;
      if (Math.max(px, py) < 7 && !(b.hasCilia && Math.max(px, py) > 4)) { ctx.fillStyle = 'hsl(' + o.g.hue + ',55%,65%)'; ctx.beginPath(); ctx.arc(mx, my, Math.max(1.5, Math.max(px, py) / 2), 0, 6.3); ctx.fill(); }
      else {
        let size = 32; while (size < Math.max(px, py) + 14 && size < 512) size *= 2;
        if (!pool.has(size)) pool.set(size, new A.render.Renderer());
        ctx.save(); ctx.translate(Math.round(mx - size / 2), Math.round(my - size / 2));
        pool.get(size).draw(ctx, b.segs, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale: view.scale, w: size, h: size }, { gpu: false, hue: o.g.hue, glow: false, time: b.t, drive: b.cmd.drive, bristles: view.scale > 20, internals: view.scale > 12 });
        ctx.restore();
      }
      if (o === sel) { ctx.strokeStyle = '#eafff4'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(mx, my, Math.max(px, py) / 2 + 8, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); }
    }
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
      zoomR.draw(zx, sel.b.segs, { cx: cm[0], cy: cm[1], scale: sc, w: zc.width, h: zc.height }, { hue: sel.g.hue, glow: false, time: sel.b.t, drive: sel.b.cmd.drive });
      const p = sel.prof, inc = sel.eaten + sel.absorbed;
      $('info').textContent = '#' + sel.id + ' / 由来 ' + sel.g.origin + ' / 系統 ' + sel.line + ' / 世代 ' + sel.gen + ' / 変異 ' + sel.g.mutations + ' 回\n齢 ' + sel.age.toFixed(0) + ' / ' + sel.life.toFixed(0) + ' 秒 / 成熟段階 ' + sel.stage.toFixed(2) + ' / 子 ' + sel.kids + ' / 出生時の大きさ ' + sel.g.birth.toFixed(2)
        + '\n体節 ' + sel.b.segs.length + '（成体 ' + sel.full.segs + '）/ 体積 ' + p.V.toFixed(2) + ' / 口 ' + p.mouths.length + ' / 部品 ' + sel.g.parts.length + ' 種・規則 ' + sel.g.links.length + ' 本'
        + '\nエネルギー ' + sel.E.toFixed(2) + ' / ' + p.Emax.toFixed(2) + ' / 消化管内 ' + sel.G.toFixed(2) + ' / 維持費 ' + p.basal.toFixed(3) + '/s'
        + '\n生涯の収入：口 ' + (inc ? sel.eaten / inc * 100 : 0).toFixed(0) + '%・体表 ' + (inc ? sel.absorbed / inc * 100 : 0).toFixed(0) + '% / 自力移動 ' + speedOf(sel).toFixed(3) + ' u/s' + (sel.passive ? '（動く関節なし）' : '');
    } else if (sel) { $('info').textContent = '#' + sel.id + ' は死亡（' + sel.dead + '）。系譜の記録は子孫が生きている限り残る。'; sel = null; }
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
    if (drag && !drag.moved) { const r = cv.getBoundingClientRect(), k = W / r.width, x = ((e.clientX - r.left) * k - W / 2) / view.scale + view.cx, y = ((e.clientY - r.top) * k - H / 2) / view.scale + view.cy; let best = null, bd = 1e9; for (const o of w.bodies) { const d = Math.hypot(o.cx - x, o.cy - y); if (d < bd) { bd = d; best = o; } } select(bd < 6 + 20 / view.scale ? best : null); }
    drag = null;
  });
  const pick = f => { if (!w.bodies.length) return; select(w.bodies.reduce((a, b) => (f(b) > f(a) ? b : a))); follow = true; $('follow').textContent = '追跡中'; view.scale = Math.max(view.scale, 30); };
  $('biggest').onclick = () => pick(o => o.prof.V); $('mover').onclick = () => pick(speedOf);
  $('oldest').onclick = () => { const count = new Map(); for (const o of w.bodies) for (const n of w.ancestors(o.id)) count.set(n.id, (count.get(n.id) || 0) + 1); pick(o => count.get(o.id) || 0); };
  $('follow').onclick = () => { follow = !follow && !!sel; $('follow').textContent = follow ? '追跡中' : '追跡'; if (follow) view.scale = Math.max(view.scale, 30); };
  $('restart').onclick = () => start(); $('fit').onclick = () => { fit(); follow = false; $('follow').textContent = '追跡'; };
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
  (async () => {
    if (!loaded && q.get('load')) loaded = await (await fetch(q.get('load'))).json().catch(() => null);
    start();
    const pre = Number(q.get('t') || 0); for (let i = 0; i < pre * 30; i++) w.step();
    if (q.get('zoom')) { view.scale = Number(q.get('zoom')); const o = w.bodies.slice().sort((a, b) => b.full.segs - a.full.segs)[0]; if (o) { view.cx = o.cx; view.cy = o.cy; select(o); } }
    window.ALIFE2_WORLD = { get w() { return w; }, select }; document.body.dataset.ready = '1'; requestAnimationFrame(loop);
  })();
})();
