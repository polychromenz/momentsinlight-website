// Albums designed in the studio from a client gallery (src/pages/studio/gallery-album.astro). Studio only.
//   GET    ?gallery=<id>           -> { albums }   (the gallery page's Albums tab)
//   GET    ?id=<album id>          -> { album, gallery, sections, images, lists }   (the designer)
//   POST   { gallery_id, name, size, orientation, spreads, bg }   -> { album }   a new, empty album
//   POST   { action: 'exported', id }                              -> { ok }      the Seldex files were made
//   PUT    { id, version, name?, size?, orientation?, bg?, design? } -> { album } (409 if saved elsewhere since)
//   DELETE { id }
import { json } from '../../../../functions-lib/studio.js';
import { webUrl } from '../../../../functions-lib/galleries.js';
import { galleryLists } from '../../../../functions-lib/gallery-lists.js';
import { ALBUM_SIZES, SPREADS_MIN, SPREADS_MAX, orientationsOf } from '../../../../functions-lib/album-sizes.js';

const now = () => new Date().toISOString();
const out = (a) => (a ? { ...a, design: JSON.parse(a.design || '{"spreads":[]}') } : null);
const colour = (v, d = '#ffffff') => (/^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? String(v).toLowerCase() : d);
const sizeOk = (size, orientation) => ALBUM_SIZES[size] && orientationsOf(size).includes(orientation);

/** A design as sent by the designer, checked: known photos only, sane numbers, 10–45 spreads. */
function cleanDesign(d, ids) {
  const spreads = (Array.isArray(d?.spreads) ? d.spreads : []).slice(0, SPREADS_MAX).map((s) => {
    const layout = s?.layout === 'span' ? 'span' : Array.isArray(s?.layout) ? s.layout.slice(0, 2).map((x) => String(x).slice(0, 20)) : ['blank', 'blank'];
    const slots = (Array.isArray(s?.slots) ? s.slots : []).slice(0, 8).map((x) => (x && ids.has(String(x)) ? String(x) : null));
    const crops = (Array.isArray(s?.crops) ? s.crops : []).slice(0, 8).map((c) => ({
      cx: Math.min(1, Math.max(0, Number(c?.cx) || 0.5)), cy: Math.min(1, Math.max(0, Number(c?.cy) || 0.5)), z: Math.min(20, Math.max(1, Number(c?.z) || 1)),
    }));
    return { layout, slots, crops };
  });
  // The photos Tony ticked for this album (the tray's "Choose photos"), in his order.
  const picks = [...new Set((Array.isArray(d?.picks) ? d.picks : []).map(String).filter((x) => ids.has(x)))].slice(0, 400);
  return { spreads, picks };
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const db = env.DB;
  const gid = u.searchParams.get('gallery');
  if (gid) {
    const albums = (await db.prepare('SELECT id, gallery_id, name, product, size, orientation, spreads, bg, status, version, exported_at, created_at, updated_at FROM albums WHERE gallery_id = ?1 ORDER BY id DESC').bind(gid).all()).results;
    return json({ albums });
  }
  const a = out(await db.prepare('SELECT * FROM albums WHERE id = ?1').bind(Number(u.searchParams.get('id'))).first());
  if (!a) return json({ error: 'That album isn’t here.' }, 404);
  const gallery = await db.prepare('SELECT id, name, slug FROM photo_galleries WHERE id = ?1').bind(a.gallery_id).first();
  const sections = (await db.prepare('SELECT id, name, sort_order, hidden FROM gallery_sections WHERE gallery_id = ?1 ORDER BY sort_order, id').bind(a.gallery_id).all()).results;
  const images = (await db.prepare(`SELECT id, section_id, filename, width, height, sort_order, is_hero, hidden, has_original, has_web, has_thumb, web_crc FROM gallery_images
      WHERE gallery_id = ?1 AND status = 'ready' ORDER BY sort_order, created_at`).bind(a.gallery_id).all()).results
    .map(({ web_crc, ...i }) => ({ ...i, web: i.has_web ? webUrl(a.gallery_id, i.id, 'web', web_crc) : null, thumb: i.has_thumb ? webUrl(a.gallery_id, i.id, 'thumb', web_crc) : null }));
  const lists = (await galleryLists(env, a.gallery_id)).map((l) => ({ id: l.id, name: l.name, kind: l.kind, owner: l.owner, photos: l.photos.map((p) => p.id) }));
  return json({ album: a, gallery, sections, images, lists });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const db = env.DB;
  if (d.action === 'exported') {
    await db.prepare('UPDATE albums SET exported_at = ?2 WHERE id = ?1').bind(Number(d.id), now()).run();
    return json({ ok: true });
  }
  const g = await db.prepare('SELECT id, name FROM photo_galleries WHERE id = ?1').bind(String(d.gallery_id ?? '')).first();
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const size = String(d.size ?? '10x10'), orientation = String(d.orientation ?? (ALBUM_SIZES[d.size]?.w === ALBUM_SIZES[d.size]?.h ? 'square' : 'portrait'));
  if (!sizeOk(size, orientation)) return json({ error: 'Choose one of the album sizes.' }, 400);
  const spreads = Math.round(Number(d.spreads) || 0);
  if (spreads < SPREADS_MIN || spreads > SPREADS_MAX) return json({ error: `An album has ${SPREADS_MIN} to ${SPREADS_MAX} spreads.` }, 400);
  const empty = { spreads: Array.from({ length: spreads }, () => ({ layout: ['blank', 'blank'], slots: [], crops: [] })) };
  const t = now();
  const r = await db.prepare(`INSERT INTO albums (gallery_id, name, size, orientation, spreads, bg, design, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) RETURNING *`)
    .bind(g.id, String(d.name ?? '').trim().slice(0, 80) || `${g.name} album`, size, orientation, spreads, colour(d.bg), JSON.stringify(empty), t).first();
  return json({ album: out(r) });
}

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const db = env.DB;
  const a = await db.prepare('SELECT * FROM albums WHERE id = ?1').bind(Number(d.id)).first();
  if (!a) return json({ error: 'That album isn’t here.' }, 404);
  if (d.version !== undefined && Number(d.version) !== a.version) return json({ error: 'This album was changed in another window. Reload to get the latest.', album: out(a) }, 409);
  const size = d.size !== undefined ? String(d.size) : a.size, orientation = d.orientation !== undefined ? String(d.orientation) : a.orientation;
  if (!sizeOk(size, orientation)) return json({ error: 'Choose one of the album sizes.' }, 400);
  let design = a.design, spreads = a.spreads;
  if (d.design !== undefined) {
    const ids = new Set((await db.prepare('SELECT id FROM gallery_images WHERE gallery_id = ?1').bind(a.gallery_id).all()).results.map((r) => r.id));
    const c = cleanDesign(d.design, ids);
    if (c.spreads.length < SPREADS_MIN) return json({ error: `An album has at least ${SPREADS_MIN} spreads.` }, 400);
    design = JSON.stringify(c);
    spreads = c.spreads.length;
  }
  const name = d.name !== undefined ? String(d.name).trim().slice(0, 80) || a.name : a.name;
  const r = await db.prepare(`UPDATE albums SET name = ?2, size = ?3, orientation = ?4, bg = ?5, design = ?6, spreads = ?7, version = version + 1, updated_at = ?8 WHERE id = ?1 RETURNING *`)
    .bind(a.id, name, size, orientation, d.bg !== undefined ? colour(d.bg, a.bg) : a.bg, design, spreads, now()).first();
  return json({ album: out(r) });
}

export async function onRequestDelete({ request, env }) {
  const d = await request.json().catch(() => ({}));
  await env.DB.prepare('DELETE FROM albums WHERE id = ?1').bind(Number(d.id)).run();
  return json({ ok: true });
}
