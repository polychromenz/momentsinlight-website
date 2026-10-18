// Enquiries the form's spam check caught (functions-lib/spam.js), for Clients > Spam.
//   GET  /api/studio/crm/spam                       -> { spam: [...] } newest first (released ones too, marked)
//   POST /api/studio/crm/spam { id, action: 'release' }  "Not spam": becomes a lead as if just sent (workflow, alert)
//   POST /api/studio/crm/spam { id, action: 'delete' }
import { json } from '../../../../functions-lib/studio.js';
import { createLead } from '../../../../functions-lib/enquiry.js';

export async function onRequestGet({ env }) {
  const rows = (await env.DB.prepare('SELECT * FROM enquiry_spam ORDER BY created_at DESC LIMIT 300').all()).results;
  return json({ spam: rows.map((r) => ({ ...r, data: JSON.parse(r.data) })) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const d = await request.json().catch(() => ({}));
  const row = await env.DB.prepare('SELECT * FROM enquiry_spam WHERE id = ?1').bind(Number(d.id)).first();
  if (!row) return json({ error: 'That enquiry isn’t there any more.' }, 404);
  if (d.action === 'delete') {
    await env.DB.prepare('DELETE FROM enquiry_spam WHERE id = ?1').bind(row.id).run();
    return json({ ok: true });
  }
  if (d.action === 'release') {
    if (row.job_id) return json({ ok: true, job_id: row.job_id });
    try {
      const jobId = await createLead(context, JSON.parse(row.data), request.url, `Released from Spam (caught ${row.created_at.slice(0, 10)}: ${row.reason})`);
      await env.DB.prepare('UPDATE enquiry_spam SET released_at = ?2, job_id = ?3 WHERE id = ?1').bind(row.id, new Date().toISOString(), jobId).run();
      return json({ ok: true, job_id: jobId });
    } catch (e) {
      return json({ error: e.message }, e.status ?? 500);
    }
  }
  return json({ error: 'What should happen?' }, 400);
}
