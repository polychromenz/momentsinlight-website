// Studio Ninja emails in Gmail, for the import (functions-lib/sn-gmail.js).
//   GET  /api/studio/crm/sn-gmail                        the last survey, and how much has been read
//   POST /api/studio/crm/sn-gmail                        run the survey (read only)
//   POST /api/studio/crm/sn-gmail { action: 'read', kind }   read the next batch of that kind
//   POST /api/studio/crm/sn-gmail { action: 'clear' }    empty what was read (after testing)
import { json } from '../../../../functions-lib/studio.js';
import { survey, readBatch, progress, KINDS } from '../../../../functions-lib/sn-gmail.js';

export async function onRequestGet({ env }) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'sn_survey'`).first();
  return json({ ...(row ? JSON.parse(row.value) : { none: true }), progress: await progress(env) });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  try {
    if (d.action === 'read') {
      if (!KINDS[d.kind]) return json({ error: 'Which kind?' }, 400);
      return json(await readBatch(env, d.kind));
    }
    if (d.action === 'clear') {
      await env.DB.prepare('DELETE FROM sn_gmail').run();
      return json({ ok: true });
    }
    return json({ ...(await survey(env)), progress: await progress(env) });
  } catch (e) {
    return json({ error: /Gmail isn’t connected|expired/.test(e.message) ? e.message : `It stopped: ${e.message}` }, 500);
  }
}
