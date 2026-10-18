// Tony's monogram on a gallery photo, for links that need a watermark. Made once per photo and size
// with Cloudflare's image transformations (draw), then kept in the private bucket (wm/…), so
// the clean photo is never sent to those visitors.
import { webUrl } from './galleries.js';

const MARK = 'https://www.momentsinlight.co.nz/brand/watermark.png';

/** The watermarked JPEG (a stream), size 2048 or 600. Throws if watermarking isn't available. */
export async function watermarked(env, galleryId, img, size, request) {
  const key = `wm/${galleryId}/${img.id}_${size}.jpg`;
  const have = await env.GALLERY_FILES.get(key);
  if (have) return have.body;
  // How big the stored web/thumb copy is, so the monogram is 35% of its shorter side.
  const scale = Math.min(1, size / Math.max(img.width || size, img.height || size));
  const short = Math.round(Math.min(img.width || size, img.height || size) * scale);
  const res = await fetch(webUrl(galleryId, img.id, size === 600 ? 'thumb' : 'web'), {
    cf: { image: { quality: 85, format: 'jpeg', draw: [{ url: MARK, width: Math.max(60, Math.round(short * 0.35)), opacity: 0.55 }] } },
  });
  if (!res.ok || !res.headers.get('cf-resized')) throw new Error('watermarking unavailable');
  const bytes = new Uint8Array(await res.arrayBuffer());
  await env.GALLERY_FILES.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  return bytes;
}
