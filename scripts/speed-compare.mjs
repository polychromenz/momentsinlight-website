// Compares page speed of the old Squarespace site and the new Cloudflare site, using Google's
// PageSpeed Insights (Lighthouse run on Google's servers, so the results don't depend on this
// computer's connection, and match what pagespeed.web.dev shows).
//
//   node scripts/speed-compare.mjs [runs]      (default 3 runs per page, per device)
//
// Each page is measured on mobile (mid-range phone, slow 4G) and desktop; the median run by
// score is kept. Writes docs/speed-compare.json and prints a table.
//
// Google's keyless allowance is shared by everyone and often used up, so it reads a free
// PAGESPEED_API_KEY from .env (Google Cloud > APIs & Services > PageSpeed Insights API).
import fs from 'node:fs';

const RUNS = Number(process.argv[2] || 3);
const env = Object.fromEntries(
  (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '').split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const KEY = env.PAGESPEED_API_KEY ? `&key=${env.PAGESPEED_API_KEY}` : '';
const OLD = 'https://www.momentsinlight.co.nz';
const NEW = 'https://momentsinlight-website.pages.dev';
const PAGES = process.env.PAGES ? process.env.PAGES.split(',') : ['/', '/weddings', '/blog/ellie-and-ryan-tui-hills', '/abel-estate', '/portraits'];

const run = async (url, strategy) => {
  for (let tries = 0; tries < 4; tries++) {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?category=performance&strategy=${strategy}&url=${encodeURIComponent(url)}${KEY}`);
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 20000)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const lh = (await r.json()).lighthouseResult;
    const a = lh.audits;
    return {
      score: Math.round(lh.categories.performance.score * 100),
      lcp: a['largest-contentful-paint'].numericValue / 1000,
      fcp: a['first-contentful-paint'].numericValue / 1000,
      tbt: Math.round(a['total-blocking-time'].numericValue),
      cls: Math.round(a['cumulative-layout-shift'].numericValue * 1000) / 1000,
      mb: a['total-byte-weight'].numericValue / 1e6,
      requests: a['network-requests']?.details?.items?.length ?? null,
    };
  }
  throw new Error('rate limited (add PAGESPEED_API_KEY to .env)');
};
const median = (rs) => [...rs].sort((x, y) => x.score - y.score)[Math.floor(rs.length / 2)];
const f = (r) => r ? `${String(r.score).padStart(3)}  LCP ${r.lcp.toFixed(1)}s  ${r.mb.toFixed(1)}MB  ${String(r.requests).padStart(3)} req` : 'failed';

const results = [];
for (const strategy of ['mobile', 'desktop']) {
  for (const page of PAGES) {
    const row = { device: strategy, page };
    // Old and new run in parallel so both see the same moment's network conditions.
    await Promise.all([['old', OLD], ['new', NEW]].map(async ([site, base]) => {
      const rs = [];
      for (let i = 0; i < RUNS; i++) {
        try { rs.push(await run(base + page, strategy)); } catch (e) { console.warn(`  ${site} ${page} ${strategy} run ${i + 1}: ${e.message}`); }
      }
      row[site] = rs.length ? median(rs) : null;
    }));
    results.push(row);
    console.log(`${strategy.padEnd(7)} ${page.padEnd(30)} old ${f(row.old)}   |   new ${f(row.new)}`);
  }
}
fs.writeFileSync('docs/speed-compare.json', JSON.stringify({ date: new Date().toISOString(), runs: RUNS, results }, null, 1) + '\n');
