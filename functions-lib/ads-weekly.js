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
  return { start, end, week, prev, terms: terms.slice(0, 12), keywords: keywords.results, last: last?.at ?? null, changes: changes.results.map((c) => ({ ...c, payload: JSON.parse(c.payload) })), tagged: tagged.results };
}

// Roughly 1 in 25 wedding ad clicks becomes an enquiry, so a keyword with fewer clicks and no enquiry
// hasn't had a fair go yet; past that, it's worth pausing or fixing.
export const FAIR_CLICKS = 25;
export function keywordLine(k) {
  const conv = Math.round(k.conv * 10) / 10;
  const each = k.clicks ? ` (${money(k.cost / k.clicks)} each)` : '';
  const verdict = conv > 0 ? `${conv} enquir${conv === 1 ? 'y' : 'ies'}, ${money(k.cost / k.conv)} each`
    : k.clicks >= FAIR_CLICKS ? 'no enquiries: worth pausing or fixing'
    : `no enquiries yet: too early to tell (judge at about ${FAIR_CLICKS} clicks)`;
  return `${k.text} (${String(k.match_type).toLowerCase()}): ${money(k.cost)}, ${k.clicks} click${k.clicks === 1 ? '' : 's'}${each}, ${verdict}`;
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
    ['Keywords (30 days)', n.keywords.length ? n.keywords.map(keywordLine).join('\n') : 'None has cost $30 or more.'],
    ...(n.changes.length ? [['Ad images', n.changes.map((c) => c.status !== 'done' ? `Couldn’t ${c.type === 'add_image' ? 'add' : 'swap out'} ${c.payload.name || 'an image'}: ${c.error}`
      : c.type === 'add_image' ? `Added ${c.payload.name}` : `Swapped out ${c.payload.name || `image ${c.payload.asset_id}`} (${c.payload.views ?? '?'} views, ${c.payload.clicks ?? '?'} clicks in 30 days; still in your library)`).join('\n')]] : []),
    ['What to do', 'Block any searches that aren’t for you: Studio > SEO > Google Ads > Block searches, then Approve. The script adds them within the hour. Ask Claude if anything looks odd.'],
  ];
  await alertTony(env, `Google Ads this week: ${money(n.week.cost)} spent, ${Math.round(n.week.conv * 10) / 10} enquiries`, rows, 'https://www.momentsinlight.co.nz/studio/seo/ads');
  await db.prepare(`INSERT INTO tasks (title, notes, due_date, created_at) VALUES (?1, ?2, ?3, ?4)`)
    .bind(`Google Ads weekly check (${nz.date})`, `Spent ${money(n.week.cost)}, ${Math.round(n.week.conv * 10) / 10} enquiries, cost per enquiry ${per(n.week)}. ${n.terms.length} search${n.terms.length === 1 ? '' : 'es'} to consider blocking. Details in this morning’s email.`, nz.date, new Date().toISOString()).run();
  return `sent: ${money(n.week.cost)}, ${n.terms.length} terms`;
}
