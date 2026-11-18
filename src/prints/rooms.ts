// "In a room": the couple's photo framed on the wall above a sofa (Tony, 2026-11-19: "previously it
// showed a sofa and looked more like a room"). The room is Seldex's own stock scene (seldex.com.au/
// stock-images) with its frame painted out and more wall added above. The shop draws the frame
// itself: real moulding cut from Seldex's photos for each colour (rail-{colour}-{side}.webp), the
// mat, and the print, at the product's real size, so a 76 cm frame looks bigger than a 20 cm one.
// Hand torn prints and circles are cut to the torn outline from Seldex's templates (the -mask.png).
import { croppedPhoto, type Product, type Crop } from './mockup';
import { ratioOf } from '../../functions-lib/print-pricing.js';

const V = '?v=3';
const ROOM = {
  src: `/prints/rooms/sofa-room.webp${V}`, w: 1600, h: 1584,
  cm: 5.098,                 // image pixels per cm (the sofa is about 2 m wide)
  sofaX: 799, sofaTop: 1031,  // the sofa's centre and the top of its back
  floor: 1540,               // the lowest line worth showing
  span: 1260,                // width that keeps the whole sofa in view
};
const MASKS = {
  landscape: `/prints/rooms/torn-horizontal-black-mask.png${V}`,
  portrait: `/prints/rooms/torn-vertical-camel-mask.png${V}`,
  square: `/prints/rooms/torn-square-black-mask.png${V}`,
  circle: `/prints/rooms/torn-circle-black-mask.png${V}`,
};
/** The shop's frame colours (Pic-Time's names) → the moulding cut from Seldex's photos. */
const COLOURS: Record<string, string> = {
  'Black': 'black', 'White': 'white', 'Light Wood': 'camel', 'Natural': 'camel',
  'Classic Wood': 'walnut', 'Dark Wood': 'espresso', 'Graphite': 'charcoal',
};
const MOULDING = 4;   // cm, the moulding's face
const MAT = 6;        // cm, the mat around a matted or hand torn print

export const hasRoom = (p: Product, _landscape = false) => ['frame', 'matted-frame', 'float', 'circle'].includes(p.kind) && !!COLOURS[p.type];

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A crop narrowed to a shape (photo ratio pr, target t = width / height), about its centre. */
function toShape(c: Crop, pr: number, t: number): Crop {
  const cr = (c.w * pr) / c.h;
  if (Math.abs(cr / t - 1) < 0.005) return c;
  if (cr > t) { const w = (c.h * t) / pr; return { ...c, x: c.x + (c.w - w) / 2, w }; }
  const h = (c.w * pr) / t; return { ...c, y: c.y + (c.h - h) / 2, h };
}

/**
 * The product framed on the wall, as HTML in a box of w × h pixels. pr: the photo's ratio.
 * Returns null for products that aren't frames (or a colour without moulding).
 */
export function roomView(p: Product, src: string, pr: number, crop: Crop, landscape: boolean, w: number, h: number) {
  if (!hasRoom(p)) return null;
  const colour = COLOURS[p.type];
  const r = ratioOf(p, landscape);
  // The print's size in cm, then the frame around it.
  const pw = landscape ? p.h_cm : p.w_cm, ph = landscape ? p.w_cm : p.h_cm;
  const mat = p.kind === 'frame' ? 0 : MAT;
  const fw = pw + 2 * (mat + MOULDING), fh = ph + 2 * (mat + MOULDING);
  // In room pixels: centred over the sofa, its bottom 18 cm above the sofa's back.
  const k = ROOM.cm;
  const bottom = ROOM.sofaTop - 18 * k, top = bottom - fh * k, left = ROOM.sofaX - (fw * k) / 2;
  // What to show: the frame with some wall above, down to the floor, the whole sofa across.
  const viewTop = Math.max(0, top - 30 * k);
  const s = Math.min(w / ROOM.span, h / (ROOM.floor - viewTop));
  const ox = w / 2 - ROOM.sofaX * s, oy = h - ROOM.floor * s;
  const P = (v: number) => `${(v * s).toFixed(1)}px`;
  const mp = (MOULDING * k * s).toFixed(1);
  const rail = (side: string, css: string) => `<i class="rf-${side}" style="${css};background-image:url('/prints/rooms/rail-${colour}-${side}.webp${V}')"></i>`;
  const frame = [
    rail('t', `left:0;top:0;right:0;height:${mp}px;clip-path:polygon(0 0,100% 0,calc(100% - ${mp}px) 100%,${mp}px 100%)`),
    rail('b', `left:0;bottom:0;right:0;height:${mp}px;clip-path:polygon(${mp}px 0,calc(100% - ${mp}px) 0,100% 100%,0 100%)`),
    rail('l', `left:0;top:0;bottom:0;width:${mp}px;clip-path:polygon(0 0,100% ${mp}px,100% calc(100% - ${mp}px),0 100%)`),
    rail('r', `right:0;top:0;bottom:0;width:${mp}px;clip-path:polygon(0 ${mp}px,100% 0,100% 100%,0 calc(100% - ${mp}px))`),
  ].join('');
  // Inside the moulding: the mat (if any) and the print.
  const inset = (mat * k * s).toFixed(1);
  let print: string;
  if (p.kind === 'float' || p.kind === 'circle') {
    const shape = p.kind === 'circle' ? 'circle' : r > 1.05 ? 'landscape' : r < 0.95 ? 'portrait' : 'square';
    const mk = `url('${MASKS[shape]}')`;
    print = `<div class="rf-print rf-print--torn" style="inset:${inset}px;-webkit-mask-image:${mk};mask-image:${mk}">${croppedPhoto(src, toShape(crop, pr, r))}</div>`;
  } else {
    print = `<div class="rf-print${mat ? ' rf-print--mat' : ''}" style="inset:${inset}px">${croppedPhoto(src, crop)}</div>`;
  }
  const sh = Math.max(2, MOULDING * k * s * 0.6).toFixed(1);
  const html = `<div class="rm-box" style="width:${w}px;height:${h}px"><div class="rm" style="width:${P(ROOM.w)};height:${P(ROOM.h)};left:${ox.toFixed(1)}px;top:${oy.toFixed(1)}px">
    <img class="rm-bg" src="${esc(ROOM.src)}" alt="" draggable="false" />
    <div class="rf" style="left:${P(left)};top:${P(top)};width:${P(fw * k)};height:${P(fh * k)};--sh:${sh}px">
      <div class="rf-in" style="inset:${mp}px">${print}</div>${frame}</div></div></div>`;
  return { html, exact: true, colour };
}

export const ROOM_CSS = `
.rm-box{position:relative;overflow:hidden;max-width:100%;background:#efefef}
.rm{position:absolute}
.rm-bg{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none}
.rf{position:absolute;box-shadow:calc(var(--sh) * -.5) var(--sh) calc(var(--sh) * 2.2) rgba(0,0,0,.32),0 0 1px rgba(0,0,0,.35)}
.rf i{position:absolute;display:block;background-repeat:repeat;background-size:auto 100%}
.rf .rf-l,.rf .rf-r{background-size:100% auto}
.rf-in{position:absolute;background:#ecedee;box-shadow:inset 0 2px 4px rgba(0,0,0,.28),inset 0 0 1px rgba(0,0,0,.4)}
.rf-print{position:absolute;overflow:hidden}
.rf-print .mk-photo{position:absolute;inset:0}
.rf-print--mat{box-shadow:0 0 0 1px #f7f7f7,0 0 0 2px rgba(0,0,0,.12),inset 0 1px 2px rgba(0,0,0,.25)}
.rf-print--torn{-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))}
`;
