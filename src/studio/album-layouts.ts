// Albums: page layouts, the automatic first draft, and the crop sums (src/studio/album-designer.ts draws
// them, src/studio/album-export.ts renders them at 300 dpi). Everything is in inches on the spread, with
// x = 0 at the left edge of the left page and the fold at x = page width.
//
// A spread is { layout: 'span' | [left page layout, right page layout], slots: photo ids (left page's
// frames first), crops: one { cx, cy, z } per slot: the centre of the crop as a fraction of the photo and
// the zoom (1 = the photo just covers the frame).
//
// The gutter rule (Tony's plan): a photo never runs across the fold, except a spread that Tony sets to
// "Across both pages" himself, where the designer shows the fold so he can keep faces off it.
import { ALBUM_MARGINS } from '../../functions-lib/album-sizes.js';
import { DPI_MIN, DPI_WARN } from '../../functions-lib/print-pricing.js';

export { DPI_MIN, DPI_WARN };
export type Crop = { cx: number; cy: number; z: number };
export type Spread = { layout: 'span' | [string, string]; slots: (string | null)[]; crops: Crop[] };
export type Photo = { id: string; width: number; height: number; is_hero?: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Page = { w: number; h: number };

/** Space around photos that don't fill the page, and between photos, in inches. The margin is wider than
 *  the safe area and the gutter (ALBUM_MARGINS), so framed photos are always clear of both. */
export const MARGIN = Math.max(0.6, ALBUM_MARGINS.safe + 0.25, ALBUM_MARGINS.gutter + 0.2);
export const GAP = 0.2;

export const PAGE_LAYOUTS: Record<string, { n: number; label: string }> = {
  blank: { n: 0, label: 'Blank page' },
  full: { n: 1, label: '1 photo, whole page' },
  framed: { n: 1, label: '1 photo with a border' },
  'two-h': { n: 2, label: '2 side by side' },
  'two-v': { n: 2, label: '2 one above the other' },
  'three-big': { n: 3, label: '3: one big, two small' },
  'three-t': { n: 3, label: '3: one across the top' },
  'three-h': { n: 3, label: '3 side by side' },
  four: { n: 4, label: '4 in a grid' },
};
export const SPAN_LABEL = 'Across both pages (check the fold)';

export const aspect = (p: Photo | undefined) => (p && p.width && p.height ? p.width / p.height : 1.5);
const fit = (box: Rect, a: number): Rect => {
  const w = Math.min(box.w, box.h * a), h = w / a;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
};

/** The frames of one page layout, in page inches. aspects: the photos' shapes (only 'framed' uses them). */
export function pageRects(layout: string, page: Page, aspects: number[] = [], outerLeft = true): Rect[] {
  const { w: W, h: H } = page, M = MARGIN, G = GAP;
  const box = { x: M, y: M, w: W - 2 * M, h: H - 2 * M };
  switch (layout) {
    case 'full': return [{ x: 0, y: 0, w: W, h: H }];
    case 'framed': return [fit(box, aspects[0] ?? box.w / box.h)];
    case 'two-h': { const w = (box.w - G) / 2; return [{ ...box, w }, { ...box, x: box.x + w + G, w }]; }
    case 'two-v': { const h = (box.h - G) / 2; return [{ ...box, h }, { ...box, y: box.y + h + G, h }]; }
    case 'three-h': { const w = (box.w - 2 * G) / 3; return [0, 1, 2].map((k) => ({ ...box, x: box.x + k * (w + G), w })); }
    case 'three-t': {
      const th = (box.h - G) * 0.6, bh = box.h - G - th, w = (box.w - G) / 2;
      return [{ ...box, h: th }, { x: box.x, y: box.y + th + G, w, h: bh }, { x: box.x + w + G, y: box.y + th + G, w, h: bh }];
    }
    case 'three-big': {
      // The big photo on the outside edge of the page, the two small ones stacked by the fold.
      const bw = (box.w - G) * 0.6, sw = box.w - G - bw, sh = (box.h - G) / 2;
      const bx = outerLeft ? box.x : box.x + sw + G, sx = outerLeft ? box.x + bw + G : box.x;
      return [{ x: bx, y: box.y, w: bw, h: box.h }, { x: sx, y: box.y, w: sw, h: sh }, { x: sx, y: box.y + sh + G, w: sw, h: sh }];
    }
    case 'four': {
      const w = (box.w - G) / 2, h = (box.h - G) / 2;
      return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => ({ x: box.x + i * (w + G), y: box.y + j * (h + G), w, h }));
    }
    default: return [];
  }
}

/** How many photos a spread layout holds. */
export const slotsOf = (layout: Spread['layout']) => (layout === 'span' ? 1 : PAGE_LAYOUTS[layout[0]].n + PAGE_LAYOUTS[layout[1]].n);

/** Every frame of a spread, in spread inches, with its slot number. */
export function spreadRects(s: Spread, page: Page, photos: Map<string, Photo>): (Rect & { slot: number })[] {
  if (s.layout === 'span') return [{ x: 0, y: 0, w: page.w * 2, h: page.h, slot: 0 }];
  const [l, r] = s.layout;
  const nl = PAGE_LAYOUTS[l]?.n ?? 0;
  const asp = (k: number) => aspect(photos.get(s.slots[k] ?? ''));
  const left = pageRects(l, page, [asp(0)], true).map((f, k) => ({ ...f, slot: k }));
  const right = pageRects(r, page, [asp(nl)], false).map((f, k) => ({ ...f, x: f.x + page.w, slot: nl + k }));
  return [...left, ...right];
}

// ---- Crops ----
/** The part of the photo a frame shows, in the photo's own pixels, and the dpi it prints at.
 *  pw, ph: the photo's size in px (the original's). */
export function cropBox(frame: { w: number; h: number }, pw: number, ph: number, c: Crop | undefined) {
  const s0 = Math.max(frame.w / pw, frame.h / ph); // inches per pixel when the photo just covers the frame
  const z = Math.min(maxZoom(frame, pw, ph), Math.max(1, c?.z ?? 1));
  const s = s0 * z;
  const vw = frame.w / s, vh = frame.h / s;
  const sx = Math.min(pw - vw, Math.max(0, (c?.cx ?? 0.5) * pw - vw / 2));
  const sy = Math.min(ph - vh, Math.max(0, (c?.cy ?? 0.5) * ph - vh / 2));
  return { sx, sy, sw: vw, sh: vh, scale: s, dpi: 1 / s, z };
}
/** The most a photo can be zoomed in a frame before it would print under DPI_MIN (never under 1). */
export function maxZoom(frame: { w: number; h: number }, pw: number, ph: number) {
  const s0 = Math.max(frame.w / pw, frame.h / ph);
  return Math.max(1, 1 / s0 / DPI_MIN);
}

// ---- The automatic first draft ----
const shape = (p: Photo) => { const a = aspect(p); return a > 1.1 ? 'L' : a < 0.9 ? 'P' : 'S'; };

/** The layout for one page holding these photos (in order). */
export function pageLayoutFor(ps: Photo[], page: Page): string {
  const pa = page.w / page.h;
  const sh = ps.map(shape);
  if (ps.length === 0) return 'blank';
  if (ps.length === 1) return Math.abs(Math.log(aspect(ps[0]) / pa)) < Math.log(1.2) ? 'full' : 'framed';
  if (ps.length === 2) {
    if (sh.every((x) => x === 'L')) return 'two-v';
    if (sh.every((x) => x === 'P')) return 'two-h';
    return pa < 1 ? 'two-v' : 'two-h';
  }
  if (ps.length === 3) {
    if (sh.every((x) => x === 'P') && pa >= 1) return 'three-h';
    if (sh[0] === 'L') return 'three-t';
    return 'three-big';
  }
  return 'four';
}

/** One spread from up to 4 photos: never across the fold. 1 photo sits on the right page; 3 photos put
 *  the landscape one (or the first) on a page of its own. */
export function spreadFor(ps: Photo[], page: Page): Spread {
  let left: Photo[] = [], right: Photo[] = [];
  if (ps.length === 1) right = ps;
  else if (ps.length === 2) { left = [ps[0]]; right = [ps[1]]; }
  else if (ps.length === 3) {
    // Keep the order: 1 + 2 or 2 + 1, whichever leaves a landscape (or highlight) photo on its own.
    const solo = (p: Photo) => (p.is_hero ? 2 : 0) + (shape(p) === 'L' ? 1 : 0);
    if (solo(ps[2]) > solo(ps[0])) { left = ps.slice(0, 2); right = [ps[2]]; } else { left = [ps[0]]; right = ps.slice(1); }
  } else { left = ps.slice(0, 2); right = ps.slice(2, 4); }
  const all = [...left, ...right];
  return { layout: [pageLayoutFor(left, page), pageLayoutFor(right, page)], slots: all.map((p) => p.id), crops: all.map(() => ({ cx: 0.5, cy: 0.5, z: 1 })) };
}

/** The first draft: the photos (in gallery order) flowed into `count` spreads, 1 to 4 a spread, spread
 *  as evenly as they go. Highlights get a spread with fewer photos where there's room. Returns the spreads
 *  and the photos that didn't fit (more than 4 a spread). */
export function autoLayout(photos: Photo[], count: number, page: Page): { spreads: Spread[]; left: Photo[] } {
  const n = Math.min(photos.length, count * 4);
  const per: number[] = Array.from({ length: count }, (_, k) => Math.floor(n / count) + (k < n % count ? 1 : 0));
  const spreads: Spread[] = [];
  let at = 0;
  for (let k = 0; k < count; k++) {
    let take = per[k];
    // A highlight among the next photos: give it room (fewer this spread, the rest carried on) if a later
    // spread can take one more.
    if (take > 1 && photos.slice(at, at + take).some((p) => p.is_hero)) {
      const room = per.slice(k + 1).findIndex((x) => x < 4);
      if (room >= 0) { per[k + 1 + room]++; take--; }
    }
    spreads.push(spreadFor(photos.slice(at, at + take), page));
    at += take;
  }
  return { spreads, left: photos.slice(at) };
}

/** A spread changed to another layout: the photos stay in order, any that no longer fit come back. */
export function relayout(s: Spread, layout: Spread['layout']): { spread: Spread; dropped: string[] } {
  const n = slotsOf(layout);
  const ids = s.slots.filter((x): x is string => !!x);
  const crops = s.slots.map((x, k) => [x, s.crops[k]] as const).filter(([x]) => !!x).map(([, c]) => c ?? { cx: 0.5, cy: 0.5, z: 1 });
  const slots: (string | null)[] = Array.from({ length: n }, (_, k) => ids[k] ?? null);
  return { spread: { layout, slots, crops: Array.from({ length: n }, (_, k) => (ids[k] ? { ...crops[k], z: 1 } : { cx: 0.5, cy: 0.5, z: 1 })) }, dropped: ids.slice(n) };
}
