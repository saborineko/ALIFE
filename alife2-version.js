// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: 46, label: 'v2.0.46', at: '2026-11-27T01:19:51.375Z', when: '2026-11-27 01:19 UTC', note: "経験と動きを失わない・神経に名前を付ける・左右の対は一緒に生える・身体を固い物体として扱う、の 4 規則を追加（既定は切、全部入りには含む）／一生を通した感覚と学習の試験" };
  // shown in the reader's own time zone
  const local = () => { try { return new Date(A.version.at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { return A.version.when; } };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + local() + (A.version.note ? '・' + A.version.note : '') + '）'; });
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
