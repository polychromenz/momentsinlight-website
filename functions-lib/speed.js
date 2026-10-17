// The monthly speed email, run by the timer (functions/api/crm/run.js) instead of GitHub: from
// 8am NZ on the 1st, Google PageSpeed tests the key pages on phone and computer (3 runs each,
// the middle score counts), a couple of pages per timer run so no run takes long, then compares
// with last month and emails Tony, flagging only real problems (as scripts/monthly-speed-email.mjs
// did). Progress is kept in settings 'speed_run'; past months in 'speed_history' (last 13).
// Needs PAGESPEED_API_KEY and RESEND_API_KEY.
import { nzNow, builtPosts } from './schedules.js';

const SITE = 'https://www.momentsinlight.co.nz';
const RUNS = 3;
const PER_RUN = 2; // page + device pairs tested per timer run (each ~20–40s, side by side)
const STALE = 4 * 60_000; // a pair taken by a run that died is retried after this

// ---- Google PageSpeed ----
const reasons = (a) => {
  const out = [];
  for (const it of (a['bootup-time']?.details?.items || []).filter((i) => i.total > 150).slice(0, 4)) out.push(`script ${Math.round(it.total)}ms: ${String(it.url).replace(/\?.*/, '').slice(0, 70)}`);
  for (const it of (a['layout-shifts']?.details?.items || []).slice(0, 2)) out.push(`layout shift ${it.score?.toFixed(3)}: ${(it.node?.nodeLabel || '').slice(0, 50)}`);
  for (const id of ['render-blocking-insight', 'image-delivery-insight', 'lcp-discovery-insight', 'font-display-insight']) {
    const x = a[id];
    if (x && x.score !== null && x.score < 0.9) out.push(`${x.title}${x.displayValue ? ` (${x.displayValue})` : ''}`);
  }
  return out;
};
async function pagespeed(env, url, strategy) {
  for (let tries = 0; tries < 2; tries++) {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?category=performance&strategy=${strategy}&url=${encodeURIComponent(url)}&key=${env.PAGESPEED_API_KEY}`);
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 5000)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const lh = (await r.json()).lighthouseResult;
    const a = lh.audits;
    return {
      score: Math.round(lh.categories.performance.score * 100),
      lcp: +(a['largest-contentful-paint'].numericValue / 1000).toFixed(1),
      fcp: +(a['first-contentful-paint'].numericValue / 1000).toFixed(1),
      tbt: Math.round(a['total-blocking-time'].numericValue),
      cls: +a['cumulative-layout-shift'].numericValue.toFixed(3),
      mb: +(a['total-byte-weight'].numericValue / 1e6).toFixed(2),
      why: reasons(a),
    };
  }
  throw new Error('Google busy');
}
async function testPair(env, page, device) {
  const rs = (await Promise.all(Array.from({ length: RUNS }, () => pagespeed(env, SITE + page, device).catch(() => null)))).filter(Boolean);
  if (!rs.length) return { page, device, failed: true };
  return { page, device, ...[...rs].sort((x, y) => x.score - y.score)[Math.floor(rs.length / 2)] };
}

// ---- Progress in settings (compare-and-swap, so two timer runs don't clash) ----
const read = async (db, key) => db.prepare('SELECT value FROM settings WHERE key = ?1').bind(key).first();
async function swap(db, key, oldRaw, next) {
  const raw = JSON.stringify(next);
  const r = oldRaw === null
    ? await db.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)').bind(key, raw, new Date().toISOString()).run()
    : await db.prepare('UPDATE settings SET value = ?2, updated_at = ?3 WHERE key = ?1 AND value = ?4').bind(key, raw, new Date().toISOString(), oldRaw).run();
  return r.meta.changes > 0;
}

/** The pages tested: the main ones, the newest published love story, and a venue page. */
async function pagesToTest(env, today) {
  let newest = null;
  try {
    const { posts } = await builtPosts(env);
    newest = posts.filter((p) => p.categories.includes('Wedding') && !p.draft && p.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  } catch { /* the rest still get tested */ }
  return [
    ['/', 'Home'], ['/weddings', 'Weddings'], ['/wedding-galleries', 'Love Stories'], ['/contact', 'Contact'], ['/about', 'About'],
    ...(newest ? [[`/blog/${newest.id}`, `Newest love story (${newest.title.split(/\s+[|–—-]\s+/)[0]})`]] : []),
    ['/bridgewater-estate-wedding-photographer', 'Bridgewater Estate'],
  ];
}

/** Each timer run: start on the 1st from 8am, test the next pages, and send when all are done. */
export async function monthlySpeed(env, { now = false } = {}) {
  const db = env.DB;
  if (!env.PAGESPEED_API_KEY) return 'PAGESPEED_API_KEY isn’t set';
  const nz = nzNow();
  const month = nz.date.slice(0, 7);
  let row = await read(db, 'speed_run');
  let st = row ? JSON.parse(row.value) : null;
  if (!st || st.month !== month || (now && st.sent)) {
    if (!now && (nz.date.slice(8) !== '01' || nz.hour < 8)) return 'not the 1st';
    const pages = await pagesToTest(env, nz.date);
    const fresh = { month, started: new Date().toISOString(), pages, pairs: ['mobile', 'desktop'].flatMap((d) => pages.map(([p]) => [p, d])), taken: {}, results: [], sent: false };
    if (!(await swap(db, 'speed_run', row ? row.value : null, fresh))) return 'busy';
    row = await read(db, 'speed_run'); st = JSON.parse(row.value);
  }
  if (st.sent) return 'sent this month';
  const key = (p, d) => `${d} ${p}`;
  const done = new Set(st.results.map((r) => key(r.page, r.device)));
  const pending = st.pairs.filter(([p, d]) => !done.has(key(p, d)));
  if (pending.length) {
    const t = Date.now();
    const pick = pending.filter(([p, d]) => !st.taken[key(p, d)] || t - st.taken[key(p, d)] > STALE).slice(0, PER_RUN);
    if (!pick.length) return `waiting (${pending.length} being tested)`;
    const claimed = { ...st, taken: { ...st.taken, ...Object.fromEntries(pick.map(([p, d]) => [key(p, d), t])) } };
    if (!(await swap(db, 'speed_run', row.value, claimed))) return 'busy';
    const results = await Promise.all(pick.map(([p, d]) => testPair(env, p, d)));
    for (let tries = 0; tries < 5; tries++) {
      row = await read(db, 'speed_run'); st = JSON.parse(row.value);
      const have = new Set(st.results.map((r) => key(r.page, r.device)));
      const next = { ...st, results: [...st.results, ...results.filter((r) => !have.has(key(r.page, r.device)))] };
      if (await swap(db, 'speed_run', row.value, next)) { st = next; row = { value: JSON.stringify(next) }; break; }
    }
    if (st.results.length < st.pairs.length) return `tested ${st.results.length} of ${st.pairs.length}`;
  }
  // All tested: claim the send, compare with last month, email, keep the history.
  if (!(await swap(db, 'speed_run', row.value, { ...st, sent: true }))) return 'busy';
  try {
    const histRow = await read(db, 'speed_history');
    const history = histRow ? JSON.parse(histRow.value) : [];
    const subject = await sendSpeedEmail(env, st, history);
    const entry = { date: st.started, site: SITE, runs: RUNS, results: st.results };
    await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('speed_history', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
      .bind(JSON.stringify([entry, ...history].slice(0, 13)), new Date().toISOString()).run();
    return `sent: ${subject}`;
  } catch (e) {
    const cur = await read(db, 'speed_run');
    await swap(db, 'speed_run', cur.value, { ...JSON.parse(cur.value), sent: false });
    throw e;
  }
}

// ---- The email (as scripts/monthly-speed-email.mjs) ----
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SLOW_PHOTO = { mobile: 4, desktop: 2.5 }; // seconds
const realReasons = (r) => (r.why ?? []).filter((w) => {
  const script = w.match(/^script (\d+)ms: (.*)$/);
  if (script) return !/googletagmanager|google-analytics|facebook/.test(script[2]) && Number(script[1]) >= 500;
  return !/^(LCP request discovery|Improve image delivery)/.test(w);
});
const low = (r) => r && r.score < 80 && realReasons(r).length > 0;
const problems = (r, p, device) => {
  const out = [];
  if (r.lcp > SLOW_PHOTO[device]) out.push(`the main photo takes ${r.lcp}s to show`);
  if (r.cls > 0.1) out.push('the page jumps about while it loads');
  if (low(r) && low(p)) out.push(`the score has been under 80 two months running (${p.score}, now ${r.score})`);
  return out;
};
const plain = (why) => why.replace(/^script (\d+)ms: (.*)$/, (_, ms, url) => {
  const who = /googletagmanager|google-analytics/.test(url) ? 'Google Analytics' : /facebook/.test(url) ? 'Facebook Pixel'
    : /maps\.googleapis/.test(url) ? 'Google Maps' : /momentsinlight/.test(url) ? 'The page’s own code' : /studioninja/.test(url) ? 'Studio Ninja form' : url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  return `${who} script (${(ms / 1000).toFixed(1)}s)`;
}).replace(/^LCP request discovery$/, 'The main photo is found late').replace(/^Improve image delivery/, 'Photos could be smaller');
const colour = (s) => (s >= 90 ? '#5a7d2a' : s >= 50 ? '#b07d1a' : '#a0522d');
const layout = (heading, intro, body) => `<!doctype html><html><body style="margin:0;padding:0;background:#f6f1ea;font-family:Raleway,'Helvetica Neue',Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ea"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:28px 0">
<tr><td style="padding:30px 30px 6px">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#5a5e3b">Moments in Light</p>
<h1 style="margin:0 0 10px;font-size:26px;font-weight:300;color:#1a1a1a">${heading}</h1>
<p style="margin:0;font-size:14px;line-height:1.6;color:#555">${intro}</p>
</td></tr>
<tr><td style="padding:10px 30px 30px">${body}</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#888">Sent automatically by your website.</p>
</td></tr></table></body></html>`;
const h2 = (t) => `<h2 style="margin:26px 0 10px;font-size:17px;font-weight:400;color:#1a1a1a">${t}</h2>`;
function table(head, rows) {
  const cell = (c, i, th) => `<${th ? 'th' : 'td'} style="padding:7px 6px;border-bottom:1px solid ${th ? '#e8e1d5' : '#f3eee6'};text-align:${i ? 'right' : 'left'};font-size:${th ? 11 : 14}px;${th ? 'letter-spacing:1px;text-transform:uppercase;color:#777;font-weight:600' : ''}">${c}</${th ? 'th' : 'td'}>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
<tr>${head.map((c, i) => cell(c, i, true)).join('')}</tr>
${rows.map((r) => `<tr>${r.map((c, i) => cell(c, i)).join('')}</tr>`).join('')}
</table>`;
}

export async function sendSpeedEmail(env, st, history) {
  const cutoff = new Date(st.started).valueOf() - 20 * 86400_000;
  const lastMonth = history.filter((t) => (t.site ?? SITE) === SITE && new Date(t.date).valueOf() <= cutoff);
  const previous = (page, device) => lastMonth.map((t) => t.results.find((r) => r.page === page && r.device === device && !r.failed)).find(Boolean);
  const flags = [];
  const cell = (page, device) => {
    const r = st.results.find((x) => x.page === page && x.device === device);
    if (!r || r.failed) return '<span style="color:#999">didn’t run</span>';
    const p = previous(page, device);
    const found = problems(r, p, device);
    if (found.length) flags.push({ page, device, r, found });
    const diff = p ? r.score - p.score : 0;
    const arrow = !p || Math.abs(diff) < 5 ? '' : ` <span style="font-size:12px;color:#999">${diff > 0 ? '▲' : '▼'}${Math.abs(diff)}</span>`;
    return `<strong style="color:${colour(r.score)};font-weight:600">${r.score}</strong>${arrow}`;
  };
  const rows = st.pages.map(([page, label]) => [`<a href="${SITE}${esc(page)}" style="color:#1a1a1a;text-decoration:none">${esc(label)}</a>`, cell(page, 'mobile'), cell(page, 'desktop')]);
  const name = (page) => st.pages.find((p) => p[0] === page)?.[1] ?? page;
  const body = `
${table(['Page', 'Phone', 'Computer'], rows)}
<p style="margin:12px 0 0;font-size:12px;color:#888;line-height:1.6">Scores out of 100: 90+ good, 50–89 needs work. Small grey arrows show the change since last month. Google’s scores move from test to test even when nothing has changed; computer scores especially swing between about 75 and 98, depending on when Google Analytics and the Facebook Pixel start. That’s normal and visitors don’t notice it, so a score on its own isn’t flagged.</p>
${flags.length ? `${h2('Worth a look')}
${flags.map(({ page, device, r, found }) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.6"><strong>${esc(name(page))}</strong> on ${device === 'mobile' ? 'phone' : 'computer'}: ${found.map(esc).join('; ')}.${(r.why ?? []).length ? `<br><span style="color:#666">Slowed by: ${r.why.slice(0, 3).map((w) => esc(plain(w))).join('; ')}</span>` : ''}</p>`).join('')}
<p style="margin:0;font-size:14px;color:#555">Send this to Claude Code and ask it to look into it.</p>`
    : `<p style="margin:22px 0 0;font-size:15px;color:#5a5e3b">All good: every page shows its main photo quickly and nothing jumps about while loading. 🎉</p>`}`;
  const month = new Date(st.started).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland' });
  const subject = flags.length ? `Website speed, ${month}: ${flags.length} ${flags.length === 1 ? 'page' : 'pages'} worth a look` : `Website speed, ${month}: all good`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'Moments in Light <reports@momentsinlight.co.nz>', to: ['tony@momentsinlight.co.nz'], subject,
      html: layout(`Website speed for ${month}`, 'Google PageSpeed scores for your key pages (the middle of 3 tests each).', body) }),
  });
  if (!r.ok) throw new Error(`Resend said ${r.status}`);
  return subject;
}
