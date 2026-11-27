// A separate notebook. No random calls, simulation setters, genome development or census calls.
(function (G) {
  'use strict';
  const A = G.ALIFE2 = G.ALIFE2 || {}, books = new WeakMap();
  const FLOW = ['births', 'starved', 'aged', 'killed', 'broken', 'arrived', 'left', 'introduced', 'founders', 'in', 'out'];
  const CAUSE = { starved: '餓死', aged: '老衰', killed: '傷', broken: '物理破綻' };
  const copy = x => JSON.parse(JSON.stringify(x)), zero = () => Object.fromEntries(FLOW.map(k => [k, 0]));
  const diff = (a, b) => Object.fromEntries(FLOW.map(k => [k, (a[k] || 0) - (b[k] || 0)]));
  const net = c => c.births + c.arrived + c.introduced + c.founders + c.in - c.out - c.left - c.starved - c.aged - c.killed - c.broken;
  const identity = w => JSON.stringify([w.map, w.counts, A.rules.catalog.map(r=>w[r.key]), w.bodies.map(b=>[b.id,b.line,b.gen,b.kind,b.cx,b.cy,b.E,b.stage])]);
  const kindText = k => { const [s, m, e, j, c] = k.split('/'); return `${s}体節・口${m}${e === '1' ? '・眼' : ''}${j === '1' ? '・関節' : ''}${c === '1' ? '・繊毛' : ''}`; };
  class Notebook {
    constructor() {
      this.enabled = true; this.samples = []; this.events = []; this.cooldowns = {}; this.records = {};
      this.regions = []; this.positions = new Map(); this.seq = 0; this.segment = 0; this.lastAnalysis = -Infinity;
      this.extinctions = { total: 0, small: 0, departures: 0 }; this.ended = new Set(); this.bodyHistory = new Map();
    }
    baseline(w) {
      this.segment++; this.positions.clear(); this.bodyHistory.clear(); this.regions = (w.regions || [{ name: '水槽' }]).map(r => ({ name: r.name, counts: zero() }));
      for (const b of w.bodies) this.positions.set(b.id, this.region(w, b));
      // Existing or unobserved extinctions are history, not newly observed events.
      for (const c of w.clades.values()) if (c.ended != null) this.ended.add(c.id);
      this.lastAnalysis = w.t; this.sample(w, true);
    }
    region(w, b) { return w.regions ? w.regionAt(b.cx) : 0; }
    add(w, b, type) { if (!this.enabled) return; const r = this.region(w, b); this.positions.set(b.id, r); this.regions[r].counts[type]++; }
    moved(w, b) {
      const to = this.region(w, b), from = this.positions.get(b.id);
      if (from != null && from !== to) { this.regions[from].counts.out++; this.regions[to].counts.in++; }
      this.positions.set(b.id, to); return to;
    }
    tick(w, before) {
      if (!this.enabled) return;
      // before is the engine's old array, including births made in this tick and bodies just filtered as dead.
      for (const b of before) {
        const r = this.moved(w, b);
        if (b.dead) { if (CAUSE[b.dead]) this.regions[r].counts[b.dead]++; this.positions.delete(b.id); }
      }
      if (!this.samples.length || w.t - this.samples.at(-1).t >= 2 - 1e-8) this.sample(w);
    }
    emit(t, key, title, text, evidence = {}, target = null, level = '観測事実', important = false, interval = 300) {
      if (this.cooldowns[key] != null && t - this.cooldowns[key] < interval) return;
      this.cooldowns[key] = t;
      this.events.push({ id: ++this.seq, t, key, title, text, evidence, target, level, important });
      if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
      if (this.onEvent) this.onEvent(this.events.at(-1));
      // Bounded even during a very long run with constantly changing clades.
      if (Object.keys(this.cooldowns).length > 2000) for (const k of Object.keys(this.cooldowns)) if (t - this.cooldowns[k] > 1000) delete this.cooldowns[k];
    }
    sample(w, force = false) {
      const lines = {}, kinds = {}, clades = {}, regions = this.regions.map(r => ({ name: r.name, n: 0, counts: { ...r.counts } }));
      let seg = 0, gen = 0, active = 0, vision = 0, hearing = 0, voiced = 0, learned = 0; const behaviour = [];
      for (const b of w.bodies) {
        regions[this.region(w, b)].n++; seg += b.full.segs; gen += b.gen;
        const target = { id: b.id, line: b.line, clade: b.clade, kind: b.kind };
        for (const [map, key] of [[lines, b.line], [kinds, b.kind], [clades, b.clade]]) {
          const g = map[key] || (map[key] = { n: 0, minGen: b.gen, maxGen: b.gen, kids: 0, target, introduced: false });
          g.n++; g.minGen = Math.min(g.minGen, b.gen); g.maxGen = Math.max(g.maxGen, b.gen); g.kids += b.kids;
          g.introduced ||= !!b.introduction || !!w.tree.get(b.id)?.from || !!w.tree.get(b.line)?.from || !['evolved', 'primordial'].includes(b.g.origin);
        }
        // These are simultaneous measurements, not a claim that a particular input caused a movement.
        let v = false, h = false, l = false;
        for (const s of b.b.segs) {
          v ||= !!w.vision && Math.abs(s.v || 0) > 0.01 && (Math.abs(s.p.vE || 0) > 0.01 || !!s.p.nn?.some(n => n.out.length && n.in.some(e => e[0] === 'v' && Math.abs(e[1]) > 0.01)));
          h ||= !!w.sound && !w.deaf && (b.b.hd || 0) > 0.05;
          if (s.nw && !l) { const weights = (s.p.nn || []).flatMap(n => n.in.map(e => e[1])); l = s.nw.some((x, i) => Math.abs(x - weights[i]) > 0.01); }
        }
        active += (b.b.nerveUse || 0) > 0.01 ? 1 : 0; vision += +v; hearing += +h; learned += +l; voiced += (b.voL || 0) > 0.01 ? 1 : 0;
        const prev = this.bodyHistory.get(b.id);
        if (prev && w.t > prev.t && b.path - prev.path >= 1 && b.eaten - prev.eaten > 0.01) behaviour.push({ target, path: b.path-prev.path, eaten: b.eaten-prev.eaten, elapsed: w.t-prev.t });
        this.bodyHistory.set(b.id, { t: w.t, path: b.path, eaten: b.eaten });
      }
      for (const id of this.bodyHistory.keys()) if (!this.positions.has(id)) this.bodyHistory.delete(id);
      // Group histories are bounded. Missing historical groups are unknown, never interpreted as zero.
      const cap = map => Object.fromEntries(Object.entries(map).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0])).slice(0, 96));
      const s = { t: w.t, tick: w.tick, segment: this.segment, n: w.bodies.length, counts: { ...zero(), ...w.counts, founders: this.regions.reduce((n,r)=>n+r.counts.founders,0) }, regions, behaviour: behaviour.slice(0, 3),
        lines: cap(lines), kinds: cap(kinds), clades: cap(clades), gen: w.bodies.length ? gen / w.bodies.length : 0,
        seg: w.bodies.length ? seg / w.bodies.length : 0, activity: { active, vision, hearing, voiced, learned } };
      // Past comparisons only need population and generation. Do not repeat target metadata 500 times.
      const prev = this.samples.at(-1);
      if (prev) for (const field of ['lines', 'kinds', 'clades']) for (const id of Object.keys(prev[field])) { const g = prev[field][id]; prev[field][id] = { n: g.n, maxGen: g.maxGen }; }
      this.samples.push(s); while (this.samples.length > 502) this.samples.shift();
      if (force || w.t - this.lastAnalysis < 10 - 1e-8) return;
      this.lastAnalysis = w.t; this.analyse(w, s);
    }
    window(seconds) {
      const b = this.samples.at(-1); if (!b) return null;
      const same = this.samples.filter(s => s.segment === b.segment), a = same.find(s => s.t >= b.t - seconds - 1e-7) || b;
      const c = diff(b.counts, a.counts), delta = b.n - a.n;
      return { seconds, elapsed: b.t - a.t, complete: b.t - a.t >= seconds - 1e-5, from: a.t, to: b.t, start: a.n, end: b.n, delta, counts: c,
        residual: delta - net(c), regions: b.regions.map((r, i) => { const p = a.regions[i], c = diff(r.counts, p.counts); return { name: r.name, start: p.n, end: r.n, delta: r.n - p.n, counts: c, residual: r.n - p.n - net(c) }; }), a, b };
    }
    analyse(w, s) {
      for (const seconds of [60, 300, 1000]) {
        const z = this.window(seconds); if (!z.complete || z.residual !== 0) continue;
        if (Math.abs(z.delta) >= Math.max(5, z.start * 0.15)) {
          const deaths = Object.keys(CAUSE).map(k => [k, z.counts[k]]).sort((a, b) => b[1] - a[1]);
          const deathText = deaths[0][1] > 0 ? `記録上の最多死因は${CAUSE[deaths[0][0]]}${deaths[0][1]}匹。` : 'この期間に死亡の記録はない。';
          this.emit(w.t, 'population-' + seconds + '-' + Math.sign(z.delta), z.delta > 0 ? '個体数が増加' : '個体数が減少',
            `直近${z.elapsed.toFixed(0)}秒：${z.start}→${z.end}匹。出生${z.counts.births}、死亡${deaths.reduce((n, d) => n + d[1], 0)}、移入${z.counts.arrived}、移出${z.counts.left}、人為投入${z.counts.introduced}、その他始祖${z.counts.founders}。${deathText}死因の背景は未検証。`, { ...z.counts, delta: z.delta, elapsed: z.elapsed, residual: 0 }, null, '観測事実', true);
        }
        if (seconds !== 60) continue;
        for (const [field, label] of [['lines', '系統'], ['kinds', '形態']]) for (const [id, g] of Object.entries(s[field])) {
          const old = z.a[field][id]; if (!old) continue;
          if (Math.abs(g.n - old.n) >= 5 && (g.n >= old.n * 1.5 || g.n <= old.n * 0.5)) this.emit(w.t, field + id + (g.n > old.n ? '+' : '-'), `${label}が${g.n > old.n ? '増加' : '減少'}`,
            `${field === 'kinds' ? kindText(id) : '#' + id}：${old.n}→${g.n}匹／${z.elapsed.toFixed(0)}秒。${g.introduced ? '投入・移入由来を含む。' : ''}増減と形態の因果関係は未検証。出生だけで適応の成功とは判定しない。`, { start: old.n, end: g.n, elapsed: z.elapsed }, g.target, '観測事実', true);
        }
        for (const [id, g] of Object.entries(s.clades)) {
          const old = z.a.clades[id], cl = w.clades.get(Number(id));
          if (old && cl && !cl.arrived && !g.introduced && g.n >= 3 && cl.genMax - cl.gen0 >= 2 && g.maxGen > old.maxGen) this.emit(w.t, 'established-' + id, '同じ体制が世代を越えて存続',
            `${kindText(cl.kind)}：記録上${cl.genMax - cl.gen0 + 1}世代、累計${cl.members}匹、現存${g.n}匹、${(w.t - cl.born).toFixed(0)}秒。直近60秒の観測でも存続。将来の定着や優位性は未確定。`, { generations: cl.genMax - cl.gen0 + 1, members: cl.members, alive: g.n, duration: w.t - cl.born }, g.target, '観測事実', true, Infinity);
        }
      }
      // Establish baseline records silently. A long-lived loaded world did not just set a new record.
      for (const [key, value, label] of [['population', s.n, '個体数'], ['segments', Math.max(0, ...w.bodies.map(b => b.full.segs)), '現存個体の最大体節数'], ['generation', Math.max(0, ...w.bodies.map(b => b.gen)), '現存個体の最大世代']]) {
        const prev = this.records[key]; this.records[key] = Math.max(prev || 0, value);
        if (prev != null && value > prev) this.emit(w.t, 'record-' + key, '観測開始後の記録更新', `${label}：${prev}→${value}。複雑さや出生世代数だけでは成功とは判定できない。`, { previous: prev, value }, null, '観測事実', true, 60);
      }
      const rare = Object.entries(s.kinds).filter(([k, g]) => g.n <= 2 && s.n >= 20 && k.split('/').slice(2, 4).includes('1'));
      for (const [k, g] of rare.slice(0, 2)) this.emit(w.t, 'rare-' + k, '珍しい構造の候補', `${kindText(k)}：現存${g.n}/${s.n}匹。観測時点で少数。生存・繁殖・世代継承の成功は未判定。`, { n: g.n, population: s.n }, g.target, '観測事実', false, 1000);
      if (s.activity.active > 0) this.emit(w.t, 'activity', '実際の回路出力を観測', `累積回路出力の寄与が0.01を超えた現存個体${s.activity.active}/${s.n}匹。視覚入力と配線を同時観測${s.activity.vision}匹、発声中${s.activity.voiced}匹、結合重みの変化${s.activity.learned}匹。学習の有益性や感覚の因果的利用は未検証。`, s.activity, null, '相関', false, 300);
      if (s.behaviour?.length) { const b = s.behaviour[0]; this.emit(w.t, 'behaviour', '移動と摂食を同時観測', `#${b.target.id}：${b.elapsed.toFixed(1)}秒に自力移動距離${b.path.toFixed(2)}、口からの摂取量${b.eaten.toFixed(3)}。移動が摂食を助けたかは未検証。`, b, b.target, '相関', false, 300); }
      if (w.sound) {
        const c = w.soundCensus();
        if (c.callsEnded >= 25) this.emit(w.t, 'calls', '発声を繰り返し観測', `減衰集計の最近の鳴き声${Math.round(c.callsEnded)}回、鳴き声の形${c.callShapes || 0}種類。通信の成立・意味・生存上の利益は未検証。`, { calls: c.callsEnded, shapes: c.callShapes || 0 }, null, '観測事実');
        if (c.lisN >= 25 && c.lisBodies >= 6 && c.callers >= 3 && Math.abs(c.lisEffect) > 0) this.emit(w.t, 'voice-response', '鳴き声と行動変化の関連候補', `${c.lisOf}：差${c.lisRaw.toFixed(3)}、標準化差${c.lisEffect.toFixed(2)}、聞き手${c.lisBodies}匹・${Math.round(c.lisN)}例・鳴き手${c.callers}匹。通信や因果的効果は未確定。`, { effect: c.lisEffect, difference: c.lisRaw, n: c.lisN, bodies: c.lisBodies, callers: c.callers, control: c.lisControl }, null, '相関');
      }
      let ended = 0, small = 0, departures = 0;
      for (const c of w.clades.values()) {
        if (c.ended == null || this.ended.has(c.id)) continue;
        this.ended.add(c.id); if (c.ended < this.samples[0].t) continue;
        if ((c.causes.left || 0) === c.dead) { departures++; continue; }
        ended++; if (c.members <= 2) small++;
        if (c.members >= 20 && c.genMax - c.gen0 >= 2) this.emit(w.t, 'extinct-' + c.id, '複数世代続いた体制がこの島で消失', `${kindText(c.kind)}：累計${c.members}匹、${c.genMax - c.gen0 + 1}世代、${(c.ended - c.born).toFixed(0)}秒。移出${c.causes.left || 0}匹を含む。絶えた背景や他島での存続は未確認。`, { members: c.members, generations: c.genMax - c.gen0 + 1, duration: c.ended - c.born, causes: { ...c.causes } }, { id: c.id, line: c.line, clade: c.id, kind: c.kind }, '観測事実', true, Infinity);
      }
      this.extinctions.total += ended; this.extinctions.small += small; this.extinctions.departures += departures;
      if (ended || departures) this.emit(w.t, 'extinction-summary', '体制の消失を集約', `観測中の累計：死亡を含む消失${this.extinctions.total}件（累計1〜2匹の体制${this.extinctions.small}件）、移出だけの消失${this.extinctions.departures}件。細かな絶滅ログは元の記録に保持。`, { ...this.extinctions }, null, '観測事実', false, 300);
      if (this.ended.size > 6000) this.ended = new Set([...w.clades.values()].filter(c => c.ended != null).map(c => c.id));
    }
    save(w) { return copy({ format: 'alife2-observer-1', seed: w.seed, t: w.t, tick: w.tick, nextId: w.nextId, rng: w.rand.state(), identity: identity(w), enabled: this.enabled, samples: this.samples, events: this.events, cooldowns: this.cooldowns, records: this.records, regions: this.regions, seq: this.seq, segment: this.segment, lastAnalysis: this.lastAnalysis, extinctions: this.extinctions, ended: [...this.ended], bodyHistory: [...this.bodyHistory] }); }
    restore(w, saved) {
      if (!saved || saved.format !== 'alife2-observer-1' || saved.seed !== w.seed || saved.tick !== w.tick || saved.nextId !== w.nextId || Math.abs(saved.t-w.t) > 1e-7 || JSON.stringify(saved.rng) !== JSON.stringify(w.rand.state()) || saved.identity !== identity(w)) return false;
      if (!Array.isArray(saved.samples) || saved.samples.length > 502 || !Array.isArray(saved.events) || saved.events.length > 300 || !Array.isArray(saved.regions) || saved.regions.length !== this.regions.length || saved.samples.some(s => !Number.isFinite(s.t) || !s.counts || !Array.isArray(s.regions)) || saved.events.some(e => !Number.isSafeInteger(e.id) || !Number.isFinite(e.t) || typeof e.text !== 'string')) return false;
      for (const k of ['enabled', 'seq', 'segment', 'lastAnalysis', 'records', 'extinctions', 'regions', 'cooldowns']) if (saved[k] != null) this[k] = copy(saved[k]);
      this.samples = copy(saved.samples); this.events = copy(saved.events); this.ended = new Set(saved.ended || []); this.bodyHistory = new Map(saved.bodyHistory || []); return true;
    }
    text() { return this.events.map(e => `${e.t.toFixed(1)}秒【${e.level}】${e.title}：${e.text}`).join('\n'); }
  }
  function attach(w, saved) {
    if (books.has(w)) return books.get(w);
    const o = new Notebook(); books.set(w, o); o.baseline(w);
    if (saved) o.restore(w, saved);
    let context = 'founders';
    const step = w.step, spawn = w.spawn, emigrate = w.emigrate;
    w.step = function (...args) { if (!o.enabled) return step.apply(this, args); const before = this.bodies, result = step.apply(this, args); o.tick(this, before); return result; };
    w.spawn = function (...args) { const b = spawn.apply(this, args); o.add(this, b, args[4] ? 'births' : context); return b; };
    for (const [name, type] of [['introduce', 'introduced'], ['immigrate', 'arrived']]) { const fn = w[name]; w[name] = function (...args) { const prev = context; context = type; try { return fn.apply(this, args); } finally { context = prev; } }; }
    w.emigrate = function (...args) {
      const result = emigrate.apply(this, args);
      if (o.enabled) for (const x of result) { const r = o.positions.get(x.from.id); if (r != null) o.regions[r].counts.left++; o.positions.delete(x.from.id); }
      return result;
    };
    o.setEnabled = value => { if (!!value === o.enabled) return; o.enabled = !!value; if (o.enabled) { o.baseline(w); o.emit(w.t, 'gap-' + o.segment, '観測を再開', '停止中の経過は欠測。停止前との増減比較を分離した。', {}, null, '観測事実', false, 0); } };
    return o;
  }
  const saveWorld = w => { const d = w.save(), o = books.get(w); if (o) d.ecosystemObserver = o.save(w); return d; };
  const restoreWorld = d => { const w = A.engine.World.restore(d); attach(w, d.ecosystemObserver); return w; };
  A.observer = { Notebook, attach, get: w => books.get(w), saveWorld, restoreWorld, kindText, net };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
