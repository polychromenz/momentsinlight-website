// Tony previewing a gallery as a visitor sees it (drafts too), from the studio.
//   GET /api/studio/galleries/preview?slug=…&link=<link id>   -> the same data the client gallery gets
//   (without &link: as the couple sees it). Watermarked links show clean photos here, with a note.
import { json } from '../../../../functions-lib/studio.js';
import { galleryView } from '../../../../functions-lib/gallery-access.js';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const g = await env.DB.prepare('SELECT * FROM photo_galleries WHERE slug = ?1').bind(u.searchParams.get('slug') ?? '').first();
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const linkId = Number(u.searchParams.get('link'));
  const link = linkId
    ? await env.DB.prepare('SELECT * FROM gallery_links WHERE id = ?1 AND gallery_id = ?2').bind(linkId, g.id).first()
    : await env.DB.prepare(`SELECT * FROM gallery_links WHERE gallery_id = ?1 AND kind = 'main_client' ORDER BY id LIMIT 1`).bind(g.id).first();
  return json({ ...(await galleryView(env, g, link, null)), preview: { status: g.status, link: link?.name ?? '' } });
}
