// Adding photos to a gallery (the studio importer; the Lightroom plugin uses the same steps).
//   POST /api/studio/galleries/photos { action: 'section', gallery_id, name, is_bw?, source_key? } -> { id }
//   POST /api/studio/galleries/photos { action: 'image', gallery_id, section_id, filename, width, height,
//                                       sort_order, lightroom_id?, checksum?, taken_at? }  -> { id, existing }
//   PUT  /api/studio/galleries/photos?id=…&size=original|web|thumb   (body: the JPEG)   -> { size, bytes }
import { json } from '../../../../functions-lib/studio.js';
import { addSection, registerImage, storeFile } from '../../../../functions-lib/galleries.js';

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  try {
    const g = await env.DB.prepare('SELECT id FROM photo_galleries WHERE id = ?1').bind(String(d.gallery_id ?? '')).first();
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
