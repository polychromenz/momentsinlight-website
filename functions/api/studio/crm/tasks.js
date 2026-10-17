// Studio tasks that aren't about a client (SEO jobs, follow-ups with venues…).
//   GET    /api/studio/crm/tasks                 open tasks (and done ones from the last 2 weeks)
//   POST   /api/studio/crm/tasks  { title, due_date?, notes?, contact_id? }   add one
//   PUT    /api/studio/crm/tasks  { id, action: 'done' | 'reopen' }  or  { id, title?, due_date?, notes? }
//   DELETE /api/studio/crm/tasks?id=4
import { json } from '../../../../functions-lib/studio.js';

const text = (v, max) => (v ?? '').toString().trim().slice(0, max);
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);

export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare(`SELECT t.*, c.business FROM tasks t LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.status = 'open' OR t.done_at > ?1 ORDER BY t.status, t.due_date IS NULL, t.due_date, t.id`).bind(new Date(Date.now() - 14 * 86400_000).toISOString()).all();
  return json({ tasks: rows.results });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const title = text(d?.title, 200);
  if (!title) return json({ error: 'What’s the task?' }, 400);
  const r = await env.DB.prepare('INSERT INTO tasks (title, notes, due_date, contact_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id')
    .bind(title, text(d.notes, 2000), date(d.due_date), d.contact_id ? Number(d.contact_id) : null, new Date().toISOString()).first();
  return json({ ok: true, id: r.id });
}

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => null);
  const t = d?.id && await env.DB.prepare('SELECT * FROM tasks WHERE id = ?1').bind(Number(d.id)).first();
  if (!t) return json({ error: 'That task doesn’t exist.' }, 404);
  const now = new Date().toISOString();
  if (d.action === 'done') await env.DB.prepare(`UPDATE tasks SET status = 'done', done_at = ?2 WHERE id = ?1`).bind(t.id, now).run();
  else if (d.action === 'reopen') await env.DB.prepare(`UPDATE tasks SET status = 'open', done_at = NULL, done_note = '' WHERE id = ?1`).bind(t.id).run();
  else await env.DB.prepare('UPDATE tasks SET title = ?2, due_date = ?3, notes = ?4 WHERE id = ?1')
    .bind(t.id, text(d.title ?? t.title, 200) || t.title, d.due_date !== undefined ? date(d.due_date) : t.due_date, d.notes !== undefined ? text(d.notes, 2000) : t.notes).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  await env.DB.prepare('DELETE FROM tasks WHERE id = ?1').bind(Number(new URL(request.url).searchParams.get('id'))).run();
  return json({ ok: true });
}
