// Address lookup for couples filling in their postal address when they accept a quote
// (src/pages/quote.astro). Only works with a quote's private token, so it can't be used by anyone else.
//   GET /api/address?t=<quote token>&q=…&s=<session>        -> { suggestions }
//   GET /api/address?t=<quote token>&place=<id>&s=<session>  -> { place }
import { json } from '../../functions-lib/studio.js';
import { suggest, details } from '../../functions-lib/places.js';

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const t = q.get('t') ?? '';
  const ok = /^[a-f0-9]{48}$/.test(t) && (await env.DB.prepare(`SELECT 1 FROM quotes WHERE token = ?1 AND status <> 'accepted'`).bind(t).first());
  if (!ok) return json({ suggestions: [] }, 403);
  if (q.get('place')) {
    const p = await details(env, q.get('place'), q.get('s'));
    return json({ place: p && { address: p.address } });
  }
  return json({ suggestions: await suggest(env, q.get('q'), q.get('s')) });
}
