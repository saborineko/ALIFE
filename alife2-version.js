// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: 70, label: 'v2.0.70', at: '2026-11-28T11:08:13.582Z', when: '2026-11-28 11:08 UTC', note: "物理の計算が発散する不具合を直した：食べられて数千分の 1 しか残っていない体節で、水の抵抗の上限（1 刻みで運動量より多くは奪わない）が食べられる前の質量で数えられていて、歯止めにならなかった。残っている質量で数える。ユーザーの世界で安全弁が働いた実例から特定。傷の無い身体の計算は変わらない" };
  // shown in the reader's own time zone
  const local = () => { try { return new Date(A.version.at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { return A.version.when; } };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + local() + (A.version.note ? '・' + A.version.note : '') + '）'; });
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
