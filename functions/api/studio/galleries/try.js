// "Open as client" (the gallery's Sharing tab): Tony opening a link's gallery exactly as its visitors
// see it, with downloads and Save to Dropbox, even while the gallery is a draft or offline.
//   GET /api/studio/galleries/try?link=<link id>  -> redirect to the gallery with a studio pass (?sv=…)
// The pass is a gallery_viewers row with role 'studio' (one per link, reused): it gets past the
// draft/expiry checks in functions-lib/gallery-access.js, and nothing it does is counted in the
// activity report. Clients' own links still can't open a draft.
import { json } from '../../../../functions-lib/studio.js';
import { GALLERY_ORIGIN } from '../../../../functions-lib/gallery-access.js';
import { newId } from '../../../../functions-lib/galleries.js';

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const link = await db.prepare('SELECT * FROM gallery_links WHERE id = ?1').bind(Number(new URL(request.url).searchParams.get('link'))).first();
  if (!link) return json({ error: 'That link doesn’t exist.' }, 404);
  const g = await db.prepare('SELECT slug FROM photo_galleries WHERE id = ?1').bind(link.gallery_id).first();
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const now = new Date().toISOString();
  let v = await db.prepare(`SELECT token FROM gallery_viewers WHERE link_id = ?1 AND role = 'studio'`).bind(link.id).first();
  if (!v) {
    v = await db.prepare(`INSERT INTO gallery_viewers (gallery_id, link_id, email, name, role, token, first_seen, last_seen) VALUES (?1, ?2, '', 'Tony (studio)', 'studio', ?3, ?4, ?4) RETURNING token`)
      .bind(link.gallery_id, link.id, newId(32), now).first();
  }
  return Response.redirect(`${GALLERY_ORIGIN}/${encodeURIComponent(g.slug)}?sv=${v.token}`, 302);
}
