// Studio > SEO > Visits (/studio/stats/visits): what visitors do on the site, from its own visit log
// (functions/api/visit.js): the pages they view, how long each stays on screen, how far they
// scroll, where they leave, and the same for visits that started from a Google ad.
//   GET /api/studio/stats/visits?days=30&who=all|ad|other
import { json } from '../../../../functions-lib/studio.js';

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const days = [7, 30, 90].includes(Number(p.get('days'))) ? Number(p.get('days')) : 30;
  const who = ['ad', 'other'].includes(p.get('who')) ? p.get('who') : 'all';
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const db = env.DB;
  // The visits in range (and whether they started from an ad), each with its last page number.
  const V = `WITH v AS (SELECT sid, max(seq) last, max(ad) ad, sum(secs) secs, count(*) pages FROM page_views WHERE at >= ?1 GROUP BY sid
    ${who === 'ad' ? 'HAVING max(ad) = 1' : who === 'other' ? 'HAVING max(ad) = 0' : ''})`;
  const [totals, pages, journeys, keywords, first] = await Promise.all([
    db.prepare(`${V} SELECT count(*) visits, COALESCE(sum(pages), 0) views, COALESCE(avg(pages), 0) pages, COALESCE(avg(secs), 0) secs,
      COALESCE(sum(pages = 1 AND secs < 15), 0) quick, COALESCE(sum(ad), 0) ads FROM v`).bind(since).first(),
    db.prepare(`${V} SELECT pv.path, count(*) views, count(DISTINCT pv.sid) visits, sum(pv.seq = 1) landed, sum(pv.seq = v.last) exits,
      round(avg(CASE WHEN pv.secs > 0 THEN pv.secs END)) secs, round(avg(pv.scroll)) scroll
      FROM page_views pv JOIN v ON v.sid = pv.sid WHERE pv.at >= ?1 GROUP BY pv.path ORDER BY views DESC LIMIT 40`).bind(since).all(),
    // Where people go from the page they land on (or that they leave from it).
    db.prepare(`${V} SELECT a.path landing, COALESCE(b.path, '(left the site)') next, count(*) n FROM page_views a JOIN v ON v.sid = a.sid
      LEFT JOIN page_views b ON b.sid = a.sid AND b.seq = 2 WHERE a.seq = 1 AND a.at >= ?1 GROUP BY landing, next ORDER BY n DESC LIMIT 20`).bind(since).all(),
    db.prepare(`${V} SELECT COALESCE(pv.ad_term, '(keyword not known)') term, count(DISTINCT pv.sid) visits, round(avg(v.pages), 1) pages, round(avg(v.secs)) secs
      FROM page_views pv JOIN v ON v.sid = pv.sid WHERE pv.seq = 1 AND pv.ad = 1 AND pv.at >= ?1 GROUP BY term ORDER BY visits DESC LIMIT 15`).bind(since).all(),
    db.prepare(`SELECT min(at) at FROM page_views`).first(),
  ]);
  return json({ days, who, since, started: first?.at ?? null, totals, pages: pages.results, journeys: journeys.results, keywords: keywords.results });
}
