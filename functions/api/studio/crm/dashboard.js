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
       (SELECT coalesce(sum(i.amount), 0) FROM invoices i JOIN jobs j ON j.id = i.job_id WHERE i.status = 'paid' AND i.paid_at >= ?1 AND i.paid_at < ?2 AND ${T(3)}) AS payments,
       (SELECT coalesce(sum(q.total), 0) FROM quotes q JOIN jobs j ON j.id = q.job_id WHERE q.status = 'accepted' AND q.accepted_at >= ?1 AND q.accepted_at < ?2 AND ${T(3)}) AS booked_value`,
  ).bind(a, b, type).first();

  // 12 months ending with the range's last month.
  const end = new Date(to);
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11 + i, 1)).toISOString().slice(0, 7));
  const chartFrom = `${months[0]}-01T00:00:00.000Z`;

  const [now_, before, leadsBy, bookedBy, sources, shoots, leads, payments, tasks, types] = await Promise.all([
    totals(from, to),
    totals(yearBefore(from), yearBefore(to)),
    db.prepare(`SELECT substr(j.created_at, 1, 7) m, count(*) n FROM jobs j WHERE j.created_at >= ?1 AND ${T(2)} GROUP BY m`).bind(chartFrom, type).all(),
    db.prepare(`SELECT substr(j.booked_at, 1, 7) m, count(*) n FROM jobs j WHERE j.booked_at >= ?1 AND ${T(2)} GROUP BY m`).bind(chartFrom, type).all(),
    db.prepare(`SELECT coalesce(nullif(j.lead_source, ''), 'Not given') source, count(*) n FROM jobs j WHERE j.created_at >= ?1 AND j.created_at < ?2 AND ${T(3)} GROUP BY source ORDER BY n DESC`).bind(from, to, type).all(),
    db.prepare(`SELECT j.id, j.title, j.job_type, j.event_date, j.venue FROM jobs j WHERE j.stage = 'booked' AND j.event_date >= ?1 AND ${T(2)} ORDER BY j.event_date LIMIT 100`).bind(today, type).all(),
    db.prepare(
      `SELECT j.id, j.title, j.job_type, j.event_date, j.created_at, j.replied_at,
         (SELECT m.direction || '|' || m.subject || '|' || m.sent_at FROM messages m WHERE m.job_id = j.id ORDER BY m.sent_at DESC LIMIT 1) AS last_email,
         (SELECT s.title || '|' || s.due_at || '|' || s.kind FROM steps s WHERE s.job_id = j.id AND s.status IN ('scheduled', 'due', 'failed') ORDER BY s.due_at LIMIT 1) AS next_step
       FROM jobs j WHERE j.stage = 'lead' AND ${T(1)} ORDER BY j.created_at DESC LIMIT 100`,
    ).bind(type).all(),
    db.prepare(
      `SELECT i.id, i.job_id, i.number, i.label, i.amount, i.due_date, i.status, i.send_at, j.title
       FROM invoices i JOIN jobs j ON j.id = i.job_id WHERE i.status IN ('sent', 'scheduled') AND ${T(1)} ORDER BY i.due_date, i.id LIMIT 100`,
    ).bind(type).all(),
    db.prepare(
      `SELECT s.id, s.job_id, s.kind, s.title, s.due_at, s.status, j.title AS job_title
       FROM steps s JOIN jobs j ON j.id = s.job_id
       WHERE ((s.status IN ('scheduled', 'due') AND s.kind IN ('ready_email', 'todo')) OR s.status = 'failed') AND ${T(1)}
       ORDER BY s.due_at LIMIT 100`,
    ).bind(type).all(),
    db.prepare(`SELECT value FROM lists WHERE kind = 'job_type' ORDER BY sort, id`).all(),
  ]);
  const count = (rows) => Object.fromEntries(rows.results.map((r) => [r.m, r.n]));
  const l = count(leadsBy), b = count(bookedBy);
  return json({
    mode: sendMode(env), from, to, type, today, now,
    totals: now_, before,
    chart: months.map((m) => ({ month: m, leads: l[m] || 0, booked: b[m] || 0 })),
    sources: sources.results,
    shoots: shoots.results, leads: leads.results, payments: payments.results, tasks: tasks.results,
    types: types.results.map((r) => r.value),
  });
}
