// Albums (Seldex Boutique Book): the sizes, limits and print margins both the studio designer
// (src/studio/album-*.ts) and the server (functions/api/studio/galleries/albums.js) use. No database here.
// Seldex's file rules (seldex.com.au/filepreparation): double-page spreads as JPEG, sRGB or Adobe RGB,
// 300 dpi at the exact size, so a W × H album has spread files of 2W × H inches, named 001.jpg onwards.

/** Boutique Book sizes offered in the designer so far (page width x height in inches, portrait as Seldex
 *  lists them). Square sizes have one orientation; the others can be portrait or landscape (turned). */
export const ALBUM_SIZES = {
  '12x12': { w: 12, h: 12 },
  '10x10': { w: 10, h: 10 },
  '11x14': { w: 11, h: 14 },
  '10x14': { w: 10, h: 14 },
};
export const SPREADS_MIN = 10;
export const SPREADS_MAX = 45;
export const ALBUM_DPI = 300;

/** Print margins in inches. NOT CONFIRMED by Seldex yet (their site doesn't say): change them here once
 *  Seldex replies, and every guide, layout and export follows.
 *  bleed:  extra image past the trim on the outside edges (0 = files are exactly the trim size, as Seldex's
 *          stated sizes suggest).
 *  safe:   keep faces and text this far inside the trim.
 *  gutter: keep this much clear each side of the centre fold (layflat pages still lose a little there). */
export const ALBUM_MARGINS = { bleed: 0, safe: 0.25, gutter: 0.375, confirmed: false };

/** Page size in inches for a size and orientation: { w, h } of ONE page. */
export function pageSize(size, orientation) {
  const s = ALBUM_SIZES[size] ?? ALBUM_SIZES['10x10'];
  if (s.w === s.h) return { w: s.w, h: s.h };
  return orientation === 'landscape' ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
}
/** A spread file's size in pixels (both pages, plus bleed on the outside edges). */
export function spreadPx(size, orientation) {
  const p = pageSize(size, orientation), b = ALBUM_MARGINS.bleed;
  return { w: Math.round((2 * p.w + 2 * b) * ALBUM_DPI), h: Math.round((p.h + 2 * b) * ALBUM_DPI) };
}
export const orientationsOf = (size) => (ALBUM_SIZES[size] && ALBUM_SIZES[size].w !== ALBUM_SIZES[size].h ? ['portrait', 'landscape'] : ['square']);
export const sizeLabel = (size, orientation) => {
  const p = pageSize(size, orientation);
  return `${p.w}×${p.h}″ ${orientation === 'square' ? 'square' : orientation}`;
};
