// Sending a workflow email for a job: render the template with the job's details (or Tony's
// edited version), attach any file, send from Gmail in the same thread as earlier emails, and
// record it. Used by the timer (functions/api/crm/run.js) for automatic emails and by "Review
// and send" in the studio (functions/api/studio/crm/send.js) for ready-to-send ones.
// Every send goes through sendEmail(), so the test-mode lock always applies.
import { sendEmail } from './gmail.js';
import { jobGalleries, GALLERY_ORIGIN } from './gallery-access.js';
import { renderTemplate, fields, studioLinks } from './email-render.js';
import { attachmentsFor } from './documents.js';
import { portalToken, portalLink } from './portal.js';
import { ruleOf, planAfter } from './workflows.js';
import { makeQuestionnaire, questionnaireLink } from './questionnaires.js';

/** A template's attached document ids. */
export const templateAttachments = (t) => JSON.parse(t?.attachments || '[]');

/** A job with its client's details, as the templates need them. */
export const loadJob = (db, jobId) => db.prepare(
  `SELECT j.*, c.first_name, c.last_name, c.email, c.phone, c.address FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = ?1`,
).bind(jobId).first();


/** Links for a job's emails: {{portal_link}} is their client portal. For a step that sends a
 *  questionnaire, {{questionnaire_link}} (made now if they don't have that one yet). */
export async function jobLinks(db, job, step = null, env = null) {
  const out = { ...(await studioLinks(db)), portal_link: portalLink(await portalToken(db, job.id)) };
  const want = ruleOf(step).questionnaire;
  const any = await db.prepare(`SELECT * FROM questionnaires WHERE job_id = ?1 ${want ? 'AND template_key = ?2' : ''} ORDER BY id DESC LIMIT 1`).bind(...(want ? [job.id, want] : [job.id])).first();
  if (any) out.questionnaire_link = questionnaireLink(any);
  else if (want && env) out.questionnaire_link = questionnaireLink(await makeQuestionnaire(env, job.id, want));
  return out;
}

/** Text that still has a gap for Tony to fill (e.g. "[check: your pricing]") mustn't be sent. */
export const hasCheck = (text) => /\[check:/i.test(String(text ?? ''));
/** A gallery's name in the portal, from its step ("06 Practice photos ready" → "Practice photos"). */
const galleryName = (title) => title.replace(/^[\d.]+\s*/, '').replace(/\s+(are\s+)?ready$/i, '') || 'Your gallery';

/** The email a step would send, filled in (for review, or before sending). */
export async function draftFor(db, step, job, env = null, extra = {}) {
  const template = step.template_key && await db.prepare('SELECT * FROM templates WHERE key = ?1').bind(step.template_key).first();
  if (!template) throw new Error(`The template for “${step.title}” is missing.`);
  return { template, ...renderTemplate(template, fields(job, { ...(await jobLinks(db, job, step, env)), ...extra })) };
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
  const rule = ruleOf(step);
  const gallery = (edits.gallery_link ?? '').toString().trim();
  if (rule.gallery && !/^https?:\/\/\S+$/i.test(gallery)) throw new Error('Choose their gallery (or paste a link) first.');
  // A studio gallery (galleries.momentsinlight.co.nz) must be online, or the link won't open for them.
  const studioGallery = gallery.startsWith(GALLERY_ORIGIN);
  if (studioGallery) {
    const g = (await jobGalleries(db, job.id)).find((x) => x.url === gallery);
    if (g && !g.online) throw new Error(`“${g.name}” isn’t online yet. Put it online (Galleries), then send.`);
  }
  const { template } = await draftFor(db, step, job, env);
  const email = renderTemplate(template, fields(job, { ...(await jobLinks(db, job, step, env)), ...(gallery ? { gallery_link: gallery } : {}) }), edits);
  if (email.missing.length) throw new Error(`It needs: ${email.missing.join(', ')}. Fill those in before sending.`);
  if (hasCheck(email.subject) || hasCheck(email.body)) throw new Error('It still has a [check: …] note to fill in. Edit the template in Settings, or the email before sending.');
  const attachments = await attachmentsFor(db, edits.attachments ?? templateAttachments(template));
  // Keep the conversation together: reply in the thread of the last email for this job.
  const last = await db.prepare('SELECT gmail_thread_id FROM messages WHERE job_id = ?1 AND gmail_thread_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1').bind(job.id).first();
  const sent = await sendEmail(env, { to: job.email, subject: email.subject, html: email.html, attachments, threadId: last?.gmail_thread_id });
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO messages (job_id, client_id, step_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at, attachments)
      VALUES (?1, ?2, ?3, 'out', ?4, ?5, ?6, ?7, ?8, ?9)`).bind(job.id, job.client_id, step.id, email.subject, email.body, sent.id, sent.threadId, now, attachments.map((a) => a.name).join('\n')),
    db.prepare(`UPDATE steps SET status = 'done', done_at = ?2, note = ?3 WHERE id = ?1`)
      .bind(step.id, now, sent.redirected ? `Test mode: sent to ${sent.to} instead of ${sent.intended}` : `Sent to ${sent.to}`),
    ...(gallery && !studioGallery ? [db.prepare('INSERT INTO galleries (job_id, title, url, created_at) VALUES (?1, ?2, ?3, ?4)').bind(job.id, galleryName(step.title), gallery, now)] : []),
  ]);
  await planAfter(db, job.id, step.step_key).catch((e) => console.error('planAfter', e.message));
  return sent;
}
