// Client galleries in the studio (MIL Galleries, docs/MIL-Galleries-Phase1-Plan.md).
//   GET  /api/studio/galleries                 -> { galleries: [...] } with photo counts
//   POST /api/studio/galleries { name, type?, event_date?, venue?, spouse_a?, spouse_b?, client_id?, job_id?, source? } -> { id, slug }
import { json } from '../../../../functions-lib/studio.js';
import { createGallery } from '../../../../functions-lib/galleries.js';

export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare(`SELECT g.*, (SELECT count(*) FROM gallery_images i WHERE i.gallery_id = g.id) photos,
      (SELECT count(*) FROM gallery_images i WHERE i.gallery_id = g.id AND i.status = 'ready') ready,
      (SELECT COALESCE(SUM(bytes), 0) FROM gallery_images i WHERE i.gallery_id = g.id) bytes
    FROM photo_galleries g ORDER BY COALESCE(g.event_date, substr(g.created_at, 1, 10)) DESC`).all();
  return json({ galleries: rows.results });
}

export async function onRequestPost({ request, env }) {
  try {
    return json(await createGallery(env, await request.json().catch(() => ({}))));
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
