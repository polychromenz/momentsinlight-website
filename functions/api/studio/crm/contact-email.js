// Emailing a contact (venue or supplier) from the studio, in the email design, from Tony's Gmail.
//   GET  /api/studio/crm/contact-email?contact=3[&template=key][&reply=ROW_ID]   a draft
//   GET  /api/studio/crm/contact-email?message=ROW_ID                           one email in full
//   POST /api/studio/crm/contact-email  { contact_id, subject, body, attachments?, reply? }
//   POST /api/studio/crm/contact-email  { action: 'link-gmail', contact_id }   the latest email Tony
//        sent them from Gmail itself (last 60 days), with its conversation, added to the contact (so
//        their replies are tracked from then on)
// Contacts aren't clients, so the CRM's test mode doesn't redirect these: they go to the contact.
import { json } from '../../../../functions-lib/studio.js';
import { hasCheck } from '../../../../functions-lib/crm-send.js';
import { renderTemplate } from '../../../../functions-lib/email-render.js';
import { sendEmail, message, connection, search, thread } from '../../../../functions-lib/gmail.js';
import { attachmentsFor, listDocuments } from '../../../../functions-lib/documents.js';
import { contactValues, afterEmail } from '../../../../functions-lib/contacts.js';

const row = (env, id) => env.DB.prepare('SELECT * FROM contact_messages WHERE id = ?1').bind(Number(id)).first();
const contact = (env, id) => env.DB.prepare('SELECT * FROM contacts WHERE id = ?1').bind(Number(id)).first();

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  try {
    if (p.has('message')) {
      const m = await row(env, p.get('message'));
      if (!m) return json({ error: 'That email isn’t here any more.' }, 404);
      if (!m.gmail_message_id) return json({ subject: m.subject, body: m.body, direction: m.direction });
      const g = await message(env, m.gmail_message_id);
      return json({ subject: g.subject, from: g.from, at: g.at, html: g.html, text: g.text, files: g.files, direction: m.direction });
    }
    const c = await contact(env, p.get('contact'));
    if (!c) return json({ error: 'That contact doesn’t exist.' }, 404);
    let subject = ''; let body = '<p>Hi {{contact_name}},</p><p></p>'; let attachments = [];
    if (p.get('template')) {
      const t = await env.DB.prepare('SELECT * FROM templates WHERE key = ?1').bind(p.get('template')).first();
      if (!t) return json({ error: 'That template isn’t there any more.' }, 404);
      subject = t.subject; body = t.body; attachments = JSON.parse(t.attachments || '[]');
    }
    if (p.get('reply')) { const m = await row(env, p.get('reply')); if (m) subject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`; }
    const draft = renderTemplate({ subject, body }, await contactValues(env.DB, c));
    const [templates, docs, gmail] = await Promise.all([env.DB.prepare('SELECT key, name FROM templates ORDER BY name').all(), listDocuments(env.DB), connection(env.DB)]);
    return json({ subject: draft.subject, body: draft.body, missing: draft.missing, attachments, to: c.email, gmail: !!gmail,
      templates: templates.results, documents: docs.map(({ id, name, size }) => ({ id, name, size })) });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

async function linkGmail(env, c) {
  try {
    const [latest] = await search(env, `in:sent to:${c.email} newer_than:60d`, 1);
    if (!latest) return json({ error: `No email to ${c.email} in your Gmail’s Sent mail in the last 60 days.` }, 404);
    const gmail = await connection(env.DB);
    const me = [(gmail?.email || '').toLowerCase(), 'tony@momentsinlight.co.nz'];
    const msgs = await thread(env, latest.threadId);
    await env.DB.batch(msgs.map((m) => env.DB.prepare(`INSERT INTO contact_messages (contact_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE NOT EXISTS (SELECT 1 FROM contact_messages WHERE gmail_message_id = ?5)`)
      .bind(c.id, me.includes(m.from) ? 'out' : 'in', m.subject, m.snippet, m.id, latest.threadId, m.at)));
    await afterEmail(env.DB, c);
    const last = msgs[msgs.length - 1];
    return json({ ok: true, subject: last?.subject ?? '', count: msgs.length });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const c = d?.contact_id && await contact(env, d.contact_id);
  if (!c) return json({ error: 'That contact doesn’t exist.' }, 404);
  if (!c.email) return json({ error: 'Add their email address first.' }, 400);
  if (d.action === 'link-gmail') return linkGmail(env, c);
  const subject = (d.subject ?? '').toString().trim().slice(0, 300);
  const body = (d.body ?? '').toString().trim().slice(0, 50000);
  if (!subject || !body.replace(/<[^>]+>/g, '').trim()) return json({ error: 'The email needs a subject and some text.' }, 400);
  if (hasCheck(subject + body) || /\[(contact_name|business|our_page|first_name|booking_link)\]/.test(subject + body)) return json({ error: 'There’s still a gap to fill in (something in [square brackets]).' }, 400);
  try {
    const email = renderTemplate({ subject, body }, await contactValues(env.DB, c));
    if (email.missing.length) return json({ error: `It needs: ${email.missing.join(', ')}. Add it to the contact, or change the email.` }, 400);
    const attachments = await attachmentsFor(env.DB, Array.isArray(d.attachments) ? d.attachments : []);
    let threadId = null; let inReplyTo = null; let references = null;
    const replyTo = d.reply && await row(env, d.reply);
    if (replyTo?.gmail_message_id) {
      const g = await message(env, replyTo.gmail_message_id);
      threadId = g.threadId; inReplyTo = g.messageId || null; references = [g.references, g.messageId].filter(Boolean).join(' ') || null;
    }
    // The test-mode lock is for client emails. A venue or supplier isn't a client, so this goes to
    // them; but if this address belongs to a client too, the lock still applies.
    const isClient = await env.DB.prepare('SELECT 1 FROM clients WHERE lower(email) = ?1').bind(c.email.toLowerCase()).first();
    const sent = await sendEmail(isClient ? env : { ...env, CRM_SEND_MODE: 'live' }, { to: c.email, subject: email.subject, html: email.html, attachments, threadId, inReplyTo, references });
    await env.DB.prepare(`INSERT INTO contact_messages (contact_id, direction, subject, body, attachments, gmail_message_id, gmail_thread_id, sent_at) VALUES (?1, 'out', ?2, ?3, ?4, ?5, ?6, ?7)`)
      .bind(c.id, email.subject, email.body, attachments.map((a) => a.name).join('\n'), sent.id, sent.threadId, new Date().toISOString()).run();
    await afterEmail(env.DB, c);
    return json({ ok: true, to: sent.to });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
