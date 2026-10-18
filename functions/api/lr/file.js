// The Lightroom plugin uploading one size of a photo (see functions/api/lr/index.js).
//   PUT /api/lr/file?id=…&size=original|web|thumb   (body: the JPEG)
import { json } from '../../../functions-lib/studio.js';
import { storeFile } from '../../../functions-lib/galleries.js';
import { lrAllowed } from './index.js';

export async function onRequestPut({ request, env }) {
  if (!(await lrAllowed(request, env))) return json({ error: 'The Lightroom key isn’t right.' }, 401);
  const u = new URL(request.url);
  try {
    return json(await storeFile(env, u.searchParams.get('id') ?? '', u.searchParams.get('size') ?? '', request));
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
// Lightroom's LrHttp sends uploads as POST more reliably than PUT on Windows; accept both.
export const onRequestPost = onRequestPut;
