// Facebook and Instagram connection (Studio > Social; functions-lib/meta.js).
//   GET  /api/studio/meta                          -> { ready, connection }
//   POST /api/studio/meta { action: 'page', id }   use a different Facebook Page
//   POST /api/studio/meta { action: 'disconnect' }
import { json } from '../../../../functions-lib/studio.js';
import { metaStatus, choosePage, disconnectMeta } from '../../../../functions-lib/meta.js';

export async function onRequestGet({ env }) {
  return json(await metaStatus(env));
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  try {
    if (d.action === 'page') await choosePage(env.DB, d.id);
    else if (d.action === 'disconnect') await disconnectMeta(env.DB);
    else return json({ error: 'What should happen?' }, 400);
    return json(await metaStatus(env));
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
