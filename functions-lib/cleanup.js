// The two-year clean-up of old enquiries promised on /privacy (Tony's choice, 19 Oct 2026: Studio
// Ninja history included). Run by the timer (functions/api/crm/run.js):
//   - from 9am NZ on the 1st of the month: an email to Tony listing everyone due to go, each linked
//     to their client page, where "Keep their details" saves them;
//   - from the 8th: those on the list who still qualify are deleted, with everything about them,
//     and Tony gets a short note of who went.
// Only people who enquired and never booked, with nothing from or to them in two years. Clients
// with no enquiry at all (e.g. contacts from Studio Ninja) and anyone ticked "Keep" are left alone.
import { nzNow } from './schedules.js';
import { alertTony } from './crm.js';

const YEARS = 2;
const STUDIO = 'https://www.momentsinlight.co.nz/studio/crm/job?id=';

/** Clients due to go: never booked, no enquiry, change or email in two years, not kept. */
export async function dueForCleanup(db, now = new Date()) {
  const cut = new Date(now);
  cut.setFullYear(cut.getFullYear() - YEARS);
  const c = cut.toISOString();
  return (await db.prepare(`SELECT cl.id, cl.first_name, cl.last_name, max(j.id) job_id, max(j.created_at) last_enquiry
      FROM clients cl JOIN jobs j ON j.client_id = cl.id
      WHERE cl.keep = 0 AND cl.created_at < ?1
      GROUP BY cl.id
      HAVING sum(j.stage IN ('booked', 'completed')) = 0 AND max(j.created_at) < ?1 AND max(COALESCE(j.lost_at, j.created_at)) < ?1
        AND NOT EXISTS (SELECT 1 FROM messages m WHERE (m.client_id = cl.id OR m.job_id IN (SELECT id FROM jobs WHERE client_id = cl.id)) AND m.sent_at >= ?1)
      ORDER BY last_enquiry`).bind(c).all()).results;
}

/** Everything about one client, gone (their files too). Galleries linked to them are kept, unlinked. */
export async function deleteClient(db, clientId) {
  const jobs = (await db.prepare('SELECT id FROM jobs WHERE client_id = ?1').bind(clientId).all()).results.map((j) => j.id);
  const J = JSON.stringify(jobs);
  const inJobs = (t) => db.prepare(`DELETE FROM ${t} WHERE job_id IN (SELECT value FROM json_each(?1))`).bind(J);
  await db.batch([
    db.prepare(`DELETE FROM files WHERE name IN (SELECT 'upload-' || id FROM uploads WHERE job_id IN (SELECT value FROM json_each(?1)))`).bind(J),
    db.prepare(`DELETE FROM files WHERE name IN (SELECT 'doc-' || id FROM documents WHERE job_id IN (SELECT value FROM json_each(?1)))`).bind(J),
    ...['uploads', 'job_documents', 'documents', 'steps', 'quotes', 'contracts', 'invoices', 'questionnaires', 'appointments', 'galleries', 'enquiry_spam'].map(inJobs),
    db.prepare(`DELETE FROM messages WHERE client_id = ?1 OR job_id IN (SELECT value FROM json_each(?2))`).bind(clientId, J),
    db.prepare(`UPDATE photo_galleries SET client_id = NULL, job_id = NULL WHERE client_id = ?1 OR job_id IN (SELECT value FROM json_each(?2))`).bind(clientId, J),
    db.prepare('DELETE FROM jobs WHERE client_id = ?1').bind(clientId),
    db.prepare('DELETE FROM clients WHERE id = ?1').bind(clientId),
  ]);
}

export async function enquiryCleanup(env) {
  const db = env.DB;
  const nz = nzNow();
  const month = nz.date.slice(0, 7);
  const day = Number(nz.date.slice(8, 10));
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'enquiry_cleanup'`).first();
  const state = row ? JSON.parse(row.value) : {};
  const save = (v) => db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('enquiry_cleanup', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(v), new Date().toISOString()).run();
  const name = (c) => `${c.first_name} ${c.last_name}`.trim();

  // The warning, once a month.
  if (state.warned !== month && nz.hour >= 9) {
    const due = await dueForCleanup(db);
    await save({ ...state, warned: month, pending: due.map((c) => c.id), done: null });
    if (!due.length) return 'nothing due';
    await alertTony(env, `${due.length} old enquir${due.length === 1 ? 'y' : 'ies'} will be deleted on the 8th`, [
      ['Why', 'Your privacy page says enquiries that never book are deleted after two years.'],
      ['Going', due.map((c) => `${name(c)} (enquired ${String(c.last_enquiry).slice(0, 10)}): ${STUDIO}${c.job_id}`).join('\n')],
      ['To keep someone', 'Open their page and tick “Keep their details”, then Save, before the 8th.'],
    ], 'https://www.momentsinlight.co.nz/studio/crm');
    return `warned: ${due.length}`;
  }
  // The deleting, from the 8th, only people on this month's list who still qualify.
  if (state.warned === month && state.done !== month && day >= 8 && nz.hour >= 9) {
    const still = new Map((await dueForCleanup(db)).map((c) => [c.id, c]));
    const going = (state.pending ?? []).map((id) => still.get(id)).filter(Boolean);
    for (const c of going) await deleteClient(db, c.id);
    await save({ ...state, done: month, deleted: going.length });
    if (going.length) await alertTony(env, `Deleted ${going.length} old enquir${going.length === 1 ? 'y' : 'ies'}`, [
      ['Deleted', going.map(name).join('\n')],
      ['Why', 'Never booked, and nothing from or to them in two years (as your privacy page says).'],
    ]);
    return `deleted: ${going.length}`;
  }
  return 'not due';
}
