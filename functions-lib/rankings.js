// Rankings and fixes (/studio/rankings): for each tracked search, where you are on Google, which of
// your pages Google shows, who is above you, and a list of checks on the page that should rank,
// each one a task you can add that closes itself when the check passes.
//
// Rankings come from DataForSEO (pay as you go, about US$0.0006 per results page). Settings, in
// Cloudflare > the site > Settings > Variables and secrets (Production), added by Tony:
//   DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD   from DataForSEO > API access
// Without them the fix list still works, from the site itself and Search Console.
import { nzNow } from './schedules.js';
import { seoSettings, saveSeoSettings } from './seo.js';

const SITE = 'https://www.momentsinlight.co.nz';
const OURS = 'momentsinlight.co.nz';
const API = 'https://api.dataforseo.com/v3';
export const LOCATION = 'Auckland,Auckland,New Zealand';
const DEVICES = ['mobile', 'desktop'];
const DEPTH = 20; // two pages of results

export const serpReady = (env) => Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD);
const auth = (env) => `Basic ${btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`)}`;
async function dfs(env, path, body) {
  const r = await fetch(`${API}/${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: auth(env), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.status_code >= 40000) throw new Error(r.status === 401 ? 'DataForSEO didn’t accept the login. Check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in Cloudflare.' : `DataForSEO: ${d.status_message || r.status}`);
  return d;
}
async function addSpend(db, cost) {
  if (!cost) return;
  const month = nzNow().date.slice(0, 7);
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'serp_spend'`).first();
  const s = row ? JSON.parse(row.value) : {};
  const v = { month, cost: (s.month === month ? s.cost : 0) + cost, total: (s.total ?? 0) + cost };
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('serp_spend', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`).bind(JSON.stringify(v), new Date().toISOString()).run();
}

/** Ask Google (through DataForSEO) for every tracked search, phone and desktop: one request. */
export async function postRun(env) {
  const db = env.DB;
  const run = nzNow().date;
  if ((await db.prepare('SELECT count(*) n FROM serp_tasks WHERE run = ?1').bind(run).first()).n) return { already: true };
  const { keywords } = await seoSettings(db);
  if (!keywords.length) return { none: true };
  const list = keywords.slice(0, 50).flatMap((k) => DEVICES.map((device) => ({ keyword: k, device })));
  const d = await dfs(env, 'serp/google/organic/task_post', list.map((t) => ({ keyword: t.keyword, location_name: LOCATION, language_code: 'en', device: t.device, depth: DEPTH, tag: `${t.device}|${t.keyword}`.slice(0, 255) })));
  const now = new Date().toISOString();
  const made = (d.tasks ?? []).filter((t) => t.id && t.status_code < 40000);
  if (!made.length) throw new Error(d.tasks?.[0]?.status_message || 'DataForSEO didn’t take the searches.');
  await db.batch(made.map((t) => db.prepare('INSERT OR IGNORE INTO serp_tasks (id, run, keyword, device, posted_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(t.id, run, t.data.keyword, t.data.device, now)));
  await addSpend(db, d.cost);
  return { posted: made.length };
}

const typeOf = (i) => i.type;
/** The useful parts of one results page. */
export function readSerp(result) {
  const items = result?.items ?? [];
  const organic = items.filter((i) => typeOf(i) === 'organic');
  const ours = organic.filter((i) => (i.domain || '').endsWith(OURS));
  const pack = items.find((i) => typeOf(i) === 'local_pack') ? items.filter((i) => typeOf(i) === 'local_pack') : [];
  const mine = pack.find((i) => (i.domain || '').endsWith(OURS) || /moments in light/i.test(i.title || ''));
  return {
    position: ours[0]?.rank_group ?? null,
    url: ours[0]?.url ?? null,
    has_map: pack.length ? 1 : 0,
    map_position: mine ? mine.rank_group : null,
    top: {
      organic: organic.slice(0, 10).map((i) => ({ rank: i.rank_group, domain: i.domain, url: i.url, title: i.title })),
      map: pack.slice(0, 5).map((i) => ({ rank: i.rank_group, title: i.title, domain: i.domain || '', rating: i.rating?.value ?? null, votes: i.rating?.votes_count ?? null })),
      ours: ours.map((i) => ({ rank: i.rank_group, url: i.url })),
    },
  };
}

/** Timer: collect finished searches (10 per run; each is one request). */
export async function collect(env, limit = 10) {
  const db = env.DB;
  const pending = (await db.prepare(`SELECT * FROM serp_tasks WHERE status = 'pending' AND posted_at < ?1 ORDER BY posted_at LIMIT ?2`)
    .bind(new Date(Date.now() - 60_000).toISOString(), limit).all()).results;
  let done = 0;
  for (const t of pending) {
    let d;
    try { d = await dfs(env, `serp/google/organic/task_get/advanced/${t.id}`); } catch (e) { console.error('rankings: get', e.message); continue; }
    const task = d.tasks?.[0];
    if (!task || [40601, 40602].includes(task.status_code)) continue; // still in the queue
    if (task.status_code !== 20000) {
      // Not finished within a day: give up on it.
      if (Date.now() - new Date(t.posted_at) > 86400_000 || task.status_code >= 40000) await db.prepare(`UPDATE serp_tasks SET status = 'error', error = ?2 WHERE id = ?1`).bind(t.id, task.status_message || String(task.status_code)).run();
      continue;
    }
    const s = readSerp(task.result?.[0]);
    await db.batch([
      db.prepare(`INSERT OR REPLACE INTO serp_results (run, keyword, device, position, url, has_map, map_position, top, checked_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
        .bind(t.run, t.keyword, t.device, s.position, s.url, s.has_map, s.map_position, JSON.stringify(s.top), new Date().toISOString()),
      db.prepare(`UPDATE serp_tasks SET status = 'done' WHERE id = ?1`).bind(t.id),
    ]);
    done++;
  }
  return done;
}

/** Timer: Mondays from 5am, ask for this week's rankings; every run, collect what's ready. */
export async function rankingsTimer(env) {
  if (!serpReady(env)) return 'not set up';
  const nz = nzNow();
  let posted = '';
  if (nz.weekday === 'Mon' && nz.hour >= 5) {
    const r = await postRun(env).catch((e) => ({ error: e.message }));
    posted = r.error ? `post error: ${r.error}; ` : r.posted ? `posted ${r.posted}; ` : '';
  }
  return `${posted}collected ${await collect(env)}`;
}

// ---- The fix list ----
const STOP = new Set(['in', 'the', 'a', 'an', 'for', 'of', 'and', 'nz', 'near', 'me', 'best', 'top', 'to', 'at', 'on', 'my']);
const stem = (w) => (w.length > 6 ? w.slice(0, 6) : w.replace(/s$/, ''));
export const stems = (s) => String(s || '').toLowerCase().replace(/&#39;|’/g, "'").split(/[^a-z0-9']+/).filter((w) => w && !STOP.has(w)).map(stem);
const near = (text, want, slack) => {
  const got = stems(text);
  const size = want.length + slack;
  for (let i = 0; i + Math.min(size, got.length) <= got.length && i < Math.max(1, got.length); i++) {
    const win = new Set(got.slice(i, i + size));
    if (want.every((w) => win.has(w))) return true;
  }
  return false;
};
const has = (text, want) => near(text, want, 2);
const phrase = (text, want) => near(text, want, 0);
// In sentences (descriptions, paragraphs) the words just need to be there.
const all = (text, want) => { const got = new Set(stems(text)); return want.every((w) => got.has(w)); };
const decode = (t) => t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const textOf = (html) => decode(html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** What a page says: title, description, main heading, first paragraph, words, photos. */
export function readPage(html) {
  const main = html.match(/<main[\s\S]*<\/main>/i)?.[0] ?? html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  const imgs = [...main.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]).filter((t) => !/display:\s*none|width="1"/i.test(t));
  const paras = [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => textOf(m[1])).filter((p) => p.split(' ').length >= 8);
  return {
    title: decode(html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''),
    desc: decode(html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? ''),
    h1: textOf(main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ''),
    intro: paras[0] ?? '',
    words: textOf(main).split(' ').filter(Boolean).length,
    imgs: imgs.length,
    noAlt: imgs.filter((t) => !/\balt="[^"]+"/i.test(t)).length,
  };
}

const DIRECTORIES = ['easyweddings', 'weddingwire', 'bridebook', 'nzweddings', 'weddings.co.nz', 'theknot', 'junebug', 'facebook.com', 'instagram.com', 'pinterest', 'yelp', 'nocowboys', 'localist', 'finda', 'yellow.co.nz', 'zola', 'tripadvisor', 'tiktok', 'youtube', 'reddit', 'directory', 'bark.com', 'hitched', 'wedshed', 'stylemepretty', 'togs'];
export const isDirectory = (domain) => DIRECTORIES.some((d) => String(domain || '').includes(d));

/** The site's pages and their titles (from the last site health check, or the sitemap). */
async function sitePages(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'site_health'`).first();
  const h = row ? JSON.parse(row.value) : null;
  if (h?.results?.length) return { pages: h.results.filter((r) => !r.error).map((r) => ({ path: r.path, title: r.title || r.path })), inlinks: h.summary?.inlinks ?? null };
  const map = await (await env.ASSETS.fetch(new Request(`${SITE}/sitemap-0.xml`))).text();
  return { pages: [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => ({ path: new URL(m[1]).pathname, title: new URL(m[1]).pathname })), inlinks: null };
}
const pathOf = (url) => { try { return new URL(url).pathname.replace(/\/$/, '') || '/'; } catch { return url; } };
/** The page that should rank: Tony's choice, else the one Google shows, else the best title match. */
function pickTarget(keyword, pages, chosen, google) {
  if (chosen) return { page: chosen, how: 'chosen' };
  if (google) return { page: pathOf(google), how: 'google' };
  const want = stems(keyword);
  const scored = pages.map((p) => ({ p, n: want.filter((w) => new Set(stems(`${p.title} ${p.path.replace(/[-/]/g, ' ')}`)).has(w)).length }))
    .sort((a, b) => b.n - a.n || a.p.path.length - b.p.path.length);
  return { page: scored[0]?.n ? scored[0].p.path : '/', how: 'guess' };
}

const GBP = 'Google shows a map with 3 businesses above the websites for this search. Those places come from Google Business Profiles, not your website. What moves you up: the main category “Wedding photographer”; your service area set to the suburbs you work in; new reviews that mention the venue and “wedding”; a few photos and a post every week; replying to every review.';

/** Everything for the Rankings page: each search with its rankings, Search Console numbers, page and fixes. */
export async function rankingsReport(env) {
  const db = env.DB;
  const s = await seoSettings(db);
  const targets = s.targets ?? {};
  const { pages, inlinks } = await sitePages(env);
  // Rankings: the two latest runs.
  const runs = (await db.prepare('SELECT DISTINCT run FROM serp_results ORDER BY run DESC LIMIT 2').all()).results.map((r) => r.run);
  const serp = runs.length ? (await db.prepare(`SELECT * FROM serp_results WHERE run IN (${runs.map(() => '?').join(',')})`).bind(...runs).all()).results : [];
  const history = (await db.prepare(`SELECT run, keyword, device, position, map_position FROM serp_results WHERE run >= ?1 ORDER BY run`).bind(new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10)).all()).results;
  const pending = (await db.prepare(`SELECT count(*) n FROM serp_tasks WHERE status = 'pending'`).first()).n;
  const lastErr = await db.prepare(`SELECT error, run FROM serp_tasks WHERE status = 'error' ORDER BY posted_at DESC LIMIT 1`).first();
  // Search Console, the latest week saved for each tracked search.
  const gsc = Object.fromEntries((await db.prepare(`SELECT p.* FROM seo_positions p JOIN (SELECT keyword, max(week) w FROM seo_positions GROUP BY keyword) l ON l.keyword = p.keyword AND l.w = p.week`).all()).results.map((r) => [r.keyword, r]));
  // Contacts: who links to which page, and the directories you're on.
  const contacts = (await db.prepare(`SELECT id, business, type, our_page, link_found, link_page FROM contacts`).all()).results;
  const tasks = (await db.prepare(`SELECT id, ref, status FROM tasks WHERE ref LIKE 'seo:%'`).all()).results;
  const spendRow = await db.prepare(`SELECT value FROM settings WHERE key = 'serp_spend'`).first();
  const compareRow = await db.prepare(`SELECT value FROM settings WHERE key = 'serp_compare'`).first();
  const compare = compareRow ? JSON.parse(compareRow.value) : {};

  const htmlCache = new Map();
  const page = async (path) => {
    if (!htmlCache.has(path)) {
      htmlCache.set(path, (async () => {
        const r = await env.ASSETS.fetch(new Request(`${SITE}${path}`));
        return r.ok ? readPage(await r.text()) : null;
      })().catch(() => null));
    }
    return htmlCache.get(path);
  };

  const out = [];
  const close = [];
  for (const keyword of s.keywords) {
    const rows = serp.filter((r) => r.keyword === keyword);
    const latest = (device) => rows.find((r) => r.run === runs[0] && r.device === device) ?? null;
    const before = (device) => rows.find((r) => r.run === runs[1] && r.device === device) ?? null;
    const now = { mobile: latest('mobile'), desktop: latest('desktop') };
    const main = now.mobile ?? now.desktop;
    const top = main ? JSON.parse(main.top) : null;
    const t = pickTarget(keyword, pages, targets[keyword], main?.url);
    const want = stems(keyword);
    const p = await page(t.page);
    const fixes = [];
    const fix = (key, ok, title, detail, extra = {}) => fixes.push({ key, ok, title, detail, ...extra });

    if (main?.url && pathOf(main.url) !== t.page) fix('google_page', false, `Google shows a different page: ${pathOf(main.url)}`, `Either choose that page as the one for this search (if it suits it better), or make this page the clear best match and link to it from ${pathOf(main.url)}.`);
    if (p) {
      fix('title', has(p.title, want), 'The Google title includes the search', has(p.title, want) ? `“${p.title}”` : `Now: “${p.title}”. Put “${keyword}” near the start, e.g. “${keyword.replace(/\b\w/g, (c) => c.toUpperCase())} | Moments in Light”. Change it in the post editor’s Google title (or ask me for pages that aren’t posts).`);
      fix('h1', has(p.h1, want), 'The main heading mentions it', has(p.h1, want) ? `“${p.h1}”` : `Now: “${p.h1 || 'no main heading'}”. Say what the page is about in plain words, with “${keyword}”.`);
      fix('desc', all(p.desc, want), 'The Google description mentions it', all(p.desc, want) ? 'Yes.' : `Write one or two sentences (140–155 characters) that use “${keyword}” and give a reason to click.`);
      fix('intro', all(p.intro, want), 'The first paragraph mentions it', all(p.intro, want) ? 'Yes.' : 'Mention it naturally in the first paragraph; Google reads the start of a page most closely.');
      const cmp = compare[keyword];
      const avg = cmp?.pages?.length ? Math.round(cmp.pages.reduce((a, x) => a + x.words, 0) / cmp.pages.length) : null;
      const enough = avg ? p.words >= avg * 0.7 : p.words >= 400;
      fix('words', enough, `Enough words (${p.words}${avg ? `; the top 3 average ${avg}` : ''})`, enough ? 'Fine.' : avg ? `The pages above you have more to say. Add the useful things couples ask about: the venue’s spots for photos, timings, light at different times of day, wet-weather options, a story or two.` : 'Under 400 words gives Google little to go on. Add what couples want to know about it. (Click “Compare with the top 3” for a real target.)');
      fix('alt', !p.noAlt, `Photos have descriptions${p.imgs ? ` (${p.imgs - p.noAlt} of ${p.imgs})` : ''}`, p.noAlt ? `${p.noAlt} ${p.noAlt === 1 ? 'photo has' : 'photos have'} none. Describe them plainly, and mention the place where it fits (“bride and groom under the oaks at Kumeu Valley Estate”).` : 'Yes.');
    } else fix('page', false, `Couldn’t read ${t.page}`, 'Choose the page for this search below.');
    if (t.page === '/') fix('inlinks', true, 'Linked from your other pages', 'The home page is linked from every page (the logo and menu).');
    else if (inlinks) {
      const from = (inlinks[t.page] ?? []).filter((x) => x !== t.page);
      fix('inlinks', from.length >= 3, `Linked from your other pages (${from.length})`, from.length >= 3 ? 'Good.' : `Link to it from 3 or more of your blog posts and pages, using words like “${keyword}” as the link text. Blog posts at the same venue are ideal.`);
    } else fix('inlinks', true, 'Links from your other pages', 'Run the Site health check on the SEO page to count these.', { unknown: true });
    const rivals = pages.filter((x) => x.path !== t.page && phrase(x.title, want));
    fix('compete', !rivals.length, 'No other page competes for it', rivals.length ? `These also have it in their Google title, so Google has to choose: ${rivals.slice(0, 5).map((x) => x.path).join(', ')}${rivals.length > 5 ? ` and ${rivals.length - 5} more` : ''}. Give them more specific titles (the couple, the venue, the season) and link them to ${t.page}.` : 'Good.', { pages: rivals.slice(0, 8).map((x) => x.path) });
    const links = contacts.filter((c) => c.link_found === 1 && c.our_page && pathOf(`${SITE}${c.our_page}`) === t.page);
    const askable = contacts.filter((c) => c.our_page && pathOf(`${SITE}${c.our_page}`) === t.page && c.link_found !== 1);
    fix('backlinks', links.length > 0, `Other websites link to it (${links.length} known)`, links.length ? links.map((c) => c.business).join(', ') : askable.length ? `Ask ${askable.map((c) => c.business).join(', ')} to link to this page (open the contact and use the backlink email).` : 'Links from venues, planners and suppliers you work with tell Google this page matters. Add them in Contacts with this page as “Our page”.', { contacts: askable.map((c) => ({ id: c.id, business: c.business })) });
    if (top) {
      const dirs = [...new Set(top.organic.filter((x) => isDirectory(x.domain)).map((x) => x.domain))];
      if (dirs.length >= 2) {
        const on = contacts.filter((c) => c.type === 'Directory' && c.link_found === 1).map((c) => c.business.toLowerCase());
        const missing = dirs.filter((d) => !on.some((b) => d.includes(b.split(' ')[0])));
        fix('directories', !missing.length, `Listed on the directories Google shows (${dirs.length})`, missing.length ? `Google puts these sites on page 1 for this search: ${dirs.join(', ')}. Being listed there (with reviews) gets you seen even before your own page climbs. Add each as a Directory contact and set its link to check.` : 'Yes.', { domains: dirs });
      }
      if (main.has_map) fix('map', main.map_position != null, main.map_position != null ? `You’re #${main.map_position} in the map listings` : 'Get into the map listings (Google Business Profile)', main.map_position != null ? 'Keep the reviews and photos coming.' : GBP, { map: top.map });
    }
    for (const f of fixes) {
      const tk = tasks.find((x) => x.ref === `seo:${keyword}:${f.key}`);
      f.task = tk ? tk.status : null;
      if (f.ok && tk?.status === 'open') { close.push(tk.id); f.task = 'closed'; }
    }
    const g = gsc[keyword];
    const pos = main?.position ?? g?.position ?? null;
    const reach = g?.impressions ?? 0;
    const near = pos == null ? 0.4 : pos <= 3 ? 0.3 : pos <= 10 ? 1 : pos <= 20 ? 0.8 : 0.4;
    out.push({
      keyword, target: t.page, target_how: t.how,
      rank: { mobile: now.mobile && { position: now.mobile.position, map: now.mobile.map_position, has_map: now.mobile.has_map, before: before('mobile')?.position ?? null }, desktop: now.desktop && { position: now.desktop.position, map: now.desktop.map_position, has_map: now.desktop.has_map, before: before('desktop')?.position ?? null }, run: runs[0] ?? null },
      top, gsc: g ?? null, compare: compare[keyword] ?? null,
      history: history.filter((h) => h.keyword === keyword),
      fixes, todo: fixes.filter((f) => !f.ok).length,
      priority: Math.round((reach + 5) * near * (1 + fixes.filter((f) => !f.ok).length / 10)),
    });
  }
  if (close.length) await db.batch(close.map((id) => db.prepare(`UPDATE tasks SET status = 'done', done_at = ?2, done_note = 'Fixed: the check passes now' WHERE id = ?1`).bind(id, new Date().toISOString())));
  out.sort((a, b) => b.priority - a.priority);
  return {
    ready: serpReady(env), location: LOCATION, pending, error: lastErr && lastErr.run === runs[0] ? lastErr.error : null,
    spend: spendRow ? JSON.parse(spendRow.value) : null,
    keywords: out, pages: pages.map((x) => x.path).sort(),
  };
}

/** Fetch the top 3 other results for a search and note their length, title and heading. */
export async function compareTop(env, keyword) {
  const row = await env.DB.prepare(`SELECT top FROM serp_results WHERE keyword = ?1 ORDER BY run DESC, device = 'mobile' DESC LIMIT 1`).bind(keyword).first();
  if (!row) throw new Error('No Google results for this search yet.');
  const top = JSON.parse(row.top).organic.filter((x) => !(x.domain || '').endsWith(OURS) && !isDirectory(x.domain)).slice(0, 3);
  const pages = [];
  for (const x of top) {
    try {
      const r = await fetch(x.url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; MomentsStudio/1.0)' } });
      if (!r.ok) continue;
      const p = readPage(await r.text());
      pages.push({ url: x.url, domain: x.domain, rank: x.rank, title: p.title, h1: p.h1, words: p.words, imgs: p.imgs });
    } catch { /* skip that one */ }
  }
  const s = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'serp_compare'`).first();
  const all = s ? JSON.parse(s.value) : {};
  all[keyword] = { at: new Date().toISOString(), pages };
  await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('serp_compare', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`).bind(JSON.stringify(all), new Date().toISOString()).run();
  return all[keyword];
}

export async function setTarget(db, keyword, page) {
  const s = await seoSettings(db);
  const targets = { ...(s.targets ?? {}) };
  if (page) targets[keyword] = page; else delete targets[keyword];
  await saveSeoSettings(db, { ...s, targets });
}

// ---- What competitors rank for (DataForSEO Labs, about US$0.02 per competitor) ----
const domainOf = (website) => { try { return new URL(/^https?:/.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, ''); } catch { return ''; } };
/** Fetch the New Zealand searches a competitor is on Google's first two pages for, and save them. */
export async function competitorKeywords(env, c) {
  if (!serpReady(env)) throw new Error('DataForSEO isn’t set up yet (see the Rankings page).');
  const target = domainOf(c.website);
  if (!target) throw new Error('Add their website on the contact first.');
  const d = await dfs(env, 'dataforseo_labs/google/ranked_keywords/live', [{
    target, location_name: 'New Zealand', language_code: 'en', limit: 100, item_types: ['organic'],
    filters: ['ranked_serp_element.serp_item.rank_group', '<=', 20], order_by: ['keyword_data.keyword_info.search_volume,desc'],
  }]);
  const task = d.tasks?.[0];
  if (task?.status_code >= 40000) throw new Error(`DataForSEO: ${task.status_message}`);
  const items = task?.result?.[0]?.items ?? [];
  const now = new Date().toISOString();
  const rows = items.map((i) => ({ keyword: String(i.keyword_data?.keyword ?? '').toLowerCase(), volume: i.keyword_data?.keyword_info?.search_volume ?? null,
    position: i.ranked_serp_element?.serp_item?.rank_group ?? null, url: i.ranked_serp_element?.serp_item?.url ?? null })).filter((r) => r.keyword);
  const db = env.DB;
  await db.batch([
    db.prepare('DELETE FROM competitor_keywords WHERE contact_id = ?1').bind(c.id),
    ...rows.map((r) => db.prepare('INSERT OR REPLACE INTO competitor_keywords (contact_id, keyword, position, volume, url, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(c.id, r.keyword, r.position, r.volume, r.url, now)),
  ]);
  await addSpend(db, d.cost);
  return { count: rows.length };
}
