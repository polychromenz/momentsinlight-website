// The client gallery: someone arriving (public; no studio sign-in).
//   POST /api/gallery/enter { slug, key? (from the link), code? (typed), viewer? (kept in their browser), name?, email?, consent? }
//   -> { status: 'in', viewer } or { status: 'code' | 'email' | 'expired' | 'gone', gallery?, cover?, error? }
import { json } from '../../../functions-lib/studio.js';
import { enterGallery } from '../../../functions-lib/gallery-access.js';

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  return json(await enterGallery(env, d));
}
