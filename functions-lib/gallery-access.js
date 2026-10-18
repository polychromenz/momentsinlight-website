// MIL Galleries, milestones 1b and 1c: managing photos in the studio, access links, and what the
// client gallery (galleries.momentsinlight.co.nz/{slug}) is allowed to show.
import { newId, fileKey, webUrl, SIZES } from './galleries.js';

// ---- Managing photos and sections (studio) ----
const keysFor = (galleryId, imageId) => ({
  files: [fileKey(galleryId, imageId, 'original'), `wm/${galleryId}/${imageId}_2048.jpg`, `wm/${galleryId}/${imageId}_600.jpg`],
  web: [fileKey(galleryId, imageId, 'web'), fileKey(galleryId, imageId, 'thumb')],
});

/** Delete photos (their files too). */
export async function deleteImages(env, galleryId, ids) {
  const rows = (await env.DB.prepare('SELECT id FROM gallery_images WHERE gallery_id = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(galleryId, JSON.stringify(ids)).all()).results;
  for (let i = 0; i < rows.length; i += 300) {
    const part = rows.slice(i, i + 300).map((r) => keysFor(galleryId, r.id));
    await env.GALLERY_FILES.delete(part.flatMap((k) => k.files));
    await env.GALLERY_WEB.delete(part.flatMap((k) => k.web));
  }
  const list = JSON.stringify(rows.map((r) => r.id));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM gallery_list_items WHERE image_id IN (SELECT value FROM json_each(?1))').bind(list),
    env.DB.prepare('UPDATE photo_galleries SET cover_image_id = NULL WHERE id = ?1 AND cover_image_id IN (SELECT value FROM json_each(?2))').bind(galleryId, list),
    env.DB.prepare('DELETE FROM gallery_images WHERE gallery_id = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(galleryId, list),
  ]);
  return rows.length;
}

/** Delete a whole gallery: every file in both buckets and every record. */
export async function deleteGallery(env, galleryId) {
  for (const [bucket, prefix] of [[env.GALLERY_FILES, `galleries/${galleryId}/`], [env.GALLERY_FILES, `wm/${galleryId}/`], [env.GALLERY_WEB, `${galleryId}/`]]) {
    let cursor;
    do {
      const l = await bucket.list({ prefix, cursor, limit: 1000 });
      if (l.objects.length) await bucket.delete(l.objects.map((o) => o.key));
      cursor = l.truncated ? l.cursor : undefined;
    } while (cursor);
  }
  const t = (sql) => env.DB.prepare(sql).bind(galleryId);
  await env.DB.batch([
    t('DELETE FROM gallery_list_items WHERE list_id IN (SELECT id FROM gallery_lists WHERE gallery_id = ?1)'),
    ...['gallery_lists', 'gallery_events', 'gallery_viewers', 'gallery_links', 'gallery_videos', 'gallery_images', 'gallery_sections'].map((tb) => t(`DELETE FROM ${tb} WHERE gallery_id = ?1`)),
    t('DELETE FROM photo_galleries WHERE id = ?1'),
  ]);
}

// ---- Access links ----
export const GALLERY_ORIGIN = 'https://galleries.momentsinlight.co.nz';
export const LINK_KINDS = { main_client: 'Couple / client', invited: 'Invited', guest: 'Guests' };
export const linkUrl = (slug, token) => `${GALLERY_ORIGIN}/${slug}${token ? `?k=${token}` : ''}`;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });

/** Clean values for a link. Defaults by kind: guests give their email first and get web-size downloads. */
export function linkValues(d, kind, old = {}) {
  const guest = kind === 'guest';
  const pick = (k, fallback) => (d[k] === undefined ? old[k] ?? fallback : d[k]);
  const secs = pick('visible_section_ids', null);
  return {
    name: String(pick('name', LINK_KINDS[kind])).trim().slice(0, 80),
    email: String(pick('email', '')).trim().toLowerCase().slice(0, 120),
    access_code: String(pick('access_code', '') ?? '').trim().slice(0, 30) || null,
    visible_section_ids: Array.isArray(secs) ? JSON.stringify(secs.map(Number).filter(Boolean)) : typeof secs === 'string' ? secs : null,
    watermark: pick('watermark', 0) ? 1 : 0,
    downloads: ['none', 'web', 'highres'].includes(pick('downloads')) ? pick('downloads') : guest ? 'none' : 'highres',
    allow_lists: pick('allow_lists', 1) ? 1 : 0,
    require_email: pick('require_email', guest ? 1 : 0) ? 1 : 0,
    expires_at: /^\d{4}-\d{2}-\d{2}$/.test(pick('expires_at', '') ?? '') ? pick('expires_at') : null,
  };
}

export async function createLink(env, galleryId, input = {}) {
  const kind = input.kind in LINK_KINDS ? input.kind : 'guest';
  const v = linkValues(input, kind);
  const r = await env.DB.prepare(`INSERT INTO gallery_links (gallery_id, kind, name, email, token, access_code, visible_section_ids, watermark, downloads, allow_lists, require_email, expires_at, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) RETURNING id`)
    .bind(galleryId, kind, v.name, v.email, newId(24), v.access_code, v.visible_section_ids, v.watermark, v.downloads, v.allow_lists, v.require_email, v.expires_at, new Date().toISOString()).first();
  return r.id;
}

// ---- The client gallery ----
async function coverOf(env, g) {
  const id = g.cover_image_id ?? (await env.DB.prepare(`SELECT id FROM gallery_images WHERE gallery_id = ?1 AND status = 'ready' AND hidden = 0 ORDER BY is_hero DESC, sort_order LIMIT 1`).bind(g.id).first())?.id;
  const img = id ? await env.DB.prepare(`SELECT id, width, height FROM gallery_images WHERE id = ?1 AND status = 'ready'`).bind(id).first() : null;
  return img ? { id: img.id, w: img.width, h: img.height } : null;
}
const publicInfo = (g) => ({ name: g.name, type: g.type, event_date: g.event_date, spouse_a: g.spouse_a, spouse_b: g.spouse_b, family_name: g.family_name, venue: g.venue, description: g.description, expires_at: g.expires_at });

/** The cover for the front page before someone is in (none when guests would need a watermark). */
async function frontCover(env, g, watermark) {
  const c = await coverOf(env, g);
  return c && !watermark ? { w: c.w, h: c.h, web: webUrl(g.id, c.id, 'web'), thumb: webUrl(g.id, c.id, 'thumb') } : null;
}

/** Somebody arriving: by link (key), access code, or the visitor token kept in their browser. */
export async function enterGallery(env, d) {
  const db = env.DB;
  const g = await db.prepare('SELECT * FROM photo_galleries WHERE slug = ?1').bind(String(d.slug ?? '')).first();
  if (!g || g.status !== 'online') return { status: 'gone' };
  const info = publicInfo(g);
  if (g.expires_at && g.expires_at < today()) return { status: 'expired', gallery: info, cover: await frontCover(env, g, false) };
  let viewer = d.viewer ? await db.prepare('SELECT * FROM gallery_viewers WHERE token = ?1 AND gallery_id = ?2').bind(String(d.viewer), g.id).first() : null;
  let link = null;
  if (d.key) link = await db.prepare('SELECT * FROM gallery_links WHERE token = ?1 AND gallery_id = ?2').bind(String(d.key), g.id).first();
  else if (d.code) link = await db.prepare('SELECT * FROM gallery_links WHERE gallery_id = ?1 AND access_code IS NOT NULL AND lower(access_code) = lower(?2)').bind(g.id, String(d.code).trim()).first();
  else if (viewer) link = await db.prepare('SELECT * FROM gallery_links WHERE id = ?1').bind(viewer.link_id).first();
  const ask = async (status, error, extra = {}) => ({ status, gallery: info, cover: await frontCover(env, g, status !== 'email' || !!link?.watermark), error, ...extra });
  if (d.code && !link) return ask('code', 'That code isn’t right. Please check it and try again.');
  if (!link) return ask('code', d.key ? 'This link no longer works. Please ask Tony for a new one.' : undefined);
  if (link.expires_at && link.expires_at < today()) return ask('code', 'This link has expired. Please ask Tony for a new one.');
  // Rights belong to the link, so a different link means a different visitor record.
  if (viewer && viewer.link_id !== link.id) viewer = null;
  if (!viewer && link.require_email) {
    const email = String(d.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ask('email', d.email !== undefined ? 'Please check your email address.' : undefined, { key: link.token });
    viewer = await db.prepare('SELECT * FROM gallery_viewers WHERE gallery_id = ?1 AND link_id = ?2 AND email = ?3').bind(g.id, link.id, email).first();
    if (viewer) await db.prepare('UPDATE gallery_viewers SET name = ?2, consent_marketing = MAX(consent_marketing, ?3) WHERE id = ?1').bind(viewer.id, String(d.name || viewer.name).slice(0, 80), d.consent ? 1 : 0).run();
  }
  const now = new Date().toISOString();
  if (!viewer) {
    viewer = await db.prepare(`INSERT INTO gallery_viewers (gallery_id, link_id, email, name, role, consent_marketing, token, first_seen, last_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) RETURNING *`)
      .bind(g.id, link.id, String(d.email || link.email || '').trim().toLowerCase().slice(0, 120), String(d.name || link.name || '').slice(0, 80), link.kind, d.consent ? 1 : 0, newId(32), now).first();
  }
  await db.batch([
    db.prepare('UPDATE gallery_viewers SET last_seen = ?2 WHERE id = ?1').bind(viewer.id, now),
    db.prepare(`INSERT INTO gallery_events (gallery_id, viewer_id, link_id, type, at) VALUES (?1, ?2, ?3, 'view', ?4)`).bind(g.id, viewer.id, link.id, now),
  ]);
  return { status: 'in', viewer: viewer.token };
}

/** A visitor's token → their gallery, link and record (or null if it no longer works). */
export async function viewerAccess(env, token) {
  if (!token) return null;
  const v = await env.DB.prepare('SELECT * FROM gallery_viewers WHERE token = ?1').bind(String(token)).first();
  if (!v) return null;
  const l = await env.DB.prepare('SELECT * FROM gallery_links WHERE id = ?1').bind(v.link_id).first();
  const g = await env.DB.prepare('SELECT * FROM photo_galleries WHERE id = ?1').bind(v.gallery_id).first();
  if (!l || !g || g.status !== 'online' || (g.expires_at && g.expires_at < today()) || (l.expires_at && l.expires_at < today())) return null;
  return { viewer: v, link: l, gallery: g };
}

/** Everything the gallery page shows, limited to what the link allows. With a watermark, photos
 *  come through /api/gallery/img (the gallery's own id is never shown, so the clean copies can't be found). */
export async function galleryView(env, g, link, viewerToken) {
  const db = env.DB;
  const only = link?.visible_section_ids ? JSON.parse(link.visible_section_ids) : null;
  const sections = (await db.prepare('SELECT id, name, is_bw FROM gallery_sections WHERE gallery_id = ?1 AND hidden = 0 ORDER BY sort_order, id').bind(g.id).all()).results
    .filter((s) => !only || !only.length || only.includes(s.id));
  const ids = new Set(sections.map((s) => s.id));
  const wm = !!link?.watermark && !!viewerToken;
  const src = (id, size) => (wm ? `/api/gallery/img/${viewerToken}/${id}_${SIZES[size]}.jpg` : webUrl(g.id, id, size));
  // Photos the couple hid: only the couple sees them (at the end of their section, marked).
  const couple = !link || link.kind === 'main_client';
  // A shared list shows only that list's photos.
  const inList = link?.kind === 'list_share' ? new Set((await db.prepare('SELECT image_id FROM gallery_list_items WHERE list_id = ?1').bind(link.list_id).all()).results.map((r) => r.image_id)) : null;
  const images = (await db.prepare(`SELECT id, section_id, width, height, is_hero, client_hidden FROM gallery_images WHERE gallery_id = ?1 AND hidden = 0 AND status = 'ready' ORDER BY sort_order, created_at`).bind(g.id).all()).results
    .filter((i) => ids.has(i.section_id) && (couple || !i.client_hidden) && (!inList || inList.has(i.id)))
    .map((i) => ({ id: i.id, s: i.section_id, w: i.width, h: i.height, hero: i.is_hero && !i.client_hidden ? 1 : 0, ch: i.client_hidden ? 1 : 0, thumb: src(i.id, 'thumb'), web: src(i.id, 'web') }));
  // In section order, so the slideshow runs through the gallery as it reads; hidden ones last.
  const pos = new Map(sections.map((s, n) => [s.id, n]));
  images.sort((a, b) => pos.get(a.s) - pos.get(b.s) || a.ch - b.ch);
  const c = await coverOf(env, g);
  const shown = c && images.find((i) => i.id === c.id);
  const cover = shown ? { w: shown.w, h: shown.h, thumb: shown.thumb, web: shown.web }
    : c && !wm ? { w: c.w, h: c.h, thumb: webUrl(g.id, c.id, 'thumb'), web: webUrl(g.id, c.id, 'web') }
    : images[0] ? { w: images[0].w, h: images[0].h, thumb: images[0].thumb, web: images[0].web } : null;
  return {
    gallery: publicInfo(g),
    cover,
    rights: { downloads: link?.downloads ?? 'highres', watermark: !!link?.watermark, kind: link?.kind ?? 'main_client',
      lists: !!link?.allow_lists && link?.kind !== 'list_share', hide: couple, zip: !!link && link.downloads !== 'none' && !link.watermark },
    sections,
    images,
  };
}

/** Log something a visitor did (views, downloads…), for the gallery dashboard later. */
export const logEvent = (env, a, type, imageId = null, meta = {}) =>
  env.DB.prepare('INSERT INTO gallery_events (gallery_id, viewer_id, link_id, type, image_id, meta, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(a.gallery.id, a.viewer.id, a.link.id, type, imageId, JSON.stringify(meta), new Date().toISOString()).run();
