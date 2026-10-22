// The client gallery: a watermarked photo for links that need one.
//   GET /api/gallery/img/<visitor token>/<photo id>_2048.jpg  (or _600.jpg)
import { viewerAccess } from '../../../../../functions-lib/gallery-access.js';
import { watermarked } from '../../../../../functions-lib/watermark.js';

export async function onRequestGet({ request, env, params }) {
  const m = String(params.file).match(/^([a-z0-9]+)_(2048|600)\.jpg$/);
  const a = m && (await viewerAccess(env, params.v));
  if (!a) return new Response('Not found', { status: 404 });
  const img = await env.DB.prepare(`SELECT id, width, height FROM gallery_images WHERE id = ?1 AND gallery_id = ?2 AND hidden = 0 AND status = 'ready' AND (client_hidden = 0 OR ?3 = 1)`)
    .bind(m[1], a.gallery.id, a.link.kind === 'main_client' || a.viewer.role === 'studio' ? 1 : 0) // the couple's hidden photos are theirs alone.first();
  if (!img) return new Response('Not found', { status: 404 });
  try {
    const body = await watermarked(env, a.gallery.id, img, Number(m[2]), request);
    return new Response(body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  } catch {
    return new Response('This photo isn’t available right now.', { status: 503 });
  }
}
