// Studio > SEO > Ads (phase 1): set-up and what's come in.
//   GET  /api/studio/crm/ads                  -> { connected, last, imports, campaigns (last 30 days), totals, gsc }
//   POST /api/studio/crm/ads { action: 'key' } -> { secret } a new key for the Ads Script (the old one stops working)
//   POST /api/studio/crm/ads { action: 'current' } -> { secret } the key in use, to copy an updated script
//   POST /api/studio/crm/ads { action: 'negative', campaign_id, text, match }  approve a negative keyword (the script adds it on its next run)
//   POST /api/studio/crm/ads { action: 'cancel', id }  take back an approval the script hasn't used yet
import { json } from '../../../../functions-lib/studio.js';
import { newSyncSecret, currentSyncSecret, blockSuggestions, campaignNegatives, negativeBlocks, NEGATIVE_OK } from '../../../../functions-lib/ads.js';

// Who approved a change (the studio's middleware has already checked the sign-in).
function signedInAs(request) {
  try {
    const p = request.headers.get('Cf-Access-Jwt-Assertion')?.split('.')[1];
    return p ? JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).email ?? '' : 'local';
  } catch { return ''; }
}

export async function onRequestGet({ env }) {
  const db = env.DB;
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [key, last, imports, campaigns, totals, terms, gsc, block, actions] = await Promise.all([
    db.prepare(`SELECT updated_at FROM settings WHERE key = 'ads_sync'`).first(),
    db.prepare(`SELECT max(run_at) at FROM ads_import_log WHERE ok = 1`).first(),
    db.prepare(`SELECT run_at, report, rows_received, ok, error FROM ads_import_log ORDER BY id DESC LIMIT 12`).all(),
    db.prepare(`SELECT c.campaign_id, c.name, c.status, c.channel_type, c.bidding, c.partner_network, c.display_network, c.geo_target_type, c.budget_cents,
        COALESCE(SUM(d.cost_cents), 0) cost, COALESCE(SUM(d.clicks), 0) clicks, COALESCE(SUM(d.impressions), 0) impressions, COALESCE(SUM(d.conversions), 0) conversions
      FROM ads_campaign c LEFT JOIN ads_campaign_daily d ON d.campaign_id = c.campaign_id AND d.date >= ?1 GROUP BY c.campaign_id ORDER BY cost DESC`).bind(since).all(),
    db.prepare(`SELECT COALESCE(SUM(cost_cents), 0) cost, COALESCE(SUM(clicks), 0) clicks, COALESCE(SUM(conversions), 0) conversions, min(date) first, max(date) last FROM ads_campaign_daily`).first(),
    db.prepare(`SELECT count(DISTINCT search_term) n FROM ads_search_term_daily`).first(),
    db.prepare(`SELECT count(*) n, min(date) first, max(date) last FROM gsc_query_daily`).first(),
    blockSuggestions(db, since),
    db.prepare(`SELECT id, payload, status, created_at, applied_at, error FROM ads_action WHERE type = 'add_negative' ORDER BY id DESC LIMIT 40`).all(),
  ]);
  return json({ connected: !!key, key_made: key?.updated_at ?? null, last: last?.at ?? null, imports: imports.results, campaigns: campaigns.results, totals, search_terms: terms.n, gsc,
    block: block.slice(0, 40), negatives: actions.results.map((a) => ({ ...a, payload: JSON.parse(a.payload) })) });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  if (d.action === 'key') return json({ secret: await newSyncSecret(env) });
  // Send everything on the script's next run (e.g. after updating the script).
  if (d.action === 'refresh') { await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ads_force', '1', ?1) ON CONFLICT (key) DO UPDATE SET updated_at = ?1").bind(new Date().toISOString()).run(); return json({ ok: true }); }
  // The latest script with the key already in use (after the script itself has been updated).
  if (d.action === 'current') { const secret = await currentSyncSecret(env); return secret ? json({ secret }) : json({ error: 'Make the script first.' }, 400); }
  if (d.action === 'negative') {
    const text = String(d.text ?? '').toLowerCase().replace(/s+/g, ' ').trim();
    const match = ['BROAD', 'PHRASE', 'EXACT'].includes(d.match) ? d.match : null;
    if (!NEGATIVE_OK.test(text) || text.split(' ').length > 10) return json({ error: 'Use plain words only (letters, numbers, spaces), up to 10 words.' }, 400);
    if (!match) return json({ error: 'Choose broad, phrase or exact.' }, 400);
    const camp = await env.DB.prepare(`SELECT campaign_id, name FROM ads_campaign WHERE campaign_id = ?1 AND channel_type = 'SEARCH'`).bind(String(d.campaign_id ?? '')).first();
    if (!camp) return json({ error: 'Choose a Search campaign.' }, 400);
    if ((await campaignNegatives(env.DB, camp.campaign_id)).some((n) => n.match === match && n.text.toLowerCase() === text)) return json({ error: `“${text}” is already blocked in ${camp.name}.` }, 400);
    // A negative that would stop one of your own keywords is almost always a mistake.
    const mine = (await env.DB.prepare(`SELECT DISTINCT lower(json_extract(data, '$.text')) t FROM ads_entity WHERE kind = 'keyword' AND json_extract(data, '$.negative') = 0 AND json_extract(data, '$.status') = 'ENABLED' AND json_extract(data, '$.campaign_id') = ?1`).bind(camp.campaign_id).all()).results.map((r) => r.t);
    const hits = mine.filter((k) => negativeBlocks({ text, match }, k));
    if (hits.length && !d.anyway) return json({ error: `That would also stop your keyword${hits.length > 1 ? 's' : ''} ${hits.slice(0, 3).map((k) => `“${k}”`).join(', ')}.`, conflicts: hits }, 409);
    await env.DB.prepare(`INSERT INTO ads_action (type, payload, status, created_at) VALUES ('add_negative', ?1, 'pending', ?2)`)
      .bind(JSON.stringify({ campaign_id: camp.campaign_id, campaign: camp.name, text, match, by: signedInAs(request) }), new Date().toISOString()).run();
    return json({ ok: true });
  }
  if (d.action === 'cancel') {
    const r = await env.DB.prepare(`UPDATE ads_action SET status = 'cancelled' WHERE id = ?1 AND status = 'pending'`).bind(Number(d.id)).run();
    return r.meta.changes ? json({ ok: true }) : json({ error: 'The script has already dealt with that one.' }, 400);
  }
  return json({ error: 'What should happen?' }, 400);
}
