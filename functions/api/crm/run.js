// The CRM's timer: called every 15 minutes by the GitHub Action .github/workflows/crm-run.yml
// (POST /api/crm/run with the X-Run-Key header = the CRM_RUN_KEY secret). Outside /api/studio,
// so Cloudflare Access doesn't stop it; the key does instead.
//
// Each run:
//   1. Replies: for leads with follow-ups waiting, checks their Gmail conversation; if the client
//      has replied, records it and stops the steps marked "stop on reply".
//   2. Sends automatic emails that are due (each step claimed first, so it can never go twice),
//      unless a stop condition applies. Anything that can't send is marked "Didn't send" on
//      Today and Tony gets an alert.
//   3. Tidies steps stuck mid-send (e.g. a crash) into "Didn't send" after 30 minutes.
// Ready-to-send emails and to-dos need nothing here: they appear on Today when due.
import { sendStep } from '../../../functions-lib/crm-send.js';
import { thread, connection } from '../../../functions-lib/gmail.js';
import { alertTony } from '../../../functions-lib/crm.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const stops = (step, ev) => (',' + step.stop_on + ',').includes(`,${ev},`);

export async function onRequestPost({ request, env }) {
  if (!env.CRM_RUN_KEY || request.headers.get('x-run-key') !== env.CRM_RUN_KEY) return reply({ error: 'Not allowed.' }, 403);
  const db = env.DB;
  const now = new Date().toISOString();
  const log = { replies: 0, sent: 0, skipped: 0, failed: 0 };
  const gmail = await connection(db);

  // 1. Replies.
  if (gmail) {
    const waiting = await db.prepare(
      `SELECT DISTINCT j.id, j.client_id, c.email FROM jobs j JOIN clients c ON c.id = j.client_id JOIN steps s ON s.job_id = j.id
       WHERE j.replied_at IS NULL AND s.status = 'scheduled' AND (',' || s.stop_on || ',') LIKE '%,reply,%' LIMIT 40`,
    ).all();
    for (const job of waiting.results) {
      const threads = await db.prepare('SELECT DISTINCT gmail_thread_id t FROM messages WHERE job_id = ?1 AND gmail_thread_id IS NOT NULL').bind(job.id).all();
      for (const { t } of threads.results) {
        let msgs;
        try { msgs = await thread(env, t); } catch (e) { console.error('crm run: thread', e.message); continue; }
        const theirs = msgs.filter((m) => m.from && m.from !== (gmail.email || '').toLowerCase() && m.from !== 'tony@momentsinlight.co.nz');
        if (!theirs.length) continue;
        const first = theirs[0];
        await db.batch([
          db.prepare('UPDATE jobs SET replied_at = ?2, updated_at = ?3 WHERE id = ?1 AND replied_at IS NULL').bind(job.id, first.at, now),
          db.prepare(`UPDATE steps SET status = 'skipped', done_at = ?2, note = 'Stopped: they replied' WHERE job_id = ?1 AND status = 'scheduled' AND (',' || stop_on || ',') LIKE '%,reply,%'`).bind(job.id, now),
          ...theirs.map((m) => db.prepare(
            `INSERT INTO messages (job_id, client_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at)
             SELECT ?1, ?2, 'in', ?3, ?4, ?5, ?6, ?7 WHERE NOT EXISTS (SELECT 1 FROM messages WHERE gmail_message_id = ?5)`,
          ).bind(job.id, job.client_id, m.subject, m.snippet, m.id, t, m.at)),
        ]);
        log.replies++;
        break;
      }
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
  return reply({ ok: true, ...log });
}
