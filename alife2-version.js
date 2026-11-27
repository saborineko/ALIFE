// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: 48, label: 'v2.0.48', at: '2026-11-27T03:17:06.576Z', when: '2026-11-27 03:17 UTC', note: "版の整理：v2.0.46（4 つの規則）と v2.0.47（外来個体の投入・生命体の可能性探索）の記録を分け、ページの呼び名と文言を「生命体の可能性探索」に揃えた。世界と動作は変わらない" };
  // shown in the reader's own time zone
  const local = () => { try { return new Date(A.version.at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { return A.version.when; } };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + local() + (A.version.note ? '・' + A.version.note : '') + '）'; });
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
