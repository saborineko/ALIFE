// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: 61, label: 'v2.0.61', at: '2026-11-27T13:50:21.833Z', when: '2026-11-27 13:50 UTC', note: "新しい選択式の規則「brain」：神経を部品あたり 16 個まで、根の体節・全身への遠い結合、神経のまとまりの複製" };
  // shown in the reader's own time zone
  const local = () => { try { return new Date(A.version.at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { return A.version.when; } };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + local() + (A.version.note ? '・' + A.version.note : '') + '）'; });
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
