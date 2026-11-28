// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: 72, label: 'v2.0.72', at: '2026-11-28T16:54:55.759Z', when: '2026-11-28 16:54 UTC', note: "物理の計算が発散する不具合をもう 1 つ直した：何十本もの短い体節が生える身体が育つ途中、自分の体節どうしの押し合いで体節がひっくり返り、関節の止まりが質点を飛ばしていた。全機能の長時間運転（送ってもらった世界の続き、3,300 秒先）で見つけた。押しとずらしの上限、止まりの戻し幅の上限、水の中での速さの上限。発散しない既知の震えは【異常】にしない" };
  // shown in the reader's own time zone
  const local = () => { try { return new Date(A.version.at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { return A.version.when; } };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + local() + (A.version.note ? '・' + A.version.note : '') + '）'; });
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
