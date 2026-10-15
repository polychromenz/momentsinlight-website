// Speed health check for the live site, using Google PageSpeed Insights (Lighthouse run on
// Google's servers: the same numbers as pagespeed.web.dev and what Google uses for rankings).
// See docs/speed-testing.md.
//
//   node scripts/speed-test.mjs                    key pages, mobile and desktop, 3 runs each
//   node scripts/speed-test.mjs --runs=1           quicker, less reliable
//   node scripts/speed-test.mjs --pages=/,/about   other pages
//   node scripts/speed-test.mjs --why              also list what slows each page down
//   node scripts/speed-test.mjs --site=https://momentsinlight-website.pages.dev   another address
//
// Needs PAGESPEED_API_KEY in .env (free; Google's keyless allowance is shared and usually used
// up). Each run is saved to docs/speed-tests/<date>.json.
import fs from 'node:fs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const RUNS = Number(arg('runs', 3));
const SITE = arg('site', 'https://www.momentsinlight.co.nz').replace(/\/$/, '');
const PAGES = arg('pages', '/,/weddings,/blog/ellie-and-ryan-tui-hills,/abel-estate,/portraits,/premium-portraits,/wedding-photo-guide').split(',');
const WHY = process.argv.includes('--why');

const env = Object.fromEntries(
  (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '').split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const KEY = env.PAGESPEED_API_KEY || process.env.PAGESPEED_API_KEY;
if (!KEY) {
  console.error('Add PAGESPEED_API_KEY to .env first (see docs/speed-testing.md).');
  process.exit(1);
}

// One PageSpeed run. Retries when Google is busy.
const run = async (url, strategy) => {
  for (let tries = 0; tries < 4; tries++) {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?category=performance&strategy=${strategy}&url=${encodeURIComponent(url)}&key=${KEY}`);
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 15000)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const lh = (await r.json()).lighthouseResult;
    const a = lh.audits;
    const result = {
      score: Math.round(lh.categories.performance.score * 100),
      lcp: +(a['largest-contentful-paint'].numericValue / 1000).toFixed(1),
      fcp: +(a['first-contentful-paint'].numericValue / 1000).toFixed(1),
      tbt: Math.round(a['total-blocking-time'].numericValue),
      cls: +a['cumulative-layout-shift'].numericValue.toFixed(3),
      mb: +(a['total-byte-weight'].numericValue / 1e6).toFixed(2),
      requests: a['network-requests']?.details?.items?.length ?? null,
    };
    if (WHY) result.why = reasons(a);
    return result;
  }
  throw new Error('Google busy (rate limited)');
};

// The main things holding a page back, in plain terms.
const reasons = (a) => {
  const out = [];
  for (const it of (a['bootup-time']?.details?.items || []).filter((i) => i.total > 150).slice(0, 4)) {
    out.push(`script ${Math.round(it.total)}ms: ${String(it.url).replace(/\?.*/, '').slice(0, 70)}`);
  }
  for (const it of (a['layout-shifts']?.details?.items || []).slice(0, 2)) {
    out.push(`layout shift ${it.score?.toFixed(3)}: ${(it.node?.nodeLabel || '').slice(0, 50)}`);
  }
  for (const id of ['render-blocking-insight', 'image-delivery-insight', 'lcp-discovery-insight', 'font-display-insight']) {
    const x = a[id];
    if (x && x.score !== null && x.score < 0.9) out.push(`${x.title}${x.displayValue ? ` (${x.displayValue})` : ''}`);
  }
  return out;
};

const median = (rs) => [...rs].sort((x, y) => x.score - y.score)[Math.floor(rs.length / 2)];
const pad = (s, n) => String(s).padEnd(n);

console.log(`PageSpeed Insights for ${SITE}, median of ${RUNS} run${RUNS > 1 ? 's' : ''}\n`);
console.log(`${pad('device', 8)}${pad('page', 32)}${pad('score', 7)}${pad('LCP', 7)}${pad('FCP', 7)}${pad('TBT', 8)}${pad('CLS', 7)}${pad('MB', 6)}files`);
const results = [];
for (const device of ['mobile', 'desktop']) {
  // Pages run side by side (Google allows a few at once); runs of one page one after another.
  const rows = await Promise.all(PAGES.map(async (page) => {
    const rs = [];
    for (let i = 0; i < RUNS; i++) {
      try { rs.push(await run(SITE + page, device)); } catch (e) { console.warn(`  ${page} ${device} run ${i + 1}: ${e.message}`); }
    }
    return { device, page, ...(rs.length ? median(rs) : { failed: true }) };
  }));
  for (const r of rows) {
    results.push(r);
    if (r.failed) { console.log(`${pad(device, 8)}${pad(r.page, 32)}failed`); continue; }
    console.log(`${pad(device, 8)}${pad(r.page, 32)}${pad(r.score, 7)}${pad(r.lcp.toFixed(1) + 's', 7)}${pad(r.fcp.toFixed(1) + 's', 7)}${pad(r.tbt + 'ms', 8)}${pad(r.cls, 7)}${pad(r.mb, 6)}${r.requests}`);
    for (const w of r.why || []) console.log(`${' '.repeat(10)}- ${w}`);
  }
}

const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }); // NZ date, YYYY-MM-DD
fs.mkdirSync('docs/speed-tests', { recursive: true });
let file = `docs/speed-tests/${date}.json`;
for (let n = 2; fs.existsSync(file); n++) file = `docs/speed-tests/${date}-${n}.json`;
fs.writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), site: SITE, runs: RUNS, results }, null, 1) + '\n');
console.log(`\nSaved to ${file}`);
console.log('Scores: 90+ good, 50-89 needs work, under 50 poor. LCP (main photo shown): under 2.5s good. CLS: under 0.1 good.');
