// Music for slideshow Reels (Studio › Social › Music): Tony's tracks from Pixabay Music (free for
// commercial use), kept in R2 (GALLERY_WEB social/music/). Played and mixed into Reels in the editor.
//   GET  /api/studio/social/music              -> { music: [{ id, name, mood, seconds, used }] }
//   GET  /api/studio/social/music?play=<id>    the MP3 (same origin, so the editor can mix it)
//   POST /api/studio/social/music  (form: file, name, mood, seconds)   add a track
//   POST /api/studio/social/music { action: 'delete', id }             remove one
import { json } from '../../../../functions-lib/studio.js';

export async function onRequestGet({ request, env }) {
  const play = Number(new URL(request.url).searchParams.get('play'));
  if (play) {
    const m = await env.DB.prepare('SELECT file FROM social_music WHERE id = ?1').bind(play).first();
    const obj = m && await env.GALLERY_WEB.get(m.file);
    if (!obj) return new Response('Not found', { status: 404 });
    return new Response(obj.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' } });
  }
  const rows = (await env.DB.prepare(`SELECT m.id, m.name, m.mood, m.seconds, (SELECT count(*) FROM social_posts p WHERE p.music_id = m.id AND p.status = 'posted') used
      FROM social_music m ORDER BY lower(m.name)`).all()).results;
  return json({ music: rows });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if ((request.headers.get('content-type') ?? '').includes('application/json')) {
    const d = await request.json().catch(() => ({}));
    if (d.action !== 'delete') return json({ error: 'What should happen?' }, 400);
    const m = await db.prepare('SELECT * FROM social_music WHERE id = ?1').bind(Number(d.id)).first();
    if (!m) return json({ error: 'That track isn’t here any more.' }, 404);
    // Drafts and approved Reels using it go back to photos (posted ones keep their record).
    await db.batch([
      db.prepare(`UPDATE social_posts SET format = 'photos', music_id = NULL, media = NULL WHERE music_id = ?1 AND status IN ('draft', 'approved', 'failed')`).bind(m.id),
      db.prepare('DELETE FROM social_music WHERE id = ?1').bind(m.id),
    ]);
    await env.GALLERY_WEB.delete(m.file);
    return json({ ok: true });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file !== 'object' || !file.size) return json({ error: 'Choose an MP3 file.' }, 400);
  if (file.size > 25_000_000) return json({ error: 'That file is too big (25 MB at most).' }, 400);
  if (!/\.mp3$/i.test(file.name ?? '') && file.type !== 'audio/mpeg') return json({ error: 'It should be an MP3.' }, 400);
  const name = String(form.get('name') || file.name.replace(/\.mp3$/i, '')).trim().slice(0, 100);
  const key = `social/music/${Date.now().toString(36)}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'track'}.mp3`;
  await env.GALLERY_WEB.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: 'audio/mpeg', cacheControl: 'private, max-age=86400' } });
  const seconds = Number(form.get('seconds'));
  const r = await db.prepare('INSERT INTO social_music (name, mood, file, seconds, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(name, String(form.get('mood') ?? '').trim().slice(0, 60), key, Number.isFinite(seconds) && seconds > 0 ? seconds : null, new Date().toISOString()).run();
  return json({ id: r.meta.last_row_id });
}
