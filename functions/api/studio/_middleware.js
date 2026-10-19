// Every studio request must come from someone signed in through Cloudflare Access. People listed in
// Settings > People with "Look only" can read but not change anything (functions-lib/people.js).
import { signedIn, json } from '../../../functions-lib/studio.js';
import { accessFor } from '../../../functions-lib/people.js';
import { recordActivity } from '../../../functions-lib/activity.js';

// Reads that still change something (connecting Google), so a look-only person can't use them.
const READ_BUT_CHANGES = /^\/api\/studio\/(crm\/(gmail-connect|gmail-callback)|xero\/(connect|callback))/;

export async function onRequest(context) {
  const { request, env } = context;
  let who;
  try {
    who = await signedIn(request, env);
    if (!who) return json({ error: 'Please sign in to the studio again.' }, 401);
  } catch {
    return json({ error: 'Could not check your sign-in. Please reload the page.' }, 401);
  }
  const user = await accessFor(env.DB, who.email).catch(() => ({ email: who.email, access: 'owner' }));
  context.data.user = user;
  const path = new URL(request.url).pathname;
  const writes = !['GET', 'HEAD', 'OPTIONS'].includes(request.method) || READ_BUT_CHANGES.test(path);
  if (user.access === 'read' && writes) return json({ error: 'Your studio access is look-only, so this can’t be changed. Ask Tony if you need it.' }, 403);
  if (user.access !== 'owner' && path === '/api/studio/people' && request.method !== 'GET') return json({ error: 'Only Tony can change who has access.' }, 403);
  // A change to a client: note who made it (functions-lib/activity.js), once it has worked.
  const logIt = writes && path.startsWith('/api/studio/crm/') && request.method !== 'GET';
  const body = logIt && (request.headers.get('content-type') || '').includes('json') ? await request.clone().json().catch(() => ({})) : {};
  const res = await context.next();
  if (logIt && res.status < 400) context.waitUntil(recordActivity(env, user, path, request.method, body ?? {}, new URL(request.url)).catch((e) => console.error('activity', e.message)));
  return res;
}
