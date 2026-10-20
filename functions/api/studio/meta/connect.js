// Connect Facebook and Instagram: sends Tony to Facebook to allow the studio in; Facebook sends him
// back to callback.js. Needs META_APP_ID and META_APP_SECRET (functions-lib/meta.js).
//   GET /api/studio/meta/connect
import { json } from '../../../../functions-lib/studio.js';
import { metaReady, loginUrl } from '../../../../functions-lib/meta.js';

export async function onRequestGet({ env }) {
  if (!metaReady(env)) return json({ error: 'META_APP_ID / META_APP_SECRET aren’t set in Cloudflare yet.' }, 500);
  const state = crypto.randomUUID();
  return new Response(null, { status: 302, headers: { location: loginUrl(env, state), 'set-cookie': `meta_state=${state}; Path=/api/studio/meta; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
}
