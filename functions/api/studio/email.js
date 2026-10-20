// "Write email" in the studio's top bar (src/studio/compose.ts): a one-off email to anyone, in the
// email design with Tony's photo signature, from his Gmail.
//   GET  /api/studio/email?q=sam        -> { people: [{ name, email, kind: 'client'|'contact', id }] }   for the To box
//   GET  /api/studio/email              -> { documents, gmail }
//   POST /api/studio/email { to, subject, body, attachments? }   send it
// Tony writes and checks each one himself, so these go for real even while the studio's automatic
// client emails are in test mode (he asked for this, 20 Oct 2026). Kept on the client's or contact's
// page when the address is theirs.
import { json } from '../../../functions-lib/studio.js';
import { renderTemplate, studioLinks } from '../../../functions-lib/email-render.js';
import { sendEmail, connection } from '../../../functions-lib/gmail.js';
import { attachmentsFor, listDocuments } from '../../../functions-lib/documents.js';

const okEmail = (e) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);

/** Who it's from: Tony as usual, or a person from their own address with their own signature. */
const sender = (user) => (user?.access === 'person' && user.signature?.name
  ? { signature: user.signature, from: `${user.signature.name.replace(/[<>"]/g, '')} - Moments in Light <${user.email}>`, replyTo: user.email }
  : { signature: null, from: undefined, replyTo: undefined });

export async function onRequestGet({ request, env, data }) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase();
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const [clients, contacts] = await Promise.all([
      env.DB.prepare(`SELECT id, first_name || ' ' || last_name name, email FROM clients WHERE email <> '' AND (lower(first_name || ' ' || last_name) LIKE ?1 OR lower(email) LIKE ?1) ORDER BY updated_at DESC LIMIT 8`).bind(like).all(),
      env.DB.prepare(`SELECT id, CASE WHEN contact_name <> '' THEN contact_name || ' (' || business || ')' ELSE business END name, email FROM contacts WHERE email <> '' AND (lower(contact_name || ' ' || business) LIKE ?1 OR lower(email) LIKE ?1) LIMIT 6`).bind(like).all(),
    ]);
    return json({ people: [...clients.results.map((c) => ({ ...c, kind: 'client' })), ...contacts.results.map((c) => ({ ...c, kind: 'contact' }))] });
  }
  const [docs, gmail] = await Promise.all([listDocuments(env.DB), connection(env.DB)]);
  return json({ documents: docs.map(({ id, name, size }) => ({ id, name, size })), gmail: !!gmail, signature: sender(data?.user).signature, from: sender(data?.user).from ?? null });
}

export async function onRequestPost({ request, env, data }) {
  const me = sender(data?.user);
  const d = await request.json().catch(() => null);
  const to = String(d?.to ?? '').trim().toLowerCase();
  if (!okEmail(to)) return json({ error: 'Who is it to? Add an email address.' }, 400);
  const subject = String(d.subject ?? '').trim().slice(0, 300);
  const body = String(d.body ?? '').trim().slice(0, 50000);
  if (!subject || !body.replace(/<[^>]+>/g, '').trim()) return json({ error: 'The email needs a subject and some text.' }, 400);
  try {
    const email = renderTemplate({ subject, body }, await studioLinks(env.DB), {}, me.signature);
    const attachments = await attachmentsFor(env.DB, Array.isArray(d.attachments) ? d.attachments : []);
    const sent = await sendEmail({ ...env, CRM_SEND_MODE: 'live' }, { to, subject: email.subject, html: email.html, attachments, from: me.from, replyTo: me.replyTo });
    const now = new Date().toISOString();
    // On their page: a client's latest job, or a contact.
    const client = await env.DB.prepare(`SELECT c.id, (SELECT j.id FROM jobs j WHERE j.client_id = c.id ORDER BY j.id DESC LIMIT 1) job_id FROM clients c WHERE lower(c.email) = ?1`).bind(to).first();
    if (client?.job_id) {
      await env.DB.prepare(`INSERT INTO messages (job_id, client_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at, attachments) VALUES (?1, ?2, 'out', ?3, ?4, ?5, ?6, ?7, ?8)`)
        .bind(client.job_id, client.id, email.subject, email.body, sent.id, sent.threadId, now, attachments.map((a) => a.name).join('\n')).run();
    } else {
      const contact = await env.DB.prepare('SELECT id FROM contacts WHERE lower(email) = ?1').bind(to).first();
      if (contact) await env.DB.prepare(`INSERT INTO contact_messages (contact_id, direction, subject, body, attachments, gmail_message_id, gmail_thread_id, sent_at) VALUES (?1, 'out', ?2, ?3, ?4, ?5, ?6, ?7)`)
        .bind(contact.id, email.subject, email.body, attachments.map((a) => a.name).join('\n'), sent.id, sent.threadId, now).run();
    }
    return json({ ok: true, to: sent.to, kept: client?.job_id ? 'client' : null });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
