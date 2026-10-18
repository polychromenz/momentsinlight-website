// The client gallery: everything a visitor may see.
//   GET /api/gallery/view?v=<visitor token>  -> { gallery, cover, rights, sections, images }  (401 if the token no longer works)
import { json } from '../../../functions-lib/studio.js';
import { viewerAccess, galleryView } from '../../../functions-lib/gallery-access.js';

export async function onRequestGet({ request, env }) {
  const a = await viewerAccess(env, new URL(request.url).searchParams.get('v'));
  if (!a) return json({ error: 'expired' }, 401);
  return json(await galleryView(env, a.gallery, a.link, a.viewer.token));
}
