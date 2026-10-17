// Tick off, skip or bring back a planned step (a to-do or an email) in the studio CRM.
//   POST /api/studio/crm/step   { id, action: 'done' | 'skip' | 'reopen' }
// Sending an email step (with review and personalising first) is send.js, once Gmail is
// connected; 'done' here is for a to-do, or an email Tony sent some other way.
import { json } from '../../../../functions-lib/studio.js';

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const id = Number(d?.id);
  const action = d?.action;
  if (!id || !['done', 'skip', 'reopen'].includes(action)) return json({ error: 'Which step, and what to do?' }, 400);
  const now = new Date().toISOString();
  const r = action === 'reopen'
    ? await env.DB.prepare(`UPDATE steps SET status = 'scheduled', done_at = NULL, note = '' WHERE id = ?1 AND status IN ('done', 'skipped', 'failed')`).bind(id).run()
    : await env.DB.prepare(`UPDATE steps SET status = ?2, done_at = ?3, note = ?4 WHERE id = ?1 AND status IN ('scheduled', 'due', 'failed')`)
      .bind(id, action === 'done' ? 'done' : 'skipped', now, action === 'done' ? 'Marked done' : 'Skipped').run();
  if (!r.meta.changes) return json({ error: 'That step has already changed. Reload to see it.' }, 409);
  return json({ ok: true });
}
