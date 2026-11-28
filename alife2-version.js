// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: 71, label: 'v2.0.71', at: '2026-11-28T12:53:38.381Z', when: '2026-11-28 12:53 UTC', note: "不具合の扱いを自動にする：以前の版で起きた破綻の記録を【異常】として出し続けない（いまの版で起きたものだけを異常として出す）。不具合の記録だけを書き出すボタン。破綻の前ぶれ（身体の端が毎秒 60 より速い）を数える見張り。運転の記録に不具合が自動で入る。世界の中身は変わらない" };
  // shown in the reader's own time zone
  const local = () => { try { return new Date(A.version.at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { return A.version.when; } };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + local() + (A.version.note ? '・' + A.version.note : '') + '）'; });
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
