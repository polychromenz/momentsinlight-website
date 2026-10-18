// Adding and arranging photos in a gallery (the studio importer and gallery page; the Lightroom plugin uses the same steps).
//   POST   /api/studio/galleries/photos { action: 'section', gallery_id, name, is_bw?, source_key? } -> { id }
//   POST   /api/studio/galleries/photos { action: 'image', gallery_id, section_id, filename, width, height,
//                                         sort_order, lightroom_id?, checksum?, taken_at? }  -> { id, existing }
//   PUT    /api/studio/galleries/photos?id=…&size=original|web|thumb   (body: the JPEG)   -> { size, bytes }
//   PATCH  /api/studio/galleries/photos { gallery_id, ids, set: { hidden?, is_hero?, section_id? } }
//   PATCH  /api/studio/galleries/photos { gallery_id, section_id, order: [ids] }   (this section's photos, in order)
//   DELETE /api/studio/galleries/photos { gallery_id, ids }   (photos and their files)
import { json } from '../../../../functions-lib/studio.js';
import { addSection, registerImage, storeFile } from '../../../../functions-lib/galleries.js';
import { deleteImages } from '../../../../functions-lib/gallery-access.js';

const galleryOf = (env, id) => env.DB.prepare('SELECT id FROM photo_galleries WHERE id = ?1').bind(String(id ?? '')).first();
const touch = (env, id) => env.DB.prepare('UPDATE photo_galleries SET updated_at = ?2 WHERE id = ?1').bind(id, new Date().toISOString());

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  try {
    const g = await galleryOf(env, d.gallery_id);
    if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
    if (d.action === 'section') return json({ id: await addSection(env, g.id, d) });
    if (d.action === 'image') return json(await registerImage(env, g.id, d));
    return json({ error: 'What should happen?' }, 400);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestPut({ request, env }) {
  const u = new URL(request.url);
  try {
    return json(await storeFile(env, u.searchParams.get('id') ?? '', u.searchParams.get('size') ?? '', request));
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestPatch({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const g = await galleryOf(env, d.gallery_id);
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const db = env.DB;
  if (Array.isArray(d.order)) {
    const sec = await db.prepare('SELECT id FROM gallery_sections WHERE id = ?1 AND gallery_id = ?2').bind(Number(d.section_id), g.id).first();
    if (!sec) return json({ error: 'That section doesn’t exist.' }, 404);
    const stmts = d.order.map((id, n) => db.prepare('UPDATE gallery_images SET section_id = ?3, sort_order = ?4 WHERE id = ?1 AND gallery_id = ?2').bind(String(id), g.id, sec.id, n));
    for (let i = 0; i < stmts.length; i += 400) await db.batch(stmts.slice(i, i + 400));
    await touch(env, g.id).run();
    return json({ ok: true });
  }
  const ids = Array.isArray(d.ids) ? d.ids.map(String) : [];
  const set = d.set ?? {};
  const cols = [], vals = [];
  if (set.hidden !== undefined) { cols.push('hidden'); vals.push(set.hidden ? 1 : 0); }
  if (set.is_hero !== undefined) { cols.push('is_hero'); vals.push(set.is_hero ? 1 : 0); }
  if (set.section_id !== undefined) {
    const sec = await db.prepare('SELECT id FROM gallery_sections WHERE id = ?1 AND gallery_id = ?2').bind(Number(set.section_id), g.id).first();
    if (!sec) return json({ error: 'That section doesn’t exist.' }, 404);
    // Moved photos go to the end of their new section, in the order they were in.
    const end = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 n FROM gallery_images WHERE section_id = ?1').bind(sec.id).first();
    const stmts = ids.map((id, n) => db.prepare('UPDATE gallery_images SET section_id = ?3, sort_order = ?4 WHERE id = ?1 AND gallery_id = ?2').bind(id, g.id, sec.id, end.n + n));
    for (let i = 0; i < stmts.length; i += 400) await db.batch(stmts.slice(i, i + 400));
  }
  if (!ids.length) return json({ error: 'Which photos?' }, 400);
  if (cols.length) {
    await db.prepare(`UPDATE gallery_images SET ${cols.map((c, n) => `${c} = ?${n + 3}`).join(', ')} WHERE gallery_id = ?1 AND id IN (SELECT value FROM json_each(?2))`)
      .bind(g.id, JSON.stringify(ids), ...vals).run();
  }
  await touch(env, g.id).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const g = await galleryOf(env, d.gallery_id);
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const n = await deleteImages(env, g.id, Array.isArray(d.ids) ? d.ids.map(String) : []);
  await touch(env, g.id).run();
  return json({ ok: true, deleted: n });
}
