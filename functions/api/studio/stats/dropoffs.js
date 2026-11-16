// Studio > SEO > Visits > Drop-offs: who looks at the prices (the Weddings page) and doesn't enquire.
// From the site's own visit log (page_views). A visitor is their browser id (vid, the same across tabs,
// since 2026-11-10) or, before that, one browser tab (sid). "Enquired" = an enquiry carries their browser
// id (jobs.visitor_id, since 2026-11-10), or they reached /thanks, the page after the form (logged from
// 2026-11-16). Earlier enquirers can't be told apart, so they count as not having enquired.
//   GET /api/studio/stats/dropoffs?days=30&who=all|ad|other
//   -> { funnel, sources, scroll, leavers: [{ when, source, pages, secs, scroll, next, path, mobile, vid }] }
import { json } from '../../../../functions-lib/studio.js';

const PRICES = '/weddings';

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const days = [7, 30, 90].includes(Number(p.get('days'))) ? Number(p.get('days')) : 30;
  const who = ['ad', 'other'].includes(p.get('who')) ? p.get('who') : 'all';
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const db = env.DB;
  const V = `WITH pv AS (SELECT COALESCE(vid, sid) k, * FROM page_views WHERE at >= ?1),
    v AS (SELECT k, min(at) first_at, max(ad) ad, max(mobile) mobile, count(*) pages, max(vid) vid,
      max(rtrim(path, '/') = '${PRICES}') pricing, max(rtrim(path, '/') = '/contact') contact, (max(rtrim(path, '/') = '/thanks') OR k IN (SELECT visitor_id FROM jobs WHERE visitor_id IS NOT NULL)) enquired,
      sum(CASE WHEN rtrim(path, '/') = '${PRICES}' THEN secs ELSE 0 END) p_secs, max(CASE WHEN rtrim(path, '/') = '${PRICES}' THEN scroll END) p_scroll,
      max(ad_term) term, (SELECT x.ref FROM pv x WHERE x.k = pv.k AND x.seq = 1 ORDER BY x.at LIMIT 1) ref
      FROM pv GROUP BY k ${who === 'ad' ? 'HAVING max(ad) = 1' : who === 'other' ? 'HAVING max(ad) = 0' : ''})`;
  const [funnel, bySource, leavers] = await Promise.all([
    db.prepare(`${V} SELECT count(*) visitors, COALESCE(sum(pricing), 0) pricing, COALESCE(sum(pricing AND (contact OR enquired)), 0) pricing_contact,
      COALESCE(sum(contact OR enquired), 0) contact, COALESCE(sum(enquired), 0) enquired, COALESCE(sum(pricing AND enquired), 0) pricing_enquired FROM v`).bind(since).first(),
    db.prepare(`${V} SELECT CASE WHEN ad = 1 THEN 'Google ad' WHEN ref = 'google' THEN 'Google search' WHEN ref IN ('facebook', 'instagram') THEN 'Facebook / Instagram'
        WHEN ref = 'direct' THEN 'Typed in / bookmark' WHEN ref IS NULL OR ref = '' THEN 'Unknown' ELSE 'Other sites' END source,
      count(*) visitors, sum(pricing) pricing, sum(pricing AND NOT enquired) left_prices, sum(enquired) enquired
      FROM v GROUP BY source ORDER BY visitors DESC`).bind(since).all(),
    db.prepare(`${V} SELECT k, first_at, ad, term, ref, pages, p_secs, p_scroll, mobile, vid, contact FROM v WHERE pricing = 1 AND enquired = 0 ORDER BY first_at DESC LIMIT 150`).bind(since).all(),
  ]);
  // Scroll on the prices page: those who enquired against those who didn't.
  const scroll = (await db.prepare(`${V} SELECT CASE WHEN p_scroll IS NULL OR p_scroll < 25 THEN 0 WHEN p_scroll < 50 THEN 25 WHEN p_scroll < 75 THEN 50 ELSE 75 END bucket,
      sum(enquired) enquired, sum(NOT enquired) gone FROM v WHERE pricing = 1 GROUP BY bucket ORDER BY bucket`).bind(since).all()).results;
  // Where each leaver went after the prices page (or that they left from it), and their path.
  const keys = leavers.results.map((l) => l.k);
  const paths = keys.length ? (await db.prepare(`SELECT COALESCE(vid, sid) k, path, at FROM page_views WHERE at >= ?1 AND COALESCE(vid, sid) IN (SELECT value FROM json_each(?2)) ORDER BY at, seq`)
    .bind(since, JSON.stringify(keys)).all()).results : [];
  const byKey = new Map();
  for (const r of paths) { if (!byKey.has(r.k)) byKey.set(r.k, []); byKey.get(r.k).push(r.path.replace(/\/$/, '') || '/'); }
  const source = (l) => (l.ad ? `Google ad${l.term ? ` (“${l.term}”)` : ''}` : l.ref === 'google' ? 'Google search' : l.ref === 'direct' ? 'Typed in / bookmark' : l.ref || 'Unknown');
  return json({
    days, who, prices: PRICES, funnel, sources: bySource.results, scroll,
    leavers: leavers.results.map((l) => {
      const ps = byKey.get(l.k) ?? [];
      const last = ps.lastIndexOf(PRICES);
      return { when: l.first_at, source: source(l), pages: l.pages, secs: l.p_secs, scroll: l.p_scroll, mobile: !!l.mobile, vid: l.vid, contact: !!l.contact,
        next: last === -1 ? null : ps[last + 1] ?? '(left the site)', path: ps.slice(0, 12) };
    }),
  });
}
