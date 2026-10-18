// Ad picks: gallery photos Tony marks for Google Ads (migrations/0032_photo_picks.sql). The studio
// suggests crops, Tony approves or nudges them, the browser makes the files from the web-size photo,
// and the Ads Script adds approved images to the campaign (scripts/google-ads/sync.js, 'add_image').
import { webUrl, PHOTOS } from './galleries.js';

export const SIZES = { wide: { ratio: 1.91, w: 1200, h: 628 }, square: { ratio: 1, w: 1200, h: 1200 } };
export const pickFileKey = (id, kind) => `ads/pick-${id}-${kind}.jpg`;
export const pickFileUrl = (id, kind, v = '') => `${PHOTOS}/${pickFileKey(id, kind)}${v ? `?v=${v}` : ''}`;

/** A first suggestion: as much of the photo as fits, a little above centre (faces sit high in most frames). */
export function suggestCrop(width, height, ratio) {
  const r = (width || 3) / (height || 2);
  if (r > ratio) { const w = ratio / r; return { x: (1 - w) / 2, y: 0, w, h: 1 }; }
  const h = r / ratio;
  return { x: 0, y: (1 - h) * (r < 1 ? 0.25 : 0.3), w: 1, h };
}

/** Why this gallery's photos can't go in ads, or null if they can. */
export async function adsBlocked(db, galleryId) {
  const row = await db.prepare(`SELECT c.first_name, c.last_name, c.ads_ok FROM photo_galleries g
      LEFT JOIN jobs j ON j.id = g.job_id
      JOIN clients c ON c.id = COALESCE(g.client_id, j.client_id) WHERE g.id = ?1`).bind(galleryId).first();
  return row && !row.ads_ok ? `${`${row.first_name} ${row.last_name}`.trim()}’s contract says no ads.` : null;
}

/** The Search campaign ads go to: the enabled one that's spent the most. */
export async function adsCampaign(db) {
  return db.prepare(`SELECT c.campaign_id, c.name FROM ads_campaign c LEFT JOIN ads_campaign_daily d ON d.campaign_id = c.campaign_id
      WHERE c.status = 'ENABLED' AND c.channel_type = 'SEARCH' GROUP BY c.campaign_id ORDER BY COALESCE(SUM(d.cost_cents), 0) DESC LIMIT 1`).first();
}

/** Everything picked, with what's needed to show and crop it, and how added ones are doing in Google. */
export async function listPicks(env) {
  const db = env.DB;
  const rows = (await db.prepare(`SELECT p.*, i.width, i.height, i.filename, g.name gallery FROM photo_picks p
      JOIN gallery_images i ON i.id = p.image_id JOIN photo_galleries g ON g.id = p.gallery_id
      WHERE p.purpose = 'ads' ORDER BY p.id DESC`).all()).results;
  const stats = new Map((await db.prepare(`SELECT json_extract(data, '$.asset_id') a, json_extract(data, '$.impressions') i, json_extract(data, '$.clicks') c
      FROM ads_entity WHERE kind = 'image' AND json_extract(data, '$.level') = 'campaign'`).all()).results.map((r) => [String(r.a), r]));
  const blocked = new Map();
  for (const r of rows) if (!blocked.has(r.gallery_id)) blocked.set(r.gallery_id, await adsBlocked(db, r.gallery_id));
  const stat = (a) => { const s = a && stats.get(String(a).split('/').pop()); return s ? { impressions: Number(s.i || 0), clicks: Number(s.c || 0) } : null; };
  return rows.map((r) => ({
    id: r.id, image_id: r.image_id, gallery_id: r.gallery_id, gallery: r.gallery, filename: r.filename, width: r.width, height: r.height,
    thumb: webUrl(r.gallery_id, r.image_id, 'thumb'), status: r.status, error: r.error, created_at: r.created_at, added_at: r.added_at,
    crop_wide: r.crop_wide ? JSON.parse(r.crop_wide) : suggestCrop(r.width, r.height, SIZES.wide.ratio),
    crop_square: r.crop_square ? JSON.parse(r.crop_square) : null,
    square_suggestion: suggestCrop(r.width, r.height, SIZES.square.ratio),
    files: r.status === 'picked' ? null : { wide: pickFileUrl(r.id, 'wide', r.approved_at?.slice(11, 19).replace(/:/g, '')), square: r.crop_square ? pickFileUrl(r.id, 'square', r.approved_at?.slice(11, 19).replace(/:/g, '')) : null },
    stats: { wide: stat(r.asset_wide), square: stat(r.asset_square) },
    blocked: blocked.get(r.gallery_id),
  }));
}

/** Image assets on the campaign now (Google allows 20). */
export async function campaignImageCount(db, campaignId) {
  const r = await db.prepare(`SELECT count(*) n FROM ads_entity WHERE kind = 'image' AND json_extract(data, '$.level') = 'campaign'
      AND json_extract(data, '$.owner') = ?1 AND json_extract(data, '$.field') = 'AD_IMAGE' AND json_extract(data, '$.status') = 'ENABLED'`).bind(String(campaignId)).first();
  const waiting = await db.prepare(`SELECT count(*) n FROM ads_action WHERE type = 'add_image' AND status = 'pending'`).first();
  return { now: r?.n ?? 0, waiting: waiting?.n ?? 0, limit: 20 };
}
