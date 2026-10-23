// Contacts (venues and suppliers) in the studio.
//   GET    /api/studio/crm/contacts              all contacts, with their outreach and link status
//   GET    /api/studio/crm/contacts?id=3         one, with their emails and tasks
//   POST   /api/studio/crm/contacts  { business, type, contact_name, email, … }   add one → { id }
//   PUT    /api/studio/crm/contacts  { id, …fields }                              change one
//   POST   /api/studio/crm/contacts  { id, action: 'check_link' }                 check their link now
//   DELETE /api/studio/crm/contacts?id=3
import { json } from '../../../../functions-lib/studio.js';
import { TYPES, OUTREACH, checkLink } from '../../../../functions-lib/contacts.js';

const text = (v, max) => (v ?? '').toString().trim().slice(0, max);
// An Instagram handle from "@name", "name" or an instagram.com address ('' if none, null if not a handle).
const handle = (v) => { const s = text(v, 200).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, ''); return !s ? '' : /^[A-Za-z0-9._]{1,30}$/.test(s) ? s.toLowerCase() : null; };
const url = (v) => { const s = text(v, 500); if (!s) return ''; const u = /^https?:\/\//i.test(s) ? s : `https://${s}`; try { return new URL(u).href; } catch { return null; } };

function fields(d, old = {}) {
  const f = {
    business: d.business !== undefined ? text(d.business, 120) : old.business,
    type: d.type !== undefined ? (TYPES.includes(d.type) ? d.type : 'Other') : old.type ?? 'Venue',
    contact_name: d.contact_name !== undefined ? text(d.contact_name, 120) : old.contact_name ?? '',
    email: d.email !== undefined ? text(d.email, 254).toLowerCase() : old.email ?? '',
    phone: d.phone !== undefined ? text(d.phone, 40) : old.phone ?? '',
    website: d.website !== undefined ? url(d.website) : old.website ?? '',
    notes: d.notes !== undefined ? text(d.notes, 5000) : old.notes ?? '',
    our_page: d.our_page !== undefined ? text(d.our_page, 300) : old.our_page ?? '',
    outreach: d.outreach !== undefined ? (OUTREACH[d.outreach] ? d.outreach : 'none') : old.outreach ?? 'none',
    link_page: d.link_page !== undefined ? url(d.link_page) : old.link_page ?? '',
    instagram: d.instagram !== undefined ? handle(d.instagram) : old.instagram ?? '',
    facebook: d.facebook !== undefined ? url(d.facebook) : old.facebook ?? '',
  };
  if (!f.business) throw new Error('Add the business name.');
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) throw new Error('That email address doesn’t look right.');
  if (f.website === null || f.link_page === null || f.facebook === null) throw new Error('That web address doesn’t look right.');
  if (f.instagram === null) throw new Error('That Instagram name doesn’t look right (e.g. @settlersmanor).');
  return f;
}

export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (id) {
    const c = await env.DB.prepare('SELECT * FROM contacts WHERE id = ?1').bind(id).first();
    if (!c) return json({ error: 'That contact doesn’t exist.' }, 404);
    const [messages, tasks] = await Promise.all([
      env.DB.prepare('SELECT id, direction, subject, body, attachments, gmail_message_id, sent_at FROM contact_messages WHERE contact_id = ?1 ORDER BY sent_at DESC').bind(id).all(),
      env.DB.prepare('SELECT * FROM tasks WHERE contact_id = ?1 ORDER BY status, due_date').bind(id).all(),
    ]);
    return json({ contact: c, messages: messages.results, tasks: tasks.results, types: TYPES, outreach: OUTREACH });
  }
  const rows = await env.DB.prepare(`SELECT c.*, (SELECT count(*) FROM contact_messages m WHERE m.contact_id = c.id) AS emails,
    (SELECT max(sent_at) FROM contact_messages m WHERE m.contact_id = c.id AND m.direction = 'in') AS last_reply
    FROM contacts c ORDER BY c.business COLLATE NOCASE`).all();
  return json({ contacts: rows.results, types: TYPES, outreach: OUTREACH });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  if (d?.action === 'check_link') {
    const c = await env.DB.prepare('SELECT * FROM contacts WHERE id = ?1').bind(Number(d.id)).first();
    if (!c?.link_page) return json({ error: 'Add the address of their page where your link should be first.' }, 400);
    const found = await checkLink(env.DB, c);
    return json({ ok: true, found });
  }
  try {
    const f = fields(d ?? {});
    const now = new Date().toISOString();
    const r = await env.DB.prepare(`INSERT INTO contacts (business, type, contact_name, email, phone, website, notes, our_page, outreach, link_page, created_at, updated_at, instagram, facebook)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, ?12, ?13) RETURNING id`).bind(f.business, f.type, f.contact_name, f.email, f.phone, f.website, f.notes, f.our_page, f.outreach, f.link_page, now, f.instagram, f.facebook).first();
    return json({ ok: true, id: r.id });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => null);
  const old = d?.id && await env.DB.prepare('SELECT * FROM contacts WHERE id = ?1').bind(Number(d.id)).first();
  if (!old) return json({ error: 'That contact doesn’t exist.' }, 404);
  try {
    const f = fields(d, old);
    await env.DB.prepare(`UPDATE contacts SET business = ?2, type = ?3, contact_name = ?4, email = ?5, phone = ?6, website = ?7, notes = ?8, our_page = ?9, outreach = ?10,
      link_page = ?11, link_checked_at = CASE WHEN ?11 <> link_page THEN NULL ELSE link_checked_at END, updated_at = ?12, instagram = ?13, facebook = ?14 WHERE id = ?1`)
      .bind(old.id, f.business, f.type, f.contact_name, f.email, f.phone, f.website, f.notes, f.our_page, f.outreach, f.link_page, new Date().toISOString(), f.instagram, f.facebook).run();
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestDelete({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM contact_messages WHERE contact_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM tasks WHERE contact_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM contacts WHERE id = ?1').bind(id),
  ]);
  return json({ ok: true });
}
