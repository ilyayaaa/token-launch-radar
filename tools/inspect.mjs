// Prints board.json's shape and one watchlist row: node tools/inspect.mjs [outDir]
import { readFileSync } from 'node:fs';
const b = JSON.parse(readFileSync(`${process.argv[2] ?? 'out'}/board.json`, 'utf8'));
const r = b.rows.find((x) => x.watchlist);
console.log(JSON.stringify({ keys: Object.keys(b), rows: b.rows.length, traded: b.traded.length, model: b.model.out_of_sample, row: r }, null, 1));
const len = b.rows.flatMap((x) => x.farm_steps.map((s) => s.length));
console.log('step length min', Math.min(...len), 'max', Math.max(...len));
