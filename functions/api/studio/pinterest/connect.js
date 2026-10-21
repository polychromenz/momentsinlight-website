// Connect Pinterest: sends Tony to Pinterest to allow the studio in; Pinterest sends him back to
// callback.js. Needs PINTEREST_APP_ID and PINTEREST_APP_SECRET (functions-lib/pinterest.js).
//   GET /api/studio/pinterest/connect
import { json } from '../../../../functions-lib/studio.js';
import { pinterestReady, pinterestLoginUrl } from '../../../../functions-lib/pinterest.js';

export async function onRequestGet({ env }) {
  if (!pinterestReady(env)) return json({ error: 'PINTEREST_APP_ID / PINTEREST_APP_SECRET aren’t set in Cloudflare yet.' }, 500);
  const state = crypto.randomUUID();
  return new Response(null, { status: 302, headers: { location: pinterestLoginUrl(env, state), 'set-cookie': `pin_state=${state}; Path=/api/studio/pinterest; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
}
