// Blog photos from the studio galleries (the post editor's "From a gallery", and the gallery page's
// "B" Blog mark). Chosen photos are copied server side from the gallery's web size (2048px) into
// Cloudflare Images, like a photo uploaded in the editor: fast, resized for phones, and safe if the
// gallery later expires or is deleted. Blog marks live in photo_picks with purpose 'blog'.
//   GET  /api/studio/blog-photos                     -> { galleries: [{ id, name, event_date, photos, blog }] }
//   GET  /api/studio/blog-photos?gallery=ID           -> { gallery, photos: [{ id, thumb, w, h, section, blog }] }
//   POST /api/studio/blog-photos { action: 'mark', gallery_id, image_ids, on? }  -> { on, marked }
//   POST /api/studio/blog-photos { action: 'copy', gallery_id, image_ids (≤6), folder } -> { photos: [{ id, src, width, height }] }
import { json, IMAGES_HASH } from '../../../functions-lib/studio.js';
import { fileKey, webUrl, SIZES } from '../../../functions-lib/galleries.js';

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const gid = new URL(request.url).searchParams.get('gallery');
  if (!gid) {
    const rows = (await db.prepare(`SELECT g.id, g.name, g.event_date, g.status,
        (SELECT count(*) FROM gallery_images i WHERE i.gallery_id = g.id AND i.status = 'ready') photos,
        (SELECT count(*) FROM photo_picks p WHERE p.gallery_id = g.id AND p.purpose = 'blog') blog
      FROM photo_galleries g ORDER BY COALESCE(g.event_date, g.created_at) DESC`).all()).results;
    return json({ galleries: rows.filter((g) => g.photos) });
  }
  const g = await db.prepare('SELECT id, name, event_date FROM photo_galleries WHERE id = ?1').bind(gid).first();
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const [imgs, sections, marks] = await Promise.all([
    db.prepare(`SELECT id, section_id, width, height, web_crc FROM gallery_images WHERE gallery_id = ?1 AND status = 'ready' ORDER BY sort_order, created_at`).bind(gid).all(),
    db.prepare('SELECT id, name FROM gallery_sections WHERE gallery_id = ?1 ORDER BY sort_order, id').bind(gid).all(),
    db.prepare(`SELECT image_id FROM photo_picks WHERE gallery_id = ?1 AND purpose = 'blog'`).bind(gid).all(),
  ]);
  const names = new Map(sections.results.map((s) => [s.id, s.name]));
  const order = new Map(sections.results.map((s, n) => [s.id, n]));
  const marked = new Set(marks.results.map((m) => m.image_id));
  const photos = imgs.results
    .sort((a, b) => (order.get(a.section_id) ?? 999) - (order.get(b.section_id) ?? 999))
    .map((i) => ({ id: i.id, thumb: webUrl(gid, i.id, 'thumb', i.web_crc), w: i.width, h: i.height, section: names.get(i.section_id) ?? '', blog: marked.has(i.id) }));
  return json({ gallery: g, photos });
}

/** Upload one gallery photo (its 2048px web copy) to Cloudflare Images under `name`, adding -2, -3… if taken. */
async function copyToImages(env, gid, img, name) {
  const obj = await env.GALLERY_WEB.get(fileKey(gid, img.id, 'web'));
  if (!obj) throw new Error('That photo’s web copy isn’t there.');
  const bytes = await obj.arrayBuffer();
  for (let n = 0; n < 5; n++) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'image/jpeg' }), `${name.split('/').pop()}.jpg`);
    form.append('id', n ? `${name}-${n + 1}` : name);
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`, { method: 'POST', headers: { authorization: `Bearer ${env.CF_IMAGES_TOKEN}` }, body: form });
    const d = await r.json().catch(() => null);
    if (r.ok && d?.success) return d.result.id;
    if (!d?.errors?.some((e) => e.code === 5409 || /already exists/i.test(e.message))) throw new Error(d?.errors?.[0]?.message ?? `Cloudflare Images said ${r.status}`);
  }
  throw new Error('Couldn’t find a free name for that photo.');
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const d = await request.json().catch(() => ({}));
  const gid = String(d.gallery_id ?? '');
  const ids = (Array.isArray(d.image_ids) ? d.image_ids : []).map(String).slice(0, 2000);
  if (!gid || !ids.length) return json({ error: 'Which photos?' }, 400);
  if (d.action === 'mark') {
    const have = new Set((await db.prepare(`SELECT image_id FROM photo_picks WHERE gallery_id = ?1 AND purpose = 'blog'`).bind(gid).all()).results.map((r) => r.image_id));
    const on = d.on ?? !have.has(ids[0]);
    const now = new Date().toISOString();
    if (on) {
      const real = new Set((await db.prepare('SELECT id FROM gallery_images WHERE gallery_id = ?1').bind(gid).all()).results.map((r) => r.id));
      const add = ids.filter((i) => real.has(i) && !have.has(i));
      for (let n = 0; n < add.length; n += 50)
        await db.batch(add.slice(n, n + 50).map((i) => db.prepare(`INSERT OR IGNORE INTO photo_picks (image_id, gallery_id, purpose, created_at) VALUES (?1, ?2, 'blog', ?3)`).bind(i, gid, now)));
    } else {
      for (let n = 0; n < ids.length; n += 50)
        await db.batch(ids.slice(n, n + 50).map((i) => db.prepare(`DELETE FROM photo_picks WHERE image_id = ?1 AND gallery_id = ?2 AND purpose = 'blog'`).bind(i, gid)));
    }
    const marked = (await db.prepare(`SELECT image_id FROM photo_picks WHERE gallery_id = ?1 AND purpose = 'blog'`).bind(gid).all()).results.map((r) => r.image_id);
    return json({ on, marked });
  }
  if (d.action === 'copy') {
    const folder = String(d.folder ?? '').replace(/[^A-Za-z0-9/_.-]+/g, '-').replace(/^[/-]+|[/-]+$/g, '').slice(0, 120) || 'blog';
    const out = [];
    for (const iid of ids.slice(0, 6)) {
      const img = await db.prepare(`SELECT id, filename, width, height FROM gallery_images WHERE id = ?1 AND gallery_id = ?2 AND status = 'ready'`).bind(iid, gid).first();
      if (!img) { out.push({ id: iid, error: 'That photo isn’t in the gallery.' }); continue; }
      const base = String(img.filename || img.id).replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 60);
      try {
        const cfId = await copyToImages(env, gid, img, `${folder}/${base}`);
        // The web copy is 2048px on its long side.
        const scale = img.width && img.height ? Math.min(1, SIZES.web / Math.max(img.width, img.height)) : 1;
        out.push({ id: iid, src: `https://imagedelivery.net/${IMAGES_HASH}/${cfId}/public`, width: img.width ? Math.round(img.width * scale) : undefined, height: img.height ? Math.round(img.height * scale) : undefined });
      } catch (e) {
        out.push({ id: iid, error: e.message });
      }
    }
    return json({ photos: out });
  }
  return json({ error: 'What should happen?' }, 400);
}
