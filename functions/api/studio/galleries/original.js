// A photo's full-size original, for the studio (the prints lab files are cropped from it in Tony's browser).
//   GET /api/studio/galleries/original?gallery=<id>&id=<image id>  -> the JPEG
import { json } from '../../../../functions-lib/studio.js';
import { fileKey } from '../../../../functions-lib/galleries.js';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const g = String(u.searchParams.get('gallery') ?? ''), id = String(u.searchParams.get('id') ?? '');
  const img = await env.DB.prepare('SELECT id FROM gallery_images WHERE id = ?1 AND gallery_id = ?2').bind(id, g).first();
  if (!img) return json({ error: 'That photo isn’t here.' }, 404);
  const o = await env.GALLERY_FILES.get(fileKey(g, id, 'original'));
  if (!o) return json({ error: 'The full-size file isn’t stored for that photo.' }, 404);
  return new Response(o.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600', 'content-length': String(o.size) } });
}
