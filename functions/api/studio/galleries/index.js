// Client galleries in the studio (MIL Galleries, docs/MIL-Galleries-Phase1-Plan.md).
//   GET  /api/studio/galleries                 -> { galleries: [...] } with photo counts and a cover thumbnail
//   POST /api/studio/galleries { name, type?, event_date?, venue?, spouse_a?, spouse_b?, client_id?, job_id?, source? } -> { id, slug }
import { json } from '../../../../functions-lib/studio.js';
import { createGallery, webUrl, gallerySettings } from '../../../../functions-lib/galleries.js';
import { createLink } from '../../../../functions-lib/gallery-access.js';

export async function onRequestGet({ env }) {
  const rows = (await env.DB.prepare(`SELECT g.*, (SELECT count(*) FROM gallery_images i WHERE i.gallery_id = g.id) photos,
      (SELECT count(*) FROM gallery_images i WHERE i.gallery_id = g.id AND i.status = 'ready') ready,
      (SELECT COALESCE(SUM(bytes), 0) FROM gallery_images i WHERE i.gallery_id = g.id) bytes,
      COALESCE(g.cover_image_id, (SELECT id FROM gallery_images i WHERE i.gallery_id = g.id AND i.status = 'ready' AND i.hidden = 0 ORDER BY is_hero DESC, sort_order LIMIT 1)) cover
    FROM photo_galleries g ORDER BY COALESCE(g.event_date, substr(g.created_at, 1, 10)) DESC`).all()).results;
  return json({
    today: new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }),
    settings: await gallerySettings(env.DB),
    galleries: rows.map(({ settings, ...g }) => ({ ...g, cover: g.cover ? webUrl(g.id, g.cover, 'thumb') : null })),
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const input = await request.json().catch(() => ({}));
    const g = await createGallery(env, input);
    // Every gallery starts with a link for the couple (full-size downloads, no watermark).
    await createLink(env, g.id, { kind: 'main_client', name: String(input.name ?? '').trim() });
    return json(g);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
