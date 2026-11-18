// Prints: the sums and the product facts both the gallery page (src/gallery-shop.ts) and the server
// (functions-lib/prints.js) need, so the price a couple sees is the price they pay. No database here.
//
// Bulk prices (tiers) come from Pic-Time's "Tiered Pricing": e.g. 1: $9 each, 5 for $44 then $7 each,
// 10 for $79 then $5.80 each. They count every print of that product in the order, across photos.

/** How each Pic-Time product category is drawn and sold. 'other' = not sold per photo yet (albums,
 *  boxes, folios, collages, calendars, print packs). */
export const KINDS = {
  'Prints': 'print', 'Panoramic Prints': 'print', 'Deckled Prints': 'deckled', 'Matted Prints': 'matted',
  'Canvas': 'canvas', 'Frames': 'frame', 'Float Frames': 'float', 'Matted Frames': 'matted-frame',
  'Circular Frames': 'circle', 'Gallery Boards': 'board', 'Print Pack': 'pack',
  'Portrait Envelope': 'pack', // Tony's own: 10 × 8x10" printed in house in a portrait envelope (2026-11-19)
};
export const kindOf = (category) => KINDS[category] ?? 'other';
export const SOLD = new Set(Object.values(KINDS));
/** Paper prints go in an envelope; everything else is wall art (the lab's higher freight). */
export const PAPER = new Set(['print', 'deckled', 'matted', 'pack']);

/** Print quality (decided with Tony 2026-11-18): a warning under 200 dpi, and crops can't go under 150. */
export const DPI_WARN = 200;
export const DPI_MIN = 150;
/** How many prints a pack has ("24-Print Pack 10x15cm"). */
export const packCount = (p) => Number(String(p?.name ?? '').match(/(\d+)\s*-?\s*Print Pack/i)?.[1]) || 24;
/** The smallest crop width (fraction of the photo) that still prints at DPI_MIN. origW: the original's width in px. */
export const minCropW = (origW, p, landscape) => {
  const cm = landscape ? p.h_cm : p.w_cm;
  return origW && cm ? ((cm / 2.54) * DPI_MIN) / origW : 0;
};
/** A pack's photos with how many prints of each, filled up to `count` by repeating them evenly. */
export function fillPack(picks, count) {
  const out = picks.map((x) => ({ ...x, n: Math.max(0, Math.floor(Number(x.n) || 0)) }));
  if (!out.length) return out;
  let left = count - out.reduce((a, x) => a + x.n, 0);
  while (left > 0) {
    const low = out.reduce((m, x) => (x.n < m.n ? x : m), out[0]);
    low.n++; left--;
  }
  return out;
}

// A-sizes in cm (short side first).
const A_SIZES = { A2: [42, 59.4], A3: [29.7, 42], A4: [21, 29.7] };

/** The photo's size on the product, short side first: [w, h] in cm, or null (e.g. albums). */
export function sizeOf(name) {
  const s = String(name ?? '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*cm/i);
  if (m) { const a = Number(m[1]), b = Number(m[2]); return [Math.min(a, b), Math.max(a, b)]; }
  const a = s.match(/\bA([2-4])\b/i);
  return a ? A_SIZES[`A${a[1]}`] : null;
}

/** A Pic-Time price ("$1,005.00") in dollars. */
export const dollars = (s) => Number(String(s ?? '').replace(/[^0-9.]/g, '')) || 0;

/** Pic-Time's tier text, e.g. "1: $9.04 + add x $9.045: $43.62 + add x $7.4310: $79.14 + add x $5.81"
 *  (the CSV runs each tier's quantity straight on after the previous add price) → [{ q, base, add }] in dollars. */
export function parseTiers(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const out = [];
  // Each tier: "<q>: $<base> + add x $<add>", where the add price has exactly 2 decimals and the next q follows it.
  const re = /(\d+):\s*\$([\d,]+\.\d{2})\s*\+\s*add\s*x\s*\$([\d,]*\d\.\d{2})/g;
  let m;
  while ((m = re.exec(t))) out.push({ q: Number(m[1]), base: dollars(m[2]), add: dollars(m[3]) });
  return out.length ? out : null;
}

/** A tidy NZ$ price in cents: under $10 to the nearest 50c, under $100 whole dollars, under $500 the
 *  nearest $5, then the nearest $10. */
export function tidy(nzd) {
  if (nzd <= 0) return 0;
  if (nzd < 10) return Math.max(50, Math.round(nzd * 2) * 50);
  if (nzd < 100) return Math.round(nzd) * 100;
  if (nzd < 500) return Math.round(nzd / 5) * 500;
  return Math.round(nzd / 10) * 1000;
}

/** What `qty` of one product costs (cents), using its bulk prices if it has them. */
export function productTotal(p, qty) {
  const n = Math.max(0, Math.floor(qty));
  if (!n) return 0;
  const tiers = (Array.isArray(p.tiers) ? p.tiers : p.tiers ? JSON.parse(p.tiers) : null) ?? [];
  const t = tiers.filter((x) => x.q <= n).sort((a, b) => b.q - a.q)[0];
  return t ? t.base + (n - t.q) * t.add : n * p.price;
}

/** The order's sums. lines: [{ product_id, qty, … }]; products: id → product; s: the prints settings.
 *  Each line gets `amount` (its share of its product's total, so bulk savings spread across photos). */
export function orderTotals(lines, products, s) {
  const by = new Map();
  for (const l of lines) by.set(l.product_id, (by.get(l.product_id) ?? 0) + l.qty);
  const out = lines.map((l) => ({ ...l }));
  let subtotal = 0, wall = false, saved = 0;
  for (const [id, qty] of by) {
    const p = products.get(id);
    if (!p) continue;
    const total = productTotal(p, qty);
    subtotal += total;
    saved += qty * p.price - total;
    if (!PAPER.has(p.kind)) wall = true;
    // Spread the product's total over its lines by quantity (the last line takes any rounding).
    const mine = out.filter((l) => l.product_id === id);
    let left = total;
    mine.forEach((l, k) => { l.amount = k === mine.length - 1 ? left : Math.round((total * l.qty) / qty); left -= l.amount; });
  }
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const free = s.free_over > 0 && subtotal >= s.free_over;
  const freight = !count || free ? 0 : wall ? s.freight_wall : s.freight_prints;
  return { lines: out, subtotal, freight, total: subtotal + freight, saved: Math.max(0, saved), wall, free };
}

/** The crop that fills a print of ratio r (width / height) from a photo of ratio pr, centred. Fractions of the photo. */
export function centredCrop(pr, r) {
  if (pr > r) { const w = r / pr; return { x: (1 - w) / 2, y: 0, w, h: 1 }; }
  const h = pr / r; return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/** A crop sent by a browser, made safe (inside the photo, the right shape, not smaller than minW
 *  of the photo's width when given); fallback: centred. */
export function cleanCrop(c, pr, r, minW = 0) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
  let { x, y, w, h } = { x: n(c?.x), y: n(c?.y), w: n(c?.w), h: n(c?.h) };
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return centredCrop(pr, r);
  // Keep the shape (w·pr / h = r), at most the whole photo, at least 15% of it.
  const full = centredCrop(pr, r);
  w = Math.min(full.w, Math.max(full.w * 0.15, minW, w));
  h = (w * pr) / r;
  x = Math.min(1 - w, Math.max(0, x));
  y = Math.min(1 - h, Math.max(0, y));
  return { x: +x.toFixed(5), y: +y.toFixed(5), w: +w.toFixed(5), h: +h.toFixed(5) };
}

/** The print's shape for a product and orientation: width / height. */
export const ratioOf = (p, landscape) => (p.w_cm && p.h_cm ? (landscape ? p.h_cm / p.w_cm : p.w_cm / p.h_cm) : 1);

/** Dots per inch the photo would print at (to warn about small crops). origW: the original's width in px. */
export const dpi = (origW, crop, p, landscape) => {
  const longCm = landscape ? p.h_cm : p.w_cm; // the print's width in cm in this orientation
  return longCm ? (origW * crop.w) / (longCm / 2.54) : 0;
};

export const money = (c) => `$${(c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
