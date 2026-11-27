// Human-facing notebook. All controls affect observation or the camera only.
(function (G) {
  'use strict';
  const A = G.ALIFE2, $ = id => document.getElementById(id);
  let world = null, book = null, jump = null, stop = null, seen = 0, lastSpeech = -Infinity, lastSnapshot = -Infinity, snapshots = [], tracked = null;
  const download = (name, value, type = 'application/json') => { const url = URL.createObjectURL(new Blob([value], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  function bind(w, select, stopFollowing) {
    if (book) book.onEvent = null;
    world = w; book = A.observer.attach(w); jump = select; stop = stopFollowing; seen = book.seq; tracked = null; A.observerUI.lastSelected = null; snapshots = []; lastSnapshot = -Infinity;
    $('observerOn').checked = book.enabled; $('observerSpeech').checked = false; $('observerSnapshot').checked = false;
    book.onEvent = e => {
      if (!e.important || !$('observerSnapshot').checked || performance.now()-lastSnapshot < 60000) return;
      try { const text = JSON.stringify(A.observer.saveWorld(world)); snapshots.push({ event: e, text }); if (snapshots.length > 2) snapshots.shift(); lastSnapshot = performance.now(); }
      catch (err) { $('observerNotice').textContent = 'スナップショット失敗：' + err.message; }
    };
    if (G.speechSynthesis) G.speechSynthesis.cancel(); render();
  }
  function follow(target) {
    if (target !== tracked) A.observerUI.lastSelected = null; tracked = target;
    const b = world.bodies.find(b => b.id === target.id) || world.bodies.find(b => b.clade === target.clade) || world.bodies.find(b => b.line === target.line);
    $('observerTrack').textContent = b ? `#${b.id}／系統${b.line}を追跡中` : 'この島に生存する対象・同体制・同系統はありません。';
    if (b && b.id !== A.observerUI.lastSelected) { jump(b); A.observerUI.lastSelected = b.id; }
  }
  function render() {
    if (!book) return;
    const z = book.window(Number($('observerWindow').value));
    $('observerSummary').textContent = z ? `${world.t.toFixed(0)}秒／現存${world.bodies.length}匹／集計時点${z.to.toFixed(0)}秒／平均世代${z.b.gen.toFixed(1)}／平均体節${z.b.seg.toFixed(2)}。観測${book.enabled ? '中' : '停止中（表示は最終観測）'}。` : '観測を準備中';
    if (z) {
      const c = z.counts;
      $('observerBalance').textContent = `${z.complete ? '直近' : '履歴蓄積中：観測済み'}${z.elapsed.toFixed(1)}秒：${z.start}→${z.end}匹（${z.delta >= 0 ? '+' : ''}${z.delta}）\n出生+${c.births}／餓死−${c.starved}／老衰−${c.aged}／傷−${c.killed}／物理破綻−${c.broken}\n移入+${c.arrived}／移出−${c.left}／人為投入+${c.introduced}／その他始祖+${c.founders}\n収支差分 ${z.residual}（0で整合）。死産${(z.b.counts.stillborn || 0) - (z.a.counts.stillborn || 0)}・上限不成立${(z.b.counts.blocked || 0) - (z.a.counts.blocked || 0)}は生存個体に算入しない。`;
      $('observerRegions').textContent = z.regions.map(r => { const c = r.counts; return `${r.name}：${r.start}→${r.end}匹／出生+${c.births} 餓死−${c.starved} 老衰−${c.aged} 傷−${c.killed} 物理破綻−${c.broken} 海域流入+${c.in} 流出−${c.out} 島移入+${c.arrived} 移出−${c.left} 人為+${c.introduced} 始祖+${c.founders}／収支差${r.residual}`; }).join('\n');
      const canvas = $('observerChart'), ctx = canvas.getContext('2d'), samples = book.samples.filter(s => s.segment === z.b.segment && s.t >= z.from);
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#8fd0ff'; ctx.font = '12px sans-serif';
      const max = Math.max(1, ...samples.map(s => s.n)); ctx.fillText(`個体数 0〜${max}／${z.from.toFixed(0)}〜${z.to.toFixed(0)}秒`, 8, 16);
      ctx.strokeStyle = '#8fd0ff'; ctx.beginPath(); samples.forEach((s, i) => { const x = 8 + (s.t-z.from)/Math.max(1,z.elapsed)*(canvas.width-16), y = canvas.height-8-s.n/max*(canvas.height-36); i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }); ctx.stroke();
      const groups = $('observerGroups'); groups.replaceChildren();
      for (const [field, title] of [['lines', '系統'], ['kinds', '形態']]) for (const [id, g] of Object.entries(z.b[field]).sort((a,b)=>b[1].n-a[1].n).slice(0,6)) {
        const b = document.createElement('button'), old = z.a[field][id]; b.textContent = `${title}${field === 'kinds' ? A.observer.kindText(id) : '#' + id}：${old ? old.n : '?'}→${g.n}匹`; b.onclick = () => follow(g.target); groups.append(b);
      }
    }
    const stories = book.events.filter(e => e.key.startsWith('story-'));
    const renderEvents = (list, events, narrative) => {
      list.replaceChildren();
      for (const e of events.slice(narrative ? -8 : -24).reverse()) {
        const article = document.createElement('article'); article.style.cssText = 'border-top:1px solid #294254;padding:10px 0';
        const title = document.createElement(e.target ? 'button' : 'strong');
        title.textContent = `${e.t.toFixed(0)}秒 ${narrative ? '' : '【'+e.level+'】'}${e.title}`; if (e.target) title.onclick = () => follow(e.target);
        const body = document.createElement('div'); body.textContent = e.text;
        const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
        summary.textContent = '数値根拠・説明の限界'; pre.textContent = JSON.stringify(e.evidence, null, 2); pre.style.whiteSpace = 'pre-wrap';
        details.append(summary, pre); article.append(title, body, details); list.append(article);
      }
    };
    renderEvents($('observerEvents'), stories, true);
    renderEvents($('observerSignals'), book.events.filter(e=>!e.key.startsWith('story-')), false);
    if (!stories.length) $('observerEvents').textContent = '世界の流れを観測中。最初の1分が揃ったら、全体の増減と注目する系統を実況します。';
    $('observerQuiet').textContent = book.enabled && book.story.lastAt > (book.story.report?.t ?? book.story.lastAt) ? '大きな変化はありません。数値の観測だけを続けています。' : '';
    const ex = book.extinctions; $('observerExtinct').textContent = `観測中の体制消失${ex.total}件（累計1〜2匹${ex.small}件）、移出のみ${ex.departures}件。実況履歴は直近300件、時系列は約1000秒、各時点の系統・形態は上位96件（欠測は?）。`;
    const fresh = book.events.filter(e => e.id > seen && typeof e.spoken === 'string' && e.spoken.length > 0); seen = book.seq;
    if (fresh.length) {
      const e = fresh.at(-1), now = performance.now();
      if ($('observerSpeech').checked && G.speechSynthesis && now-lastSpeech >= 30000 && !speechSynthesis.speaking) { const u = new SpeechSynthesisUtterance(e.spoken); u.lang = 'ja-JP'; speechSynthesis.speak(u); lastSpeech = now; }

    }
    $('observerSnapshotSave').disabled = !snapshots.length;
    if (tracked) follow(tracked);
  }
  $('observerOn').onchange = () => { book.setEnabled($('observerOn').checked); G.dispatchEvent(new CustomEvent('alife2-observer-toggle', { detail: book.enabled })); render(); };
  $('observerWindow').onchange = render;
  $('observerSpeech').onchange = () => { if (!$('observerSpeech').checked && G.speechSynthesis) speechSynthesis.cancel(); if (!G.speechSynthesis) $('observerNotice').textContent = 'このブラウザは読み上げに対応していません。'; };
  $('observerJSON').onclick = () => download('alife2-observer.json', JSON.stringify(book.save(world)));
  $('observerText').onclick = () => download('alife2-observer.txt', book.text(), 'text/plain;charset=utf-8');
  $('observerImport').onchange = async e => { try { const file = e.target.files[0]; if (!file) return; if (file.size > 33554432) throw new Error('履歴JSONは32MBまでです'); const d = JSON.parse(await file.text()); if (d.format !== 'alife2-observer-1' || !Array.isArray(d.events)) throw new Error('観測履歴JSONではありません'); if (!book.restore(world, d)) throw new Error('現在の世界・乱数・時刻と一致しません。対応する世界を読み込み、一時停止してから復元してください。'); seen = book.seq; $('observerOn').checked = book.enabled; $('observerNotice').textContent = '観測履歴を復元しました。'; render(); } catch (err) { $('observerNotice').textContent = err.message; } };
  $('observerSnapshotSave').onclick = () => { const s = snapshots.at(-1); if (s) download('alife2-event-t' + Math.round(s.event.t) + '.json', s.text); };
  const clearTrack = () => { tracked = null; $('observerTrack').textContent = ''; };
  $('observerUntrack').onclick = () => { clearTrack(); if (stop) stop(); };
  A.observerUI = { bind, render, clearTrack };
})(globalThis);
