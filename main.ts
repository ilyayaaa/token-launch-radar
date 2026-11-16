// Token launch radar (token-radar-01), Node 22, standard library only.
//
// Reads the sealed snapshot (/input/snapshot.json, or --input <file|dir>, or $MAKEFUN_INPUT), runs the
// shared model in dashboard/model.js, and writes into /output (or --output, or $MAKEFUN_OUTPUT_DIR):
//   board.json   the ranked pre-token rows with implied value, band, factors and a costed farm plan,
//                plus the traded tokens apart and the model's fit and out-of-sample scores
//   data.js      the snapshot itself, so the page runs the same build() and draws the same board
//   dashboard/   the page; screenshots/ the three captures; dossier.json last, with the vendored library
//
//   MAKEFUN_INPUT=../token-radar-01-kit/input/snapshot.json MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Model, boardDocument, boardIssue, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}
function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const inputArg = arg('input', process.env.MAKEFUN_INPUT ?? '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount /input`);
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const radar = Model.build(snapshot);
const doc = boardDocument(radar);
const issue = boardIssue(doc.rows, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify(doc)}\n`);
writeFileSync(join(out, 'data.js'), dataScript(snapshot, doc.rows));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    const path = join(from, name);
    if (name.startsWith('.') || !statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const pages = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} images: hand in 3, the board, a detail view and a filtered view`);
for (const name of shots) if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -`);

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const o = radar.oos;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${doc.rows.length} pre-token rows ranked (${doc.rows.filter((r) => r.watchlist).length}/${snapshot.watchlist.length} watchlist), ${doc.traded.length} traded comparables\n` +
    `token radar: size curve log10(mcap) = ${radar.fit.a.toFixed(3)} + ${radar.fit.b.toFixed(3)} log10(TVL); leave-one-out median miss ${o.model.median_miss.toFixed(2)}x (flat multiple ${o.baseline.median_miss.toFixed(2)}x)\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${pages.length} files), screenshots/ (${shots.length}) and dossier.json to ${out}\n`,
);
