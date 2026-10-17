// Send a quote to the client: the "Quote ready" email with their private link, reviewed by Tony.
//   GET  /api/studio/crm/quote-send?id=3   the email filled in, for review
//   POST /api/studio/crm/quote-send        { id, subject, body }  send it (test-mode lock applies)
import { json } from '../../../../functions-lib/studio.js';
import { renderTemplate, fields } from '../../../../functions-lib/email-render.js';
import { sendEmail, connection } from '../../../../functions-lib/gmail.js';
import { loadJob, templateAttachments } from '../../../../functions-lib/crm-send.js';
import { listDocuments, attachmentsFor } from '../../../../functions-lib/documents.js';
import { outgoing, sendMode } from '../../../../functions-lib/crm.js';
import { longDate, parseQuote, planHtml } from '../../../../functions-lib/quotes.js';

async function prepare(env, id) {
  const q = id && await env.DB.prepare('SELECT * FROM quotes WHERE id = ?1').bind(id).first();
  if (!q) throw new Error('That quote doesn’t exist.');
  if (!['draft', 'sent'].includes(q.status)) throw new Error(`This quote is ${q.status}.`);
  const job = await loadJob(env.DB, q.job_id);
  const template = await env.DB.prepare(`SELECT * FROM templates WHERE key = 'quote-ready'`).first();
  if (!template) throw new Error('The “Quote ready” email template is missing (Settings).');
  const values = fields(job, { quote_link: `https://www.momentsinlight.co.nz/quote?t=${q.token}`, quote_valid_until: longDate(q.valid_until), payment_plan: planHtml(parseQuote(q), job) });
  return { q, job, template, values };
}

export async function onRequestGet({ request, env }) {
  try {
    const { job, template, values } = await prepare(env, Number(new URL(request.url).searchParams.get('id')));
    const e = renderTemplate(template, values);
    return json({ attachments: templateAttachments(template), documents: (await listDocuments(env.DB)).map(({ id, name, size }) => ({ id, name, size })), subject: e.subject, body: e.body, missing: e.missing, to: job.email, deliversTo: outgoing(env, { to: job.email, subject: '', html: '' }).to, mode: sendMode(env), gmail: !!(await connection(env.DB)) });
  } catch (err) {
    return json({ error: err.message }, 400);
  }
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  try {
    const { q, job, template, values } = await prepare(env, Number(d?.id));
    const e = renderTemplate(template, values, { subject: d.subject, body: d.body });
    if (e.missing.length) throw new Error(`It needs: ${e.missing.join(', ')}.`);
    const last = await env.DB.prepare('SELECT gmail_thread_id FROM messages WHERE job_id = ?1 AND gmail_thread_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1').bind(job.id).first();
    const attachments = await attachmentsFor(env.DB, Array.isArray(d.attachments) ? d.attachments : templateAttachments(template));
    const sent = await sendEmail(env, { to: job.email, subject: e.subject, html: e.html, attachments, threadId: last?.gmail_thread_id });
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE quotes SET status = 'sent', sent_at = ?2, updated_at = ?2 WHERE id = ?1`).bind(q.id, now),
      env.DB.prepare(`INSERT INTO messages (job_id, client_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at, attachments) VALUES (?1, ?2, 'out', ?3, ?4, ?5, ?6, ?7, ?8)`)
        .bind(job.id, job.client_id, e.subject, e.body, sent.id, sent.threadId, now, attachments.map((a) => a.name).join('\n')),
    ]);
    return json({ ok: true, to: sent.to, redirected: sent.redirected, intended: sent.intended });
  } catch (err) {
    return json({ error: err.message }, 400);
  }
}
