// The Dashboard's Google Ads card (functions-lib/ads-summary.js). In the Google Ads area, so
// people without access to it don't see spend.
//   GET /api/studio/crm/ads-summary  -> { yesterday, week, month, lastSync, stale, warnings }
import { json } from '../../../../functions-lib/studio.js';
import { adsSummary } from '../../../../functions-lib/ads-summary.js';

export async function onRequestGet({ env }) {
  return json(await adsSummary(env.DB));
}
