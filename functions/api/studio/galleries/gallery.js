// One client gallery in the studio.
//   GET  /api/studio/galleries/gallery?id=…    -> { gallery, sections, images, picks, social, ads_blocked, jobs }
//        picks: image ids marked for Google Ads; social: image ids marked Social; ads_blocked: why not (the client's contract); jobs: to link a client
//   PUT  /api/studio/galleries/gallery { id, ...fields }   name, type, event_date, venue, spouse_a/b,
//        family_name, description, expires_at, extension_price, cover_image_id, client_id, job_id, slug
//   POST /api/studio/galleries/gallery { id, action: 'online' | 'offline' }
import { json } from '../../../../functions-lib/studio.js';
import { galleryDetail, setOnline, slugify, TYPES } from '../../../../functions-lib/galleries.js';
import { deleteGallery, linkUrl } from '../../../../functions-lib/gallery-access.js';
import { adsBlocked } from '../../../../functions-lib/picks.js';

export async function onRequestGet({ request, env }) {
  const d = await galleryDetail(env, new URL(request.url).searchParams.get('id') ?? '');
  if (!d) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const [picks, blocked, jobs, social] = await Promise.all([
    env.DB.prepare(`SELECT image_id, status FROM photo_picks WHERE gallery_id = ?1 AND purpose = 'ads'`).bind(d.gallery.id).all(),
    adsBlocked(env.DB, d.gallery.id),
    env.DB.prepare(`SELECT j.id, j.client_id, j.title, j.event_date, c.ads_ok FROM jobs j JOIN clients c ON c.id = j.client_id
      WHERE j.stage IN ('booked', 'completed') ORDER BY COALESCE(j.event_date, j.created_at) DESC`).all(),
    env.DB.prepare(`SELECT image_id FROM photo_picks WHERE gallery_id = ?1 AND purpose = 'social'`).bind(d.gallery.id).all(),
  ]);
  return json({ ...d, url: linkUrl(d.gallery.slug), types: TYPES, picks: Object.fromEntries(picks.results.map((p) => [p.image_id, p.status])), ads_blocked: blocked, jobs: jobs.results, social: social.results.map((p) => p.image_id) });
}

const TEXT = { name: 120, venue: 120, spouse_a: 60, spouse_b: 60, family_name: 80, description: 2000, seo_title: 120, seo_description: 320 };
export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const g = await env.DB.prepare('SELECT id FROM photo_galleries WHERE id = ?1').bind(String(d.id ?? '')).first();
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const sets = [], vals = [];
  const put = (col, v) => { sets.push(`${col} = ?${vals.length + 2}`); vals.push(v); };
  for (const [k, max] of Object.entries(TEXT)) if (d[k] !== undefined) put(k, String(d[k]).trim().slice(0, max));
  if (d.type !== undefined && TYPES.includes(d.type)) put('type', d.type);
  if (d.event_date !== undefined) put('event_date', /^\d{4}-\d{2}-\d{2}$/.test(d.event_date) ? d.event_date : null);
  if (d.expires_at !== undefined) put('expires_at', /^\d{4}-\d{2}-\d{2}$/.test(d.expires_at) ? d.expires_at : null);
  if (d.extension_price !== undefined) put('extension_price', d.extension_price === null || d.extension_price === '' ? null : Math.max(0, Math.round(Number(d.extension_price))));
  if (d.cover_image_id !== undefined) put('cover_image_id', d.cover_image_id || null);
  for (const k of ['client_id', 'job_id']) if (d[k] !== undefined) put(k, d[k] ? Number(d[k]) : null);
  if (d.slug !== undefined) {
    const slug = slugify(d.slug);
    if (!slug) return json({ error: 'The address can’t be empty.' }, 400);
    if (await env.DB.prepare('SELECT 1 FROM photo_galleries WHERE slug = ?1 AND id <> ?2').bind(slug, g.id).first()) return json({ error: 'Another gallery already uses that address.' }, 400);
    put('slug', slug);
  }
  if (!sets.length) return json({ ok: true });
  put('updated_at', new Date().toISOString());
  await env.DB.prepare(`UPDATE photo_galleries SET ${sets.join(', ')} WHERE id = ?1`).bind(g.id, ...vals).run();
  return json({ ok: true });
}

// DELETE /api/studio/galleries/gallery { id, confirm: 'DELETE' }   (everything, files too)
export async function onRequestDelete({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const g = await env.DB.prepare('SELECT id, name FROM photo_galleries WHERE id = ?1').bind(String(d.id ?? '')).first();
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  if (String(d.confirm ?? '').trim() !== 'DELETE') return json({ error: 'Type DELETE to delete it.' }, 400);
  await deleteGallery(env, g.id);
  return json({ ok: true });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  try {
    if (d.action === 'online') return json({ ok: true, expires_at: await setOnline(env, String(d.id)) });
    if (d.action === 'offline') { await env.DB.prepare(`UPDATE photo_galleries SET status = 'offline', updated_at = ?2 WHERE id = ?1`).bind(String(d.id), new Date().toISOString()).run(); return json({ ok: true }); }
    return json({ error: 'What should happen?' }, 400);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
