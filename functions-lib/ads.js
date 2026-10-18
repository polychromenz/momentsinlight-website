// Ads & SEO command centre (docs/MIL-Ads-SEO-Command-Centre-Spec.md).
// Google Ads data comes from Tony's Ads Script (scripts/google-ads/sync.js). Each request is
// signed: X-Timestamp and X-Signature = hex HMAC-SHA256(secret, timestamp + "." + body). The
// secret is made in Studio > SEO > Ads and kept encrypted in settings ('ads_sync').
import { encrypt, decrypt } from './gmail.js';
import { gscReady, property, gscQuery } from './seo.js';
import { reportsFor } from './ads-reports.js';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function newSyncSecret(env) {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const secret = `ads_${[...crypto.getRandomValues(new Uint8Array(40))].map((b) => abc[b % abc.length]).join('')}`;
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('ads_sync', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify({ secret: await encrypt(env, secret), at: now }), now).run();
  return secret;
}

/** The current key (for copying the latest script without changing the key). */
export async function currentSyncSecret(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'ads_sync'`).first();
  return row ? decrypt(env, JSON.parse(row.value).secret) : null;
}

/** Is this request from the Ads Script? Returns the body text, or null. */
export async function scriptRequest(request, env) {
  const body = await request.text();
  if (body.length > 2_000_000) return null;
  const ts = Number(request.headers.get('x-timestamp'));
  const sig = (request.headers.get('x-signature') || '').toLowerCase();
  if (!ts || !sig || Math.abs(Date.now() - ts) > 15 * 60_000) return null;
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'ads_sync'`).first();
  if (!row) return null;
  const secret = await decrypt(env, JSON.parse(row.value).secret);
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${body}`)));
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? body : null;
}

/** What the script should do this run: export (and how many days), and negatives Tony approved in the studio. */
export async function scriptState(env) {
  const last = await env.DB.prepare(`SELECT max(run_at) at FROM ads_import_log WHERE ok = 1 AND report = 'done'`).first();
  const first = !last?.at;
  // Asked for from the studio (Send everything on the next run), or a day since the last export.
  const force = await env.DB.prepare("SELECT 1 FROM settings WHERE key = 'ads_force'").first();
  const due = first || !!force || Date.now() - Date.parse(last.at) > 20 * 3600_000;
  const actions = (await env.DB.prepare(`SELECT id, type, payload FROM ads_action WHERE status = 'pending' AND type IN ('add_negative', 'add_image') ORDER BY id LIMIT 20`).all()).results
    .map((a) => {
      const p = JSON.parse(a.payload);
      // Only what the script needs (it checks these again).
      return { id: a.id, type: a.type, payload: a.type === 'add_image' ? { campaign_id: p.campaign_id, url: p.url, name: p.name } : { campaign_id: p.campaign_id, text: p.text, match: p.match } };
    });
  return { export_due: due, days: first ? 90 : 30, actions, reports: due ? await reportsFor(env.DB) : [] };
}

// ---- Negative keywords: what's blocked, and searches worth blocking ----
const words = (s) => s.split(/\s+/).filter(Boolean);
const cleanKw = (s) => String(s ?? '').toLowerCase().replace(/[+"[\]]/g, '').trim();
/** Whether a negative keyword stops a search, by Google's rules for each match type. */
export function negativeBlocks(neg, search) {
  const q = cleanKw(search), t = cleanKw(neg.text);
  if (neg.match === 'EXACT') return q === t;
  if (neg.match === 'PHRASE') return ` ${q} `.includes(` ${t} `);
  const qw = words(q);
  return words(t).every((w) => qw.includes(w));
}
/** A campaign's negatives: its own, its ad groups', its shared lists', and ones approved but not yet added. */
export async function campaignNegatives(db, campaignId) {
  const id = String(campaignId);
  const rows = (await db.prepare(`SELECT json_extract(data, '$.text') text, json_extract(data, '$.match') AS "match" FROM ads_entity
      WHERE (kind = 'campaign_negative' AND json_extract(data, '$.campaign_id') = ?1)
        OR (kind = 'keyword' AND json_extract(data, '$.negative') = 1 AND json_extract(data, '$.campaign_id') = ?1)
        OR (kind = 'shared_negative' AND json_extract(data, '$.list') IN (SELECT json_extract(data, '$.list') FROM ads_entity WHERE kind = 'shared_list_use' AND json_extract(data, '$.campaign_id') = ?1))
    UNION ALL SELECT json_extract(payload, '$.text'), json_extract(payload, '$.match') FROM ads_action
      WHERE type = 'add_negative' AND status IN ('pending', 'done') AND json_extract(payload, '$.campaign_id') = ?1`).bind(id).all()).results;
  return rows.filter((r) => r.text);
}
/** Searches since a date that cost money and brought no enquiry, aren't one of your keywords, and aren't blocked yet. */
export async function blockSuggestions(db, since, minCents = 200, until = '9999-12-31') {
  const terms = (await db.prepare(`SELECT t.campaign_id, c.name campaign, t.search_term, SUM(t.cost_cents) cost, SUM(t.clicks) clicks, SUM(t.impressions) impressions
      FROM ads_search_term_daily t LEFT JOIN ads_campaign c ON c.campaign_id = t.campaign_id
      WHERE t.date BETWEEN ?1 AND ?2 GROUP BY t.campaign_id, t.search_term HAVING SUM(t.conversions) = 0 AND SUM(t.cost_cents) >= ?3
      ORDER BY cost DESC LIMIT 200`).bind(since, until, minCents).all()).results;
  const mine = new Set((await db.prepare(`SELECT lower(json_extract(data, '$.text')) t FROM ads_entity WHERE kind = 'keyword' AND json_extract(data, '$.negative') = 0`).all()).results.map((r) => r.t));
  const negs = new Map();
  const out = [];
  for (const t of terms) {
    if (mine.has(t.search_term)) continue;
    if (!negs.has(t.campaign_id)) negs.set(t.campaign_id, await campaignNegatives(db, t.campaign_id));
    if (negs.get(t.campaign_id).some((n) => negativeBlocks(n, t.search_term))) continue;
    out.push(t);
  }
  return out;
}

/** What a negative keyword may look like: plain words only (the script checks this again). */
export const NEGATIVE_OK = /^[a-z0-9][a-z0-9 '&.-]{0,79}$/i;

const cents = (micros) => Math.round(Number(micros || 0) / 10_000);
const num = (v) => (v === null || v === undefined || v === '' || v === '--' ? null : Number(String(v).replace(/[^0-9.-]/g, '')));

/** Store one chunk of a report. rows are shaped by the script (see scripts/google-ads/sync.js). */
export async function ingest(env, report, rows) {
  const db = env.DB;
  const now = new Date().toISOString();
  let stmts = [];
  if (report === 'campaigns') {
    stmts = rows.map((r) => db.prepare(`INSERT OR REPLACE INTO ads_campaign (campaign_id, name, status, channel_type, channel_sub_type, bidding, search_network, partner_network, display_network, geo_target_type, budget_cents, start_date, data, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`)
      .bind(String(r.id), r.name ?? '', r.status ?? null, r.channel ?? null, r.sub ?? null, r.bidding ?? null, r.search ? 1 : 0, r.partners ? 1 : 0, r.display ? 1 : 0,
        r.geo ?? null, cents(r.budget_micros), r.start ?? null, JSON.stringify(r.data ?? {}), now));
  } else if (report === 'campaign_daily') {
    stmts = rows.map((r) => db.prepare(`INSERT OR REPLACE INTO ads_campaign_daily (date, campaign_id, cost_cents, impressions, clicks, conversions, conversion_value, search_impression_share, lost_is_budget, lost_is_rank)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
      .bind(r.date, String(r.campaign_id), cents(r.cost_micros), Number(r.impressions || 0), Number(r.clicks || 0), Number(r.conversions || 0), Number(r.value || 0), num(r.is), num(r.lost_budget), num(r.lost_rank)));
  } else if (report === 'keyword_daily') {
    stmts = rows.map((r) => db.prepare(`INSERT OR REPLACE INTO ads_keyword_daily (date, campaign_id, ad_group_id, criterion_id, text, match_type, status, quality_score, cost_cents, impressions, clicks, conversions)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`)
      .bind(r.date, String(r.campaign_id), String(r.ad_group_id), String(r.criterion_id), r.text ?? '', r.match ?? null, r.status ?? null, num(r.qs), cents(r.cost_micros), Number(r.impressions || 0), Number(r.clicks || 0), Number(r.conversions || 0)));
  } else if (report === 'search_term_daily') {
    stmts = rows.map((r) => db.prepare(`INSERT OR REPLACE INTO ads_search_term_daily (date, campaign_id, ad_group_id, search_term, matched_keyword, match_type, cost_cents, impressions, clicks, conversions)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
      .bind(r.date, String(r.campaign_id), String(r.ad_group_id ?? ''), String(r.term ?? '').toLowerCase(), r.keyword ?? '', r.match ?? null, cents(r.cost_micros), Number(r.impressions || 0), Number(r.clicks || 0), Number(r.conversions || 0)));
  } else if (report.startsWith('entity:')) {
    const kind = report.slice(7);
    stmts = rows.map((r) => db.prepare('INSERT OR REPLACE INTO ads_entity (kind, id, data, updated_at) VALUES (?1, ?2, ?3, ?4)').bind(kind, String(r.id), JSON.stringify(r), now));
  } else if (report === 'actions') {
    // What happened to the approved changes: [{ id, ok, error, asset? }].
    stmts = rows.map((r) => db.prepare(`UPDATE ads_action SET status = ?2, applied_at = ?3, error = ?4, payload = json_set(payload, '$.asset', ?5) WHERE id = ?1 AND status = 'pending'`)
      .bind(Number(r.id), r.ok ? 'done' : 'failed', now, r.ok ? null : String(r.error ?? '').slice(0, 300), r.asset ? String(r.asset).slice(0, 200) : null));
    // Ad picks: note the Google asset, and the pick is added once all its files are in (or failed if one wasn't).
    for (const r of rows) {
      const a = await db.prepare(`SELECT payload FROM ads_action WHERE id = ?1 AND type = 'add_image'`).bind(Number(r.id)).first();
      if (!a) continue;
      const p = JSON.parse(a.payload);
      if (r.ok) stmts.push(db.prepare(`UPDATE photo_picks SET ${p.kind === 'square' ? 'asset_square' : 'asset_wide'} = ?2 WHERE id = ?1`).bind(Number(p.pick_id), String(r.asset ?? '')));
      else stmts.push(db.prepare(`UPDATE photo_picks SET status = 'failed', error = ?2 WHERE id = ?1`).bind(Number(p.pick_id), String(r.error ?? '').slice(0, 300)));
    }
    // Fetch the account again on the next run, so the studio's lists show the change.
    if (rows.some((r) => r.ok)) stmts.push(db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ads_force', '1', ?1) ON CONFLICT (key) DO UPDATE SET updated_at = ?1").bind(now));
    stmts.push(db.prepare(`UPDATE photo_picks SET status = 'added', added_at = ?1 WHERE status = 'approved' AND NOT EXISTS (
      SELECT 1 FROM ads_action a WHERE a.type = 'add_image' AND json_extract(a.payload, '$.pick_id') = photo_picks.id AND a.status <> 'done')`).bind(now));
  } else if (report === 'done') {
    await db.prepare("DELETE FROM settings WHERE key = 'ads_force'").run();
    // The end of an export: lists that were sent in full replace what was there.
    for (const kind of rows.map(String)) await db.prepare('DELETE FROM ads_entity WHERE kind = ?1 AND updated_at < ?2').bind(kind, new Date(Date.now() - 6 * 3600_000).toISOString()).run();
  } else throw new Error(`Unknown report ${report}`);
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  await db.prepare('INSERT INTO ads_import_log (run_at, report, rows_received, ok) VALUES (?1, ?2, ?3, 1)').bind(now, report, rows.length).run();
  return { ok: true, stored: stmts.length };
}

// ---- Search Console, kept day by day (query x page) ----
const isoDay = (d) => d.toISOString().slice(0, 10);
/** Daily: re-pull the last 10 days (Search Console revises them), and the first time, 90 days, a few days a run. */
export async function gscSync(env) {
  if (!(await gscReady(env.DB))) return 'not connected';
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'gsc_sync'`).first();
  const st = row ? JSON.parse(row.value) : { backfilled_to: null, last: null };
  const today = isoDay(new Date());
  const days = [];
  if (st.last !== today) for (let n = 2; n <= 11; n++) days.push(isoDay(new Date(Date.now() - n * 86400_000)));
  // Backfill older days, 10 per run, back to 90 days ago.
  const oldest = isoDay(new Date(Date.now() - 92 * 86400_000));
  let back = st.backfilled_to ?? isoDay(new Date(Date.now() - 12 * 86400_000));
  for (let k = 0; k < 10 && back > oldest; k++) { days.push(back); back = isoDay(new Date(Date.parse(back) - 86400_000)); }
  if (!days.length) return 'up to date';
  const prop = await property(env);
  let rows = 0;
  for (const day of days) {
    const got = await gscQuery(env, prop, { startDate: day, endDate: day, dimensions: ['query', 'page'], rowLimit: 5000 });
    const stmts = [env.DB.prepare('DELETE FROM gsc_query_daily WHERE date = ?1').bind(day),
      ...got.map((r) => env.DB.prepare('INSERT OR REPLACE INTO gsc_query_daily (date, query, page, clicks, impressions, ctr, position) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
        .bind(day, r.keys[0], r.keys[1], r.clicks, r.impressions, r.ctr, r.position))];
    for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
    rows += got.length;
  }
  const next = { backfilled_to: back, last: today };
  await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('gsc_sync', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`).bind(JSON.stringify(next), new Date().toISOString()).run();
  return `${days.length} days, ${rows} rows`;
}
