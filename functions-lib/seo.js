// SEO for the studio (/studio/seo), using free sources instead of a paid SEO tool:
//   Google Search Console  what people searched to find the site, its average position, clicks
//                          (needs the webmasters.readonly permission on the Google connection)
//   Google's suggestions   keyword ideas: what people type ("wedding photographer kumeu …")
//   The studio's own data  venues couples mention in enquiries that have no page on the site,
//                          weddings not yet on the blog, posts this month
//   The site itself        a monthly health check of every page (titles, descriptions, photo
//                          descriptions, broken links), a few pages per timer run
import { googleToken, connection } from './gmail.js';
import { nzNow, builtPosts } from './schedules.js';

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const SITE = 'https://www.momentsinlight.co.nz';
const DAY = 86400_000;
const iso = (d) => d.toISOString().slice(0, 10);

export async function seoSettings(db) {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'seo'`).first();
  return { property: '', keywords: ['wedding photographer auckland', 'west auckland wedding photographer', 'kumeu wedding photographer', 'auckland wedding photography'], posts_goal: 2, ...(row ? JSON.parse(row.value) : {}) };
}
export async function saveSeoSettings(db, value) {
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('seo', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`).bind(JSON.stringify(value), new Date().toISOString()).run();
}

// ---- Google Search Console ----
export const gscReady = async (db) => String((await connection(db))?.scopes || '').includes('webmasters');
async function gsc(env, path, body) {
  const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/${path}`, {
    method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${await googleToken(env)}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 403 && /has not been used|disabled/i.test(d.error?.message ?? '') ? 'The Search Console API isn’t switched on in your Google Cloud project yet.' : `Search Console ${r.status}: ${d.error?.message ?? ''}`);
  return d;
}
/** The site's Search Console property (found once and saved). */
export async function property(env) {
  const s = await seoSettings(env.DB);
  if (s.property) return s.property;
  const sites = (await gsc(env, 'sites')).siteEntry ?? [];
  const p = sites.find((x) => x.siteUrl === 'sc-domain:momentsinlight.co.nz') ?? sites.find((x) => /momentsinlight/.test(x.siteUrl));
  if (!p) throw new Error('Your Google account doesn’t have momentsinlight.co.nz in Search Console yet.');
  await saveSeoSettings(env.DB, { ...s, property: p.siteUrl });
  return p.siteUrl;
}
const query = async (env, prop, body) => (await gsc(env, `sites/${encodeURIComponent(prop)}/searchAnalytics/query`, body)).rows ?? [];
export const gscQuery = query;

/** The last 28 days (Search Console runs ~2 days behind) compared with the 28 before. */
export async function searchReport(env) {
  const prop = await property(env);
  const end = new Date(Date.now() - 2 * DAY);
  const r = { start: iso(new Date(end - 27 * DAY)), end: iso(end) };
  const p = { start: iso(new Date(end - 55 * DAY)), end: iso(new Date(end - 28 * DAY)) };
  const range = (x) => ({ startDate: x.start, endDate: x.end });
  const [totals, before, queries, queriesBefore, pages] = await Promise.all([
    query(env, prop, { ...range(r) }), query(env, prop, { ...range(p) }),
    query(env, prop, { ...range(r), dimensions: ['query'], rowLimit: 250 }),
    query(env, prop, { ...range(p), dimensions: ['query'], rowLimit: 500 }),
    query(env, prop, { ...range(r), dimensions: ['page'], rowLimit: 25 }),
  ]);
  const prev = Object.fromEntries(queriesBefore.map((q) => [q.keys[0], q]));
  const row = (q) => ({ query: q.keys[0], clicks: q.clicks, impressions: q.impressions, position: +q.position.toFixed(1), before: prev[q.keys[0]] ? +prev[q.keys[0]].position.toFixed(1) : null });
  const all = queries.map(row);
  return {
    range: r, totals: totals[0] ?? { clicks: 0, impressions: 0, position: 0 }, before: before[0] ?? { clicks: 0, impressions: 0, position: 0 },
    queries: all.slice(0, 50),
    // Almost on page 1: searches where the site shows on page 2 (positions 8–20) with real interest.
    opportunities: all.filter((q) => q.position >= 8 && q.position <= 20 && q.impressions >= 10).sort((a, b) => b.impressions - a.impressions).slice(0, 15),
    pages: pages.map((x) => ({ page: x.keys[0].replace(SITE, '') || '/', clicks: x.clicks, impressions: x.impressions, position: +x.position.toFixed(1) })),
  };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Each week (from Monday 6am): where the site ranks for the tracked searches. */
export async function weeklyPositions(env) {
  const nz = nzNow();
  if (nz.weekday !== 'Mon' || nz.hour < 6) return 'not Monday';
  if (!(await gscReady(env.DB))) return 'Search Console not connected';
  const s = await seoSettings(env.DB);
  if (!s.keywords.length) return 'no searches tracked';
  const week = nz.date;
  const have = await env.DB.prepare('SELECT count(*) n FROM seo_positions WHERE week = ?1').bind(week).first();
  if (have.n) return 'saved this week';
  const prop = await property(env);
  const end = new Date(Date.now() - 2 * DAY);
  const rows = await query(env, prop, { startDate: iso(new Date(end - 6 * DAY)), endDate: iso(end), dimensions: ['query'], rowLimit: 100,
    dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'includingRegex', expression: `^(${s.keywords.map(escapeRe).join('|')})$` }] }] });
  const by = Object.fromEntries(rows.map((r) => [r.keys[0], r]));
  await env.DB.batch(s.keywords.map((k) => env.DB.prepare('INSERT OR IGNORE INTO seo_positions (week, keyword, position, clicks, impressions) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(week, k, by[k] ? +by[k].position.toFixed(1) : null, by[k]?.clicks ?? 0, by[k]?.impressions ?? 0)));
  return `saved ${s.keywords.length}`;
}

/** The tracked searches: this week's position and the trend (last 12 weeks). */
export async function trackedKeywords(db) {
  const s = await seoSettings(db);
  const rows = (await db.prepare('SELECT * FROM seo_positions WHERE week >= ?1 ORDER BY week').bind(iso(new Date(Date.now() - 90 * DAY))).all()).results;
  return s.keywords.map((k) => ({ keyword: k, history: rows.filter((r) => r.keyword === k).map(({ week, position, clicks, impressions }) => ({ week, position, clicks, impressions })) }));
}

// ---- Keyword ideas: Google's suggestions ----
export async function keywordIdeas(env, seeds) {
  const out = new Map();
  for (const seed of seeds.slice(0, 8)) {
    try {
      const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&hl=en-NZ&gl=nz&q=${encodeURIComponent(seed)}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
      const d = await r.json();
      for (const s of d[1] ?? []) if (s !== seed) out.set(s, seed);
    } catch { /* skip that seed */ }
  }
  return [...out].map(([idea, seed]) => ({ idea, seed }));
}

// ---- Venue page ideas from enquiries ----
const norm = (s) => String(s || '').toLowerCase().replace(/\b(the|estate|vineyard|winery|venue|weddings?|and|events?|lodge|ltd|nz|auckland|new zealand)\b/g, ' ').replace(/[^a-z]+/g, ' ').trim();
const GENERIC = new Set(['beach', 'home', 'park', 'garden', 'gardens', 'church', 'tbc', 'tba', 'unknown', 'not sure', 'private', 'house', 'our home', 'backyard', 'farm', 'na', 'n a', 'none', 'yes', 'no']);
async function venueCounts(env) {
  const { venues } = await builtPosts(env).catch(() => ({ venues: [] }));
  let sn = { results: [] };
  try { sn = await env.DB.prepare(`SELECT json_extract(data, '$.venue') v, received_at at FROM sn_gmail WHERE kind = 'lead'`).all(); } catch { /* not imported */ }
  const jobs = await env.DB.prepare(`SELECT venue v, created_at at FROM jobs WHERE venue <> ''`).all();
  const have = (venues ?? []).map((v) => norm(v.name)).filter(Boolean);
  const counts = new Map();
  for (const r of [...sn.results, ...jobs.results]) {
    const raw = String(r.v || '').split(/[,\n]/)[0].replace(/\b\d{3,}\b/g, '').replace(/\s+/g, ' ').trim();
    const key = norm(raw).split(' ').slice(0, 3).join(' ');
    if (!key || key.length < 3 || GENERIC.has(key)) continue;
    const cur = counts.get(key) ?? { name: raw, count: 0, last: '' };
    cur.count++; if (r.at > cur.last) cur.last = r.at;
    counts.set(key, cur);
  }
  return [...counts].map(([key, v]) => ({ ...v, key, hasPage: have.some((h) => h && (h.includes(key) || key.includes(h))) }));
}
export async function venueIdeas(env) {
  return (await venueCounts(env)).filter((v) => v.count >= 2).sort((a, b) => Number(a.hasPage) - Number(b.hasPage) || b.count - a.count).slice(0, 25);
}

// ---- Content ----
export async function contentStatus(env) {
  const nz = nzNow();
  const { posts } = await builtPosts(env).catch(() => ({ posts: [] }));
  const s = await seoSettings(env.DB);
  const thisMonth = posts.filter((p) => !p.draft && p.date.slice(0, 7) === nz.date.slice(0, 7)).length;
  // Weddings 2 weeks to 6 months ago with no post that mentions the couple's names.
  const jobs = (await env.DB.prepare(`SELECT j.id, j.title, j.partner_name, j.event_date, j.venue, c.first_name FROM jobs j JOIN clients c ON c.id = j.client_id
    WHERE j.job_type = 'Wedding' AND j.stage IN ('booked', 'completed') AND j.hold = 0 AND j.event_date BETWEEN ?1 AND ?2 ORDER BY j.event_date`)
    .bind(iso(new Date(Date.now() - 365 * DAY)), iso(new Date(Date.now() - 14 * DAY))).all()).results;
  // Studio Ninja weddings (read from Gmail): signed contracts matched to their enquiry for the date and venue.
  try {
    const sn = (await env.DB.prepare(`SELECT kind, data FROM sn_gmail WHERE kind IN ('lead', 'contract_signed')`).all()).results.map((r) => ({ kind: r.kind, d: JSON.parse(r.data) }));
    const words = (x) => String(x || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
    const from = iso(new Date(Date.now() - 365 * DAY)), to = iso(new Date(Date.now() - 14 * DAY));
    for (const c of sn.filter((x) => x.kind === 'contract_signed')) {
      const job = words(c.d.job);
      const l = sn.find((x) => x.kind === 'lead' && words(`${x.d.first_name} ${x.d.last_name}`).length && words(`${x.d.first_name} ${x.d.last_name}`).every((w) => job.includes(w)) && x.d.event_date);
      const m = l?.d.event_date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) continue;
      const date = `${m[3]}-${m[2]}-${m[1]}`;
      if (date < from || date > to || /portrait|headshot|family/i.test(`${l.d.service} ${c.d.job}`)) continue;
      if (jobs.some((j) => j.event_date === date)) continue;
      jobs.push({ id: null, title: `${l.d.first_name} ${l.d.last_name}`.trim(), partner_name: '', event_date: date, venue: l.d.venue || '', first_name: l.d.first_name || '' });
    }
    jobs.sort((a, b) => a.event_date.localeCompare(b.event_date));
  } catch { /* the Studio Ninja emails aren't there */ }
  const titles = posts.map((p) => p.title.toLowerCase());
  const notBlogged = jobs.filter((j) => j.first_name && !titles.some((t) => t.includes(j.first_name.toLowerCase()) && (!j.partner_name || t.includes(j.partner_name.toLowerCase().split(' ')[0]))));
  return { posts_goal: s.posts_goal, this_month: thisMonth, not_blogged: notBlogged.map((j) => ({ id: j.id, couple: j.partner_name ? `${j.first_name} & ${j.partner_name}` : j.title, first_name: j.first_name, event_date: j.event_date, venue: j.venue || '' })) };
}

/** Weekly: a task for each wedding that's been 2+ weeks without a blog post (once each). */
export async function contentTasks(env) {
  const nz = nzNow();
  if (nz.weekday !== 'Mon' || nz.hour < 7) return 'not Monday';
  const c = await contentStatus(env);
  const now = new Date().toISOString();
  const mine = c.not_blogged.filter((j) => j.id);
  if (mine.length) await env.DB.batch(mine.map((j) => env.DB.prepare(
    `INSERT INTO tasks (title, notes, due_date, kind, created_at) SELECT ?1, ?2, ?3, 'content', ?4 WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = ?1)`,
  ).bind(`Blog ${j.couple}’s wedding`, `Their wedding was ${j.event_date}; it isn’t on the blog yet.`, nz.date, now)));
  return `${mine.length} weddings to blog`;
}

// ---- The monthly site health check ----
const PER_RUN = 20;
const decode = (t) => t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export async function siteHealth(env, { now = false } = {}) {
  const db = env.DB;
  const nz = nzNow();
  const month = nz.date.slice(0, 7);
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'site_health'`).first();
  let st = row ? JSON.parse(row.value) : null;
  const save = (v) => db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('site_health', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`).bind(JSON.stringify(v), new Date().toISOString()).run();
  // Starts by itself from 9am on the 2nd (the speed email is the 1st); "Run now" starts it any time.
  if (now || ((!st || st.month !== month) && nz.date.slice(8) >= '02' && nz.hour >= 9)) {
    const map = await (await env.ASSETS.fetch(new Request(`${SITE}/sitemap-0.xml`))).text();
    const pages = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    st = { month, started: new Date().toISOString(), pages, done: 0, results: [], finished: false };
    await save(st);
  }
  if (!st) return 'not started';
  if (st.finished) return 'finished';
  const batch = st.pages.slice(st.done, st.done + PER_RUN);
  for (const path of batch) {
    try {
      const html = await (await env.ASSETS.fetch(new Request(`${SITE}${path}`))).text();
      const title = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? '');
      const desc = decode(html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? '');
      const h1 = (html.match(/<h1[\s>]/gi) || []).length;
      const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]).filter((t) => !/display:\s*none|width="1"/i.test(t));
      const missing = imgs.filter((t) => !/\balt="[^"]+"/i.test(t) && !/aria-hidden="true"|role="presentation"/i.test(t));
      const noAlt = missing.length;
      const noAltSrcs = [...new Set(missing.map((t) => (t.match(/\b(?:data-)?src="(https:\/\/imagedelivery[^"]+)"/) || [])[1]).filter(Boolean))].slice(0, 60);
      const links = [...new Set([...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1].replace(/\/$/, '') || '/'))].filter((l) => !/[{$]/.test(l) && !/\.(css|js|png|jpe?g|webp|svg|ico|xml|pdf|ttf|woff2?)$/i.test(l) && !l.startsWith('/_') && !l.startsWith('/api'));
      const main = html.match(/<main[\s\S]*<\/main>/i)?.[0] ?? '';
      const inMain = [...new Set([...main.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1].replace(/\/$/, '') || '/'))];
      st.results.push({ path, title, desc, h1, imgs: imgs.length, noAlt, noAltSrcs, links, inMain });
    } catch (e) { st.results.push({ path, error: e.message }); }
  }
  st.done += batch.length;
  if (st.done >= st.pages.length) {
    const known = new Set(st.pages.map((p) => p.replace(/\/$/, '') || '/'));
    const titles = {}; const descs = {};
    for (const r of st.results) { if (r.title) (titles[r.title] ||= []).push(r.path); if (r.desc) (descs[r.desc] ||= []).push(r.path); }
    const broken = {};
    for (const r of st.results) for (const l of r.links ?? []) if (!known.has(l) && !/^\/(studio|newcontact|portal|quote|contract|invoice|questionnaire)/.test(l)) (broken[l] ||= []).push(r.path);
    st.summary = {
      pages: st.results.length,
      shortTitles: st.results.filter((r) => r.title && (r.title.length < 25 || r.title.length > 65)).map((r) => ({ path: r.path, title: r.title })),
      noDesc: st.results.filter((r) => !r.error && (!r.desc || r.desc.length < 50)).map((r) => r.path),
      longDesc: st.results.filter((r) => (r.desc ?? '').length > 165).map((r) => r.path),
      dupTitles: Object.entries(titles).filter(([, v]) => v.length > 1).map(([t, v]) => ({ title: t, pages: v })),
      dupDescs: Object.entries(descs).filter(([, v]) => v.length > 1).map(([d, v]) => ({ desc: d.slice(0, 80), pages: v })),
      h1: st.results.filter((r) => !r.error && r.h1 !== 1).map((r) => ({ path: r.path, h1: r.h1 })),
      noAlt: st.results.filter((r) => r.noAlt).map((r) => ({ path: r.path, count: r.noAlt, of: r.imgs, photos: r.noAltSrcs ?? [] })),
      broken: Object.entries(broken).map(([link, from]) => ({ link, from: from.slice(0, 5) })),
      // Which of your pages link to each page (the Rankings fix list counts these).
      inlinks: st.results.reduce((m, r) => { for (const l of r.inMain ?? []) if (l !== r.path && known.has(l)) (m[l] ||= []).push(r.path); return m; }, {}),
    };
    st.finished = true;
    st.results = st.results.map(({ links, inMain, noAltSrcs, ...r }) => r); // the summary has what's needed
  }
  await save(st);
  return st.finished ? 'finished' : `checked ${st.done} of ${st.pages.length}`;
}

// ---- Competitor watch ----
// A competitor is a contact of type Competitor with a website. Each week (and on "Check now") the
// studio reads their sitemap, the list of pages a site gives Google, and remembers every page, so
// new blog posts and venue pages show up. Nothing on their site is copied; only page addresses.
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; MomentsStudio/1.0; +https://www.momentsinlight.co.nz)' };
const locs = (xml) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>(?:[\s\S]{0,200}?<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => ({ url: m[1].trim(), lastmod: m[2]?.slice(0, 10) ?? null }));
async function getText(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!r.ok) throw new Error(`${new URL(url).pathname} ${r.status}`);
  return r.text();
}
/** Every page in a site's sitemap (following a sitemap index one level, at most 8 sitemaps). */
export async function sitemapPages(website) {
  const base = new URL(/^https?:/.test(website) ? website : `https://${website}`).origin;
  let xml = '';
  try { xml = await getText(`${base}/sitemap.xml`); } catch {
    const robots = await getText(`${base}/robots.txt`).catch(() => '');
    const listed = robots.match(/^sitemap:\s*(\S+)/im)?.[1];
    if (!listed) throw new Error('No sitemap found on their site.');
    xml = await getText(listed);
  }
  if (/<sitemapindex/i.test(xml)) {
    const subs = locs(xml).map((x) => x.url).filter((u) => !/image|video|author|tag|categor/i.test(u)).slice(0, 8);
    const all = [];
    for (const u of subs) { try { all.push(...locs(await getText(u))); } catch { /* skip that one */ } }
    xml = ''; return dedupe(all);
  }
  return dedupe(locs(xml));
}
const dedupe = (list) => [...new Map(list.filter((x) => /^https?:/.test(x.url)).map((x) => [x.url.replace(/\/$/, ''), { ...x, url: x.url.replace(/\/$/, '') }])).values()].slice(0, 2000);

/** Read one competitor's sitemap and remember any new pages. */
export async function checkCompetitor(env, c) {
  const db = env.DB;
  const now = new Date().toISOString();
  try {
    const pages = await sitemapPages(c.website);
    const had = (await db.prepare('SELECT count(*) n FROM competitor_pages WHERE contact_id = ?1').bind(c.id).first()).n;
    const stmts = [];
    for (let i = 0; i < pages.length; i += 20) {
      const chunk = pages.slice(i, i + 20);
      stmts.push(db.prepare(`INSERT OR IGNORE INTO competitor_pages (contact_id, url, lastmod, first_seen, baseline) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?)').join(', ')}`)
        .bind(...chunk.flatMap((p) => [c.id, p.url, p.lastmod, now, had ? 0 : 1])));
    }
    stmts.push(db.prepare('UPDATE contacts SET watch_checked_at = ?2, watch_error = NULL WHERE id = ?1').bind(c.id, now));
    await db.batch(stmts);
    return { pages: pages.length, first: !had };
  } catch (e) {
    await db.prepare('UPDATE contacts SET watch_checked_at = ?2, watch_error = ?3 WHERE id = ?1').bind(c.id, now, e.message).run();
    return { error: e.message };
  }
}

/** Timer: Mondays from 8am, one competitor per run (a sitemap can take ~10 requests). */
export async function competitorWatch(env) {
  const nz = nzNow();
  if (nz.weekday !== 'Mon' || nz.hour < 8) return 'not Monday';
  const c = await env.DB.prepare(`SELECT id, website FROM contacts WHERE type = 'Competitor' AND website <> ''
    AND (watch_checked_at IS NULL OR watch_checked_at < ?1) ORDER BY watch_checked_at IS NOT NULL, watch_checked_at LIMIT 1`).bind(new Date(Date.now() - 5 * DAY).toISOString()).first();
  if (!c) return 'all checked';
  const r = await checkCompetitor(env, c);
  return r.error ? `${c.id}: ${r.error}` : `${c.id}: ${r.pages} pages`;
}

const slugWords = (url) => { try { return norm(decodeURIComponent(new URL(url).pathname).replace(/[-_/]+/g, ' ')); } catch { return ''; } };
const pageName = (url) => { try { const p = decodeURIComponent(new URL(url).pathname).split('/').filter(Boolean); return p.length ? p.at(-1).replace(/\.\w+$/, '').replace(/[-_]+/g, ' ') : 'Home page'; } catch { return url; } };
/** Each competitor: pages, new pages (last 90 days), and venues they have pages about that you don't. */
export async function competitorReport(env) {
  const db = env.DB;
  const list = (await db.prepare(`SELECT id, business, website, watch_checked_at, watch_error, (SELECT count(*) FROM competitor_pages p WHERE p.contact_id = c.id) pages
    FROM contacts c WHERE type = 'Competitor' ORDER BY business`).all()).results;
  if (!list.length) return { competitors: [], keyword_gaps: [], tracked: [] };
  const since = new Date(Date.now() - 90 * DAY).toISOString();
  const fresh = (await db.prepare(`SELECT contact_id, url, first_seen FROM competitor_pages WHERE baseline = 0 AND first_seen >= ?1 ORDER BY first_seen DESC`).bind(since).all()).results;
  const all = (await db.prepare('SELECT contact_id, url FROM competitor_pages').all()).results;
  // Venues: the ones couples ask about, plus the ones with your own pages.
  const venues = await venueCounts(env).catch(() => []);
  const { venues: yours = [] } = await builtPosts(env).catch(() => ({}));
  const known = [...venues, ...yours.filter((v) => !venues.some((x) => x.hasPage && norm(v.name).includes(x.key))).map((v) => ({ name: v.name, key: norm(v.name).split(' ').slice(0, 3).join(' '), hasPage: true, count: 0 }))];
  const gaps = new Map();
  for (const p of all) {
    const w = ` ${slugWords(p.url)} `;
    for (const v of known) if (!v.hasPage && v.key.length >= 4 && w.includes(` ${v.key} `)) {
      const g = gaps.get(v.key) ?? { name: v.name, enquiries: v.count, pages: [] };
      if (!g.pages.some((x) => x.contact_id === p.contact_id)) g.pages.push({ contact_id: p.contact_id, url: p.url, count: 0 });
      g.pages.find((x) => x.contact_id === p.contact_id).count++;
      gaps.set(v.key, g);
    }
  }
  // The searches they rank for (fetched on request): per competitor, and the ones several share.
  const kws = (await db.prepare('SELECT * FROM competitor_keywords').all()).results;
  const { keywords: tracked = [] } = await seoSettings(db);
  const brandWords = (name) => String(name).toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !['photography', 'photographer', 'weddings', 'wedding', 'studio', 'photo', 'films', 'cinema', 'creative', 'projects'].includes(w));
  const branded = (k, c) => brandWords(c.business).some((w) => k.includes(w)) || /moments in light/.test(k);
  const byKw = new Map();
  for (const k of kws) {
    const c = list.find((x) => x.id === k.contact_id);
    if (!c || branded(k.keyword, c)) continue;
    const g = byKw.get(k.keyword) ?? { keyword: k.keyword, volume: k.volume, who: [] };
    g.who.push({ business: c.business, position: k.position });
    byKw.set(k.keyword, g);
  }
  const keyword_gaps = [...byKw.values()].filter((g) => !tracked.includes(g.keyword))
    .sort((a, b) => b.who.length - a.who.length || (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 60);
  return {
    tracked, keyword_gaps,
    competitors: list.map((c) => ({ ...c, keywords: kws.filter((k) => k.contact_id === c.id).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 60).map(({ keyword, position, volume, url, fetched_at }) => ({ keyword, position, volume, url, fetched_at, brand: branded(keyword, c) })), new_pages: fresh.filter((p) => p.contact_id === c.id).slice(0, 15).map((p) => ({ url: p.url, name: pageName(p.url), first_seen: p.first_seen })) })),
    venue_gaps: [...gaps.values()].sort((a, b) => b.enquiries - a.enquiries || b.pages.length - a.pages.length).slice(0, 20),
  };
}
