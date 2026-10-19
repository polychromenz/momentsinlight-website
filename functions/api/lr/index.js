// The MIL Galleries Lightroom plugin (lightroom/MILGalleries.lrplugin) talks to this. It can't
// sign in through Cloudflare Access like the studio, so it sends a private key instead (made in
// Studio > Galleries > Defaults; only its SHA-256 is kept, in settings 'lr_key').
//   POST /api/lr { action: 'hello' }                                   check the key
//   POST /api/lr { action: 'gallery', set_id, name, type?, event_date? } find (or make) the gallery for a collection set
//   POST /api/lr { action: 'section', gallery_id, key, name, is_bw, order }
//   POST /api/lr { action: 'image', gallery_id, section_id, lightroom_id, checksum, filename, width, height, sort_order, taken_at? }
//        -> { id, needs: ['original', 'web', 'thumb'] } (nothing if it's already up and unchanged)
//   POST /api/lr { action: 'finish', gallery_id, keep: [lightroom ids] }  -> photos no longer in Lightroom
//   POST /api/lr { action: 'layout', gallery_id, cover?, heroes? }      cover photo and big photos, by lightroom_id
//   POST /api/lr { action: 'remove', gallery_id, ids }
//   PUT  /api/lr/file?id=…&size=original|web|thumb   (body: the JPEG)
import { json } from '../../../functions-lib/studio.js';
import { createGallery, addSection, registerImage, TYPES } from '../../../functions-lib/galleries.js';
import { createLink, deleteImages } from '../../../functions-lib/gallery-access.js';

export async function lrAllowed(request, env) {
  const key = request.headers.get('x-mil-key') || '';
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'lr_key'`).first();
  if (!key || !row) return false;
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return JSON.parse(row.value).hash === hash;
}

export async function onRequestPost({ request, env }) {
  if (!(await lrAllowed(request, env))) return json({ error: 'The Lightroom key isn’t right. Make a new one in Studio > Galleries > Defaults and paste it into the plugin’s settings.' }, 401);
  const d = await request.json().catch(() => ({}));
  const db = env.DB;
  try {
    if (d.action === 'hello') return json({ ok: true });
    if (d.action === 'gallery') {
      const set = String(d.set_id ?? '');
      if (!set) return json({ error: 'Which collection set?' }, 400);
      let g = await db.prepare(`SELECT id, slug, name, status FROM photo_galleries WHERE json_extract(settings, '$.lr_set') = ?1`).bind(set).first();
      if (!g) {
        const made = await createGallery(env, { name: d.name, type: TYPES.includes(d.type) ? d.type : 'Wedding', event_date: d.event_date, source: d.source === 'pictime' ? 'pictime' : 'lightroom' });
        await db.prepare(`UPDATE photo_galleries SET settings = json_set(settings, '$.lr_set', ?2) WHERE id = ?1`).bind(made.id, set).run();
        await createLink(env, made.id, { kind: 'main_client', name: d.name });
        g = { id: made.id, slug: made.slug, name: d.name, status: 'draft', made: true };
      }
      return json({ ...g, studio: `https://www.momentsinlight.co.nz/studio/gallery?id=${g.id}` });
    }
    const g = await db.prepare('SELECT id FROM photo_galleries WHERE id = ?1').bind(String(d.gallery_id ?? '')).first();
    if (!g) return json({ error: 'That gallery isn’t in the studio any more.' }, 404);
    if (d.action === 'section') {
      const id = await addSection(env, g.id, { name: d.name, is_bw: d.is_bw, source_key: `lr:${d.key}` });
      if (Number.isFinite(Number(d.order))) await db.prepare('UPDATE gallery_sections SET sort_order = ?2 WHERE id = ?1').bind(id, Number(d.order)).run();
      return json({ id });
    }
    if (d.action === 'image') {
      const before = await db.prepare('SELECT id, checksum, status FROM gallery_images WHERE gallery_id = ?1 AND lightroom_id = ?2').bind(g.id, String(d.lightroom_id)).first();
      const r = await registerImage(env, g.id, d);
      const same = before && before.checksum === (d.checksum ?? null) && before.status === 'ready';
      if (before && !same) await db.prepare(`UPDATE gallery_images SET has_original = 0, has_web = 0, has_thumb = 0, status = 'uploading' WHERE id = ?1`).bind(r.id).run();
      return json({ id: r.id, needs: same ? [] : ['original', 'web', 'thumb'] });
    }
    if (d.action === 'finish') {
      const keep = new Set((d.keep ?? []).map(String));
      const extra = (await db.prepare('SELECT id, filename, lightroom_id FROM gallery_images WHERE gallery_id = ?1 AND lightroom_id IS NOT NULL').bind(g.id).all()).results
        .filter((i) => !i.lightroom_id.startsWith('file:') && !keep.has(i.lightroom_id));
      const counts = await db.prepare(`SELECT count(*) n, sum(status = 'ready') ready FROM gallery_images WHERE gallery_id = ?1`).bind(g.id).first();
      return json({ extra: extra.map(({ id, filename }) => ({ id, filename })), photos: counts.n, ready: counts.ready });
    }
    if (d.action === 'list') {
      // A gallery's photos (to redo their web copies from the originals on Tony's PC).
      const rows = (await db.prepare(`SELECT i.id, i.filename, s.name section, s.is_bw FROM gallery_images i LEFT JOIN gallery_sections s ON s.id = i.section_id
        WHERE i.gallery_id = ?1 AND i.status = 'ready' ORDER BY i.id`).bind(g.id).all()).results;
      return json({ images: rows });
    }
    if (d.action === 'layout') {
      // The cover and the big photos (from Pic-Time when a gallery is moved across), by lightroom_id.
      const idOf = async (lr) => (await db.prepare('SELECT id FROM gallery_images WHERE gallery_id = ?1 AND lightroom_id = ?2').bind(g.id, String(lr)).first())?.id ?? null;
      const cover = d.cover ? await idOf(d.cover) : null;
      if (cover) await db.prepare('UPDATE photo_galleries SET cover_image_id = ?2 WHERE id = ?1').bind(g.id, cover).run();
      const heroes = (await Promise.all((d.heroes ?? []).map(idOf))).filter(Boolean);
      if (heroes.length) await db.batch(heroes.map((id) => db.prepare('UPDATE gallery_images SET is_hero = 1 WHERE id = ?1').bind(id)));
      return json({ cover: !!cover, heroes: heroes.length });
    }
    if (d.action === 'remove') return json({ removed: await deleteImages(env, g.id, (d.ids ?? []).map(String)) });
    return json({ error: 'What should happen?' }, 400);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
