// Studio > Payments > Booking reports: where enquiries come from, how many book, and what bookings
// are worth, by month, source and type (Studio Ninja history included). Booking value is the job's
// invoices (not void). Google Ads spend from the Ads Script's daily data, for cost per booking.
//   GET /api/studio/reports?from=YYYY-MM&to=YYYY-MM
import { json } from '../../../functions-lib/studio.js';

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const nz = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
  const now = new Date();
  const defFrom = nz(new Date(now.getFullYear() - 2, now.getMonth() + 1, 1)).slice(0, 7);
  const from = /^\d{4}-\d{2}$/.test(q.get('from') ?? '') ? q.get('from') : defFrom;
  const to = /^\d{4}-\d{2}$/.test(q.get('to') ?? '') ? q.get('to') : nz(now).slice(0, 7);
  const db = env.DB;
  const month = (iso) => (iso ? nz(new Date(iso)).slice(0, 7) : null);
  const [jobs, invoices, ads] = await Promise.all([
    db.prepare(`SELECT id, job_type, stage, lead_source, created_at, booked_at, event_date FROM jobs`).all(),
    db.prepare(`SELECT job_id, amount, status, paid_at FROM invoices WHERE status <> 'void'`).all(),
    db.prepare(`SELECT substr(date, 1, 7) m, sum(cost_cents) cost FROM ads_campaign_daily GROUP BY 1`).all().catch(() => ({ results: [] })),
  ]);
  const value = new Map();
  for (const i of invoices.results) value.set(i.job_id, (value.get(i.job_id) ?? 0) + i.amount);
  const inRange = (m) => m && m >= from && m <= to;
  const months = {};
  const row = (m) => (months[m] ??= { month: m, enquiries: 0, booked: 0, value: 0, paid: 0, ad_cost: 0 });
  for (let d = new Date(`${from}-01T12:00:00Z`); d.toISOString().slice(0, 7) <= to; d.setUTCMonth(d.getUTCMonth() + 1)) row(d.toISOString().slice(0, 7));
  const group = (key) => {
    const out = {};
    for (const j of jobs.results) {
      if (!inRange(month(j.created_at))) continue;
      const k = String(key(j) ?? '').replace(/^-$/, '').trim() || 'Not recorded';
      const g = (out[k] ??= { name: k, enquiries: 0, booked: 0, value: 0 });
      g.enquiries++;
      if (j.booked_at || ['booked', 'completed'].includes(j.stage)) { g.booked++; g.value += value.get(j.id) ?? 0; }
    }
    return Object.values(out).map((g) => ({ ...g, rate: g.enquiries ? g.booked / g.enquiries : 0 })).sort((a, b) => b.enquiries - a.enquiries);
  };
  const days = [];
  for (const j of jobs.results) {
    const em = month(j.created_at), bm = month(j.booked_at);
    if (inRange(em)) row(em).enquiries++;
    if (inRange(bm)) { row(bm).booked++; row(bm).value += value.get(j.id) ?? 0; }
    // (Imported jobs carry the same date for both, so only real gaps count.)
    const gap = j.booked_at && j.created_at ? (Date.parse(j.booked_at) - Date.parse(j.created_at)) / 86400_000 : 0;
    if (gap >= 0.5 && inRange(bm)) days.push(gap);
  }
  for (const i of invoices.results) if (i.status === 'paid' && inRange(month(i.paid_at))) row(month(i.paid_at)).paid += i.amount;
  for (const a of ads.results) if (inRange(a.m)) row(a.m).ad_cost += a.cost ?? 0;
  // Money still to come for booked work.
  const upcoming = invoices.results.filter((i) => i.status === 'scheduled' || i.status === 'sent').reduce((a, i) => a + i.amount, 0);
  const list = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
  const sum = (k) => list.reduce((a, m) => a + m[k], 0);
  days.sort((a, b) => a - b);
  return json({
    from, to, months: list,
    totals: { enquiries: sum('enquiries'), booked: sum('booked'), value: sum('value'), paid: sum('paid'), ad_cost: sum('ad_cost'), upcoming,
      median_days: days.length ? Math.round(days[Math.floor(days.length / 2)]) : null },
    sources: group((j) => j.lead_source), types: group((j) => j.job_type),
  });
}
