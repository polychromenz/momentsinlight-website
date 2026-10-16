// The weekly stats email: last week's visitors compared with the week before, top pages and
// love stories, and where visitors came from, from Cloudflare Web Analytics (the same numbers
// as Moments Studio > Stats). Sent every Friday at 8am NZ time by
// .github/workflows/weekly-stats-email.yml.
//
//   node scripts/weekly-stats-email.mjs --now        send it now
//   node scripts/weekly-stats-email.mjs --now --dry  save it to email-preview.html instead
//
// Needs CF_ANALYTICS_TOKEN, CLOUDFLARE_ACCOUNT_ID and RESEND_API_KEY.
import { env, onlyAt8am, send, layout, h2, table, button, esc, num, posts, SITE } from './lib/email.mjs';

onlyAt8am((nz) => nz.weekday === 'Fri');

const HOST = 'www.momentsinlight.co.nz';
const day = (d) => d.toISOString().slice(0, 10);
const ago = (n) => new Date(Date.now() - n * 86400_000);
// The last 7 full days (to yesterday), and the 7 before that.
const thisWeek = { from: day(ago(7)), to: day(ago(1)) };
const lastWeek = { from: day(ago(14)), to: day(ago(8)) };

async function stats({ from, to }) {
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
    body: JSON.stringify({ query, variables: { account: env.CLOUDFLARE_ACCOUNT_ID, filter } }),
  });
  const d = await r.json();
  if (!r.ok || d.errors?.length) throw new Error(`Cloudflare: ${d.errors?.[0]?.message ?? r.status}`);
  const a = d.data.viewer.accounts[0];
  const rows = (list, key) => list.map((g) => ({ key: g.dimensions[key] || '', views: g.count, visits: g.sum.visits }));
  return { views: a.totals[0]?.count ?? 0, visits: a.totals[0]?.sum.visits ?? 0, pages: rows(a.pages, 'requestPath'), referrers: rows(a.referrers, 'refererHost') };
}

// Friendly names, as on the Stats page.
const pageNames = {
  '/': 'Home', '/weddings': 'Weddings', '/wedding-galleries': 'Love Stories', '/portraits': 'Portraits', '/portraits-gallery': 'Portrait galleries',
  '/family': 'Family', '/family-galleries': 'Family galleries', '/premium-portraits': 'Premium portraits', '/headshots': 'Headshots', '/lifestyle': 'Lifestyle',
  '/about': 'About', '/contact': 'Contact', '/testimonials': 'Testimonials', '/wedding-faqs': 'FAQs', '/wedding-photo-guide': 'Wedding photo guide',
  '/a-guide-to-your-wedding-photos': 'How I work', '/wedding-resources': 'Wedding resources', '/west-auckland-wedding-venues': 'West Auckland venues', '/blog': 'Blog',
};
const all = posts();
const postId = (p) => p.match(/^\/blog\/(?!page\/|category\/|tag\/)([^/]+)$/)?.[1];
const name = (p) => pageNames[p] ?? all[postId(p)]?.title ?? p;
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

const [now, before] = await Promise.all([stats(thisWeek), stats(lastWeek)]);
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
await send(subject, layout('Your week on the website', `${fmt(thisWeek.from)} – ${fmt(thisWeek.to)}, compared with the 7 days before.`, body));
