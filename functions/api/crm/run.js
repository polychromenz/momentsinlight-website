// The CRM's timer: called every 5 minutes by the Cloudflare Worker in workers/crm-timer (its key:
// the CRM_CRON_KEY secret), and as a backup by the GitHub Action .github/workflows/crm-run.yml
// (CRM_RUN_KEY; GitHub runs it late or not at all at times). POST /api/crm/run with X-Run-Key.
// Outside /api/studio, so Cloudflare Access doesn't stop it; the key does instead. Two runs at
// once are fine: every email, invoice and reminder is claimed before it's sent.
//
// Each run:
//   1. Emails: checks open leads' and booked jobs' Gmail conversations (a dozen per run, those
//      with follow-ups waiting first, then the longest unchecked) and adds new emails to their
//      Emails list: their replies, and anything Tony sent them from Gmail himself. A reply stops
//      the steps marked "stop on reply".
//   2. Sends automatic emails that are due (each step claimed first, so it can never go twice),
//      unless a stop condition applies. Anything that can't send is marked "Didn't send" on
//      Today and Tony gets an alert.
//   3. Tidies steps stuck mid-send (e.g. a crash) into "Didn't send" after 30 minutes.
//   4. Sends invoices on their send dates; 5. reminders on the due date and 3 days late.
//   6. Google Calendar: copies over any job that changed and didn't sync straight away.
//   7. Tony's morning email (once a day from 7am NZ, only if there's something in it).
//   8. Scheduled blog posts (from 6am NZ) and the Friday stats email (8am NZ): functions-lib/schedules.js;
//      the monthly speed email (from 8am on the 1st, a few pages a run): functions-lib/speed.js.
//   9. Contacts (venues, suppliers): new emails in their conversations, and checking whether their
//      pages link to the site (functions-lib/contacts.js).
//  10. SEO (functions-lib/seo.js): Monday, the tracked searches' Google positions and a task for
//      each wedding not yet blogged, and the competitors' new pages; from the 2nd of the month,
//      the site health check. Rankings (functions-lib/rankings.js): Monday's Google check, and
//      collecting results as they finish.
// Ready-to-send emails and to-dos need nothing here: they appear on Today when due.
import { sendStep } from '../../../functions-lib/crm-send.js';
import { thread, connection } from '../../../functions-lib/gmail.js';
import { alertTony } from '../../../functions-lib/crm.js';
import { sendInvoice } from '../../../functions-lib/invoices.js';
import { calendarReady, syncJob, noteSync } from '../../../functions-lib/calendar.js';
import { maybeSendDigest } from '../../../functions-lib/digest.js';
import { publishScheduledPosts, weeklyStatsEmail } from '../../../functions-lib/schedules.js';
import { monthlySpeed } from '../../../functions-lib/speed.js';
import { contactsTimer } from '../../../functions-lib/contacts.js';
import { weeklyPositions, contentTasks, siteHealth, competitorWatch } from '../../../functions-lib/seo.js';
import { rankingsTimer } from '../../../functions-lib/rankings.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const stops = (step, ev) => (',' + step.stop_on + ',').includes(`,${ev},`);

export async function onRequestPost({ request, env }) {
  const key = request.headers.get('x-run-key') || '';
  if (!key || ![env.CRM_RUN_KEY, env.CRM_CRON_KEY].filter(Boolean).includes(key)) return reply({ error: 'Not allowed.' }, 403);
  const db = env.DB;
  const now = new Date().toISOString();
  const log = { replies: 0, sent: 0, skipped: 0, failed: 0 };
  const gmail = await connection(db);

  // 1. Emails in their conversations.
  if (gmail) {
    const me = [(gmail.email || '').toLowerCase(), 'tony@momentsinlight.co.nz'];
    const jobs = await db.prepare(
      `SELECT j.id, j.client_id, j.replied_at,
         (SELECT gmail_thread_id FROM messages m WHERE m.job_id = j.id AND m.gmail_thread_id IS NOT NULL ORDER BY m.sent_at DESC LIMIT 1) AS t,
         EXISTS (SELECT 1 FROM steps s WHERE s.job_id = j.id AND s.status = 'scheduled' AND (',' || s.stop_on || ',') LIKE '%,reply,%') AS waiting
       FROM jobs j WHERE j.stage IN ('lead', 'booked') AND t IS NOT NULL
       ORDER BY waiting DESC, j.mail_checked_at IS NOT NULL, j.mail_checked_at LIMIT 10`,
    ).all();
    for (const job of jobs.results) {
      let msgs;
      try { msgs = await thread(env, job.t); } catch (e) { console.error('crm run: thread', e.message); continue; }
      const known = new Set((await db.prepare('SELECT gmail_message_id FROM messages WHERE job_id = ?1 AND gmail_message_id IS NOT NULL').bind(job.id).all()).results.map((r) => r.gmail_message_id));
      const fresh = msgs.filter((m) => !known.has(m.id));
      const theirs = fresh.filter((m) => m.from && !me.includes(m.from));
      const stmts = [
        db.prepare('UPDATE jobs SET mail_checked_at = ?2 WHERE id = ?1').bind(job.id, now),
        ...fresh.map((m) => db.prepare(
          `INSERT INTO messages (job_id, client_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE NOT EXISTS (SELECT 1 FROM messages WHERE gmail_message_id = ?6)`,
        ).bind(job.id, job.client_id, me.includes(m.from) ? 'out' : 'in', m.subject, m.snippet, m.id, job.t, m.at)),
      ];
      if (theirs.length) {
        stmts.push(
          db.prepare('UPDATE jobs SET replied_at = ?2, updated_at = ?3 WHERE id = ?1 AND replied_at IS NULL').bind(job.id, theirs[0].at, now),
          db.prepare(`UPDATE steps SET status = 'skipped', done_at = ?2, note = 'Stopped: they replied' WHERE job_id = ?1 AND status = 'scheduled' AND (',' || stop_on || ',') LIKE '%,reply,%'`).bind(job.id, now),
        );
        log.replies++;
      }
      await db.batch(stmts);
    }
  }

  // 3. Steps stuck mid-send.
  await db.prepare(`UPDATE steps SET status = 'failed', note = 'Stopped part-way through sending; check Sent before retrying' WHERE status = 'sending' AND done_at < ?1`)
    .bind(new Date(Date.now() - 30 * 60_000).toISOString()).run();

  // 2. Automatic emails that are due.
  const due = await db.prepare(
    `SELECT s.*, j.stage, j.replied_at, j.title AS job_title FROM steps s JOIN jobs j ON j.id = s.job_id
     WHERE s.status = 'scheduled' AND s.kind = 'auto_email' AND s.due_at <= ?1 ORDER BY s.due_at LIMIT 20`,
  ).bind(now).all();
  for (const step of due.results) {
    // Stop conditions.
    const why = (['booked', 'completed', 'lost'].includes(step.stage) && stops(step, 'booked')) ? 'Stopped: booked'
      : (step.replied_at && stops(step, 'reply')) ? 'Stopped: they replied' : null;
    if (why) {
      await db.prepare(`UPDATE steps SET status = 'skipped', done_at = ?2, note = ?3 WHERE id = ?1 AND status = 'scheduled'`).bind(step.id, now, why).run();
      log.skipped++;
      continue;
    }
    // Claim it (done_at marks when sending started, for the stuck-step tidy-up).
    const claim = await db.prepare(`UPDATE steps SET status = 'sending', done_at = ?2 WHERE id = ?1 AND status = 'scheduled'`).bind(step.id, now).run();
    if (!claim.meta.changes) continue;
    try {
      await sendStep(env, step);
      log.sent++;
    } catch (e) {
      log.failed++;
      await db.prepare(`UPDATE steps SET status = 'failed', note = ?2 WHERE id = ?1`).bind(step.id, String(e.message).slice(0, 300)).run();
      await alertTony(env, `An email didn’t send: ${step.title} for ${step.job_title}`, [['Why', e.message], ['What now', 'It’s on your Today list. Fix the problem, then send it from the client’s page.']],
        `https://www.momentsinlight.co.nz/studio/crm/job?id=${step.job_id}`);
    }
  }
  // 4. Invoices due to be sent (the deposit goes when the contract is signed; later ones 2 weeks
  //    before they're due). Claimed first so none goes twice; a failure retries in an hour.
  log.invoices = 0; log.reminders = 0;
  const toSend = await db.prepare(`SELECT * FROM invoices WHERE status = 'scheduled' AND send_at <= ?1 ORDER BY send_at LIMIT 20`).bind(now).all();
  for (const inv of toSend.results) {
    const claim = await db.prepare(`UPDATE invoices SET status = 'sent' WHERE id = ?1 AND status = 'scheduled'`).bind(inv.id).run();
    if (!claim.meta.changes) continue;
    try {
      await sendInvoice(env, inv, 'invoice');
      log.invoices++;
    } catch (e) {
      await db.prepare(`UPDATE invoices SET status = 'scheduled', send_at = ?2 WHERE id = ?1`).bind(inv.id, new Date(Date.now() + 3600_000).toISOString()).run();
      await alertTony(env, `An invoice didn’t send: ${inv.number}`, [['Why', e.message], ['What now', 'It will try again in an hour. You can also send it from the client’s page.']],
        `https://www.momentsinlight.co.nz/studio/crm/job?id=${inv.job_id}`);
    }
  }
  // 5. Reminders for unpaid invoices: on the due date (if it was sent before then), and 3 days late.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
  const threeAgo = new Date(Date.now() - 3 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
  const unpaid = await db.prepare(`SELECT * FROM invoices WHERE status = 'sent' AND reminders < 2 AND due_date <= ?1 LIMIT 40`).bind(today).all();
  for (const inv of unpaid.results) {
    const sentDay = inv.sent_at ? new Date(inv.sent_at).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }) : today;
    const onDue = inv.reminders === 0 && inv.due_date === today && sentDay < today;
    const late = inv.due_date <= threeAgo && inv.reminders < 2 && !(inv.reminders === 1 && inv.last_reminder_at && inv.last_reminder_at.slice(0, 10) >= threeAgo);
    if (!onDue && !late) continue;
    // Late reminder after an on-due one: mark both done so it's one email, not two.
    const claim = await db.prepare(`UPDATE invoices SET reminders = ?3, last_reminder_at = ?2 WHERE id = ?1 AND reminders = ?4`)
      .bind(inv.id, new Date().toISOString(), late ? 1 : 0, inv.reminders).run();
    if (!claim.meta.changes) continue;
    try {
      await sendInvoice(env, { ...inv, reminders: late ? 1 : 0 }, 'invoice-reminder'); // adds 1 more (→ 2 if late, 1 if on the due date)
      log.reminders++;
    } catch (e) {
      console.error('crm run: reminder', inv.number, e.message);
    }
  }

  // 6. Google Calendar catch-up (a few at a time).
  log.calendar = 0;
  if (await calendarReady(db)) {
    const stale = await db.prepare('SELECT id FROM jobs WHERE gcal_synced_at IS NULL OR gcal_synced_at < updated_at ORDER BY updated_at DESC LIMIT 15').all();
    for (const { id } of stale.results) {
      try { await syncJob(env, id); log.calendar++; await noteSync(db); } catch (e) { console.error('crm run: calendar', id, e.message); log.calendar_error = e.message; await noteSync(db, e.message); break; }
    }
  }

  // 7. The morning email.
  log.digest = await maybeSendDigest(env).catch((e) => `error: ${e.message}`);
  // 8. Daily and weekly jobs.
  log.publish = await publishScheduledPosts(env).catch((e) => `error: ${e.message}`);
  log.weekly_stats = await weeklyStatsEmail(env).catch((e) => `error: ${e.message}`);
  log.speed = await monthlySpeed(env).catch((e) => `error: ${e.message}`);
  // 9. Contacts.
  log.contacts = await contactsTimer(env, gmail).catch((e) => `error: ${e.message}`);
  // 10. SEO.
  log.positions = await weeklyPositions(env).catch((e) => `error: ${e.message}`);
  log.content = await contentTasks(env).catch((e) => `error: ${e.message}`);
  log.health = await siteHealth(env).catch((e) => `error: ${e.message}`);
  log.competitors = await competitorWatch(env).catch((e) => `error: ${e.message}`);
  log.rankings = await rankingsTimer(env).catch((e) => `error: ${e.message}`);

  return reply({ ok: true, ...log });
}
