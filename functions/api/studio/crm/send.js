// Review and send a workflow email from the studio.
//   GET  /api/studio/crm/send?step=12      the email filled in, for Tony to read and edit
//   POST /api/studio/crm/send              { step, subject, body } send his version
// Works for ready-to-send emails, and for automatic ones that didn't send (or that he wants to
// send early). The test-mode lock applies as always.
import { json } from '../../../../functions-lib/studio.js';
import { sendStep, draftFor, loadJob, templateAttachments } from '../../../../functions-lib/crm-send.js';
import { listDocuments } from '../../../../functions-lib/documents.js';
import { outgoing, sendMode } from '../../../../functions-lib/crm.js';
import { connection } from '../../../../functions-lib/gmail.js';

const OPEN = ['scheduled', 'due', 'failed'];

export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('step'));
  const step = id && await env.DB.prepare('SELECT * FROM steps WHERE id = ?1').bind(id).first();
  if (!step) return json({ error: 'That step doesn’t exist.' }, 404);
  if (!step.template_key) return json({ error: 'That step isn’t an email.' }, 400);
  const job = await loadJob(env.DB, step.job_id);
  try {
    const d = await draftFor(env.DB, step, job);
    const lock = outgoing(env, { to: job.email, subject: '', html: '' });
    return json({
      step: { id: step.id, title: step.title, status: step.status },
      // The template text with {{fields}} filled in where known; gaps show as [field].
      subject: d.subject, body: d.body, missing: d.missing,
      attachments: templateAttachments(d.template),
      documents: (await listDocuments(env.DB)).map(({ id, name, size }) => ({ id, name, size })),
      to: job.email, deliversTo: lock.to, mode: sendMode(env),
      gmail: !!(await connection(env.DB)),
    });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const id = Number(d?.step);
  const subject = (d?.subject ?? '').toString().trim();
  const body = (d?.body ?? '').toString().trim();
  if (!id || !subject || !body) return json({ error: 'The email needs a subject and some text.' }, 400);
  if (/\[(first_name|last_name|partner_name|couple|event_date|venue|portal_link|gallery_link|contract_link|payment_amount|payment_due_date)\]/.test(subject + body)) {
    return json({ error: 'There’s still a gap to fill in (something in [square brackets]).' }, 400);
  }
  const step = await env.DB.prepare('SELECT * FROM steps WHERE id = ?1').bind(id).first();
  if (!step || !OPEN.includes(step.status)) return json({ error: 'That email has already been sent or stopped. Reload to see it.' }, 409);
  const now = new Date().toISOString();
  const claim = await env.DB.prepare(`UPDATE steps SET status = 'sending', done_at = ?2 WHERE id = ?1 AND status IN ('scheduled', 'due', 'failed')`).bind(id, now).run();
  if (!claim.meta.changes) return json({ error: 'That email is already being sent.' }, 409);
  try {
    const sent = await sendStep(env, step, { subject, body, attachments: Array.isArray(d.attachments) ? d.attachments : undefined });
    return json({ ok: true, to: sent.to, redirected: sent.redirected, intended: sent.intended });
  } catch (e) {
    await env.DB.prepare(`UPDATE steps SET status = ?2, done_at = NULL, note = ?3 WHERE id = ?1`).bind(id, step.status, String(e.message).slice(0, 300)).run();
    return json({ error: e.message }, 400);
  }
}
