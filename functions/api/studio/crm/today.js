// The studio CRM's home screen: what's on today, and the leads and jobs.
//   GET /api/studio/crm/today
// "Today" = Tony's to-dos and ready-to-send emails that are due (or overdue), plus any automatic
// email that failed. "Coming up" = the next 14 days of planned steps.
import { json } from '../../../../functions-lib/studio.js';
import { sendMode } from '../../../../functions-lib/crm.js';
import { connection } from '../../../../functions-lib/gmail.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: 'The database isn’t connected (DB binding).' }, 500);
  const now = new Date().toISOString();
  const soon = new Date(Date.now() + 14 * 86400_000).toISOString();
  const stepCols = `s.id, s.job_id, s.step_key, s.kind, s.title, s.due_at, s.status, s.note, j.title AS job_title, j.job_type, j.event_date`;
  const [today, upcoming, jobs, gmail] = await Promise.all([
    env.DB.prepare(
      `SELECT ${stepCols} FROM steps s JOIN jobs j ON j.id = s.job_id
       WHERE (s.status IN ('scheduled', 'due') AND s.kind IN ('ready_email', 'todo') AND s.due_at <= ?1) OR s.status = 'failed'
       ORDER BY s.due_at`,
    ).bind(now).all(),
    env.DB.prepare(
      `SELECT ${stepCols} FROM steps s JOIN jobs j ON j.id = s.job_id
       WHERE s.status = 'scheduled' AND s.due_at > ?1 AND s.due_at <= ?2 ORDER BY s.due_at LIMIT 50`,
    ).bind(now, soon).all(),
    env.DB.prepare(
      `SELECT j.id, j.title, j.job_type, j.stage, j.event_date, j.venue, j.lead_source, j.created_at, c.email, c.phone, c.test
       FROM jobs j JOIN clients c ON c.id = j.client_id
       WHERE j.stage IN ('lead', 'booked') ORDER BY j.created_at DESC LIMIT 200`,
    ).all(),
    connection(env.DB),
  ]);
  return json({ mode: sendMode(env), gmail: gmail ? { email: gmail.email, connected_at: gmail.connected_at, calendar: String(gmail.scopes || '').includes('calendar.app.created') } : null, today: today.results, upcoming: upcoming.results, jobs: jobs.results });
}
