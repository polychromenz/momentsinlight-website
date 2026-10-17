// Google sends Tony back here after he allows the studio to use Gmail. Swaps the one-time code
// for a refresh token, stores it encrypted, and returns him to the Clients page.
//   GET /api/studio/crm/gmail-callback?code=…&state=…
import { REDIRECT, encrypt, saveConnection } from '../../../../functions-lib/gmail.js';

const back = (request, result) => Response.redirect(new URL(`/studio/crm?gmail=${result}`, request.url).toString(), 303);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const cookie = (request.headers.get('cookie') || '').match(/(?:^|;\s*)gmail_state=([^;]+)/)?.[1];
  if (url.searchParams.get('error')) return back(request, 'cancelled');
  if (!cookie || cookie !== url.searchParams.get('state')) return back(request, 'expired');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      code: url.searchParams.get('code') || '',
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.refresh_token) {
    console.error('gmail-callback: token exchange failed', r.status, d.error, d.error_description);
    return back(request, 'failed');
  }
  // Which account was connected (from the ID token Google includes).
  let email = '';
  try { email = JSON.parse(atob(d.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch { /* not essential */ }
  await saveConnection(env.DB, { email, refresh: await encrypt(env, d.refresh_token), scopes: d.scope, connected_at: new Date().toISOString() });
  const res = back(request, 'connected');
  const headers = new Headers(res.headers);
  headers.append('set-cookie', 'gmail_state=; Path=/api/studio/crm; Max-Age=0');
  return new Response(null, { status: res.status, headers });
}
