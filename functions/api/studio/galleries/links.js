// Who can see a gallery: links for the couple, invited people and guests.
//   GET    /api/studio/galleries/links?gallery_id=…   -> { links: [...] } each with its address and visitors
//   POST   /api/studio/galleries/links { gallery_id, kind, name?, email?, access_code?, visible_section_ids?, watermark?, downloads?, require_email?, expires_at? }
//   PUT    /api/studio/galleries/links { id, ...same fields }
//   POST   /api/studio/galleries/links { action: 'vendor', gallery_id, link_id? | name, image_ids, replace? }
//          a vendor link's photos: added to (or replacing) its list; a new link is made with a name
//   DELETE /api/studio/galleries/links { id }
import { json } from '../../../../functions-lib/studio.js';
import { createLink, linkValues, linkUrl, LINK_KINDS } from '../../../../functions-lib/gallery-access.js';

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('gallery_id') ?? '';
  const g = await env.DB.prepare('SELECT id, slug FROM photo_galleries WHERE id = ?1').bind(id).first();
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const links = (await env.DB.prepare(`SELECT l.*, (SELECT count(*) FROM gallery_viewers v WHERE v.link_id = l.id AND v.role <> 'studio') visitors,
      (SELECT max(last_seen) FROM gallery_viewers v WHERE v.link_id = l.id AND v.role <> 'studio') last_seen,
      (SELECT count(*) FROM gallery_list_items i WHERE i.list_id = l.list_id) photos
    FROM gallery_links l WHERE l.gallery_id = ?1 AND l.kind IN ('main_client', 'invited', 'guest', 'vendor') ORDER BY l.id`).bind(g.id).all()).results;
  return json({
    kinds: LINK_KINDS,
    code_url: linkUrl(g.slug),
    links: links.map((l) => ({ ...l, url: linkUrl(g.slug, l.token), visible_section_ids: l.visible_section_ids ? JSON.parse(l.visible_section_ids) : null })),
  });
}

const codeTaken = (env, galleryId, code, exceptId = 0) => code
  ? env.DB.prepare('SELECT 1 FROM gallery_links WHERE gallery_id = ?1 AND lower(access_code) = lower(?2) AND id <> ?3').bind(galleryId, code, exceptId).first()
  : null;

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const g = await env.DB.prepare('SELECT id FROM photo_galleries WHERE id = ?1').bind(String(d.gallery_id ?? '')).first();
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  if (d.action === 'vendor') return vendorPhotos(env, g, d);
  if (await codeTaken(env, g.id, String(d.access_code ?? '').trim())) return json({ error: 'Another link already uses that code.' }, 400);
  return json({ id: await createLink(env, g.id, d) });
}

/** A vendor link's photos live in a list of their own (gallery_lists kind 'vendor'). */
async function vendorPhotos(env, g, d) {
  const db = env.DB;
  const now = new Date().toISOString();
  let link = d.link_id ? await db.prepare(`SELECT * FROM gallery_links WHERE id = ?1 AND gallery_id = ?2 AND kind = 'vendor'`).bind(Number(d.link_id), g.id).first() : null;
  if (!link) {
    const name = String(d.name ?? '').trim().slice(0, 80);
    if (!name) return json({ error: 'Who is it for? (e.g. the venue’s name)' }, 400);
    const id = await createLink(env, g.id, { kind: 'vendor', name });
    link = await db.prepare('SELECT * FROM gallery_links WHERE id = ?1').bind(id).first();
  }
  if (!link.list_id) {
    const l = await db.prepare(`INSERT INTO gallery_lists (gallery_id, name, kind, created_at) VALUES (?1, ?2, 'vendor', ?3) RETURNING id`).bind(g.id, `Vendor: ${link.name}`, now).first();
    await db.prepare('UPDATE gallery_links SET list_id = ?2 WHERE id = ?1').bind(link.id, l.id).run();
    link.list_id = l.id;
  }
  const ids = (Array.isArray(d.image_ids) ? d.image_ids : []).map(String);
  const valid = (await db.prepare('SELECT id FROM gallery_images WHERE gallery_id = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(g.id, JSON.stringify(ids)).all()).results.map((r) => r.id);
  await db.batch([
    ...(d.replace ? [db.prepare('DELETE FROM gallery_list_items WHERE list_id = ?1').bind(link.list_id)] : []),
    ...valid.map((id) => db.prepare('INSERT OR IGNORE INTO gallery_list_items (list_id, image_id, added_at) VALUES (?1, ?2, ?3)').bind(link.list_id, id, now)),
  ]);
  const n = (await db.prepare('SELECT count(*) n FROM gallery_list_items WHERE list_id = ?1').bind(link.list_id).first()).n;
  return json({ id: link.id, name: link.name, photos: n });
}

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const l = await env.DB.prepare('SELECT * FROM gallery_links WHERE id = ?1').bind(Number(d.id)).first();
  if (!l) return json({ error: 'That link doesn’t exist.' }, 404);
  const v = linkValues(d, l.kind, l);
  if (await codeTaken(env, l.gallery_id, v.access_code, l.id)) return json({ error: 'Another link already uses that code.' }, 400);
  await env.DB.prepare(`UPDATE gallery_links SET name = ?2, email = ?3, access_code = ?4, visible_section_ids = ?5, watermark = ?6, downloads = ?7, allow_lists = ?8, require_email = ?9, expires_at = ?10 WHERE id = ?1`)
    .bind(l.id, v.name, v.email, v.access_code, v.visible_section_ids, v.watermark, v.downloads, v.allow_lists, v.require_email, v.expires_at).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const d = await request.json().catch(() => ({}));
  await env.DB.prepare('DELETE FROM gallery_links WHERE id = ?1').bind(Number(d.id)).run();
  return json({ ok: true });
}
