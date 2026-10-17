// Connect Gmail: sends Tony to Google to allow the studio to send (and read replies) from his
// Workspace account. Google sends him back to gmail-callback.js.
//   GET /api/studio/crm/gmail-connect
import { json } from '../../../../functions-lib/studio.js';
import { SCOPES, REDIRECT } from '../../../../functions-lib/gmail.js';

export async function onRequestGet({ env }) {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET) return json({ error: 'GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET aren’t set in Cloudflare yet.' }, 500);
  const state = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: env.GMAIL_CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // always hand back a refresh token
    login_hint: 'tony@momentsinlight.co.nz',
    state,
  }).toString();
  return new Response(null, {
    status: 302,
    headers: { location: url.toString(), 'set-cookie': `gmail_state=${state}; Path=/api/studio/crm; HttpOnly; Secure; SameSite=Lax; Max-Age=600` },
  });
}
