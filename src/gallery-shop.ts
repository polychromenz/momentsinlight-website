// Prints in the client gallery (MIL Galleries 3a; server: functions-lib/prints.js). From a photo
// (lightbox "Order a print") or a selection ("Order prints"): choose a product (paper prints or wall
// art), paper or frame colour and size, see the photo in it, set the crop, add to the cart; the cart
// goes to Stripe Checkout, which takes the delivery address. Only Tony sees it until he switches it on;
// his studio visits can also place test orders without paying.
import { mockup, cropEditor, styleMockups, croppedPhoto, type Product, type Crop } from './prints/mockup';
import { orderTotals, productTotal, ratioOf, centredCrop, cleanCrop, dpi, money, PAPER } from '../functions-lib/print-pricing.js';

type Img = { id: string; w: number; h: number; thumb: string; web: string };
export type Shop = { products: Product[]; freight_prints: number; freight_wall: number; free_over: number; intro: string; trial: { live: boolean } | null };
type Line = { key: string; image_id: string; product_id: number; qty: number; crop: Crop; landscape: boolean };
type Ctx = { slug: string; viewer: () => string; images: () => Img[]; shop: () => Shop | null; toast: (m: string) => void };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const nzd = (c: number) => money(c).replace(/\.00$/, '');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const GROUPS: [string, string[]][] = [
  ['Prints', ['Prints', 'Deckled Prints', 'Panoramic Prints', 'Matted Prints']],
  ['Wall art', ['Canvas', 'Frames', 'Matted Frames', 'Float Frames', 'Circular Frames', 'Gallery Boards']],
];
const NICE: Record<string, string> = { 'Prints': 'Photo prints', 'Deckled Prints': 'Deckled edge', 'Panoramic Prints': 'Panoramic', 'Matted Prints': 'Print in a mat', 'Canvas': 'Canvas', 'Frames': 'Framed', 'Matted Frames': 'Framed with mat', 'Float Frames': 'Float frame', 'Circular Frames': 'Circle frame', 'Gallery Boards': 'Gallery board' };
const ABOUT: Record<string, string> = {
  'Prints': 'Professional photo prints. Fine Art is a heavy cotton rag paper with a soft texture; Matte has no shine; Semi Gloss has a gentle sheen and deep colour.',
  'Deckled Prints': 'Fine art paper with a hand-torn edge, for a soft, timeless look.',
  'Panoramic Prints': 'A long, wide print for panoramic photos.',
  'Matted Prints': 'A print set in a white mat, ready to put in a standard frame.',
  'Canvas': 'Gallery-wrapped canvas on a wooden frame, ready to hang. The edge is the photo itself (Natural) or a colour.',
  'Frames': 'A framed print behind glass, ready to hang.',
  'Matted Frames': 'A framed print with a white mat around it, behind glass, ready to hang.',
  'Float Frames': 'The print floats inside the frame with a little space around it.',
  'Circular Frames': 'A round, deckled-edge print in a square frame with a mat.',
  'Gallery Boards': 'The print mounted on a rigid board with a dark edge, to lean or hang.',
};

export function initShop(ctx: Ctx) {
  const store = `mil-cart-${ctx.slug}`;
  const load = (): Line[] => { try { return JSON.parse(localStorage.getItem(store) || '[]'); } catch { return []; } };
  const save = (l: Line[]) => { try { localStorage.setItem(store, JSON.stringify(l)); } catch { /* fine */ } };
  let cart: Line[] = load();
  const products = () => ctx.shop()?.products ?? [];
  const byId = () => new Map(products().map((p) => [p.id, p]));
  const img = (id: string) => ctx.images().find((i) => i.id === id);
  // Lines whose photo or product has gone are dropped quietly.
  const tidyCart = () => { const m = byId(); cart = cart.filter((l) => m.has(l.product_id) && img(l.image_id)); save(cart); };

  // ---- The page parts: a Cart button in the top bar, and the two dialogs ----
  const css = document.createElement('style');
  css.textContent = SHOP_CSS;
  document.head.append(css);
  styleMockups();
  const shopDlg = document.createElement('dialog');
  shopDlg.className = 'g-dlg shop-dlg'; shopDlg.setAttribute('aria-label', 'Order a print');
  const cartDlg = document.createElement('dialog');
  cartDlg.className = 'g-dlg g-dlg--side cart-dlg'; cartDlg.setAttribute('aria-label', 'Your cart');
  document.body.append(shopDlg, cartDlg);
  [shopDlg, cartDlg].forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
  const cartBtn = document.createElement('button');
  cartBtn.type = 'button'; cartBtn.className = 'g-btn g-btn--cart'; cartBtn.hidden = true;
  document.querySelector('.g-actions')?.prepend(cartBtn);
  cartBtn.addEventListener('click', () => openCart());

  function drawCartButton() {
    const on = !!ctx.shop();
    if (on) tidyCart();
    const n = cart.reduce((a, l) => a + l.qty, 0);
    cartBtn.hidden = !on || !n;
    cartBtn.innerHTML = `Cart <span>${n}</span>`;
  }

  // ---- Choosing a print ----
  type State = { ids: string[]; at: number; cat: string; type: string; pid: number; qty: number; landscape: boolean; crops: Map<string, Crop>; cropping: boolean; editing: string | null };
  let st: State;
  const cats = () => {
    const have = new Set(products().map((p) => p.category));
    return GROUPS.map(([g, list]) => [g, list.filter((c) => have.has(c))] as [string, string[]]).filter(([, l]) => l.length);
  };
  const typesOf = (cat: string) => [...new Set(products().filter((p) => p.category === cat).map((p) => p.type))];
  const sizesOf = (cat: string, type: string) => products().filter((p) => p.category === cat && p.type === type);
  const prod = () => byId().get(st.pid)!;
  const photo = () => img(st.ids[st.at])!;
  const pr = (i: Img) => i.w / i.h;
  const defaultLandscape = (i: Img) => i.w > i.h;
  const cropFor = (i: Img) => cleanCrop(st.crops.get(i.id) ?? centredCrop(pr(i), ratioOf(prod(), st.landscape)), pr(i), ratioOf(prod(), st.landscape));

  function pick(cat: string, type?: string, pid?: number) {
    st.cat = cat;
    const types = typesOf(cat);
    st.type = type && types.includes(type) ? type : types.includes(st.type) ? st.type : types[0];
    const sizes = sizesOf(st.cat, st.type);
    // Keep the same size when changing paper or colour; otherwise the first that fits the photo best.
    const same = sizes.find((p) => p.id === pid) ?? sizes.find((p) => p.name.split(' ')[0] === byId().get(st.pid)?.name.split(' ')[0]);
    const fit = (p: Product) => Math.abs(Math.log(ratioOf(p, st.landscape) / pr(photo())));
    // Of the sizes nearest the photo's shape, the one nearest a 20 × 30 cm print.
    const near = (p: Product) => Math.abs(Math.log((p.w_cm * p.h_cm) / 600));
    const top = Math.min(...sizes.map(fit));
    const best = sizes.filter((p) => fit(p) <= top + 0.03).sort((a, b) => near(a) - near(b))[0];
    const before = st.pid;
    st.pid = (same ?? best ?? sizes[0]).id;
    // A different shape: the crops start again (centred).
    if (before !== st.pid && byId().get(before) && ratioOf(byId().get(before)!, st.landscape) !== ratioOf(prod(), st.landscape)) st.crops.clear();
  }

  /** Open the shop for these photos (one or several). edit: a cart line to change instead of adding. */
  function openShop(ids: string[], edit: Line | null = null) {
    const shop = ctx.shop();
    if (!shop || !ids.length) return;
    const first = img(ids[0]);
    if (!first) return;
    const p0 = edit ? byId().get(edit.product_id) : null;
    st = { ids, at: 0, cat: '', type: '', pid: 0, qty: edit?.qty ?? 1, landscape: edit ? edit.landscape : defaultLandscape(first), crops: new Map(edit ? [[edit.image_id, edit.crop]] : []), cropping: false, editing: edit?.key ?? null };
    if (p0) { st.pid = p0.id; pick(p0.category, p0.type, p0.id); } else pick(cats()[0][1][0]);
    drawShop();
    if (!shopDlg.open) shopDlg.showModal();
  }

  function stage() {
    const host = shopDlg.querySelector<HTMLElement>('.sh-stage')!;
    const p = prod(), i = photo(), c = cropFor(i);
    if (st.cropping) {
      const ed = cropEditor(host, i.web, pr(i), ratioOf(p, st.landscape), c, (nc) => { st.crops.set(i.id, nc); drawFacts(); }, p.kind === 'circle');
      const z = shopDlg.querySelector<HTMLInputElement>('[data-zoom]')!;
      z.value = String(ed.zoomOf());
      z.oninput = () => ed.zoom(Number(z.value));
    } else {
      host.innerHTML = mockup(p, i.web, c, st.landscape, host.clientWidth || 600, host.clientHeight || 420);
    }
  }

  function drawFacts() {
    const p = prod(), i = photo();
    const c = cropFor(i);
    const d = dpi(i.w, c, p, st.landscape);
    const each = st.ids.length;
    const total = productTotal(p, st.qty * each);
    const tiers = (p.tiers ?? []).filter((t) => t.q > 1);
    shopDlg.querySelector('.sh-facts')!.innerHTML = `
      ${d && d < 150 ? `<p class="sh-warn">This crop is small for ${esc(p.name.split(' ')[0])}: it would print at about ${Math.round(d)} dpi and may look soft. Try a smaller size or zoom out.</p>` : ''}
      ${tiers.length ? `<p class="sh-bulk">Order more and save: ${tiers.map((t) => `${t.q} or more, then ${nzd(t.add)} each`).join(' · ')}</p>` : ''}
      <p class="sh-total"><span>${each > 1 ? `${plural(each, 'photo')} × ${st.qty}` : st.qty > 1 ? `${st.qty} prints` : '&nbsp;'}</span><strong>${nzd(total)}</strong></p>`;
  }

  function drawShop() {
    const shop = ctx.shop()!;
    const p = prod();
    const i = photo();
    const square = p.w_cm === p.h_cm;
    const types = typesOf(st.cat);
    const sizes = sizesOf(st.cat, st.type);
    const multi = st.ids.length > 1;
    shopDlg.innerHTML = `<div class="dlg-body sh">
      <button type="button" class="dlg-x" data-sh-close aria-label="Close">✕</button>
      <div class="sh-left">
        <div class="sh-stage${st.cropping ? ' sh-stage--crop' : ''}"></div>
        <div class="sh-under">
          ${st.cropping
            ? `<label class="sh-zoom">Zoom <input type="range" min="0" max="1" step="0.01" data-zoom /></label><button type="button" class="g-btn" data-crop-done>Done</button>`
            : `<button type="button" class="g-btn" data-crop>Adjust crop</button>${square ? '' : `<button type="button" class="g-btn" data-turn>${st.landscape ? 'Make it portrait' : 'Make it landscape'}</button>`}`}
        </div>
        ${multi ? `<div class="sh-strip">${st.ids.map((id, k) => { const x = img(id); return x ? `<button type="button" class="${k === st.at ? 'on' : ''}" data-at="${k}" aria-label="Photo ${k + 1}">${croppedPhoto(x.thumb, cropFor(x), p.kind === 'circle')}</button>` : ''; }).join('')}</div><p class="sh-hint">The same print for each photo. Tap a photo to check or adjust its crop.</p>` : ''}
      </div>
      <div class="sh-right">
        <h2>${multi ? `Order prints of ${plural(st.ids.length, 'photo')}` : 'Order a print'}</h2>
        ${shop.trial ? `<p class="sh-trial">Only you can see prints${shop.trial.live ? ' (and your clients: it’s switched on)' : ''}. Test orders don’t take a payment.</p>` : ''}
        ${cats().map(([g, list]) => `<div class="sh-group"><span>${g}</span><div class="sh-pills">${list.map((c) => `<button type="button" class="${c === st.cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(NICE[c] ?? c)}</button>`).join('')}</div></div>`).join('')}
        <p class="sh-about">${esc(ABOUT[st.cat] ?? '')}</p>
        ${types.length > 1 ? `<div class="sh-group"><span>${PAPER.has(p.kind) ? 'Paper' : p.kind === 'canvas' ? 'Edge' : 'Frame'}</span><div class="sh-pills">${types.map((t) => `<button type="button" class="${t === st.type ? 'on' : ''}" data-type="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>` : ''}
        <div class="sh-group"><span>Size</span><div class="sh-sizes">${sizes.map((s) => {
          const fits = Math.abs(ratioOf(s, st.landscape) / pr(i) - 1) < 0.02;
          return `<label class="${s.id === st.pid ? 'on' : ''}"><input type="radio" name="sh-size" value="${s.id}"${s.id === st.pid ? ' checked' : ''} /><span>${esc(sizeLabel(s, st.landscape))}${fits ? ' <em>whole photo</em>' : ''}</span><strong>${nzd(s.tiers?.[0]?.base ?? s.price)}</strong></label>`;
        }).join('')}</div></div>
        <div class="sh-buy">
          <div class="sh-qty"><button type="button" data-qty="-1" aria-label="One fewer">−</button><span>${st.qty}</span><button type="button" data-qty="1" aria-label="One more">+</button></div>
          <button type="button" class="g-cta" data-add>${st.editing ? 'Update cart' : multi ? `Add ${plural(st.ids.length, 'print')} to cart` : 'Add to cart'}</button>
        </div>
        <div class="sh-facts"></div>
        <p class="sh-intro">${esc(shop.intro)}</p>
      </div></div>`;
    requestAnimationFrame(() => {
      stage(); drawFacts();
      const on = shopDlg.querySelector<HTMLElement>('.sh-sizes label.on');
      const list = on?.parentElement;
      if (on && list) list.scrollTop = on.offsetTop - list.offsetTop - list.clientHeight / 2 + on.clientHeight / 2;
    });
  }

  const sizeLabel = (p: Product, landscape: boolean) => {
    const a = p.name.match(/^(A[2-4])\b/i)?.[1];
    const [w, h] = landscape ? [p.h_cm, p.w_cm] : [p.w_cm, p.h_cm];
    return `${a ? `${a} · ` : ''}${fmt(w)} × ${fmt(h)} cm`;
  };
  const fmt = (n: number) => String(Math.round(n * 10) / 10);

  shopDlg.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = <T extends HTMLElement = HTMLElement>(s: string) => t.closest<T>(s);
    let x: HTMLElement | null;
    if (b('[data-sh-close]')) return shopDlg.close();
    if ((x = b('[data-cat]'))) { pick(x.dataset.cat!); st.cropping = false; return drawShop(); }
    if ((x = b('[data-type]'))) { pick(st.cat, x.dataset.type, st.pid); return drawShop(); }
    if ((x = b('[data-at]'))) { st.at = Number(x.dataset.at); return drawShop(); }
    if (b('[data-crop]')) { st.cropping = true; return drawShop(); }
    if (b('[data-crop-done]')) { st.cropping = false; return drawShop(); }
    if (b('[data-turn]')) { st.landscape = !st.landscape; st.crops.clear(); return drawShop(); }
    if ((x = b('[data-qty]'))) { st.qty = Math.min(50, Math.max(1, st.qty + Number(x.dataset.qty))); shopDlg.querySelector('.sh-qty span')!.textContent = String(st.qty); return drawFacts(); }
    if (b('[data-add]')) return addToCart();
  });
  shopDlg.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'sh-size') { const before = prod(); st.pid = Number(t.value); if (ratioOf(before, st.landscape) !== ratioOf(prod(), st.landscape)) st.crops.clear(); drawShop(); }
  });

  function addToCart() {
    const p = prod();
    const lines: Line[] = st.ids.map((id) => img(id)).filter(Boolean).map((i) => ({
      key: st.editing && st.ids.length === 1 ? st.editing : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      image_id: i!.id, product_id: p.id, qty: st.qty, crop: cropFor(i!), landscape: p.w_cm !== p.h_cm && st.landscape,
    }));
    if (st.editing) cart = cart.map((l) => (l.key === st.editing ? lines[0] : l));
    else {
      // The same photo, product, crop and shape already in the cart: just more of it.
      for (const l of lines) {
        const same = cart.find((c) => c.image_id === l.image_id && c.product_id === l.product_id && c.landscape === l.landscape && JSON.stringify(c.crop) === JSON.stringify(l.crop));
        if (same) same.qty = Math.min(50, same.qty + l.qty); else cart.push(l);
      }
    }
    save(cart);
    drawCartButton();
    const wasEditing = !!st.editing;
    shopDlg.close();
    if (wasEditing) openCart();
    else ctx.toast(`${plural(lines.length * st.qty, 'print')} added to your cart.`);
  }

  // ---- The cart ----
  function openCart() {
    tidyCart();
    drawCart();
    if (!cartDlg.open) cartDlg.showModal();
  }
  function drawCart() {
    const shop = ctx.shop();
    if (!shop) return;
    const m = byId();
    const t = orderTotals(cart.map((l) => ({ ...l })), m, shop);
    const note = (cartDlg.querySelector('[name="note"]') as HTMLTextAreaElement | null)?.value ?? '';
    cartDlg.innerHTML = `<div class="dlg-body cart">
      <button type="button" class="dlg-x" data-cart-close aria-label="Close">✕</button>
      <h2>Your cart</h2>
      ${cart.length ? `<ul class="ct-lines">${t.lines.map((l: any) => {
        const p = m.get(l.product_id)!, i = img(l.image_id)!;
        return `<li>
          <div class="ct-mk" data-mk="${l.key}"></div>
          <div class="ct-what"><strong>${esc(NICE[p.category] ?? p.category)}${p.type && !PAPER.has(p.kind) || p.category === 'Prints' ? ` · ${esc(p.type)}` : ''}</strong><span>${esc(sizeLabel(p, l.landscape))}</span>
            <div class="ct-row"><div class="sh-qty sh-qty--small"><button type="button" data-cq="${l.key}" data-d="-1" aria-label="One fewer">−</button><span>${l.qty}</span><button type="button" data-cq="${l.key}" data-d="1" aria-label="One more">+</button></div>
            <button type="button" class="ct-link" data-cedit="${l.key}">Change</button><button type="button" class="ct-link" data-cdel="${l.key}">Remove</button></div></div>
          <strong class="ct-amt">${money(l.amount)}</strong>${i ? '' : ''}</li>`;
      }).join('')}</ul>
      <dl class="ct-sum">
        ${t.saved ? `<div><dt>Bulk savings</dt><dd>−${money(t.saved)}</dd></div>` : ''}
        <div><dt>Prints</dt><dd>${money(t.subtotal)}</dd></div>
        <div><dt>Delivery ${t.wall ? '(wall art)' : ''}</dt><dd>${t.free ? 'Free' : money(t.freight)}</dd></div>
        <div class="ct-total"><dt>Total</dt><dd>${money(t.total)}</dd></div>
      </dl>
      ${shop.free_over && !t.free ? `<p class="sh-hint">Free delivery on orders over ${nzd(shop.free_over)}.</p>` : ''}
      <label class="ct-note">A note for Tony (optional) <textarea name="note" rows="2" maxlength="1000">${esc(note)}</textarea></label>
      <button type="button" class="g-cta ct-pay" data-pay>Checkout · ${money(t.total)}</button>
      ${shop.trial ? '<button type="button" class="g-cta g-cta--quiet ct-pay" data-pay-test>Place a test order (no payment)</button>' : ''}
      <p class="sh-hint">You’ll pay securely by card with Stripe, and add your delivery address there (New Zealand only). Prices include GST.</p>`
      : '<p class="muted">Your cart is empty. Open a photo and choose “Order a print”.</p>'}
    </div>`;
    requestAnimationFrame(() => cartDlg.querySelectorAll<HTMLElement>('[data-mk]').forEach((el) => {
      const l = cart.find((x) => x.key === el.dataset.mk)!, p = m.get(l.product_id)!, i = img(l.image_id)!;
      el.innerHTML = mockup(p, i.thumb, l.crop, l.landscape, 88, 88);
    }));
  }
  cartDlg.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const b = (s: string) => t.closest<HTMLElement>(s);
    let x: HTMLElement | null;
    if (b('[data-cart-close]')) return cartDlg.close();
    if ((x = b('[data-cq]'))) { const l = cart.find((y) => y.key === x!.dataset.cq); if (l) { l.qty = Math.min(50, Math.max(1, l.qty + Number(x.dataset.d))); save(cart); drawCart(); drawCartButton(); } return; }
    if ((x = b('[data-cdel]'))) { cart = cart.filter((y) => y.key !== x!.dataset.cdel); save(cart); drawCart(); drawCartButton(); return; }
    if ((x = b('[data-cedit]'))) { const l = cart.find((y) => y.key === x!.dataset.cedit); if (l) { cartDlg.close(); openShop([l.image_id], l); } return; }
    const pay = b('[data-pay]'), test = b('[data-pay-test]');
    if (pay || test) {
      const btn = (pay ?? test) as HTMLButtonElement;
      btn.disabled = true; const was = btn.textContent; btn.textContent = test ? 'Placing the test order…' : 'Taking you to the payment page…';
      const note = (cartDlg.querySelector('[name="note"]') as HTMLTextAreaElement)?.value ?? '';
      try {
        const r = await fetch('/api/gallery/prints', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ v: ctx.viewer(), items: cart.map((l) => ({ image_id: l.image_id, product_id: l.product_id, qty: l.qty, crop: l.crop, landscape: l.landscape })), note, back: location.href, test: !!test }) });
        const d = await r.json().catch(() => ({ error: 'Something went wrong. Please try again.' }));
        if (!r.ok) throw new Error(d.error);
        if (d.url) { location.href = d.url; return; }
        cart = []; save(cart); drawCartButton(); cartDlg.close();
        ctx.toast(`Test order ${d.done} placed. It’s in Studio › Galleries › Prints.`);
      } catch (err) { ctx.toast((err as Error).message || 'Something went wrong.'); }
      btn.disabled = false; btn.textContent = was;
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

  return { openShop, openCart, drawCartButton, afterPayment, on: () => !!ctx.shop() };
}

const SHOP_CSS = `
.g-btn--cart span{display:inline-block;min-width:1.4em;margin-left:4px;padding:0 5px;border-radius:9px;background:#5a5e3b;color:#fff;font-size:12px;line-height:1.5}
.shop-dlg{width:min(1180px,96vw);max-width:none;height:min(820px,94vh);max-height:none;padding:0}
.shop-dlg .dlg-body.sh{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,1fr);height:100%;box-sizing:border-box;padding:0}
.sh-left{display:flex;flex-direction:column;min-height:0;background:linear-gradient(180deg,#efece6,#e4e0d8);padding:18px}
.sh-stage{flex:1;min-height:240px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.sh-stage--crop{background:#2a2a28;border-radius:6px}
.sh-under{display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;padding-top:12px}
.sh-zoom{display:flex;gap:8px;align-items:center;font-size:14px}.sh-zoom input{width:180px}
.sh-strip{display:flex;gap:6px;overflow-x:auto;padding:12px 0 2px}
.sh-strip button{flex:none;width:58px;height:58px;padding:3px;border:2px solid transparent;border-radius:6px;background:#fff;cursor:pointer}
.sh-strip button.on{border-color:#5a5e3b}
.sh-right{overflow-y:auto;padding:26px 24px 20px}
.sh-right h2{margin:0 0 12px;font-weight:300;font-size:26px}
.sh-trial{margin:0 0 12px;padding:8px 12px;background:#fff4d6;border:1px solid #e0c46c;border-radius:8px 0;font-size:13px;color:#5c4400}
.sh-group{margin:0 0 12px}.sh-group>span{display:block;margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777}
.sh-pills{display:flex;flex-wrap:wrap;gap:6px}
.sh-pills button{padding:7px 12px;border:1px solid #d8d3c8;border-radius:16px;background:#fff;font:inherit;font-size:14px;cursor:pointer;color:#2b2a24}
.sh-pills button.on{background:#5a5e3b;border-color:#5a5e3b;color:#fff}
.sh-about{margin:-2px 0 14px;font-size:13.5px;line-height:1.5;color:#666}
.sh-sizes{display:grid;gap:4px;max-height:260px;overflow-y:auto;padding-right:4px}
.sh-sizes label{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;border:1px solid #e3ded4;border-radius:8px;cursor:pointer;font-size:14.5px;background:#fff}
.sh-sizes label.on{border-color:#5a5e3b;box-shadow:inset 0 0 0 1px #5a5e3b;background:#f6f6ee}
.sh-sizes input{position:absolute;opacity:0;pointer-events:none}
.sh-sizes em{font-style:normal;font-size:11.5px;color:#5a5e3b;margin-left:6px;white-space:nowrap}
.sh-buy{display:flex;gap:12px;align-items:center;margin:16px 0 8px}
.sh-buy .g-cta{flex:1;margin:0}
.sh-qty{display:inline-flex;align-items:center;border:1px solid #d8d3c8;border-radius:20px;background:#fff}
.sh-qty button{width:36px;height:36px;border:0;background:none;font-size:18px;cursor:pointer;color:#2b2a24}
.sh-qty span{min-width:22px;text-align:center}
.sh-qty--small button{width:28px;height:28px;font-size:15px}
.sh-total{display:flex;justify-content:space-between;align-items:baseline;margin:6px 0;font-size:15px;color:#555}.sh-total strong{font-size:20px;color:#1a1a1a;font-weight:500}
.sh-bulk{margin:4px 0;font-size:13px;color:#5a5e3b}
.sh-warn{margin:6px 0;padding:8px 12px;background:#fdecea;border-radius:8px 0;font-size:13px;color:#7a2a20}
.sh-intro,.sh-hint{font-size:12.5px;line-height:1.5;color:#777;margin:10px 0 0}
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
.ct-note{display:block;margin:12px 0;font-size:14px}.ct-note textarea{display:block;width:100%;margin-top:4px;box-sizing:border-box;font:inherit;padding:8px;border:1px solid #d8d3c8;border-radius:8px}
.ct-pay{display:block;width:100%;margin:6px 0 0;text-align:center}
@media (max-width:820px){
  .shop-dlg{height:100dvh;width:100vw;border-radius:0}
  .shop-dlg .dlg-body.sh{grid-template-columns:1fr;grid-template-rows:auto auto;overflow-y:auto}
  .sh-left{padding:12px;min-height:auto}.sh-stage{height:44vh;flex:none}
  .sh-right{overflow:visible;padding:16px}
  .sh-sizes{max-height:none}
}
`;
