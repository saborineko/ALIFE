// Raise the ALIFE 2.0 build number. It is shown on every page and appended to every script URL,
// so a browser or the site cache cannot keep serving an older script with a newer page.
// Usage: node tools/alife2-bump.js "what changed"
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const vf = path.join(root, 'alife2-version.js'), cur = fs.existsSync(vf) ? Number((fs.readFileSync(vf, 'utf8').match(/build: (\d+)/) || [0, 0])[1]) : 0, n = cur + 1;
const when = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', note = process.argv[2] || '';
fs.writeFileSync(vf, `// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: ${n}, label: 'v2.0.${n}', when: '${when}', note: ${JSON.stringify(note)} };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + A.version.when + (A.version.note ? '・' + A.version.note : '') + '）'; });
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`);
for (const f of fs.readdirSync(root).filter(f => /^alife2.*\.html$/.test(f))) {
  let s = fs.readFileSync(path.join(root, f), 'utf8');
  s = s.replace(/<script src="\.\/(alife2-[a-z-]+\.js)(\?v=\d+)?"><\/script>/g, (m, name) => `<script src="./${name}?v=${n}"></script>`);
  if (!s.includes('alife2-version.js')) s = s.replace(/<script src="\.\/alife2-genome\.js/, `<script src="./alife2-version.js?v=${n}"></script>\n<script src="./alife2-genome.js`);
  fs.writeFileSync(path.join(root, f), s);
}
console.log('ALIFE 2.0 build', n, when, note);
