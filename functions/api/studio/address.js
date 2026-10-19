// Address lookup for the studio (functions-lib/places.js): client addresses, venues, mileage.
//   GET /api/studio/address?q=…&s=<session>        -> { ready, suggestions }
//   GET /api/studio/address?place=<id>&s=<session>  -> { place }
import { json } from '../../../functions-lib/studio.js';
import { suggest, details, mapsReady } from '../../../functions-lib/places.js';

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get('place')) return json({ place: await details(env, q.get('place'), q.get('s')) });
  return json({ ready: mapsReady(env), suggestions: await suggest(env, q.get('q'), q.get('s')) });
}
