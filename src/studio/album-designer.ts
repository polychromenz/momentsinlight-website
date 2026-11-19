// The album designer (src/pages/studio/gallery-album.astro): Seldex Boutique Book spreads from a gallery.
// Spreads, layouts and crops: ./album-layouts.ts. The Seldex files: ./album-export.ts.
import { ask, guardLeaving } from './dialogs';
import { ALBUM_SIZES, ALBUM_MARGINS, SPREADS_MIN, SPREADS_MAX, pageSize, spreadPx, orientationsOf, sizeLabel } from '../../functions-lib/album-sizes.js';
import { PAGE_LAYOUTS, SPAN_LABEL, DPI_MIN, DPI_WARN, autoLayout, cropBox, maxZoom, relayout, spreadFor, spreadRects, slotsOf, type Photo, type Spread, type Rect } from './album-layouts';
import { albumFiles } from './album-export';

type Img = Photo & { filename: string; section_id: number; sort_order: number; hidden: number; has_original: number; web: string | null; thumb: string | null };
type Design = { spreads: Spread[]; picks: string[] };

const $ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector<T>(s)!;
const $$ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = document) => [...el.querySelectorAll<T>(s)];
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const albumId = Number(new URLSearchParams(location.search).get('id'));

let album: any = null, gallery: any = null, sections: any[] = [], lists: any[] = [];
let photos = new Map<string, Img>();
let order: string[] = []; // every photo in gallery order
let design: Design = { spreads: [], picks: [] };
let cur = 0;
let sel: number | null = null;
let pickMode = false;
const undo: string[] = [];

function toast(msg: string, error = false) {
  const t = $('.s-toast'); t.textContent = msg; t.classList.toggle('error', error); t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4500);
}
async function api(url: string, method = 'GET', body?: unknown) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Something went wrong (${r.status}).`), { status: r.status });
  return j;
}

const page = () => pageSize(album.size, album.orientation);
const spread = () => design.spreads[cur];

// ---- Saving (a second after the last change) and undo ----
let saveTimer = 0, saving = false, dirty = false, stopped = false;
function changed() {
  dirty = true;
  $('.ad-saved').textContent = 'Not saved yet…';
  $('.ad-saved').classList.remove('err');
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 1000);
}
async function save() {
  if (saving || stopped) { if (!stopped) { clearTimeout(saveTimer); saveTimer = window.setTimeout(save, 500); } return; }
  saving = true; dirty = false;
  try {
    const r = await api('/api/studio/galleries/albums', 'PUT', { id: album.id, version: album.version, name: album.name, size: album.size, orientation: album.orientation, bg: album.bg, design });
    album.version = r.album.version;
    $('.ad-saved').textContent = dirty ? 'Not saved yet…' : `Saved ${new Date().toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}`;
  } catch (e) {
    dirty = true;
    if ((e as any).status === 409) stopped = true;
    $('.ad-saved').textContent = (e as Error).message;
    $('.ad-saved').classList.add('err');
    toast((e as Error).message, true);
  } finally { saving = false; }
}
guardLeaving(() => dirty || saving);
function remember() {
  undo.push(JSON.stringify({ design, cur }));
  if (undo.length > 60) undo.shift();
  $<HTMLButtonElement>('[data-undo]').disabled = false;
}
function back() {
  const u = undo.pop();
  if (!u) return;
  ({ design, cur } = JSON.parse(u));
  sel = null;
  $<HTMLButtonElement>('[data-undo]').disabled = !undo.length;
  drawAll(); changed();
}

// ---- Drawing a spread (the big one, and the small ones in the strip) ----
function quality(rect: Rect, id: string | null, s: Spread, slot: number) {
  const p = id ? photos.get(id) : null;
  if (!p) return null;
  return cropBox(rect, p.width, p.height, s.crops[slot]).dpi;
}
function placeImg(img: HTMLImageElement, rect: Rect, p: Img, s: Spread, slot: number, k: number) {
  const c = cropBox(rect, p.width, p.height, s.crops[slot]);
  const f = c.scale * k; // screen px per photo px
  img.style.width = `${p.width * f}px`; img.style.height = `${p.height * f}px`;
  img.style.left = `${-c.sx * f}px`; img.style.top = `${-c.sy * f}px`;
  return c;
}
function badge(dpi: number | null) {
  if (dpi === null || dpi >= DPI_WARN) return '';
  return `<span class="q${dpi >= DPI_MIN ? ' soft' : ''}" title="${dpi >= DPI_MIN ? 'May look soft in print' : `Below ${DPI_MIN} dpi: use a smaller frame or another photo`}">${Math.round(dpi)} dpi</span>`;
}
function drawSpread(el: HTMLElement, s: Spread, width: number, main: boolean) {
  const pg = page(), k = width / (pg.w * 2);
  el.style.width = `${width}px`; el.style.height = `${pg.h * k}px`; el.style.background = album.bg;
  const rects = spreadRects(s, pg, photos);
  const px = (v: number) => `${v * k}px`;
  const m = ALBUM_MARGINS;
  el.innerHTML = rects.map((r) => {
    const id = s.slots[r.slot] ?? null, p = id ? photos.get(id) : null;
    const src = p ? (main ? p.web ?? p.thumb : p.thumb ?? p.web) : null;
    return `<div class="fr${p ? '' : ' empty'}${main && sel === r.slot ? ' sel' : ''}" data-slot="${r.slot}" style="left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)}">${p ? `<img alt="" src="${esc(src)}" draggable="false" />` : main ? 'Empty' : ''}${main && p ? `<span class="h" draggable="true" title="Drag to swap or move">⇄</span>${badge(quality(r, id, s, r.slot))}` : ''}</div>`;
  }).join('') + (main ? `<div class="g g-safe" style="left:${px(m.safe)};top:${px(m.safe)};width:${px(pg.w - 2 * m.safe)};height:${px(pg.h - 2 * m.safe)}"></div>
      <div class="g g-safe" style="left:${px(pg.w + m.safe)};top:${px(m.safe)};width:${px(pg.w - 2 * m.safe)};height:${px(pg.h - 2 * m.safe)}"></div>
      <div class="g g-gut" style="left:${px(pg.w - m.gutter)};top:0;width:${px(2 * m.gutter)};height:100%"></div>` : '') + `<div class="g g-fold" style="left:${px(pg.w)}"></div>`;
  el.classList.toggle('noguides', main && !$<HTMLInputElement>('[name="guides"]').checked);
  $$<HTMLImageElement>('.fr img', el).forEach((img) => {
    const fr = img.closest<HTMLElement>('.fr')!, slot = Number(fr.dataset.slot), r = rects.find((x) => x.slot === slot)!;
    placeImg(img, r, photos.get(s.slots[slot]!)!, s, slot, k);
  });
}
function mainWidth() {
  const stage = $('.ad-stage');
  const pg = page();
  const byW = stage.clientWidth - 44, byH = (window.innerHeight * 0.62) * (pg.w * 2) / pg.h;
  return Math.max(300, Math.min(byW, byH));
}
function drawMain() {
  const s = spread();
  if (!s) return;
  drawSpread($('[data-main]'), s, mainWidth(), true);
  const used = s.slots.filter(Boolean).length;
  $('.ad-pos').textContent = `Spread ${cur + 1} of ${design.spreads.length} · pages ${cur * 2 + 1}–${cur * 2 + 2} · ${used} photo${used === 1 ? '' : 's'}`;
}
function spreadWarn(s: Spread) {
  return spreadRects(s, page(), photos).some((r) => { const q = quality(r, s.slots[r.slot] ?? null, s, r.slot); return q !== null && q < DPI_WARN; });
}
function drawStrip() {
  const strip = $('.ad-strip');
  strip.innerHTML = design.spreads.map((s, k) => `<div class="st-item${k === cur ? ' on' : ''}" role="listitem" data-k="${k}" draggable="true"><div class="ad-spread"></div><span>${k + 1}${spreadWarn(s) ? ' <span class="warn" title="A photo here may look soft">!</span>' : ''}</span></div>`).join('');
  const pg = page(), w = Math.round(64 * (pg.w * 2) / pg.h);
  $$('.st-item', strip).forEach((it) => drawSpread($('.ad-spread', it), design.spreads[Number(it.dataset.k)], w, false));
  strip.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function layoutOptions(selected: string) {
  return Object.entries(PAGE_LAYOUTS).map(([k, v]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(v.label)}</option>`).join('');
}
function drawSide() {
  const s = spread();
  if (!s) return;
  $('[data-n]').textContent = String(cur + 1);
  const span = s.layout === 'span';
  $<HTMLInputElement>('[name="span"]').checked = span;
  $('.span-hint').hidden = !span;
  $('.pages').hidden = span;
  if (!span) {
    $<HTMLSelectElement>('[name="left"]').innerHTML = layoutOptions((s.layout as string[])[0]);
    $<HTMLSelectElement>('[name="right"]').innerHTML = layoutOptions((s.layout as string[])[1]);
  }
  const fp = $('.frame-panel');
  const id = sel !== null ? s.slots[sel] : null, p = id ? photos.get(id) : null;
  fp.hidden = !p;
  if (p && sel !== null) {
    const r = spreadRects(s, page(), photos).find((x) => x.slot === sel)!;
    const c = cropBox(r, p.width, p.height, s.crops[sel]);
    const zmax = maxZoom(r, p.width, p.height);
    $('.fname', fp).textContent = p.filename;
    const z = $<HTMLInputElement>('[name="zoom"]', fp);
    z.max = String(zmax); z.value = String(c.z); z.disabled = zmax <= 1.001;
    const d = $('.dpi', fp);
    d.classList.toggle('warn', c.dpi < DPI_WARN);
    d.textContent = `${Math.round(c.dpi)} dpi at this size${c.dpi < DPI_MIN ? ` — under ${DPI_MIN}: use a smaller frame or another photo` : c.dpi < DPI_WARN ? ' — may look soft in print' : ''}${zmax > 1.001 && c.z >= zmax - 0.01 ? ` (zoom stops at ${DPI_MIN} dpi)` : ''}`;
  }
}

// ---- The tray of photos ----
const usedCount = () => {
  const n = new Map<string, number>();
  for (const s of design.spreads) for (const id of s.slots) if (id) n.set(id, (n.get(id) ?? 0) + 1);
  return n;
};
function sourceIds(src: string): string[] {
  if (src === 'picks') return order.filter((id) => design.picks.includes(id));
  if (src === 'visible') return order.filter((id) => !photos.get(id)!.hidden);
  if (src.startsWith('list:')) { const l = lists.find((x) => String(x.id) === src.slice(5)); const set = new Set(l?.photos ?? []); return order.filter((id) => set.has(id)); }
  if (src.startsWith('sec:')) return order.filter((id) => String(photos.get(id)!.section_id) === src.slice(4));
  return order;
}
function sourceOptions(withAll: boolean) {
  return [
    ...(design.picks.length ? [['picks', `Photos chosen for the album (${design.picks.length})`]] : []),
    ...(withAll ? [['all', `All photos (${order.length})`]] : []),
    ['visible', `All photos except hidden ones (${order.filter((id) => !photos.get(id)!.hidden).length})`],
    ...lists.map((l) => [`list:${l.id}`, `${l.kind === 'favourites' ? 'Favourites' : l.name} · ${l.owner} (${l.photos.length})`]),
    ...sections.map((s) => [`sec:${s.id}`, `Section: ${s.name} (${order.filter((id) => photos.get(id)!.section_id === s.id).length})`]),
  ];
}
function drawTray() {
  const src = $<HTMLSelectElement>('[name="source"]');
  const was = src.value || 'all';
  src.innerHTML = sourceOptions(true).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  src.value = [...src.options].some((o) => o.value === was) ? was : 'all';
  const used = usedCount();
  const only = $<HTMLInputElement>('[name="unused"]').checked;
  const ids = sourceIds(src.value).filter((id) => !only || !used.has(id));
  $('[data-tray]').innerHTML = ids.map((id) => {
    const p = photos.get(id)!, n = used.get(id) ?? 0;
    return `<div class="tp${n ? ' used' : ''}${design.picks.includes(id) ? ' picked' : ''}${p.hidden ? ' hid' : ''}" data-id="${esc(id)}" draggable="true" title="${esc(p.filename)}${p.hidden ? ' (hidden in the gallery)' : ''}" style="width:${Math.round(92 * (p.width || 3) / (p.height || 2))}px">${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy" />` : ''}${n ? `<span class="n">${n > 1 ? `${n}×` : 'In'}</span>` : ''}</div>`;
  }).join('') || '<p class="hint">No photos here.</p>';
  $('.pick-n').textContent = pickMode ? `${design.picks.length} chosen · click photos to add or remove them` : '';
}
function drawAll() { drawMain(); drawStrip(); drawSide(); drawTray(); }

// ---- Changing things ----
function put(slot: number, id: string | null) {
  const s = spread();
  s.slots[slot] = id;
  s.crops[slot] = { cx: 0.5, cy: 0.5, z: 1 };
}
function setLayout(layout: Spread['layout']) {
  remember();
  const { spread: s, dropped } = relayout(spread(), layout);
  design.spreads[cur] = s;
  sel = null;
  if (dropped.length) toast(`${dropped.length} photo${dropped.length === 1 ? '' : 's'} didn’t fit and went back to the tray.`);
  drawAll(); changed();
}
function go(k: number) {
  if (k < 0 || k >= design.spreads.length) return;
  cur = k; sel = null;
  drawAll();
}

document.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.name === 'left' || t.name === 'right') {
    const l = spread().layout as [string, string];
    setLayout(t.name === 'left' ? [t.value, l[1]] : [l[0], t.value]);
  }
  if (t.name === 'span') {
    if (t.checked) setLayout('span');
    else {
      remember();
      const ids = spread().slots.filter(Boolean) as string[];
      design.spreads[cur] = spreadFor(ids.map((id) => photos.get(id)!), page());
      sel = null; drawAll(); changed();
    }
  }
  if (t.name === 'name') { album.name = t.value.trim() || album.name; $('h1').textContent = album.name; changed(); }
  if (t.name === 'bg') { album.bg = t.value; drawMain(); drawStrip(); changed(); }
  if (t.name === 'size') { album.size = t.value; album.orientation = orientationsOf(t.value)[0]; fillSettings(); drawAll(); changed(); }
  if (t.name === 'orientation') { album.orientation = t.value; fillSettings(); drawAll(); changed(); }
  if (t.name === 'guides') drawMain();
  if (t.name === 'source' || t.name === 'unused') drawTray();
  if (t.name === 'zoom' && sel !== null) { remember(); spread().crops[sel] = { ...spread().crops[sel], z: Number(t.value) }; drawMain(); drawStrip(); drawSide(); changed(); }
});
document.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.name === 'zoom' && sel !== null) { spread().crops[sel] = { ...spread().crops[sel], z: Number(t.value) }; drawMain(); }
});

document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-undo]')) back();
  if (t.closest('[data-add]')) {
    if (design.spreads.length >= SPREADS_MAX) return toast(`A Boutique Book has at most ${SPREADS_MAX} spreads.`, true);
    remember();
    design.spreads.splice(cur + 1, 0, { layout: ['blank', 'blank'], slots: [], crops: [] });
    go(cur + 1); changed();
  }
  if (t.closest('[data-remove]')) {
    if (design.spreads.length <= SPREADS_MIN) return toast(`A Boutique Book has at least ${SPREADS_MIN} spreads.`, true);
    const n = spread().slots.filter(Boolean).length;
    if (n && !(await ask(`Remove spread ${cur + 1}? Its ${n} photo${n === 1 ? '' : 's'} go back to the tray.`))) return;
    remember();
    design.spreads.splice(cur, 1);
    cur = Math.min(cur, design.spreads.length - 1); sel = null;
    drawAll(); changed();
  }
  if (t.closest('[data-respread]')) {
    remember();
    const ids = spread().slots.filter(Boolean) as string[];
    if (ids.length > 4) { toast('Tidy works with up to 4 photos.', true); return; }
    design.spreads[cur] = spreadFor(ids.map((id) => photos.get(id)!), page());
    sel = null; drawAll(); changed();
  }
  if (t.closest('[data-reset]') && sel !== null) { remember(); spread().crops[sel] = { cx: 0.5, cy: 0.5, z: 1 }; drawAll(); changed(); }
  if (t.closest('[data-clear]') && sel !== null) { remember(); put(sel, null); drawAll(); changed(); }
  const st = t.closest<HTMLElement>('.st-item');
  if (st) go(Number(st.dataset.k));
  const fr = t.closest<HTMLElement>('[data-main] .fr');
  if (fr && fr.classList.contains('empty')) { sel = Number(fr.dataset.slot); drawMain(); drawSide(); }
  const tp = t.closest<HTMLElement>('.tp');
  if (tp) {
    const id = tp.dataset.id!;
    if (pickMode) {
      const i = design.picks.indexOf(id);
      if (i >= 0) design.picks.splice(i, 1); else design.picks.push(id);
      drawTray(); changed();
    } else if (sel !== null && sel < slotsOf(spread().layout)) {
      remember(); put(sel, id); drawAll(); changed();
    } else toast('Click a frame in the spread first, or drag the photo onto one.');
  }
  if (t.closest('[data-pickmode]')) {
    pickMode = !pickMode;
    $('[data-pickmode]').setAttribute('aria-pressed', String(pickMode));
    $('[data-pickmode]').textContent = pickMode ? 'Done choosing' : 'Choose photos for the album';
    if (pickMode && design.picks.length === 0) toast('Click photos to choose them, in any order. Then Auto layout can use just these.');
    if (!pickMode && design.picks.length) $<HTMLSelectElement>('[name="source"]').value = 'picks';
    drawTray();
  }
  if (t.closest('[data-auto]')) openAuto();
  if (t.closest('[data-export]')) exportFiles();
  if (t.closest('[data-close]')) t.closest('dialog')?.close();
});

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('input, select, textarea, dialog')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); back(); }
  else if (e.key === 'ArrowLeft') go(cur - 1);
  else if (e.key === 'ArrowRight') go(cur + 1);
  else if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null && spread().slots[sel]) { remember(); put(sel, null); drawAll(); changed(); }
});

// ---- Pan (drag in a frame) and zoom (scroll) ----
const mainEl = () => $('[data-main]');
let pan: { slot: number; x: number; y: number; cx: number; cy: number; f: number; pw: number; ph: number; moved: boolean } | null = null;
mainEl().addEventListener('pointerdown', (e) => {
  const fr = (e.target as HTMLElement).closest<HTMLElement>('.fr');
  if (!fr || (e.target as HTMLElement).closest('.h') || fr.classList.contains('empty')) return;
  const slot = Number(fr.dataset.slot), s = spread(), p = photos.get(s.slots[slot]!)!;
  if (sel !== slot) { sel = slot; $$('.fr', mainEl()).forEach((x) => x.classList.toggle('sel', x === fr)); drawSide(); }
  const r = spreadRects(s, page(), photos).find((x) => x.slot === slot)!;
  const c = cropBox(r, p.width, p.height, s.crops[slot]);
  const k = mainWidth() / (page().w * 2);
  pan = { slot, x: e.clientX, y: e.clientY, cx: (c.sx + c.sw / 2) / p.width, cy: (c.sy + c.sh / 2) / p.height, f: c.scale * k, pw: p.width, ph: p.height, moved: false };
  fr.setPointerCapture(e.pointerId);
});
mainEl().addEventListener('pointermove', (e) => {
  if (!pan) return;
  const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
  if (!pan.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
  if (!pan.moved) { remember(); pan.moved = true; }
  const s = spread();
  s.crops[pan.slot] = { ...s.crops[pan.slot], cx: Math.min(1, Math.max(0, pan.cx - dx / pan.f / pan.pw)), cy: Math.min(1, Math.max(0, pan.cy - dy / pan.f / pan.ph)) };
  const fr = $(`.fr[data-slot="${pan.slot}"]`, mainEl());
  const r = spreadRects(s, page(), photos).find((x) => x.slot === pan!.slot)!;
  placeImg($<HTMLImageElement>('img', fr), r, photos.get(s.slots[pan.slot]!)!, s, pan.slot, mainWidth() / (page().w * 2));
});
const endPan = () => {
  if (!pan) return;
  const moved = pan.moved;
  // Keep the centre where the photo actually stopped (it can't go past its edges).
  const s = spread(), p = photos.get(s.slots[pan.slot]!)!, r = spreadRects(s, page(), photos).find((x) => x.slot === pan!.slot)!;
  const c = cropBox(r, p.width, p.height, s.crops[pan.slot]);
  s.crops[pan.slot] = { cx: +((c.sx + c.sw / 2) / p.width).toFixed(5), cy: +((c.sy + c.sh / 2) / p.height).toFixed(5), z: +c.z.toFixed(4) };
  pan = null;
  if (moved) { drawStrip(); changed(); }
};
mainEl().addEventListener('pointerup', endPan);
mainEl().addEventListener('pointercancel', endPan);
let wheelSaved = 0;
mainEl().addEventListener('wheel', (e) => {
  const fr = (e.target as HTMLElement).closest<HTMLElement>('.fr');
  if (!fr || fr.classList.contains('empty')) return;
  e.preventDefault();
  const slot = Number(fr.dataset.slot), s = spread(), p = photos.get(s.slots[slot]!)!;
  const r = spreadRects(s, page(), photos).find((x) => x.slot === slot)!;
  const zmax = maxZoom(r, p.width, p.height);
  const z0 = s.crops[slot]?.z ?? 1;
  const z = Math.min(zmax, Math.max(1, z0 * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
  if (z === z0) { if (e.deltaY < 0 && zmax > 1) toast(`Zoom stops at ${DPI_MIN} dpi.`); return; }
  if (Date.now() - wheelSaved > 1500) remember();
  wheelSaved = Date.now();
  s.crops[slot] = { ...s.crops[slot], z: +z.toFixed(4) };
  sel = slot;
  drawMain(); drawSide(); changed();
  clearTimeout((mainEl() as any)._st); (mainEl() as any)._st = setTimeout(drawStrip, 400);
}, { passive: false });

// ---- Drag and drop: tray → frame, frame ⇄ frame, frame → another spread or the tray, spreads reordered ----
type Drag = { t: 'photo'; id: string } | { t: 'frame'; k: number; slot: number } | { t: 'spread'; k: number };
let drag: Drag | null = null;
document.addEventListener('dragstart', (e) => {
  const t = e.target as HTMLElement;
  if (t.classList?.contains('tp')) drag = { t: 'photo', id: t.dataset.id! };
  else if (t.classList?.contains('h')) drag = { t: 'frame', k: cur, slot: Number(t.closest<HTMLElement>('.fr')!.dataset.slot) };
  else if (t.classList?.contains('st-item')) drag = { t: 'spread', k: Number(t.dataset.k) };
  else return;
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', 'album');
  if (drag.t === 'frame') { const img = t.closest('.fr')!.querySelector('img'); if (img) e.dataTransfer!.setDragImage(img, 20, 20); }
});
document.addEventListener('dragend', () => { drag = null; $$('.over').forEach((x) => x.classList.remove('over')); });
const target = (e: DragEvent) => {
  const t = e.target as HTMLElement;
  if (!drag) return null;
  const fr = t.closest<HTMLElement>('[data-main] .fr');
  if (fr && drag.t !== 'spread') return fr;
  const st = t.closest<HTMLElement>('.st-item');
  if (st && (drag.t === 'frame' || drag.t === 'spread' || drag.t === 'photo')) return st;
  const tray = t.closest<HTMLElement>('.ad-tray');
  if (tray && drag.t === 'frame') return $('[data-tray]');
  return null;
};
document.addEventListener('dragover', (e) => {
  const el = target(e);
  $$('.over').forEach((x) => x !== el && x.classList.remove('over'));
  if (!el) return;
  e.preventDefault();
  el.classList.add('over');
});
document.addEventListener('drop', (e) => {
  const el = target(e);
  if (!el || !drag) return;
  e.preventDefault();
  el.classList.remove('over');
  const d = drag;
  drag = null;
  remember();
  if (el.classList.contains('fr')) {
    const slot = Number(el.dataset.slot);
    if (d.t === 'photo') put(slot, d.id);
    else if (d.t === 'frame' && d.slot !== slot) {
      const s = spread();
      [s.slots[slot], s.slots[d.slot]] = [s.slots[d.slot] ?? null, s.slots[slot] ?? null];
      [s.crops[slot], s.crops[d.slot]] = [{ cx: 0.5, cy: 0.5, z: 1 }, { cx: 0.5, cy: 0.5, z: 1 }];
    }
    sel = slot;
  } else if (el.classList.contains('st-item')) {
    const k = Number(el.dataset.k);
    if (d.t === 'spread') {
      if (d.k !== k) { const [s] = design.spreads.splice(d.k, 1); design.spreads.splice(k, 0, s); cur = k; }
    } else {
      const id = d.t === 'photo' ? d.id : design.spreads[d.k].slots[d.slot];
      if (id && k !== (d.t === 'frame' ? d.k : -1)) {
        const to = design.spreads[k], n = slotsOf(to.layout);
        let slot = Array.from({ length: n }, (_, x) => x).find((x) => !to.slots[x]);
        // No empty frame there: swap with its last photo (or give a blank spread a frame).
        if (slot === undefined && n === 0) { design.spreads[k] = spreadFor([photos.get(id)!], page()); slot = -1; }
        else if (slot === undefined) slot = n - 1;
        const out = slot >= 0 ? to.slots[slot] ?? null : null;
        if (slot >= 0) { to.slots[slot] = id; to.crops[slot] = { cx: 0.5, cy: 0.5, z: 1 }; }
        if (d.t === 'frame') { const from = design.spreads[d.k]; from.slots[d.slot] = out; from.crops[d.slot] = { cx: 0.5, cy: 0.5, z: 1 }; }
        toast(`Moved to spread ${k + 1}${out && d.t === 'frame' ? ', swapped with its last photo' : ''}.`);
      }
    }
  } else if (d.t === 'frame') {
    design.spreads[d.k].slots[d.slot] = null;
    sel = null;
  }
  drawAll(); changed();
});

// ---- Auto layout ----
function openAuto() {
  const dlg = $<HTMLDialogElement>('[data-auto-dlg]');
  const from = $<HTMLSelectElement>('[name="from"]', dlg);
  from.innerHTML = sourceOptions(false).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  const count = $<HTMLInputElement>('[name="count"]', dlg);
  count.value = String(design.spreads.length);
  const hint = () => {
    const n = sourceIds(from.value).length, c = Math.min(SPREADS_MAX, Math.max(SPREADS_MIN, Number(count.value) || SPREADS_MIN));
    $('.auto-hint', dlg).textContent = !n ? 'No photos there.' : `${n} photos over ${c} spreads: about ${(n / c).toFixed(1)} a spread.${n > c * 4 ? ` ${n - c * 4} won’t fit (4 a spread at most): add spreads, or they stay in the tray.` : ''}${n < c ? ` ${c - n} spread${c - n === 1 ? '' : 's'} will be blank.` : ''}`;
  };
  from.onchange = hint; count.oninput = hint; hint();
  dlg.showModal();
}
$('[data-auto-dlg] form').addEventListener('submit', (e) => {
  const sub = (e as SubmitEvent).submitter as HTMLButtonElement | null;
  if (sub?.value !== 'go') return;
  const dlg = $('[data-auto-dlg]');
  const ids = sourceIds($<HTMLSelectElement>('[name="from"]', dlg).value);
  const c = Math.min(SPREADS_MAX, Math.max(SPREADS_MIN, Math.round(Number($<HTMLInputElement>('[name="count"]', dlg).value) || SPREADS_MIN)));
  if (!ids.length) { e.preventDefault(); toast('No photos there.', true); return; }
  remember();
  const r = autoLayout(ids.map((id) => photos.get(id)!), c, page());
  design.spreads = r.spreads;
  cur = 0; sel = null;
  drawAll(); changed();
  toast(r.left.length ? `Laid out. ${r.left.length} photos didn’t fit; add spreads or swap them in.` : 'Laid out. Undo brings back the old layout.');
});

// ---- The Seldex files ----
function sheet() {
  const pg = page(), px = spreadPx(album.size, album.orientation), m = ALBUM_MARGINS;
  const lines = [
    `Seldex order: Boutique Book`, ``,
    `Album: ${album.name}`, `Gallery: ${gallery?.name ?? ''}`, `Made: ${new Date().toLocaleString('en-NZ')} (version ${album.version})`, ``,
    `Size: ${sizeLabel(album.size, album.orientation)} (Seldex size ${album.size}${album.orientation === 'landscape' ? ', landscape' : ''})`,
    `Spreads: ${design.spreads.length} (${design.spreads.length * 2} pages; 10 spreads included)`,
    `Spread files: ${px.w} × ${px.h} px = ${pg.w * 2 + 2 * m.bleed} × ${pg.h + 2 * m.bleed} in at 300 dpi, JPEG, sRGB, 001.jpg to ${String(design.spreads.length).padStart(3, '0')}.jpg`,
    `Background: ${album.bg}`,
    `Margins used: bleed ${m.bleed} in, safe area ${m.safe} in, fold kept clear ${m.gutter} in each side${m.confirmed ? '' : ' (NOT confirmed by Seldex yet)'}`, ``,
    `To choose on the Seldex order: cover material and colour, lining, paper (Matte Ivory / White), packaging, logo position, vellum, companion albums.`, ``,
    `Spreads:`,
    ...design.spreads.map((s, k) => `${String(k + 1).padStart(3, '0')}.jpg  ${s.layout === 'span' ? 'across both pages' : `${PAGE_LAYOUTS[s.layout[0]]?.label} | ${PAGE_LAYOUTS[s.layout[1]]?.label}`}: ${s.slots.filter(Boolean).map((id) => photos.get(id!)?.filename).join(', ') || '(no photos)'}`),
  ];
  return lines.join('\n');
}
async function exportFiles() {
  if (dirty || saving) await save();
  const pg = page();
  const empty: number[] = [], soft: string[] = [], missing = new Set<string>();
  design.spreads.forEach((s, k) => {
    const rects = spreadRects(s, pg, photos);
    if (rects.some((r) => !s.slots[r.slot])) empty.push(k + 1);
    for (const r of rects) {
      const id = s.slots[r.slot];
      if (!id) continue;
      const q = quality(r, id, s, r.slot)!;
      if (q < DPI_MIN) soft.push(`spread ${k + 1} (${Math.round(q)} dpi)`);
      if (!photos.get(id)!.has_original) missing.add(photos.get(id)!.filename);
    }
  });
  if (missing.size) return toast(`The full-size file isn’t stored for ${[...missing].slice(0, 3).join(', ')}${missing.size > 3 ? '…' : ''}. Add the originals first.`, true);
  const warn = [empty.length ? `Empty frames on spread${empty.length === 1 ? '' : 's'} ${empty.join(', ')} (they print as the background).` : '', soft.length ? `Under ${DPI_MIN} dpi: ${soft.join(', ')}.` : '', ALBUM_MARGINS.confirmed ? '' : 'Seldex hasn’t confirmed the bleed and safe margins yet.'].filter(Boolean);
  if (warn.length && !(await ask(`${warn.join(' ')} Make the files anyway?`))) return;
  const dlg = $<HTMLDialogElement>('[data-export-dlg]');
  const px = spreadPx(album.size, album.orientation);
  const bar = $<HTMLElement>('.bar span', dlg), text = $('.ex-text', dlg);
  dlg.showModal();
  try {
    await albumFiles({ ...album, design }, album.gallery_id, photos, sheet(), (n, of) => {
      bar.style.width = `${Math.round((100 * n) / of)}%`;
      text.textContent = n < of ? `Drawing spread ${n + 1} of ${of} at ${px.w} × ${px.h} px from the full-size photos…` : 'Done. The ZIP is in your downloads: upload the spreads to Seldex with the order.';
    });
    api('/api/studio/galleries/albums', 'POST', { action: 'exported', id: album.id }).catch(() => {});
  } catch (e) {
    text.textContent = (e as Error).message;
  }
}

// ---- Loading ----
function fillSettings() {
  const f = (n: string) => $<HTMLInputElement>(`.ad-settings [name="${n}"]`);
  f('name').value = album.name;
  $<HTMLSelectElement>('[name="size"]').innerHTML = Object.keys(ALBUM_SIZES).map((s) => `<option value="${s}"${s === album.size ? ' selected' : ''}>${s.replace('x', ' × ')}″</option>`).join('');
  $<HTMLSelectElement>('[name="orientation"]').innerHTML = orientationsOf(album.size).map((o) => `<option value="${o}"${o === album.orientation ? ' selected' : ''}>${o[0].toUpperCase()}${o.slice(1)}</option>`).join('');
  $<HTMLSelectElement>('[name="orientation"]').disabled = orientationsOf(album.size).length < 2;
  f('bg').value = album.bg;
  const px = spreadPx(album.size, album.orientation);
  $('.ad-sub').textContent = `${gallery?.name ?? ''} · Seldex Boutique Book ${sizeLabel(album.size, album.orientation)} · spread files ${px.w} × ${px.h} px · only you see this`;
}
async function load() {
  if (!albumId) { $('h1').textContent = 'Which album?'; return; }
  let d: any;
  try { d = await api(`/api/studio/galleries/albums?id=${albumId}`); } catch (e) { $('h1').textContent = (e as Error).message; return; }
  ({ album, gallery, sections, lists } = d);
  design = { spreads: album.design.spreads ?? [], picks: album.design.picks ?? [] };
  photos = new Map(d.images.map((i: Img) => [i.id, i]));
  const secOrder = new Map(sections.map((s: any, k: number) => [s.id, k]));
  order = [...photos.values()].sort((a, b) => (secOrder.get(a.section_id) ?? 999) - (secOrder.get(b.section_id) ?? 999) || a.sort_order - b.sort_order).map((p) => p.id);
  document.title = `${album.name} · Moments Studio`;
  $('h1').textContent = album.name;
  $<HTMLAnchorElement>('[data-back]').href = `/studio/gallery?id=${encodeURIComponent(album.gallery_id)}&tab=albums`;
  fillSettings();
  drawAll();
  $('.ad-saved').textContent = `Version ${album.version}`;
  if (design.spreads.every((s) => !s.slots.some(Boolean))) {
    if (design.picks.length) $<HTMLSelectElement>('[name="source"]').value = 'picks';
    toast('An empty album: choose photos below, or use Auto layout to start.');
  }
}
let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = window.setTimeout(drawMain, 150); });
load();
