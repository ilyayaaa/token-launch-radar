/* Launch Radar page: runs model.js's build() (as main.ts did for board.json) on data.js's snapshot,
   then draws the board, the detail views and the budget planner. */
(() => {
  'use strict';
  const M = window.RadarModel, A = M.A, R = M.build(window.SNAPSHOT), F = R.fit;
  const rows = R.rows, bySlug = new Map(rows.map((r) => [r.slug, r]));
  const st = { capital: A.default_capital, hours: A.default_hours, sort: 'rank', dir: 1, cat: '', chain: '', verdict: '', watch: false, q: '', tsort: 'mcap', tdir: -1 };
  let plan = null;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const money = (v) => {
    if (!Number.isFinite(v)) return 'never';
    const a = Math.abs(v), s = v < 0 ? '−$' : '$';
    return a >= 1e9 ? s + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? s + (a / 1e6).toFixed(1) + 'M' : a >= 1e4 ? s + (a / 1e3).toFixed(0) + 'K' : a >= 10 ? s + Math.round(a).toLocaleString('en-US') : s + a.toFixed(2);
  };
  const pct = (v, d = 1) => (v === null || v === undefined ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%');
  const x2 = (v) => '×' + v.toFixed(2);
  const chip = (v) => `<span class="chip ${v.toLowerCase()}">${v}</span>`;
  const sgn = (v, d = 3) => (v < 0 ? '− ' : '+ ') + Math.abs(v).toFixed(d);

  // The reader's numbers: every row at their capital, and the planner's allocation.
  function recompute() {
    for (const r of rows) r.me = M.econ(r, st.capital);
    plan = M.planner(rows, st.capital, st.hours);
    const held = new Map(plan.picks.map((p) => [p.row.slug, p.e.deposit]));
    for (const r of rows) r.held = held.get(r.slug) || 0;
  }

  // hero
  const o = R.oos, C = R.cmp, wl = rows.filter((r) => r.watchlist).length;
  // The spec leave-one-out chose: robust or least squares, and whether growth and age are in the value.
  const ROB = F.spec === 'robust', GA = F.lam !== null, cen = ROB ? 'median' : 'mean', nv = ': shown, not valued (see Method)';
  const sc = (s) => `${s.median_miss.toFixed(2)}× median miss, ${(s.within_3x * 100).toFixed(0)}% within 3×, rank ${s.spearman.toFixed(2)}`;
  const check = window.BOARD_CHECK, total = rows.reduce((s, r) => s + r.implied_value_usd, 0);
  const agrees = check && check.rows === rows.length && check.top === rows[0].slug && check.total_usd === total;

  function scatter(w, h, focus, label) {
    const pts = R.comparables.map((c) => [Math.log10(c.tvl_usd), Math.log10(c.mcap_usd)]);
    const pre = rows.map((r) => [Math.log10(r.tvl_usd), Math.log10(r.implied_value_usd), r.slug]);
    const xs = pts.concat(pre).map((p) => p[0]), ys = pts.concat(pre).map((p) => p[1]);
    const x0 = Math.floor(Math.min(...xs) * 2) / 2, x1 = Math.ceil(Math.max(...xs) * 2) / 2, y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
    const P = 34, X = (v) => P + ((v - x0) / (x1 - x0)) * (w - P - 8), Y = (v) => h - 22 - ((v - y0) / (y1 - y0)) * (h - 30);
    const lab = (e) => (e >= 9 ? '$' + 10 ** (e - 9) + 'B' : e >= 6 ? '$' + 10 ** (e - 6) + 'M' : '$' + 10 ** (e - 3) + 'K');
    let s = `<svg viewBox="0 0 ${w} ${h}" class="plot" role="img" aria-label="Log market cap against log TVL with the fitted size curve">`;
    for (let e = Math.ceil(x0); e <= x1; e++) s += `<line x1="${X(e)}" x2="${X(e)}" y1="8" y2="${h - 22}" class="grid"/><text x="${X(e)}" y="${h - 8}" class="tick" text-anchor="middle">${lab(e)}</text>`;
    for (let e = y0; e <= y1; e++) s += `<line x1="${P}" x2="${w - 8}" y1="${Y(e)}" y2="${Y(e)}" class="grid"/><text x="${P - 4}" y="${Y(e) + 3}" class="tick" text-anchor="end">${lab(e)}</text>`;
    s += pts.map((p) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.6" class="tr"/>`).join('');
    s += pre.map((p) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.6" class="pt${p[2] === focus ? ' on' : ''}"/>`).join('');
    s += `<line x1="${X(x0)}" y1="${Y(F.a + F.b * x0)}" x2="${X(x1)}" y2="${Y(F.a + F.b * x1)}" class="fitl"/>`;
    const f = focus && pre.find((p) => p[2] === focus);
    if (f) s += `<circle cx="${X(f[0])}" cy="${Y(f[1])}" r="6" class="focus"/><text x="${X(f[0]) + 9}" y="${Y(f[1]) - 9}" class="flab">${esc(label)}</text>`;
    s += `<text x="${w - 10}" y="${h - 26}" class="axis" text-anchor="end">TVL →</text><text x="${P + 4}" y="16" class="axis">↑ value</text></svg>`;
    return s;
  }
  const legend = '<div class="legend"><span><i class="k tr"></i>traded: market cap</span><span><i class="k pt"></i>pre-token: implied value</span><span><i class="k ln"></i>fitted size curve</span></div>';

  function hero() {
    return `<div class="hero-l">
      <p class="kicker">Token launch radar · DefiLlama snapshot of ${esc(R.as_of)} · ${R.protocols} protocols read</p>
      <h1>${rows.length} protocols record no token. Here is what each launch would be worth, and how to farm it.</h1>
      <div class="cards">
        <div class="card"><b>${wl}/${R.watchlist_size}</b><span>watchlist ranked</span></div>
        <div class="card"><b>${rows.length}</b><span>pre-token ranked</span></div>
        <div class="card"><b>${F.n}</b><span>traded comparables</span></div>
        <div class="card accent"><b>${o.model.median_miss.toFixed(2)}×</b><span>out-of-sample median miss</span></div>
      </div>
      <div class="formula"><span class="lbl">Fitted value model (${ROB ? `Huber robust line, c = ${A.huber_c}` : 'least squares'}, on ${F.n} traded tokens)</span>
        <code>log₁₀ value = ${F.a.toFixed(3)} + ${F.b.toFixed(3)}·log₁₀ TVL + category${GA ? ` ${sgn(F.g, 4)}·(7d% ${sgn(-F.gm, 1)}) ${sgn(F.d, 4)}·(years ${sgn(-F.am, 2)})` : ''}</code>
        <span class="note">A pre-token row's value is what the curve says a token on that record trades at. Category effect: ${cen} residual × n/(n + ${F.k}). ${GA ? `Growth and age slopes ridge-shrunk, λ = ${F.lam}.` : '7-day change and days with no token are shown, not valued: leave-one-out was better without them.'} <a href="#/method">Method</a></span>
      </div>
      <div class="panel oos"><span class="lbl">Out of sample: leave-one-out over ${F.n} traded tokens</span>
        <div class="oosg"><div><span>Median miss</span><b class="win">${o.model.median_miss.toFixed(2)}×</b><small>flat multiple ${o.baseline.median_miss.toFixed(2)}×</small></div>
        <div><span>Within 3×</span><b class="win">${(o.model.within_3x * 100).toFixed(0)}%</b><small>flat multiple ${(o.baseline.within_3x * 100).toFixed(0)}%</small></div>
        <div><span>Rank correlation</span><b>${o.model.spearman.toFixed(2)}</b><small>flat multiple ${o.baseline.spearman.toFixed(2)}</small></div></div>
        <span class="note">${agrees ? '✓ This page rebuilt the board from the snapshot: same ' + rows.length + ' rows, same top row, same total as board.json.' : '⚠ The page and board.json disagree.'}</span>
      </div>
    </div>
    <div class="hero-r panel"><span class="lbl">Size curve: log market cap vs log TVL</span>${scatter(460, 262)}${legend}</div>`;
  }

  // planner strip and panel
  function strip() {
    return `<div class="pl-in"><span class="lbl">Budget planner</span>
      <label>Capital <span class="inp">$<input id="cap" type="number" min="100" step="500" value="${st.capital}" inputmode="numeric"></span></label>
      <label>Hours a week <span class="inp"><input id="hrs" type="number" min="0.25" step="0.25" value="${st.hours}"></span></label></div>
      <div class="pl-out" id="plsum"></div>`;
  }
  function planSummary() {
    const p = plan;
    if (!p.picks.length) return '<span class="muted">No protocol pays back its gas at this capital. Add capital or hours.</span>';
    return `<span class="big">${p.picks.length} protocols</span>
      <span>${p.picks.map((x) => `<a href="#/p/${x.row.slug}" class="pick">${esc(x.row.name)} <b>${money(x.e.deposit)}</b></a>`).join('')}</span>
      <span class="kv">gas+fees <b>${money(p.gas)}</b></span><span class="kv">${p.hours_week.toFixed(1)} h/week</span>
      <span class="kv">expected <b class="pos">${money(p.net)}</b> <small>P25–P75 ${money(p.low)} to ${money(p.high)}</small></span>
      <a class="btn" href="#/plan">Full plan →</a>`;
  }
  function planPanel() {
    const p = plan;
    return `<div class="panel plan" id="planpanel"><h2>Your plan for ${money(st.capital)} and ${st.hours} h a week</h2>
      <p class="muted">Greedy split in ${money(Math.max(50, st.capital / A.chunks))} chunks, each to where it adds the most net payout per dollar. Your share is deposit ÷ (TVL + deposit), so each extra dollar earns less; a protocol stops when the next pays more, at ${A.max_share * 100}% of capital, or when the hours run out. Opening one pays its gas first.</p>
      <table class="t"><thead><tr><th>Protocol</th><th class="n">Deposit</th><th class="n">Your share</th><th class="n">Gas + fees</th><th class="n">h/week</th><th class="n">Expected net</th><th class="n">P25–P75</th><th class="n">Net / hour</th></tr></thead><tbody>
      ${p.picks.map((x) => `<tr><td><a href="#/p/${x.row.slug}">${esc(x.row.name)}</a> <small class="muted">${esc(x.row.category || '')} · ${esc(x.row.plan.chain)}</small></td><td class="n">${money(x.e.deposit)}</td><td class="n">${(x.e.share * 100).toFixed(4)}%</td><td class="n">${money(x.e.cost)}</td><td class="n">${x.e.hours_week.toFixed(2)}</td><td class="n pos">${money(x.e.net)}</td><td class="n">${money(x.e.low)} – ${money(x.e.high)}</td><td class="n">${money(x.e.net_hr)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>Total</td><td class="n">${money(st.capital - p.unallocated)}</td><td></td><td class="n">${money(p.gas)}</td><td class="n">${p.hours_week.toFixed(2)}</td><td class="n pos">${money(p.net)}</td><td class="n">${money(p.low)} – ${money(p.high)}</td><td></td></tr></tfoot></table>
      ${p.unallocated > 1 ? `<p class="muted">${money(p.unallocated)} left unallocated: no protocol within your hours adds more than its cost.</p>` : ''}
      <p class="muted">Expected net = implied value × ${A.airdrop_share * 100}% airdrop share × your share − gas and fees, if a token launches. The range uses the value's P25–P75 band.</p></div>`;
  }

  // board
  const COLS = [
    ['rank', '#', (r) => r.rank], ['name', 'Protocol', (r) => r.name.toLowerCase()], ['value', 'Implied value · P25–P75', (r) => r.implied_value_usd],
    ['tvl', 'TVL', (r) => r.tvl_usd], ['chg', '7d', (r) => r.change_7d ?? -1e9], ['days', 'Days, no token', (r) => r.days_tracked ?? -1],
    ['be', 'Break-even', (r) => r.break_even_usd], ['pay', 'Your payout', (r) => r.me.gross], ['nhr', 'Net / hour', (r) => r.me.net_hr],
    ['verdict', 'Verdict', (r) => ({ Farm: 2, Marginal: 1, Skip: 0 })[r.me.verdict] * 1e9 + r.me.net_hr],
  ];
  const lo = Math.log10(Math.min(...rows.map((r) => r.band_low))), hi = Math.log10(Math.max(...rows.map((r) => r.band_high)));
  const bx = (v) => (((Math.log10(v) - lo) / (hi - lo)) * 100).toFixed(1);
  const band = (r) => `<span class="band" title="P25 ${money(r.band_low)} to P75 ${money(r.band_high)}"><i style="left:${bx(r.band_low)}%;width:${bx(r.band_high) - bx(r.band_low)}%"></i><b style="left:${bx(r.implied_value_usd)}%"></b></span>`;
  const cats = Object.entries(rows.reduce((m, r) => ((m[r.category || 'Uncategorised'] = (m[r.category || 'Uncategorised'] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const chains = [...new Set(rows.map((r) => r.plan.chain))].sort();

  function board() {
    return `<div class="controls">
      <input id="q" type="search" placeholder="Search a protocol, category or chain" value="${esc(st.q)}" aria-label="Search">
      <select id="chain" aria-label="Main chain"><option value="">All main chains</option>${chains.map((c) => `<option${c === st.chain ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <div class="seg" id="verdict">${['', 'Farm', 'Marginal', 'Skip'].map((v) => `<button data-v="${v}" class="${st.verdict === v ? 'on' : ''}">${v || 'All verdicts'}</button>`).join('')}</div>
      <label class="tog"><input type="checkbox" id="watch"${st.watch ? ' checked' : ''}> Watchlist only</label>
    </div>
    <div class="cats" id="cats"><button data-c="" class="${st.cat ? '' : 'on'}">All categories</button>${cats.map(([c, n]) => `<button data-c="${esc(c)}" class="${st.cat === c ? 'on' : ''}">${esc(c)} <small>${n}</small></button>`).join('')}</div>
    <div id="planslot"></div>
    <p class="count" id="count"></p>
    <div class="tw"><table class="t board"><thead><tr>${COLS.map(([k, l]) => `<th data-k="${k}" class="${k === 'name' ? '' : 'n'}" tabindex="0" aria-sort="none">${l}</th>`).join('')}</tr></thead><tbody id="rows"></tbody></table></div>`;
  }
  function filtered() {
    const q = st.q.trim().toLowerCase();
    return rows.filter((r) => (!st.cat || (r.category || 'Uncategorised') === st.cat) && (!st.chain || r.plan.chain === st.chain) && (!st.verdict || r.me.verdict === st.verdict) && (!st.watch || r.watchlist) &&
      (!q || (r.name + ' ' + r.category + ' ' + r.chains.join(' ')).toLowerCase().includes(q)));
  }
  function fillRows() {
    const key = COLS.find((c) => c[0] === st.sort)[2], list = filtered().sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir || a.rank - b.rank; });
    $('#rows').innerHTML = list.map((r) => `<tr data-s="${r.slug}" tabindex="0"${r.held ? ' class="held"' : ''}>
      <td class="n rk">${r.rank}</td>
      <td><a href="#/p/${r.slug}" class="nm">${esc(r.name)}</a>${r.watchlist ? '<span class="wl" title="On the snapshot watchlist">W</span>' : ''}${r.held ? `<span class="in" title="In your plan">${money(r.held)}</span>` : ''}<small>${esc(r.category || 'Uncategorised')} · ${esc(r.plan.chain)}${r.chains.length > 1 ? ' +' + (r.chains.length - 1) : ''}</small></td>
      <td class="n val"><b>${money(r.implied_value_usd)}</b>${band(r)}</td>
      <td class="n">${money(r.tvl_usd)}</td><td class="n ${r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : ''}">${pct(r.change_7d)}</td>
      <td class="n">${r.days_tracked ?? '—'}</td><td class="n">${money(r.break_even_usd)}</td><td class="n">${money(r.me.gross)}</td>
      <td class="n ${r.me.net_hr > 0 ? '' : 'neg'}">${money(r.me.net_hr)}</td><td class="n">${chip(r.me.verdict)}</td></tr>`).join('');
    document.querySelectorAll('th[data-k]').forEach((th) => { const on = th.dataset.k === st.sort; th.classList.toggle('sorted', on); th.setAttribute('aria-sort', on ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'); th.dataset.dir = on ? (st.dir > 0 ? '↑' : '↓') : ''; });
    const lab = COLS.find((c) => c[0] === st.sort)[1];
    $('#count').innerHTML = `Showing <b>${list.length}</b> of ${rows.length} pre-token protocols · sorted by ${esc(lab)} ${st.dir > 0 ? '↑' : '↓'} · payout and verdict at your ${money(st.capital)}`;
  }
  function bindBoard() {
    $('#q').oninput = (e) => { st.q = e.target.value; fillRows(); };
    $('#chain').onchange = (e) => { st.chain = e.target.value; fillRows(); };
    $('#watch').onchange = (e) => { st.watch = e.target.checked; fillRows(); };
    $('#verdict').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; st.verdict = b.dataset.v; $('#verdict').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); fillRows(); };
    $('#cats').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; st.cat = b.dataset.c; $('#cats').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); fillRows(); };
    const sortBy = (k) => { st.dir = st.sort === k ? -st.dir : k === 'rank' || k === 'name' ? 1 : -1; st.sort = k; fillRows(); };
    document.querySelectorAll('th[data-k]').forEach((th) => { th.onclick = () => sortBy(th.dataset.k); th.onkeydown = (e) => e.key === 'Enter' && sortBy(th.dataset.k); });
    $('#rows').onclick = (e) => { const tr = e.target.closest('tr'); if (tr && !e.target.closest('a')) location.hash = '#/p/' + tr.dataset.s; };
    $('#rows').onkeydown = (e) => { const tr = e.target.closest('tr'); if (e.key === 'Enter' && tr) location.hash = '#/p/' + tr.dataset.s; };
  }

  // detail
  function detail(r) {
    const f = r.factors, c = r.category || 'Uncategorised', ce = F.cat[c];
    const peers = R.comparables.filter((p) => (p.category || 'Uncategorised') === c).sort((a, b) => Math.abs(Math.log10(a.tvl_usd / r.tvl_usd)) - Math.abs(Math.log10(b.tvl_usd / r.tvl_usd))).slice(0, 4);
    const steps = r.plan.steps;
    return `<div class="dh"><div><p class="kicker"><a href="#/" class="back">← Board</a> Rank ${r.rank} of ${rows.length} · ${esc(c)} · ${r.chains.map(esc).join(', ') || 'no chain listed'}</p>
      <h1>${esc(r.name)} ${r.watchlist ? '<span class="wl big">Watchlist</span>' : ''}</h1>
      <p class="muted">Records no token${r.token_recorded ? ' market cap (a symbol is recorded, no trading token)' : ''} · TVL ${money(r.tvl_usd)} · 7d ${pct(r.change_7d)} · tracked ${r.days_tracked ?? 'unknown'} days with no token</p></div>
      <div class="dv"><span class="lbl">Implied value</span><b>${money(r.implied_value_usd)}</b><span>P25–P75 ${money(r.band_low)} – ${money(r.band_high)}</span>${band(r)}</div></div>
    <div class="grid2"><div>
      <div class="panel"><h2>How the value is built</h2><table class="t math"><tbody>
        <tr><td>Size curve</td><td>10^(${F.a.toFixed(3)} + ${F.b.toFixed(3)} × ${Math.log10(r.tvl_usd).toFixed(3)}), where ${Math.log10(r.tvl_usd).toFixed(3)} = log₁₀ of TVL ${money(r.tvl_usd)}</td><td class="n"><b>${money(f.size_usd)}</b></td></tr>
        <tr><td>Category</td><td>${esc(c)}: ${ce ? `${cen} residual ${sgn(ce.raw, 2)} over ${ce.n} traded, shrunk × ${ce.n}/(${ce.n} + ${F.k})` : 'no traded comparable, effect 0'}</td><td class="n">${x2(f.category)}</td></tr>
        <tr><td>7-day growth</td><td>${pct(r.change_7d)}${GA ? ` → clamped ${pct(f.growth_pct)} vs mean ${pct(F.gm)}, coefficient ${F.g.toFixed(4)}` : nv}</td><td class="n">${x2(f.growth)}</td></tr>
        <tr><td>Time, no token</td><td>${r.days_tracked ?? 'unknown'} days${GA ? `, ${f.age_years.toFixed(2)} years${f.age_imputed ? ' (no listing date: median used)' : ''} vs mean ${F.am.toFixed(2)}, coefficient ${F.d.toFixed(4)}` : nv}</td><td class="n">${x2(f.age)}</td></tr>
        <tr class="sum"><td>Implied value</td><td>${money(f.size_usd)} ${x2(f.category)} ${x2(f.growth)} ${x2(f.age)}</td><td class="n"><b>${money(r.implied_value_usd)}</b></td></tr>
        <tr><td>Band</td><td>× 10^${o.q25.toFixed(2)} and × 10^${o.q75.toFixed(2)}: the 25th and 75th percentile leave-one-out misses</td><td class="n">${money(r.band_low)} – ${money(r.band_high)}</td></tr>
      </tbody></table>
      ${peers.length ? `<p class="muted peers">Nearest traded ${esc(c)} tokens by TVL: ${peers.map((p) => `${esc(p.name)} ${money(p.mcap_usd)} on ${money(p.tvl_usd)} TVL`).join(' · ')}</p>` : ''}</div>
      <div class="panel"><h2>Farm plan on ${esc(r.plan.chain)} <small class="muted">gas ${money(r.plan.gas)} a transaction · ${M.kindOf(r.category)} template · costs at your ${money(st.capital)}</small></h2>
      <table class="t steps"><thead><tr><th>#</th><th>Step, and why</th><th class="n">Cost</th><th>Time</th></tr></thead><tbody>
      ${steps.map((s, i) => `<tr><td class="n">${i + 1}</td><td>${esc(s.step)}<small>${esc(s.why)}</small></td><td class="n">${money(s.fixed + (s.bps / 1e4) * st.capital)}</td><td>${esc(s.time)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td></td><td>Total over ${M.WEEKS} weeks</td><td class="n" id="dcost"></td><td>${(r.plan.minutes / 60).toFixed(1)} h hands-on</td></tr></tfoot></table></div>
    </div><div>
      <div class="panel" id="econ"></div>
      <div class="panel"><h2>Position on the curve</h2>${scatter(460, 230, r.slug, r.name)}${legend}</div>
    </div></div>`;
  }
  function econBox(r) {
    const e = r.me;
    $('#dcost').textContent = money(e.cost);
    $('#econ').innerHTML = `<h2>The farm in numbers at your ${money(st.capital)} ${chip(e.verdict)}</h2><div class="eq">
      <div><span>Airdrop pool</span><b>${money(r.implied_value_usd * A.airdrop_share)}</b><small>${money(r.implied_value_usd)} × ${A.airdrop_share * 100}%</small></div>
      <div><span>Your share</span><b>${(e.share * 100).toFixed(4)}%</b><small>${money(st.capital)} ÷ (${money(r.tvl_usd)} + ${money(st.capital)})</small></div>
      <div><span>Expected payout</span><b>${money(e.gross)}</b><small>if a token launches</small></div>
      <div><span>Costs</span><b>${money(e.cost)}</b><small>gas and fees, ${M.WEEKS} weeks</small></div>
      <div><span>Net</span><b class="${e.net > 0 ? 'pos' : 'neg'}">${money(e.net)}</b><small>P25–P75 ${money(e.low)} to ${money(e.high)}</small></div>
      <div><span>Net per hour</span><b>${money(e.net_hr)}</b><small>${e.hours.toFixed(1)} hands-on hours</small></div>
      <div><span>Break-even deposit</span><b>${money(r.break_even_usd)}</b><small>payout = costs</small></div>
      <div><span>Break-even odds</span><b>${Number.isFinite(e.odds) ? (e.odds * 100).toFixed(0) + '%' : '—'}</b><small>launch chance that repays the costs</small></div></div>
      <p class="pline">${r.held ? `<b>Your plan puts ${money(r.held)} here</b> (of ${money(st.capital)} across ${plan.picks.length} protocols).` : `<b>Not in your plan:</b> ${e.verdict === 'Skip' ? 'it does not clear the Farm or Marginal bar at this capital' : 'other protocols return more per dollar, or your weekly hours are spent'}.`}
      Change capital and hours in the board's planner. Verdict rule: Farm at ≥ $${A.farm_net_hr}/h and break-even odds ≤ ${A.farm_odds * 100}%; Marginal at ≥ $${A.marginal_net_hr}/h and ≤ ${A.marginal_odds * 100}%; else Skip.</p>`;
  }

  // traded and method
  const TCOLS = [['name', 'Token', (c) => c.name.toLowerCase()], ['cat', 'Category', (c) => c.category || ''], ['tvl', 'TVL', (c) => c.tvl_usd], ['mcap', 'Market cap', (c) => c.mcap_usd], ['fit', 'Curve', (c) => c.fitted_usd], ['loo', 'Left-out prediction', (c) => c.loo_usd], ['miss', 'Miss', (c) => c.miss]];
  function traded() {
    const key = TCOLS.find((c) => c[0] === st.tsort)[2], list = [...R.comparables].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * st.tdir);
    return `<div class="panel"><h2>Traded comparables <small class="muted">${R.comparables.length} tokens that trade: the market's own values, never ranked on the board</small></h2>
    <p class="muted">"Curve" is the full model's value; "Left-out prediction" refits without the token first, the honest test: median miss ${o.model.median_miss.toFixed(2)}×.</p>
    <div class="tw"><table class="t"><thead><tr>${TCOLS.map(([k, l]) => `<th data-t="${k}" class="${k === 'name' || k === 'cat' ? '' : 'n'}${k === st.tsort ? ' sorted' : ''}" data-dir="${k === st.tsort ? (st.tdir > 0 ? '↑' : '↓') : ''}">${l}</th>`).join('')}</tr></thead><tbody>
    ${list.map((c) => `<tr><td>${esc(c.name)}</td><td class="muted">${esc(c.category || '')}</td><td class="n">${money(c.tvl_usd)}</td><td class="n"><b>${money(c.mcap_usd)}</b></td><td class="n">${money(c.fitted_usd)}</td><td class="n">${money(c.loo_usd)}</td><td class="n ${c.miss <= 3 ? 'pos' : 'neg'}">${c.miss.toFixed(1)}×</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function method() {
    const ex = window.SNAPSHOT.protocols.filter((p) => M.noToken(p) && M.excludedWhy(p) && !window.SNAPSHOT.watchlist.includes(p.slug)).length;
    const gas = Object.entries(M.GAS).map(([k, v]) => `${k} ${money(v)}`).join(' · ') + ' · rollups and L2s $0.10 · any other chain $0.25';
    return `<div class="panel prose"><h2>Method</h2><ol>
    <li><b>Universe.</b> Every protocol whose record carries no market cap, no CoinGecko id and no symbol, less ${ex} wrapped, staked, bridged or exchange products (categories ${esc(M.EXCLUDED.join(', '))}; names with a version marker, an exchange prefix or the word wrapped, staked or staking), plus all ${R.watchlist_size} watchlist slugs: ${rows.length} rows. A record is not proof: they record no token.</li>
    <li><b>Comparables.</b> The ${F.n} protocols with a positive market cap. Their tokens trade, so they sit on their own tab and are never ranked.</li>
    <li><b>Size curve.</b> ${ROB ? `Huber regression of log₁₀ market cap on log₁₀ TVL by iteratively reweighted least squares: weight 1 within ${A.huber_c} (log₁₀ units) of the line, ${A.huber_c} ÷ |residual| beyond, ${A.huber_iter} rounds, so tokens priced far off their TVL pull the line less` : 'Least squares of log₁₀ market cap on log₁₀ TVL'}: a = ${F.a.toFixed(3)}, b = ${F.b.toFixed(3)}. A b below 1 means value grows slower than TVL.</li>
    <li><b>Category.</b> Each category's ${cen} residual from that line, shrunk toward 0 by n ÷ (n + ${F.k}), so a category with one traded token keeps 1/${F.k + 1} of its miss.</li>
    <li><b>Growth and age.</b> Tested on what is left: the 7-day TVL change (clamped ±${A.growth_clamp}%) and years tracked (capped at ${A.age_cap_years}; missing dates take the median, ${R.median_days} days), each slope's sum of squares scaled by (1 + λ); leave-one-out by λ: ${R.ridge_tries.map(([l, m]) => `${l ?? 'off'} ${m.toFixed(2)}×`).join(', ')}. ${GA ? `Kept at λ = ${F.lam}: g = ${F.g.toFixed(4)} per point, d = ${F.d.toFixed(4)} per year.` : `With them, at best: ${sc(C.on)}; without: ${sc(C.off)}. The miss is smaller without them, so they are left out of the value and shown as context (7d, days with no token).`}</li>
    <li><b>Out of sample.</b> Each traded token is left out, the whole model (the ${ROB ? 'robust' : 'least-squares'} line too) is refitted and the token predicted. Median miss ${o.model.median_miss.toFixed(2)}× against ${o.baseline.median_miss.toFixed(2)}× for one flat median market-cap-to-TVL multiple; ${(o.model.within_3x * 100).toFixed(0)}% within 3× against ${(o.baseline.within_3x * 100).toFixed(0)}%; rank correlation ${o.model.spearman.toFixed(2)} against ${o.baseline.spearman.toFixed(2)}, about level, because TVL alone sets most of the order. Earlier model (least-squares line, mean category effect, k = ${A.ols_shrink_k}, growth and age at λ = ${C.ols.lam}): ${sc(C.ols)}. Robust: ${sc(C.robust)}. The board uses the smaller median miss. The band is the 25th to 75th percentile of the misses.</li>
    <li><b>Farm plans.</b> A template per category (lend, CDP, basis, DEX, perp, RWA, chain, prediction, vault, other) gives 4 or 5 steps on the protocol's first-listed chain. Gas per transaction: ${gas}; bridge or withdrawal fee ${money(A.bridge_fee)}; DEX entry 0.15%, basis mint 0.10%, perp volume 0.90% and prediction spread 0.20% of the deposit.</li>
    <li><b>Payout.</b> Implied value × ${A.airdrop_share * 100}% to depositors × deposit ÷ (TVL + deposit) − costs, over ${M.WEEKS} weeks, if a token launches. The product's own yield is left out and pays on top. Break-even odds = costs ÷ payout. Farm: ≥ $${A.farm_net_hr} per hands-on hour and odds ≤ ${A.farm_odds * 100}%; Marginal: ≥ $${A.marginal_net_hr} and ≤ ${A.marginal_odds * 100}%; else Skip.</li>
    <li><b>Budget planner.</b> The same econ() at your capital; greedy chunks of capital ÷ ${A.chunks}, at most ${A.max_picks} protocols and ${A.max_share * 100}% of capital in any one, within your weekly hours.</li></ol>
    <p class="muted">Implied values are this radar's claim from the snapshot's figures, not a forecast that a token will launch. Not advice.</p></div>`;
  }

  // routing
  function route() {
    const h = location.hash.replace(/^#\/?/, ''), [v, slug] = h.split('/');
    const r = v === 'p' && bySlug.get(decodeURIComponent(slug || ''));
    const name = r ? 'detail' : v === 'traded' || v === 'method' || v === 'plan' ? v : 'board';
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === name));
    $('#hero').hidden = name !== 'board' && name !== 'plan';
    $('#strip').hidden = name !== 'board' && name !== 'plan';
    const view = $('#view');
    if (r) { view.innerHTML = detail(r); econBox(r); document.title = r.name + ' · Launch Radar'; window.scrollTo(0, 0); return; }
    document.title = 'Launch Radar: pre-token protocols ranked by implied value';
    if (name === 'traded') { view.innerHTML = traded(); view.querySelectorAll('th[data-t]').forEach((th) => (th.onclick = () => { st.tdir = st.tsort === th.dataset.t ? -st.tdir : -1; st.tsort = th.dataset.t; route(); })); return; }
    if (name === 'method') { view.innerHTML = method(); return; }
    view.innerHTML = board(); bindBoard(); fillRows();
    if (name === 'plan') { $('#planslot').innerHTML = planPanel(); }
  }
  function onInput() {
    const c = +$('#cap').value, h = +$('#hrs').value;
    if (c > 0) st.capital = c;
    if (h > 0) st.hours = h;
    recompute();
    $('#plsum').innerHTML = planSummary();
    if ($('#rows')) fillRows();
    if ($('#planpanel')) $('#planslot').innerHTML = planPanel();
  }

  $('#asof').textContent = 'Snapshot ' + R.as_of;
  $('#hero').innerHTML = hero();
  $('#strip').innerHTML = strip();
  $('#foot').innerHTML = `<span>Honest by construction: every coefficient is fitted on ${F.n} traded tokens, tested leave-one-out, and no protocol name appears in the code. The page runs the same model.js that wrote board.json.</span><span>Data: DefiLlama, ${esc(R.as_of)}. An implied value is this board's claim, not a forecast. Not advice.</span>`;
  recompute();
  $('#plsum').innerHTML = planSummary();
  $('#cap').oninput = onInput;
  $('#hrs').oninput = onInput;
  window.addEventListener('hashchange', route);
  route();
})();
