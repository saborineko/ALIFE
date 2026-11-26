// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: 44, label: 'v2.0.44', at: '2026-11-26T23:22:38.790Z', when: '2026-11-26 23:22 UTC', note: "繊毛の音を、水に対してした仕事から決める規則を追加（既定は切。泳ぐ音は静かになる）／音の記録を訂正：1 匹の個体から「聞き手の変化」を誤って記録していた（鳴き始めの数え方、別々の個体の数、ばらつきの扱い）" };
  // shown in the reader's own time zone
  const local = () => { try { return new Date(A.version.at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { return A.version.when; } };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + local() + (A.version.note ? '・' + A.version.note : '') + '）'; });
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
