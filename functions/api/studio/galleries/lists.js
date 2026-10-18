// A gallery's favourites and lists, for the studio (the gallery page's Lists tab).
//   GET    /api/studio/galleries/lists?gallery_id=…   -> { lists: [...] } with whose they are and their photos' file names
//   POST   /api/studio/galleries/lists { gallery_id, action: 'request', link_id, name, min, max, deadline, instructions, purpose }
//          a selection request for that link (e.g. "Choose 40 for your album by 1 March")
//   POST   /api/studio/galleries/lists { gallery_id, action: 'reopen', id }   let them change a list they sent
//   DELETE /api/studio/galleries/lists { gallery_id, id }
import { json } from '../../../../functions-lib/studio.js';
import { galleryLists, PURPOSES } from '../../../../functions-lib/gallery-lists.js';

const galleryOf = (env, id) => env.DB.prepare('SELECT id FROM photo_galleries WHERE id = ?1').bind(String(id ?? '')).first();

export async function onRequestGet({ request, env }) {
  const g = await galleryOf(env, new URL(request.url).searchParams.get('gallery_id'));
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  return json({ lists: await galleryLists(env, g.id), purposes: PURPOSES });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const g = await galleryOf(env, d.gallery_id);
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  if (d.action === 'request') {
    const link = await env.DB.prepare(`SELECT id FROM gallery_links WHERE id = ?1 AND gallery_id = ?2 AND kind IN ('main_client', 'invited')`).bind(Number(d.link_id), g.id).first();
    if (!link) return json({ error: 'Choose who it’s for.' }, 400);
    const n = (v) => (Number(v) > 0 ? Math.round(Number(v)) : null);
    const name = String(d.name ?? '').trim().slice(0, 60);
    if (!name) return json({ error: 'Give it a name, e.g. “Album selection”.' }, 400);
    await env.DB.prepare(`INSERT INTO gallery_lists (gallery_id, owner_link_id, name, kind, purpose, min_count, max_count, deadline, instructions, created_at)
      VALUES (?1, ?2, ?3, 'selection_request', ?4, ?5, ?6, ?7, ?8, ?9)`)
      .bind(g.id, link.id, name, PURPOSES[d.purpose] ? d.purpose : 'album', n(d.min), n(d.max), /^\d{4}-\d{2}-\d{2}$/.test(d.deadline ?? '') ? d.deadline : null,
        String(d.instructions ?? '').trim().slice(0, 1000), new Date().toISOString()).run();
    return json({ ok: true });
  }
  if (d.action === 'reopen') {
    await env.DB.prepare(`UPDATE gallery_lists SET status = 'open', submitted_at = NULL WHERE id = ?1 AND gallery_id = ?2`).bind(Number(d.id), g.id).run();
    return json({ ok: true });
  }
  return json({ error: 'What should happen?' }, 400);
}

export async function onRequestDelete({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const g = await galleryOf(env, d.gallery_id);
  if (!g) return json({ error: 'That gallery doesn’t exist.' }, 404);
  const l = await env.DB.prepare('SELECT id FROM gallery_lists WHERE id = ?1 AND gallery_id = ?2').bind(Number(d.id), g.id).first();
  if (!l) return json({ ok: true });
  await env.DB.batch([
    env.DB.prepare('DELETE FROM gallery_list_items WHERE list_id = ?1').bind(l.id),
    env.DB.prepare('DELETE FROM gallery_links WHERE list_id = ?1').bind(l.id),
    env.DB.prepare('DELETE FROM gallery_lists WHERE id = ?1').bind(l.id),
  ]);
  return json({ ok: true });
}
