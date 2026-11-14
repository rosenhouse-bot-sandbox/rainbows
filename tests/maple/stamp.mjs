// Gives every file of the Japanese maple page one shared version, written into each address that
// loads one of them: "model.js?v=1a2b3c4d". A browser keeps each file for a while, and without this a
// visitor could get a new main.js together with an old copy of a file it imports, which do not fit.
// With it, a changed file has a new address everywhere at once.
//
//   node tests/maple/stamp.mjs           # after changing any file under js/maple/ or css/maple.css
//   node tests/maple/stamp.mjs --check   # fails if the stamp is out of date (the tests run this)
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
export function stamp(check = false) {
  const dir = path.join(root, 'js/maple'), mods = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => path.join(dir, f));
  const css = path.join(root, 'css/maple.css'), html = path.join(root, 'maple/index.html');
  const bare = (t) => t.replace(/(\.(?:js|css))\?v=[0-9a-f]+/g, '$1');
  const text = new Map([...mods, css, html].map((f) => [f, bare(fs.readFileSync(f, 'utf8'))]));
  const h = createHash('sha256'); for (const f of [...mods, css]) h.update(text.get(f));
  const v = h.digest('hex').slice(0, 8), stale = [];
  for (const [f, t] of text) {
    const out = f === html ? t.replace(/((?:js\/maple\/\w+\.js|css\/maple\.css))(?=")/g, `$1?v=${v}`) : t.replace(/(from '\.\/\w+\.js)(?=')/g, `$1?v=${v}`);
    if (out !== fs.readFileSync(f, 'utf8')) { stale.push(path.relative(root, f)); if (!check) fs.writeFileSync(f, out); }
  }
  return { v, stale };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check'), r = stamp(check);
  if (check && r.stale.length) { console.error(`The version stamp is out of date in: ${r.stale.join(', ')}. Run: node tests/maple/stamp.mjs`); process.exit(1); }
  console.log(check ? `stamp ${r.v} is up to date` : `stamped ${r.v}${r.stale.length ? ': ' + r.stale.join(', ') : ' (nothing to change)'}`);
}
