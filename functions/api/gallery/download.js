// The client gallery: downloading one photo (sections, lists and whole galleries come in milestone 1d).
//   GET /api/gallery/download?v=<visitor token>&id=<photo>&size=original|web
//   Full size only if the link allows it; links with a watermark download the watermarked web size.
import { json } from '../../../functions-lib/studio.js';
import { fileKey } from '../../../functions-lib/galleries.js';
import { viewerAccess, logEvent } from '../../../functions-lib/gallery-access.js';
import { watermarked } from '../../../functions-lib/watermark.js';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const a = await viewerAccess(env, u.searchParams.get('v'));
  if (!a) return json({ error: 'This gallery link no longer works.' }, 401);
  if (a.link.downloads === 'none') return json({ error: 'Downloads aren’t switched on for this gallery.' }, 403);
  const img = await env.DB.prepare(`SELECT * FROM gallery_images WHERE id = ?1 AND gallery_id = ?2 AND hidden = 0 AND status = 'ready'`).bind(u.searchParams.get('id') ?? '', a.gallery.id).first();
  if (!img) return json({ error: 'That photo isn’t here.' }, 404);
  const full = u.searchParams.get('size') === 'original' && a.link.downloads === 'highres' && !a.link.watermark;
  let body;
  if (a.link.watermark) body = await watermarked(env, a.gallery.id, img, 2048, request).catch(() => null);
  else body = full ? (await env.GALLERY_FILES.get(fileKey(a.gallery.id, img.id, 'original')))?.body : (await env.GALLERY_WEB.get(fileKey(a.gallery.id, img.id, 'web')))?.body;
  if (!body) return json({ error: 'That photo isn’t available right now.' }, 404);
  await logEvent(env, a, 'download', img.id, { size: full ? 'original' : 'web' });
  const base = (img.filename || img.id).replace(/\.jpe?g$/i, '').replace(/[^\w .-]+/g, '_');
  return new Response(body, {
    headers: {
      'content-type': 'image/jpeg',
      'content-disposition': `attachment; filename="${base}${full ? '' : '-web'}.jpg"`,
      'cache-control': 'private, no-store',
    },
  });
}
