// Raise the ALIFE 2.0 build number. It is shown on every page and appended to every script URL,
// so a browser or the site cache cannot keep serving an older script with a newer page.
// Usage: node tools/alife2-bump.js "what changed"
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const vf = path.join(root, 'alife2-version.js'), cur = fs.existsSync(vf) ? Number((fs.readFileSync(vf, 'utf8').match(/build: (\d+)/) || [0, 0])[1]) : 0;
// Two writers once raised the number on two branches on the same day, and two different changes were both called v2.0.46. So: the number is raised once,
// on the branch that is published, just before publishing — not inside a working branch. This tool never goes below what the published branches (as last
// fetched) already carry, and says so when it is run somewhere else.
const git = cmd => { try { return require('child_process').execSync('git ' + cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch (e) { return ''; } };
const BASE = ['alife2-body-engine', 'main'], seen = BASE.map(b => Number((git('show origin/' + b + ':alife2-version.js').match(/build: (\d+)/) || [0, 0])[1])), ahead = Math.max(0, ...seen), n = Math.max(cur, ahead) + 1;
if (ahead > cur) console.warn('注意：公開されている枝はすでに v2.0.' + ahead + '（手元は v2.0.' + cur + '）。v2.0.' + n + ' にする。先に取り込む（fetch して merge / rebase）こと。');
{ const here = git('rev-parse --abbrev-ref HEAD').trim(); if (here && !BASE.includes(here)) console.warn('注意：いまの枝は ' + here + '。版番号は、公開する枝（' + BASE[0] + '）に入れる直前に 1 回だけ上げる。作業用の枝の中で上げると、別の枝の同じ番号とぶつかる。'); }
const at = new Date().toISOString(), when = at.slice(0, 16).replace('T', ' ') + ' UTC', note = process.argv[2] || '';
fs.writeFileSync(vf, `// ALIFE 2.0 build number. Written by tools/alife2-bump.js; do not edit by hand.
(function (G) {
  const A = G.ALIFE2 = G.ALIFE2 || {};
  A.version = { build: ${n}, label: 'v2.0.${n}', at: '${at}', when: '${when}', note: ${JSON.stringify(note)} };
  // shown in the reader's own time zone
  const local = () => { try { return new Date(A.version.at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { return A.version.when; } };
  if (typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { for (const e of document.querySelectorAll('[data-alife2-version]')) e.textContent = A.version.label + '（' + local() + (A.version.note ? '・' + A.version.note : '') + '）'; });
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
