// Connect Xero: sends Tony to Xero to choose his organisation and allow the studio in. Xero sends
// him back to callback.js. Needs XERO_CLIENT_ID and XERO_CLIENT_SECRET (functions-lib/xero.js).
//   GET /api/studio/xero/connect
import { json } from '../../../../functions-lib/studio.js';
import { SCOPES, REDIRECT, xeroReady } from '../../../../functions-lib/xero.js';

export async function onRequestGet({ env }) {
  if (!xeroReady(env)) return json({ error: 'XERO_CLIENT_ID / XERO_CLIENT_SECRET aren’t set in Cloudflare yet.' }, 500);
  const state = crypto.randomUUID();
  const url = new URL('https://login.xero.com/identity/connect/authorize');
  url.search = new URLSearchParams({ response_type: 'code', client_id: env.XERO_CLIENT_ID, redirect_uri: REDIRECT, scope: SCOPES.join(' '), state }).toString();
  return new Response(null, { status: 302, headers: { location: url.toString(), 'set-cookie': `xero_state=${state}; Path=/api/studio/xero; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
}
