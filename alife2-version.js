// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: 69, label: 'v2.0.69', at: '2026-11-28T05:33:32.327Z', when: '2026-11-28 05:33 UTC', note: "一晩まわす前の備え：ページが自分の運転を 10 秒ごとに書き残す（世界の時刻、個体数、コマ数、1 刻みと描画の時間、GPU の状態）。固まったあとに開き直すと直前の記録が出て、ファイルに書き出せる。固まったタブを閉じて開き直した場合も、自動保存を勝手に再開しない。世界の中身は変わらない" };
  // shown in the reader's own time zone
  const local = () => { try { return new Date(A.version.at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { return A.version.when; } };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + local() + (A.version.note ? '・' + A.version.note : '') + '）'; });
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
