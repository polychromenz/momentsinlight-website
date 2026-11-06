// The wedding-day weather card on the client page (functions-lib/weather.js).
//   GET /api/studio/crm/weather?job=12            the forecast at their venue, from 7 days before the day
//   GET /api/studio/crm/weather?job=12&any=1      (testing) any date within the forecast's 16 days
import { json } from '../../../../functions-lib/studio.js';
import { locate } from '../../../../functions-lib/places.js';
import { forecast, weatherDue, daysUntil, townOf } from '../../../../functions-lib/weather.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const j = await env.DB.prepare('SELECT id, event_date, event_time, venue, venue_address FROM jobs WHERE id = ?1').bind(Number(url.searchParams.get('job'))).first();
  if (!j) return json({ error: 'No such client.' }, 404);
  const any = url.searchParams.get('any') === '1' && j.event_date && daysUntil(j.event_date) >= 0 && daysUntil(j.event_date) <= 15;
  if (!weatherDue(j.event_date) && !any) return json({ due: false });
  const where = j.venue_address || j.venue;
  if (!where) return json({ due: true, error: 'Add their venue to see the weather there.' });
  const place = (await locate(env, where).catch(() => null)) ?? (await townOf(where));
  if (!place) return json({ due: true, error: `Couldn’t find “${where}” on the map.` });
  try {
    const f = await forecast(j.event_date, place.lat, place.lng);
    return json({ due: true, date: j.event_date, days: daysUntil(j.event_date), event_time: j.event_time || null, place: { name: j.venue || place.name, lat: place.lat, lng: place.lng }, ...f });
  } catch (e) {
    return json({ due: true, error: e.message || 'The weather isn’t available right now.' });
  }
}
