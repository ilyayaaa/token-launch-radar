// Takes the three screenshots of the built dashboard: node tools/shoot.cjs [outDir] [--preview]
// Serves outDir (default ./out) on a local port, drives headless Chromium with Playwright, tunes each
// JPEG's quality so the file lands between 300 and 350 KB, then stops the server.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/root/makefun/tools/node_modules/playwright-core');

const root = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'out');
const shots = path.resolve(__dirname, '..', 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function jpeg(page, name) {
  let lo = 40, hi = 100, best = null;
  while (lo <= hi) {
    const q = Math.floor((lo + hi) / 2), buf = await page.screenshot({ type: 'jpeg', quality: q });
    if (buf.length > 350 * 1024) hi = q - 1;
    else { best = { q, buf }; if (buf.length >= 300 * 1024) break; lo = q + 1; }
  }
  if (!best) throw new Error(`${name}: no quality fits under 350 KB`);
  fs.writeFileSync(path.join(shots, name), best.buf);
  console.log(`${name}: quality ${best.q}, ${(best.buf.length / 1024).toFixed(0)} KB${best.buf.length < 300 * 1024 ? ' (UNDER 300 KB)' : ''}`);
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/dashboard/index.html`;
  const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux-arm64/chrome-headless-shell' });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    fs.mkdirSync(shots, { recursive: true });
    if (process.argv.includes('--narrow')) {
      // A phone-width check only: written beside the build, never into screenshots/.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(base + '#/');
      await page.waitForSelector('#rows tr');
      await page.screenshot({ path: path.join(root, 'narrow-board.png'), fullPage: false });
      await page.goto(base + '#/p/' + (await page.$eval('#rows tr', (tr) => tr.dataset.s)));
      await page.screenshot({ path: path.join(root, 'narrow-detail.png'), fullPage: false });
      return;
    }

    // 1: the cover, hero + planner strip + the top of the board.
    await page.goto(base + '#/');
    await page.waitForSelector('#rows tr');
    await jpeg(page, '1-board.jpg');

    // 2: a watchlist protocol's detail view (the highest-ranked watchlist row the model calls Farm).
    const slug = await page.evaluate(() => {
      const R = window.RadarModel.build(window.SNAPSHOT);
      return (R.rows.find((r) => r.watchlist && r.econ.verdict === 'Farm') || R.rows.find((r) => r.watchlist)).slug;
    });
    await page.goto(base + '#/p/' + slug);
    await page.waitForSelector('#econ h2');
    await jpeg(page, '2-detail.jpg');

    // 3: filtered: one category, Farm verdicts only, a capital typed in, the full plan open.
    await page.goto(base + '#/plan');
    await page.waitForSelector('#rows tr');
    await page.fill('#cap', '25000');
    await page.fill('#hrs', '2');
    await page.click('#cats button[data-c="Risk Curators"]');
    await page.click('#verdict button[data-v="Farm"]');
    await page.evaluate(() => window.scrollTo(0, document.querySelector('#strip').offsetTop - 64));
    await jpeg(page, '3-filtered.jpg');
  } finally {
    await browser.close();
    server.close();
  }
  console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'console: no errors');
})();
