// The studio's dashboard (/studio): totals for a date range, the monthly leads vs booked chart,
// lead sources, and the lists (upcoming shoots, recent leads, payments, tasks).
//   GET /api/studio/crm/dashboard?from=ISO&to=ISO&type=Wedding
// from/to are the range's start and end as moments in time (the page works them out in NZ time);
// the totals are compared with the same range a year earlier. type '' = all job types.
// Only covers what's in the new system (Studio Ninja's history isn't imported yet).
import { json } from '../../../../functions-lib/studio.js';
import { sendMode } from '../../../../functions-lib/crm.js';

const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;
const yearBefore = (iso) => { const d = new Date(iso); d.setUTCFullYear(d.getUTCFullYear() - 1); return d.toISOString(); };

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const to = ISO.test(p.get('to') || '') ? p.get('to') : new Date().toISOString();
  const from = ISO.test(p.get('from') || '') ? p.get('from') : new Date(Date.now() - 30 * 86400_000).toISOString();
  const type = (p.get('type') || '').slice(0, 60);
  const db = env.DB;
  // The job type filter, on parameter ?n.
const T = (n) => `(?${n} = '' OR j.job_type = ?${n})`;
  const now = new Date().toISOString();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });

  const totals = (a, b) => db.prepare(
    `SELECT
       (SELECT count(*) FROM jobs j WHERE j.created_at >= ?1 AND j.created_at < ?2 AND ${T(3)}) AS leads,
       (SELECT count(*) FROM jobs j WHERE j.booked_at >= ?1 AND j.booked_at < ?2 AND ${T(3)}) AS booked,
       (SELECT count(*) FROM jobs j WHERE j.lost_at >= ?1 AND j.lost_at < ?2 AND ${T(3)}) AS lost,
       -- Of the enquiries in the period: how many have booked, been lost, or are still deciding.
       (SELECT count(*) FROM jobs j WHERE j.created_at >= ?1 AND j.created_at < ?2 AND j.booked_at IS NOT NULL AND ${T(3)}) AS cohort_won,
       (SELECT count(*) FROM jobs j WHERE j.created_at >= ?1 AND j.created_at < ?2 AND j.stage = 'lost' AND ${T(3)}) AS cohort_lost,
       (SELECT count(*) FROM jobs j WHERE j.created_at >= ?1 AND j.created_at < ?2 AND j.stage = 'lead' AND ${T(3)}) AS cohort_open,
       (SELECT coalesce(sum(i.amount), 0) FROM invoices i JOIN jobs j ON j.id = i.job_id WHERE i.status = 'paid' AND i.paid_at >= ?1 AND i.paid_at < ?2 AND ${T(3)}) AS payments,
       (SELECT coalesce(sum(q.total), 0) FROM quotes q JOIN jobs j ON j.id = q.job_id WHERE q.status = 'accepted' AND q.accepted_at >= ?1 AND q.accepted_at < ?2 AND ${T(3)}) AS booked_value`,
  ).bind(a, b, type).first();

  // 12 months ending with the range's last month.
  const end = new Date(to);
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11 + i, 1)).toISOString().slice(0, 7));
  const chartFrom = `${months[0]}-01T00:00:00.000Z`;

  const [now_, before, leadsBy, bookedBy, sources, shoots, leads, payments, tasks, types, cohorts, speed, ahead, own] = await Promise.all([
    totals(from, to),
    totals(yearBefore(from), yearBefore(to)),
    db.prepare(`SELECT substr(j.created_at, 1, 7) m, count(*) n FROM jobs j WHERE j.created_at >= ?1 AND ${T(2)} GROUP BY m`).bind(chartFrom, type).all(),
    db.prepare(`SELECT substr(j.booked_at, 1, 7) m, count(*) n FROM jobs j WHERE j.booked_at >= ?1 AND ${T(2)} GROUP BY m`).bind(chartFrom, type).all(),
    db.prepare(`SELECT coalesce(nullif(j.lead_source, ''), 'Not given') source, count(*) n FROM jobs j WHERE j.created_at >= ?1 AND j.created_at < ?2 AND ${T(3)} GROUP BY source ORDER BY n DESC`).bind(from, to, type).all(),
    db.prepare(`SELECT j.id, j.title, j.job_type, j.event_date, j.venue FROM jobs j WHERE j.stage = 'booked' AND j.event_date >= ?1 AND ${T(2)} ORDER BY j.event_date LIMIT 100`).bind(today, type).all(),
    db.prepare(
      `SELECT j.id, j.title, j.job_type, j.event_date, j.created_at, j.replied_at,
         (SELECT m.direction || '|' || m.subject || '|' || m.sent_at FROM messages m WHERE m.job_id = j.id ORDER BY m.sent_at DESC LIMIT 1) AS last_email,
         (SELECT s.title || '|' || s.due_at || '|' || s.kind FROM steps s WHERE s.job_id = j.id AND s.status IN ('scheduled', 'due', 'failed') AND s.due_at < '9000' ORDER BY s.due_at LIMIT 1) AS next_step
       FROM jobs j WHERE j.stage = 'lead' AND ${T(1)} ORDER BY j.created_at DESC LIMIT 100`,
    ).bind(type).all(),
    db.prepare(
      `SELECT i.id, i.job_id, i.number, i.label, i.amount, i.due_date, i.status, i.send_at, j.title
       FROM invoices i JOIN jobs j ON j.id = i.job_id WHERE i.status IN ('sent', 'scheduled') AND ${T(1)} ORDER BY i.due_date, i.id LIMIT 100`,
    ).bind(type).all(),
    db.prepare(
      `SELECT s.id, s.job_id, s.kind, s.title, s.due_at, s.status, j.title AS job_title
       FROM steps s JOIN jobs j ON j.id = s.job_id
       WHERE ((s.status IN ('scheduled', 'due') AND s.kind IN ('ready_email', 'todo') AND s.due_at < '9000') OR s.status = 'failed') AND ${T(1)}
       ORDER BY s.due_at LIMIT 100`,
    ).bind(type).all(),
    db.prepare(`SELECT value FROM lists WHERE kind = 'job_type' ORDER BY sort, id`).all(),
    // Month by month (by the month they enquired): what became of those enquiries.
    db.prepare(`SELECT substr(j.created_at, 1, 7) m, count(*) enquiries, sum(j.booked_at IS NOT NULL) won, sum(j.stage = 'lost') lost, sum(j.stage = 'lead') open
      FROM jobs j WHERE j.created_at >= ?1 AND j.created_at < ?3 AND ${T(2)} GROUP BY m`).bind(chartFrom, type, to).all(),
    // How long after enquiring they booked (bookings in the 12 months).
    db.prepare(`SELECT CASE WHEN d < 7 THEN 'week' WHEN d < 31 THEN 'month' WHEN d < 92 THEN 'quarter' ELSE 'longer' END b, count(*) n
      FROM (SELECT julianday(j.booked_at) - julianday(j.created_at) d FROM jobs j WHERE j.booked_at >= ?1 AND j.booked_at < ?3 AND ${T(2)}) GROUP BY b`).bind(chartFrom, type, to).all(),
    // How far ahead of the date they booked.
    db.prepare(`SELECT CASE WHEN d < 91 THEN 'u3' WHEN d < 183 THEN 'u6' WHEN d < 365 THEN 'u12' WHEN d < 548 THEN 'u18' ELSE 'o18' END b, count(*) n
      FROM (SELECT julianday(j.event_date) - julianday(substr(j.booked_at, 1, 10)) d FROM jobs j WHERE j.booked_at >= ?1 AND j.booked_at < ?3 AND j.event_date IS NOT NULL AND ${T(2)}) GROUP BY b`).bind(chartFrom, type, to).all(),
    // Studio tasks (not about a client).
    db.prepare(`SELECT t.id, t.title, t.due_date, t.contact_id, c.business FROM tasks t LEFT JOIN contacts c ON c.id = t.contact_id WHERE t.status = 'open' ORDER BY t.due_date IS NULL, t.due_date LIMIT 100`).all(),
  ]);
  const count = (rows) => Object.fromEntries(rows.results.map((r) => [r.m, r.n]));
  const l = count(leadsBy), b = count(bookedBy);
  return json({
    mode: sendMode(env), from, to, type, today, now,
    totals: now_, before,
    chart: months.map((m) => ({ month: m, leads: l[m] || 0, booked: b[m] || 0 })),
    sources: sources.results,
    monthly: months.map((m) => { const r = cohorts.results.find((x) => x.m === m) || {}; return { month: m, enquiries: r.enquiries || 0, won: r.won || 0, lost: r.lost || 0, open: r.open || 0 }; }),
    speed: Object.fromEntries(speed.results.map((r) => [r.b, r.n])),
    ahead: Object.fromEntries(ahead.results.map((r) => [r.b, r.n])),
    shoots: shoots.results, leads: leads.results, payments: payments.results, tasks: tasks.results, own: own.results,
    types: types.results.map((r) => r.value),
  });
}
