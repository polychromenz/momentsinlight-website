// The client gallery: favourites, lists, hiding, sharing a list, sending a list to Tony.
//   POST /api/gallery/act { v, action, ... }   (see functions-lib/gallery-lists.js act())
import { json } from '../../../functions-lib/studio.js';
import { viewerAccess } from '../../../functions-lib/gallery-access.js';
import { act } from '../../../functions-lib/gallery-lists.js';

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const a = await viewerAccess(env, d.v);
  if (!a) return json({ error: 'This gallery link no longer works. Please reload the page.' }, 401);
  try {
    return json(await act(env, a, d));
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
