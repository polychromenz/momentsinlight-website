// Buying prints from a client gallery (functions-lib/prints.js). The shop's products come with the
// gallery (/api/gallery/view → shop); this takes the cart to payment.
//   POST /api/gallery/prints { v, items: [{ image_id, product_id, qty, crop, landscape }], note?, back, test? }
//     -> { url } Stripe's payment page, or { done: 'P-2026-0001' } for Tony's test orders
import { json } from '../../../functions-lib/studio.js';
import { viewerAccess } from '../../../functions-lib/gallery-access.js';
import { placeOrder } from '../../../functions-lib/prints.js';

const OK_HOSTS = ['www.momentsinlight.co.nz', 'galleries.momentsinlight.co.nz', 'localhost'];

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const a = await viewerAccess(env, d.v);
  if (!a) return json({ error: 'This gallery link no longer works. Please reload the page.' }, 401);
  let back;
  try { back = new URL(String(d.back)); } catch { back = null; }
  if (!back || !OK_HOSTS.includes(back.hostname)) back = new URL(`https://galleries.momentsinlight.co.nz/${a.gallery.slug}`);
  back.search = ''; back.hash = '';
  try {
    return json(await placeOrder(env, a, d, back.href));
  } catch (e) {
    console.error('prints order', e.message);
    return json({ error: e.message }, 400);
  }
}
