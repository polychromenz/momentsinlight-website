// MIL Galleries: shared code for the studio's gallery API, the Lightroom plugin's API and the
// client gallery (docs/MIL-Galleries-Spec.md, docs/MIL-Galleries-Phase1-Plan.md).
//
// Storage (wrangler.toml):
//   GALLERY_FILES  R2 bucket mil-galleries (private): full-size originals
//   GALLERY_WEB    R2 bucket mil-galleries-web, public at photos.momentsinlight.co.nz: 2048px + 600px
export const PHOTOS = 'https://photos.momentsinlight.co.nz';
export const SIZES = { original: null, web: 2048, thumb: 600 };
export const TYPES = ['Wedding', 'Portraits', 'Headshots', 'Events'];

/** A long random id (letters and digits) for galleries, images and links. */
export function newId(len = 20) {
  const abc = 'abcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => abc[b % abc.length]).join('');
}
export const slugify = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** Where each size of an image is kept. */
export function fileKey(galleryId, imageId, size) {
  if (size === 'original') return `galleries/${galleryId}/original/${imageId}.jpg`;
  return `${galleryId}/${imageId}_${SIZES[size]}.jpg`;
}
export const webUrl = (galleryId, imageId, size = 'web') => `${PHOTOS}/${fileKey(galleryId, imageId, size)}`;

// CRC-32 (for ZIP files, worked out once at upload so downloads only copy bytes).
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes, crc = 0) {
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- Settings (defaults Tony can change in the studio) ----
export async function gallerySettings(db) {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'galleries'`).first();
  return { expiry_months: 6, extension_price: 4900, extension_months: 12, ...(row ? JSON.parse(row.value) : {}) };
}
const addMonths = (iso, m) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };

// ---- Galleries ----
export async function createGallery(env, input) {
  const db = env.DB;
  const name = String(input.name ?? '').trim().slice(0, 120);
  if (!name) throw new Error('What’s the gallery called?');
  const type = TYPES.includes(input.type) ? input.type : 'Wedding';
  let slug = slugify(input.slug || name) || newId(8);
  // Keep addresses unique: add -2, -3… if needed.
  for (let n = 2; await db.prepare('SELECT 1 FROM photo_galleries WHERE slug = ?1').bind(slug).first(); n++) slug = `${slugify(input.slug || name)}-${n}`;
  const now = new Date().toISOString();
  const id = newId();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.event_date ?? '') ? input.event_date : null;
  await db.prepare(`INSERT INTO photo_galleries (id, slug, name, type, event_date, venue, spouse_a, spouse_b, client_id, job_id, source, expires_at, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, ?12, ?12)`)
    .bind(id, slug, name, type, date, String(input.venue ?? '').slice(0, 120), String(input.spouse_a ?? '').slice(0, 60), String(input.spouse_b ?? '').slice(0, 60),
      input.client_id ? Number(input.client_id) : null, input.job_id ? Number(input.job_id) : null, ['studio', 'lightroom', 'pictime'].includes(input.source) ? input.source : 'studio', now).run();
  return { id, slug };
}
/** When a gallery first goes online it gets its expiry date (the default months from today). */
export async function setOnline(env, galleryId) {
  const g = await env.DB.prepare('SELECT status, expires_at FROM photo_galleries WHERE id = ?1').bind(galleryId).first();
  if (!g) throw new Error('That gallery doesn’t exist.');
  const s = await gallerySettings(env.DB);
  const expires = g.expires_at ?? (s.expiry_months ? addMonths(new Date().toISOString().slice(0, 10), s.expiry_months) : null);
  await env.DB.prepare(`UPDATE photo_galleries SET status = 'online', expires_at = ?2, updated_at = ?3 WHERE id = ?1`).bind(galleryId, expires, new Date().toISOString()).run();
  return expires;
}

export async function addSection(env, galleryId, { name, is_bw = 0, source_key = null }) {
  const db = env.DB;
  if (source_key) {
    const have = await db.prepare('SELECT id FROM gallery_sections WHERE gallery_id = ?1 AND source_key = ?2').bind(galleryId, source_key).first();
    if (have) { await db.prepare('UPDATE gallery_sections SET name = ?2 WHERE id = ?1').bind(have.id, String(name).slice(0, 80)).run(); return have.id; }
  }
  const next = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 n FROM gallery_sections WHERE gallery_id = ?1').bind(galleryId).first();
  const r = await db.prepare('INSERT INTO gallery_sections (gallery_id, name, sort_order, is_bw, source_key) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id')
    .bind(galleryId, String(name).slice(0, 80) || 'Photos', next.n, is_bw ? 1 : 0, source_key).first();
  return r.id;
}

/** A new image record (before its files are uploaded). Re-publishing the same Lightroom photo reuses it. */
export async function registerImage(env, galleryId, input) {
  const db = env.DB;
  if (input.lightroom_id) {
    const have = await db.prepare('SELECT id FROM gallery_images WHERE gallery_id = ?1 AND lightroom_id = ?2').bind(galleryId, String(input.lightroom_id)).first();
    if (have) {
      await db.prepare('UPDATE gallery_images SET section_id = ?2, sort_order = ?3, filename = ?4, width = ?5, height = ?6, checksum = ?7 WHERE id = ?1')
        .bind(have.id, input.section_id ?? null, Number(input.sort_order ?? 0), String(input.filename ?? '').slice(0, 200), input.width ?? null, input.height ?? null, input.checksum ?? null).run();
      return { id: have.id, existing: true };
    }
  }
  const id = newId();
  await db.prepare(`INSERT INTO gallery_images (id, gallery_id, section_id, filename, width, height, sort_order, lightroom_id, checksum, taken_at, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
    .bind(id, galleryId, input.section_id ?? null, String(input.filename ?? '').slice(0, 200), input.width ?? null, input.height ?? null, Number(input.sort_order ?? 0),
      input.lightroom_id ? String(input.lightroom_id) : null, input.checksum ?? null, input.taken_at ?? null, new Date().toISOString()).run();
  return { id, existing: false };
}

/** Store one size of an image (the request body is the JPEG). */
export async function storeFile(env, imageId, size, request) {
  if (!(size in SIZES)) throw new Error('Unknown size.');
  const img = await env.DB.prepare('SELECT id, gallery_id FROM gallery_images WHERE id = ?1').bind(imageId).first();
  if (!img) throw new Error('That image doesn’t exist.');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('That isn’t a JPEG.');
  const key = fileKey(img.gallery_id, imageId, size);
  if (size === 'original') {
    await env.GALLERY_FILES.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    await env.DB.prepare('UPDATE gallery_images SET has_original = 1, bytes = ?2, crc32 = ?3 WHERE id = ?1').bind(imageId, bytes.length, crc32(bytes)).run();
  } else {
    await env.GALLERY_WEB.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' } });
    await env.DB.prepare(`UPDATE gallery_images SET ${size === 'web' ? 'has_web' : 'has_thumb'} = 1 WHERE id = ?1`).bind(imageId).run();
  }
  await env.DB.prepare(`UPDATE gallery_images SET status = 'ready' WHERE id = ?1 AND has_original = 1 AND has_web = 1 AND has_thumb = 1`).bind(imageId).run();
  return { size, bytes: bytes.length };
}

/** A gallery with its sections and images, for the studio. */
export async function galleryDetail(env, galleryId) {
  const db = env.DB;
  const g = await db.prepare('SELECT * FROM photo_galleries WHERE id = ?1').bind(galleryId).first();
  if (!g) return null;
  const sections = (await db.prepare('SELECT * FROM gallery_sections WHERE gallery_id = ?1 ORDER BY sort_order, id').bind(galleryId).all()).results;
  const images = (await db.prepare('SELECT * FROM gallery_images WHERE gallery_id = ?1 ORDER BY sort_order, created_at').bind(galleryId).all()).results
    .map((i) => ({ ...i, web: i.has_web ? webUrl(galleryId, i.id, 'web') : null, thumb: i.has_thumb ? webUrl(galleryId, i.id, 'thumb') : null }));
  return { gallery: { ...g, settings: JSON.parse(g.settings || '{}') }, sections, images };
}
