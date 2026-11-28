// ALIFE 2.0 — ecosystem viewer: the world, one observed individual, its ancestry,
// the living body plans, a record of firsts, and saving. Observation only: nothing here feeds back into the world.
(function () {
  'use strict';
  const A = ALIFE2, $ = id => document.getElementById(id), cv = $('world'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  // New registry entries appear here automatically if this page has no dedicated control yet.
  for (const r of A.rules.catalog) if (!$(r.key)) {
    const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id=r.key;
    label.append(input,document.createTextNode(r.label));$('additionalRules').append(label);
  }
  const readRules = () => A.rules.normalize(Object.fromEntries(A.rules.catalog.map(r=>[r.key,$(r.key).checked?r.on:0])));
  const zc = $('zoom'), zx = zc.getContext('2d'), zoomR = new A.render.Renderer(), thumbR = new A.render.Renderer(), bodyR = new A.render.Renderer();
  let gpuOn = new URLSearchParams(location.search).get('gfx') !== 'cpu';
  const q = new URLSearchParams(location.search), KEY = 'alife2_world_v1';
  let grainSprites = null;
  let field = null, fimg = null, sand = null, motes = null, frameNo = 0; const trails = new WeakMap();
  // The size on screen (pixels) from which a body gets its own detailed picture; smaller bodies are drawn as plain strokes. It starts at 9 and is raised while
  // drawing a frame takes too long (hundreds of grown bodies, each with its own picture, can take seconds on a machine without a fast graphics card), and comes
  // back down when drawing is quick again. The selected body always gets its picture. This changes what is drawn, never the world.
  // A body larger than DETAIL_MAX pixels on screen always gets its picture: looking closely at a few bodies must never turn them into strokes.
  const DETAIL_MAX = 72, SPRITE_MAX = 10, sprites = new WeakMap(); let detailMin = 9, drawMs = 0, quickRun = 0, detailHold = 0, spriteEvery = 1;
  let w, view, paused = false, sel = null, shown = null, follow = false, loaded = window.ALIFE2_LOAD || null, lastPanels = 0, lastSave = 0;
  // (a mark kept for this tab only: there while the page is open, taken away when the page is left while it still answers. Found at the start, it means the page ended without answering.)
  let unclean = false; try { unclean = sessionStorage.getItem('alife2_open') === '1'; sessionStorage.setItem('alife2_open', '1'); addEventListener('pagehide', () => { try { sessionStorage.removeItem('alife2_open'); } catch (e) {} }); } catch (e) {}
  // A tab the browser itself put away to save memory (and loads again when it is looked at) did not stop answering: its world is taken up again.
  const discarded = !!document.wasDiscarded; if (discarded) unclean = false;

  // ---- islands: more worlds of the same kind, each in its own thread (alife2-island.js); now and then a body moves from each to the next ----
  // Slot 0 is the world on screen; the others run unseen at full speed. Bodies leave by each world's own clock, so a run with islands
  // depends on how fast each thread happens to go: it is not reproducible (tools/alife2-islands.js is the reproducible form).
  const ISL = { ws: [], every: 150, count: 1, next: Infinity, wait: new Map(), seq: 0, keep: false, busy: false };
  const islandNote = t => { $('islandNote').textContent = t || ''; };
  function islandStop() { for (const x of ISL.ws) x.worker.terminate(); ISL.ws = []; ISL.next = Infinity; for (const f of ISL.wait.values()) f(null); ISL.wait.clear(); islandPanel(true); }
  function islandStart(k, texts) { // texts: saved worlds to carry on with (from a file); otherwise copies of the world on screen with other random numbers
    islandStop(); islandNote(''); if (!(k > 1)) return;
    const base = texts ? null : JSON.stringify(A.observer.saveWorld(w));
    try {
      for (let i = 1; i < k; i++) {
        const x = { worker: new Worker('./alife2-island.js?v=' + A.version.build), s: null, i }; ISL.ws.push(x);
        x.worker.onmessage = e => islandMsg(x, e.data); x.worker.onerror = e => { islandNote('島 ' + (i + 1) + ' を動かせない：' + (e.message || '読み込みに失敗') + '（公開ページ https://… で開いたときに使える）'); };
        const src = texts ? texts[i - 1] : base;
        x.worker.postMessage(Object.assign(typeof src === 'string' ? { text: src } : { blob: src }, { type: 'start', reseed: texts ? null : ((w.seed * 7919 + i * 104729 + Math.round(w.t)) >>> 0), every: ISL.every, count: ISL.count, phase: texts ? 1 : i / k, paused, observer: A.observer.get(w).enabled }));
      }
    } catch (e) { islandStop(); islandNote('島を始められない：' + (e && e.message || e) + '（公開ページ https://… で開いたときに使える）'); $('islands').value = '1'; return; }
    ISL.next = w.t + ISL.every; islandPanel(true);
    if (navigator.hardwareConcurrency && k > navigator.hardwareConcurrency) islandNote('この端末のコアは ' + navigator.hardwareConcurrency + ' 個。島 ' + k + ' 個は取り合いになり、1 島あたりは遅くなる。');
  }
  function islandMsg(x, m) {
    if (m.type === 'status') x.s = m.s;
    else if (m.type === 'leave') islandSend(x.i, m.bodies);
    else if (m.type === 'saved' || m.type === 'swapped') { const f = ISL.wait.get(m.id); if (f) { ISL.wait.delete(m.id); f(m.blob || m.text); } }
    else if (m.type === 'error') islandNote('島 ' + (x.i + 1) + ' でエラー：' + String(m.text).split('\n')[0]);
  }
  // bodies that left slot `from` arrive on the next one of the ring
  function islandSend(from, bodies) { const k = ISL.ws.length + 1, to = (from + 1) % k; if (to === 0) w.immigrate(bodies, from + 1); else ISL.ws[to - 1].worker.postMessage({ type: 'arrive', bodies, from: from + 1 }); }
  const islandAsk = (x, msg) => new Promise((ok, no) => { const id = ++ISL.seq; ISL.wait.set(id, t => t == null ? no(new Error('島が止められた')) : ok(t)); x.worker.postMessage(Object.assign({ id }, msg)); setTimeout(() => { if (ISL.wait.has(id)) { ISL.wait.delete(id); no(new Error('島 ' + (x.i + 1) + ' が応答しない')); } }, 90000); });
  const islandAll = msg => { for (const x of ISL.ws) x.worker.postMessage(msg); };
  window.addEventListener('alife2-observer-toggle', e => islandAll({ type: 'observer', enabled: e.detail }));
  const enableAll = o => { w.enable(o); islandAll({ type: 'enable', o }); };
  function islandPanel(rebuild) {
    const el = $('islandInfo'); $('islandPanel').style.display = ISL.ws.length || $('islandNote').textContent ? '' : 'none';
    if (rebuild) { el.textContent = ''; const add = (i, btn) => { const d = document.createElement('div'), t = document.createElement('span'); t.id = 'isl' + i; d.appendChild(t); if (btn) { const b = document.createElement('button'); b.textContent = 'この島を見る'; b.style.marginLeft = '6px'; b.onclick = () => islandView(i); d.appendChild(b); } el.appendChild(d); }; if (ISL.ws.length) { add(0, false); for (const x of ISL.ws) add(x.i, true); } }
    if (!ISL.ws.length || !w) return;
    $('isl0').textContent = '表示中：' + Math.round(w.t) + ' 秒・' + w.bodies.length + ' 個体・来た ' + (w.counts.arrived || 0) + '／出た ' + (w.counts.left || 0);
    for (const x of ISL.ws) { const s = x.s, t = $('isl' + x.i); if (t) t.textContent = '島 ' + (x.i + 1) + '：' + (s ? Math.round(s.t) + ' 秒・' + s.n + ' 個体・平均世代 ' + s.gen.toFixed(1) + '・体節 ' + s.seg.toFixed(2) + '（最大 ' + s.segMax + '）・多体節 ' + (s.multi * 100).toFixed(0) + '%・来た ' + s.arrived + '／出た ' + s.left + '・毎秒 ' + s.rate.toFixed(1) + ' 秒' + (s.observer ? '／観測' + (s.observer.enabled ? 'ON' : 'OFF') + (s.observer.events.length ? '／' + Math.round(s.observer.events.at(-1).t) + '秒 ' + s.observer.events.at(-1).title : '') : '') : '準備中'); }
  }
  // Look at another island: the world on screen and that island's world change places (each carries on where it was).
  async function islandView(i) {
    const x = ISL.ws[i - 1]; if (!x || ISL.busy) return; ISL.busy = true;
    try { const text = await islandAsk(x, { type: 'swap', text: JSON.stringify(A.observer.saveWorld(w)) }); ISL.keep = true; start(A.observer.restoreWorld(JSON.parse(text))); ISL.next = w.t + ISL.every; $('saveNote').textContent = '島 ' + (i + 1) + ' の世界を表示した。いままで見ていた世界は、裏でその島として続いている。'; }
    catch (e) { islandNote('島を切り替えられない：' + (e && e.message || e)); }
    ISL.busy = false; lastPanels = 0;
  }
  // Every world as a saved file of its own (gzip where the browser can), the one on screen first. Each island packs its own world in its own thread,
  // so the page never holds more than one world's text.
  const worldBlobs = async () => { const mine = JSON.stringify(A.observer.saveWorld(w)); return [(await gz(mine)) || new Blob([mine], { type: 'application/json' }), ...await Promise.all(ISL.ws.map(x => islandAsk(x, { type: 'save' })))]; };
  const blobText = async blob => { const h = new Uint8Array(await blob.slice(0, 2).arrayBuffer()); return h[0] === 0x1f && h[1] === 0x8b ? gunzip(blob) : blob.text(); };
  // Several islands in one file: a line of text that says how long each world's file is, then those files one after another.
  const ISLANDS = '{"format":"alife2-islands-2"';
  const pack = blobs => new Blob([ISLANDS + ',"every":' + ISL.every + ',"count":' + ISL.count + ',"sizes":[' + blobs.map(b => b.size).join(',') + ']}\n', ...blobs], { type: 'application/octet-stream' });
  async function unpack(file) { const head = await file.slice(0, 4096).text(), end = head.indexOf('\n'), h = JSON.parse(head.slice(0, end)); let at = end + 1; return h.sizes.map(n => { const b = file.slice(at, at + n); at += n; return b; }); }
  const isPack = async file => (await file.slice(0, ISLANDS.length).text()) === ISLANDS;
  function pickIslands(k) { const pick = $('islands'); if (![...pick.options].some(o => Number(o.value) === k)) pick.add(new Option(String(k))); pick.value = String(k); }
  // open what was saved: one world (text), a set of islands as files, or the first form of an island file (one text for all)
  async function openSet(blobs) { ISL.keep = true; start(A.observer.restoreWorld(JSON.parse(await blobText(blobs[0])))); pickIslands(blobs.length); islandStart(blobs.length, blobs.slice(1)); return blobs.length; }
  function openSaved(text) {
    const d = JSON.parse(text);
    if (d && d.format === 'alife2-islands-1') { const k = d.worlds.length; ISL.keep = true; start(A.observer.restoreWorld(d.worlds[0])); pickIslands(k); islandStart(k, d.worlds.slice(1).map(x => JSON.stringify(x))); return k; }
    start(A.observer.restoreWorld(d)); return 1;
  }
  // one step of the world on screen, and its share of the exchange between islands
  function advance() { w.step(); if (w.t >= ISL.next) { ISL.next = w.t + ISL.every; if (ISL.ws.length && ISL.count > 0) { const out = w.emigrate(ISL.count); if (out.length) islandSend(0, out); } } }

  // ---- sound for a human: what the water sounds like at one place, turned into something a person can hear; a picture of where voices sound;
  // and a short history of the observed body's voice. Nothing here goes back into the world: the world's sound is its own fields, never this.
  const AU = { ctx: null, tones: [], noises: [], solo: null, master: null, analyser: null, meter: null, error: '', lastMeter: -1, testUntil: 0, hist: [], lastT: -1, who: 0, level: new Float32Array(12) };
  const BAND_HZ = [110, 196, 349, 622, 1109, 1976];
  // Playback only. Boost weak bands before compression; never write to the world's fields.
  function heard(v, boost) { return Number.isFinite(v) && v > 0 ? 0.16 * -Math.expm1(-8 * v * boost) : 0; }
  function audioMix(L, envBoost, voiceBoost, active, solo, soloVoice) {
  const g = new Array(13).fill(0);
  if (!active) return g;
  if (solo) { g[12] = 0.3 * Math.min(1, Math.max(0, Number(soloVoice) || 0)); return g; }
  for (let b = 0; b < 6; b++) { g[b] = heard(L[b], voiceBoost); g[6+b] = 0.7 * heard(L[6+b], envBoost); }
  const sum = g.reduce((a,b) => a+b,0);
  return sum > 0.65 ? g.map(v=>v*0.65/sum) : g;
}
  async function audioStart() {
    AU.error = '';
    try {
      if (!AU.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw new Error('AudioContext 非対応');
    const c = AU.ctx = new AC(); AU.master = c.createGain(); AU.master.gain.value = Number($('vol').value);
    const limit = c.createDynamicsCompressor(); limit.threshold.value = -8; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.003; limit.release.value = 0.15;
    AU.analyser = c.createAnalyser(); AU.analyser.fftSize = 1024; AU.meter = new Float32Array(AU.analyser.fftSize);
    AU.master.connect(limit); limit.connect(AU.analyser); AU.analyser.connect(c.destination);
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (let b = 0; b < 6; b++) { // a clear tone for the voices in each band; noise through a narrow filter for everything else that sounds there
      const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = BAND_HZ[b]; g.gain.value = 0; o.connect(g); g.connect(AU.master); o.start(); AU.tones.push(g);
      const n = c.createBufferSource(), f = c.createBiquadFilter(), g2 = c.createGain(); n.buffer = buf; n.loop = true; f.type = 'bandpass'; f.frequency.value = BAND_HZ[b]; f.Q.value = 5; g2.gain.value = 0; n.connect(f); f.connect(g2); g2.connect(AU.master); n.start(); AU.noises.push(g2); }
    const so = c.createOscillator(), sg = c.createGain(); so.type = 'sine'; sg.gain.value = 0; so.connect(sg); sg.connect(AU.master); so.start(); AU.solo = { o: so, g: sg };
      }
      await AU.ctx.resume();
      if (AU.ctx.state !== 'running') throw new Error('音声を開始できません: ' + AU.ctx.state);
      return true;
    } catch (e) {
      AU.error = String(e && e.message || e); if (AU.ctx && AU.ctx.state === 'closed' || AU.ctx && !AU.solo) { AU.ctx.close().catch(() => {}); AU.ctx = AU.master = AU.analyser = AU.meter = AU.solo = null; AU.tones = []; AU.noises = []; }
      $('audioStatus').textContent = '再生エラー: ' + AU.error; return false;
    }
  }
  async function audioTest() {
    if (!await audioStart()) return;
    const c = AU.ctx, t = c.currentTime; if (t < AU.testUntil) return;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = 440;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.03); g.gain.setValueAtTime(0.12, t + 0.45); g.gain.linearRampToValueAtTime(0, t + 0.55);
    o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + 0.56); o.onended = () => { o.disconnect(); g.disconnect(); }; AU.testUntil = t + 0.56;
  }
  function audioFrame() {
    const on = w && w.sound && w.snd, at = $('listenAt').value, body = sel && !sel.dead ? sel : null, x = at !== 'view' && body ? body.cx : view.cx, y = at !== 'view' && body ? body.cy : view.cy, L = AU.level;
    for (let b = 0; b < 6; b++) { const v = on ? w.nutAt(x, y, w.sndV[b]) : 0, a = on ? Math.max(0, w.nutAt(x, y, w.snd[b]) - v) : 0; L[b] = v; L[6 + b] = a; }
    if (AU.ctx && AU.solo) { const now = AU.ctx.currentTime, play = on && $('listen').checked && !paused, solo = at === 'voice';
      const gains = audioMix(L, Number($('envBoost').value), Number($('voiceBoost').value), play, solo, body ? body.voL : 0);
      for (let b = 0; b < 6; b++) { AU.tones[b].gain.setTargetAtTime(gains[b], now, 0.04); AU.noises[b].gain.setTargetAtTime(gains[6+b], now, 0.04); }
      if (gains[12] > 0) AU.solo.o.frequency.setTargetAtTime(110 * Math.pow(2, 4.17 * (body.voP || 0)), now, 0.02); AU.solo.g.gain.setTargetAtTime(gains[12], now, 0.03);
      const ms = performance.now(); if (ms - AU.lastMeter >= 150) { AU.lastMeter = ms; AU.analyser.getFloatTimeDomainData(AU.meter); let sq = 0; for (const x of AU.meter) sq += x*x; const rms = Math.sqrt(sq/AU.meter.length), db = rms > 0 ? Math.max(-120, 20*Math.log10(rms)) : -120;
        $('audioStatus').textContent = AU.error ? '再生エラー: ' + AU.error : '再生: ' + AU.ctx.state + ' / ' + (now < AU.testUntil ? 'テスト音' : !on ? '世界の音OFF' : paused ? '一時停止' : !$('listen').checked ? '聴くOFF' : solo && !body ? '個体未選択' : '観測中') + ' / 出力 ' + db.toFixed(1) + ' dBFS' + (Number($('vol').value) === 0 ? '（音量0）' : '');
        $('audioMeter').value = Math.max(0, 60 + db);
      }
    }
    // the observed body, once a second of its world's time: is it sounding, at what pitch, what do its ears report, how hungry is it, how fast is it going
    if (body && w.sound) { if (AU.who !== body.id) { AU.who = body.id; AU.hist = []; AU.lastT = -1; } const t = Math.floor(w.t); if (t !== AU.lastT) { AU.lastT = t; let ear = 0; for (const q of body.b.segs) if (q.e > ear) ear = q.e; AU.hist.push({ v: body.voL || 0, p: body.voP || 0, e: ear, h: 1 - body.E / body.prof.Emax, s: body._v || 0 }); if (AU.hist.length > 140) AU.hist.shift(); } }
  }
  function soundPanel(c0) {
    const on = !!(w && w.sound); $('soundPanel').style.display = on ? '' : 'none'; $('voiceChart').style.display = on && sel && !sel.dead && (sel.b.hasVoice || sel.b.hasEar) ? '' : 'none'; if (!on) return;
    const names = { hungry: '空腹', fed: '消化管に餌がある', touched: '押されている', hurt: '傷がある', seeing: '何か見えている', hearing: '何か聞こえている', young: '幼体' }, pct = v => (v * 100).toFixed(0) + '%';
    const R = w.soundReading(c0), F = w.aco.first, firsts = Object.keys(F).filter(k => F[k].at != null).length;
    $('soundStats').textContent = '【観測】' + R.seen.join('／') + '・いま鳴いている ' + pct(c0.calling) + '・出ている音のうち声 ' + pct(c0.voiceShare) + '・声の高さ ' + c0.pitchMean.toFixed(2) + ' ±' + c0.pitchSpread.toFixed(2) + '・聞こえが神経回路を押している個体（耳を持つ個体のうち）' + pct(c0.listening)
      + '\n【相関（原因は未確定）】' + (R.goes.length ? '\n・' + R.goes.join('\n・') : 'まだ何もない')
      + '\n【推定】' + R.inferred.join('／')
      + '\n【不明（例が足りない）】' + (R.unknown.length ? R.unknown.join('／') : 'なし')
      + '\n記録は直近およそ 8 分の世界を表す（古い数は薄れる）。「初めての観測」は 5 回続けて観測されたときだけ「進化の記録」に残る：これまで ' + firsts + ' 件。声に使われたエネルギーの累計 ' + c0.soundCost.toFixed(1);
    // what is heard at the listening place, band by band
    const cv = $('spectrum'), d = cv.getContext('2d'), L = AU.level; d.fillStyle = '#07121d'; d.fillRect(0, 0, cv.width, cv.height);
    for (let b = 0; b < 6; b++) { const x = 8 + b * 68, hv = Math.min(60, 60 * (1 - Math.exp(-6 * L[b]))), ha = Math.min(60 - hv, 60 * (1 - Math.exp(-6 * L[6 + b]))); d.fillStyle = 'hsla(' + b * 54 + ',35%,35%,.9)'; d.fillRect(x, 64 - hv - ha, 56, ha); d.fillStyle = 'hsl(' + b * 54 + ',90%,62%)'; d.fillRect(x, 64 - hv, 56, hv); d.fillStyle = '#9eb5bb'; d.font = '10px system-ui'; d.fillText(BAND_HZ[b] + ' Hz', x + 10, 69); }
    // the observed body's last two minutes: voice (bars, coloured by pitch), what its ears report (white line), hunger (orange line)
    if ($('voiceChart').style.display !== 'none') { const vc = $('voiceChart'), g = vc.getContext('2d'), H2 = vc.height, n = AU.hist.length; g.fillStyle = '#07121d'; g.fillRect(0, 0, vc.width, H2);
      AU.hist.forEach((q, i) => { const x = vc.width - (n - i) * 3; if (q.v > 0.01) { g.fillStyle = 'hsl(' + q.p * 270 + ',90%,60%)'; g.fillRect(x, H2 - 4 - q.v * (H2 - 14), 3, q.v * (H2 - 14)); } });
      for (const [key, col, f] of [['e', '#eafff4', v => v / (v + 0.1)], ['h', '#ffb060', v => Math.max(0, Math.min(1, v))]]) { g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); AU.hist.forEach((q, i) => { const x = vc.width - (n - i) * 3 + 1.5, y = H2 - 4 - f(q[key]) * (H2 - 14); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); }
      g.fillStyle = '#9eb5bb'; g.font = '10px system-ui'; g.fillText('観察個体の直近 ' + n + ' 秒：声（棒、色＝音程）／耳が受けている大きさ（白）／空腹（橙）', 6, 11); }
  }
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
      w = new A.engine.World({ ...readRules(), seed: Number($('seed').value) || 1, map: $('map').value, deaf: $('deaf').checked ? 1 : 0, mute: $('mute').checked ? 1 : 0 });
      if (loaded) for (const k of loaded.top) for (let i = 0; i < Math.max(1, Math.round(k.count / 4)); i++) w.spawn(A.genome.sanitize(A.genome.copy(k.genome)), w.rand() * w.W, w.rand() * w.H, 1, null); // older result files lack newer genes
      else w.seedWith(A.genome.primordial(w.seed));
    }
    for (const r of A.rules.catalog) $(r.key).checked=!!w[r.key];
    if (world) $('map').value = w.map || ''; // a loaded world shows its own map
    $('deaf').checked=!!w.deaf; $('mute').checked=!!w.mute; // controls outside the evolution-rule registry
    A.observerUI.bind(w, o => { select(o, false, true); follow = true; $('follow').textContent = '追跡中'; view.cx = o.cx; view.cy = o.cy; view.scale = Math.max(view.scale, 20); }, () => { follow = false; $('follow').textContent = '追跡'; });
    fit(); sel = null; shown = null; lastPanels = 0;
    if (ISL.keep) ISL.keep = false; else if (ISL.ws.length || Number($('islands').value) > 1) islandStart(Number($('islands').value)); // a new history on screen: the islands start again as copies of it
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
  // A genome's small picture is drawn once and kept: the panels are rebuilt every second with up to 40 of them, and drawing each one anew
  // (growing the body from its genome, then a picture of it) took a third of the time of a slow frame.
  let thumbs = new WeakMap(), thumbEpoch = 0;
  function card(parent, g, caption, onclick, on) {
    const f = document.createElement('figure'), c = document.createElement('canvas'), t = document.createElement('figcaption');
    c.width = 96; c.height = 72; if (A.gpu && A.gpu.epoch !== thumbEpoch) { thumbEpoch = A.gpu.epoch; thumbs = new WeakMap(); } /* (pictures kept from before a lost graphics context may be empty) */ let pic = thumbs.get(g); if (!pic) { pic = document.createElement('canvas'); pic.width = 96; pic.height = 72; thumb(pic, g); thumbs.set(g, pic); } c.getContext('2d').drawImage(pic, 0, 0); t.textContent = caption; f.append(c, t); f.onclick = onclick; if (on) f.classList.add('on'); parent.append(f);
  }
  const kindText = k => { const [s, m, e, v, c] = k.split('/'); return s + '体節 口' + m + (e === '1' ? ' 眼' : '') + (v === '1' ? ' 関節' : '') + (c === '1' ? ' 繊毛' : ''); };
  const CAUSE = { starved: '餓死', aged: '老衰', broken: '物理破綻', killed: '傷で死亡（他個体に組織を取られた）', left: '他の島へ移った' };

  function panels() {
    A.observerUI.render();
    const c0 = w.census(); soundPanel(c0);
    const smellers = w.scent ? w.bodies.filter(o => o.g.parts.some(p => Math.abs(p.sA) > 0.2 || Math.abs(p.sB) > 0.2)).length : 0;
    const seers = w.vision ? w.bodies.filter(o => o.g.parts.some(p => p.eye > 0.1 && Math.abs(p.vE) > 0.2)).length : 0;
    const birthLine = '出生：体積 ' + c0.birthV.toFixed(3) + '・発生段階 ' + c0.birthStage.toFixed(2) + '（遺伝子の狙い ' + c0.birthGene.toFixed(2) + '）・卵 1 個 ' + c0.eggCost.toFixed(2) + (w.budget ? '・死産 ' + (c0.stillborn || 0) : '') + (w.invest ? ' / 卵の蓄え（遺伝子の平均）' + c0.yolkGene.toFixed(2) : '') + (w.cast ? ' / 卵を産む距離（遺伝子の平均、親の脇からさらに）' + (c0.castGene || 0).toFixed(1) : '') + (w.brain ? ' / 遠くへつながる神経を持つ個体 ' + ((c0.farBodies || 0) * 100).toFixed(0) + '%・4 個を超える神経の部品を持つ個体 ' + ((c0.bigParts || 0) * 100).toFixed(0) + '%・神経 ' + (c0.neurons || 0).toFixed(1) + ' 個／匹' : '') + (w.rewire ? ' / 細る・できる結合を持つ個体 ' + ((c0.rewireBodies || 0) * 100).toFixed(0) + '%（その結合のうち、いま在る分 ' + ((c0.presence || 0) * 100).toFixed(0) + '%、配線の費用は生まれつきの ' + ((c0.wiringNow == null ? 1 : c0.wiringNow) * 100).toFixed(0) + '%）' : '') + (w.vents ? ' / 湧き場の近く（半径の 2 倍以内）にいる個体 ' + ((c0.ventNear || 0) * 100).toFixed(0) + '%（そこは水の ' + ((c0.ventWater || 0) * 100).toFixed(0) + '%）' : '') + (w.nest ? ' / 水の中の物質 ' + (c0.matter || 0).toFixed(1) + '（' + (c0.matterCells || 0) + ' マス）・分泌腺を持つ個体 ' + ((c0.glandBodies || 0) * 100).toFixed(0) + '%・分泌に使われた蓄え ' + (c0.secreted || 0).toFixed(1) : '') + (w.wireLate ? ' / 回路を生まれたあとに作る部品を持つ個体 ' + ((c0.lateBodies || 0) * 100).toFixed(0) + '%（配線のうち、生まれたあとに作られる分 ' + ((c0.lateWiring || 0) * 100).toFixed(0) + '%）' : '') + (w.mutsplit ? ' / 変異の頻度（遺伝子の平均）' + c0.mutGene.toFixed(2) + '・変異の幅 ' + (c0.mutWidth == null ? 1 : c0.mutWidth).toFixed(2) + '（どちらも 1.00 が世界の値。体のつくりが変わる確率は頻度に比例）' : w.metamut ? ' / 変異の強さ（遺伝子の平均）' + c0.mutGene.toFixed(2) + '（体のつくりが変わる確率は、この値の 2 乗に比例：いま初期の ' + (c0.mutGene * c0.mutGene * 100).toFixed(0) + '%' + (c0.mutGene < 0.6 ? '。下がっている。下限は 0.10' : '') + '）' : '') + (w.nerve2 ? ' / 神経を持つ個体 ' + (c0.neuronBodies * 100).toFixed(0) + '%（1 個体あたり ' + c0.neurons.toFixed(2) + ' 個。感覚を読んで何かを動かす神経を持つのは ' + ((c0.senseNeurons || 0) * 100).toFixed(0) + '%）' : '') + (w.learn ? ' / 経験で変わる結合を持つ個体 ' + (c0.plastic * 100).toFixed(0) + '%' : '') + '\n';
    const geneLine = birthLine + '遺伝子の部品：持っている ' + c0.partsTotal.toFixed(1) + ' / 規則が届く ' + c0.partsReach.toFixed(1) + ' / 身体に現れる ' + c0.partsUsed.toFixed(2) + ' 種類（2 種類以上の身体 ' + (c0.multiPart * 100).toFixed(0) + '%、軸に区分 ' + (c0.zoned * 100).toFixed(0) + '%、区分が分化 ' + (c0.differed * 100).toFixed(0) + '%）\n';
    $('stats').textContent = (c0.unsound || c0.broken ? '【異常】数でない値（蓄え・位置・神経の信号）を持つ身体 ' + (c0.unsound || 0) + ' 匹 / 物理の計算の破綻で死んだ身体 ' + (c0.broken || 0) + ' 匹。これは世界の出来事ではなく、プログラムの不具合です。この世界を保存して知らせてください。\n' : '') + (w.budget ? '【出生の収支を合わせる】' : '') + (w.carry ? '【成長で神経を引き継ぐ】' : '') + (w.genome2 ? '【遺伝子の新しい規則】' : '') + geneLine + (w.contact ? '【接触あり】傷で死亡 ' + (c0.killed || 0) + ' / 傷を負っている ' + (c0.wounded * 100).toFixed(0) + '% / 口の収入のうち他個体の組織 ' + (c0.fleshShare * 100).toFixed(1) + '%（2 割以上の個体 ' + (c0.fleshEaters * 100).toFixed(0) + '%）' + (w.adhere ? ' / 他の身体を掴んでいる ' + (c0.holding * 100).toFixed(0) + '% / 収入のうち染み出しで得た分 ' + (c0.seepShare * 100).toFixed(1) + '%' : '') + (w.mix ? ' / 2 つの遺伝子から生まれた個体 ' + (c0.twoParents * 100).toFixed(0) + '%（相手の遺伝物質を持っている ' + (c0.carrying * 100).toFixed(0) + '%）' : '') + '\n' : '') + (w.blind ? '【近道なし】' : '') + (w.vision ? '【視覚あり】配線された眼を持つ個体 ' + seers + ' / ' : '') + (w.scent ? '【他個体の匂いあり】嗅覚の配線を持つ個体 ' + smellers + ' / ' : '') + '時刻 ' + c0.t + ' 秒 / 個体数 ' + c0.n + ' / 系統 ' + c0.lines + ' / 平均世代 ' + c0.gen.toFixed(1)
      + '\n成体の体節数：平均 ' + c0.segMean.toFixed(2) + '・最大 ' + c0.segMax + ' / 多体節 ' + (c0.multi * 100).toFixed(0) + '%'
      + '\n平均体積 ' + c0.volume.toFixed(2) + ' / 自力移動 ' + c0.speed.toFixed(3) + ' u/s / 口から ' + (c0.mouthShare * 100).toFixed(0) + '%（収入の 3 割以上を口から得ている個体 ' + ((c0.grainEaters || 0) * 100).toFixed(0) + '%）/ 眼 ' + (c0.eyes * 100).toFixed(0) + '% / 底面 ' + (c0.bottom * 100).toFixed(0) + '%'
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
    const extLog = w.events.filter(e => e.text.startsWith('体制の絶滅：')), visibleLog = $('showExtinctionLog').checked ? w.events : w.events.filter(e => !e.text.startsWith('体制の絶滅：'));
    $('events').textContent = (! $('showExtinctionLog').checked && extLog.length ? 'この記録内の体制絶滅 ' + extLog.length + ' 件を集約（詳細はチェックで表示）\n' : '') + (visibleLog.length ? visibleLog.slice().reverse().map(e => e.t + ' 秒  ' + e.text + (e.id ? '（#' + e.id + '）' : '')).join('\n') : 'そのほかの記録はまだない');
    ancestry();
    // extinct body plans
    const f = $('lostFilter').value, all = [...w.clades.values()].filter(c => c.ended != null);
    let list = all.filter(c => c.g).filter(c => { const k = c.kind.split('/'); return f === 'moved' ? k[3] === '1' || k[4] === '1' : f === 'eye' ? k[2] === '1' : true; });
    list.sort(f === 'recent' ? (a, b) => b.ended - a.ended : (a, b) => b.members - a.members);
    $('lost').textContent = '';
    for (const c of list.slice(0, 12)) card($('lost'), c.g, c.members + '匹 ' + (c.genMax - c.gen0 + 1) + '世代\n' + kindText(c.kind), () => { shown = c; }, shown === c);
    $('lostNote').textContent = '体制の記録 ' + w.clades.size + '（うち絶滅 ' + all.length + '、該当 ' + list.length + '）' + (w.cladesDropped ? ' / 容量のため省いた記録 ' + w.cladesDropped : '') + (w.genomesDropped ? ' / 数だけ残して遺伝子を省いた絶滅体制 ' + w.genomesDropped : '');
  }
  function ancestry() {
    const box = $('ancestry'); box.textContent = '';
    if (!sel) return;
    const chain = w.ancestors(sel.id), steps = chain.filter((n, i) => (i === 0 || n.changed || i === chain.length - 1) && n.g); // (an old ancestor may have kept its numbers but not its genome: see recordAge in the engine)
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
  function select(o, keepRule, observer) { if (!observer && !keepRule) A.observerUI.clearTrack(); sel = o; shown = null; follow = follow && !!o; lastPanels = 0; if (!keepRule) { rule = null; ruleName = ''; notice = ''; } }

  function draw() {
    if (follow && sel && !sel.dead) { view.cx += (sel.cx - view.cx) * 0.15; view.cy += (sel.cy - view.cy) * 0.15; }
    view.cx = ((view.cx % w.W) + w.W) % w.W;
    const wrapX = x => { let d = x - view.cx; if (d > w.W / 2) d -= w.W; else if (d < -w.W / 2) d += w.W; return d; };
    const X = x => wrapX(x) * view.scale + W / 2, Y = y => (y - view.cy) * view.scale + H / 2, sc = view.scale;
    ctx.fillStyle = '#03070d'; ctx.fillRect(0, 0, W, H);
    // dissolved food as a smooth field (the world joins left to right, so it is tiled)
    if (!field || field.width !== w.cols) { field = Object.assign(document.createElement('canvas'), { width: w.cols, height: w.rows }); fimg = field.getContext('2d').createImageData(w.cols, w.rows); }
    for (let i = 0; i < w.nut.length; i++) { const n = Math.min(1, w.nut[i]), g = w.regions ? (w.shore > 0 ? w.slope((i % w.cols + 0.5) * w.cell, false) : w.hGround[i]) : (Math.floor(i / w.cols) * w.cell >= w.yBottom ? 1 : 0), j = i * 4; fimg.data[j] = (30 + 26 * n) * g + (6 + 14 * n) * (1 - g); fimg.data[j + 1] = (30 + 30 * n) * g + (22 + 46 * n) * (1 - g); fimg.data[j + 2] = (24 + 14 * n) * g + (38 + 60 * n) * (1 - g); fimg.data[j + 3] = 255; } // the floor is drawn where, and as much as, the physics has it
    field.getContext('2d').putImageData(fimg, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const y0w = Y(0), hw = w.H * sc, ww = w.W * sc, x0w = (-view.cx) * sc + W / 2;
    for (const k of [-1, 0, 1]) ctx.drawImage(field, x0w + k * ww - 0.5, y0w, ww + 1, hw);
    // (vents) where dissolved food wells up: a faint ring, fading as the vent opens and closes
    if (w.vents && w.ventList) for (const v of w.ventList) { const st = Math.max(0, Math.min(1, (w.t - v.born) / 30, (v.until - w.t) / 30)); if (!(st > 0)) continue; const x = X(v.x), y = Y(v.y), rr = w.ventRadius * sc; if (x < -rr || x > W + rr) continue; ctx.strokeStyle = 'rgba(150,235,200,' + (0.35 * st).toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.3); ctx.stroke(); ctx.fillStyle = 'rgba(150,235,200,' + (0.07 * st).toFixed(3) + ')'; ctx.fill(); }
    // (nest) matter that bodies have laid into the water: the more of it in a cell, the denser the haze. It stays where it was laid.
    if (w.nest && w.mat) { const c = w.cell * sc + 1; for (let i = 0; i < w.mat.length; i++) { const v = w.mat[i]; if (!(v > 0.03)) continue; const x = X((i % w.cols) * w.cell), y = Y(Math.floor(i / w.cols) * w.cell); if (x < -c || y < -c || x > W || y > H) continue; ctx.fillStyle = 'rgba(214,188,132,' + (0.55 * v / (v + 2)).toFixed(3) + ')'; ctx.fillRect(x, y, c, c); } }
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
    frameNo++; const tBodies = performance.now();
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
      if (Math.max(px, py) < (o === sel ? 9 : detailMin)) { // far away (or, while drawing is slow, not large enough for a picture of its own): still a body with a shape and a heading, not a dot
        ctx.lineCap = 'round';
        // (a body far away keeps the pale lines it always had; a body that is near but drawn simply because drawing is slow gets the colours of its picture: skin outside, the warm inside as its core)
        for (const [wd, col] of Math.max(px, py) < 9 ? [[2.6, 'hsla(' + o.g.hue + ',40%,80%,.16)'], [1.5, 'hsla(' + o.g.hue + ',35%,82%,.5)'], [0.8, 'hsla(' + (o.g.hue + 25) + ',45%,60%,.9)']] : [[2.3, 'hsla(' + (o.g.hue + 25) + ',45%,88%,.13)'], [1.7, 'hsla(' + o.g.hue + ',30%,60%,.55)'], [0.75, 'hsla(' + (o.g.hue + 200) + ',50%,42%,.8)']]) { ctx.strokeStyle = col; ctx.beginPath(); for (const s of b.segs) { ctx.lineWidth = Math.max(1.6, (s.r0 + s.r1) * sc * wd); const xa = mx + (s.ax - mxw) * sc; ctx.moveTo(xa, Y(s.ay)); ctx.lineTo(xa + (s.bx - s.ax) * sc + 0.01, Y(s.by)); } ctx.stroke(); }
      } else {
        // each body gets its own small picture, drawn larger than shown when the body is small. While drawing is slow (spriteEvery > 1) a body's picture is kept and
        // shown again for a few frames, moved and turned with the body, and only drawn afresh every spriteEvery-th frame: the look stays, the work is divided.
        const root = b.segs[0], ang = Math.atan2(root.dy, root.dx);
        if (spriteEvery <= 1 || o === sel) {
          const size = Math.ceil(Math.max(px, py) + 18), ss = Math.max(1, Math.min(4, Math.floor(440 / size)));
          ctx.save(); ctx.translate(Math.round(mx - size / 2), Math.round(my - size / 2));
          bodyR.draw(ctx, b.segs, { cx: mxw, cy: (y0 + y1) / 2, scale: sc, w: size, h: size }, { gpu: gpuOn, quality: gpuOn ? ss : Math.min(2, ss), hue: o.g.hue, glow: sc > 18, shadow: w.isGround(o.cx, o.cy), time: b.t, clock: w.t, gut: o.G / Math.max(1e-6, o.prof.gutCap), speed: o._v || 0, fill: o.E / o.prof.Emax, drive: b.cmd.drive, bristles: sc > 20, internals: sc > 6, pads: w.isGround(o.cx, o.cy) });
          ctx.restore();
        } else {
          let ax = 0, ay = 0, rad = 0; for (const s of b.segs) { ax += s.ax + s.bx; ay += s.ay + s.by; } ax /= 2 * b.segs.length; ay /= 2 * b.segs.length; // (a point that stays put in the body, and how far the body reaches from it)
          for (const s of b.segs) { const r = Math.max(s.r0, s.r1); rad = Math.max(rad, Math.hypot(s.ax - ax, s.ay - ay) + r, Math.hypot(s.bx - ax, s.by - ay) + r); }
          const size = Math.ceil(2 * rad * sc + 18), ss = Math.max(1, Math.min(4, Math.floor(440 / size))), epoch = A.gpu ? A.gpu.epoch : 0; let sp = sprites.get(o);
          if (!sp || sp.size !== size || sp.sc !== sc || sp.n !== b.segs.length || sp.epoch !== epoch || frameNo >= sp.next) {
            const first = !sp || sp.size !== size; if (first) { sp = { c: document.createElement('canvas'), size }; sp.c.width = sp.c.height = size; sprites.set(o, sp); } const c2 = sp.c.getContext('2d'); c2.clearRect(0, 0, size, size);
            bodyR.draw(c2, b.segs, { cx: ax, cy: ay, scale: sc, w: size, h: size }, { gpu: gpuOn, quality: gpuOn ? ss : Math.min(2, ss), hue: o.g.hue, glow: sc > 18, shadow: w.isGround(o.cx, o.cy), time: b.t, clock: w.t, gut: o.G / Math.max(1e-6, o.prof.gutCap), speed: o._v || 0, fill: o.E / o.prof.Emax, drive: b.cmd.drive, bristles: sc > 20, internals: sc > 6, pads: w.isGround(o.cx, o.cy) });
            sp.sc = sc; sp.n = b.segs.length; sp.epoch = epoch; sp.ang = ang; sp.next = frameNo + (first ? 1 + o.id % spriteEvery : spriteEvery); // (bodies take their turns: not all in one frame)
          }
          ctx.save(); ctx.translate(mx + (ax - mxw) * sc, Y(ay)); ctx.rotate(ang - sp.ang); ctx.drawImage(sp.c, -size / 2, -size / 2); ctx.restore();
        }
      }
      if (o === sel) { ctx.strokeStyle = '#eafff4'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(mx, my, Math.max(px, py) / 2 + 8, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); }
    }
    { // drawing the bodies took too long: fewer of them get a picture of their own from the next frame on; it was quick for a while: more of them do again
      const ms = performance.now() - tBodies; drawMs += (ms - drawMs) * 0.3;
      // first the pictures are reused for more frames; only if drawing is then still very slow (and the box "never as strokes" is not ticked) are small bodies drawn as strokes
      const strokes = !($('keepDetail') && $('keepDetail').checked); if (!strokes) detailMin = 9;
      if (ms > 40) { if (spriteEvery < SPRITE_MAX) spriteEvery = Math.min(SPRITE_MAX, spriteEvery + (ms > 120 ? 3 : 1)); else if (strokes && ms > 250) detailMin = Math.min(DETAIL_MAX, detailMin * Math.min(4, Math.max(1.25, ms / 250))); /* (strokes are the last resort: only when drawing the bodies still takes a quarter of a second with the pictures reused as long as they can be) */ quickRun = 0; detailHold = tBodies + 4000; }
      else if (drawMs < 15 && (detailMin > 9 || spriteEvery > 1) && tBodies > detailHold) { if (++quickRun >= 10) { if (detailMin > 9) detailMin = Math.max(9, detailMin * 0.8); else spriteEvery--; quickRun = 0; } } else quickRun = 0; }
    if (w.regions) { // region names along the top, and the borders between regions
      ctx.font = '13px system-ui'; ctx.textAlign = 'center';
      for (const q of w.regions) { const xm = X((q.x0 + q.x1) / 2), xb = X(w.borderX(q) % w.W); ctx.fillStyle = 'rgba(235,245,240,.75)'; ctx.fillText(q.name, xm, Math.max(16, y0w + 16)); ctx.strokeStyle = 'rgba(200,225,235,.14)'; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(xb, Math.max(0, y0w)); ctx.lineTo(xb, Math.min(H, Y(w.H))); ctx.stroke(); ctx.setLineDash([]); }
      ctx.textAlign = 'start';
    }
    if (w.sound && w.sndV && $('showSound').checked) { // where voices are sounding: colour for pitch (red low .. violet high), strength for loudness; a ring on every body that is sounding
      const c = w.cell, q0 = Math.floor((view.cx - W / 2 / sc) / c) - 1, q1 = Math.ceil((view.cx + W / 2 / sc) / c) + 1, r0 = Math.max(0, Math.floor((view.cy - H / 2 / sc) / c)), r1 = Math.min(w.rows - 1, Math.ceil((view.cy + H / 2 / sc) / c));
      for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) { const i = r * w.cols + ((q % w.cols) + w.cols) % w.cols; let tot = 0, hs = 0; for (let b = 0; b < 6; b++) { const v = w.sndV[b][i]; tot += v; hs += v * b; } if (tot < 0.012) continue;
        ctx.fillStyle = 'hsla(' + (hs / tot * 54) + ',90%,60%,' + Math.min(0.42, 0.5 * (1 - Math.exp(-5 * tot))) + ')'; ctx.fillRect((q * c - view.cx) * sc + W / 2, Y(r * c), c * sc + 1, c * sc + 1); }
      for (const o of w.bodies) if (o.voL > 0.05) { const x = X(o.cx), y = Y(o.cy); if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue; ctx.strokeStyle = 'hsla(' + (o.voP || 0) * 270 + ',95%,70%,' + (0.35 + 0.6 * o.voL) + ')'; ctx.lineWidth = 1.5; for (const k of [1, 1.8]) { ctx.beginPath(); ctx.arc(x, y, (6 + 14 * o.voL) * k + ((w.t * 30) % 12) * 0.8, 0, 6.3); ctx.stroke(); } }
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
      $('info').textContent = (notice ? notice + '\n' : '') + (ruleName ? '［' + ruleName + 'を自動で観察中］ ' : '') + '#' + sel.id + ' / 由来 ' + ({ 'artificial-introduced': '人工投入', evolved: 'evolved（自然進化）', primordial: 'primordial（始祖）', 'evolved-from-artificial': 'evolved-from-artificial（人工個体の子孫）' }[sel.g.origin] || sel.g.origin + '（人工）') + ' / 系統 ' + sel.line + (sel.p2 ? '（2 つの遺伝子から：産んだ親 #' + sel.parent + '、もう一方 #' + sel.p2 + '）' : '') + (sel.introduction ? ' / 人為投入系統 ' + sel.introduction.seed + ':' + sel.introduction.root + '（' + sel.introduction.t.toFixed(1) + ' 秒）' : '') + ' / 世代 ' + sel.gen + ' / 変異 ' + sel.g.mutations + ' 回\n齢 ' + sel.age.toFixed(0) + ' / ' + sel.life.toFixed(0) + ' 秒 / 成熟段階 ' + sel.stage.toFixed(2) + ' / 子 ' + sel.kids + ' / 出生時の大きさ ' + sel.g.birth.toFixed(2)
        + '\n体節 ' + sel.b.segs.length + '（成体 ' + sel.full.segs + '）/ 体積 ' + p.V.toFixed(2) + ' / 口 ' + p.mouths.length + ' / 部品 ' + sel.g.parts.length + ' 種・規則 ' + sel.g.links.length + ' 本'
        + '\n遺伝子：部品 ' + sel.gu.parts + '（規則が届く ' + sel.gu.reach + '・身体に現れる ' + sel.gu.expr + ' 種類・休眠 ' + (sel.gu.parts - sel.gu.reach) + '）' + (() => { const G = A.genome, li = G.axisOf(sel.g, sel.g.root); return li < 0 ? '' : ' / 根の軸：' + G.zones(sel.g, li).map(z => '部品' + z.part + '×' + z.len).join(' → ') + (sel.gu.zones ? '（複製元との差 ' + (sel.gu.div * 100).toFixed(1) + '%）' : ''); })()
        + (sel.g.parts.some(p => p.nn) ? '\n神経：' + sel.g.parts.map((p, i) => (p.nn ? '部品' + i + '［' + p.nn.map(q => q.in.map(e => e[0] + (e[1] >= 0 ? '+' : '') + e[1].toFixed(1)).join(' ') + ' → ' + (q.out.map(e => e[0] + (e[1] >= 0 ? '+' : '') + e[1].toFixed(1)).join(' ') || '出力なし')).join(' ｜ ') + '］' : '')).filter(Boolean).join(' ') : '')
        + (sel.hp ? '\n損傷：体節ごとの残り ' + sel.hp.map(v => (v * 100).toFixed(0) + '%').join(' ') + '（失った分 ' + (sel.lost || 0).toFixed(2) + '）' : '') + (sel.flesh ? '\n他個体の組織から得た量 ' + sel.flesh.toFixed(2) + '（口の収入の ' + (sel.flesh / Math.max(1e-9, sel.eaten) * 100).toFixed(0) + '%）' : '')
        + (w.sound && (sel.b.hasVoice || sel.b.hasEar) ? '\n音：' + (sel.b.hasVoice ? '声（組織 ' + sel.b.segs.reduce((x, q) => x + (q.voxV || 0), 0).toFixed(3) + '・高さ ' + sel.b.segs.filter(q => q.voxV > 0).map(q => q.p.pitch.toFixed(2)).join(' ') + '）いまの大きさ ' + (sel.voL || 0).toFixed(2) + '・鳴き始め ' + (sel.voN || 0) + ' 回・鳴いていた時間 ' + (sel.voT || 0).toFixed(0) + ' 秒・声に使ったエネルギー ' + (sel.voE || 0).toFixed(2) : '声なし') + ' ／ ' + (sel.b.hasEar ? '耳 ' + sel.b.segs.filter(q => q.earW).length + ' 個（合わせた高さ ' + sel.b.segs.filter(q => q.earW).map(q => q.p.hTune.toFixed(2)).join(' ') + '）いま受けている大きさ ' + sel.b.segs.filter(q => q.earW).map(q => (q.e || 0).toFixed(2)).join(' ') + '・回路を押す強さ ' + (sel.b.hd || 0).toFixed(2) : '耳なし') : '')
        + '\nエネルギー ' + sel.E.toFixed(2) + ' / ' + p.Emax.toFixed(2) + ' / 消化管内 ' + sel.G.toFixed(2) + ' / 維持費 ' + p.basal.toFixed(3) + '/s'
        + '\n生涯の収入：口 ' + (inc ? sel.eaten / inc * 100 : 0).toFixed(0) + '%・体表 ' + (inc ? sel.absorbed / inc * 100 : 0).toFixed(0) + '% / 自力移動 ' + speedOf(sel).toFixed(3) + ' u/s' + (sel.passive ? '（動く関節なし）' : '');
    } else if (sel) {
      // the observed individual has died: carry on with the next one by the same rule, or with a living descendant
      const gone = sel, cause = CAUSE[gone.dead] || gone.dead, wasFollowing = follow;
      if (rule && w.bodies.length) { const r = rule, n = ruleName; pick(r, n, true); notice = '#' + gone.id + ' が' + cause + '。「' + n + '」で次の個体 #' + sel.id + ' を選び直した。'; }
      else { const heir = w.bodies.find(o => w.ancestors(o.id).some(n => n.id === gone.id)); if (heir) { select(heir, true); follow = wasFollowing; notice = '#' + gone.id + ' が' + cause + '。その子孫 #' + heir.id + ' に移った。'; } else { $('info').textContent = '#' + gone.id + ' は' + cause + '。生きている子孫はいない。記録は「絶滅した体制の記録」に残る。'; sel = null; } }
    }
  }
  // One frame. Each part is run on its own: a fault in one (the statistics, the commentary, the sound, a save) must not stop the others, and must never stop the
  // next frame from being asked for - a display that has stopped looks like a world that has died. What went wrong is shown in a bar at the top of the page.
  // If the world's own step fails, the world is paused (stepping it again would only fail again) and can still be saved.
  const FRAME_MS = 100, pace = { steps: 0, frames: 0, cut: 0, since: 0, other: 0 };
  // ---- A record of the run, kept by the page itself. Nothing here goes back into the world. ----
  // Every 10 s one line goes to this browser's small store: where the world is and how the page is doing (steps, frames, the time of a step and of
  // drawing, the longest time without a frame, memory, the state of the GPU). If the page stops answering, the lines up to then are still there the
  // next time it is opened, and can be written to a file. Kept for each run: the last 15 minutes line by line, before that one line in ten minutes,
  // and every line with a stall (no frame for 2 s, or one step over 1 s). Five runs are kept; a run enters the store with its first line (so a page
  // opened for a few seconds pushes nothing out), and when a sixth comes, the oldest run that was closed while answering goes first: the runs that
  // ended without answering are the ones worth keeping.
  const RL = { key: 'alife2_runlog_', idx: 'alife2_runlog_index', run: null, last: 0, tick: 0, steps: 0, stepMs: 0, stepMax: 0, frames: 0, drawMs: 0, drawMax: 0, gapMax: 0, saveMs: 0, saveMB: 0, before: [] };
  const RL_COLS = ['時刻', '世界の秒', '個体数', '体節数', '速度の指定（0 は一時停止）', '世界の秒÷実時間 1 秒', 'コマ÷秒', '1 刻み ms（平均）', '1 刻み ms（最大）', '描画 ms（平均）', '描画 ms（最大）', 'コマの間隔 ms（最大）', 'メモリ MB', 'GPU の描画が失われた回数', 'GPU 正常（1）', '裏（1）', '個体の絵を描き直す間隔（コマ）', '線にする大きさ（ピクセル）', '島', '自動保存 MB', '自動保存 ms'];
  const runlogWrite = () => { if (RL.run && RL.run.recent.length) try { localStorage.setItem(RL.key + RL.run.id, JSON.stringify(RL.run)); } catch (e) {} };
  const runlogEnter = () => { try { const ids = JSON.parse(localStorage.getItem(RL.idx) || '[]').filter(id => localStorage.getItem(RL.key + id) != null);
    while (ids.length > 4) { let i = ids.findIndex(id => { try { return JSON.parse(localStorage.getItem(RL.key + id)).clean; } catch (e) { return true; } }); if (i < 0) i = 0; localStorage.removeItem(RL.key + ids[i]); ids.splice(i, 1); }
    ids.push(RL.run.id); localStorage.setItem(RL.idx, JSON.stringify(ids)); } catch (e) {} };
  const runlogRuns = () => { try { return JSON.parse(localStorage.getItem(RL.idx) || '[]').map(id => { try { return JSON.parse(localStorage.getItem(RL.key + id)); } catch (e) { return null; } }).filter(r => r && r.recent); } catch (e) { return []; } };
  function runlogStart() {
    try { const id = Date.now(); let gl = ''; try { const g = gpuOn && A.gpu && A.gpu.shared().gl, x = g && g.getExtension('WEBGL_debug_renderer_info'); gl = x ? String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)) : gpuOn ? '' : '使わない設定（?gfx=cpu）'; } catch (e) {}
      RL.run = { id, build: A.version.label, ua: navigator.userAgent, cores: navigator.hardwareConcurrency || 0, gl, opened: discarded ? 'ブラウザが休止させたタブを開き直した' : unclean ? '前回が応答しないまま終わったあと' : '', clean: 0, recent: [], sparse: [], stalls: [] }; } catch (e) { RL.run = null; }
    addEventListener('pagehide', () => { if (RL.run) { RL.run.clean = 1; runlogWrite(); } }); addEventListener('pageshow', e => { if (e.persisted && RL.run) { RL.run.clean = 0; runlogWrite(); } });
  }
  // called at every frame, and at every beat while the tab is hidden
  function runlogTick(hidden) {
    const now = Date.now(); if (RL.tick && now - RL.tick > RL.gapMax) RL.gapMax = now - RL.tick; RL.tick = now;
    if (!RL.run || !w) return; if (!RL.last) { RL.last = now; return; } if (now - RL.last < 10000) return;
    const sec = (now - RL.last) / 1000, r1 = x => Math.round(x * 10) / 10; let segs = 0, ok = 0; for (const o of w.bodies) segs += o.b.segs.length; try { ok = gpuOn && A.gpu && A.gpu.shared().ok ? 1 : 0; } catch (e) {}
    const line = [now, Math.round(w.t), w.bodies.length, segs, paused ? 0 : Number($('speed').value), r1(RL.steps / 30 / sec), r1(RL.frames / sec), RL.steps ? r1(RL.stepMs / RL.steps) : 0, Math.round(RL.stepMax), RL.frames ? r1(RL.drawMs / RL.frames) : 0, Math.round(RL.drawMax), Math.round(RL.gapMax),
      performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0, A.gpu ? A.gpu.losses || 0 : 0, ok, hidden ? 1 : 0, spriteEvery, Math.round(detailMin), ISL.ws.length, RL.saveMB, Math.round(RL.saveMs)];
    const R = RL.run; if (!R.recent.length && !R.sparse.length) runlogEnter(); R.recent.push(line); if (line[11] >= 2000 || line[8] >= 1000) { R.stalls.push(line); if (R.stalls.length > 120) R.stalls.splice(40, 1); } // (of very many stalls, the first 40 and the last 80 stay)
    while (R.recent.length > 90) { const x = R.recent.shift(), sp = R.sparse; if (!sp.length || x[0] - sp[sp.length - 1][0] >= 600000) { sp.push(x); if (sp.length > 150) sp.shift(); } }
    runlogWrite(); RL.last = now; RL.steps = RL.stepMs = RL.stepMax = RL.frames = RL.drawMs = RL.drawMax = RL.gapMax = 0;
  }
  const rlTime = x => { const d = new Date(x), z = n => String(n).padStart(2, '0'); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); };
  const runlogLast = r => r.recent.length ? r.recent[r.recent.length - 1] : r.sparse.length ? r.sparse[r.sparse.length - 1] : null;
  const runlogSay = r => { const l = runlogLast(r); return '始まり ' + rlTime(r.id) + '（' + r.build + '）' + (l ? '、最後の記録 ' + rlTime(l[0]) + '：世界の ' + l[1] + ' 秒、' + l[2] + ' 匹、世界の ' + l[5] + ' 秒／実時間 1 秒、' + l[6] + ' コマ／秒、1 刻み 平均 ' + l[7] + '・最大 ' + l[8] + ' ミリ秒、描画 平均 ' + l[9] + '・最大 ' + l[10] + ' ミリ秒、コマの間隔 最大 ' + l[11] + ' ミリ秒' + (l[12] ? '、メモリ ' + l[12] + ' MB' : '') + '、GPU の描画が失われた回数 ' + l[13] + (r.stalls.length ? '。2 秒以上コマが出なかった（または 1 刻みが 1 秒を超えた）10 秒間が ' + r.stalls.length + ' 回' : '。2 秒以上コマが出なかった 10 秒間は無い') : '、記録は 1 行も無い（10 秒もたなかった）'); };
  function runlogText() {
    const runs = runlogRuns(), out = ['ALIFE 2.0 運転の記録（書き出し ' + rlTime(Date.now()) + '、' + A.version.label + '）。10 秒ごとに 1 行。各運転：10 分に 1 行（古い部分）、止まりかけた行、最後の 15 分。', '「コマの間隔（最大）」が 60000 を超える行は、ページが動いていなかった時間（スリープ、ブラウザによるタブの凍結）。', RL_COLS.join('\t')];
    runs.forEach((r, i) => { const me = RL.run && r.id === RL.run.id; out.push('', '== 運転 ' + (i + 1) + '／' + runs.length + '：' + rlTime(r.id) + ' に開いた。' + r.build + '。' + (me ? 'いま開いているページ' : r.clean ? '応答したまま閉じた' : '応答しないまま終わった（固まった、落ちた、またはブラウザがタブを休止させた）') + (r.opened ? '。' + r.opened : '') + '。ブラウザ：' + r.ua + '、コア ' + r.cores + '、GPU：' + (r.gl || '不明'));
      const rows = (name, l) => { if (l.length) { out.push('-- ' + name + '（' + l.length + ' 行）'); for (const x of l) out.push([rlTime(x[0])].concat(x.slice(1)).join('\t')); } };
      rows('10 分に 1 行', r.sparse); rows('止まりかけた行', r.stalls); rows('最後の 15 分', r.recent); });
    return out.join('\n') + '\n';
  }
  const faultsSeen = new Map();
  function fault(part, e) { const text = String(e && e.message || e), n = (faultsSeen.get(part) || 0) + 1; faultsSeen.set(part, n); if (n > 1 && n % 600) return; console.error('ALIFE2 ' + part, e);
    let bar = $('fatal'); if (!bar) { bar = document.createElement('div'); bar.id = 'fatal'; bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99;background:#7a1020;color:#fff;padding:6px 10px;font-size:13px;white-space:pre-wrap'; document.body.append(bar); }
    bar.textContent = '【異常】' + part + 'で例外が起きた（' + n + ' 回）：' + text + '\nこれはプログラムの不具合です。' + (part === '世界の計算' ? '世界を一時停止しました。' : '表示のほかの部分と世界は動き続けます。') + '「世界を保存」で保存して知らせてください。'; }
  const part = (name, f) => { try { f(); } catch (e) { fault(name, e); return false; } return true; };
  function loop(ms) {
    // One frame computes the world for at most FRAME_MS, or for as long as drawing the last frame took if that was longer; one step at the least.
    // A world too heavy for the speed asked for then runs slower than asked, and the page keeps drawing and answering: without the limit a frame took
    // (speed x the time of one step), which is seconds in a grown world at speed 64. Where drawing itself is slow, the world still gets half of the time.
    // How many steps a frame holds changes nothing in the world itself.
    const tA = performance.now();
    if (!paused && !ISL.busy) { const n = Number($('speed').value), lim = Math.max(FRAME_MS, pace.other); if (!part('世界の計算', () => { let tS = tA; for (let i = 0; i < n; i++) { advance(); pace.steps++; const tN = performance.now(), d = tN - tS; tS = tN; RL.steps++; RL.stepMs += d; if (d > RL.stepMax) RL.stepMax = d; if (i + 1 < n && tN - tA > lim) { pace.cut++; break; } } })) { paused = true; const p = $('pause'); if (p) p.textContent = '再開'; } }
    const tB = performance.now();
    pace.frames++;
    part('描画', draw);
    part('音', audioFrame);
    pace.other = performance.now() - tB; // (drawing and sound, every frame; not the panels and the automatic save, which come once in a while)
    RL.frames++; RL.drawMs += pace.other; if (pace.other > RL.drawMax) RL.drawMax = pace.other; runlogTick(false);
    if (ms - pace.since >= 1000) { const el = $('pace'), sec = (ms - pace.since) / 1000; if (el) el.textContent = (paused || !pace.steps ? '' : '実測：世界の ' + (pace.steps / 30 / sec).toFixed(1) + ' 秒／実時間 1 秒、' + (pace.frames / sec).toFixed(0) + ' コマ／秒') + (pace.cut > pace.frames / 2 ? '（計算が重く、指定の速度には届いていない）' : '') + (A.gpu && A.gpu.losses ? '／GPU の描画が ' + A.gpu.losses + ' 回失われ、' + (A.gpu.shared().ok ? '作り直した' : 'いまは CPU で皮膚を描いている（遅い）') : '') + (spriteEvery > 1 ? '／描画が重いので、個体の絵を ' + spriteEvery + ' コマに 1 回だけ描き直している（あいだは同じ絵を動かす）' : '') + (detailMin > 9 ? '／それでも重いので、画面上で ' + Math.round(detailMin) + ' ピクセルより小さい個体は線で描いている（右のチェックで止められる）' : ''); pace.steps = pace.frames = pace.cut = 0; pace.since = ms; }
    if (ms - lastPanels > 1000) { lastPanels = ms; part('統計・個体の表示', panels); part('島の表示', islandPanel); }
    if ($('auto').checked && ms - lastSave > (ISL.ws.length ? 120000 : 30000)) { lastSave = ms; part('自動保存', autosave); }
    requestAnimationFrame(loop);
  }
// Saving. The browser's small key-value store (about 5 MB) cannot hold a world with its genealogy, so automatic
  // saves go to IndexedDB, in a database of ALIFE 2.0's own (ALIFE 23 uses 'alife05-observatory' and 'alife16_*').
  const DB = 'alife2-worlds', STORE = 'saves';
  const db = () => new Promise((ok, no) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const dbPut = async (k, v) => { const d = await db(); return new Promise((ok, no) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = () => ok(); t.onerror = () => no(t.error); t.onabort = () => no(t.error); }); };
  const dbGet = async k => { const d = await db(); return new Promise((ok, no) => { const r = d.transaction(STORE).objectStore(STORE).get(k); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); };
  const gz = async text => typeof CompressionStream === 'undefined' ? null : new Blob([await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()], { type: 'application/gzip' });
  const gunzip = async blob => new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const mb = n => (n / 1048576).toFixed(1) + ' MB';
  let saving = false;
  async function autosave() {
    if (saving) return; saving = true;
    try { const a0 = performance.now(), at = Math.round(w.t), blobs = await worldBlobs(), size = blobs.reduce((a, b) => a + b.size, 0); RL.saveMB = Math.round(size / 104857.6) / 10; await dbPut('autosave', blobs.length > 1 ? { format: 'alife2-islands-2', every: ISL.every, count: ISL.count, worlds: blobs } : blobs[0]); $('saveNote').textContent = '自動保存した（' + at + ' 秒時点、' + (blobs.length > 1 ? '島 ' + blobs.length + ' 個、' : '') + mb(size) + '）。保存先はこのブラウザの IndexedDB「' + DB + '」。ALIFE 23 の保存とは別。'; RL.saveMs = performance.now() - a0; }
    catch (e) { $('saveNote').textContent = '自動保存に失敗：' + (e && e.message || e) + '。「世界を保存」でファイルに残してください。'; }
    saving = false;
  }

  // ---- input
  cv.addEventListener('wheel', e => { e.preventDefault(); view.scale = Math.max(2, Math.min(200, view.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); }, { passive: false });
  let drag = null;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false }; });
  cv.addEventListener('pointermove', e => { if (!drag) return; const k = W / cv.clientWidth; if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) { drag.moved = true; follow = false; $('follow').textContent = '追跡'; } view.cx -= (e.clientX - drag.x) * k / view.scale; view.cy -= (e.clientY - drag.y) * k / view.scale; drag.x = e.clientX; drag.y = e.clientY; });
  cv.addEventListener('pointerup', e => {
    if (drag && !drag.moved) { const r = cv.getBoundingClientRect(), k = W / r.width, x = ((e.clientX - r.left) * k - W / 2) / view.scale + view.cx, y = ((e.clientY - r.top) * k - H / 2) / view.scale + view.cy; let best = null, bd = 1e9; for (const o of w.bodies) { let dx = o.cx - x; dx -= Math.round(dx / w.W) * w.W; const d = Math.hypot(dx, o.cy - y); if (d < bd) { bd = d; best = o; } } select(bd < 6 + 20 / view.scale ? best : null); }
    drag = null;
  });
  // auto = the observed body died and the same rule picks the next one: the view is left as the user had it (no zoom, tracking only if it was on)
  const pick = (f, name, auto) => { if (!w.bodies.length) return; if (!auto) A.observerUI.clearTrack(); const was = follow; rule = f; ruleName = name || ruleName; select(w.bodies.reduce((a, b) => (f(b) > f(a) ? b : a)), true); if (auto) { follow = was; return; } follow = true; $('follow').textContent = '追跡中'; view.scale = Math.max(view.scale, 30); };
  $('brainy').onclick = () => pick(o => o.b.segs.reduce((a, q) => a + (q.p.nn ? q.p.nn.length : 0), 0) * 1000 + o.prof.wiring, '神経が最も多い個体'); $('mosaic').onclick = () => pick(o => (o.gu ? o.gu.expr : 1) * 1000 + o.b.segs.length, '部品の種類が最も多い個体');
  $('biggest').onclick = () => pick(o => o.prof.V, '最大の身体'); $('mover').onclick = () => pick(speedOf, '最も動く個体');
  $('oldest').onclick = () => { const count = new Map(); for (const o of w.bodies) for (const n of w.ancestors(o.id)) count.set(n.id, (count.get(n.id) || 0) + 1); pick(o => count.get(o.id) || 0, '最多の子孫'); rule = o => w.ancestors(o.id).length ? w.bodies.filter(b => w.ancestors(b.id).some(n => n.id === o.id)).length : 0; };
  $('follow').onclick = () => { follow = !follow && !!sel; $('follow').textContent = follow ? '追跡中' : '追跡'; if (follow) view.scale = Math.max(view.scale, 30); };
  const fresh = () => { start(); $('saveNote').textContent = $('auto').checked ? '新しい世界を始めた。次の自動保存で、前の自動保存は上書きされる。' : '新しい世界を始めた。'; if ($('auto').checked) lastSave = performance.now(); };
  $('restart').onclick = fresh;
  // every optional rule on, on the coast map, from primordial bodies
  $('allOn').onclick = () => { $('metamut').checked = false; $('mutsplit').checked = false; /* (how readily lineages mutate stays as the world sets it: for long observation) */ for (const r of A.rules.catalog) if(!['metamut','mutsplit','wave','vents','still'].includes(r.key)) $(r.key).checked = true; /* (the wave, the vents and still water are kinds of water, chosen separately) */ $('map').value = 'coast'; fresh(); $('saveNote').textContent = '選択式の規則を有効にして、沿岸の世界を原始個体から始めた（変異の強さの進化だけは入れていない。変異の起きやすさは一定）。'; };
  // Choosing another map moves the living population there (genomes, genealogy and records with it). 「最初から」 starts anew.
  $('map').onchange = () => { const n = w.bodies.length, map = $('map').value; if (!n) return fresh(); start(A.engine.World.transplant(w, map)); $('saveNote').textContent = 'いまの ' + n + ' 個体を、選んだ世界へ移した（遺伝子・系譜・記録ごと）。同じ相対位置に静止して降ろしたので、合わない場所に落ちた個体は死ぬ。原始個体からやり直すなら「最初から」。'; }; $('wave').onchange = () => { enableAll({ wave: $('wave').checked ? 1200 : 0 }); $('saveNote').textContent = 'いまの世界のまま、豊かさの波を' + ($('wave').checked ? '入れた。' : '止めた。') + 'ここから先は、変えなかった場合とは別の歴史になる。'; }; $('shore').onchange = () => { enableAll({ shore: $('shore').checked ? 24 : 0 }); $('saveNote').textContent = 'いまの世界のまま、海域の境界を' + ($('shore').checked ? 'なだらかにした。' : '段差に戻した。') + 'ここから先は、変えなかった場合とは別の歴史になる。'; };
  for (const k of [...A.rules.catalog.filter(r=>r.on===1).map(r=>r.key), 'deaf', 'mute']) $(k).onchange = () => {
    if (!$(k).checked) { // disabling a prerequisite disables its dependent rules, too
      const off=new Set([k]);let changed;
      do {changed=false;for(const r of A.rules.catalog)if(!off.has(r.key)&&r.requires.some(key=>off.has(key))){off.add(r.key);$(r.key).checked=false;changed=true;}}while(changed);
    }
    const rules=readRules();for(const r of A.rules.catalog)if(r.on===1){$(r.key).checked=!!rules[r.key];if(!!w[r.key]!==!!rules[r.key])enableAll({[r.key]:rules[r.key]});}
    if(k==='deaf'||k==='mute')enableAll({[k]:$(k).checked?1:0});
    lastPanels=0;$('saveNote').textContent='いまの世界のまま設定を変えた（記録は「進化の記録」に残る）。ここから先は、変えなかった場合とは別の歴史になる。';
  };
  $('fit').onclick = () => { fit(); follow = false; $('follow').textContent = '追跡'; };
  $('listen').onchange = async () => { if ($('listen').checked && !await audioStart()) $('listen').checked = false; }; $('vol').oninput = () => { if (AU.master) AU.master.gain.setTargetAtTime(Number($('vol').value), AU.ctx.currentTime, 0.02); }; $('audioTest').onclick = audioTest;
  $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? '再開' : '一時停止'; islandAll({ type: paused ? 'pause' : 'resume' }); };
  $('islands').onchange = () => { islandStart(Number($('islands').value)); if (ISL.ws.length) $('saveNote').textContent = '島を ' + (ISL.ws.length + 1) + ' 個にした。増えた島は、いま見ている世界の複製を乱数だけ変えて始めた。'; };
  $('founder').onchange = () => { if ($('founder').value === 'file') $('file').click(); else { loaded = null; start(); } };
  $('file').onchange = async e => { loaded = JSON.parse(await e.target.files[0].text()); start(); };
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
  $('save').onclick = async () => { try { const blobs = await worldBlobs(), k = blobs.length, out = k > 1 ? pack(blobs) : blobs[0], zipped = out.type === 'application/gzip', a = document.createElement('a'); a.href = URL.createObjectURL(out); a.download = (k > 1 ? 'alife2-islands' + k : 'alife2-world') + '-t' + Math.round(w.t) + (k > 1 ? '.alife2' : zipped ? '.json.gz' : '.json'); a.click(); $('saveNote').textContent = '保存した（' + (k > 1 ? '島 ' + k + ' 個を 1 つのファイルに、' : '') + mb(out.size) + (zipped || k > 1 ? '、圧縮済み' : '') + '）。'; } catch (err) { $('saveNote').textContent = '保存できない：' + (err && err.message || err); } };
  $('load').onclick = () => $('loadFile').click();
  $('loadFile').onchange = async e => { try { const file = e.target.files[0], set = await isPack(file) ? await unpack(file) : null, text = set ? null : await blobText(file); const want = {}, names = Object.fromEntries(A.rules.catalog.map(r=>[r.key,r.label])); for (const r of A.rules.catalog) if ($(r.key).checked) want[r.key] = r.on;for(const [k,v] of Object.entries(A.rules.normalize(want)))if(v)want[k]=v; // boxes ticked before loading are applied to the loaded world
      const kk = set ? await openSet(set) : openSaved(text), added = Object.keys(want).filter(k => !w[k]); enableAll(want); for (const k in names) $(k).checked = !!w[k];
      $('saveNote').textContent = '読み込んだ（' + Math.round(w.t) + ' 秒時点、' + w.bodies.length + ' 個体' + (kk > 1 ? '、島 ' + kk + ' 個' : '') + '）。' + (added.length ? 'チェックしてあった設定をこの世界に足した：' + added.map(k => names[k]).join('、') + '。ここから先は元の世界とは別の歴史になる。' : '設定と地図はこの世界が保存されたときのもの。視覚や匂いはチェックを入れれば、沿岸などへは「世界」の欄で選べば、いまの個体のまま移せる。'); } catch (err) { $('saveNote').textContent = '読み込めない：' + err.message; } };
  $('resume').onclick = async () => { try { let d = await dbGet('autosave'); if (d == null) d = localStorage.getItem(KEY); if (d == null) { $('saveNote').textContent = '自動保存は無い。'; return; } if (d.worlds) await openSet(d.worlds); else openSaved(typeof d === 'string' ? d : await blobText(d)); $('saveNote').textContent = '自動保存から再開（' + Math.round(w.t) + ' 秒時点、' + w.bodies.length + ' 個体）。'; } catch (err) { $('saveNote').textContent = '再開できない：' + (err && err.message || err); } };
  $('introduce').onclick = async () => {
    const button = $('introduce'); button.disabled = true;
    try {
      const file = $('introFile').files[0]; if (!file) throw new Error('遺伝子 JSON を選んでください');
      if (file.size > 2 * 1024 * 1024) throw new Error('遺伝子ファイルは 2 MB 以下にしてください');
      const target = w, data = JSON.parse(await file.text());
      if (w !== target) throw new Error('表示中の島が変わりました。もう一度投入してください');
      const got = w.introduce(data, { count: Number($('introCount').value), place: $('introPlace').value, age: $('introAge').value, center: { x: view.cx, y: view.cy } });
      sel = got[0]; shown = null; lastPanels = 0;
      $('introNote').textContent = got.length + ' 匹を人為的に投入した。投入系統 ' + sel.introduction.root + '（元の世界 seed ' + sel.introduction.seed + '、' + sel.introduction.t.toFixed(1) + ' 秒）。' + (data.format==='alife2-specimen-1' ? ' 探索時の規則は記録し、生態系の現在の設定は維持した。' : '');
    } catch (e) { $('introNote').textContent = '投入できない：' + e.message; }
    finally { button.disabled = false; }
  };
  $('csv').onclick = () => { const rows = ['id,parent,line,generation,born,died,cause,segments,mouths,eye,working_joint,adult_volume,children,mutations,introduction_seed,introduction_root,introduction_time']; for (const n of w.tree.values()) rows.push([n.id, n.parent, n.line, n.gen, Math.round(n.born), n.died == null ? '' : Math.round(n.died), n.cause || '', ...n.kind.split('/'), n.V.toFixed(3), n.kids, n.g ? n.g.mutations : n.mut == null ? '' : n.mut, n.introduction ? n.introduction.seed : '', n.introduction ? n.introduction.root : '', n.introduction ? n.introduction.t : ''].join(',')); download('alife2-lineage-t' + Math.round(w.t) + '.csv', rows.join('\n'), 'text/csv'); };
  $('rank').onchange = $('lostFilter').onchange = () => { lastPanels = 0; };
  // The choice to save automatically is remembered. With it on, opening the page again (a forced reload included)
  // carries on from the last automatic save instead of starting a new world.
  const AUTO = 'alife2_autosave_on';
  $('auto').onchange = () => { try { localStorage.setItem(AUTO, $('auto').checked ? '1' : '0'); } catch (e) {} if ($('auto').checked) { lastSave = performance.now(); autosave(); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden && $('auto').checked) autosave(); }); // also when the tab is left

  // A hidden tab gets no animation frames. A small thread then gives the beat, so the world goes on (more slowly) while nobody looks.
  const BG = 'alife2_background_on'; try { if (localStorage.getItem(BG) === '0') $('bg').checked = false; } catch (e) {}
  const KD = 'alife2_keep_detail'; if ($('keepDetail')) { try { if (localStorage.getItem(KD) === '1') $('keepDetail').checked = true; } catch (e) {} $('keepDetail').onchange = () => { try { localStorage.setItem(KD, $('keepDetail').checked ? '1' : '0'); } catch (e) {} }; }
  $('bg').onchange = () => { try { localStorage.setItem(BG, $('bg').checked ? '1' : '0'); } catch (e) {} };
  try {
    const beat = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 100)'], { type: 'text/javascript' })));
    beat.onmessage = () => { if (document.hidden && document.body.dataset.ready) runlogTick(true); if (!document.hidden || paused || ISL.busy || !w || !$('bg').checked || !document.body.dataset.ready) return; const t0 = performance.now(); let tS = t0; do { advance(); const tN = performance.now(), d = tN - tS; tS = tN; RL.steps++; RL.stepMs += d; if (d > RL.stepMax) RL.stepMax = d; } while (tS - t0 < 60); const ms = performance.now(); if ($('auto').checked && ms - lastSave > 120000) { lastSave = ms; autosave(); } };
  } catch (e) {}
  if (q.get('seed')) $('seed').value = q.get('seed');
  if (q.has('map')) $('map').value = q.get('map') === 'tank' ? '' : q.get('map'); // ?map=tank opens the small tank
  (async () => {
    if (!loaded && q.get('load')) loaded = await (await fetch(q.get('load'))).json().catch(() => null);
    let resumed = false;
    // The mark above only sees a reload of the same tab. A frozen tab is often closed and the page opened anew: the record of the run tells that
    // too. The last run was not closed while answering, and wrote its last line more than 45 s ago (so it is not a page still open in another tab).
    RL.before = runlogRuns(); { const pr = RL.before[RL.before.length - 1], l = pr && runlogLast(pr); if (pr && !pr.clean && !discarded && l && Date.now() - l[0] > 45000) unclean = true; }
    try {
      if (localStorage.getItem(AUTO) === '1' && !q.get('fresh') && !q.get('t') && !loaded) {
        $('auto').checked = true; const d = await dbGet('autosave');
        // The last time this tab had the page open, did it end without answering (a hang, a crash)? Then the autosaved world is not started again by itself:
        // if it is what stopped the page, every reload would stop it again. It is kept as it is (autosave is switched off for now, so that it is not written
        // over), and can be written to a file for finding the cause, or started all the same.
        if (d != null && unclean) { $('auto').checked = false; const bar = document.createElement('div'); bar.id = 'unclean'; bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:98;background:#5a4a10;color:#fff;padding:8px 10px;font-size:13px';
          const say = t => { bar.firstChild.textContent = t; }, btn = (label, f) => { const x = document.createElement('button'); x.textContent = label; x.style.marginLeft = '8px'; x.onclick = f; bar.append(x); };
          bar.append(document.createTextNode('前回、このページは応答しないまま終わりました（固まった、落ちた、またはブラウザごと終了した）。同じことを繰り返さないよう、自動保存の世界は再開せず、新しい世界を始めています。自動保存はそのまま残してあり、いまは上書きしません。'));
          btn('自動保存をファイルに書き出す（原因を調べるため）', async () => { try { const blob = d.worlds ? pack(d.worlds) : typeof d === 'string' ? new Blob([d], { type: 'application/json' }) : d, a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = d.worlds ? 'alife2-autosave-islands.alife2' : 'alife2-autosave.json.gz'; a2.click(); say('書き出しました。このファイルを知らせてください。'); } catch (e) { say('書き出せなかった：' + (e && e.message || e)); } });
          btn('それでも自動保存から再開する', async () => { bar.remove(); try { if (d.worlds) await openSet(d.worlds); else openSaved(typeof d === 'string' ? d : await blobText(d)); $('auto').checked = true; } catch (e) { fault('自動保存の再開', e); } });
          btn('運転の記録を書き出す', () => download('alife2-runlog.txt', runlogText(), 'text/plain'));
          btn('閉じる（新しい世界のまま）', () => bar.remove()); document.body.append(bar);
          { const pr = RL.before[RL.before.length - 1]; if (pr && !pr.clean) { const x = document.createElement('div'); x.style.cssText = 'margin-top:4px;opacity:.9'; x.textContent = 'そのときの運転の記録：' + runlogSay(pr) + '。'; bar.append(x); } } }
        else if (d != null) { if (d.worlds) await openSet(d.worlds); else openSaved(typeof d === 'string' ? d : await blobText(d)); resumed = true; $('saveNote').textContent = '自動保存から再開した（' + Math.round(w.t) + ' 秒時点、' + w.bodies.length + ' 個体）。' + (discarded ? 'ブラウザがこのタブを休止させていた（固まったのではない）。そのあいだ世界は止まっていた。' : '') + '新しい世界を始めるには「最初から」。'; document.querySelector('details:has(#save)').open = true; }
      }
    } catch (e) { $('saveNote').textContent = '自動保存を読めなかったので新しい世界を始めた：' + (e && e.message || e); }
    if (!resumed) start();
    const pre = Number(q.get('t') || 0); for (let i = 0; i < pre * 30; i++) w.step();
    if (q.get('zoom')) { view.scale = Number(q.get('zoom')); const o = w.bodies.slice().sort((a, b) => b.full.segs - a.full.segs)[0]; if (o) { view.cx = o.cx; view.cy = o.cy; select(o); } }
    runlogStart();
    if ($('runlog')) { $('runlog').onclick = () => download('alife2-runlog.txt', runlogText(), 'text/plain'); const pr = RL.before[RL.before.length - 1];
      $('runlogNote').textContent = '運転の記録：ページの様子（世界の時刻、個体数、コマ数、1 刻みと描画の時間、メモリ、GPU の状態）を 10 秒ごとにこの端末に書き残している（最近 5 回ぶん）。固まったあとでも、開き直せば書き出せる。' + (pr ? '前回の運転：' + runlogSay(pr) + '。' + (pr.clean ? '応答したまま閉じた。' : discarded ? 'ブラウザがタブを休止させて終わった。' : '応答しないまま終わった。') : ''); }
    window.ALIFE2_WORLD = { get w() { return w; }, get sel() { return sel; }, get view() { return view; }, select, get runlog() { return RL; } }; document.body.dataset.ready = '1'; requestAnimationFrame(loop);
  })();
})();
