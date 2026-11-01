// The Monday Google Ads check (run by the timer, functions/api/crm/run.js): an email to Tony with
// last week's spend, enquiries and cost per enquiry (vs the week before), search terms that cost
// money and brought nothing (to block), keywords costing money with no enquiries in 30 days, and a
// warning if the Ads Script has stopped sending. Also a task on his list. Data from functions-lib/ads.js.
import { nzNow } from './schedules.js';
import { alertTony } from './crm.js';
import { blockSuggestions } from './ads.js';
import { adText } from './ad-text.js';

const money = (c) => `$${(c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** The numbers for the email (also handy for testing). */
export async function adsWeekNumbers(env, today) {
  const db = env.DB;
  const end = day(today, -1), start = day(today, -7), pEnd = day(today, -8), pStart = day(today, -14), since30 = day(today, -30);
  const sum = (a, b) => db.prepare(`SELECT COALESCE(SUM(cost_cents), 0) cost, COALESCE(SUM(clicks), 0) clicks, COALESCE(SUM(impressions), 0) impr, COALESCE(SUM(conversions), 0) conv
    FROM ads_campaign_daily WHERE date BETWEEN ?1 AND ?2`).bind(a, b).first();
  const [week, prev, terms, keywords, last, changes, tagged] = await Promise.all([
    sum(start, end), sum(pStart, pEnd),
    // Searches that cost money and brought nothing, other than your own keywords and ones already blocked.
    blockSuggestions(db, start, 300, end),
    // Keywords costing $30+ in 30 days, with clicks and enquiries (judged only once they've had enough clicks).
    db.prepare(`SELECT text, match_type, SUM(cost_cents) cost, SUM(clicks) clicks, SUM(conversions) conv FROM ads_keyword_daily WHERE date >= ?1 AND status = 'ENABLED'
      GROUP BY text, match_type HAVING SUM(cost_cents) >= 3000 ORDER BY conv > 0, cost DESC LIMIT 10`).bind(since30).all(),
    db.prepare(`SELECT max(run_at) at FROM ads_import_log WHERE report = 'done'`).first(),
    // Images the script added or swapped out (Ad picks), and approved changes it couldn't make.
    db.prepare(`SELECT type, status, payload, error FROM ads_action WHERE type IN ('add_image', 'remove_image') AND applied_at >= ?1 ORDER BY id`).bind(`${start}T00:00:00`).all(),
    // Enquiries the site itself saw arrive from an ad click (EnquiryForm.astro), with their keywords.
    db.prepare(`SELECT title, ad_click FROM jobs WHERE ad_click IS NOT NULL AND created_at >= ?1 AND created_at < ?2 ORDER BY created_at`).bind(`${start}T00:00:00`, `${day(end, 1)}T00:00:00`).all(),
  ]);
  // The site's own visit log (Studio > SEO > Visits): last 7 days, everyone and ad visits, and the
  // page ad visitors most often leave from.
  const since = `${start}T00:00:00`, until = `${day(end, 1)}T00:00:00`;
  const [visits, exit] = await Promise.all([
    db.prepare(`WITH v AS (SELECT sid, max(ad) ad, count(*) pages, sum(secs) secs FROM page_views WHERE at >= ?1 AND at < ?2 GROUP BY sid)
      SELECT count(*) visits, COALESCE(sum(ad), 0) ads, avg(CASE WHEN ad = 1 THEN pages END) ad_pages, avg(CASE WHEN ad = 1 THEN secs END) ad_secs,
        COALESCE(sum(ad = 1 AND pages = 1 AND secs < 15), 0) ad_quick FROM v`).bind(since, until).first(),
    db.prepare(`WITH v AS (SELECT sid, max(seq) last FROM page_views WHERE at >= ?1 AND at < ?2 GROUP BY sid HAVING max(ad) = 1)
      SELECT pv.path, count(*) views, sum(pv.seq = v.last) exits FROM page_views pv JOIN v ON v.sid = pv.sid WHERE pv.at >= ?1
      GROUP BY pv.path HAVING views >= 3 ORDER BY exits * 1.0 / views DESC, views DESC LIMIT 1`).bind(since, until).first(),
  ]);
  return { start, end, week, prev, terms: terms.slice(0, 12), keywords: keywords.results, last: last?.at ?? null, changes: changes.results.map((c) => ({ ...c, payload: JSON.parse(c.payload) })), tagged: tagged.results, visits, exit };
}

// Roughly 1 in 25 wedding ad clicks becomes an enquiry, so a keyword with fewer clicks and no enquiry
// hasn't had a fair go yet; past that, it's worth pausing or fixing.
export const FAIR_CLICKS = 25;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TH = 'padding:6px 8px;border-bottom:1px solid #e6dfd3;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#777;font-weight:600;text-align:right;white-space:nowrap';
const TD = 'padding:7px 8px;border-bottom:1px solid #f1ebe1;font-size:14px;text-align:right;white-space:nowrap;vertical-align:top';
/** What to make of a keyword's 30 days: [words, colour]. */
export function keywordVerdict(k) {
  const conv = Math.round(k.conv * 10) / 10;
  if (conv > 0) return [`${conv} enquir${conv === 1 ? 'y' : 'ies'} (${money(k.cost / k.conv)} each)`, '#5a5e3b'];
  if (k.clicks >= FAIR_CLICKS) return ['Pause or fix', '#a8432a'];
  return [`Too early (${k.clicks} of ~${FAIR_CLICKS} clicks)`, '#888'];
}
/** The keywords as a table for the email: { html }, so it gets the full width under its heading. */
export function keywordTable(keywords) {
  if (!keywords.length) return 'None has cost $30 or more.';
  const rows = keywords.map((k) => {
    const [verdict, colour] = keywordVerdict(k);
    return `<tr><td style="${TD};text-align:left;white-space:normal">${esc(k.text)}<br><span style="font-size:12px;color:#888">${esc(String(k.match_type).toLowerCase())}</span></td>`
      + `<td style="${TD}">${money(k.cost)}</td><td style="${TD}">${k.clicks}</td><td style="${TD}">${k.clicks ? money(k.cost / k.clicks) : '–'}</td>`
      + `<td style="${TD};color:${colour};white-space:normal">${verdict}</td></tr>`;
  }).join('');
  return { html: `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Raleway,Arial,sans-serif">`
    + `<tr><th style="${TH};text-align:left">Keyword</th><th style="${TH}">Spent</th><th style="${TH}">Clicks</th><th style="${TH}">Per click</th><th style="${TH}">Verdict</th></tr>${rows}</table>`
    + `<p style="margin:6px 0 0;font-size:12px;color:#888">About 1 in ${FAIR_CLICKS} ad clicks becomes an enquiry, so a keyword isn’t judged until it’s had about ${FAIR_CLICKS} clicks.</p>` };
}

const VISITS_PAGE = 'https://www.momentsinlight.co.nz/studio/stats/visits';
const secsText = (s) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`);
/** The week's visits, and the prompt (with a link) to go and look: { html }. */
export function visitsText(n) {
  const v = n.visits || {};
  const lines = [];
  if (!v.visits) lines.push('None counted yet (counting started 2 Nov).');
  else {
    lines.push(`${v.visits} visit${v.visits === 1 ? '' : 's'}, ${v.ads} from Google ads.`);
    if (v.ads) lines.push(`Ad visitors looked at ${Math.round(v.ad_pages * 10) / 10} pages for ${secsText(v.ad_secs || 0)} on average; ${Math.round((v.ad_quick / v.ads) * 100)}% left straight away.`);
    if (n.exit?.exits) lines.push(`Ad visitors most often leave from <strong>${esc(n.exit.path)}</strong> (${Math.round((n.exit.exits / n.exit.views) * 100)}% of its views).`);
  }
  return { html: `${lines.map((l) => `<p style="margin:0 0 6px;font-size:15px">${l}</p>`).join('')}<p style="margin:8px 0 0;font-size:15px"><a href="${VISITS_PAGE}" style="color:#5a5e3b;font-weight:600">Take 5 minutes to see where people go and where they leave →</a></p>` };
}

export async function adsWeekly(env) {
  const nz = nzNow();
  if (nz.weekday !== 'Mon' || nz.hour < 8 || nz.hour >= 12) return 'not Monday morning';
  const db = env.DB;
  if (!(await db.prepare(`SELECT 1 FROM settings WHERE key = 'ads_sync'`).first())) return 'Google Ads not connected';
  const claimed = await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('ads_weekly', ?1, ?2)
    ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2 WHERE json_extract(settings.value, '$.last') IS NOT ?3`)
    .bind(JSON.stringify({ last: nz.date }), new Date().toISOString(), nz.date).run();
  if (!claimed.meta.changes) return 'sent today';

  const n = await adsWeekNumbers(env, nz.date);
  const per = (x) => (x.conv >= 0.5 ? money(x.cost / x.conv) : 'no enquiries');
  const change = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : '');
  const stale = !n.last || Date.now() - Date.parse(n.last) > 30 * 3600_000;
  const rows = [
    ...(stale ? [['⚠ Data', `The Google Ads script hasn’t sent anything since ${n.last ? n.last.slice(0, 10) : 'it was set up'}. Check it’s set to Hourly in Google Ads (Tools > Bulk actions > Scripts).`]] : []),
    ['Week', `${n.start} to ${n.end}`],
    ['Spent', `${money(n.week.cost)} ${change(n.week.cost, n.prev.cost) && `(${change(n.week.cost, n.prev.cost)} on the week before)`}`],
    ['Clicks', `${n.week.clicks} (${n.week.clicks ? money(n.week.cost / n.week.clicks) : '–'} each)`],
    ['Enquiries from ads', `${Math.round(n.week.conv * 10) / 10} (the week before: ${Math.round(n.prev.conv * 10) / 10})`],
    ['Enquiries the site saw from ads', n.tagged.length ? n.tagged.map((t) => `${t.title}: ${adText(t.ad_click)}`).join('\n') : 'None this week.'],
    ['Cost per enquiry', `${per(n.week)} (the week before: ${per(n.prev)})`],
    ['Searches to block?', n.terms.length ? n.terms.map((t) => `${t.search_term}: ${money(t.cost)}, ${t.clicks} click${t.clicks === 1 ? '' : 's'}`).join('\n') : 'None: every search that cost $3+ brought an enquiry or is already blocked.'],
    ['Keywords (last 30 days)', keywordTable(n.keywords)],
    ...(n.changes.length ? [['Ad images', n.changes.map((c) => c.status !== 'done' ? `Couldn’t ${c.type === 'add_image' ? 'add' : 'swap out'} ${c.payload.name || 'an image'}: ${c.error}`
      : c.type === 'add_image' ? `Added ${c.payload.name}` : `Swapped out ${c.payload.name || `image ${c.payload.asset_id}`} (${c.payload.views ?? '?'} views, ${c.payload.clicks ?? '?'} clicks in 30 days; still in your library)`).join('\n')]] : []),
    ['Visits to the site', visitsText(n)],
    ['What to do','Block any searches that aren’t for you: Studio > SEO > Google Ads > Block searches, then Approve. The script adds them within the hour. Ask Claude if anything looks odd.'],
  ];
  await alertTony(env, `Google Ads this week: ${money(n.week.cost)} spent, ${Math.round(n.week.conv * 10) / 10} enquiries`, rows, 'https://www.momentsinlight.co.nz/studio/seo/ads');
  await db.prepare(`INSERT INTO tasks (title, notes, due_date, created_at) VALUES (?1, ?2, ?3, ?4)`)
    .bind(`Google Ads weekly check (${nz.date})`, `Spent ${money(n.week.cost)}, ${Math.round(n.week.conv * 10) / 10} enquiries, cost per enquiry ${per(n.week)}. ${n.terms.length} search${n.terms.length === 1 ? '' : 'es'} to consider blocking. Details in this morning’s email.`, nz.date, new Date().toISOString()).run();
  return `sent: ${money(n.week.cost)}, ${n.terms.length} terms`;
}
