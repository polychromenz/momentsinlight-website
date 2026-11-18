// "In a room": the couple's photo in a framed print on a wall, from Seldex's free stock room scenes
// (seldex.com.au/stock-images, Framed Prints; added with Tony 2026-11-19). Each scene has a matted
// frame whose picture area was a blank grey box (made for dropping a photo in). Its position (`hole`)
// and the mat's outer edge (`open`) were measured from the originals, as fractions of the scene.
// Matted frames show the photo in the hole, with the mat widened to the print's shape; plain frames
// show the photo over the whole mat (no mat). The scene is picked by the print's shape, then by the
// frame colour closest to the one chosen.
import { croppedPhoto, type Product, type Crop } from './mockup';
import { ratioOf } from '../../functions-lib/print-pricing.js';

type Room = { src: string; colour: string; ar: number; hole: number[]; open: number[]; mat: string };
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
];

/** The shop's frame colours (Pic-Time's names) → Seldex scene colours, closest first. */
const COLOURS: Record<string, string[]> = {
  'Black': ['black', 'espresso', 'greystone'], 'White': ['white', 'oyster'], 'Light Wood': ['camel', 'oyster'],
  'Natural': ['camel', 'oyster'], 'Classic Wood': ['walnut', 'camel'], 'Dark Wood': ['espresso', 'walnut'], 'Graphite': ['greystone', 'black'],
};

export const hasRoom = (p: Product) => p.kind === 'frame' || p.kind === 'matted-frame';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const shape = (r: number) => (r < 0.92 ? 0 : r > 1.08 ? 2 : 1); // portrait, square, landscape
const pxRatio = (room: Room, box: number[]) => (box[2] * room.ar) / box[3];

/** The best scene for a frame colour and a print shape (r = width / height). */
function pick(type: string, r: number, matted: boolean) {
  const want = COLOURS[type] ?? [];
  let best: Room = ROOMS[0], score = Infinity;
  for (const room of ROOMS) {
    const rr = pxRatio(room, matted ? room.hole : room.open);
    const c = want.indexOf(room.colour);
    const s = (shape(rr) === shape(r) ? 0 : 20) + (c < 0 ? 6 : c * 2) + Math.abs(Math.log(rr / r)) * 6;
    if (s < score) { score = s; best = room; }
  }
  return { room: best, exact: want[0] === best.colour };
}

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
  const { room, exact } = pick(p.type, r, matted);
  const box = matted ? room.hole : room.open;
  // The scene, covering the box (zoomed in on the frame when asked) and centred on the frame.
  const fit = Math.max(w / room.ar, h) * zoom;
  const RW = fit * room.ar, RH = fit;
  const cx = (room.open[0] + room.open[2] / 2) * RW, cy = (room.open[1] + room.open[3] / 2) * RH;
  const left = Math.min(0, Math.max(w - RW, w / 2 - cx)), top = Math.min(0, Math.max(h - RH, h / 2 - cy));
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  let inner: string;
  if (matted) {
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
    <div class="rm-in${matted ? ' rm-in--mat' : ''}" style="left:${pct(box[0])};top:${pct(box[1])};width:${pct(box[2])};height:${pct(box[3])};background:${room.mat}">${inner}</div></div></div>`;
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
`;
