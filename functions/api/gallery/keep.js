// Keep a gallery online (functions-lib/gallery-keep.js): the couple's own link only, from 30 days
// before it expires (or once it has).
//   POST /api/gallery/keep { slug, key? (the link's key), viewer? (their saved visit), back (the page address) }
//     -> { url } Stripe's payment page, or { kept: true, until } when it's free to keep
import { json } from '../../../functions-lib/studio.js';
import { keepOffer, keepCheckout, keepFree } from '../../../functions-lib/gallery-keep.js';

const OK_HOSTS = ['www.momentsinlight.co.nz', 'galleries.momentsinlight.co.nz', 'localhost'];

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const db = env.DB;
  const g = await db.prepare('SELECT * FROM photo_galleries WHERE slug = ?1').bind(String(d.slug ?? '')).first();
  if (!g) return json({ error: 'That gallery isn’t here.' }, 404);
  let link = null;
  if (d.key) link = await db.prepare('SELECT kind FROM gallery_links WHERE token = ?1 AND gallery_id = ?2').bind(String(d.key), g.id).first();
  else if (d.viewer) link = await db.prepare('SELECT l.kind FROM gallery_viewers v JOIN gallery_links l ON l.id = v.link_id WHERE v.token = ?1 AND v.gallery_id = ?2').bind(String(d.viewer), g.id).first();
  const offer = await keepOffer(db, g, link?.kind);
  if (!offer) return json({ error: 'This gallery can’t be kept online from here. Please get in touch with Tony.' }, 403);
  if (!offer.price) return json({ kept: true, until: await keepFree(env, g) });
  let back;
  try { back = new URL(String(d.back)); } catch { back = null; }
  if (!back || !OK_HOSTS.includes(back.hostname)) back = new URL(`https://galleries.momentsinlight.co.nz/${g.slug}`);
  back.search = ''; back.hash = '';
  if (d.key) back.searchParams.set('k', String(d.key));
  try {
    return json({ url: await keepCheckout(env, g, back.href) });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
