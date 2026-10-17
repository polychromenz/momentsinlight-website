// Sending a workflow email for a job: render the template with the job's details (or Tony's
// edited version), attach any file, send from Gmail in the same thread as earlier emails, and
// record it. Used by the timer (functions/api/crm/run.js) for automatic emails and by "Review
// and send" in the studio (functions/api/studio/crm/send.js) for ready-to-send ones.
// Every send goes through sendEmail(), so the test-mode lock always applies.
import { sendEmail } from './gmail.js';
import { renderTemplate, fields } from './email-render.js';
import { attachmentsFor } from './documents.js';

/** A template's attached document ids. */
export const templateAttachments = (t) => JSON.parse(t?.attachments || '[]');

/** A job with its client's details, as the templates need them. */
export const loadJob = (db, jobId) => db.prepare(
  `SELECT j.*, c.first_name, c.last_name, c.email, c.phone, c.address FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = ?1`,
).bind(jobId).first();


/** Links for a job's emails. Until the client portal is built, {{portal_link}} is their
 *  accepted quote (it shows the booking details and payment plan). */
export async function jobLinks(db, job) {
  const q = await db.prepare(`SELECT token FROM quotes WHERE job_id = ?1 AND status = 'accepted' ORDER BY accepted_at DESC LIMIT 1`).bind(job.id).first();
  return q ? { portal_link: `https://www.momentsinlight.co.nz/quote?t=${q.token}` } : {};
}

/** The email a step would send, filled in (for review, or before sending). */
export async function draftFor(db, step, job) {
  const template = step.template_key && await db.prepare('SELECT * FROM templates WHERE key = ?1').bind(step.template_key).first();
  if (!template) throw new Error(`The template for “${step.title}” is missing.`);
  return { template, ...renderTemplate(template, fields(job, await jobLinks(db, job))) };
}

/**
 * Send a step's email. edits = { subject, body, attachments (document ids) } from Tony's review
 * (optional; without them, the template's own text and documents are used).
 * Throws with a plain-English message if it can't (missing details, Gmail problem).
 */
export async function sendStep(env, step, edits = {}) {
  const db = env.DB;
  const job = await loadJob(db, step.job_id);
  if (!job) throw new Error('That job no longer exists.');
  const { template } = await draftFor(db, step, job);
  const email = renderTemplate(template, fields(job, await jobLinks(db, job)), edits);
  if (email.missing.length) throw new Error(`It needs: ${email.missing.join(', ')}. Fill those in before sending.`);
  const attachments = await attachmentsFor(db, edits.attachments ?? templateAttachments(template));
  // Keep the conversation together: reply in the thread of the last email for this job.
  const last = await db.prepare('SELECT gmail_thread_id FROM messages WHERE job_id = ?1 AND gmail_thread_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1').bind(job.id).first();
  const sent = await sendEmail(env, { to: job.email, subject: email.subject, html: email.html, attachments, threadId: last?.gmail_thread_id });
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO messages (job_id, client_id, step_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at)
      VALUES (?1, ?2, ?3, 'out', ?4, ?5, ?6, ?7, ?8)`).bind(job.id, job.client_id, step.id, email.subject, email.body, sent.id, sent.threadId, now),
    db.prepare(`UPDATE steps SET status = 'done', done_at = ?2, note = ?3 WHERE id = ?1`)
      .bind(step.id, now, sent.redirected ? `Test mode: sent to ${sent.to} instead of ${sent.intended}` : `Sent to ${sent.to}`),
  ]);
  return sent;
}
