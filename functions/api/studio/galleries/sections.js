// A gallery's sections (Ceremony, Ceremony B+W…).
//   PUT    /api/studio/galleries/sections { gallery_id, id, name?, is_bw?, hidden? }
//   PUT    /api/studio/galleries/sections { gallery_id, order: [ids] }
//   DELETE /api/studio/galleries/sections { gallery_id, id }   (the section and its photos)
import { json } from '../../../../functions-lib/studio.js';
import { deleteImages } from '../../../../functions-lib/gallery-access.js';

const galleryOf = (env, id) => env.DB.prepare('SELECT id FROM photo_galleries WHERE id = ?1').bind(String(id ?? '')).first();

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const g = await galleryOf(env, d.gallery_id);
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const db = env.DB;
  if (Array.isArray(d.order)) {
    await db.batch(d.order.map((id, n) => db.prepare('UPDATE gallery_sections SET sort_order = ?3 WHERE id = ?1 AND gallery_id = ?2').bind(Number(id), g.id, n)));
    return json({ ok: true });
  }
  const sets = [], vals = [];
  if (d.name !== undefined) {
    const name = String(d.name).trim().slice(0, 80);
    if (!name) return json({ error: 'The section needs a name.' }, 400);
    sets.push('name'); vals.push(name);
  }
  if (d.is_bw !== undefined) { sets.push('is_bw'); vals.push(d.is_bw ? 1 : 0); }
  if (d.hidden !== undefined) { sets.push('hidden'); vals.push(d.hidden ? 1 : 0); }
  if (sets.length) await db.prepare(`UPDATE gallery_sections SET ${sets.map((c, n) => `${c} = ?${n + 3}`).join(', ')} WHERE id = ?1 AND gallery_id = ?2`).bind(Number(d.id), g.id, ...vals).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const g = await galleryOf(env, d.gallery_id);
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const ids = (await env.DB.prepare('SELECT id FROM gallery_images WHERE gallery_id = ?1 AND section_id = ?2').bind(g.id, Number(d.id)).all()).results.map((r) => r.id);
  if (ids.length) await deleteImages(env, g.id, ids);
  await env.DB.prepare('DELETE FROM gallery_sections WHERE id = ?1 AND gallery_id = ?2').bind(Number(d.id), g.id).run();
  return json({ ok: true, deleted: ids.length });
}
