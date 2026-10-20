// Facebook sends Tony back here after he allows the studio in; then back to Studio > Social.
//   GET /api/studio/meta/callback?code=…&state=…
import { finishMetaConnect } from '../../../../functions-lib/meta.js';

const back = (request, result) => Response.redirect(new URL(`/studio/social?meta=${encodeURIComponent(result)}`, request.url).toString(), 303);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const cookie = (request.headers.get('cookie') || '').match(/(?:^|;\s*)meta_state=([^;]+)/)?.[1];
  if (url.searchParams.get('error')) return back(request, 'cancelled');
  if (!cookie || cookie !== url.searchParams.get('state')) return back(request, 'expired');
  try { await finishMetaConnect(env, url.searchParams.get('code') || ''); } catch (e) {
    console.error('meta callback', e.message);
    return back(request, `failed:${e.message}`.slice(0, 300));
  }
  const res = back(request, 'connected');
  const headers = new Headers(res.headers);
  headers.append('set-cookie', 'meta_state=; Path=/api/studio/meta; Max-Age=0');
  return new Response(null, { status: res.status, headers });
}
