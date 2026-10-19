// Xero sends Tony back here after he allows the studio in; then back to Payments > Xero.
//   GET /api/studio/xero/callback?code=…&state=…
import { finishConnect } from '../../../../functions-lib/xero.js';

const back = (request, result) => Response.redirect(new URL(`/studio/xero?xero=${result}`, request.url).toString(), 303);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const cookie = (request.headers.get('cookie') || '').match(/(?:^|;\s*)xero_state=([^;]+)/)?.[1];
  if (url.searchParams.get('error')) return back(request, 'cancelled');
  if (!cookie || cookie !== url.searchParams.get('state')) return back(request, 'expired');
  try { await finishConnect(env, url.searchParams.get('code') || ''); } catch (e) {
    console.error('xero callback', e.message);
    return back(request, 'failed');
  }
  const res = back(request, 'connected');
  const headers = new Headers(res.headers);
  headers.append('set-cookie', 'xero_state=; Path=/api/studio/xero; Max-Age=0');
  return new Response(null, { status: res.status, headers });
}
