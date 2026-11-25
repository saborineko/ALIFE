// ALIFE 2.0 — body designer for the laboratory.
//
// Turns a handful of human-readable measurements into a genome. It only writes
// genes: the body, its motion and its picture all come from the same
// development / physics / render code that evolved genomes will use.
// Everything made here is an ARTIFICIAL TEST GENOME, not a product of evolution.
(function (G) {
  'use strict';
  const A = G.ALIFE2 = G.ALIFE2 || {};
  if (typeof require !== 'undefined' && !A.genome) require('./alife2-genome.js');
  const { part, link, create, chainScale } = A.genome;
  const PI = Math.PI, TAU = PI * 2, D = PI / 180;

  // id, label, min, max, step, default, group
  const PARAMS = [
    ['radial', '放射対称（0=左右対称 1=放射）', 0, 1, 1, 0, '体制'],
    ['segments', '体節数', 1, 24, 1, 8, '体制'],
    ['length', '胴体の長さ', 1, 24, .25, 10, '胴体'],
    ['width', '胴体の幅', .4, 6, .1, 2, '胴体'],
    ['depth', '胴体の厚さ（幅比）', .15, 2.5, .05, .8, '胴体'],
    ['taper', '体節ごとの縮小率', .8, 1.1, .01, .96, '胴体'],
    ['swell', '胴体中央のふくらみ', -.4, 1.6, .05, .4, '胴体'],
    ['head', '頭部の比率', 0, 1.8, .05, .8, '頭部'],
    ['snout', '頭部先端の細さ', .15, 1, .05, .55, '頭部'],
    ['eyes', '感覚器（眼）', 0, 1, .05, .6, '頭部'],
    ['jaw', '口・顎', 0, 1, .05, .4, '頭部'],
    ['antenna', '触角の長さ', 0, 1.5, .05, 0, '頭部'],
    ['tail', '尾の長さ（胴体比）', 0, 3, .05, .5, '尾'],
    ['tailSegs', '尾の関節数', 1, 20, 1, 5, '尾'],
    ['tailTaper', '尾の先細り', .7, 1.05, .01, .88, '尾'],
    ['tailFin', '尾の鰭（縦方向の厚さ）', 0, 1, .05, .3, '尾'],
    ['limbs', '付属肢の対数／腕の本数', 0, 12, 1, 2, '付属肢'],
    ['limbFrom', '付属肢の開始位置', 0, 1, .05, .2, '付属肢'],
    ['limbLen', '付属肢の長さ', .3, 12, .1, 2.5, '付属肢'],
    ['limbWidth', '付属肢の太さ', .08, 2.5, .02, .4, '付属肢'],
    ['limbDepth', '付属肢の厚さ（幅比）', .15, 2.5, .05, 1, '付属肢'],
    ['limbJoints', '付属肢の関節数', 1, 12, 1, 3, '付属肢'],
    ['limbTaper', '付属肢の先細り', .6, 1.05, .01, .85, '付属肢'],
    ['limbTip', '付属肢先端の太さ', .05, 1.5, .05, .3, '付属肢'],
    ['limbAngle', '付属肢の向き（度）', 20, 160, 1, 95, '付属肢'],
    ['limbCurl', '付属肢の曲がり（度）', -50, 50, 1, 10, '付属肢'],
    ['grip', '接地パッド', 0, 1, .05, 0, '付属肢'],
    ['range', '関節の可動域（度）', 2, 90, 1, 35, '組織'],
    ['muscle', '筋肉量', 0, 1, .05, .6, '組織'],
    ['stiff', '支持組織の硬さ', 0, 1, .05, .4, '組織'],
    ['skin', '外皮の厚さ', 0, 1, .05, .3, '組織'],
    ['armor', '外骨格', 0, 1, .05, 0, '組織'],
    ['cilia', '繊毛（胴体）', 0, 1, .05, 0, '組織'],
    ['gut', '消化器', 0, 1, .05, .6, '器官'],
    ['nerve', '神経・感覚毛', 0, 1, .05, .5, '器官'],
    ['gonad', '生殖器', 0, 1, .05, .3, '器官'],
    ['freq', '運動リズム（Hz）', .2, 3, .05, 1.2, '運動'],
    ['wave', '胴体の波打ち', 0, 1, .05, .4, '運動'],
    ['waves', '体長あたりの波数', 0, 2.5, .05, 1, '運動'],
    ['tailGain', '尾の振り（胴体比）', 0, 4, .1, 1.5, '運動'],
    ['limbAmp', '付属肢の振り', 0, 1, .05, .5, '運動'],
    ['limbLag', '付属肢内の位相遅れ（度）', -120, 120, 5, 30, '運動'],
    ['gait', '左右／隣の位相差（度）', -180, 180, 5, 180, '運動'],
    ['metachronal', '前後の位相差（度）', -180, 180, 5, 60, '運動'],
    ['gripPhase', '接地タイミング（度）', -180, 180, 5, 90, '運動'],
    ['skew', '打ち戻しの速さの差', -.9, .9, .05, 0, '運動'],
    ['hue', '体色', 0, 360, 1, 175, '外観']
  ];
  const defaults = () => Object.fromEntries(PARAMS.map(q => [q[0], q[5]]));

  function design(p0) {
    const p = Object.assign(defaults(), p0), parts = [], links = [];
    const P = o => parts.push(part(o)) - 1, L = o => links.push(link(o));
    const r = p.width / 2, range = p.range * D, tissue = { muscle: p.muscle, stiff: p.stiff, skin: p.skin, range };
    const joints = Math.round(p.limbJoints);
    const limbPart = extra => P(Object.assign({}, tissue, {
      len: p.limbLen / joints, r0: p.limbWidth / 2, r1: p.limbWidth / 2 * p.limbTip, depth: p.limbDepth, armor: p.armor * 0.8,
      amp: p.limbAmp, lag: -p.limbLag * D, skew: p.skew, nerve: p.nerve * 0.8, grip: p.grip, gripPhase: p.gripPhase * D
    }, extra));
    if (p.radial >= 0.5) {
      const disc = P(Object.assign({}, tissue, { cilia: p.cilia, len: p.width * 0.12, r0: r, r1: r, depth: p.depth, armor: p.armor, mouth: p.jaw, gut: p.gut, gonad: p.gonad, nerve: p.nerve, eye: 0 }));
      const arm = limbPart({ steer: 1, eye: 0 });
      L({ from: disc, to: arm, at: 0.5, off: 0.8, angle: 0, sym: 'radial', n: Math.max(3, Math.round(p.limbs)), symPhase: p.gait * D });
      if (joints > 1) L({ from: arm, to: arm, at: 1, angle: p.limbCurl * D, repeat: joints - 1, scale: p.limbTaper });
      if (p.eyes > 0.05) { const tip = P(Object.assign({}, tissue, { len: p.limbWidth * 0.5, r0: p.limbWidth / 2 * p.limbTip, r1: p.limbWidth * 0.45 * (0.4 + p.eyes), depth: p.limbDepth, eye: p.eyes, nerve: 0.6, muscle: 0.05, grip: p.grip, gripPhase: p.gripPhase * D })); L({ from: arm, to: tip, at: 1, angle: 0, lo: 1, hi: 1 }); }
      return create({ hue: p.hue, freq: p.freq, parts, links });
    }
    const n = Math.round(p.segments), R = n - 1, ts = Math.round(p.tailSegs), hasTail = p.tail > 0.02;
    const body = link({ scale: p.taper, swell: p.swell, repeat: Math.max(1, R) }), sLast = R ? chainScale(body, R, R) : 1;
    const endR = hasTail && R ? r * chainScale(body, n, R) : r * sLast * (hasTail ? 0.8 : 0.5);
    const lag = -TAU * p.waves / (n + (hasTail ? ts : 0));
    const trunk = P(Object.assign({}, tissue, { cilia: p.cilia, len: p.length / n, r0: r, r1: endR / sLast, depth: p.depth, armor: p.armor, amp: p.wave, lag, gut: p.gut, gonad: p.gonad, nerve: p.nerve, store: 0.2 }));
    if (R) L({ from: trunk, to: trunk, at: 1, angle: 0, repeat: R, scale: p.taper, swell: p.swell });
    if (p.head > 0.02) {
      const hr = r * Math.min(1.3, 0.62 + 0.45 * p.head);
      const head = P(Object.assign({}, tissue, { len: p.width * p.head, r0: hr, r1: hr * p.snout, depth: p.depth, armor: p.armor, stiff: 0.9, range: range * 0.4, eye: p.eyes, mouth: p.jaw, nerve: Math.max(0.75, p.nerve), gut: p.gut * 0.4 }));
      L({ from: trunk, to: head, at: 0, angle: PI, lo: 0, hi: 0 });
      if (p.antenna > 0.02) {
        const an = P(Object.assign({}, tissue, { len: p.antenna * p.length * 0.6 / 6, r0: p.width * 0.055, r1: p.width * 0.03, depth: 1, muscle: 0.08, stiff: 0.3, nerve: 1, skin: 0.5 }));
        L({ from: head, to: an, at: 0.8, off: 0.7, angle: 0.55, sym: 'mirror' }); L({ from: an, to: an, at: 1, angle: 0.06, repeat: 5, scale: 0.86 });
      }
      if (p.jaw > 0.3) {
        const jw = P(Object.assign({}, tissue, { len: p.width * 0.42 * p.jaw, r0: p.width * 0.11 * p.jaw + 0.03, r1: 0.02, depth: 1, armor: 0.8, skin: 0.8, amp: 0.6, range: 0.35, freq: 2, nerve: 0.1 }));
        L({ from: head, to: jw, at: 0.95, off: 0.75, angle: 0.75, sym: 'mirror' }); L({ from: jw, to: jw, at: 1, angle: -0.85, repeat: 1, scale: 0.8 });
      }
    }
    if (hasTail) {
      const tail = P(Object.assign({}, tissue, { len: p.tail * p.length / ts / sLast, r0: endR / sLast, r1: endR / sLast * 0.25, depth: p.depth * (1 + 4 * p.tailFin), armor: p.armor * 0.7, amp: Math.min(1, p.wave * p.tailGain), phase: lag * n, lag, nerve: p.nerve * 0.6, gut: 0 }));
      L({ from: trunk, to: tail, at: 1, angle: 0, lo: 1, hi: 1 });
      if (ts > 1) L({ from: tail, to: tail, at: 1, angle: 0, repeat: ts - 1, scale: p.tailTaper });
    }
    const pairs = Math.round(p.limbs);
    if (pairs > 0) {
      const limb = limbPart({});
      const lo = R ? Math.round(Math.min(p.limbFrom, 1 - (pairs - 1) / R) * R) / R : 0, hi = R ? lo + (pairs - 1) / R : 1;
      L({ from: trunk, to: limb, at: 0.5, off: 0.8, angle: p.limbAngle * D, sym: 'mirror', symPhase: p.gait * D, axPhase: p.metachronal * D, lo: Math.max(0, lo), hi: Math.min(1, hi) });
      if (joints > 1) L({ from: limb, to: limb, at: 1, angle: p.limbCurl * D, repeat: joints - 1, scale: p.limbTaper });
    }
    return create({ hue: p.hue, freq: p.freq, parts, links });
  }

  // Five diagnostic bodies. Same designer, same engine, different numbers.
  const SAMPLES = [
    { id: 'soft', name: '① 軟体遊泳型', env: 'fluid', params: { segments: 12, length: 11, width: 2.3, depth: .7, taper: .95, swell: .85, head: .7, snout: .6, eyes: .6, jaw: .25, tail: .3, tailSegs: 4, tailTaper: .8, tailFin: .5, limbs: 2, limbFrom: .2, limbLen: 1.8, limbWidth: 1.1, limbDepth: .3, limbJoints: 2, limbTaper: .7, limbTip: .5, limbAngle: 65, limbCurl: 12, limbAmp: .25, skin: .2, armor: 0, wave: .5, waves: 1.1, tailGain: 1.6, freq: 1.3, hue: 185, gut: .7, nerve: .5, range: 30, muscle: .7, stiff: .25 } },
    { id: 'limbed', name: '② 多関節付属肢型', env: 'ground', params: { segments: 4, length: 5.6, width: 2.6, depth: .85, taper: .97, swell: .3, head: .85, snout: .6, eyes: .7, jaw: .8, antenna: .5, tail: 0, limbs: 4, limbFrom: 0, limbLen: 4.4, limbWidth: .6, limbDepth: 1, limbJoints: 4, limbTaper: .84, limbTip: .25, limbAngle: 90, limbCurl: 22, limbAmp: .7, limbLag: 20, gait: 180, metachronal: 90, grip: .9, gripPhase: 180, skin: .35, armor: .35, wave: .05, freq: 1.4, hue: 28, range: 32, muscle: .8, stiff: .6, gut: .7, nerve: .6 } },
    { id: 'tail', name: '③ 長尾遊泳型', env: 'fluid', params: { segments: 4, length: 4.6, width: 2.9, depth: .95, taper: .93, swell: .45, head: .9, snout: .5, eyes: .8, jaw: .3, tail: 2.3, tailSegs: 16, tailTaper: .9, tailFin: .7, limbs: 1, limbFrom: .3, limbLen: 1.3, limbWidth: .8, limbDepth: .3, limbJoints: 2, limbTip: .5, limbAngle: 60, limbAmp: .2, skin: .3, wave: .14, waves: 1.3, tailGain: 3.4, freq: 1.6, hue: 205, range: 34, muscle: .8, stiff: .35, gut: .8, nerve: .5 } },
    { id: 'radial', name: '④ 放射状触手型', env: 'fluid', params: { radial: 1, width: 3.2, depth: .7, limbs: 8, limbLen: 7.5, limbWidth: .8, limbDepth: .9, limbJoints: 10, limbTaper: .86, limbTip: .5, limbCurl: 7, limbAmp: .6, limbLag: 35, gait: 0, grip: .7, gripPhase: 90, eyes: .5, jaw: .6, skin: .2, armor: 0, freq: 1, hue: 285, range: 30, muscle: .7, stiff: .3, gut: .8, nerve: .6, gonad: .5, skew: .8 } },
    { id: 'armored', name: '⑤ 体節・外骨格型', env: 'ground', params: { segments: 11, length: 12, width: 2.7, depth: .6, taper: .96, swell: .4, head: .95, snout: .75, eyes: .6, jaw: .6, antenna: .9, tail: .35, tailSegs: 3, tailTaper: .7, tailFin: 0, limbs: 10, limbFrom: 0, limbLen: 2.6, limbWidth: .36, limbDepth: 1, limbJoints: 3, limbTaper: .85, limbTip: .3, limbAngle: 92, limbCurl: 18, limbAmp: .7, limbLag: 15, gait: 180, metachronal: 55, grip: .9, gripPhase: 180, skin: .7, armor: .9, wave: .1, waves: 1, tailGain: 1, freq: 1.6, hue: 135, range: 28, muscle: .8, stiff: .7, gut: .6, nerve: .6 } }
  ];

  A.bodyplan = { PARAMS, defaults, design, SAMPLES };
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
