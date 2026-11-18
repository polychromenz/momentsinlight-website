// "In a room": the couple's photo in a framed print on a wall, from Seldex's free stock room scenes
// (seldex.com.au/stock-images, Framed Prints; added with Tony 2026-11-19). Each scene has a matted
// frame whose picture area was a blank grey box (made for dropping a photo in). Its position (`hole`)
// and the mat's outer edge (`open`) were measured from the originals, as fractions of the scene.
// Matted frames show the photo in the hole, with the mat widened to the print's shape; plain frames
// show the photo over the whole mat (no mat). The scene is picked by the print's shape, then by the
// frame colour closest to the one chosen.
import { croppedPhoto, type Product, type Crop } from './mockup';
import { ratioOf } from '../../functions-lib/print-pricing.js';

type Room = { src: string; colour: string; ar: number; hole: number[]; open: number[]; mat: string; kind?: 'torn' | 'circle'; mask?: string };
const ROOMS: Room[] = [
  { src: '/prints/rooms/10x10-greystone.webp?v=2', colour: 'greystone', ar: 1.3915, hole: [0.3665, 0.2925, 0.2597, 0.3608], open: [0.3263, 0.2311, 0.3403, 0.4835], mat: '#eaebed' },
  { src: '/prints/rooms/11x14-camel.webp?v=2', colour: 'camel', ar: 1.3915, hole: [0.3581, 0.2134, 0.272, 0.5077], open: [0.3119, 0.1539, 0.3644, 0.6268], mat: '#e4e5e7' },
  { src: '/prints/rooms/12x12-black.webp?v=2', colour: 'black', ar: 1.3915, hole: [0.3496, 0.2695, 0.3021, 0.4198], open: [0.2992, 0.194, 0.403, 0.5708], mat: '#eaebed' },
  { src: '/prints/rooms/12x16-walnut.webp?v=2', colour: 'walnut', ar: 1.3915, hole: [0.2915, 0.2824, 0.3792, 0.3945], open: [0.2475, 0.2152, 0.4674, 0.5289], mat: '#e8e9eb' },
  { src: '/prints/rooms/14x14-white.webp?v=2', colour: 'white', ar: 1.3915, hole: [0.3242, 0.2488, 0.3424, 0.4758], open: [0.2661, 0.1598, 0.4585, 0.6539], mat: '#eaebed' },
  { src: '/prints/rooms/16x20-espresso.webp?v=2', colour: 'espresso', ar: 1.3915, hole: [0.3263, 0.2553, 0.3949, 0.4086], open: [0.2784, 0.184, 0.4907, 0.5513], mat: '#eaebed' },
  { src: '/prints/rooms/16x24-oyster.webp?v=2', colour: 'oyster', ar: 1.3915, hole: [0.3568, 0.2588, 0.4517, 0.408], open: [0.3059, 0.1887, 0.5534, 0.5483], mat: '#e9eaec' },
  { src: '/prints/rooms/20x20-white.webp?v=2', colour: 'white', ar: 1.3915, hole: [0.4843, 0.2529, 0.228, 0.3166], open: [0.4428, 0.1851, 0.311, 0.4522], mat: '#ebecee' },
  { src: '/prints/rooms/20x24-walnut.webp?v=2', colour: 'walnut', ar: 1.3915, hole: [0.4331, 0.2541, 0.3072, 0.319], open: [0.397, 0.1993, 0.3792, 0.4287], mat: '#e8e9eb' },
  { src: '/prints/rooms/20x30-black.webp?v=2', colour: 'black', ar: 1.3915, hole: [0.4013, 0.2376, 0.4398, 0.3449], open: [0.3589, 0.1745, 0.5246, 0.4711], mat: '#ebecee' },
  { src: '/prints/rooms/24x24-camel.webp?v=2', colour: 'camel', ar: 1.3915, hole: [0.4305, 0.1999, 0.1381, 0.1922], open: [0.4089, 0.1651, 0.1814, 0.2618], mat: '#eaebed' },
  { src: '/prints/rooms/24x34-greystone.webp?v=2', colour: 'greystone', ar: 1.3915, hole: [0.3881, 0.1916, 0.2237, 0.2064], open: [0.3614, 0.1539, 0.2771, 0.2818], mat: '#eaebed' },
  { src: '/prints/rooms/30x30-espresso.webp?v=2', colour: 'espresso', ar: 1.3915, hole: [0.4195, 0.1686, 0.1653, 0.2305], open: [0.3919, 0.1274, 0.2203, 0.3131], mat: '#ecedef' },
  { src: '/prints/rooms/30x40-white.webp?v=2', colour: 'white', ar: 1.3915, hole: [0.3585, 0.1592, 0.2835, 0.2429], open: [0.3225, 0.112, 0.3555, 0.3373], mat: '#eaebed' },
  { src: '/prints/rooms/40x40-camel.webp?v=2', colour: 'camel', ar: 1.3915, hole: [0.3958, 0.1344, 0.2055, 0.2854], open: [0.3636, 0.0843, 0.2699, 0.3856], mat: '#e8e9eb' },
  { src: '/prints/rooms/8x10-white.webp?v=2', colour: 'white', ar: 1.3915, hole: [0.3864, 0.2412, 0.2169, 0.4057], open: [0.3453, 0.1904, 0.2992, 0.5071], mat: '#e4e5e7' },
  // Seldex Hand Torn Frames stock scenes (2026-11-19): the torn print's outline is cut from `mask`.
  { src: '/prints/rooms/torn-circle-black.webp?v=2', mask: '/prints/rooms/torn-circle-black-mask.png?v=2', kind: 'circle', colour: 'black', ar: 1.3915, hole: [0.3407, 0.2264, 0.3292, 0.4558], open: [0.3407, 0.2264, 0.3292, 0.4558], mat: '#ebecee' },
  { src: '/prints/rooms/torn-horizontal-black.webp?v=2', mask: '/prints/rooms/torn-horizontal-black-mask.png?v=2', kind: 'torn', colour: 'black', ar: 1.3915, hole: [0.3983, 0.2075, 0.3767, 0.4039], open: [0.3983, 0.2075, 0.3767, 0.4039], mat: '#ebecee' },
  { src: '/prints/rooms/torn-square-black.webp?v=2', mask: '/prints/rooms/torn-square-black-mask.png?v=2', kind: 'torn', colour: 'black', ar: 1.3915, hole: [0.3492, 0.2429, 0.3106, 0.4298], open: [0.3492, 0.2429, 0.3106, 0.4298], mat: '#ebecee' },
  { src: '/prints/rooms/torn-circle-camel.webp?v=2', mask: '/prints/rooms/torn-circle-camel-mask.png?v=2', kind: 'circle', colour: 'camel', ar: 1.3915, hole: [0.3085, 0.2476, 0.3309, 0.4581], open: [0.3085, 0.2476, 0.3309, 0.4581], mat: '#ebecee' },
  { src: '/prints/rooms/torn-square-camel.webp?v=2', mask: '/prints/rooms/torn-square-camel-mask.png?v=2', kind: 'torn', colour: 'camel', ar: 1.3915, hole: [0.3136, 0.2547, 0.3242, 0.4487], open: [0.3136, 0.2547, 0.3242, 0.4487], mat: '#ebecee' },
  { src: '/prints/rooms/torn-vertical-camel.webp?v=2', mask: '/prints/rooms/torn-vertical-camel-mask.png?v=2', kind: 'torn', colour: 'camel', ar: 1.3915, hole: [0.3678, 0.2099, 0.2733, 0.5171], open: [0.3678, 0.2099, 0.2733, 0.5171], mat: '#ebecee' },
  { src: '/prints/rooms/torn-circle-charcoal.webp?v=2', mask: '/prints/rooms/torn-circle-charcoal-mask.png?v=2', kind: 'circle', colour: 'charcoal', ar: 1.3915, hole: [0.4017, 0.2052, 0.2835, 0.3921], open: [0.4017, 0.2052, 0.2835, 0.3921], mat: '#ebecee' },
  { src: '/prints/rooms/torn-horizontal-charcoal.webp?v=2', mask: '/prints/rooms/torn-horizontal-charcoal-mask.png?v=2', kind: 'torn', colour: 'charcoal', ar: 1.3915, hole: [0.3966, 0.2594, 0.3089, 0.3308], open: [0.3966, 0.2594, 0.3089, 0.3308], mat: '#ebecee' },
  { src: '/prints/rooms/torn-square-charcoal.webp?v=2', mask: '/prints/rooms/torn-square-charcoal-mask.png?v=2', kind: 'torn', colour: 'charcoal', ar: 1.3915, hole: [0.4051, 0.2146, 0.275, 0.3803], open: [0.4051, 0.2146, 0.275, 0.3803], mat: '#ebecee' },
  { src: '/prints/rooms/torn-circle-espresso.webp?v=2', mask: '/prints/rooms/torn-circle-espresso-mask.png?v=2', kind: 'circle', colour: 'espresso', ar: 1.3915, hole: [0.3712, 0.2146, 0.3089, 0.4275], open: [0.3712, 0.2146, 0.3089, 0.4275], mat: '#ebecee' },
  { src: '/prints/rooms/torn-horizontal-espresso.webp?v=2', mask: '/prints/rooms/torn-horizontal-espresso-mask.png?v=2', kind: 'torn', colour: 'espresso', ar: 1.3915, hole: [0.3983, 0.2382, 0.3377, 0.3662], open: [0.3983, 0.2382, 0.3377, 0.3662], mat: '#ebecee' },
  { src: '/prints/rooms/torn-square-espresso.webp?v=2', mask: '/prints/rooms/torn-square-espresso-mask.png?v=2', kind: 'torn', colour: 'espresso', ar: 1.3915, hole: [0.3797, 0.2264, 0.2919, 0.4062], open: [0.3797, 0.2264, 0.2919, 0.4062], mat: '#ebecee' },
  { src: '/prints/rooms/torn-circle-greystone.webp?v=2', mask: '/prints/rooms/torn-circle-greystone-mask.png?v=2', kind: 'circle', colour: 'greystone', ar: 1.3915, hole: [0.378, 0.1981, 0.3225, 0.4463], open: [0.378, 0.1981, 0.3225, 0.4463], mat: '#ebecee' },
  { src: '/prints/rooms/torn-horizontal-greystone.webp?v=2', mask: '/prints/rooms/torn-horizontal-greystone-mask.png?v=2', kind: 'torn', colour: 'greystone', ar: 1.3915, hole: [0.2203, 0.2429, 0.4309, 0.4629], open: [0.2203, 0.2429, 0.4309, 0.4629], mat: '#ebecee' },
  { src: '/prints/rooms/torn-square-greystone.webp?v=2', mask: '/prints/rooms/torn-square-greystone-mask.png?v=2', kind: 'torn', colour: 'greystone', ar: 1.3915, hole: [0.3915, 0.2217, 0.2936, 0.4039], open: [0.3915, 0.2217, 0.2936, 0.4039], mat: '#ebecee' },
  { src: '/prints/rooms/torn-circle-oyster.webp?v=2', mask: '/prints/rooms/torn-circle-oyster-mask.png?v=2', kind: 'circle', colour: 'oyster', ar: 1.3915, hole: [0.3153, 0.2382, 0.3564, 0.4935], open: [0.3153, 0.2382, 0.3564, 0.4935], mat: '#ebecee' },
  { src: '/prints/rooms/torn-horizontal-oyster.webp?v=2', mask: '/prints/rooms/torn-horizontal-oyster-mask.png?v=2', kind: 'torn', colour: 'oyster', ar: 1.3915, hole: [0.239, 0.2453, 0.414, 0.444], open: [0.239, 0.2453, 0.414, 0.444], mat: '#ebecee' },
  { src: '/prints/rooms/torn-square-oyster.webp?v=2', mask: '/prints/rooms/torn-square-oyster-mask.png?v=2', kind: 'torn', colour: 'oyster', ar: 1.3915, hole: [0.3271, 0.2524, 0.3343, 0.4629], open: [0.3271, 0.2524, 0.3343, 0.4629], mat: '#ebecee' },
  { src: '/prints/rooms/torn-circle-walnut.webp?v=2', mask: '/prints/rooms/torn-circle-walnut-mask.png?v=2', kind: 'circle', colour: 'walnut', ar: 1.3915, hole: [0.3136, 0.2382, 0.3394, 0.4699], open: [0.3136, 0.2382, 0.3394, 0.4699], mat: '#ebecee' },
  { src: '/prints/rooms/torn-horizontal-walnut.webp?v=2', mask: '/prints/rooms/torn-horizontal-walnut-mask.png?v=2', kind: 'torn', colour: 'walnut', ar: 1.3915, hole: [0.3746, 0.2335, 0.3445, 0.3709], open: [0.3746, 0.2335, 0.3445, 0.3709], mat: '#ebecee' },
  { src: '/prints/rooms/torn-square-walnut.webp?v=2', mask: '/prints/rooms/torn-square-walnut-mask.png?v=2', kind: 'torn', colour: 'walnut', ar: 1.3915, hole: [0.3203, 0.25, 0.3242, 0.4511], open: [0.3203, 0.25, 0.3242, 0.4511], mat: '#ebecee' },
  { src: '/prints/rooms/torn-circle-white.webp?v=2', mask: '/prints/rooms/torn-circle-white-mask.png?v=2', kind: 'circle', colour: 'white', ar: 1.3915, hole: [0.3559, 0.2382, 0.3225, 0.4463], open: [0.3559, 0.2382, 0.3225, 0.4463], mat: '#ebecee' },
  { src: '/prints/rooms/torn-square-white.webp?v=2', mask: '/prints/rooms/torn-square-white-mask.png?v=2', kind: 'torn', colour: 'white', ar: 1.3915, hole: [0.3627, 0.25, 0.3089, 0.4275], open: [0.3627, 0.25, 0.3089, 0.4275], mat: '#ebecee' },
  { src: '/prints/rooms/torn-vertical-white.webp?v=2', mask: '/prints/rooms/torn-vertical-white-mask.png?v=2', kind: 'torn', colour: 'white', ar: 1.3915, hole: [0.3763, 0.2099, 0.2733, 0.5006], open: [0.3763, 0.2099, 0.2733, 0.5006], mat: '#ebecee' },
  // Made here (2026-11-19) from a scene of the right shape, its frame repainted with real moulding cut
  // from a Seldex photo of that colour (white drawn), for colours and shapes Seldex has no photo of.
  { src: '/prints/rooms/11x14-black-made.webp?v=2', colour: 'black', ar: 1.3915, hole: [0.3581, 0.2134, 0.272, 0.5077], open: [0.3119, 0.1539, 0.3644, 0.6268], mat: '#e4e5e7' },
  { src: '/prints/rooms/torn-vertical-black-made.webp?v=2', mask: '/prints/rooms/torn-vertical-camel-mask.png?v=2', kind: 'torn', colour: 'black', ar: 1.3915, hole: [0.3678, 0.2099, 0.2733, 0.5171], open: [0.3678, 0.2099, 0.2733, 0.5171], mat: '#ebecee' },
  { src: '/prints/rooms/11x14-walnut-made.webp?v=2', colour: 'walnut', ar: 1.3915, hole: [0.3581, 0.2134, 0.272, 0.5077], open: [0.3119, 0.1539, 0.3644, 0.6268], mat: '#e4e5e7' },
  { src: '/prints/rooms/torn-vertical-walnut-made.webp?v=2', mask: '/prints/rooms/torn-vertical-camel-mask.png?v=2', kind: 'torn', colour: 'walnut', ar: 1.3915, hole: [0.3678, 0.2099, 0.2733, 0.5171], open: [0.3678, 0.2099, 0.2733, 0.5171], mat: '#ebecee' },
  { src: '/prints/rooms/11x14-espresso-made.webp?v=2', colour: 'espresso', ar: 1.3915, hole: [0.3581, 0.2134, 0.272, 0.5077], open: [0.3119, 0.1539, 0.3644, 0.6268], mat: '#e4e5e7' },
  { src: '/prints/rooms/torn-vertical-espresso-made.webp?v=2', mask: '/prints/rooms/torn-vertical-camel-mask.png?v=2', kind: 'torn', colour: 'espresso', ar: 1.3915, hole: [0.3678, 0.2099, 0.2733, 0.5171], open: [0.3678, 0.2099, 0.2733, 0.5171], mat: '#ebecee' },
  { src: '/prints/rooms/11x14-charcoal-made.webp?v=2', colour: 'charcoal', ar: 1.3915, hole: [0.3581, 0.2134, 0.272, 0.5077], open: [0.3119, 0.1539, 0.3644, 0.6268], mat: '#e4e5e7' },
  { src: '/prints/rooms/torn-vertical-charcoal-made.webp?v=2', mask: '/prints/rooms/torn-vertical-camel-mask.png?v=2', kind: 'torn', colour: 'charcoal', ar: 1.3915, hole: [0.3678, 0.2099, 0.2733, 0.5171], open: [0.3678, 0.2099, 0.2733, 0.5171], mat: '#ebecee' },
  { src: '/prints/rooms/40x40-walnut-made.webp?v=2', colour: 'walnut', ar: 1.3915, hole: [0.3958, 0.1344, 0.2055, 0.2854], open: [0.3636, 0.0843, 0.2699, 0.3856], mat: '#e8e9eb' },
  { src: '/prints/rooms/torn-horizontal-white-made.webp?v=2', mask: '/prints/rooms/torn-horizontal-black-mask.png?v=2', kind: 'torn', colour: 'white', ar: 1.3915, hole: [0.3983, 0.2075, 0.3767, 0.4039], open: [0.3983, 0.2075, 0.3767, 0.4039], mat: '#ebecee' },
];

/** The shop's frame colours (Pic-Time's names) → Seldex frame colours that look the same, closest
 *  first. A room is only shown in one of these (Tony, 2026-11-19: no room in the wrong colour). */
const COLOURS: Record<string, string[]> = {
  'Black': ['black'], 'White': ['white'], 'Light Wood': ['camel', 'oyster'], 'Natural': ['camel', 'oyster'],
  'Classic Wood': ['walnut'], 'Dark Wood': ['espresso'], 'Graphite': ['charcoal', 'greystone'],
};
const sceneKind = (p: Product) => (p.kind === 'float' ? 'torn' : p.kind === 'circle' ? 'circle' : p.kind === 'frame' || p.kind === 'matted-frame' ? undefined : null);

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const shape = (r: number) => (r < 0.92 ? 0 : r > 1.08 ? 2 : 1); // portrait, square, landscape
const pxRatio = (room: Room, box: number[]) => (box[2] * room.ar) / box[3];

/** The scene for a product: same kind of frame, the frame's colour (or its close match) and the
 *  print's shape (portrait, square, landscape); the nearest proportions win. null: none. */
function pick(p: Product, r: number) {
  const kind = sceneKind(p);
  if (kind === null) return null;
  const want = COLOURS[p.type] ?? [];
  const box = (room: Room) => (p.kind === 'matted-frame' || room.kind ? room.hole : room.open);
  let best: Room | null = null, score = Infinity;
  for (const room of ROOMS) {
    if (room.kind !== kind) continue;
    const c = want.indexOf(room.colour), rr = pxRatio(room, box(room));
    if (c < 0 || (kind !== 'circle' && shape(rr) !== shape(r))) continue;
    const s = c * 2 + Math.abs(Math.log(rr / r)) * 6;
    if (s < score) { score = s; best = room; }
  }
  return best ? { room: best, exact: want[0] === best.colour, box: box(best) } : null;
}
/** Is there a room scene for this product, colour and shape? */
export const hasRoom = (p: Product, landscape = false) => !!pick(p, ratioOf(p, landscape));

/** A crop narrowed to a shape (photo ratio pr, target t = width / height), about its centre. */
function toShape(c: Crop, pr: number, t: number): Crop {
  const cr = (c.w * pr) / c.h;
  if (Math.abs(cr / t - 1) < 0.005) return c;
  if (cr > t) { const w = (c.h * t) / pr; return { ...c, x: c.x + (c.w - w) / 2, w }; }
  const h = (c.w * pr) / t; return { ...c, y: c.y + (c.h - h) / 2, h };
}

/**
 * The product in a room, as HTML in a box of w × h pixels. pr: the photo's ratio. zoom > 1 closes in
 * on the frame (for small cards). Returns the HTML and whether the frame colour matches the scene.
 */
export function roomView(p: Product, src: string, pr: number, crop: Crop, landscape: boolean, w: number, h: number, zoom = 1) {
  const r = ratioOf(p, landscape);
  const matted = p.kind === 'matted-frame';
  const found = pick(p, r);
  if (!found) return null;
  const { room, exact, box } = found;
  // The scene, covering the box (zoomed in on the frame when asked) and centred on the frame.
  const fit = Math.max(w / room.ar, h) * zoom;
  const RW = fit * room.ar, RH = fit;
  const cx = (room.open[0] + room.open[2] / 2) * RW, cy = (room.open[1] + room.open[3] / 2) * RH;
  const left = Math.min(0, Math.max(w - RW, w / 2 - cx)), top = Math.min(0, Math.max(h - RH, h / 2 - cy));
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  let inner: string;
  if (room.mask) {
    // Hand torn: the photo (narrowed to the torn print's shape) cut to the torn outline.
    const m = `url('${room.mask}')`;
    inner = `<div class="rm-ph rm-ph--torn" style="left:0;top:0;width:100%;height:100%;-webkit-mask-image:${m};mask-image:${m}">${croppedPhoto(src, toShape(crop, pr, pxRatio(room, box)))}</div>`;
  } else if (matted) {
    // The print sits in the hole at its own shape; the rest of the hole is mat.
    const hr = pxRatio(room, box);
    const iw = r > hr ? 1 : r / hr, ih = r > hr ? hr / r : 1;
    inner = `<div class="rm-ph" style="left:${pct((1 - iw) / 2)};top:${pct((1 - ih) / 2)};width:${pct(iw)};height:${pct(ih)}">${croppedPhoto(src, crop)}</div>`;
  } else {
    // No mat: the photo fills the frame's opening (the crop narrowed to its shape).
    inner = `<div class="rm-ph" style="left:0;top:0;width:100%;height:100%">${croppedPhoto(src, toShape(crop, pr, pxRatio(room, box)))}</div>`;
  }
  const html = `<div class="rm-box" style="width:${w}px;height:${h}px"><div class="rm" style="width:${RW.toFixed(1)}px;height:${RH.toFixed(1)}px;left:${left.toFixed(1)}px;top:${top.toFixed(1)}px">
    <img class="rm-bg" src="${esc(room.src)}" alt="" draggable="false" />
    <div class="rm-in${matted || room.mask ? ' rm-in--mat' : ''}" style="left:${pct(box[0])};top:${pct(box[1])};width:${pct(box[2])};height:${pct(box[3])};background:${room.mask ? 'transparent' : room.mat}">${inner}</div></div></div>`;
  return { html, exact, colour: room.colour };
}

export const ROOM_CSS = `
.rm-box{position:relative;overflow:hidden;max-width:100%}
.rm{position:absolute}
.rm-bg{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none}
.rm-in{position:absolute;overflow:hidden;box-shadow:inset 0 0 3px rgba(0,0,0,.18)}
.rm-in--mat{box-shadow:none}
.rm-ph{position:absolute;overflow:hidden;box-shadow:inset 0 0 2px rgba(0,0,0,.25)}
.rm-ph .mk-photo{position:absolute;inset:0}
.rm-ph--torn{box-shadow:none;-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
`;
