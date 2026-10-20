// A person's signature photo (Settings > People), kept where email programs can load it:
// photos.momentsinlight.co.nz/people/… (the public gallery bucket). Owners only (the Settings area).
//   POST /api/studio/people/photo  (form: file — a small JPEG the page has already resized)  -> { url }
import { json } from '../../../../functions-lib/studio.js';

export async function onRequestPost({ request, env }) {
  const form = await request.formData().catch(() => null);
  const f = form?.get('file');
  if (!f || typeof f !== 'object' || !f.size) return json({ error: 'No photo came through.' }, 400);
  if (f.size > 2_000_000) return json({ error: 'That photo is too big (2 MB at most).' }, 400);
  const key = `people/${crypto.randomUUID().slice(0, 12)}.jpg`;
  await env.GALLERY_WEB.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' } });
  return json({ url: `https://photos.momentsinlight.co.nz/${key}` });
}
