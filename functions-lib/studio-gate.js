// What every studio request goes through once we know who it is (signed in through Cloudflare
// Access in a browser, or a linked phone's key from the studio app). People listed in
// Settings > People have, per area of the studio, Hidden, Look only or Can change
// (functions-lib/people.js, functions-lib/areas.js): hidden areas are refused, look-only ones
// can't be changed. Changes to clients are noted with who made them (functions-lib/activity.js).
// Used by functions/api/studio/_middleware.js and functions/api/app/[[path]].js.
import { json } from './studio.js';
import { accessFor } from './people.js';
import { areaOfApi, levelFor, AREAS } from './areas.js';
import { recordActivity } from './activity.js';

// Reads that still change something (connecting Google or Xero), so they count as changes.
const READ_BUT_CHANGES = /^\/api\/studio\/(crm\/(gmail-connect|gmail-callback)|xero\/(connect|callback)|meta\/(connect|callback))/;

/** Check access for `who` ({ email }), then run `next()` (the studio function). */
export async function gate(context, who, next) {
  const { request, env } = context;
  const user = await accessFor(env.DB, who.email).catch(() => ({ email: who.email, access: 'owner', areas: null }));
  context.data.user = user;
  const path = new URL(request.url).pathname;
  const writes = !['GET', 'HEAD', 'OPTIONS'].includes(request.method) || READ_BUT_CHANGES.test(path);
  // Everyone may ask who they are (the studio's pages use it to set up the menu).
  const whoAmI = path === '/api/studio/people' && request.method === 'GET';
  if (path === '/api/studio/people' && writes && user.access !== 'owner') return json({ error: 'Only Tony can change who has access.' }, 403);
  if (!whoAmI) {
    const area = areaOfApi(path);
    const level = levelFor(user, area);
    if (level === 'hidden') return json({ error: `You don’t have access to ${AREAS[area] ?? 'this part of the studio'}. Ask Tony if you need it.` }, 403);
    const mayEmail = path === '/api/studio/email' && user.send_email; // their "send one-off emails" switch
    if (level === 'look' && writes && !mayEmail) return json({ error: `Your access to ${AREAS[area] ?? 'this part of the studio'} is look-only, so this can’t be changed. Ask Tony if you need it.` }, 403);
  }
  // A change to a client: note who made it, once it has worked.
  const logIt = writes && path.startsWith('/api/studio/crm/') && request.method !== 'GET';
  const body = logIt && (request.headers.get('content-type') || '').includes('json') ? await request.clone().json().catch(() => ({})) : {};
  const res = await next();
  if (logIt && res.status < 400) context.waitUntil(recordActivity(env, user, path, request.method, body ?? {}, new URL(request.url)).catch((e) => console.error('activity', e.message)));
  return res;
}
