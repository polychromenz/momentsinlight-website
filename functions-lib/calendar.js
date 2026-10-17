// The studio calendar: date clashes, and keeping Tony's Google Calendar up to date.
//
// Clashes: another open lead or a booked job on the same date (shown in the new-enquiry alert,
// on the client page, and before marking a job booked).
//
// Google Calendar: the studio makes its own "Moments in Light" calendar in Tony's Google account
// (scope calendar.app.created: it can only see and change calendars it made) and keeps one event
// per lead/job date (all day; leads marked "Lead") and one per appointment. syncJob() is called
// when something changes, and the timer (functions/api/crm/run.js) catches anything that didn't
// sync (e.g. Google was down). Without the calendar permission it quietly does nothing.
import { googleToken, connection } from './gmail.js';

export const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
const SITE = 'https://www.momentsinlight.co.nz';
const OPEN = ['lead', 'booked'];

/** Other open leads and booked jobs on a date (not this job). */
export async function clashes(db, date, exceptJobId = 0) {
  if (!date) return [];
  return (await db.prepare(`SELECT id, title, stage, job_type FROM jobs WHERE event_date = ?1 AND id <> ?2 AND stage IN ('lead', 'booked') ORDER BY stage = 'booked' DESC, id`)
    .bind(date, exceptJobId).all()).results;
}

/** A clash in words, e.g. "Already booked: Anna & Mark (Wedding). Also a lead: Sam Lee (Wedding)." */
export const clashText = (list) => [
  list.filter((c) => c.stage === 'booked').map((c) => `${c.title} (${c.job_type})`).join(', ') && `Already booked: ${list.filter((c) => c.stage === 'booked').map((c) => `${c.title} (${c.job_type})`).join(', ')}.`,
  list.filter((c) => c.stage === 'lead').length && `Also a lead for this date: ${list.filter((c) => c.stage === 'lead').map((c) => `${c.title} (${c.job_type})`).join(', ')}.`,
].filter(Boolean).join(' ');

// ---- Google Calendar ----
export async function calendarReady(db) {
  const c = await connection(db);
  return !!(c?.refresh && String(c.scopes || '').includes(GCAL_SCOPE));
}

async function gcal(env, method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${await googleToken(env)}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`Google Calendar ${r.status}: ${d.error?.message || ''}`); e.status = r.status; throw e; }
  return d;
}

/** The studio's own calendar in Tony's Google account (made the first time). */
async function calendarId(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'gcal'`).first();
  if (row) return JSON.parse(row.value).id;
  const cal = await gcal(env, 'POST', '/calendars', { summary: 'Moments in Light', description: 'Leads, bookings and appointments from Moments Studio. Changes made here are overwritten; change things in the studio.', timeZone: 'Pacific/Auckland' });
  await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('gcal', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify({ id: cal.id }), new Date().toISOString()).run();
  return cal.id;
}

const nextDay = (d) => new Date(Date.parse(`${d}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);

/** Create, update or remove one Google event. Returns the event id to keep (or null). */
async function put(env, cal, eventId, event) {
  const base = `/calendars/${encodeURIComponent(cal)}/events`;
  if (!event) {
    if (eventId) await gcal(env, 'DELETE', `${base}/${encodeURIComponent(eventId)}`).catch((e) => { if (![404, 410].includes(e.status)) throw e; });
    return null;
  }
  if (eventId) {
    try { return (await gcal(env, 'PUT', `${base}/${encodeURIComponent(eventId)}`, event)).id; } catch (e) { if (![404, 410].includes(e.status)) throw e; }
  }
  return (await gcal(env, 'POST', base, event)).id;
}

/** Bring one job's Google events up to date (its date and its appointments). */
export async function syncJob(env, jobId) {
  const db = env.DB;
  if (!(await calendarReady(db))) return false;
  const job = await db.prepare('SELECT j.*, c.email, c.phone FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = ?1').bind(jobId).first();
  if (!job) return false;
  const cal = await calendarId(env);
  const link = `${SITE}/studio/crm/job?id=${job.id}`;
  const show = OPEN.includes(job.stage) || job.stage === 'completed';
  const main = show && job.event_date ? {
    summary: `${job.stage === 'lead' ? 'Lead: ' : ''}${job.job_type}: ${job.partner_name ? `${job.title.split(' ')[0]} & ${job.partner_name}` : job.title}`,
    location: job.venue || undefined,
    description: `${job.stage === 'lead' ? 'Lead (not booked yet)' : 'Booked'}\n${[job.email, job.phone].filter(Boolean).join(' · ')}\n${link}`,
    start: { date: job.event_date }, end: { date: nextDay(job.event_date) },
    colorId: job.stage === 'lead' ? '5' : '2', // banana for leads, sage for bookings
    transparency: job.stage === 'lead' ? 'transparent' : 'opaque',
  } : null;
  const id = await put(env, cal, job.gcal_event_id, main);
  await db.prepare('UPDATE jobs SET gcal_event_id = ?2, gcal_synced_at = ?3 WHERE id = ?1').bind(job.id, id, new Date().toISOString()).run();
  const apps = (await db.prepare('SELECT * FROM appointments WHERE job_id = ?1').bind(job.id).all()).results;
  for (const a of apps) {
    const timed = a.start_time;
    // No end time: an hour.
    const end = a.end_time || (timed && `${String(Math.min(23, Number(a.start_time.slice(0, 2)) + 1)).padStart(2, '0')}:${a.start_time.slice(3)}`);
    const ev = show ? {
      summary: `${a.title}: ${job.partner_name ? `${job.title.split(' ')[0]} & ${job.partner_name}` : job.title}`,
      location: a.location || undefined, description: `${a.notes ? `${a.notes}\n` : ''}${link}`,
      start: timed ? { dateTime: `${a.date}T${a.start_time}:00`, timeZone: 'Pacific/Auckland' } : { date: a.date },
      end: timed ? { dateTime: `${a.date}T${end}:00`, timeZone: 'Pacific/Auckland' } : { date: nextDay(a.date) },
      colorId: '2',
    } : null;
    const aid = await put(env, cal, a.gcal_event_id, ev);
    if (aid !== a.gcal_event_id) await db.prepare('UPDATE appointments SET gcal_event_id = ?2 WHERE id = ?1').bind(a.id, aid).run();
  }
  return true;
}

/** Remove an appointment's Google event (when the appointment is deleted). */
export async function unsyncAppointment(env, a) {
  if (!a?.gcal_event_id || !(await calendarReady(env.DB))) return;
  await put(env, await calendarId(env), a.gcal_event_id, null);
}

/** Sync without making the caller wait or fail (Google trouble is retried by the timer). */
export function syncSoon(context, jobId) {
  const p = syncJob(context.env, jobId).catch((e) => console.error('calendar sync', jobId, e.message));
  if (context.waitUntil) context.waitUntil(p); else return p;
}
