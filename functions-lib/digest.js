// Tony's morning email: what's on today in the studio. Sent once a day by the timer
// (functions/api/crm/run.js) on its first run between 7am and midday NZ time, through Resend like the alerts.
// Nothing to report (no to-dos, appointments, shoots, payments, problems or new enquiries) = no email.
import { emailTony } from './crm.js';
import { nzNine, MANUAL_DUE } from './workflows.js';

const SITE = 'https://www.momentsinlight.co.nz';
const HOUR = 3600_000;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nzDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const nzHour = () => Number(new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hour12: false }));
const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const longDay = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const time = (t) => (t ? new Date(`2000-01-01T${t}:00`).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }) : 'All day');
const money = (c) => `$${(c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const jobLink = (id, text) => `<a href="${SITE}/studio/crm/job?id=${id}" style="color:#2b2d1f">${esc(text)}</a>`;

/** What's on today: { count, subject, html } (count 0 = nothing worth an email). */
export async function buildDigest(db, today = nzDate()) {
  const endOfToday = new Date(nzNine(addDays(today, 1)).valueOf() - 9 * HOUR).toISOString();
  const since = new Date(Date.now() - 24 * HOUR).toISOString();
  const [tasks, failed, autos, appts, shoots, owing, sending, fresh, answers] = await Promise.all([
    db.prepare(`SELECT s.id, s.job_id, s.kind, s.title, s.due_at, j.title AS who FROM steps s JOIN jobs j ON j.id = s.job_id
      WHERE s.status IN ('scheduled', 'due') AND s.kind IN ('todo', 'ready_email') AND s.due_at < ?1 AND s.due_at < ?2 ORDER BY s.due_at`).bind(endOfToday, MANUAL_DUE).all(),
    db.prepare(`SELECT s.job_id, s.title, s.note, j.title AS who FROM steps s JOIN jobs j ON j.id = s.job_id WHERE s.status = 'failed' ORDER BY s.due_at`).all(),
    db.prepare(`SELECT s.job_id, s.title, j.title AS who FROM steps s JOIN jobs j ON j.id = s.job_id
      WHERE s.status = 'scheduled' AND s.kind = 'auto_email' AND s.due_at < ?1 ORDER BY s.due_at`).bind(endOfToday).all(),
    db.prepare(`SELECT a.job_id, a.title, a.start_time, a.end_time, a.location, j.title AS who FROM appointments a JOIN jobs j ON j.id = a.job_id
      WHERE a.date = ?1 AND j.stage <> 'lost' ORDER BY a.start_time`).bind(today).all(),
    db.prepare(`SELECT id, title, partner_name, job_type, event_date, event_time, venue FROM jobs WHERE stage = 'booked' AND event_date BETWEEN ?1 AND ?2 ORDER BY event_date`).bind(today, addDays(today, 3)).all(),
    db.prepare(`SELECT i.job_id, i.number, i.label, i.amount, i.due_date, j.title AS who FROM invoices i JOIN jobs j ON j.id = i.job_id
      WHERE i.status = 'sent' AND i.due_date <= ?1 ORDER BY i.due_date`).bind(today).all(),
    db.prepare(`SELECT i.job_id, i.number, i.label, i.amount, j.title AS who FROM invoices i JOIN jobs j ON j.id = i.job_id
      WHERE i.status = 'scheduled' AND i.send_at < ?1 ORDER BY i.send_at`).bind(endOfToday).all(),
    db.prepare(`SELECT id, title, job_type, event_date FROM jobs WHERE created_at >= ?1 ORDER BY created_at`).bind(since).all(),
    db.prepare(`SELECT q.job_id, q.name, j.title AS who FROM questionnaires q JOIN jobs j ON j.id = q.job_id WHERE q.submitted_at >= ?1`).bind(since).all(),
  ]);

  const sections = [];
  const add = (heading, items) => { if (items.length) sections.push({ heading, items }); };
  add('To do today', tasks.results.map((s) => `${jobLink(s.job_id, s.who)}: ${esc(s.title)}${s.kind === 'ready_email' ? ' <span style="color:#777">(email to review and send)</span>' : ''}${s.due_at < new Date(Date.parse(endOfToday) - 24 * HOUR).toISOString() ? ' <b style="color:#a8432a">overdue</b>' : ''}`));
  add('Didn’t send (needs you)', failed.results.map((s) => `${jobLink(s.job_id, s.who)}: ${esc(s.title)}${s.note ? ` <span style="color:#777">(${esc(s.note)})</span>` : ''}`));
  add('Appointments today', appts.results.map((a) => `<b>${time(a.start_time)}${a.end_time ? `–${time(a.end_time)}` : ''}</b> ${esc(a.title)}: ${jobLink(a.job_id, a.who)}${a.location ? ` · ${esc(a.location)}` : ''}`));
  add('Weddings and shoots coming up', shoots.results.map((j) => `<b>${j.event_date === today ? 'Today' : esc(longDay(j.event_date))}</b>${j.event_time ? ` ${time(j.event_time)}` : ''}: ${jobLink(j.id, j.partner_name ? `${j.title.split(' ')[0]} & ${j.partner_name}` : j.title)} (${esc(j.job_type)})${j.venue ? ` · ${esc(j.venue)}` : ''}`));
  add('Payments due or overdue', owing.results.map((i) => `${jobLink(i.job_id, i.who)}: ${esc(i.label)} ${money(i.amount)} <span style="color:${i.due_date < today ? '#a8432a' : '#777'}">${i.due_date < today ? `overdue since ${esc(longDay(i.due_date))}` : 'due today'}</span>`));
  add('New since yesterday', [
    ...fresh.results.map((j) => `New ${esc(j.job_type.toLowerCase())} enquiry: ${jobLink(j.id, j.title)}${j.event_date ? ` for ${esc(longDay(j.event_date))}` : ''}`),
    ...answers.results.map((q) => `${jobLink(q.job_id, q.who)} sent in their ${esc(q.name.toLowerCase())}`),
  ]);
  const count = sections.reduce((a, s) => a + s.items.length, 0);
  // Going out by themselves today: worth knowing, but not a reason to email on its own.
  add('Going out by itself today', [
    ...autos.results.map((s) => `${esc(s.title)} to ${jobLink(s.job_id, s.who)}`),
    ...sending.results.map((i) => `Invoice ${esc(i.number)} (${esc(i.label)}, ${money(i.amount)}) to ${jobLink(i.job_id, i.who)}`),
  ]);

  const n = (k) => sections.find((s) => s.heading === k)?.items.length || 0;
  const bits = [n('To do today') && `${n('To do today')} to do`, n('Appointments today') && `${n('Appointments today')} appointment${n('Appointments today') > 1 ? 's' : ''}`,
    n('Payments due or overdue') && `${n('Payments due or overdue')} payment${n('Payments due or overdue') > 1 ? 's' : ''} owing`, n('Didn’t send (needs you)') && `${n('Didn’t send (needs you)')} didn’t send`].filter(Boolean);
  const subject = `Today${bits.length ? `: ${bits.join(', ')}` : ` in the studio`}`;
  const html = `<div style="font-family:Raleway,Arial,sans-serif;color:#1a1a1a;max-width:600px">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#5a5e3b">Moments Studio · ${esc(longDay(today))}</p>
<h1 style="margin:0 0 18px;font-size:26px;font-weight:300">Good morning, Tony</h1>
${sections.map((s) => `<h2 style="margin:20px 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#5a5e3b">${esc(s.heading)}</h2>
<ul style="margin:0;padding-left:18px;font-size:15px;line-height:1.7">${s.items.map((i) => `<li>${i}</li>`).join('')}</ul>`).join('')}
<p style="margin:26px 0 0"><a href="${SITE}/studio" style="display:inline-block;padding:11px 20px;background:#5a5e3b;color:#fff;text-decoration:none;border-radius:12px 0;font-size:14px">Open the studio</a></p>
</div>`;
  return { count, subject, html };
}

/** Once a day, between 7am and midday NZ: send the morning email if there's anything in it.
 *  (A morning the timer missed is skipped, not sent late.) */
export async function maybeSendDigest(env) {
  const today = nzDate();
  const hour = nzHour();
  if (hour < 7 || hour >= 12) return hour < 7 ? 'too early' : 'not a morning';
  // Claim today first, so two timers running at once can't both send it.
  const claim = await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('digest', ?1, ?2)
    ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2 WHERE json_extract(settings.value, '$.last') IS NOT ?3`)
    .bind(JSON.stringify({ last: today }), new Date().toISOString(), today).run();
  if (!claim.meta.changes) return 'already sent';
  const d = await buildDigest(env.DB, today);
  if (d.count && !(await emailTony(env, d.subject, d.html))) {
    await env.DB.prepare(`UPDATE settings SET value = '{}' WHERE key = 'digest'`).run(); // try again next run
    return 'failed (tries again next run)';
  }
  return d.count ? `sent (${d.count} items)` : 'nothing today';
}

/** Send it now (the dashboard's "Email me today's summary"), even on a quiet day. */
export async function sendDigestNow(env) {
  const d = await buildDigest(env.DB);
  const html = d.count ? d.html : d.html.replace('<p style="margin:26px 0 0">', '<p style="margin:0 0 8px;font-size:15px;color:#555">Nothing needs you today. (This is what a quiet day looks like; on days like this the morning email isn’t sent.)</p><p style="margin:26px 0 0">');
  if (!(await emailTony(env, d.count ? d.subject : 'Today: nothing on', html))) throw new Error('The email didn’t send (Resend). Try again in a minute.');
  return d.count;
}
