// Google Ads at a glance, for the morning email (functions-lib/digest.js) and the Dashboard card
// (functions/api/studio/crm/ads-summary.js): yesterday, the 7 days before, this month's spend, and
// warnings (few impressions, an unusually expensive day, the Ads data not arriving). Figures come
// from the hourly Google Ads script (scripts/google-ads/sync.js → ads_campaign_daily); dates are
// the account's own (NZ). Money is cents.

const nzDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

export async function adsSummary(db, today = nzDate()) {
  const y = addDays(today, -1);
  const sum = (from, to) => db.prepare(`SELECT COALESCE(sum(cost_cents), 0) cost, COALESCE(sum(impressions), 0) impr, COALESCE(sum(clicks), 0) clicks,
      COALESCE(sum(conversions), 0) conv, count(DISTINCT date) days FROM ads_campaign_daily WHERE date BETWEEN ?1 AND ?2`).bind(from, to).first();
  const [yesterday, week, month, last] = await Promise.all([
    sum(y, y),
    sum(addDays(today, -8), addDays(today, -2)), // the 7 days before yesterday
    sum(`${today.slice(0, 7)}-01`, today),
    db.prepare(`SELECT max(run_at) at FROM ads_import_log WHERE report = 'done'`).first(),
  ]);
  const lastSync = last?.at ?? null;
  const stale = !lastSync || Date.now() - Date.parse(lastSync) > 26 * 3600_000;
  const avg = { impr: week.impr / 7, cost: week.cost / 7, clicks: week.clicks / 7 };
  const warnings = [];
  if (stale) warnings.push(`No Google Ads data since ${lastSync ? new Date(lastSync).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'it was set up'}: check the Moments Studio script in Google Ads (Tools › Bulk actions › Scripts) is running hourly.`);
  if (!stale && yesterday.days && yesterday.impr < 10) warnings.push(`Only ${yesterday.impr} impression${yesterday.impr === 1 ? '' : 's'} yesterday: the ads are hardly showing.`);
  if (!stale && yesterday.cost > 2000 && yesterday.cost > avg.cost * 2) warnings.push(`Yesterday cost $${(yesterday.cost / 100).toFixed(2)}, about ${Math.round(yesterday.cost / Math.max(avg.cost, 1))}× a usual day.`);
  return { today, yesterday: { date: y, ...yesterday, has: !!yesterday.days }, week: { ...week, avg }, month, lastSync, stale, warnings };
}

const money = (c) => `$${(c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const perEnquiry = (cost, conv) => (conv >= 1 ? ` (${money(cost / conv)} each)` : '');

/** One line for yesterday and one for the week before, for the morning email. */
export function adsLines(s) {
  const lines = [];
  if (s.yesterday.has) {
    const y = s.yesterday;
    lines.push(`<b>Yesterday:</b> ${y.impr} impressions, ${y.clicks} click${y.clicks === 1 ? '' : 's'}, ${money(y.cost)} spent, ${Math.round(y.conv * 10) / 10} enquir${y.conv === 1 ? 'y' : 'ies'}${perEnquiry(y.cost, y.conv)}`);
  }
  const w = s.week;
  if (w.days) lines.push(`<span style="color:#777">The 7 days before: ${Math.round(w.avg.impr)} impressions and ${money(w.avg.cost)} a day, ${Math.round(w.conv * 10) / 10} enquiries${perEnquiry(w.cost, w.conv)}</span>`);
  lines.push(`<span style="color:#777">This month so far: ${money(s.month.cost)} spent, ${Math.round(s.month.conv * 10) / 10} enquiries${perEnquiry(s.month.cost, s.month.conv)}</span>`);
  return [...s.warnings.map((w2) => `<b style="color:#a8432a">${w2}</b>`), ...lines];
}
