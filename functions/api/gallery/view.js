// The client gallery: everything a visitor may see, and their own favourites and lists.
//   GET /api/gallery/view?v=<visitor token>  -> { gallery, cover, rights, sections, images, lists, me, dropbox }  (401 if the token no longer works)
// dropbox: the Dropbox app key (public) for "Save to Dropbox", when DROPBOX_APP_KEY is set.
import { json } from '../../../functions-lib/studio.js';
import { viewerAccess, galleryView } from '../../../functions-lib/gallery-access.js';
import { myLists, PURPOSES } from '../../../functions-lib/gallery-lists.js';

export async function onRequestGet({ request, env }) {
  const a = await viewerAccess(env, new URL(request.url).searchParams.get('v'));
  if (!a) return json({ error: 'expired' }, 401);
  return json({
    ...(await galleryView(env, a.gallery, a.link, a.viewer.token)),
    lists: await myLists(env, a),
    purposes: PURPOSES,
    me: { name: a.viewer.name || a.link.name || '', kind: a.link.kind },
    dropbox: env.DROPBOX_APP_KEY || null,
  });
}
