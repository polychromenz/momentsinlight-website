// Contacts (venues and suppliers): their email merge fields, checking whether their page links
// to Tony's site, and the timer's contact jobs (functions/api/crm/run.js): picking up replies,
// and checking links. Tables: migrations/0021_contacts_tasks.sql.
import { thread } from './gmail.js';
import { studioLinks } from './email-render.js';

export const SITE = 'https://www.momentsinlight.co.nz';
export const TYPES = ['Venue', 'Planner', 'Celebrant', 'Florist', 'Hair & makeup', 'Videographer', 'Photographer', 'Directory', 'Other'];
export const OUTREACH = { none: 'Not contacted', emailed: 'Emailed', replied: 'Replied', live: 'Link live', declined: 'Declined' };
const DAY = 86400_000;

/** The merge fields for an email to a contact. */
export async function contactValues(db, c) {
  const first = c.contact_name.trim().split(/\s+/)[0] || '';
  return {
    ...(await studioLinks(db)),
    first_name: first, contact_name: first, business: c.business,
    our_page: c.our_page ? (c.our_page.startsWith('http') ? c.our_page : `${SITE}${c.our_page}`) : '',
  };
}

/** Does their page link to Tony's site? Updates the contact; a link that's gone becomes a task. */
export async function checkLink(db, c) {
  if (!c.link_page) return null;
  const now = new Date().toISOString();
  let found = null;
  try {
    const r = await fetch(c.link_page, { headers: { 'user-agent': 'Mozilla/5.0 (Moments in Light link check)' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    if (r.ok) found = /momentsinlight\.co\.nz/i.test(await r.text());
  } catch { /* not reachable this time: leave as it was */ }
  if (found === null) { await db.prepare('UPDATE contacts SET link_checked_at = ?2 WHERE id = ?1').bind(c.id, now).run(); return null; }
  const stmts = [db.prepare(`UPDATE contacts SET link_found = ?2, link_checked_at = ?3, outreach = CASE WHEN ?2 = 1 THEN 'live' ELSE outreach END, updated_at = ?3 WHERE id = ?1`).bind(c.id, found ? 1 : 0, now)];
  if (found) stmts.push(db.prepare(`UPDATE tasks SET status = 'done', done_at = ?2, done_note = 'Their link is live' WHERE contact_id = ?1 AND status = 'open' AND kind IN ('follow_up', 'link_gone')`).bind(c.id, now));
  if (!found && c.link_found === 1) {
    stmts.push(db.prepare(`INSERT INTO tasks (title, notes, due_date, contact_id, kind, created_at) SELECT ?2, ?3, ?4, ?1, 'link_gone', ?5 WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE contact_id = ?1 AND kind = 'link_gone' AND status = 'open')`)
      .bind(c.id, `The link from ${c.business} has gone`, `Their page ${c.link_page} no longer links to your site.`, now.slice(0, 10), now));
    stmts.push(db.prepare(`UPDATE contacts SET outreach = 'replied' WHERE id = ?1 AND outreach = 'live'`).bind(c.id));
  }
  await db.batch(stmts);
  return found;
}

/** After emailing a contact: mark them emailed, and a follow-up task in 7 days (unless one's open). */
export async function afterEmail(db, c) {
  const now = new Date();
  await db.batch([
    db.prepare(`UPDATE contacts SET last_emailed_at = ?2, outreach = CASE WHEN outreach = 'none' THEN 'emailed' ELSE outreach END, updated_at = ?2 WHERE id = ?1`).bind(c.id, now.toISOString()),
    db.prepare(`INSERT INTO tasks (title, due_date, contact_id, kind, created_at) SELECT ?2, ?3, ?1, 'follow_up', ?4 WHERE ?5 IN ('none', 'emailed') AND NOT EXISTS (SELECT 1 FROM tasks WHERE contact_id = ?1 AND kind = 'follow_up' AND status = 'open')`)
      .bind(c.id, `Follow up with ${c.business} (no reply yet)`, new Date(now.valueOf() + 7 * DAY).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }), now.toISOString(), c.outreach),
  ]);
}

/** The timer's contact jobs: new emails in their conversations, then a couple of link checks. */
export async function contactsTimer(env, gmail) {
  const db = env.DB;
  const now = new Date().toISOString();
  const out = { replies: 0, links: 0 };
  if (gmail) {
    const me = [(gmail.email || '').toLowerCase(), 'tony@momentsinlight.co.nz'];
    const list = (await db.prepare(`SELECT c.*, (SELECT gmail_thread_id FROM contact_messages m WHERE m.contact_id = c.id AND m.gmail_thread_id IS NOT NULL ORDER BY m.sent_at DESC LIMIT 1) AS t
      FROM contacts c WHERE t IS NOT NULL ORDER BY c.mail_checked_at IS NOT NULL, c.mail_checked_at LIMIT 5`).all()).results;
    for (const c of list) {
      let msgs;
      try { msgs = await thread(env, c.t); } catch (e) { console.error('contacts: thread', e.message); continue; }
      const known = new Set((await db.prepare('SELECT gmail_message_id FROM contact_messages WHERE contact_id = ?1 AND gmail_message_id IS NOT NULL').bind(c.id).all()).results.map((r) => r.gmail_message_id));
      const fresh = msgs.filter((m) => !known.has(m.id));
      const theirs = fresh.filter((m) => m.from && !me.includes(m.from));
      const stmts = [
        db.prepare('UPDATE contacts SET mail_checked_at = ?2 WHERE id = ?1').bind(c.id, now),
        ...fresh.map((m) => db.prepare(`INSERT INTO contact_messages (contact_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at)
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE NOT EXISTS (SELECT 1 FROM contact_messages WHERE gmail_message_id = ?5)`)
          .bind(c.id, me.includes(m.from) ? 'out' : 'in', m.subject, m.snippet, m.id, c.t, m.at)),
      ];
      if (theirs.length) {
        stmts.push(
          db.prepare(`UPDATE contacts SET outreach = CASE WHEN outreach IN ('none', 'emailed') THEN 'replied' ELSE outreach END, updated_at = ?2 WHERE id = ?1`).bind(c.id, now),
          db.prepare(`UPDATE tasks SET status = 'done', done_at = ?2, done_note = 'They replied' WHERE contact_id = ?1 AND status = 'open' AND kind = 'follow_up'`).bind(c.id, now),
        );
        out.replies++;
      }
      await db.batch(stmts);
    }
  }
  // Links: new or recently emailed ones daily, the rest monthly.
  const due = (await db.prepare(`SELECT * FROM contacts WHERE link_page <> '' AND (link_checked_at IS NULL
      OR (outreach IN ('emailed', 'replied') AND link_checked_at < ?1) OR link_checked_at < ?2) ORDER BY link_checked_at IS NOT NULL, link_checked_at LIMIT 2`)
    .bind(new Date(Date.now() - DAY).toISOString(), new Date(Date.now() - 30 * DAY).toISOString()).all()).results;
  for (const c of due) { await checkLink(db, c); out.links++; }
  return out;
}
