// The Ads Script sending report rows (signed; see functions-lib/ads.js).
//   POST /api/ads/ingest { report, rows }   report: campaigns | campaign_daily | keyword_daily | search_term_daily | entity:<kind> | done
import { json } from '../../../functions-lib/studio.js';
import { scriptRequest, ingest } from '../../../functions-lib/ads.js';

export async function onRequestPost({ request, env }) {
  const body = await scriptRequest(request, env);
  if (!body) return json({ error: 'Not allowed.' }, 401);
  let d;
  try { d = JSON.parse(body); } catch { return json({ error: 'Bad JSON.' }, 400); }
  if (!Array.isArray(d.rows) || d.rows.length > 2000) return json({ error: 'Send up to 2,000 rows at a time.' }, 400);
  try {
    return json(await ingest(env, String(d.report ?? ''), d.rows));
  } catch (e) {
    await env.DB.prepare('INSERT INTO ads_import_log (run_at, report, rows_received, ok, error) VALUES (?1, ?2, ?3, 0, ?4)').bind(new Date().toISOString(), String(d.report ?? ''), d.rows.length, e.message).run();
    return json({ error: e.message }, 400);
  }
}
