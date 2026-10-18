// The Ads Script asking what to do this run (signed; see functions-lib/ads.js).
//   POST /api/ads/state {}  -> { export_due, days, actions }
import { json } from '../../../functions-lib/studio.js';
import { scriptRequest, scriptState } from '../../../functions-lib/ads.js';

export async function onRequestPost({ request, env }) {
  if (!(await scriptRequest(request, env))) return json({ error: 'Not allowed. Make a new key in Studio > SEO > Ads and paste the new script into Google Ads.' }, 401);
  return json(await scriptState(env));
}
