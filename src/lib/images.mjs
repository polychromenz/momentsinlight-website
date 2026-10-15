// Photo addresses at a given width, for both places photos are hosted:
//  - Cloudflare Images (imagedelivery.net/<account hash>/<id>/<variant>): flexible variants,
//    w=NNN; Cloudflare picks WebP or AVIF for each browser automatically.
//  - Squarespace (until every photo has moved): ?format=NNNw.
// Anything else (local files, animated GIFs) is used as it is.
export const WIDTHS = [500, 750, 1000, 1500, 2048];

const isCloudflare = (src) => src.startsWith('https://imagedelivery.net/');
// Squarespace's resizing would flatten animated GIFs.
const isSquarespace = (src) => src.includes('squarespace-cdn.com') && !/\.gif$/i.test(src.split('?')[0]);

/** The photo at (about) the given width, or the address unchanged if it can't be resized. */
export function sized(src, width) {
  if (isCloudflare(src)) return src.replace(/\/[^/]+$/, `/w=${width}`);
  if (isSquarespace(src)) return `${src.split('?')[0]}?format=${width}w`;
  return src;
}

/** src and srcset for an <img>; srcset is undefined when the photo can't be resized. */
export function responsive(src, fallbackWidth = 1500) {
  if (!isCloudflare(src) && !isSquarespace(src)) return { src, srcset: undefined };
  return {
    src: sized(src, fallbackWidth),
    srcset: WIDTHS.map((w) => `${sized(src, w)} ${w}w`).join(', '),
  };
}
