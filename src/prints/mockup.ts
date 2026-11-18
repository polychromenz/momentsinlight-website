// Prints: a live picture of the product with the couple's own photo in it (no stock images): the
// photo cropped to the print's exact shape, in a frame, mat, canvas or on paper. Used by the gallery
// shop (src/gallery-shop.ts) and Studio > Galleries > Prints. Plus the crop editor (drag the box,
// zoom with the slider) both use.
import { ratioOf, centredCrop, cleanCrop } from '../../functions-lib/print-pricing.js';

export type Product = { id: number; category: string; type: string; name: string; lab?: string; kind: string; w_cm: number; h_cm: number; price: number; tiers?: { q: number; base: number; add: number }[] | null };
export type Crop = { x: number; y: number; w: number; h: number };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// Frame and canvas-edge colours (Pic-Time's names).
const FRAME: Record<string, string> = {
  'Black': 'linear-gradient(135deg,#2b2b2b,#141414)',
  'White': 'linear-gradient(135deg,#fbfaf7,#e7e4de)',
  'Graphite': 'linear-gradient(135deg,#5d6063,#3b3d40)',
  'Light Wood': 'repeating-linear-gradient(100deg,#d8b78c 0 7px,#cda97b 7px 11px,#dcbd94 11px 19px)',
  'Classic Wood': 'repeating-linear-gradient(100deg,#a8763f 0 6px,#99692f 6px 10px,#ae7d47 10px 17px)',
  'Dark Wood': 'repeating-linear-gradient(100deg,#5d3b22 0 6px,#4e301b 6px 10px,#64412a 10px 17px)',
};
const EDGE: Record<string, string> = { Black: '#151515', White: '#f2f0ea' };

// A torn (deckled) paper edge: a polygon with small random steps, made once.
const deckle = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts: string[] = [];
  const j = () => (rnd() * 1.1).toFixed(2);
  for (let k = 0; k <= 40; k++) pts.push(`${(k * 2.5).toFixed(1)}% ${j()}%`);
  for (let k = 0; k <= 40; k++) pts.push(`${(100 - +j()).toFixed(2)}% ${(k * 2.5).toFixed(1)}%`);
  for (let k = 40; k >= 0; k--) pts.push(`${(k * 2.5).toFixed(1)}% ${(100 - +j()).toFixed(2)}%`);
  for (let k = 40; k >= 0; k--) pts.push(`${j()}% ${(k * 2.5).toFixed(1)}%`);
  return `polygon(${pts.join(',')})`;
})();

/** The photo cropped into a box of the print's shape (fills its parent). */
export function croppedPhoto(src: string, crop: Crop, round = false) {
  const st = `width:${(100 / crop.w).toFixed(3)}%;height:${(100 / crop.h).toFixed(3)}%;left:${(-crop.x / crop.w * 100).toFixed(3)}%;top:${(-crop.y / crop.h * 100).toFixed(3)}%`;
  return `<div class="mk-photo${round ? ' mk-photo--round' : ''}"><img src="${esc(src)}" alt="" draggable="false" style="${st}" /></div>`;
}

/**
 * The product as HTML, fitted inside a box of w × h pixels.
 * src: the photo (web size); crop: fractions of the photo; landscape: the print turned sideways.
 */
export function mockup(p: Product, src: string, crop: Crop, landscape: boolean, w: number, h: number) {
  const r = ratioOf(p, landscape);
  const k = p.kind;
  // Borders around the photo, as fractions of the photo's shorter side.
  const short = 1;
  const frame = ['frame', 'float', 'matted-frame', 'circle'].includes(k) ? 0.075 : 0;
  const mat = k === 'matted' ? 0.2 : k === 'matted-frame' || k === 'circle' ? 0.16 : k === 'float' ? 0.16 : k === 'deckled' ? 0.07 : 0;
  // Outer size in "photo short side" units.
  const pw = r >= 1 ? r * short : short, ph = r >= 1 ? short : short / r;
  const ow = pw + 2 * (frame + mat), oh = ph + 2 * (frame + mat);
  const depth = k === 'canvas' ? 0.06 : k === 'board' ? 0.035 : 0;
  const scale = Math.min((w * 0.86) / (ow + depth), (h * 0.86) / (oh + depth));
  const px = (u: number) => `${Math.max(0, u * scale).toFixed(1)}px`;
  const photo = croppedPhoto(src, crop, k === 'circle');
  const box = `width:${px(ow)};height:${px(oh)}`;
  if (k === 'canvas') {
    const edge = p.type === 'Natural' ? '' : EDGE[p.type] ?? '#ddd';
    // The wrapped side: the photo itself (Natural wrap) or a colour, seen at an angle on the right.
    const side = edge ? `<div class="mk-side" style="width:${px(depth)};background:${edge}"></div>`
      : `<div class="mk-side mk-side--photo" style="width:${px(depth)}"><img src="${esc(src)}" alt="" style="height:${(100 / crop.h).toFixed(2)}%;top:${(-crop.y / crop.h * 100).toFixed(2)}%;right:${((crop.x + crop.w - 1) / crop.w * 100 * (ow / depth)).toFixed(1)}%" /></div>`;
    return `<div class="mk mk--canvas" style="${box}">${photo}${side}</div>`;
  }
  if (k === 'board') return `<div class="mk mk--board" style="${box};--d:${px(depth)}">${photo}</div>`;
  if (k === 'print') return `<div class="mk mk--print" style="${box}">${photo}</div>`;
  if (k === 'pack' && p.category === 'Portrait Envelope') {
    // Tony's own envelopes (Seldex Portrait Envelopes 8x10"): sky blue linen, white insert, Bridal White
    // ribbon, his logo foiled in black at the optical centre. Shown open: the cover beside the print.
    const pr = Math.min(1, r), ph2 = 1 / pr; // the print in the insert (portrait-shaped envelope)
    const cw = 1.18, ch = ph2 + 0.36;          // each panel, in photo-width units
    const s2 = Math.min((w * 0.9) / (cw * 2), (h * 0.88) / ch);
    const q = (u: number) => `${(u * s2).toFixed(1)}px`;
    return `<div class="mk mk--env" style="width:${q(cw * 2)};height:${q(ch)}">
      <div class="mk-env-cover" style="width:${q(cw)}"><div class="mk-env-logo" style="font-size:${q(0.068)}"><b style="font-size:${q(0.28)}">M.</b>MOMENTS IN LIGHT</div><i class="mk-env-ribbon"></i></div>
      <div class="mk-env-insert" style="width:${q(cw)}"><div class="mk-env-print" style="width:${q(r >= 1 ? 0.92 : 0.92 * r)};height:${q(r >= 1 ? 0.92 / r : 0.92)}">${photo}</div></div></div>`;
  }
  if (k === 'pack') return `<div class="mk mk--print mk--pack" style="${box}">${photo}</div>`;
  if (k === 'deckled') return `<div class="mk mk--deckled" style="${box};padding:${px(mat)};clip-path:${deckle}">${photo}</div>`;
  if (k === 'matted') return `<div class="mk mk--matted" style="${box};padding:${px(mat)}"><div class="mk-open">${photo}</div></div>`;
  const fr = FRAME[p.type] ?? FRAME.Black;
  return `<div class="mk mk--frame mk--${k}" style="${box};padding:${px(frame)};background:${fr}">
    <div class="mk-mat" style="padding:${px(mat)}"><div class="mk-open">${photo}</div></div></div>`;
}

export const MOCKUP_CSS = `
.mk{position:relative;box-sizing:border-box;flex:none;margin:auto}
.mk-photo{position:relative;width:100%;height:100%;overflow:hidden;background:#ddd}
.mk-photo img{position:absolute;max-width:none;display:block;user-select:none;-webkit-user-select:none;pointer-events:none}
.mk-photo--round{border-radius:50%}
.mk--print{box-shadow:0 1px 2px rgb(0 0 0/.18),0 12px 28px -12px rgb(0 0 0/.45);background:#fff}
.mk--pack::before,.mk--pack::after{content:"";position:absolute;inset:0;background:#fff;box-shadow:0 1px 3px rgb(0 0 0/.2);z-index:-1}
.mk--pack::before{transform:rotate(-5deg) translate(-6%,3%)}.mk--pack::after{transform:rotate(4deg) translate(5%,2%)}
.mk--pack{isolation:isolate}
.mk--env{display:flex;filter:drop-shadow(0 12px 18px rgb(0 0 0/.3))}
.mk-env-cover{position:relative;height:100%;border-radius:2px 0 0 2px;background:repeating-linear-gradient(0deg,rgb(255 255 255/.07) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgb(0 0 0/.05) 0 1px,transparent 1px 3px),#9fc3dc;display:flex;align-items:center;justify-content:center;box-shadow:inset -6px 0 10px -6px rgb(0 0 0/.35)}
.mk-env-logo{display:flex;flex-direction:column;align-items:center;gap:.35em;color:#111;white-space:nowrap;line-height:1;letter-spacing:.22em;font-family:Raleway,system-ui,sans-serif;font-weight:500;margin-top:-12%;text-shadow:0 1px 0 rgb(255 255 255/.25)}
.mk-env-logo b{font-family:Georgia,serif;font-weight:700;letter-spacing:0;line-height:1}
.mk-env-ribbon{position:absolute;left:0;right:0;top:58%;height:5%;background:linear-gradient(#fbfaf5,#ece9df);box-shadow:0 1px 2px rgb(0 0 0/.2)}
.mk-env-insert{height:100%;background:#fbfaf6;display:flex;align-items:center;justify-content:center;border-radius:0 2px 2px 0;box-shadow:inset 8px 0 10px -8px rgb(0 0 0/.3)}
.mk-env-print{box-shadow:0 1px 3px rgb(0 0 0/.3)}
.mk--deckled{background:#fbfaf6;filter:drop-shadow(0 6px 10px rgb(0 0 0/.22))}
.mk--matted{background:#fbfaf6;box-shadow:0 1px 2px rgb(0 0 0/.15),0 14px 30px -14px rgb(0 0 0/.45)}
.mk-open{width:100%;height:100%;box-shadow:inset 0 0 0 1px rgb(0 0 0/.08),0 0 0 3px #fff,0 0 0 4px rgb(0 0 0/.06);position:relative}
.mk--matted .mk-open,.mk-mat .mk-open{box-shadow:0 0 0 1px rgb(0 0 0/.12),0 0 0 4px #fff,0 0 0 5px rgb(0 0 0/.07)}
.mk--frame{box-shadow:0 2px 3px rgb(0 0 0/.25),0 22px 40px -18px rgb(0 0 0/.55)}
.mk-mat{width:100%;height:100%;box-sizing:border-box;background:#fbfaf6;box-shadow:inset 0 2px 6px rgb(0 0 0/.35)}
.mk--frame.mk--frame:not(.mk--matted-frame):not(.mk--float):not(.mk--circle) .mk-open{box-shadow:none}
.mk--float .mk-mat{background:#f3f1ec}
.mk--float .mk-open{box-shadow:0 6px 12px -4px rgb(0 0 0/.45)}
.mk--circle .mk-open{box-shadow:none}
.mk--canvas{box-shadow:0 16px 30px -14px rgb(0 0 0/.55)}
.mk-side{position:absolute;top:0;left:100%;height:100%;transform-origin:left center;transform:skewY(32deg) scaleX(.9);transform-origin:left top;filter:brightness(.82);overflow:hidden}
.mk-side--photo img{position:absolute;max-width:none;filter:brightness(.85)}
.mk--board{box-shadow:var(--d) var(--d) 0 -1px #2a2a2a,0 18px 30px -14px rgb(0 0 0/.5)}
.crop{position:relative;margin:auto;touch-action:none;user-select:none;-webkit-user-select:none}
.crop>img{display:block;width:100%;height:100%;pointer-events:none}
.crop-box{position:absolute;box-shadow:0 0 0 9999px rgb(0 0 0/.55);outline:2px solid #fff;cursor:move}
.crop-box--round{border-radius:50%}
.crop-box::before,.crop-box::after{content:"";position:absolute;inset:33.33% 0;border-top:1px solid rgb(255 255 255/.45);border-bottom:1px solid rgb(255 255 255/.45);pointer-events:none}
.crop-box::after{inset:0 33.33%;border:0;border-left:1px solid rgb(255 255 255/.45);border-right:1px solid rgb(255 255 255/.45)}
.crop-wrap{overflow:hidden;position:relative}
`;

let styled = false;
export function styleMockups() {
  if (styled) return;
  const s = document.createElement('style'); s.textContent = MOCKUP_CSS; document.head.append(s); styled = true;
}

/**
 * The crop editor: the whole photo with the print's shape on top. Drag to move it; zoom (0–1, from
 * the biggest crop to a third of it) with a slider the caller draws. Calls onChange with the new crop.
 */
export function cropEditor(host: HTMLElement, src: string, pr: number, r: number, crop: Crop, onChange: (c: Crop) => void, round = false, minW = 0) {
  const W = host.clientWidth || 600, H = host.clientHeight || 400;
  const s = Math.min(W / pr, H); // the photo's height in px
  const w = s * pr, h = s;
  host.innerHTML = `<div class="crop" style="width:${w}px;height:${h}px"><img src="${esc(src)}" alt="" draggable="false" /><div class="crop-box${round ? ' crop-box--round' : ''}"></div></div>`;
  const box = host.querySelector<HTMLElement>('.crop-box')!;
  let c = cleanCrop(crop, pr, r, minW);
  const full = centredCrop(pr, r);
  const floor = Math.min(full.w, Math.max(full.w * 0.34, minW)); // the most it zooms in
  const draw = () => Object.assign(box.style, { left: `${c.x * w}px`, top: `${c.y * h}px`, width: `${c.w * w}px`, height: `${c.h * h}px` });
  draw();
  let start: { x: number; y: number; c: Crop } | null = null;
  box.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, c: { ...c } }; box.setPointerCapture(e.pointerId); e.preventDefault(); });
  box.addEventListener('pointermove', (e) => {
    if (!start) return;
    c = cleanCrop({ ...start.c, x: start.c.x + (e.clientX - start.x) / w, y: start.c.y + (e.clientY - start.y) / h }, pr, r, minW);
    draw();
  });
  const end = () => { if (start) { start = null; onChange(c); } };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  return {
    /** 0 = the biggest crop, 1 = the smallest allowed (a third of it, or as far as the print quality
     *  allows: minW), keeping the middle where it is. */
    zoom(z: number) {
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      const nw = full.w - (full.w - floor) * z, nh = (nw * pr) / r;
      c = cleanCrop({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }, pr, r, minW);
      draw(); onChange(c);
    },
    zoomOf: () => (full.w > floor ? (full.w - c.w) / (full.w - floor) : 0),
    /** Zooming in is possible at all (the photo has pixels to spare for this size). */
    canZoom: full.w - floor > 0.01,
    get: () => c,
  };
}
