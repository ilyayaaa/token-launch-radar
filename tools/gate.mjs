// A local mirror of the gate's seven rows over a built output folder: node tools/gate.mjs <outDir> <snapshot.json>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [out = 'out', snap = '/input/snapshot.json'] = process.argv.slice(2);
const s = JSON.parse(readFileSync(snap, 'utf8'));
const rows = [];
const row = (name, ok, detail) => rows.push(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(16)} ${detail}`);
const NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/, URL = /https?:\/\//i;

// dashboard_files
const dash = join(out, 'dashboard'), files = readdirSync(dash);
let bad = files.find((f) => !NAME.test(f) || !statSync(join(dash, f)).isFile());
for (const f of files) {
  const t = readFileSync(join(dash, f), 'utf8');
  if (f.endsWith('.html') && [...t.matchAll(/\s[\w-]+\s*=\s*("[^"]*"|'[^']*')/g)].some((m) => URL.test(m[1]))) bad ??= `${f}: attribute URL`;
  if (f.endsWith('.html') && [...t.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].some((m) => URL.test(m[1]))) bad ??= `${f}: style URL`;
  if (f.endsWith('.css') && URL.test(t)) bad ??= `${f}: CSS URL`;
  if (f.endsWith('.js') && /(import|from|require\s*\()\s*\(?\s*['"`]https?:/.test(t)) bad ??= `${f}: import URL`;
}
const bytes = files.reduce((n, f) => n + statSync(join(dash, f)).size, 0);
row('dashboard_files', !bad && files.includes('index.html') && files.some((f) => f.endsWith('.css')) && files.some((f) => f.endsWith('.js')), bad ?? `${files.length} files, ${bytes} bytes`);

// board_file, sorted_by_value, coverage, farm_steps
const b = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')), R = b.rows, known = new Set(s.protocols.map((p) => p.slug));
const shape = R.every((r) => known.has(r.slug) && r.name && Number.isInteger(r.rank) && r.rank > 0 && Number.isInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 1e14 && Array.isArray(r.farm_steps));
row('board_file', shape && R.length >= 100 && R.length <= 4000 && new Set(R.map((r) => r.slug)).size === R.length, `${R.length} rows`);
const byRank = [...R].sort((x, y) => x.rank - y.rank);
const sorted = byRank.every((r, i) => r.rank === i + 1 && (i === 0 || r.implied_value_usd <= byRank[i - 1].implied_value_usd)) && new Set(R.map((r) => r.implied_value_usd)).size > 1;
row('sorted_by_value', sorted, `ranks 1..${R.length}, top ${byRank[0].implied_value_usd}, last ${byRank.at(-1).implied_value_usd}`);
const have = new Set(R.map((r) => r.slug)), miss = s.watchlist.filter((w) => !have.has(w));
row('coverage', miss.length === 0, `${s.watchlist.length - miss.length}/${s.watchlist.length} watchlist slugs`);
const stepsOk = R.every((r) => r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((x) => typeof x === 'string' && x.trim().length >= 20 && x.trim().length <= 600));
row('farm_steps', stepsOk, 'every row 3..12 strings of 20..600 characters');

// screenshots: JPEG/PNG dimensions from the file header
const shots = readdirSync(join(out, 'screenshots')).filter((f) => !f.startsWith('.'));
const dims = shots.map((f) => {
  const d = readFileSync(join(out, 'screenshots', f));
  let w = 0, h = 0;
  if (d[0] === 0x89) { w = d.readUInt32BE(16); h = d.readUInt32BE(20); }
  else for (let i = 2; i < d.length; ) { const m = d[i + 1], len = d.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc2) { h = d.readUInt16BE(i + 5); w = d.readUInt16BE(i + 7); break; } i += 2 + len; }
  return { f, w, h, kb: Math.round(d.length / 1024) };
});
row('screenshots', shots.length >= 3 && shots.length <= 4 && dims.every((x) => Math.max(x.w, x.h) <= 1440 && Math.min(x.w, x.h) >= 800 && x.kb <= 512), dims.map((x) => `${x.f} ${x.w}x${x.h} ${x.kb}KB`).join(', '));

// dossier: size, and whether the source text was cut
const dossier = readFileSync(join(out, 'dossier.json'), 'utf8');
const cut = /\[Cut at \d+ bytes|lines not shown\.\]/.test(dossier);
row('dossier', dossier.length <= 1.5 * 1024 * 1024 && !cut, `${dossier.length} bytes, source ${cut ? 'CUT' : 'whole'}`);
console.log(rows.join('\n'));
