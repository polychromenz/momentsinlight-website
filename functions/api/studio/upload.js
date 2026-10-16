// A one-time address for the browser to upload a photo straight to Cloudflare Images, so the
// Images key never leaves the server.
//   POST /api/studio/upload { id }  -> { id, uploadURL, src }
// `id` is the photo's name in Cloudflare Images, e.g. "2026-ellie-and-ryan/_Q9A1234"; if it's
// already taken, a number is added.
import { json, IMAGES_HASH } from '../../../functions-lib/studio.js';

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const base = String(body.id || '').replace(/[^A-Za-z0-9/_.-]+/g, '-').replace(/^[/-]+|[/-]+$/g, '').slice(0, 180);
  for (let n = 0; n < 5; n++) {
    const form = new FormData();
    if (base) form.append('id', n ? `${base}-${n + 1}` : base);
    form.append('requireSignedURLs', 'false');
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v2/direct_upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CF_IMAGES_TOKEN}` },
      body: form,
    });
    const data = await r.json().catch(() => null);
    if (r.ok && data?.success) {
      const id = data.result.id;
      return json({ id, uploadURL: data.result.uploadURL, src: `https://imagedelivery.net/${IMAGES_HASH}/${id}/public` });
    }
    // 5409: that name is already used; try the next number.
    if (!data?.errors?.some((e) => e.code === 5409 || /already exists/i.test(e.message))) {
      return json({ error: `Couldn’t start the upload (${data?.errors?.[0]?.message ?? r.status}).` }, 502);
    }
  }
  return json({ error: 'Couldn’t find a free name for that photo.' }, 409);
}
