// The photo files for a Facebook or Instagram post, made in the editor (Tony's crop, the platform's
// size) and kept at a public address for Meta to fetch when it publishes (functions-lib/meta.js).
//   POST /api/studio/social/media  (form: id, files…)  -> { media: [url…] }
import { json } from '../../../../functions-lib/studio.js';
import { storeMedia } from '../../../../functions-lib/meta.js';
import { PLATFORMS } from '../../../../functions-lib/social.js';

export async function onRequestPost({ request, env }) {
  const form = await request.formData().catch(() => null);
  const p = form && await env.DB.prepare('SELECT * FROM social_posts WHERE id = ?1').bind(Number(form.get('id'))).first();
  if (!p) return json({ error: 'That post isn’t here any more.' }, 404);
  if (!['draft', 'approved', 'failed'].includes(p.status)) return json({ error: 'That one has already gone out.' }, 400);
  const files = form.getAll('files').filter((f) => typeof f === 'object' && f.size > 0 && f.size < 15_000_000).slice(0, PLATFORMS[p.platform]?.max ?? 1);
  if (!files.length) return json({ error: 'No photos came through.' }, 400);
  const media = await storeMedia(env, p.id, await Promise.all(files.map((f) => f.arrayBuffer())));
  await env.DB.prepare('UPDATE social_posts SET media = ?2 WHERE id = ?1').bind(p.id, JSON.stringify(media)).run();
  return json({ media });
}
