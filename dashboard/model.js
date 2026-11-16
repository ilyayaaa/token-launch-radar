/* Token launch radar: the one model. main.ts runs this file to write board.json; the page runs the
   same file on the same snapshot rows, so the board you see and the board on disk are one computation.
   No protocol name appears here: every number comes from the snapshot's TVL, 7-day change, listing
   date, category and chains, and every coefficient is fitted on the protocols whose token trades. */
(function (root) {
  'use strict';

  // Every assumption the page states, in one place.
  const A = {
    shrink_k: 5,            // category effect = sum of residuals / (n + k): empirical-Bayes shrinkage to 0
    growth_clamp: 25,       // 7-day TVL change clamped to +-25 % before it enters the fit
    age_cap_years: 6,       // days tracked capped at 6 years
    ridge_grid: [0, 0.5, 1, 2, 4, 8], // ridge on the growth and age slopes; leave-one-out picks one
    airdrop_share: 0.06,    // share of the implied value assumed to go to depositors
    horizon_days: 91,       // a farm runs 13 weeks
    default_capital: 5000,
    default_hours: 3,
    bridge_fee: 1,          // relayer or exchange-withdrawal fee to fund a wallet
    farm_net_hr: 25, farm_odds: 0.25,         // Farm: >= $25 per hands-on hour and breaks even at <= 25 % launch odds
    marginal_net_hr: 5, marginal_odds: 0.6,   // Marginal: >= $5 per hour and <= 60 % odds; else Skip
    max_picks: 6, chunks: 50,
    max_share: 0.3,         // planner: no protocol takes more than 30 % of the capital (a launch may never come)
  };
  // Gas per transaction in USD (a stated table; any chain not named costs 0.25).
  const GAS = { Ethereum: 6, Bitcoin: 3, Tron: 1.5, Binance: 0.15, Avalanche: 0.1, Polygon: 0.02, Solana: 0.01, Sui: 0.01, Aptos: 0.01, TON: 0.05, 'Hyperliquid L1': 0.05 };
  const L2 = 'Arbitrum Base Optimism Linea Scroll Unichain Mantle Starknet Blast Mode Ink Sonic Berachain Monad Plasma Katana Taiko Manta Abstract Soneium Fraxtal Hemi Corn BOB Arc MegaETH Swellchain'.split(' ');
  const gasOf = (chain) => GAS[chain] ?? (L2.includes(chain) || / Chain$|zkEVM|Era$/.test(chain) ? 0.1 : 0.25);

  // The universe: no token recorded, and not a wrapped, staked, bridged or exchange product.
  const EXCLUDED = ['CEX', 'Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaking', 'Restaked BTC', 'Anchor BTC', 'Wrapped', 'Stablecoin Wrapper'];
  const EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
  const VERSIONED = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i;
  const DERIVED = /\b(wrapped|staked|staking)\b/i;
  const noToken = (p) => p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
  const excludedWhy = (p) =>
    EXCLUDED.includes(p.category) ? `category ${p.category}` : EXCHANGE.test(p.name) ? 'exchange product' :
    VERSIONED.test(p.name) ? 'versioned pool' : DERIVED.test(p.name) ? 'wrapped or staked product' : null;

  const log10 = Math.log10, clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, f = Math.floor(i); return s[f] + (s[Math.ceil(i)] - s[f]) * (i - f); };
  const median = (a) => quantile(a, 0.5);
  function days(asOf, listed) {
    if (!listed) return null;
    const d = (Date.parse(asOf + 'T00:00:00Z') - Date.parse(listed + 'T00:00:00Z')) / 864e5;
    return Number.isFinite(d) ? Math.max(0, Math.floor(d)) : null;
  }

  /* fit(cs): the four-part value model, fitted on traded tokens cs = [{x, y, g, age, cat}].
     1 size curve   y = a + b*x by ordinary least squares (x = log10 TVL, y = log10 market cap)
     2 category     mean residual per category, shrunk toward 0: sum / (n + k)
     3 growth, age  least squares of what is left on centred 7-day growth and years tracked, with a
                    ridge lam: each slope's own sum of squares is scaled by (1 + lam) */
  function fit(cs, lam) {
    const mx = mean(cs.map((c) => c.x)), my = mean(cs.map((c) => c.y));
    let sxy = 0, sxx = 0;
    for (const c of cs) { sxy += (c.x - mx) * (c.y - my); sxx += (c.x - mx) ** 2; }
    const b = sxy / sxx, a = my - b * mx;
    const r1 = cs.map((c) => c.y - a - b * c.x);
    const cat = {};
    cs.forEach((c, i) => { const e = (cat[c.cat] ??= { n: 0, sum: 0 }); e.n++; e.sum += r1[i]; });
    for (const k in cat) { cat[k].raw = cat[k].sum / cat[k].n; cat[k].effect = cat[k].sum / (cat[k].n + A.shrink_k); }
    const r2 = cs.map((c, i) => r1[i] - cat[c.cat].effect);
    const gm = mean(cs.map((c) => c.g)), am = mean(cs.map((c) => c.age));
    let s11 = 0, s22 = 0, s12 = 0, t1 = 0, t2 = 0;
    cs.forEach((c, i) => { const u = c.g - gm, v = c.age - am; s11 += u * u; s22 += v * v; s12 += u * v; t1 += u * r2[i]; t2 += v * r2[i]; });
    s11 *= 1 + lam; s22 *= 1 + lam;
    const det = s11 * s22 - s12 * s12;
    return { a, b, cat, gm, am, lam, g: (t1 * s22 - t2 * s12) / det, d: (t2 * s11 - t1 * s12) / det, n: cs.length };
  }
  // The four factors (log10 terms) the model adds for one protocol.
  function terms(f, p) {
    return { size: f.a + f.b * p.x, cat: f.cat[p.cat]?.effect ?? 0, growth: f.g * (p.g - f.gm), age: f.d * (p.age - f.am) };
  }
  const predict = (f, p) => { const t = terms(f, p); return t.size + t.cat + t.growth + t.age; };

  function spearman(xs, ys) {
    const rank = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = []; o.forEach(([, i], k) => (r[i] = k)); return r; };
    const rx = rank(xs), ry = rank(ys), mx = mean(rx), my = mean(ry);
    let n = 0, dx = 0, dy = 0;
    rx.forEach((v, i) => { n += (v - mx) * (ry[i] - my); dx += (v - mx) ** 2; dy += (ry[i] - my) ** 2; });
    return n / Math.sqrt(dx * dy);
  }
  /* Leave-one-out: refit without each traded token, predict it, and score the misses against a flat
     baseline (each token valued at the median market-cap-to-TVL multiple of the others). */
  function loo(cs, lam) {
    const err = [], base = [], pred = [];
    cs.forEach((c, i) => {
      const rest = cs.filter((_, j) => j !== i);
      const p = predict(fit(rest, lam), c);
      const m = log10(median(rest.map((r) => 10 ** (r.y - r.x))));
      pred.push(p); err.push(c.y - p); base.push(c.y - (c.x + m));
    });
    const score = (e, p) => ({
      median_miss: 10 ** median(e.map(Math.abs)),
      within_3x: e.filter((v) => Math.abs(v) <= log10(3)).length / e.length,
      spearman: spearman(p, cs.map((c) => c.y)),
    });
    return { lam, model: score(err, pred), baseline: score(base, cs.map((c, i) => c.y - base[i])), q25: quantile(err, 0.25), q75: quantile(err, 0.75), pred, err };
  }

  /* Farm plans: a kind per category, then 4 or 5 steps, each with gas (count x the chain's gas), a fee
     in basis points of the deposit where the action has one, and hands-on minutes. */
  const KINDS = [
    [/lending|collateral|cdp manager/i, 'lend'], [/^cdp$|dual-token/i, 'cdp'], [/basis/i, 'basis'], [/dex/i, 'dex'],
    [/derivative|options$|perp/i, 'perp'], [/^rwa$/i, 'rwa'], [/^chain$/i, 'chain'], [/prediction/i, 'predict'],
    [/curator|allocator|yield|liquidity manager|farm|vault|index|staking pool/i, 'vault'],
  ];
  const kindOf = (cat) => (KINDS.find(([re]) => re.test(cat || '')) || [, 'other'])[1];
  // [core action, txs, fee bps, setup min], optional [extra action, txs, why], [weekly action, txs a week, fee bps over the horizon, min a week]
  const TEMPLATES = {
    lend: [['Supply USDC to {N} on {C} (approve, then supply)', 2, 0, 15], ['Borrow a stablecoin at 30 % loan-to-value and supply it again, one loop, keeping the health factor above 2', 2, 'borrowing usually earns more points per dollar than supplying alone'], ['Check the health factor once a week', 0, 0, 5]],
    cdp: [['Open a vault on {N} and mint its stablecoin against your collateral', 2, 0, 20], ['Deposit the minted stablecoin into {N}\'s savings or stability pool', 2, 'minted and deposited supply is the activity a CDP rewards'], ['Check the collateral ratio once a week', 0, 0, 5]],
    basis: [['Mint {N}\'s synthetic dollar with USDC on {C}', 2, 10, 15], ['Stake the synthetic dollar in {N}\'s savings contract', 2, 'staked supply is what basis-trade programmes count'], ['Check the staked balance and the funding rate once a week', 0, 0, 5]],
    dex: [['Swap half the deposit into the pair and add liquidity to {N}\'s deepest pool on {C}', 3, 15, 20], null, ['Re-range the position once a week if price leaves the range', 1, 0, 10]],
    perp: [['Deposit USDC margin on {N}', 2, 0, 15], null, ['Open and close one hedged trade a week, about the deposit in volume', 2, 90, 10]],
    rwa: [['Pass {N}\'s KYC and subscribe to its tokenised fund with USDC on {C}', 2, 0, 45], null, ['Check the fund balance once a week', 0, 0, 5]],
    chain: [['Deposit USDC into the largest lending or DEX app native to {C}', 3, 0, 20], null, ['Make one swap or deposit on {C} each week so the address stays active', 1, 0, 10]],
    predict: [['Deposit USDC on {N}', 2, 0, 15], null, ['Place two small positions a week', 2, 20, 10]],
    vault: [['Deposit USDC into {N}\'s largest vault on {C} (approve, then deposit)', 2, 0, 15], null, ['Check the vault\'s share price and points once a week', 0, 0, 5]],
    other: [['Deposit USDC into {N}\'s core product on {C} (approve, then deposit)', 2, 0, 15], null, ['Check the position and points once a week', 0, 0, 5]],
  };
  const WEEKS = Math.round(A.horizon_days / 7);
  const usd = (v) => '$' + (v < 10 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US'));

  /* plan(p): the steps and their cost structure: fixed (gas, fees in dollars) and bps (fees per dollar
     deposited). cost_usd of a step is filled in at a deposit by econ(). */
  function plan(p) {
    const C = p.chains[0] || 'Ethereum', gas = gasOf(C), kind = kindOf(p.category);
    const [core, extra, weekly] = TEMPLATES[kind];
    const t = (s) => s.replace(/\{N\}/g, p.name).replace(/\{C\}/g, C);
    const steps = [
      { step: `Fund a fresh wallet on ${C} with USDC (bridge or exchange withdrawal)`, fixed: A.bridge_fee + gas, bps: 0, min: 15, time: '15 min', why: `${C} is the first chain ${p.name} lists; one wallet keeps its activity in one place` },
      { step: t(core[0]), fixed: core[1] * gas, bps: core[2], min: core[3], time: core[3] + ' min', why: `${p.category || 'its'} core product: deposits are what a points programme measures` },
    ];
    if (extra) steps.push({ step: t(extra[0]), fixed: extra[1] * gas, bps: 0, min: 10, time: '10 min', why: extra[2] });
    steps.push({ step: `Hold ${WEEKS} weeks, ${t(weekly[0]).replace(/^./, (ch) => ch.toLowerCase())}`, fixed: weekly[1] * WEEKS * gas, bps: weekly[2], min: weekly[3] * WEEKS, time: `${weekly[3]} min a week, ${WEEKS} weeks`, why: `${p.days ?? 'unknown'} days tracked with no token: time in the pool is the cheapest signal to build` });
    steps.push({ step: `Claim points or the airdrop only from ${p.name}'s own app, then withdraw`, fixed: 2 * gas, bps: 0, min: 20, time: '20 min', why: 'a claim link from anywhere else is the most common drain' });
    return { chain: C, gas, kind, steps, fixed: steps.reduce((s, x) => s + x.fixed, 0), bps: steps.reduce((s, x) => s + x.bps, 0), minutes: steps.reduce((s, x) => s + x.min, 0) };
  }

  // What a deposit D earns: your share is D / (TVL + D), so every extra dollar earns a little less.
  const gross = (r, D) => (r.implied_value_usd * A.airdrop_share * D) / (r.tvl_usd + D);
  const costAt = (r, D) => r.plan.fixed + (r.plan.bps / 1e4) * D;
  function breakEven(r) {
    // V*s*D/(T+D) = F + f*D  ->  f*D^2 + (F + f*T - V*s)*D + F*T = 0, the smaller positive root
    const F = r.plan.fixed, f = r.plan.bps / 1e4, T = r.tvl_usd, Vs = r.implied_value_usd * A.airdrop_share;
    if (f === 0) return Vs > F ? (F * T) / (Vs - F) : Infinity;
    const B = F + f * T - Vs, disc = B * B - 4 * f * F * T;
    return B < 0 && disc >= 0 ? (-B - Math.sqrt(disc)) / (2 * f) : Infinity;
  }
  function econ(r, D) {
    const g = gross(r, D), cost = costAt(r, D), net = g - cost, hours = r.plan.minutes / 60, odds = g > 0 ? cost / g : Infinity;
    const net_hr = net / hours;
    const verdict = net_hr >= A.farm_net_hr && odds <= A.farm_odds ? 'Farm' : net_hr >= A.marginal_net_hr && odds <= A.marginal_odds ? 'Marginal' : 'Skip';
    return { deposit: D, share: D / (r.tvl_usd + D), gross: g, cost, net, hours, hours_week: hours / WEEKS, net_hr, odds, verdict,
      low: gross(r, D) * r.band_low / r.implied_value_usd - cost, high: gross(r, D) * r.band_high / r.implied_value_usd - cost };
  }

  /* The budget planner: allocate the reader's capital in chunks. Each round adds the chunk with the best
     net return per dollar; opening a protocol costs its fixed gas, so it opens with twice its break-even
     deposit. A protocol stops getting money once its marginal return falls below the next one's. */
  function planner(rows, capital, hoursWeek) {
    const chunk = Math.max(50, capital / A.chunks), held = new Map(), cap = capital * A.max_share;
    let left = capital, hours = 0;
    while (left >= chunk - 1e-6) {
      let best = null;
      for (const r of rows) {
        const d = held.get(r) || 0;
        let amt, gain;
        if (d === 0) {
          if (held.size >= A.max_picks || hours + r.plan.minutes / 60 / WEEKS > hoursWeek || !Number.isFinite(r.break_even_usd)) continue;
          amt = Math.min(left, cap, Math.max(chunk, Math.ceil((2 * r.break_even_usd) / chunk) * chunk));
          if (amt < chunk - 1e-6 || gross(r, amt) <= costAt(r, amt)) continue;
          gain = gross(r, amt) - costAt(r, amt);
        } else {
          amt = Math.min(chunk, left, cap - d);
          if (amt < 1) continue;
          gain = gross(r, d + amt) - gross(r, d) - (r.plan.bps / 1e4) * amt;
        }
        if (!best || gain / amt > best.per) best = { r, amt, per: gain / amt };
      }
      if (!best || best.per <= 0) break;
      if (!held.has(best.r)) hours += best.r.plan.minutes / 60 / WEEKS;
      held.set(best.r, (held.get(best.r) || 0) + best.amt);
      left -= best.amt;
    }
    const picks = [...held].map(([r, D]) => ({ row: r, e: econ(r, D) })).sort((p, q) => q.e.deposit - p.e.deposit);
    const sum = (k) => picks.reduce((s, p) => s + p.e[k], 0);
    return { picks, capital, hours_week_budget: hoursWeek, unallocated: left, gas: sum('cost'), hours_week: sum('hours_week'), net: sum('net'), low: sum('low'), high: sum('high') };
  }

  /* build(snapshot): the whole radar. Rows are ranked by implied value, highest first; ties go by slug. */
  function build(s) {
    const watch = new Set(s.watchlist);
    const feat = (p) => {
      const dd = days(s.as_of, p.listed_at);
      return { x: log10(p.tvl_usd), g: clamp(p.change_7d ?? 0, -A.growth_clamp, A.growth_clamp), days: dd, cat: p.category || 'Uncategorised' };
    };
    const traded = s.protocols.filter((p) => p.mcap_usd > 0 && p.tvl_usd > 0).map((p) => ({ p, ...feat(p), y: log10(p.mcap_usd) }));
    const medDays = median(traded.filter((c) => c.days !== null).map((c) => c.days));
    const years = (dd) => Math.min(dd ?? medDays, A.age_cap_years * 365) / 365;
    traded.forEach((c) => (c.age = years(c.days)));
    // The ridge on growth and age is the one whose leave-one-out median miss is smallest.
    const tries = A.ridge_grid.map((lam) => loo(traded, lam));
    const oos = tries.reduce((p, q) => (q.model.median_miss < p.model.median_miss ? q : p));
    const f = fit(traded, oos.lam);
    const universe = s.protocols.filter((p) => watch.has(p.slug) || (noToken(p) && p.tvl_usd > 0 && !excludedWhy(p)));
    const rows = universe.map((p) => {
      const c = { ...feat(p) }; c.age = years(c.days);
      const t = terms(f, c), L = t.size + t.cat + t.growth + t.age;
      return {
        slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d,
        listed_at: p.listed_at, days_tracked: c.days, watchlist: watch.has(p.slug), token_recorded: !noToken(p),
        value: 10 ** L, band_low_v: 10 ** (L + oos.q25), band_high_v: 10 ** (L + oos.q75),
        factors: { size_usd: 10 ** t.size, category: 10 ** t.cat, category_n: f.cat[c.cat]?.n ?? 0, growth: 10 ** t.growth, growth_pct: c.g, age: 10 ** t.age, age_years: c.age, age_imputed: c.days === null },
      };
    });
    rows.sort((p, q) => q.value - p.value || (p.slug < q.slug ? -1 : 1));
    rows.forEach((r, i) => {
      r.rank = i + 1;
      r.implied_value_usd = Math.max(1, Math.round(r.value));
      r.band_low = Math.round(r.band_low_v); r.band_high = Math.round(r.band_high_v);
      delete r.value; delete r.band_low_v; delete r.band_high_v;
      r.plan = plan({ ...r, days: r.days_tracked });
      r.break_even_usd = breakEven(r);
      r.econ = econ(r, A.default_capital);
    });
    const comparables = traded.map((c, i) => ({ slug: c.p.slug, name: c.p.name, category: c.p.category, chains: c.p.chains, tvl_usd: c.p.tvl_usd, mcap_usd: c.p.mcap_usd, change_7d: c.p.change_7d, fitted_usd: 10 ** predict(f, c), loo_usd: 10 ** oos.pred[i], miss: 10 ** Math.abs(oos.err[i]) }))
      .sort((p, q) => q.mcap_usd - p.mcap_usd);
    return { as_of: s.as_of, source: s.source, floor_usd: s.floor_usd, assumptions: A, gas: GAS, fit: f, median_days: medDays, oos, ridge_tries: tries.map((t) => [t.lam, t.model.median_miss]), rows, comparables, watchlist_size: watch.size, protocols: s.protocols.length };
  }

  const api = { A, GAS, gasOf, kindOf, excludedWhy, fit, terms, predict, loo, plan, econ, breakEven, planner, build, gross, usd, WEEKS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RadarModel = api;
})(typeof globalThis === 'object' ? globalThis : this);
