// Writing to a client from their page, and reading their emails in full.
//   GET  /api/studio/crm/email?job=12[&template=key][&reply=MESSAGE_ROW_ID]
//        a draft: blank, from a template (their details filled in), or a reply ("Re: …")
//   GET  /api/studio/crm/email?message=MESSAGE_ROW_ID     one email in full (from Gmail)
//   POST /api/studio/crm/email  { job_id, subject, body, attachments?, reply? }   send it
// Sent from Tony's Gmail in the same conversation as their earlier emails (as a proper reply,
// so it threads for them too), in the email design, with the test-mode lock as always.
import { json } from '../../../../functions-lib/studio.js';
import { loadJob, jobLinks, hasCheck } from '../../../../functions-lib/crm-send.js';
import { renderTemplate, fields } from '../../../../functions-lib/email-render.js';
import { sendEmail, message, connection } from '../../../../functions-lib/gmail.js';
import { attachmentsFor, listDocuments } from '../../../../functions-lib/documents.js';
import { outgoing, sendMode, liveForNew } from '../../../../functions-lib/crm.js';

const GAPS = /\[(first_name|last_name|partner_name|couple|event_date|venue|portal_link|gallery_link|contract_link|payment_amount|payment_due_date|questionnaire_link|shoot_date|shoot_time|location|booking_link)\]/;
const row = (env, id) => env.DB.prepare('SELECT * FROM messages WHERE id = ?1').bind(Number(id)).first();

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  try {
    // One email in full.
    if (p.has('message')) {
      const m = await row(env, p.get('message'));
      if (!m) return json({ error: 'That email isn’t here any more.' }, 404);
      if (!m.gmail_message_id) return json({ subject: m.subject, body: m.body, direction: m.direction, at: m.sent_at, attachments: m.attachments });
      const g = await message(env, m.gmail_message_id);
      return json({ subject: g.subject, from: g.from, to: g.to, at: g.at, html: g.html, text: g.text, files: g.files, direction: m.direction, studio: m.direction === 'out' && !!m.body, body: m.body });
    }
    const job = await loadJob(env.DB, Number(p.get('job')));
    if (!job) return json({ error: 'That job doesn’t exist.' }, 404);
    const values = fields(job, await jobLinks(env.DB, job));
    let subject = ''; let body = '<p>Hi {{first_name}},</p><p></p>'; let attachments = [];
    if (p.get('template')) {
      const t = await env.DB.prepare('SELECT * FROM templates WHERE key = ?1').bind(p.get('template')).first();
      if (!t) return json({ error: 'That template isn’t there any more.' }, 404);
      subject = t.subject; body = t.body; attachments = JSON.parse(t.attachments || '[]');
    }
    if (p.get('reply')) {
      const m = await row(env, p.get('reply'));
      if (m) subject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
    }
    const draft = renderTemplate({ subject, body }, values);
    const [templates, docs, gmail] = await Promise.all([
      env.DB.prepare('SELECT key, name FROM templates ORDER BY name').all(),
      listDocuments(env.DB),
      connection(env.DB),
    ]);
    return json({
      subject: draft.subject, body: draft.body, missing: draft.missing, attachments,
      templates: templates.results, documents: docs.map(({ id, name, size }) => ({ id, name, size })),
      to: job.email, deliversTo: outgoing(env, { to: job.email, subject: '', html: '' }, await liveForNew(env, job.email)).to, mode: sendMode(env), gmail: !!gmail,
    });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const job = d?.job_id && await loadJob(env.DB, Number(d.job_id));
  if (!job) return json({ error: 'That job doesn’t exist.' }, 404);
  const subject = (d.subject ?? '').toString().trim().slice(0, 300);
  const body = (d.body ?? '').toString().trim().slice(0, 50000);
  if (!subject || !body.replace(/<[^>]+>/g, '').trim()) return json({ error: 'The email needs a subject and some text.' }, 400);
  if (GAPS.test(subject + body) || hasCheck(subject + body)) return json({ error: 'There’s still a gap to fill in (something in [square brackets]).' }, 400);
  try {
    const email = renderTemplate({ subject, body }, fields(job, await jobLinks(env.DB, job)));
    if (email.missing.length) return json({ error: `It needs: ${email.missing.join(', ')}.` }, 400);
    const attachments = await attachmentsFor(env.DB, Array.isArray(d.attachments) ? d.attachments : []);
    // Which conversation: the email being replied to, or the last one with them.
    let threadId = null; let inReplyTo = null; let references = null;
    const replyTo = d.reply && await row(env, d.reply);
    if (replyTo?.gmail_message_id) {
      const g = await message(env, replyTo.gmail_message_id);
      threadId = g.threadId; inReplyTo = g.messageId || null; references = [g.references, g.messageId].filter(Boolean).join(' ') || null;
    } else {
      threadId = (await env.DB.prepare('SELECT gmail_thread_id FROM messages WHERE job_id = ?1 AND gmail_thread_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1').bind(job.id).first())?.gmail_thread_id ?? null;
    }
    const sent = await sendEmail(env, { to: job.email, subject: email.subject, html: email.html, attachments, threadId, inReplyTo, references });
    await env.DB.prepare(`INSERT INTO messages (job_id, client_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at, attachments) VALUES (?1, ?2, 'out', ?3, ?4, ?5, ?6, ?7, ?8)`)
      .bind(job.id, job.client_id, email.subject, email.body, sent.id, sent.threadId, new Date().toISOString(), attachments.map((a) => a.name).join('\n')).run();
    return json({ ok: true, to: sent.to, redirected: sent.redirected, intended: sent.intended });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
