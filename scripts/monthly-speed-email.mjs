// The monthly speed email: Google PageSpeed scores for the key pages on phone and computer,
// compared with the last test, flagging only real drops (more than 10 points, or under 80) with
// Google's main reasons. Sent on the 1st of each month at 8am NZ time by
// .github/workflows/monthly-speed-email.yml, which also saves the results in docs/speed-tests.
//
//   node scripts/monthly-speed-email.mjs --now        test and send now
//   node scripts/monthly-speed-email.mjs --now --dry  save the email to email-preview.html instead
//
// Needs PAGESPEED_API_KEY and RESEND_API_KEY.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { onlyAt8am, send, layout, h2, table, esc, posts, SITE } from './lib/email.mjs';

onlyAt8am((nz) => nz.day === 1);

// The newest published love story, and one venue page.
const today = new Date().toISOString().slice(0, 10);
const newest = Object.entries(posts()).filter(([, p]) => p.wedding && !p.draft && p.date && p.date <= today).sort((a, b) => b[1].date.localeCompare(a[1].date))[0];
const PAGES = [
  ['/', 'Home'], ['/weddings', 'Weddings'], ['/wedding-galleries', 'Love Stories'], ['/contact', 'Contact'], ['/about', 'About'],
  ...(newest ? [[`/blog/${newest[0]}`, `Newest love story (${newest[1].title.split(/\s+[|–—-]\s+/)[0]})`]] : []),
  ['/bridgewater-estate-wedding-photographer', 'Bridgewater Estate'],
];

// Run the usual speed test (3 runs each, median) and read what it saved.
const before = new Set(fs.existsSync('docs/speed-tests') ? fs.readdirSync('docs/speed-tests') : []);
const out = execFileSync('node', ['scripts/speed-test.mjs', '--why', `--pages=${PAGES.map((p) => p[0]).join(',')}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
console.log(out);
const file = out.match(/Saved to (\S+)/)?.[1];
if (!file) throw new Error('The speed test didn’t save its results.');
const results = JSON.parse(fs.readFileSync(file, 'utf8')).results;

// The previous result for each page and device, from the most recent earlier test that has it.
const earlier = [...before].filter((f) => f.endsWith('.json')).sort().reverse()
  .map((f) => JSON.parse(fs.readFileSync(`docs/speed-tests/${f}`, 'utf8')))
  .filter((t) => (t.site ?? SITE) === SITE);
const previous = (page, device) => earlier.map((t) => t.results.find((r) => r.page === page && r.device === device && !r.failed)).find(Boolean);

const colour = (s) => (s >= 90 ? '#5a7d2a' : s >= 50 ? '#b07d1a' : '#a0522d');
const flags = [];
const cell = (page, device) => {
  const r = results.find((x) => x.page === page && x.device === device);
  if (!r || r.failed) return '<span style="color:#999">didn’t run</span>';
  const p = previous(page, device);
  const diff = p ? r.score - p.score : 0;
  if (r.score < 80 || diff < -10) flags.push({ page, device, r, p });
  const arrow = !p || Math.abs(diff) < 3 ? '' : ` <span style="font-size:12px;color:${diff > 0 ? '#5a7d2a' : '#a0522d'}">${diff > 0 ? '▲' : '▼'}${Math.abs(diff)}</span>`;
  return `<strong style="color:${colour(r.score)};font-weight:600">${r.score}</strong>${arrow}`;
};
const rows = PAGES.map(([page, label]) => [`<a href="${SITE}${esc(page)}" style="color:#1a1a1a;text-decoration:none">${esc(label)}</a>`, cell(page, 'mobile'), cell(page, 'desktop')]);
const name = (page) => PAGES.find((p) => p[0] === page)?.[1] ?? page;
// Google's reasons in plain words: "script 369ms: https://www.googletagmanager.com/..." becomes
// "Google Analytics script (0.4s)".
const plain = (why) => why.replace(/^script (\d+)ms: (.*)$/, (_, ms, url) => {
  const who = /googletagmanager|google-analytics/.test(url) ? 'Google Analytics' : /facebook/.test(url) ? 'Facebook Pixel'
    : /maps\.googleapis/.test(url) ? 'Google Maps' : /momentsinlight/.test(url) ? 'The page’s own code' : /studioninja/.test(url) ? 'Studio Ninja form' : url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  return `${who} script (${(ms / 1000).toFixed(1)}s)`;
}).replace(/^LCP request discovery$/, 'The main photo is found late').replace(/^Improve image delivery/, 'Photos could be smaller');

const body = `
${table(['Page', 'Phone', 'Computer'], rows)}
<p style="margin:12px 0 0;font-size:12px;color:#888;line-height:1.6">Scores out of 100: 90+ good, 50–89 needs work. Arrows show the change since the last test; scores move a few points between tests even when nothing has changed, so small moves aren’t shown.</p>
${flags.length ? `${h2('Worth a look')}
${flags.map(({ page, device, r, p }) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.6"><strong>${esc(name(page))}</strong> on ${device === 'mobile' ? 'phone' : 'computer'}: ${r.score}${p ? ` (was ${p.score})` : ''}. Main photo shows after ${r.lcp}s.${(r.why ?? []).length ? `<br><span style="color:#666">Slowed by: ${r.why.slice(0, 3).map((w) => esc(plain(w))).join('; ')}</span>` : ''}</p>`).join('')}
<p style="margin:0;font-size:14px;color:#555">Send this to Claude Code and ask it to look into it.</p>`
  : `<p style="margin:22px 0 0;font-size:15px;color:#5a5e3b">All good: nothing has slowed down. 🎉</p>`}`;

const month = new Date().toLocaleDateString('en-NZ', { month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland' });
const subject = flags.length ? `Website speed, ${month}: ${flags.length} ${flags.length === 1 ? 'page' : 'pages'} worth a look` : `Website speed, ${month}: all good`;
await send(subject, layout(`Website speed for ${month}`, 'Google PageSpeed scores for your key pages (the middle of 3 tests each).', body));
