// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: 56, label: 'v2.0.56', at: '2026-11-27T10:50:39.252Z', when: '2026-11-27 10:50 UTC', note: "表示が止まる件：発散した身体が世界の 1 刻みを終わらなくする不具合を修正。破綻した身体の記録。ビューアは一部で例外が出ても止まらない" };
  // shown in the reader's own time zone
  const local = () => { try { return new Date(A.version.at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { return A.version.when; } };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + local() + (A.version.note ? '・' + A.version.note : '') + '）'; });
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
