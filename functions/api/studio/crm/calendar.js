// The studio calendar (/studio/calendar): wedding/shoot dates of open leads and booked or completed
// jobs, and appointments, between two dates.
//   GET /api/studio/crm/calendar?from=2026-09-28&to=2026-11-08
import { json } from '../../../../functions-lib/studio.js';
import { calendarReady } from '../../../../functions-lib/calendar.js';
import { connection } from '../../../../functions-lib/gmail.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const from = DATE.test(p.get('from') || '') ? p.get('from') : new Date().toISOString().slice(0, 8) + '01';
  const to = DATE.test(p.get('to') || '') ? p.get('to') : from.slice(0, 8) + '31';
  const [jobs, apps, ready, gmail] = await Promise.all([
    env.DB.prepare(`SELECT j.id, j.title, j.partner_name, j.job_type, j.stage, j.event_date, j.venue FROM jobs j
      WHERE j.event_date BETWEEN ?1 AND ?2 AND j.stage IN ('lead', 'booked', 'completed') ORDER BY j.event_date, j.stage = 'lead'`).bind(from, to).all(),
    env.DB.prepare(`SELECT a.id, a.job_id, a.title, a.date, a.start_time, a.end_time, a.location, j.title AS job_title, j.partner_name, j.stage, j.job_type FROM appointments a JOIN jobs j ON j.id = a.job_id
      WHERE a.date BETWEEN ?1 AND ?2 AND j.stage <> 'lost' ORDER BY a.date, a.start_time`).bind(from, to).all(),
    calendarReady(env.DB),
    connection(env.DB),
  ]);
  // Same date, more than one open lead or booking: a clash.
  const count = {};
  for (const j of jobs.results) if (j.stage !== 'completed') count[j.event_date] = (count[j.event_date] || 0) + 1;
  return json({
    from, to,
    jobs: jobs.results.map((j) => ({ ...j, clash: count[j.event_date] > 1 })),
    appointments: apps.results,
    google: ready ? 'on' : gmail ? 'reconnect' : 'off',
  });
}
