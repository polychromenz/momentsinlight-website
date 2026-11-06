// The wedding-day weather card on the client page (functions-lib/weather.js).
//   GET /api/studio/crm/weather?job=12            the forecast at their venue, from 7 days before the day
//   GET /api/studio/crm/weather?job=12&any=1      (testing) any date within the forecast's 16 days
// The phone app reaches this too (functions/api/app/[[path]].js); the portal has its own door
// (/api/portal?t=…&weather=1).
import { json } from '../../../../functions-lib/studio.js';
import { jobWeather } from '../../../../functions-lib/weather.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const j = await env.DB.prepare('SELECT id, event_date, event_time, venue, venue_address FROM jobs WHERE id = ?1').bind(Number(url.searchParams.get('job'))).first();
  if (!j) return json({ error: 'No such client.' }, 404);
  return json(await jobWeather(env, j, { any: url.searchParams.get('any') === '1' }));
}
