// The token radar's model, as main.ts uses it.
//
// The model itself lives in dashboard/model.js, one plain script that both this program and the page
// run: main.ts calls build() on the sealed snapshot to write board.json, and the page calls the same
// build() on the same snapshot (shipped beside it as data.js) to draw the board. This file adds the
// types, the snapshot's validation, the board.json row shape, and the gate's own checks.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

interface PlanStep { step: string; fixed: number; bps: number; min: number; time: string; why: string }
interface Econ { deposit: number; gross: number; cost: number; net: number; hours: number; net_hr: number; odds: number; verdict: string; low: number; high: number }
export interface ModelRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; change_7d: number | null;
  listed_at: string | null; days_tracked: number | null; watchlist: boolean; token_recorded: boolean;
  implied_value_usd: number; band_low: number; band_high: number;
  factors: { size_usd: number; category: number; category_n: number; growth: number; growth_pct: number; age: number; age_years: number; age_imputed: boolean };
  plan: { chain: string; gas: number; kind: string; steps: PlanStep[]; fixed: number; bps: number; minutes: number };
  break_even_usd: number; econ: Econ;
}
interface Score { median_miss: number; within_3x: number; spearman: number }
export interface Radar {
  as_of: string; assumptions: Record<string, number>;
  fit: { spec: string; k: number; lam: number | null; a: number; b: number; g: number; d: number; gm: number; am: number; n: number; cat: Record<string, { n: number; raw: number; effect: number }> };
  oos: { model: Score; baseline: Score; q25: number; q75: number };
  cmp: Record<'robust' | 'ols' | 'on' | 'off', Score & { spec: string; lam: number | null }>;
  rows: ModelRow[];
  comparables: { slug: string; name: string; category: string | null; tvl_usd: number; mcap_usd: number; fitted_usd: number; loo_usd: number; miss: number }[];
}
interface ModelApi {
  build(s: Snapshot): Radar;
  econ(r: ModelRow, deposit: number): Econ;
}

/** The shared model: the very file the dashboard loads. */
export const Model = require('../dashboard/model.js') as ModelApi;

/** One farm step as board.json carries it: structured, and as the gate's 20 to 600 character string. */
export interface FarmStep { step: string; cost_usd: number; time: string; why: string }

export interface BoardRow {
  rank: number; slug: string; name: string; implied_value_usd: number; band_low: number; band_high: number;
  category: string | null; chains: string[]; tvl_usd: number; change_7d: number | null; days_tracked: number | null;
  watchlist: boolean; verdict: string; net_per_hour_usd: number; expected_payout_usd: number; break_even_deposit_usd: number | null;
  farm_steps: string[]; farm_plan: FarmStep[];
  factors: ModelRow['factors'];
}

const cents = (v: number): number => Math.round(v * 100) / 100;

/** A model row in board.json's shape; the plan is costed at the default deposit. */
export function boardRow(r: ModelRow, radar: Radar): BoardRow {
  const D = radar.assumptions.default_capital!;
  const plan = r.plan.steps.map((s) => ({ step: s.step, cost_usd: cents(s.fixed + (s.bps / 1e4) * D), time: s.time, why: s.why }));
  return {
    rank: r.rank, slug: r.slug, name: r.name, implied_value_usd: r.implied_value_usd, band_low: r.band_low, band_high: r.band_high,
    category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, days_tracked: r.days_tracked,
    watchlist: r.watchlist, verdict: r.econ.verdict, net_per_hour_usd: cents(r.econ.net_hr), expected_payout_usd: cents(r.econ.gross),
    break_even_deposit_usd: Number.isFinite(r.break_even_usd) ? Math.round(r.break_even_usd) : null,
    farm_steps: plan.map((s, i) => stepText(s, i, plan.length)),
    farm_plan: plan,
    factors: r.factors,
  };
}

/** A step as one string within the gate's 20..600 characters. */
export function stepText(s: FarmStep, i: number, n: number): string {
  const t = `Step ${i + 1} of ${n}: ${s.step}. Cost: $${s.cost_usd.toFixed(2)}. Time: ${s.time}. Why: ${s.why}.`;
  return t.length > 600 ? `${t.slice(0, 597)}...` : t;
}

/** board.json: the ranked rows, the traded tokens apart (the market's own values, never ranked), and the model's fit. */
export function boardDocument(radar: Radar): { rows: BoardRow[]; traded: unknown[]; model: unknown } {
  return {
    model: {
      as_of: radar.as_of,
      formula: `log10(implied) = a + b*log10(TVL) + category effect${radar.fit.lam === null ? '' : ' + g*(growth - mean) + d*(years - mean)'}`,
      spec: radar.fit.spec === 'robust' ? 'Huber robust line, median category effect' : 'least-squares line, mean category effect',
      category_shrink_k: radar.fit.k, ridge: radar.fit.lam,
      a: radar.fit.a, b: radar.fit.b, g: radar.fit.g, d: radar.fit.d, comparables: radar.fit.n,
      out_of_sample: radar.oos.model, flat_baseline: radar.oos.baseline, band_quantiles_log10: [radar.oos.q25, radar.oos.q75],
      leave_one_out_by_spec: radar.cmp,
      assumptions: radar.assumptions,
    },
    rows: radar.rows.map((r) => boardRow(r, radar)),
    traded: radar.comparables.map((c) => ({ slug: c.slug, name: c.name, category: c.category, tvl_usd: c.tvl_usd, mcap_usd: c.mcap_usd, curve_usd: Math.round(c.fitted_usd), leave_one_out_usd: Math.round(c.loo_usd) })),
  };
}

export class SnapshotError extends Error {}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  const o = JSON.parse(text) as Record<string, unknown>;
  if (typeof o !== 'object' || o === null) throw new SnapshotError('snapshot.json is not a JSON object');
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (!Array.isArray(o.protocols) || !Array.isArray(o.watchlist)) throw new SnapshotError('snapshot.json has no protocols or watchlist');
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const protocols = (o.protocols as Record<string, unknown>[]).map((p, i) => {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || num(p.tvl_usd) === null) throw new SnapshotError(`protocol ${i} lacks a slug, a name or a TVL`);
    return {
      slug: p.slug, name: p.name, category: str(p.category), chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd as number, change_7d: num(p.change_7d), mcap_usd: num(p.mcap_usd), listed_at: str(p.listed_at), gecko_id: str(p.gecko_id), symbol: str(p.symbol),
    };
  });
  return { as_of: o.as_of, source: String(o.source ?? ''), floor_usd: Number(o.floor_usd), protocols, watchlist: (o.watchlist as unknown[]).filter((s): s is string => typeof s === 'string') };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, distinct values, farm steps. */
export function boardIssue(rows: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(rows.map((r) => r.slug));
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  if (rows.length < 100 || rows.length > 4000) return `the board has ${rows.length} rows`;
  if (slugs.size !== rows.length) return 'a slug appears twice';
  for (const r of rows) if (!known.has(r.slug)) return `${r.slug} is not in the snapshot`;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) return `row ${i} has rank ${r.rank}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `rank ${r.rank} is worth more than rank ${r.rank - 1}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
  }
  if (rows[0]!.implied_value_usd === rows[rows.length - 1]!.implied_value_usd) return 'every row has the same implied value';
  return null;
}

/** data.js: the snapshot itself, so the page runs the same build(), plus a digest of the board it should match. */
export function dataScript(snapshot: Snapshot, rows: BoardRow[]): string {
  const check = { rows: rows.length, top: rows[0]!.slug, total_usd: rows.reduce((s, r) => s + r.implied_value_usd, 0) };
  return `window.SNAPSHOT=${JSON.stringify(snapshot)};\nwindow.BOARD_CHECK=${JSON.stringify(check)};\n`;
}
