// Online booking (feature ideas, 20 Oct 2026): a page where people pick a free time for a call or a
// mini session (www.momentsinlight.co.nz/book), with payment first for paid sessions.
// Settings > Online booking (settings 'booking'): weekly hours, notice, how far ahead, the gap
// between bookings, and the kinds of booking. Free times leave out: your Google Calendar's busy
// times (calendar.freebusy, after reconnecting Google), the studio's appointments, and wedding days.
// A booking makes (or reuses) the client and a job, an appointment (so it appears in the studio
// calendar and the Google "Moments in Light" calendar), a confirmation email and an alert to Tony.
// Paid sessions are held for 30 minutes while they pay (Stripe Checkout); unpaid holds lapse.
import { googleToken, sendEmail } from './gmail.js';
import { alertTony, tidyName } from './crm.js';
import { renderTemplate, fields } from './email-render.js';
import { jobLinks } from './crm-send.js';
import { unsyncAppointment, syncJob, addMeet } from './calendar.js';

export const SITE = 'https://www.momentsinlight.co.nz';
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DEFAULTS = {
  on: false,
  hours: { mon: '09:00-17:00', tue: '09:00-17:00', wed: '09:00-17:00', thu: '09:00-17:00', fri: '09:00-17:00', sat: '', sun: '' },
  notice_hours: 24, ahead_days: 45, gap_min: 15,
  types: [
    { key: 'wedding-chat', name: 'Wedding chat', minutes: 30, price: 0, where: 'Video call (I’ll send the link) or phone, whichever you prefer', description: 'A relaxed chat about your day, what you’re after and how I work. No obligation.', job_type: 'Wedding', on: true },
    { key: 'mini-session', name: 'Mini session', minutes: 20, price: 0, where: '', description: 'A short portrait session.', job_type: 'Portraits', on: false },
  ],
};

export async function bookingSettings(db) {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = 'booking'`).first();
  const v = r ? JSON.parse(r.value) : {};
  return { ...DEFAULTS, ...v, hours: { ...DEFAULTS.hours, ...(v.hours ?? {}) }, types: v.types ?? DEFAULTS.types };
}
export async function saveBookingSettings(db, d) {
  const s = await bookingSettings(db);
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
  const next = {
    on: d.on !== undefined ? !!d.on : s.on,
    hours: Object.fromEntries(DAYS.map((k) => [k, hhmm.test(String(d.hours?.[k] ?? '').replace(/\s/g, '')) ? String(d.hours[k]).replace(/\s/g, '') : d.hours ? '' : s.hours[k]])),
    notice_hours: clampN(d.notice_hours, 0, 24 * 14, s.notice_hours),
    ahead_days: clampN(d.ahead_days, 1, 365, s.ahead_days),
    gap_min: clampN(d.gap_min, 0, 120, s.gap_min),
    types: Array.isArray(d.types) ? d.types.slice(0, 10).map((t, i) => ({
      key: /^[a-z0-9-]{2,40}$/.test(t.key ?? '') ? t.key : `type-${i + 1}`,
      name: String(t.name ?? '').trim().slice(0, 80) || 'Booking',
      minutes: clampN(t.minutes, 10, 480, 30),
      price: clampN(t.price, 0, 1_000_000, 0),
      where: String(t.where ?? '').trim().slice(0, 200),
      description: String(t.description ?? '').trim().slice(0, 500),
      job_type: String(t.job_type ?? 'Wedding').trim().slice(0, 60),
      on: !!t.on,
    })) : s.types,
  };
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('booking', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(next), new Date().toISOString()).run();
  return next;
}
const clampN = (v, lo, hi, def) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? def : Math.max(lo, Math.min(hi, Math.round(Number(v)))));

// ---- New Zealand times ----
/** A NZ wall-clock time ('YYYY-MM-DD', 'HH:MM') as a moment (handles daylight saving). */
export function nzMoment(date, time) {
  const guess = new Date(`${date}T${time}:00Z`);
  const nz = new Date(guess.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.valueOf() - (nz - utc));
}
const nzToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const dayKey = (d) => DAYS[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7];
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const whenText = (date, time) => `${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })} at ${new Date(`2000-01-01T${time}:00`).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}`;

/** Busy times [{ start, end } in ms] between two NZ dates, and the dates that are fully taken. */
async function busy(env, from, to) {
  const db = env.DB;
  const out = [];
  const blocked = new Set();
  // Weddings and shoots booked for the day: the whole day.
  for (const j of (await db.prepare(`SELECT event_date FROM jobs WHERE stage IN ('booked', 'completed') AND event_date BETWEEN ?1 AND ?2`).bind(from, to).all()).results) blocked.add(j.event_date);
  // The studio's appointments (all-day ones block the day).
  for (const a of (await db.prepare(`SELECT date, start_time, end_time FROM appointments WHERE date BETWEEN ?1 AND ?2`).bind(from, to).all()).results) {
    if (!a.start_time) { blocked.add(a.date); continue; }
    const s = nzMoment(a.date, a.start_time).valueOf();
    out.push({ start: s, end: a.end_time ? nzMoment(a.date, a.end_time).valueOf() : s + 3600_000 });
  }
  // Your own Google Calendar (needs the calendar.freebusy permission; skipped if it isn't there yet).
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST', headers: { authorization: `Bearer ${await googleToken(env)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ timeMin: nzMoment(from, '00:00').toISOString(), timeMax: nzMoment(addDays(to, 1), '00:00').toISOString(), timeZone: 'Pacific/Auckland', items: [{ id: 'primary' }] }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) for (const b of d.calendars?.primary?.busy ?? []) out.push({ start: Date.parse(b.start), end: Date.parse(b.end) });
    else console.error('booking: freebusy', r.status, d.error?.message);
  } catch (e) { console.error('booking: freebusy', e.message); }
  return { out, blocked };
}

/** Free start times for a booking type: { 'YYYY-MM-DD': ['HH:MM', …] } for the days ahead. */
export async function freeSlots(env, type, s, onlyDate = null) {
  const today = nzToday();
  const from = onlyDate ?? today, to = onlyDate ?? addDays(today, s.ahead_days);
  const { out, blocked } = await busy(env, from, to);
  const earliest = Date.now() + s.notice_hours * 3600_000;
  const gap = s.gap_min * 60_000, len = type.minutes * 60_000;
  const result = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const hours = s.hours[dayKey(d)];
    if (!hours || blocked.has(d)) continue;
    const [open, close] = hours.split('-').map(mins);
    const times = [];
    for (let m = open; m + type.minutes <= close; m += 30) {
      const st = nzMoment(d, hm(m)).valueOf();
      if (st < earliest) continue;
      if (out.some((b) => st < b.end + gap && st + len > b.start - gap)) continue;
      times.push(hm(m));
    }
    if (times.length) result[d] = times;
  }
  return result;
}

// ---- Making a booking ----
export async function makeBooking(context, type, s, f) {
  f = { ...f, first: tidyName(f.first), last: tidyName(f.last) };
  const { env } = context;
  const db = env.DB;
  const free = await freeSlots(env, type, s, f.date);
  if (!free[f.date]?.includes(f.time)) throw Object.assign(new Error('Sorry, that time has just gone. Please choose another.'), { status: 409 });
  const now = new Date().toISOString();
  // From their personal link (f.job_id): their own client page, with a new phone number kept if they gave one.
  const mine = f.job_id ? await db.prepare('SELECT id, client_id FROM jobs WHERE id = ?1').bind(f.job_id).first() : null;
  if (mine && f.phone) await db.prepare(`UPDATE clients SET phone = ?2, updated_at = ?3 WHERE id = ?1 AND COALESCE(phone, '') = ''`).bind(mine.client_id, f.phone, now).run();
  const client = mine ? { id: mine.client_id } : await db.prepare(`INSERT INTO clients (first_name, last_name, email, phone, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
      ON CONFLICT (lower(email)) DO UPDATE SET phone = CASE WHEN excluded.phone <> '' THEN excluded.phone ELSE clients.phone END, updated_at = excluded.updated_at RETURNING id`)
    .bind(f.first, f.last, f.email, f.phone, now).first();
  // Their open job if they have one (a lead or a booking), otherwise a new lead for this kind of booking.
  let job = mine ? { id: mine.id } : await db.prepare(`SELECT id FROM jobs WHERE client_id = ?1 AND stage IN ('lead', 'booked') ORDER BY id DESC LIMIT 1`).bind(client.id).first();
  if (!job) {
    const wf = await db.prepare(`SELECT workflow FROM lists WHERE kind = 'job_type' AND value = ?1`).bind(type.job_type).first().catch(() => null);
    job = await db.prepare(`INSERT INTO jobs (client_id, title, job_type, event_date, partner_name, lead_source, message, workflow, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'Online booking', ?6, ?7, ?8, ?8) RETURNING id`)
      .bind(client.id, `${f.first} ${f.last}`.trim(), type.job_type, f.event_date || null, f.partner, f.message, wf?.workflow ?? null, now).first();
  } else if (f.message) {
    await db.prepare(`UPDATE jobs SET message = trim(message || char(10) || char(10) || ?2), updated_at = ?3 WHERE id = ?1`).bind(job.id, `Booking note: ${f.message}`, now).run();
  }
  const end = hm(mins(f.time) + type.minutes);
  const held = type.price > 0;
  const appt = await db.prepare(`INSERT INTO appointments (job_id, title, date, start_time, end_time, location, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) RETURNING id`)
    .bind(job.id, type.name, f.date, f.time, end, type.where, `${held ? 'Waiting for payment (held 30 minutes). ' : ''}Booked online.${f.message ? ` Their note: ${f.message}` : ''}`, now).first();
  const b = await db.prepare(`INSERT INTO bookings (type_key, type_name, job_id, appointment_id, date, time, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id`)
    .bind(type.key, type.name, job.id, appt.id, f.date, f.time, held ? 'held' : 'confirmed', now).first();
  await db.prepare('UPDATE jobs SET gcal_synced_at = NULL WHERE id = ?1').bind(job.id).run();
  if (held) return { id: b.id, job_id: job.id, held: true };
  await confirmBooking(context, b.id);
  return { id: b.id, job_id: job.id, held: false };
}

/** Where, for the email: escaped, with any link (e.g. the Google Meet) clickable. */
const whereHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  .replace(/https:\/\/[^\s<)]+/g, (u) => `<a href="${u}" style="color:#5a5e3b;">${u}</a>`);

/** A booking is on: the confirmation email (through the usual safety switch) and Tony's alert. */
export async function confirmBooking(context, bookingId) {
  const { env } = context;
  const db = env.DB;
  const b = await db.prepare('SELECT * FROM bookings WHERE id = ?1').bind(bookingId).first();
  if (!b) return;
  await db.prepare(`UPDATE bookings SET status = 'confirmed' WHERE id = ?1`).bind(b.id).run();
  await db.prepare(`UPDATE appointments SET notes = replace(notes, 'Waiting for payment (held 30 minutes). ', 'Paid. '), updated_at = ?2 WHERE id = ?1`).bind(b.appointment_id, new Date().toISOString()).run();
  // Into Tony's Google Calendar now (not on the next timer run), with a Google Meet link for a video call.
  let calNote = '';
  try {
    await syncJob(env, b.job_id);
    const a = await db.prepare('SELECT location FROM appointments WHERE id = ?1').bind(b.appointment_id).first();
    if (/video/i.test(a?.location || '') && !(await addMeet(env, b.appointment_id))) calNote = 'No Google Meet link was made: send them one yourself.';
  } catch (e) { calNote = `Google Calendar didn’t update (${e.message}); the timer will try again. Send the video link yourself.`; }
  const job = await db.prepare(`SELECT j.*, c.first_name, c.last_name, c.email, c.phone FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = ?1`).bind(b.job_id).first();
  const appt = await db.prepare('SELECT * FROM appointments WHERE id = ?1').bind(b.appointment_id).first();
  const when = whenText(b.date, b.time);
  let sent = 'Confirmation emailed.';
  try {
    const t = await db.prepare(`SELECT * FROM templates WHERE key = 'booking-confirmed'`).first();
    if (!t) throw new Error('the “Booking confirmed” email template is missing');
    const e = renderTemplate(t, fields(job, { ...(await jobLinks(db, job)), booking_name: b.type_name, booking_when: when, booking_where: whereHtml(appt?.location || 'I’ll be in touch with the details') }));
    const s = await sendEmail(env, { to: job.email, subject: e.subject, html: e.html });
    await db.prepare(`INSERT INTO messages (job_id, client_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at) VALUES (?1, ?2, 'out', ?3, ?4, ?5, ?6, ?7)`)
      .bind(job.id, job.client_id, e.subject, e.body, s.id, s.threadId, new Date().toISOString()).run();
    if (s.redirected) sent += ` (Test mode: to ${s.to}.)`;
  } catch (e) { sent = `Confirmation not sent (${e.message}).`; }
  await alertTony(env, `New booking: ${b.type_name} with ${job.first_name} ${job.last_name}`, [
    ['When', when], ['Who', `${job.first_name} ${job.last_name}${job.partner_name ? ` and ${job.partner_name}` : ''}`], ['Email', job.email], ['Phone', job.phone],
    ['Wedding date', job.event_date ?? ''], ['Their note', job.message?.slice(-500) ?? ''], ['Where', appt?.location ?? ''], ['Email to them', sent], ...(calNote ? [['Calendar', calNote]] : []),
  ], `${SITE}/studio/crm/job?id=${job.id}`);
}

/** Paid sessions that weren't paid within 30 minutes: let the time go (timer). */
export async function lapseHolds(env) {
  const db = env.DB;
  const old = (await db.prepare(`SELECT * FROM bookings WHERE status = 'held' AND created_at < ?1`).bind(new Date(Date.now() - 35 * 60_000).toISOString()).all()).results;
  for (const b of old) {
    const inv = b.invoice_id && await db.prepare('SELECT status FROM invoices WHERE id = ?1').bind(b.invoice_id).first();
    if (inv?.status === 'paid') continue;
    const appt = await db.prepare('SELECT * FROM appointments WHERE id = ?1').bind(b.appointment_id).first();
    if (appt) await unsyncAppointment(env, appt).catch(() => {});
    await db.batch([
      db.prepare(`UPDATE bookings SET status = 'lapsed' WHERE id = ?1`).bind(b.id),
      db.prepare('DELETE FROM appointments WHERE id = ?1').bind(b.appointment_id),
      db.prepare(`UPDATE invoices SET status = 'void' WHERE id = ?1 AND status <> 'paid'`).bind(b.invoice_id ?? 0),
      db.prepare('UPDATE jobs SET gcal_synced_at = NULL WHERE id = ?1').bind(b.job_id),
    ]);
  }
  return old.length;
}
