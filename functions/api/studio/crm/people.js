// Clients page tabs beyond Leads and Booked (src/pages/studio/crm/index.astro).
//   GET /api/studio/crm/people?view=past   completed jobs, newest first, with what was paid
//   GET /api/studio/crm/people?view=lost   jobs not going ahead (past enquiries, cancelled)
//   GET /api/studio/crm/people?view=all    everyone, with their jobs (people with no job too)
import { json } from '../../../../functions-lib/studio.js';

export async function onRequestGet({ request, env }) {
  const view = new URL(request.url).searchParams.get('view');
  const db = env.DB;
  if (view === 'past' || view === 'lost') {
    const rows = (await db.prepare(`SELECT j.id, j.title, j.job_type, j.stage, j.event_date, j.venue, j.lead_source, j.created_at, j.lost_at, j.import_batch,
        c.first_name, c.last_name, c.email, c.test,
        (SELECT COALESCE(SUM(amount), 0) FROM invoices i WHERE i.job_id = j.id AND i.status = 'paid') paid
      FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.stage = ?1
      ORDER BY ${view === 'past' ? 'COALESCE(j.event_date, j.created_at)' : 'j.created_at'} DESC`).bind(view === 'past' ? 'completed' : 'lost').all()).results;
    return json({ rows });
  }
  if (view === 'all') {
    const [clients, jobs] = await Promise.all([
      db.prepare(`SELECT id, first_name, last_name, email, phone, address, notes, created_at, import_batch, test FROM clients ORDER BY lower(first_name), lower(last_name)`).all(),
      db.prepare(`SELECT id, client_id, title, job_type, stage, event_date FROM jobs ORDER BY COALESCE(event_date, created_at) DESC`).all(),
    ]);
    const by = new Map();
    for (const j of jobs.results) (by.get(j.client_id) ?? by.set(j.client_id, []).get(j.client_id)).push(j);
    return json({ rows: clients.results.map((c) => ({ ...c, jobs: by.get(c.id) ?? [] })) });
  }
  return json({ error: 'Which view?' }, 400);
}
