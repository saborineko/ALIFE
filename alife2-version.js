// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: 42, label: 'v2.0.42', at: '2026-11-26T20:21:07.022Z', when: '2026-11-26 20:21 UTC', note: "音の記録を広げた（LIFE の観測所の考え方：聞き手の前後比較・鳴き返しの基準・順序・海域・初めての観測。記録は世界に一切戻らない）／変異の頻度と幅を別々の遺伝子にする規則を追加（既定は切）／全部入りから変異の強さの進化を外した" };
  // shown in the reader's own time zone
  const local = () => { try { return new Date(A.version.at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { return A.version.when; } };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + local() + (A.version.note ? '・' + A.version.note : '') + '）'; });
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
