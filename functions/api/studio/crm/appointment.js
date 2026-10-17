// Appointments in a job (practice shoot, planning meeting…): on the client page and the calendar,
// and copied to Google Calendar.
//   POST   /api/studio/crm/appointment  { job_id, title, date, start_time?, end_time?, location?, notes? }
//   PUT    /api/studio/crm/appointment  { id, ...same }
//   DELETE /api/studio/crm/appointment?id=4
import { json } from '../../../../functions-lib/studio.js';
import { syncSoon, unsyncAppointment } from '../../../../functions-lib/calendar.js';

const text = (v, max) => (v ?? '').toString().trim().slice(0, max);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function fields(d) {
  const title = text(d.title, 120);
  if (!title) throw new Error('What is it? e.g. Practice shoot');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) throw new Error('Choose a date.');
  const start = TIME.test(d.start_time || '') ? d.start_time : null;
  const end = start && TIME.test(d.end_time || '') ? d.end_time : null;
  if (start && end && end <= start) throw new Error('The end time is before the start.');
  return { title, date: d.date, start, end, location: text(d.location, 300), notes: text(d.notes, 2000) };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const d = await request.json().catch(() => null);
  const jobId = Number(d?.job_id);
  if (!jobId || !(await env.DB.prepare('SELECT 1 FROM jobs WHERE id = ?1').bind(jobId).first())) return json({ error: 'That job doesn’t exist.' }, 404);
  let a; try { a = fields(d); } catch (e) { return json({ error: e.message }, 400); }
  const now = new Date().toISOString();
  const row = await env.DB.prepare('INSERT INTO appointments (job_id, title, date, start_time, end_time, location, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) RETURNING id')
    .bind(jobId, a.title, a.date, a.start, a.end, a.location, a.notes, now).first();
  await env.DB.prepare('UPDATE jobs SET gcal_synced_at = NULL WHERE id = ?1').bind(jobId).run();
  syncSoon(context, jobId);
  return json({ ok: true, id: row.id });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const d = await request.json().catch(() => null);
  const old = d?.id && await env.DB.prepare('SELECT * FROM appointments WHERE id = ?1').bind(Number(d.id)).first();
  if (!old) return json({ error: 'That appointment doesn’t exist.' }, 404);
  let a; try { a = fields(d); } catch (e) { return json({ error: e.message }, 400); }
  await env.DB.batch([
    env.DB.prepare('UPDATE appointments SET title = ?2, date = ?3, start_time = ?4, end_time = ?5, location = ?6, notes = ?7, updated_at = ?8 WHERE id = ?1')
      .bind(old.id, a.title, a.date, a.start, a.end, a.location, a.notes, new Date().toISOString()),
    env.DB.prepare('UPDATE jobs SET gcal_synced_at = NULL WHERE id = ?1').bind(old.job_id),
  ]);
  syncSoon(context, old.job_id);
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const old = await env.DB.prepare('SELECT * FROM appointments WHERE id = ?1').bind(Number(new URL(request.url).searchParams.get('id'))).first();
  if (!old) return json({ ok: true });
  await env.DB.prepare('DELETE FROM appointments WHERE id = ?1').bind(old.id).run();
  const p = unsyncAppointment(env, old).catch((e) => console.error('calendar unsync', e.message));
  if (context.waitUntil) context.waitUntil(p);
  return json({ ok: true });
}
