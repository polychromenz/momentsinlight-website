// Jobs the timer (functions/api/crm/run.js, every 5 minutes) does once a day or once a week,
// which used to be GitHub schedules (GitHub runs those late or skips them):
//   publishScheduledPosts  from 6am NZ: a post dated today (or one missed) that isn't on the site
//                          yet → rebuild the site (an empty commit, like a studio save)
//   weeklyStatsEmail       Friday 8am NZ: last week's visitors, top pages and love stories, where
//                          visitors came from (Cloudflare Web Analytics), as scripts/weekly-stats-email.mjs did
// Each claims its day in `settings` first, so two timer runs can't both do it.
import { github, BRANCH } from './studio.js';

const SITE = 'https://www.momentsinlight.co.nz';
const HOST = 'www.momentsinlight.co.nz';

/** The date, hour and weekday in New Zealand. */
export function nzNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday };
}

/** Claim a once-a-day job for today; false if it's already been done (or is being done). */
async function claim(db, key, today) {
  const r = await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
    ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = ?3 WHERE json_extract(settings.value, '$.last') IS NOT ?4`)
    .bind(key, JSON.stringify({ last: today }), new Date().toISOString(), today).run();
  return r.meta.changes > 0;
}
const release = (db, key) => db.prepare(`UPDATE settings SET value = '{}' WHERE key = ?1`).bind(key).run();

/** The site's post list as built (dates, drafts, categories), and when it was built. */
async function builtPosts(env) {
  const r = await env.ASSETS.fetch(new Request(`${SITE}/studio/posts.json`));
  if (!r.ok) throw new Error(`posts.json: ${r.status}`);
  return r.json();
}

// ---- Scheduled posts ----
export async function publishScheduledPosts(env) {
  const nz = nzNow();
  if (nz.hour < 6) return 'too early';
  if (!(await claim(env.DB, 'publish_check', nz.date))) return 'done today';
  try {
    const { builtAt, posts } = await builtPosts(env);
    const builtDay = nzNow(new Date(builtAt)).date;
    // Dated after the last build and on or before today: due, but not on the site yet.
    const due = posts.filter((p) => !p.draft && p.date > builtDay && p.date <= nz.date);
    if (!due.length) return 'nothing to publish';
    if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN isn’t set');
    // An empty commit on main: Cloudflare Pages rebuilds, and the post appears.
    const ref = (await github(env, `git/ref/heads/${BRANCH}`)).data;
    const head = (await github(env, `git/commits/${ref.object.sha}`)).data;
    const commit = (await github(env, 'git/commits', { method: 'POST', body: JSON.stringify({
      message: `Publish scheduled post${due.length > 1 ? 's' : ''}: ${due.map((p) => p.title).join(', ')}`,
      tree: head.tree.sha, parents: [ref.object.sha],
    }) })).data;
    if (!commit?.sha) throw new Error(`GitHub: ${commit?.message || 'the commit wasn’t made'}`);
    const moved = await github(env, `git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
    if (!moved.ok) throw new Error(`GitHub: ${moved.status}`);
    return `rebuilding for ${due.length} post${due.length > 1 ? 's' : ''}`;
  } catch (e) {
    await release(env.DB, 'publish_check'); // try again on the next run
    throw e;
  }
}

// ---- The weekly stats email ----
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (n) => Number(n).toLocaleString('en-NZ');
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
${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => cell(c, i)).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}" style="padding:8px 6px;color:#999;font-size:14px">Nothing yet</td></tr>`}
</table>`;
}
const button = (label, href) => `<p style="margin:28px 0 0"><a href="${href}" style="display:inline-block;padding:12px 22px;background:#5a5e3b;color:#ffffff;text-decoration:none;border-radius:14px 0;font-size:14px">${label}</a></p>`;

async function stats(env, { from, to }) {
  const filter = { AND: [{ date_geq: from, date_leq: to }, { requestHost: HOST }] };
  const group = (dims, limit) => `rumPageloadEventsAdaptiveGroups(filter: $filter, limit: ${limit}, orderBy: [count_DESC]) { count sum { visits } dimensions { ${dims} } }`;
  const query = `query Stats($account: string!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
    viewer { accounts(filter: { accountTag: $account }) {
      totals: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 1) { count sum { visits } }
      pages: ${group('requestPath', 100)}
      referrers: ${group('refererHost', 30)}
    } }
  }`;
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { account: env.CF_ACCOUNT_ID, filter } }),
  });
  const d = await r.json();
  if (!r.ok || d.errors?.length) throw new Error(`Cloudflare: ${d.errors?.[0]?.message ?? r.status}`);
  const a = d.data.viewer.accounts[0];
  const rows = (list, key) => list.map((g) => ({ key: g.dimensions[key] || '', views: g.count, visits: g.sum.visits }));
  return { views: a.totals[0]?.count ?? 0, visits: a.totals[0]?.sum.visits ?? 0, pages: rows(a.pages, 'requestPath'), referrers: rows(a.referrers, 'refererHost') };
}

const pageNames = {
  '/': 'Home', '/weddings': 'Weddings', '/wedding-galleries': 'Love Stories', '/portraits': 'Portraits', '/portraits-gallery': 'Portrait galleries',
  '/family': 'Family', '/family-galleries': 'Family galleries', '/premium-portraits': 'Premium portraits', '/headshots': 'Headshots', '/lifestyle': 'Lifestyle',
  '/about': 'About', '/contact': 'Contact', '/testimonials': 'Testimonials', '/wedding-faqs': 'FAQs', '/wedding-photo-guide': 'Wedding photo guide',
  '/a-guide-to-your-wedding-photos': 'How I work', '/wedding-resources': 'Wedding resources', '/west-auckland-wedding-venues': 'West Auckland venues', '/blog': 'Blog',
};
const source = (h) => {
  if (!h) return 'Typed in or bookmarked';
  if (/google\./.test(h)) return 'Google';
  if (/instagram/.test(h)) return 'Instagram';
  if (/facebook|fb\.com/.test(h)) return 'Facebook';
  if (/pinterest/.test(h)) return 'Pinterest';
  if (/bing\./.test(h)) return 'Bing';
  if (/myweddingguide/.test(h)) return 'My Wedding Guide';
  if (/momentsinlight/.test(h)) return null; // moving around your own site
  return h.replace(/^www\./, '');
};
const merge = (rows, f) => {
  const out = new Map();
  for (const r of rows) {
    const k = f(r.key);
    if (k === null) continue;
    const cur = out.get(k) ?? { key: k, views: 0, visits: 0 };
    cur.views += r.views; cur.visits += r.visits;
    out.set(k, cur);
  }
  return [...out.values()].sort((a, b) => b.views - a.views);
};
const change = (now, before) => {
  if (!before) return '';
  const pct = Math.round(((now - before) / before) * 100);
  const colour = pct > 0 ? '#5a7d2a' : pct < 0 ? '#a0522d' : '#888';
  return `<span style="font-size:13px;color:${colour}">${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)}% on the week before</span>`;
};

/** Build and send the weekly stats email now. */
export async function sendWeeklyStats(env) {
  if (!env.CF_ANALYTICS_TOKEN || !env.RESEND_API_KEY) throw new Error('CF_ANALYTICS_TOKEN or RESEND_API_KEY isn’t set');
  const day = (d) => d.toISOString().slice(0, 10);
  const ago = (n) => new Date(Date.now() - n * 86400_000);
  const thisWeek = { from: day(ago(7)), to: day(ago(1)) };
  const lastWeek = { from: day(ago(14)), to: day(ago(8)) };
  const [now, before, built] = await Promise.all([stats(env, thisWeek), stats(env, lastWeek), builtPosts(env)]);
  const all = Object.fromEntries(built.posts.map((p) => [p.id, { title: p.title, wedding: p.categories.includes('Wedding') }]));
  const postId = (p) => p.match(/^\/blog\/(?!page\/|category\/|tag\/)([^/]+)$/)?.[1];
  const name = (p) => pageNames[p] ?? all[postId(p)]?.title ?? p;
  const pages = merge(now.pages, (k) => k.replace(/\/$/, '') || '/');
  const stories = pages.filter((p) => all[postId(p.key)]?.wedding);
  const sources = merge(now.referrers, source);
  const fmt = (d) => new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const link = (p) => `<a href="${SITE}${esc(p)}" style="color:#1a1a1a;text-decoration:none">${esc(name(p))}</a>`;
  const tile = (n, label, delta) => `<td width="50%" style="padding:16px 18px;background:#f6f1ea;border-radius:20px 0;vertical-align:top">
  <div style="font-size:30px;font-weight:300">${num(n)}</div>
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#5a5e3b;margin:4px 0 6px">${label}</div>${delta}</td>`;
  const body = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  ${tile(now.visits, 'Visits', change(now.visits, before.visits))}
  <td width="12"></td>
  ${tile(now.views, 'Page views', change(now.views, before.views))}
</tr></table>
${h2('Top pages')}
${table(['Page', 'Views'], pages.slice(0, 5).map((p) => [link(p.key), num(p.views)]))}
${h2('Top love stories')}
${table(['Love story', 'Views'], stories.slice(0, 5).map((p) => [link(p.key), num(p.views)]))}
${h2('Where visitors came from')}
${table(['Source', 'Views'], sources.slice(0, 5).map((s) => [esc(s.key), num(s.views)]))}
${button('See all your stats', `${SITE}/studio/stats`)}`;
  const subject = `Your week: ${num(now.visits)} visits (${fmt(thisWeek.from)} – ${fmt(thisWeek.to)})`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'Moments in Light <reports@momentsinlight.co.nz>', to: ['tony@momentsinlight.co.nz'], subject,
      html: layout('Your week on the website', `${fmt(thisWeek.from)} – ${fmt(thisWeek.to)}, compared with the 7 days before.`, body) }),
  });
  if (!r.ok) throw new Error(`Resend said ${r.status}`);
  return subject;
}

/** Friday from 8am (until midday) NZ: the weekly stats email, once. */
export async function weeklyStatsEmail(env) {
  const nz = nzNow();
  if (nz.weekday !== 'Fri' || nz.hour < 8 || nz.hour >= 12) return 'not Friday morning';
  if (!(await claim(env.DB, 'weekly_stats', nz.date))) return 'sent today';
  try {
    return `sent: ${await sendWeeklyStats(env)}`;
  } catch (e) {
    await release(env.DB, 'weekly_stats');
    throw e;
  }
}
