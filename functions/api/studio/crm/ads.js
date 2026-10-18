// Studio > SEO > Ads (phase 1): set-up and what's come in.
//   GET  /api/studio/crm/ads                  -> { connected, last, imports, campaigns (last 30 days), totals, gsc }
//   POST /api/studio/crm/ads { action: 'key' } -> { secret } a new key for the Ads Script (the old one stops working)
//   POST /api/studio/crm/ads { action: 'current' } -> { secret } the key in use, to copy an updated script
import { json } from '../../../../functions-lib/studio.js';
import { newSyncSecret, currentSyncSecret } from '../../../../functions-lib/ads.js';

export async function onRequestGet({ env }) {
  const db = env.DB;
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [key, last, imports, campaigns, totals, terms, gsc] = await Promise.all([
    db.prepare(`SELECT updated_at FROM settings WHERE key = 'ads_sync'`).first(),
    db.prepare(`SELECT max(run_at) at FROM ads_import_log WHERE ok = 1`).first(),
    db.prepare(`SELECT run_at, report, rows_received, ok, error FROM ads_import_log ORDER BY id DESC LIMIT 12`).all(),
    db.prepare(`SELECT c.campaign_id, c.name, c.status, c.channel_type, c.bidding, c.partner_network, c.display_network, c.geo_target_type, c.budget_cents,
        COALESCE(SUM(d.cost_cents), 0) cost, COALESCE(SUM(d.clicks), 0) clicks, COALESCE(SUM(d.impressions), 0) impressions, COALESCE(SUM(d.conversions), 0) conversions
      FROM ads_campaign c LEFT JOIN ads_campaign_daily d ON d.campaign_id = c.campaign_id AND d.date >= ?1 GROUP BY c.campaign_id ORDER BY cost DESC`).bind(since).all(),
    db.prepare(`SELECT COALESCE(SUM(cost_cents), 0) cost, COALESCE(SUM(clicks), 0) clicks, COALESCE(SUM(conversions), 0) conversions, min(date) first, max(date) last FROM ads_campaign_daily`).first(),
    db.prepare(`SELECT count(DISTINCT search_term) n FROM ads_search_term_daily`).first(),
    db.prepare(`SELECT count(*) n, min(date) first, max(date) last FROM gsc_query_daily`).first(),
  ]);
  return json({ connected: !!key, key_made: key?.updated_at ?? null, last: last?.at ?? null, imports: imports.results, campaigns: campaigns.results, totals, search_terms: terms.n, gsc });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  if (d.action === 'key') return json({ secret: await newSyncSecret(env) });
  // Send everything on the script's next run (e.g. after updating the script).
  if (d.action === 'refresh') { await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ads_force', '1', ?1) ON CONFLICT (key) DO UPDATE SET updated_at = ?1").bind(new Date().toISOString()).run(); return json({ ok: true }); }
  // The latest script with the key already in use (after the script itself has been updated).
  if (d.action === 'current') { const secret = await currentSyncSecret(env); return secret ? json({ secret }) : json({ error: 'Make the script first.' }, 400); }
  return json({ error: 'What should happen?' }, 400);
}
