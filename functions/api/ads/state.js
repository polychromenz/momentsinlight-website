// The Ads Script asking what to do this run (signed; see functions-lib/ads.js).
//   POST /api/ads/state { version }  -> { export_due, days, actions, reports }
//   (the version is kept, so the studio's Google Ads page can say if Google has an old copy)
import { json } from '../../../functions-lib/studio.js';
import { scriptRequest, scriptState } from '../../../functions-lib/ads.js';

export async function onRequestPost({ request, env }) {
  const body = await scriptRequest(request, env);
  if (!body) return json({ error: 'Not allowed. Make a new key in Studio > SEO > Ads and paste the new script into Google Ads.' }, 401);
  let version = '';
  try { version = String(JSON.parse(body).version ?? '').slice(0, 20); } catch {}
  await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('ads_script', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify({ version: version || 'before versions' }), new Date().toISOString()).run();
  return json(await scriptState(env));
}
