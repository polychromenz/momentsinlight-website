// Prints in the client gallery (MIL Galleries 3a; server: functions-lib/prints.js).
// Three ways in, like Pic-Time: the Shop button (product cards shown with the couple's own photos,
// then choose photos), "Order a print" on a photo, or "Order prints" for a selection. Then choose
// the product, paper or frame colour and size, see the photo in it, set the crop (never below
// 150 dpi; a warning under 200), and add to the cart. Print packs take up to 24 photos, repeated to
// fill the pack. The cart asks where to deliver (New Zealand or Australia, and the postcode) and the
// server works out delivery by lab (functions-lib/print-freight.js: it needs the labs' costs, which
// never come to this page). Then Stripe Checkout takes the payment and address. Only Tony sees
// it until he switches it on; his studio visits can also place test orders without paying.
import { mockup, cropEditor, styleMockups, croppedPhoto, type Product, type Crop } from './prints/mockup';
import { roomView, hasRoom, ROOM_CSS } from './prints/rooms';
import { orderTotals, productTotal, ratioOf, centredCrop, cleanCrop, dpi, money, minCropW, packCount, fillPack, DPI_WARN, DPI_MIN, PAPER } from '../functions-lib/print-pricing.js';

type Img = { id: string; w: number; h: number; thumb: string; web: string; hero?: number; s?: number };
export type Shop = { products: Product[]; freight_prints: number; freight_wall: number; free_over: number; intro: string; countries?: Record<string, string>; trial: { live: boolean } | null };
type Dest = { country: string; postcode: string; speed: 'standard' | 'express' };
type Quote = { subtotal: number; freight: number; total: number; free: boolean; parts: { lab: string; label: string; amount: number }[]; express: { standard: number; express: number } | null; error: string };
type PackPhoto = { image_id: string; n: number; crop: Crop; landscape: boolean };
type Line = { key: string; image_id: string; product_id: number; qty: number; crop: Crop; landscape: boolean; pack?: PackPhoto[] };
type Ctx = { slug: string; viewer: () => string; images: () => Img[]; favourites: () => string[]; shop: () => Shop | null; toast: (m: string) => void };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const nzd = (c: number) => money(c).replace(/\.00$/, '');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const GROUPS: [string, string[]][] = [
  ['Prints', ['Prints', 'Print Pack', 'Deckled Prints', 'Panoramic Prints', 'Matted Prints']],
  ['Wall art', ['Frames', 'Matted Frames', 'Float Frames', 'Circular Frames', 'Canvas', 'Gallery Boards']],
];
const NICE: Record<string, string> = { 'Prints': 'Photo prints', 'Print Pack': 'Print pack', 'Deckled Prints': 'Deckled edge', 'Panoramic Prints': 'Panoramic', 'Matted Prints': 'Matted print', 'Canvas': 'Canvas', 'Frames': 'Framed print', 'Matted Frames': 'Framed with mat', 'Float Frames': 'Hand torn frame', 'Circular Frames': 'Circle frame', 'Gallery Boards': 'Gallery board' };
const ABOUT: Record<string, string> = {
  'Prints': 'Professional photo prints on semi gloss paper, with a gentle sheen and deep, rich colour.',
  'Print Pack': 'A set of 24 prints, one size, from up to 24 of your photos. Choose fewer and your favourites are repeated to fill the pack.',
  'Deckled Prints': 'Fine art paper with a hand-torn edge, for a soft, timeless look.',
  'Panoramic Prints': 'A long, wide print for panoramic photos.',
  'Matted Prints': 'A thick archival print set in a white mat, to display on its own or in a frame.',
  'Canvas': 'Gallery-wrapped canvas on a wooden frame, ready to hang. The edge is the photo itself (Natural) or a colour.',
  'Frames': 'A modern box-style frame with the print behind glass, ready to hang.',
  'Matted Frames': 'A box-style frame with a thick white mat, ready to hang and display anywhere.',
  'Float Frames': 'A fine art print with a soft hand-torn edge, floating on a white mat in a frame, ready to hang.',
  'Circular Frames': 'A round, deckled-edge print in a square frame with a mat.',
  'Gallery Boards': 'The print mounted on a rigid board with a dark edge, to lean or hang.',
};
const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0];

export function initShop(ctx: Ctx) {
  const store = `mil-cart-${ctx.slug}`;
  const load = (): Line[] => { try { return JSON.parse(localStorage.getItem(store) || '[]'); } catch { return []; } };
  const save = (l: Line[]) => { try { localStorage.setItem(store, JSON.stringify(l)); } catch { /* fine */ } };
  let cart: Line[] = load();
  // Where to deliver: kept for every gallery (it's the same couple's address).
  const loadDest = (): Dest => { try { return { country: 'NZ', postcode: '', speed: 'standard', ...JSON.parse(localStorage.getItem('mil-deliver') || '{}') }; } catch { return { country: 'NZ', postcode: '', speed: 'standard' }; } };
  const dest: Dest = loadDest();
  const saveDest = () => { try { localStorage.setItem('mil-deliver', JSON.stringify(dest)); } catch { /* fine */ } };
  let quote: { key: string; q: Quote | null; busy: boolean } = { key: '', q: null, busy: false };
  let quoteTimer = 0;
  const products = () => ctx.shop()?.products ?? [];
  const byId = () => new Map(products().map((p) => [p.id, p]));
  const img = (id: string) => ctx.images().find((i) => i.id === id);
  // Lines whose photos or product have gone are dropped quietly.
  const tidyCart = () => {
    const m = byId();
    cart = cart.filter((l) => m.has(l.product_id) && (l.pack ? l.pack.length && l.pack.every((x) => img(x.image_id)) : img(l.image_id)));
    save(cart);
  };

  // ---- The page parts: Shop and Cart buttons in the top bar, and the two dialogs ----
  const css = document.createElement('style');
  css.textContent = SHOP_CSS + ROOM_CSS;
  document.head.append(css);
  styleMockups();
  const shopDlg = document.createElement('dialog');
  shopDlg.className = 'g-dlg shop-dlg'; shopDlg.setAttribute('aria-label', 'Prints and wall art');
  const cartDlg = document.createElement('dialog');
  cartDlg.className = 'g-dlg g-dlg--side cart-dlg'; cartDlg.setAttribute('aria-label', 'Your cart');
  document.body.append(shopDlg, cartDlg);
  [shopDlg, cartDlg].forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
  const cartBtn = document.createElement('button');
  cartBtn.type = 'button'; cartBtn.className = 'g-btn g-btn--cart'; cartBtn.hidden = true;
  const shopBtn = document.createElement('button');
  shopBtn.type = 'button'; shopBtn.className = 'g-btn g-btn--shop'; shopBtn.textContent = 'Shop'; shopBtn.hidden = true;
  document.querySelector('.g-actions')?.prepend(shopBtn, cartBtn);
  cartBtn.addEventListener('click', () => openCart());
  shopBtn.addEventListener('click', () => openBrowse());

  function drawCartButton() {
    const on = !!ctx.shop();
    if (on) tidyCart();
    const n = cart.reduce((a, l) => a + (l.pack ? 1 : l.qty), 0);
    shopBtn.hidden = !on;
    cartBtn.hidden = !on || !n;
    cartBtn.innerHTML = `Cart <span>${n}</span>`;
  }

  // ---- State ----
  // Several photos: each has its own choice (product, size, copies, way round). Until someone taps
  // another photo in the strip, a choice applies to them all (linked); after that, to the photo shown.
  // A print pack instead has one product for its photos, and how many prints of each (counts).
  type Choice = { cat: string; type: string; pid: number; qty: number; landscape: boolean };
  type State = Choice & {
    view: 'browse' | 'pick' | 'product'; ids: string[]; at: number; crops: Map<string, Crop>; cropping: boolean; editing: string | null;
    choices: Map<string, Choice>; linked: boolean; counts: Map<string, number>; picked: Set<string>; pickCat: string; favsOnly: boolean;
  };
  let st: State = blank();
  function blank(): State {
    return { view: 'browse', ids: [], at: 0, cat: '', type: '', pid: 0, qty: 1, landscape: false, crops: new Map(), cropping: false, editing: null,
      choices: new Map(), linked: true, counts: new Map(), picked: new Set(), pickCat: '', favsOnly: false };
  }
  const cats = () => {
    const have = new Set(products().map((p) => p.category));
    return GROUPS.map(([g, list]) => [g, list.filter((c) => have.has(c))] as [string, string[]]).filter(([, l]) => l.length);
  };
  const allCats = () => cats().flatMap(([, l]) => l);
  const typesOf = (cat: string) => [...new Set(products().filter((p) => p.category === cat).map((p) => p.type))];
  const sizesOf = (cat: string, type: string) => products().filter((p) => p.category === cat && p.type === type);
  const prod = () => byId().get(st.pid)!;
  const isPack = () => prod()?.kind === 'pack';
  const photo = () => img(st.ids[st.at])!;
  const pr = (i: Img) => i.w / i.h;
  const defaultLandscape = (i: Img) => i.w > i.h;
  const landFor = (p: Product, i: Img, want: boolean) => p.w_cm !== p.h_cm && want;
  // Frames can be seen "in a room" (Seldex's room scenes) or close up; the choice is kept while shopping.
  let inRoom = true;
  // Tony's test visits only: which lab makes each product (couples never see it).
  const labName = (p: Product) => (/seldex/i.test(p.lab ?? '') ? 'Seldex' : /atkins/i.test(p.lab ?? '') ? 'Atkins' : /in.?house/i.test(p.lab ?? '') ? 'In house' : p.lab || '');
  const labCls = (l: string) => l.toLowerCase().replace(/\s+/g, '');
  const labTag = (p: Product) => (ctx.shop()?.trial && labName(p) ? ` <em class="sh-lab sh-lab--${labCls(labName(p))}">${esc(labName(p))}</em>` : '');
  // Quality: the dpi of the whole photo on this product (the most it can be), and the smallest crop allowed.
  const fullDpi = (i: Img, p: Product, land: boolean) => dpi(i.w, centredCrop(pr(i), ratioOf(p, land)), p, land);
  const minW = (i: Img, p: Product, land: boolean) => minCropW(i.w, p, land);
  // Crops are kept per photo and print shape, so changing size and back keeps a crop that was set.
  const cropKey = (i: Img, p: Product, land: boolean) => `${i.id}|${ratioOf(p, land).toFixed(4)}`;
  const cropWith = (i: Img, p: Product, land: boolean) => cleanCrop(st.crops.get(cropKey(i, p, land)) ?? centredCrop(pr(i), ratioOf(p, land)), pr(i), ratioOf(p, land), minW(i, p, land));
  const cropFor = (i: Img) => cropWith(i, prod(), curLand(i));
  const setCrop = (i: Img, c: Crop) => st.crops.set(cropKey(i, prod(), curLand(i)), c);
  // A pack's photos each print their own way round; otherwise the choice says.
  const curLand = (i: Img) => (isPack() ? landFor(prod(), i, defaultLandscape(i)) : landFor(prod(), i, st.landscape));
  const mine = (): Choice => ({ cat: st.cat, type: st.type, pid: st.pid, qty: st.qty, landscape: st.landscape });
  const adapt = (c: Choice, i: Img): Choice => { const p = byId().get(c.pid); return { ...c, landscape: p && p.w_cm !== p.h_cm ? defaultLandscape(i) : false }; };
  function commit() {
    if (!st.ids.length) return;
    const c = mine();
    st.choices.set(st.ids[st.at], c);
    if (st.linked || isPack()) for (const id of st.ids) if (id !== st.ids[st.at]) { const i = img(id); if (i) st.choices.set(id, adapt(c, i)); }
  }
  const choiceOf = (id: string) => st.choices.get(id) ?? mine();
  function showPhoto(k: number) { commit(); st.at = k; if (!isPack()) Object.assign(st, choiceOf(st.ids[k])); }

  /** Choose a category (and paper or colour, and size): the size kept if it exists, otherwise the
   *  one nearest the photo's shape and a 20 × 30 cm print that prints well. */
  function pick(cat: string, type?: string, pid?: number) {
    st.cat = cat;
    const types = typesOf(cat);
    st.type = type && types.includes(type) ? type : types.includes(st.type) ? st.type : types[0];
    const sizes = sizesOf(st.cat, st.type);
    const i = photo();
    const ok = (p: Product) => !i || fullDpi(i, p, landFor(p, i, st.landscape)) >= DPI_MIN;
    const same = sizes.find((p) => p.id === pid) ?? sizes.find((p) => p.name.split(' ')[0] === byId().get(st.pid)?.name.split(' ')[0] && ok(p));
    const fit = (p: Product) => (i ? Math.abs(Math.log(ratioOf(p, st.landscape) / pr(i))) : 0);
    const near = (p: Product) => Math.abs(Math.log((p.w_cm * p.h_cm) / 600));
    const good = sizes.filter(ok);
    const pool = good.length ? good : sizes;
    const top = Math.min(...pool.map(fit));
    const best = pool.filter((p) => fit(p) <= top + 0.03).sort((a, b) => near(a) - near(b))[0];
    st.pid = (same ?? best ?? sizes[0]).id;
    if (isPack()) {
      st.qty = 1;
      if (st.ids.length > packCount(prod())) { st.ids = st.ids.slice(0, packCount(prod())); st.at = Math.min(st.at, st.ids.length - 1); ctx.toast(`A pack takes up to ${packCount(prod())} photos: the first ${packCount(prod())} are used.`); }
    }
    commit();
  }

  /** Start on chosen photos (from a photo or a selection). edit: a cart line to change. */
  function openShop(ids: string[], edit: Line | null = null, cat = '') {
    if (!ctx.shop() || !ids.length) return;
    const first = img(ids[0]);
    if (!first) return;
    const p0 = edit ? byId().get(edit.product_id) : null;
    st = { ...blank(), view: 'product', ids, qty: edit?.qty ?? 1, landscape: edit ? edit.landscape : defaultLandscape(first), editing: edit?.key ?? null };
    if (edit?.pack && p0) for (const x of edit.pack) { st.counts.set(x.image_id, x.n); const i = img(x.image_id); if (i) st.crops.set(cropKey(i, p0, x.landscape), x.crop); }
    else if (p0 && edit) st.crops.set(cropKey(first, p0, edit.landscape), edit.crop);
    if (p0) { st.pid = p0.id; pick(p0.category, p0.type, p0.id); } else pick(cat && allCats().includes(cat) ? cat : allCats()[0]);
    draw();
    if (!shopDlg.open) shopDlg.showModal();
  }
  /** The Shop button: the product cards. */
  function openBrowse() {
    if (!ctx.shop()) return;
    st = blank();
    draw();
    if (!shopDlg.open) shopDlg.showModal();
  }
  /** Choose photos for a product (from a card, or "Change photos"). */
  function openPick(cat: string) {
    commit();
    st.pickCat = cat;
    st.picked = new Set(st.ids);
    st.view = 'pick';
    draw();
  }
  const pickLimit = () => { const p = products().find((x) => x.category === st.pickCat); return p?.kind === 'pack' ? packCount(p) : 60; };

  // ---- Drawing ----
  function draw() {
    // Redrawing keeps both scrolling parts where they were (the options panel; on phones, the whole body).
    const same = shopDlg.open && shopDlg.dataset.view === st.view;
    const kept = same ? shopDlg.querySelector<HTMLElement>('.sh-scroll')?.scrollTop ?? null : null;
    const keptBody = same ? shopDlg.querySelector<HTMLElement>('.dlg-body')?.scrollTop ?? 0 : 0;
    shopDlg.dataset.view = st.view;
    if (st.view === 'browse') drawBrowse();
    else if (st.view === 'pick') drawPick();
    else drawProduct();
    requestAnimationFrame(() => {
      const panel = shopDlg.querySelector<HTMLElement>('.sh-scroll');
      if (panel && kept !== null) panel.scrollTop = kept;
      const body = shopDlg.querySelector<HTMLElement>('.dlg-body');
      if (body && keptBody) body.scrollTop = keptBody;
      if (st.view === 'product') { stage(); drawFacts(); if (kept === null) centreSize(); }
      if (st.view === 'browse') drawCards();
    });
  }
  const trialNote = () => { const t = ctx.shop()?.trial; return t ? `<p class="sh-trial">Only you can see prints${t.live ? ' (and your clients: it’s switched on)' : ''}. Test orders don’t take a payment.</p>` : ''; };
  // The couple's best photos for the cards: highlights first, then the gallery's first photos.
  const samples = () => { const all = ctx.images(); const h = all.filter((i) => i.hero); return (h.length >= 3 ? h : [...h, ...all.filter((i) => !i.hero)]).slice(0, 12); };
  const fromPrice = (cat: string) => Math.min(...products().filter((p) => p.category === cat).map((p) => p.tiers?.[0]?.base ?? p.price));

  function drawBrowse() {
    shopDlg.innerHTML = `<div class="dlg-body sh-browse sh-scroll">
      <button type="button" class="dlg-x" data-sh-close aria-label="Close">✕</button>
      <h2>Prints &amp; wall art</h2>
      ${trialNote()}
      <p class="sh-lead">${esc(ctx.shop()!.intro)}</p>
      ${cats().map(([g, list]) => `<h3>${g}</h3><div class="sh-cards">${list.map((c) => `<button type="button" class="sh-card" data-card="${esc(c)}">
          <span class="sh-card-mk" data-card-mk="${esc(c)}"></span>
          <strong>${esc(NICE[c] ?? c)}</strong><span>${esc(firstSentence(ABOUT[c] ?? ''))}</span><em>from ${nzd(fromPrice(c))}</em>${ctx.shop()?.trial ? `<span class="sh-card-labs">${[...new Set(products().filter((p) => p.category === c).map(labName))].map((l) => `<em class="sh-lab sh-lab--${labCls(l)}">${esc(l)}</em>`).join(' ')}</span>` : ''}</button>`).join('')}</div>`).join('')}
      ${cart.length ? '<p class="sh-hint"><button type="button" class="ct-link" data-to-cart>See your cart</button></p>' : ''}
    </div>`;
  }
  function drawCards() {
    const pics = samples();
    shopDlg.querySelectorAll<HTMLElement>('[data-card-mk]').forEach((el, k) => {
      const cat = el.dataset.cardMk!;
      const i = pics[k % Math.max(1, pics.length)];
      const list = products().filter((p) => p.category === cat);
      // A frame looks best in a warm wood or white; otherwise the first colour.
      const p = list.find((x) => /Light Wood|White|Natural|Fine Art/.test(x.type)) ?? list[0];
      if (!i || !p) return;
      const land = landFor(p, i, defaultLandscape(i));
      const c = centredCrop(pr(i), ratioOf(p, land)), w = el.clientWidth || 260, h = el.clientHeight || 190;
      const v = roomView(p, i.web, pr(i), c, land, w, h);
      el.innerHTML = v ? v.html : mockup(p, i.web, c, land, w, h);
      el.classList.toggle('sh-card-mk--room', !!v);
    });
  }

  function drawPick() {
    const limit = pickLimit();
    const favs = new Set(ctx.favourites());
    const list = ctx.images().filter((i) => !st.favsOnly || favs.has(i.id));
    const n = st.picked.size;
    shopDlg.innerHTML = `<div class="dlg-body sh-pick">
      <div class="sh-pick-head">
        <button type="button" class="ct-link" data-back>‹ ${st.ids.length ? 'Back' : 'All products'}</button>
        <h2>Choose ${limit < 60 ? `up to ${limit} photos` : 'photos'} for ${esc((NICE[st.pickCat] ?? st.pickCat).toLowerCase())}</h2>
        <div class="sh-pills">${favs.size ? `<button type="button" class="${st.favsOnly ? '' : 'on'}" data-favs="0">All photos</button><button type="button" class="${st.favsOnly ? 'on' : ''}" data-favs="1">♥ Favourites</button>` : ''}</div>
        <button type="button" class="dlg-x" data-sh-close aria-label="Close">✕</button>
      </div>
      <div class="sh-grid sh-scroll">${list.map((i) => `<button type="button" class="sh-pic${st.picked.has(i.id) ? ' on' : ''}" data-pic="${i.id}" style="aspect-ratio:${(i.w / i.h).toFixed(3)}"><img src="${esc(i.thumb)}" alt="" loading="lazy" /><span class="sh-tick">✓</span></button>`).join('') || '<p class="muted">No photos here.</p>'}</div>
      <div class="sh-pick-foot"><span>${n ? `${plural(n, 'photo')} chosen${limit < 60 ? ` of up to ${limit}` : ''}` : 'Tap photos to choose them'}</span>
        <button type="button" class="g-cta" data-pick-done${n ? '' : ' disabled'}>Continue</button></div>
    </div>`;
  }

  function stage() {
    const host = shopDlg.querySelector<HTMLElement>('.sh-stage');
    if (!host) return;
    const p = prod(), i = photo(), land = curLand(i), c = cropFor(i);
    if (st.cropping) {
      const ed = cropEditor(host, i.web, pr(i), ratioOf(p, land), c, (nc) => { setCrop(i, nc); drawFacts(); }, p.kind === 'circle', minW(i, p, land));
      const z = shopDlg.querySelector<HTMLInputElement>('[data-zoom]')!;
      z.value = String(ed.zoomOf());
      z.disabled = !ed.canZoom;
      z.oninput = () => ed.zoom(Number(z.value));
    } else if (inRoom && hasRoom(p, land)) {
      const v = roomView(p, i.web, pr(i), c, land, host.clientWidth || 600, host.clientHeight || 420)!;
      host.innerHTML = v.html;
      const note = shopDlg.querySelector<HTMLElement>('.sh-room-note');
      if (note) note.textContent = v.exact ? 'Shown in a room to give a feel for it. The size on the wall is a guide only.' : `Shown in a room with a very similar frame. Yours will be ${p.type.toLowerCase()}.`;
    } else {
      host.innerHTML = mockup(p, i.web, c, land, host.clientWidth || 600, host.clientHeight || 420);
    }
  }

  function drawFacts() {
    const el = shopDlg.querySelector('.sh-facts');
    if (!el) return;
    const p = prod(), i = photo(), land = curLand(i);
    const d = dpi(i.w, cropFor(i), p, land);
    const atFloor = st.cropping && cropFor(i).w <= minW(i, p, land) + 0.002;
    const tiers = (p.tiers ?? []).filter((t) => t.q > 1);
    const each = st.ids.length;
    let totals = '';
    if (isPack()) totals = `<p class="sh-total"><span>${plural(packCount(p), 'print')}</span><strong>${nzd(p.price)}</strong></p>`;
    else {
      const all = each > 1 ? orderTotals(st.ids.map((id) => ({ product_id: choiceOf(id).pid, qty: choiceOf(id).qty })), byId(), { free_over: 0, freight_prints: 0, freight_wall: 0 }).subtotal : 0;
      totals = `<p class="sh-total"><span>${each > 1 ? `${st.linked ? 'Each photo' : 'This photo'}${st.qty > 1 ? ` × ${st.qty}` : ''}` : st.qty > 1 ? `${st.qty} prints` : '&nbsp;'}</span><strong>${nzd(productTotal(p, st.qty))}</strong></p>
        ${each > 1 ? `<p class="sh-total sh-total--all"><span>All ${plural(each, 'photo')}</span><strong>${nzd(all)}</strong></p>` : ''}`;
    }
    el.innerHTML = `
      ${atFloor ? `<p class="sh-warn">That’s as far as this photo can be zoomed for ${esc(sizeLabel(p, land))} and still print well.</p>`
        : d && d < DPI_WARN ? `<p class="sh-caution">This crop prints at about ${Math.round(d)} dpi, so it may look a little soft up close. Zoom out or choose a smaller size for the sharpest print.</p>` : ''}
      ${tiers.length ? `<p class="sh-bulk">Order more and save: ${tiers.map((t) => `${t.q} or more, then ${nzd(t.add)} each`).join(' · ')}</p>` : ''}
      ${totals}`;
  }

  function centreSize() {
    const on = shopDlg.querySelector<HTMLElement>('.sh-sizes label.on');
    const panel = shopDlg.querySelector<HTMLElement>('.sh-right');
    if (!on || !panel || panel.scrollHeight <= panel.clientHeight) return;
    const r = on.getBoundingClientRect(), b = panel.getBoundingClientRect();
    if (r.bottom > b.bottom - 120 || r.top < b.top) panel.scrollTop += r.top - b.top - panel.clientHeight / 2;
  }

  function drawProduct() {
    const shop = ctx.shop()!;
    const p = prod();
    const i = photo();
    const land = curLand(i);
    const pack = isPack();
    const square = p.w_cm === p.h_cm;
    const types = typesOf(st.cat);
    const sizes = sizesOf(st.cat, st.type);
    const multi = st.ids.length > 1;
    const count = pack ? packCount(p) : 0;
    const filled = pack ? fillPack(st.ids.map((id) => ({ image_id: id, n: st.counts.get(id) ?? 0 })), count) : [];
    const chosen = pack ? st.ids.reduce((a, id) => a + (st.counts.get(id) ?? 0), 0) : 0;
    const strip = (multi || pack) ? `<div class="sh-strip">${st.ids.map((id, k) => {
      const x = img(id); if (!x) return '';
      const c = k === st.at ? mine() : choiceOf(id), cp = pack ? p : byId().get(c.pid) ?? p, cl = pack ? landFor(p, x, defaultLandscape(x)) : landFor(cp, x, c.landscape);
      const label = pack ? `×${filled[k]?.n ?? 0}` : `${shortSize(cp, cl)}${c.qty > 1 ? ` ×${c.qty}` : ''}`;
      return `<div class="sh-sp${k === st.at ? ' on' : ''}"><button type="button" data-at="${k}" aria-label="Photo ${k + 1}"><span class="sh-th">${croppedPhoto(x.thumb, cropWith(x, cp, cl), cp.kind === 'circle')}</span><small>${esc(label)}</small></button>
        ${pack ? `<span class="sh-pc"><button type="button" data-pn="${id}" data-d="-1" aria-label="Fewer of this photo">−</button><button type="button" data-pn="${id}" data-d="1" aria-label="More of this photo">+</button></span>` : ''}</div>`;
    }).join('')}</div>` : '';
    const stripHint = pack
      ? `<p class="sh-hint">${chosen >= count ? `${count} prints chosen.` : `${chosen ? `${chosen} of ${count} prints set with + and −; ` : ''}the ${chosen ? 'other ' : ''}${count - chosen} are shared evenly between your photos.`} <button type="button" class="ct-link" data-change-photos>Change photos</button></p>`
      : multi ? `<p class="sh-hint">${st.linked ? 'Your choice is used for every photo. To give a photo its own size, product or number of copies, tap it.' : 'Each photo has its own print: tap a photo to change it. <button type="button" class="ct-link" data-same>Use this print for all photos</button>'} <button type="button" class="ct-link" data-change-photos>Change photos</button></p>`
      : `<p class="sh-hint"><button type="button" class="ct-link" data-change-photos>Choose more photos</button></p>`;
    shopDlg.innerHTML = `<div class="dlg-body sh">
      <button type="button" class="dlg-x" data-sh-close aria-label="Close">✕</button>
      <div class="sh-left">
        <button type="button" class="ct-link sh-allp" data-browse>‹ All products</button>
        <div class="sh-stage${st.cropping ? ' sh-stage--crop' : ''}"></div>
        <div class="sh-under">
          ${st.cropping
            ? `<label class="sh-zoom">Zoom <input type="range" min="0" max="1" step="0.01" data-zoom /></label><button type="button" class="g-btn" data-crop-done>Done</button>`
            : `${hasRoom(p, land) ? `<button type="button" class="g-btn" data-room>${inRoom ? 'Close up' : 'In a room'}</button>` : ''}<button type="button" class="g-btn" data-crop>Adjust crop</button>${square || pack ? '' : `<button type="button" class="g-btn" data-turn>${st.landscape ? 'Make it portrait' : 'Make it landscape'}</button>`}`}
        </div>
        ${hasRoom(p, land) && inRoom && !st.cropping ? '<p class="sh-hint sh-room-note"></p>' : ''}
        ${strip}${stripHint}
      </div>
      <div class="sh-right sh-scroll">
        <h2>${pack ? `${esc(NICE[st.cat] ?? st.cat)} of ${count}` : multi ? `Order prints of ${plural(st.ids.length, 'photo')}` : 'Order a print'}</h2>
        ${trialNote()}
        ${cats().map(([g, list]) => `<div class="sh-group"><span>${g}</span><div class="sh-pills">${list.map((c) => `<button type="button" class="${c === st.cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(NICE[c] ?? c)}</button>`).join('')}</div></div>`).join('')}
        <p class="sh-about">${esc(ABOUT[st.cat] ?? '')}</p>
        ${types.length > 1 ? `<div class="sh-group"><span>${pack ? 'Size' : PAPER.has(p.kind) ? 'Paper' : p.kind === 'canvas' ? 'Edge' : 'Frame'}</span><div class="sh-pills">${types.map((t) => `<button type="button" class="${t === st.type ? 'on' : ''}" data-type="${esc(t)}">${esc(t.replace(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)cm$/i, '$1 × $2 cm'))}</button>`).join('')}</div></div>` : ''}
        ${pack && sizes.length < 2 ? '' : `<div class="sh-group"><span>Size</span><div class="sh-sizes">${sizes.map((s) => {
          const sl = landFor(s, i, pack ? defaultLandscape(i) : st.landscape);
          const fits = Math.abs(ratioOf(s, sl) / pr(i) - 1) < 0.02;
          const q = fullDpi(i, s, sl);
          const tooBig = q < DPI_MIN, soft = !tooBig && q < DPI_WARN;
          const cls = [s.id === st.pid ? 'on' : '', fits ? 'fit' : '', tooBig ? 'off' : ''].filter(Boolean).join(' ');
          return `<label class="${cls}"${tooBig ? ' title="This photo isn’t big enough to print well at this size."' : ''}><input type="radio" name="sh-size" value="${s.id}"${s.id === st.pid ? ' checked' : ''}${tooBig ? ' disabled' : ''} /><span>${esc(sizeLabel(s, sl))}${labTag(s)}${fits ? ' <em>whole photo</em>' : ''}${tooBig ? ' <em class="sh-no">too big for this photo</em>' : soft ? ' <em class="sh-soft">may look soft</em>' : ''}</span><strong>${nzd(s.tiers?.[0]?.base ?? s.price)}</strong></label>`;
        }).join('')}</div></div>`}
        <div class="sh-buy">
          ${pack ? '' : `<div class="sh-qty"><button type="button" data-qty="-1" aria-label="One fewer">−</button><span>${st.qty}</span><button type="button" data-qty="1" aria-label="One more">+</button></div>`}
          <button type="button" class="g-cta" data-add>${st.editing ? 'Update cart' : pack ? 'Add the pack to cart' : multi ? `Add ${plural(st.ids.length, 'print')} to cart` : 'Add to cart'}</button>
        </div>
        <div class="sh-facts"></div>
        <p class="sh-intro">${esc(shop.intro)}</p>
      </div></div>`;
  }

  const fmt = (n: number) => String(Math.round(n * 10) / 10);
  const sizeLabel = (p: Product, landscape: boolean) => {
    const a = p.name.match(/^(A[2-4])\b/i)?.[1];
    const [w, h] = landscape ? [p.h_cm, p.w_cm] : [p.w_cm, p.h_cm];
    return `${a ? `${a} · ` : ''}${fmt(w)} × ${fmt(h)} cm`;
  };
  const shortSize = (p: Product, landscape: boolean) => { const [w, h] = landscape ? [p.h_cm, p.w_cm] : [p.w_cm, p.h_cm]; return `${fmt(w)}×${fmt(h)}`; };

  // ---- Clicks ----
  shopDlg.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = <T extends HTMLElement = HTMLElement>(s: string) => t.closest<T>(s);
    let x: HTMLElement | null;
    if (b('[data-sh-close]')) return shopDlg.close();
    if (b('[data-to-cart]')) { shopDlg.close(); return openCart(); }
    // Product cards: straight on when photos are already chosen, otherwise choose them first.
    if ((x = b('[data-card]'))) { const c = x.dataset.card!; if (st.ids.length) { st.view = 'product'; pick(c); return draw(); } return openPick(c); }
    if (b('[data-browse]')) { commit(); st.view = 'browse'; st.cropping = false; return draw(); }
    if (b('[data-change-photos]')) return openPick(st.cat);
    if (b('[data-back]')) { st.view = st.ids.length ? 'product' : 'browse'; return draw(); }
    if ((x = b('[data-favs]'))) { st.favsOnly = x.dataset.favs === '1'; return draw(); }
    if ((x = b('[data-pic]'))) {
      const id = x.dataset.pic!;
      if (st.picked.has(id)) st.picked.delete(id);
      else if (st.picked.size >= pickLimit()) { ctx.toast(`Up to ${pickLimit()} photos for this.`); return; }
      else st.picked.add(id);
      x.classList.toggle('on', st.picked.has(id));
      const n = st.picked.size, limit = pickLimit();
      shopDlg.querySelector('.sh-pick-foot span')!.textContent = n ? `${plural(n, 'photo')} chosen${limit < 60 ? ` of up to ${limit}` : ''}` : 'Tap photos to choose them';
      (shopDlg.querySelector('[data-pick-done]') as HTMLButtonElement).disabled = !n;
      return;
    }
    if (b('[data-pick-done]')) {
      const ids = ctx.images().map((i) => i.id).filter((id) => st.picked.has(id));
      if (!ids.length) return;
      const was = st.ids.length;
      const keep = ids.includes(st.ids[st.at]) ? ids.indexOf(st.ids[st.at]) : 0;
      st.ids = ids; st.at = keep; st.view = 'product';
      for (const id of [...st.counts.keys()]) if (!ids.includes(id)) st.counts.delete(id);
      if (!was) { st.landscape = defaultLandscape(img(ids[0])!); st.pid = 0; }
      pick(st.pickCat, st.type, st.pid || undefined);
      return draw();
    }
    if ((x = b('[data-cat]'))) { pick(x.dataset.cat!); st.cropping = false; return draw(); }
    if ((x = b('[data-type]'))) { pick(st.cat, x.dataset.type, st.pid); return draw(); }
    if ((x = b('[data-at]'))) { const k = Number(x.dataset.at); if (k !== st.at) { commit(); if (!isPack()) st.linked = false; showPhoto(k); st.cropping = false; } return draw(); }
    if ((x = b('[data-pn]'))) {
      const id = x.dataset.pn!, count = packCount(prod());
      const total = st.ids.reduce((a, y) => a + (st.counts.get(y) ?? 0), 0);
      const now = st.counts.get(id) ?? 0, d = Number(x.dataset.d);
      if (d > 0 && total >= count) { ctx.toast(`The pack has ${count} prints: take one from another photo first.`); return; }
      st.counts.set(id, Math.max(0, now + d));
      return draw();
    }
    if (b('[data-same]')) { st.linked = true; commit(); ctx.toast(`The same print for all ${st.ids.length} photos.`); return draw(); }
    if (b('[data-crop]')) { st.cropping = true; return draw(); }
    if (b('[data-room]')) { inRoom = !inRoom; return draw(); }
    if (b('[data-crop-done]')) { st.cropping = false; return draw(); }
    if (b('[data-turn]')) { st.landscape = !st.landscape; const i = photo(); if (fullDpi(i, prod(), curLand(i)) < DPI_MIN) pick(st.cat, st.type); commit(); return draw(); }
    if ((x = b('[data-qty]'))) { st.qty = Math.min(50, Math.max(1, st.qty + Number(x.dataset.qty))); commit(); return draw(); }
    if (b('[data-add]')) return addToCart();
  });
  shopDlg.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'sh-size') { st.pid = Number(t.value); commit(); draw(); }
  });
  addEventListener('resize', () => { if (shopDlg.open && st.view !== 'pick') { stage(); if (st.view === 'browse') drawCards(); } });

  function addToCart() {
    commit();
    const newKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    let lines: Line[];
    if (isPack()) {
      const p = prod(), count = packCount(p);
      const filled = fillPack(st.ids.map((id) => ({ image_id: id, n: st.counts.get(id) ?? 0 })), count);
      const pack = filled.filter((x) => x.n > 0).map((x) => { const i = img(x.image_id)!; const land = landFor(p, i, defaultLandscape(i)); return { image_id: i.id, n: x.n, crop: cropWith(i, p, land), landscape: land }; });
      lines = [{ key: st.editing ?? newKey(), image_id: pack[0].image_id, product_id: p.id, qty: 1, crop: pack[0].crop, landscape: pack[0].landscape, pack }];
    } else {
      // Every photo must print well at its size (a linked choice may be too big for one of them).
      const bad = st.ids.findIndex((id) => { const i = img(id), c = choiceOf(id), p = byId().get(c.pid); return i && p && fullDpi(i, p, landFor(p, i, c.landscape)) < DPI_MIN; });
      if (bad >= 0) { ctx.toast(`Photo ${bad + 1} isn’t big enough to print well at that size. Tap it and choose a smaller size.`); return; }
      lines = st.ids.map((id) => img(id)).filter(Boolean).map((i) => {
        const c = choiceOf(i!.id), p = byId().get(c.pid)!, land = landFor(p, i!, c.landscape);
        return { key: st.editing && st.ids.length === 1 ? st.editing : newKey(), image_id: i!.id, product_id: p.id, qty: c.qty, crop: cropWith(i!, p, land), landscape: land };
      });
    }
    if (st.editing) {
      const at = cart.findIndex((l) => l.key === st.editing);
      cart.splice(at < 0 ? cart.length : at, at < 0 ? 0 : 1, ...lines);
    } else {
      // The same photo, product, crop and shape already in the cart: just more of it.
      for (const l of lines) {
        const same = !l.pack && cart.find((c) => !c.pack && c.image_id === l.image_id && c.product_id === l.product_id && c.landscape === l.landscape && JSON.stringify(c.crop) === JSON.stringify(l.crop));
        if (same) same.qty = Math.min(50, same.qty + l.qty); else cart.push(l);
      }
    }
    save(cart);
    drawCartButton();
    const wasEditing = !!st.editing;
    shopDlg.close();
    if (wasEditing) openCart();
    else ctx.toast(lines[0].pack ? 'Print pack added to your cart.' : `${plural(lines.reduce((a, l) => a + l.qty, 0), 'print')} added to your cart.`);
  }

  // ---- The cart ----
  function openCart() {
    tidyCart();
    drawCart();
    if (!cartDlg.open) cartDlg.showModal();
  }
  const cartItems = () => cart.map((l) => (l.pack ? { product_id: l.product_id, qty: l.qty, pack: l.pack } : { image_id: l.image_id, product_id: l.product_id, qty: l.qty, crop: l.crop, landscape: l.landscape }));
  const postcodeOk = () => /^\d{4}$/.test(dest.postcode);
  /** Ask the server for delivery (soon after the last change), then redraw the sums. */
  function askQuote() {
    const key = JSON.stringify([cartItems(), dest]);
    if (key === quote.key) return drawSum();
    quote = { key, q: null, busy: true };
    clearTimeout(quoteTimer);
    if (!cart.length || !postcodeOk()) { quote.busy = false; return drawSum(); }
    drawSum();
    quoteTimer = window.setTimeout(async () => {
      let q: Quote;
      try {
        const r = await fetch('/api/gallery/prints', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ v: ctx.viewer(), quote: true, items: cartItems(), dest }) });
        const d = await r.json().catch(() => ({}));
        q = r.ok ? d : ({ error: d.error || 'Couldn’t work out delivery. Please try again.' } as Quote);
      } catch { q = { error: 'Couldn’t work out delivery: check your connection.' } as Quote; }
      if (quote.key !== key) return; // the cart changed meanwhile
      quote = { key, q, busy: false };
      if (q.express && dest.country === 'AU') drawCart(); else drawSum();
    }, 250);
  }
  /** The sums and the checkout button (redrawn without touching the postcode box). */
  function drawSum() {
    const box = cartDlg.querySelector<HTMLElement>('[data-sum]');
    const shop = ctx.shop();
    if (!box || !shop) return;
    const t = orderTotals(cart.map((l) => ({ ...l })), byId(), { free_over: 0, freight_prints: 0, freight_wall: 0 });
    const q = quote.q, ok = !!q && !q.error && !quote.busy && postcodeOk();
    const delivery = !postcodeOk() ? '<em>Add your postcode</em>' : quote.busy || !q ? '<em>Working it out…</em>' : q.error ? '—' : q.free ? 'Free' : money(q.freight);
    box.innerHTML = `<dl class="ct-sum">
        ${t.saved ? `<div><dt>Bulk savings</dt><dd>−${money(t.saved)}</dd></div>` : ''}
        <div><dt>Prints</dt><dd>${money(t.subtotal)}</dd></div>
        <div><dt>Delivery${ok && q!.parts.length > 1 ? ` (${q!.parts.length} parcels)` : ''}</dt><dd>${delivery}</dd></div>
        <div class="ct-total"><dt>Total</dt><dd>${ok ? money(t.subtotal + q!.freight) : '—'}</dd></div>
      </dl>
      ${q?.error && postcodeOk() && !quote.busy ? `<p class="sh-warn">${esc(q.error)}</p>` : ''}
      ${ok && q!.parts.length > 1 ? `<p class="sh-hint">Your order arrives in ${q!.parts.length === 2 ? 'two' : 'three'} parcels.</p>` : ''}
      ${shop.free_over && !(ok && q!.free) ? `<p class="sh-hint">Free delivery on orders over ${nzd(shop.free_over)}.</p>` : ''}`;
    cartDlg.querySelectorAll<HTMLButtonElement>('[data-pay],[data-pay-test]').forEach((b) => {
      b.disabled = !ok;
      if (b.dataset.pay !== undefined) b.textContent = ok ? `Checkout · ${money(t.subtotal + q!.freight)}` : 'Checkout';
    });
  }
  function drawCart() {
    const shop = ctx.shop();
    if (!shop) return;
    const m = byId();
    const t = orderTotals(cart.map((l) => ({ ...l })), m, { free_over: 0, freight_prints: 0, freight_wall: 0 });
    const countries = shop.countries ?? { NZ: 'New Zealand' };
    if (!countries[dest.country]) dest.country = 'NZ';
    const ex = quote.key === JSON.stringify([cartItems(), dest]) ? quote.q?.express : null;
    const note = (cartDlg.querySelector('[name="note"]') as HTMLTextAreaElement | null)?.value ?? '';
    cartDlg.innerHTML = `<div class="dlg-body cart">
      <button type="button" class="dlg-x" data-cart-close aria-label="Close">✕</button>
      <h2>Your cart</h2>
      ${cart.length ? `<ul class="ct-lines">${t.lines.map((l: any) => {
        const p = m.get(l.product_id)!;
        const what = l.pack ? `${esc(NICE[p.category] ?? p.category)} · ${plural(packCount(p), 'print')}` : `${esc(NICE[p.category] ?? p.category)}${p.type && (!PAPER.has(p.kind) || p.category === 'Prints') ? ` · ${esc(p.type)}` : ''}`;
        const sub = (l.pack ? `${esc(sizeLabel(p, false))} · ${plural(l.pack.length, 'photo')}` : esc(sizeLabel(p, l.landscape))) + labTag(p);
        return `<li>
          <div class="ct-mk" data-mk="${l.key}"></div>
          <div class="ct-what"><strong>${what}</strong><span>${sub}</span>
            <div class="ct-row"><div class="sh-qty sh-qty--small"><button type="button" data-cq="${l.key}" data-d="-1" aria-label="One fewer">−</button><span>${l.qty}</span><button type="button" data-cq="${l.key}" data-d="1" aria-label="One more">+</button></div>
            <button type="button" class="ct-link" data-cedit="${l.key}">Change</button><button type="button" class="ct-link" data-cdel="${l.key}">Remove</button></div></div>
          <strong class="ct-amt">${money(l.amount)}</strong></li>`;
      }).join('')}</ul>
      <fieldset class="ct-dest"><legend>Delivery to</legend>
        <div class="ct-dest-row"><select name="country" aria-label="Country">${Object.entries(countries).map(([k, v]) => `<option value="${k}"${k === dest.country ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>
        <input name="postcode" inputmode="numeric" autocomplete="postal-code" maxlength="4" placeholder="Postcode" aria-label="Postcode" value="${esc(dest.postcode)}" /></div>
        ${dest.country === 'AU' ? `<div class="ct-speed">${(['standard', 'express'] as const).map((k) => `<label><input type="radio" name="speed" value="${k}"${dest.speed === k ? ' checked' : ''} /> ${k === 'standard' ? 'Standard (3–10 days)' : 'Express (1–3 days)'}${ex ? ` · ${ex[k] ? money(ex[k]) : 'free'}` : ''}</label>`).join('')}</div>` : ''}
      </fieldset>
      <div data-sum></div>
      <label class="ct-note">A note for Tony (optional) <textarea name="note" rows="2" maxlength="1000">${esc(note)}</textarea></label>
      <button type="button" class="g-cta ct-pay" data-pay>Checkout</button>
      ${shop.trial ? '<button type="button" class="g-cta g-cta--quiet ct-pay" data-pay-test>Place a test order (no payment)</button>' : ''}
      <p class="sh-hint">You’ll pay securely by card with Stripe, and add your delivery address there. Prices are in NZ$ and include GST. <button type="button" class="ct-link" data-more>Keep shopping</button></p>`
      : '<p class="muted">Your cart is empty.</p><p><button type="button" class="g-cta" data-more>Prints &amp; wall art</button></p>'}
    </div>`;
    if (cart.length) askQuote();
    requestAnimationFrame(() => cartDlg.querySelectorAll<HTMLElement>('[data-mk]').forEach((el) => {
      const l = cart.find((x) => x.key === el.dataset.mk)!, p = m.get(l.product_id)!, i = img(l.image_id)!;
      el.innerHTML = mockup(p, i.thumb, l.crop, l.landscape, 88, 88);
    }));
  }
  // Delivery: country and speed redraw the cart; the postcode only the sums (keeps the cursor).
  cartDlg.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'postcode') { t.value = t.value.replace(/\D/g, '').slice(0, 4); dest.postcode = t.value; saveDest(); askQuote(); }
  });
  cartDlg.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'country') { dest.country = t.value; dest.speed = 'standard'; saveDest(); drawCart(); }
    if (t.name === 'speed') { dest.speed = t.value as Dest['speed']; saveDest(); drawCart(); }
  });
  cartDlg.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const b = (s: string) => t.closest<HTMLElement>(s);
    let x: HTMLElement | null;
    if (b('[data-cart-close]')) return cartDlg.close();
    if (b('[data-more]')) { cartDlg.close(); return openBrowse(); }
    if ((x = b('[data-cq]'))) { const l = cart.find((y) => y.key === x!.dataset.cq); if (l) { l.qty = Math.min(50, Math.max(1, l.qty + Number(x.dataset.d))); save(cart); drawCart(); drawCartButton(); } return; }
    if ((x = b('[data-cdel]'))) { cart = cart.filter((y) => y.key !== x!.dataset.cdel); save(cart); drawCart(); drawCartButton(); return; }
    if ((x = b('[data-cedit]'))) { const l = cart.find((y) => y.key === x!.dataset.cedit); if (l) { cartDlg.close(); openShop(l.pack ? l.pack.map((y) => y.image_id) : [l.image_id], l); } return; }
    const pay = b('[data-pay]'), test = b('[data-pay-test]');
    if (pay || test) {
      const btn = (pay ?? test) as HTMLButtonElement;
      btn.disabled = true; const was = btn.textContent; btn.textContent = test ? 'Placing the test order…' : 'Taking you to the payment page…';
      const note = (cartDlg.querySelector('[name="note"]') as HTMLTextAreaElement)?.value ?? '';
      try {
        const r = await fetch('/api/gallery/prints', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ v: ctx.viewer(), items: cartItems(), dest, note, back: location.href, test: !!test }) });
        const d = await r.json().catch(() => ({ error: 'Something went wrong. Please try again.' }));
        if (!r.ok) throw new Error(d.error);
        if (d.url) { location.href = d.url; return; }
        cart = []; save(cart); drawCartButton(); cartDlg.close();
        ctx.toast(`Test order ${d.done} placed. It’s in Studio › Galleries › Prints.`);
      } catch (err) { ctx.toast((err as Error).message || 'Something went wrong.'); }
      btn.disabled = false; btn.textContent = was;
      drawSum();
    }
  });

  /** Back from Stripe (?printed=P-…): the order is in, the cart is emptied. */
  function afterPayment() {
    const params = new URLSearchParams(location.search);
    const n = params.get('printed');
    if (!n) return null;
    cart = []; save(cart);
    params.delete('printed');
    history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
    return n;
  }

  return { openShop, openBrowse, openCart, drawCartButton, afterPayment, on: () => !!ctx.shop() };
}

const SHOP_CSS = `
.g-btn--cart span{display:inline-block;min-width:1.4em;margin-left:4px;padding:0 5px;border-radius:9px;background:#5a5e3b;color:#fff;font-size:12px;line-height:1.5}
.shop-dlg{width:min(1180px,96vw);max-width:none;height:min(820px,94vh);max-height:none;padding:0;overflow:hidden}
.shop-dlg .dlg-body.sh{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,1fr);height:100%;box-sizing:border-box;padding:0}
.sh-left{display:flex;flex-direction:column;min-height:0;background:linear-gradient(180deg,#efece6,#e4e0d8);padding:14px 18px 18px}
.sh-allp{align-self:flex-start;margin-bottom:4px}
.sh-stage{flex:1;min-height:240px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.sh-stage--crop{background:#2a2a28;border-radius:6px}
.sh-under{display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;padding-top:12px}
.sh-zoom{display:flex;gap:8px;align-items:center;font-size:14px}.sh-zoom input{width:180px}
.sh-strip{display:flex;gap:6px;overflow-x:auto;padding:12px 0 2px}
.sh-sp{flex:none;display:flex;flex-direction:column;align-items:center;gap:3px}
.sh-sp>button{width:66px;padding:3px;border:2px solid transparent;border-radius:6px;background:#fff;cursor:pointer;display:flex;flex-direction:column;gap:2px;align-items:center}
.sh-sp.on>button{border-color:#5a5e3b}
.sh-th{display:block;width:56px;height:56px}
.sh-sp small{font-size:10.5px;color:#555;white-space:nowrap}
.sh-pc{display:flex;gap:2px}.sh-pc button{width:28px;height:22px;border:1px solid #d8d3c8;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;line-height:1;color:#2b2a24}
.sh-total--all{margin-top:0;border-top:1px solid #eee;padding-top:6px}
.sh-right{overflow-y:auto;padding:26px 24px 20px}
.sh-right h2,.sh-browse h2,.sh-pick h2{margin:0 0 12px;font-weight:300;font-size:26px}
.sh-trial{margin:0 0 12px;padding:8px 12px;background:#fff4d6;border:1px solid #e0c46c;border-radius:8px 0;font-size:13px;color:#5c4400}
.sh-group{margin:0 0 12px}.sh-group>span{display:block;margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777}
.sh-pills{display:flex;flex-wrap:wrap;gap:6px}
.sh-pills button{padding:7px 12px;border:1px solid #d8d3c8;border-radius:16px;background:#fff;font:inherit;font-size:14px;cursor:pointer;color:#2b2a24}
.sh-pills button.on{background:#5a5e3b;border-color:#5a5e3b;color:#fff}
.sh-about{margin:-2px 0 14px;font-size:13.5px;line-height:1.5;color:#666}
.sh-sizes{display:grid;gap:4px}
.sh-sizes label{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;border:1px solid #e3ded4;border-radius:8px;cursor:pointer;font-size:14.5px;background:#fff}
.sh-sizes label.on{border-color:#5a5e3b;box-shadow:inset 0 0 0 1px #5a5e3b;background:#f6f6ee}
.sh-sizes input{position:absolute;opacity:0;pointer-events:none}
.sh-sizes em{font-style:normal;font-size:11.5px;color:#7d6634;margin-left:6px;white-space:nowrap}
.sh-sizes label.fit{background:#f6edd9;border-color:#dcc89c}
.sh-sizes label.fit.on{background:#f1e4c6;border-color:#5a5e3b}
.sh-sizes label.off{opacity:.45;cursor:not-allowed;background:#f4f4f2}
.sh-sizes em.sh-no{color:#8a3a22}.sh-sizes em.sh-soft{color:#9a6a12}
.sh-buy{display:flex;gap:12px;align-items:center;margin:16px 0 8px}
.sh-buy .g-cta{flex:1;margin:0}
.sh-qty{display:inline-flex;align-items:center;border:1px solid #d8d3c8;border-radius:20px;background:#fff}
.sh-qty button{width:36px;height:36px;border:0;background:none;font-size:18px;cursor:pointer;color:#2b2a24}
.sh-qty span{min-width:22px;text-align:center}
.sh-qty--small button{width:28px;height:28px;font-size:15px}
.sh-total{display:flex;justify-content:space-between;align-items:baseline;margin:6px 0;font-size:15px;color:#555}.sh-total strong{font-size:20px;color:#1a1a1a;font-weight:500}
.sh-bulk{margin:4px 0;font-size:13px;color:#5a5e3b}
.sh-warn{margin:6px 0;padding:8px 12px;background:#fdecea;border-radius:8px 0;font-size:13px;color:#7a2a20}
.sh-caution{margin:6px 0;padding:8px 12px;background:#fff4d6;border-radius:8px 0;font-size:13px;color:#6b4c00}
.sh-intro,.sh-hint{font-size:12.5px;line-height:1.5;color:#777;margin:10px 0 0}
.sh-browse{height:100%;box-sizing:border-box;overflow-y:auto;padding:28px 32px 32px!important}
.sh-browse h3{margin:22px 0 10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;color:#777}
.sh-lead{margin:0;max-width:640px;color:#666;font-size:14.5px;line-height:1.55}
.sh-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px}
.sh-card{display:flex;flex-direction:column;gap:4px;padding:0 0 12px;border:0;background:none;text-align:center;cursor:pointer;font:inherit;color:#2b2a24}
.sh-card-mk{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:4/3;background:#ebe8e2;margin-bottom:8px;overflow:hidden;transition:background .3s}
.sh-card-mk--room{display:block;transition:filter .3s}.sh-card:hover .sh-card-mk--room{filter:brightness(.97)}
.sh-room-note{text-align:center;margin:4px 0 0}
em.sh-lab.sh-lab{display:inline-block;margin-left:6px;padding:0 6px;border-radius:4px;font-style:normal;font-size:11px;font-weight:600;letter-spacing:.04em;line-height:1.6;vertical-align:1px;color:#fff;background:#6b6b6b}
em.sh-lab.sh-lab--seldex{background:#2f6f8f}em.sh-lab.sh-lab--atkins{background:#a0522d}em.sh-lab.sh-lab--inhouse{background:#5a5e3b}
.sh-card>span.sh-card-labs.sh-card-labs{display:block}.sh-card-labs .sh-lab{margin:2px 2px 0}
.sh-card:hover .sh-card-mk{background:#e3dfd6}
.sh-card strong{font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:14px}
.sh-card span{font-size:12.5px;color:#777;line-height:1.45;padding:0 8px}
.sh-card em{font-style:normal;font-size:13px;color:#5a5e3b}
.shop-dlg .dlg-body.sh-pick{display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:0}
.sh-pick-head{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:18px 60px 12px 24px;border-bottom:1px solid #eee}
.sh-pick-head h2{margin:0;font-size:22px;flex:1 1 300px}
.sh-grid{flex:1;overflow-y:auto;padding:14px 24px;display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start}
.sh-pic{position:relative;height:150px;flex-grow:1;padding:0;border:0;background:#eee;cursor:pointer;overflow:hidden}
.sh-pic img{width:100%;height:100%;object-fit:cover;display:block}
.sh-pic.on{outline:3px solid #5a5e3b;outline-offset:-3px}
.sh-tick{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;border:2px solid #fff;background:rgb(0 0 0/.25);color:transparent;font-size:14px;line-height:20px}
.sh-pic.on .sh-tick{background:#5a5e3b;color:#fff}
.sh-pick-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 24px;border-top:1px solid #eee;background:#fff}
.sh-pick-foot .g-cta{margin:0}
.cart-dlg .dlg-body{display:flex;flex-direction:column}
.ct-lines{list-style:none;margin:0 0 10px;padding:0}
.ct-lines li{display:grid;grid-template-columns:96px 1fr auto;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #eee}
.ct-mk{width:96px;height:96px;display:flex;align-items:center;justify-content:center;background:#efece6;border-radius:6px;overflow:hidden}
.ct-what{display:flex;flex-direction:column;gap:2px;font-size:14px}.ct-what span{color:#666}
.ct-row{display:flex;gap:10px;align-items:center;margin-top:6px;flex-wrap:wrap}
.ct-link{border:0;background:none;padding:0;font:inherit;font-size:13px;color:#5a5e3b;text-decoration:underline;cursor:pointer}
.ct-amt{font-weight:500;white-space:nowrap}
.ct-sum{margin:4px 0 6px;font-size:15px}.ct-sum div{display:flex;justify-content:space-between;padding:3px 0}.ct-sum dt,.ct-sum dd{margin:0}
.ct-total{border-top:1px solid #ddd;margin-top:4px;padding-top:8px!important;font-size:18px;font-weight:500}
.ct-dest{margin:10px 0 6px;padding:0;border:0;font-size:14px}.ct-dest legend{padding:0;margin-bottom:6px;font-weight:600}
.ct-dest-row{display:flex;gap:8px}.ct-dest select,.ct-dest input[name=postcode]{font:inherit;padding:8px 10px;border:1px solid #d8d3c8;border-radius:8px;background:#fff}.ct-dest select{flex:1;min-width:0}.ct-dest input[name=postcode]{width:7.5em}
.ct-speed{display:flex;flex-direction:column;gap:4px;margin-top:8px}.ct-speed label{display:flex;gap:6px;align-items:center;cursor:pointer}
.ct-sum em{font-style:normal;color:#8a857a}
.ct-pay:disabled{opacity:.45;cursor:not-allowed}
.ct-note{display:block;margin:12px 0;font-size:14px}.ct-note textarea{display:block;width:100%;margin-top:4px;box-sizing:border-box;font:inherit;padding:8px;border:1px solid #d8d3c8;border-radius:8px}
.ct-pay{display:block;width:100%;margin:6px 0 0;text-align:center}
/* Wide screens: the product view never scrolls as a whole (only its options panel). Hidden overflow
   can still be scrolled by focus, which slid the photo out of view (Tony, 2026-11-19), so clip it. */
@media (min-width:821px){.shop-dlg,.shop-dlg .dlg-body.sh{overflow:clip}}
@media (max-width:820px){
  .shop-dlg{height:100dvh;width:100vw;border-radius:0}
  .shop-dlg .dlg-body.sh{grid-template-columns:1fr;grid-template-rows:auto auto;overflow-y:auto}
  .sh-left{padding:12px;min-height:auto}.sh-stage{height:44vh;flex:none}
  .sh-right{overflow:visible;padding:16px}
  .sh-browse{padding:20px 16px!important}
  .sh-cards{grid-template-columns:1fr 1fr;gap:12px}
  .sh-card>span:not(.sh-card-mk){display:none}
  .sh-pic{height:100px}
  .sh-grid{padding:10px 12px}
}
`;
