// Ad picks (functions-lib/picks.js), from the gallery page and SEO > Google Ads.
//   GET  /api/studio/ads/picks                    -> { picks, campaign, images: { now, waiting, limit } }
//   GET  /api/studio/ads/picks?image=<id>         the web-size photo (same origin, so the browser can crop it)
//   POST /api/studio/ads/picks { action: 'toggle', gallery_id, image_id }      pick or unpick a photo
//   POST /api/studio/ads/picks { action: 'pick', gallery_id, image_ids }       pick these (already picked: left as they are)
//   POST /api/studio/ads/picks { action: 'crop', id, crop_wide, crop_square }   nudged crops (square null = none)
//   PUT  /api/studio/ads/picks?id=…&kind=wide|square   (body: the cropped JPEG the browser made)
//   POST /api/studio/ads/picks { action: 'approve', id }   the Ads Script adds the files on its next run
//   POST /api/studio/ads/picks { action: 'remove', id }    forget a pick (doesn't change Google Ads)
import { json } from '../../../../functions-lib/studio.js';
import { fileKey } from '../../../../functions-lib/galleries.js';
import { listPicks, adsBlocked, adsCampaign, campaignImageCount, planSwaps, pickFileKey, pickFileUrl, SIZES } from '../../../../functions-lib/picks.js';

export async function onRequestGet({ request, env }) {
  const image = new URL(request.url).searchParams.get('image');
  if (image) {
    const i = await env.DB.prepare('SELECT gallery_id FROM gallery_images WHERE id = ?1').bind(image).first();
    const obj = i && await env.GALLERY_WEB.get(fileKey(i.gallery_id, image, 'web'));
    if (!obj) return json({ error: 'That photo isn’t here.' }, 404);
    return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
  }
  const campaign = await adsCampaign(env.DB);
  return json({ picks: await listPicks(env), campaign, images: campaign ? await campaignImageCount(env.DB, campaign.campaign_id) : null });
}

const cropOk = (c) => c && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(c[k])) && c.x >= -0.001 && c.y >= -0.001 && c.w > 0.05 && c.h > 0.05 && c.x + c.w <= 1.001 && c.y + c.h <= 1.001;
const clean = (c) => ({ x: +c.x.toFixed(4), y: +c.y.toFixed(4), w: +c.w.toFixed(4), h: +c.h.toFixed(4) });

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const db = env.DB;
  const now = new Date().toISOString();
  if (d.action === 'pick') {
    const gid = String(d.gallery_id ?? '');
    const why = await adsBlocked(db, gid);
    if (why) return json({ error: why }, 400);
    const ids = (Array.isArray(d.image_ids) ? d.image_ids : []).map(String).slice(0, 2000);
    const real = (await db.prepare('SELECT id FROM gallery_images WHERE gallery_id = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(gid, JSON.stringify(ids)).all()).results.map((r) => r.id);
    for (let n = 0; n < real.length; n += 50)
      await db.batch(real.slice(n, n + 50).map((i) => db.prepare(`INSERT INTO photo_picks (image_id, gallery_id, purpose, created_at) SELECT ?1, ?2, 'ads', ?3
        WHERE NOT EXISTS (SELECT 1 FROM photo_picks WHERE image_id = ?1 AND purpose = 'ads')`).bind(i, gid, now)));
    const picked = (await db.prepare(`SELECT image_id, status FROM photo_picks WHERE gallery_id = ?1 AND purpose = 'ads'`).bind(gid).all()).results;
    return json({ picks: Object.fromEntries(picked.map((r) => [r.image_id, r.status === 'added' ? 'added' : 'picked'])) });
  }
  if (d.action === 'toggle') {
    const img = await db.prepare('SELECT id, gallery_id FROM gallery_images WHERE id = ?1 AND gallery_id = ?2').bind(String(d.image_id ?? ''), String(d.gallery_id ?? '')).first();
    if (!img) return json({ error: 'That photo isn’t in this gallery.' }, 404);
    const have = await db.prepare(`SELECT id, status FROM photo_picks WHERE image_id = ?1 AND purpose = 'ads'`).bind(img.id).first();
    if (have) {
      if (have.status === 'approved' || have.status === 'added') return json({ error: 'That one is already going to Google Ads. Remove it in Google Ads (or on the Ad picks page) instead.' }, 400);
      await db.prepare('DELETE FROM photo_picks WHERE id = ?1').bind(have.id).run();
      return json({ picked: false });
    }
    const why = await adsBlocked(db, img.gallery_id);
    if (why) return json({ error: why }, 400);
    await db.prepare(`INSERT INTO photo_picks (image_id, gallery_id, purpose, created_at) VALUES (?1, ?2, 'ads', ?3)`).bind(img.id, img.gallery_id, now).run();
    return json({ picked: true });
  }
  const p = await db.prepare('SELECT * FROM photo_picks WHERE id = ?1').bind(Number(d.id)).first();
  if (!p) return json({ error: 'That pick isn’t here any more.' }, 404);
  if (d.action === 'crop') {
    if (p.status !== 'picked' && p.status !== 'failed') return json({ error: 'That one has already been approved.' }, 400);
    if (!cropOk(d.crop_wide) || (d.crop_square && !cropOk(d.crop_square))) return json({ error: 'That crop doesn’t fit the photo.' }, 400);
    await db.prepare('UPDATE photo_picks SET crop_wide = ?2, crop_square = ?3 WHERE id = ?1')
      .bind(p.id, JSON.stringify(clean(d.crop_wide)), d.crop_square ? JSON.stringify(clean(d.crop_square)) : null).run();
    return json({ ok: true });
  }
  if (d.action === 'approve') {
    if (p.status !== 'picked' && p.status !== 'failed') return json({ error: 'That one has already been approved.' }, 400);
    if (await adsBlocked(db, p.gallery_id)) return json({ error: await adsBlocked(db, p.gallery_id) }, 400);
    const campaign = await adsCampaign(db);
    if (!campaign) return json({ error: 'No Search campaign found yet (the Ads Script sends that).' }, 400);
    const kinds = ['wide', ...(p.crop_square ? ['square'] : [])];
    for (const k of kinds) if (!(await env.GALLERY_WEB.head(pickFileKey(p.id, k)))) return json({ error: `The ${k} file wasn’t made. Try Approve again.` }, 400);
    const count = await campaignImageCount(db, campaign.campaign_id);
    // Full? Swap out the weakest images that have had a fair go (planSwaps has Tony's rules).
    const over = count.now - count.leaving + count.waiting + kinds.length - count.limit;
    const plan = over > 0 ? await planSwaps(db, campaign.campaign_id, over) : { swaps: [] };
    if (over > 0 && plan.swaps.length < over) return json({ error: `The campaign is full (Google allows ${count.limit} images). ${plan.reason} Remove one in Google Ads, or try again later.` }, 400);
    const v = now.slice(11, 19).replace(/:/g, '');
    await db.batch([
      db.prepare(`UPDATE photo_picks SET status = 'approved', approved_at = ?2, error = NULL WHERE id = ?1`).bind(p.id, now),
      ...plan.swaps.map((s) => db.prepare(`INSERT INTO ads_action (type, payload, status, created_at) VALUES ('remove_image', ?1, 'pending', ?2)`)
        .bind(JSON.stringify({ campaign_id: campaign.campaign_id, campaign: campaign.name, asset_id: String(s.asset_id), name: s.name ?? '', views: s.views, clicks: s.clicks, for_pick: p.id }), now)),
      ...kinds.map((k) => db.prepare(`INSERT INTO ads_action (type, payload, status, created_at) VALUES ('add_image', ?1, 'pending', ?2)`)
        .bind(JSON.stringify({ campaign_id: campaign.campaign_id, campaign: campaign.name, url: pickFileUrl(p.id, k, v), name: `MIL pick ${p.id} ${k}`, pick_id: p.id, kind: k }), now)),
    ]);
    return json({ ok: true, swapped: plan.swaps.length });
  }
  if (d.action === 'remove') {
    await db.batch([
      db.prepare(`UPDATE ads_action SET status = 'cancelled' WHERE type = 'add_image' AND status = 'pending' AND json_extract(payload, '$.pick_id') = ?1`).bind(p.id),
      db.prepare('DELETE FROM photo_picks WHERE id = ?1').bind(p.id),
    ]);
    return json({ ok: true });
  }
  return json({ error: 'What should happen?' }, 400);
}

export async function onRequestPut({ request, env }) {
  const u = new URL(request.url);
  const kind = u.searchParams.get('kind');
  if (!SIZES[kind]) return json({ error: 'Wide or square?' }, 400);
  const p = await env.DB.prepare('SELECT id, status FROM photo_picks WHERE id = ?1').bind(Number(u.searchParams.get('id'))).first();
  if (!p) return json({ error: 'That pick isn’t here any more.' }, 404);
  if (p.status !== 'picked' && p.status !== 'failed') return json({ error: 'That one has already been approved.' }, 400);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length < 1000 || bytes.length > 5 * 1048576 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ error: 'That isn’t a JPEG under 5 MB.' }, 400);
  await env.GALLERY_WEB.put(pickFileKey(p.id, kind), bytes, { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=300' } });
  return json({ ok: true, bytes: bytes.length });
}
