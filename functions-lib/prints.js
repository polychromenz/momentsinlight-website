// Prints from the client galleries (MIL Galleries 3a, planned with Tony 2026-11-18).
// The product list is Tony's Pic-Time price list (imported in Studio > Galleries > Prints). Anyone
// with a gallery link picks a photo, product and size, sets the crop, and pays by card through
// Stripe Checkout (which also takes the delivery address and phone). The order then waits for
// Tony: he checks the crop, downloads the lab files and orders from the lab himself (Atkins or
// Seldex). Each order keeps its lab and a hold date, so orders can go to a lab automatically later.
//
// Until Tony switches the shop on (settings 'prints' → live), only his own "Open as client" visits
// (viewer role 'studio') see it, and those can place test orders without paying.
//
//   printSettings(db)     freight, free-over, hold days, live, exchange rate
//   shopFor(env, a)       what the gallery page needs to show the shop (null = no shop here)
//   placeOrder(env, a, d) check the cart, record the order, and return Stripe's payment page
//   printsPaid(env, s)    Stripe says it's paid: the order is in (emails, invoice for the couple)
import { orderTotals, cleanCrop, centredCrop, ratioOf, money, minCropW, packCount, fillPack, SOLD, PAPER } from './print-pricing.js';
import { GALLERY_ORIGIN } from './gallery-access.js';
import { nextNumber, token, markPaid, stripeReady } from './invoices.js';
import { loadJob } from './crm-send.js';
import { sendEmail } from './gmail.js';
import { renderTemplate, studioLinks } from './email-render.js';
import { alertTony } from './crm.js';
import { webUrl } from './galleries.js';

const SITE = 'https://www.momentsinlight.co.nz';
const nzToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const DEFAULTS = {
  live: false,            // false: only Tony (studio visits) sees the shop
  freight_prints: 1500,   // cents: an order with paper prints only
  freight_wall: 3500,     // cents: an order with wall art (canvas, frames, boards)
  free_over: 0,           // cents: free freight from this subtotal (0 = never)
  hold_days: 5,           // orders wait this long for Tony before they could go to a lab automatically
  rate: 1.12,             // NZ$ per A$, for the lab cost and margin shown in the studio
  intro: 'Printed by the same professional labs I use for my own work, on archival papers. I check every order by hand before it goes to print.',
};

export async function printSettings(db) {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'prints'`).first();
  return { ...DEFAULTS, ...(row ? JSON.parse(row.value) : {}) };
}

/** Products that can be bought for one photo, switched on, with a size. */
export async function shopProducts(db) {
  const rows = (await db.prepare(`SELECT id, category, type, name, lab, kind, w_cm, h_cm, price, tiers FROM print_products WHERE active = 1 AND price > 0 AND w_cm > 0 ORDER BY sort, category, type, w_cm * h_cm, name`).all()).results;
  return rows.filter((p) => SOLD.has(p.kind)).map((p) => ({ ...p, tiers: p.tiers ? JSON.parse(p.tiers) : null }));
}

/** Can this visitor see the shop? Tony always (studio visits); others once it's live, unless the
 *  gallery has prints switched off. Vendors and shared lists never. */
export async function shopOpen(env, a, s = null) {
  if (!a?.gallery || a.gallery.prints_off) return false;
  if (a.viewer?.role === 'studio') return true;
  if (['vendor', 'list_share'].includes(a.link?.kind)) return false;
  return !!(s ?? (await printSettings(env.DB))).live;
}

/** What the gallery page gets for the shop, or null. */
export async function shopFor(env, a) {
  const s = await printSettings(env.DB);
  if (!(await shopOpen(env, a, s))) return null;
  const products = await shopProducts(env.DB);
  if (!products.length) return null;
  return {
    products,
    freight_prints: s.freight_prints, freight_wall: s.freight_wall, free_over: s.free_over, intro: s.intro,
    trial: a.viewer.role === 'studio' ? { live: !!s.live } : null, // Tony: test orders without paying
  };
}

async function newNumber(db) {
  const y = nzToday().slice(0, 4);
  const last = await db.prepare(`SELECT number FROM print_orders WHERE number LIKE ?1 ORDER BY id DESC LIMIT 1`).bind(`P-${y}-%`).first();
  const n = last ? Number(last.number.split('-')[2]) + 1 : 1;
  return `P-${y}-${String(n).padStart(4, '0')}`;
}

/** Check a cart against the gallery and today's prices.
 *  items: [{ image_id, product_id, qty, crop, landscape }] or, for a print pack,
 *  [{ product_id, qty (packs), pack: [{ image_id, n, crop, landscape }] }].
 *  Returns the priced lines (one per cart line) and `rows`: one per photo, for the order. */
export async function checkCart(env, a, items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Your cart is empty.');
  if (items.length > 100) throw new Error('That’s a lot of prints: please split it into smaller orders, or get in touch with Tony.');
  const products = new Map((await shopProducts(env.DB)).map((p) => [p.id, p]));
  const { galleryView } = await import('./gallery-access.js');
  const view = await galleryView(env, a.gallery, a.link, null);
  const images = new Map(view.images.map((i) => [i.id, i]));
  // One photo on one product: the crop made safe, and big enough to print well (150 dpi).
  const photoOn = (p, imageId, crop, wantLandscape) => {
    const img = images.get(String(imageId));
    if (!img) throw new Error('One of the photos in your cart isn’t in this gallery any more. Please remove it.');
    const landscape = p.w_cm !== p.h_cm && !!wantLandscape;
    const r = ratioOf(p, landscape), pr = img.w / img.h;
    const minW = minCropW(img.w, p, landscape);
    if (minW > centredCrop(pr, r).w + 0.001) throw new Error(`One of your photos is too small to print well at ${p.name.split(' ')[0]}. Please choose a smaller size for it.`);
    return { img, crop: { ...cleanCrop(crop, pr, r, minW), landscape: landscape ? 1 : 0 } };
  };
  const lines = items.map((it) => {
    const p = products.get(Number(it.product_id));
    if (!p) throw new Error('One of the products in your cart isn’t available any more. Please remove it and choose again.');
    const qty = Math.min(50, Math.max(1, Math.floor(Number(it.qty) || 1)));
    if (p.kind === 'pack') {
      const count = packCount(p);
      const picks = (Array.isArray(it.pack) ? it.pack : []).slice(0, count);
      if (!picks.length) throw new Error('Please choose photos for your print pack.');
      if (picks.reduce((x, y) => x + Math.max(0, Math.floor(Number(y.n) || 0)), 0) > count) throw new Error(`A print pack has ${count} prints: please choose fewer.`);
      const pack = fillPack(picks, count).filter((x) => x.n > 0).map((x) => ({ ...photoOn(p, x.image_id, x.crop, x.landscape), n: x.n }));
      return { product_id: p.id, qty, p, pack };
    }
    const { img, crop } = photoOn(p, it.image_id, it.crop, it.landscape);
    return { image_id: img.id, product_id: p.id, qty, crop, p, img };
  });
  const t = orderTotals(lines, products, await printSettings(env.DB));
  // Rows for the order: a pack's price is shared over its photos by how many prints of each.
  const rows = [];
  for (const l of t.lines) {
    if (!l.pack) { rows.push({ image_id: l.image_id, product_id: l.product_id, p: l.p, qty: l.qty, amount: l.amount, crop: l.crop }); continue; }
    const all = l.pack.reduce((x, y) => x + y.n, 0);
    let left = l.amount;
    l.pack.forEach((x, k) => {
      const amount = k === l.pack.length - 1 ? left : Math.round((l.amount * x.n) / all);
      left -= amount;
      rows.push({ image_id: x.img.id, product_id: l.product_id, p: l.p, qty: x.n * l.qty, amount, crop: x.crop });
    });
  }
  return { ...t, rows, products };
}

const productCopy = (p) => JSON.stringify({ category: p.category, type: p.type, name: p.name, lab: p.lab, kind: p.kind, w_cm: p.w_cm, h_cm: p.h_cm });
export const describe = (p) => [p.category, p.type && !p.name.toLowerCase().includes(p.type.toLowerCase()) ? p.type : '', p.name].filter(Boolean).join(' · ');

/** Record the order and return { url } (Stripe's payment page), or { done } for Tony's test orders. */
export async function placeOrder(env, a, d, back) {
  const db = env.DB;
  if (!(await shopOpen(env, a))) throw new Error('Prints aren’t available from this gallery.');
  const t = await checkCart(env, a, d.items);
  const trial = a.viewer.role === 'studio' && !!d.test;
  if (!trial && !stripeReady(env).ok) throw new Error('Paying online isn’t available right now. Please get in touch with Tony.');
  const couple = a.link.kind === 'main_client';
  const now = new Date().toISOString();
  let order = null;
  for (let tries = 0; !order && tries < 5; tries++) {
    try {
      order = await db.prepare(`INSERT INTO print_orders (number, gallery_id, link_id, viewer_id, job_id, buyer_kind, status, name, email, note, subtotal, freight, total, test, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14) RETURNING *`)
        .bind(await newNumber(db), a.gallery.id, a.link.id, a.viewer.id, couple ? a.gallery.job_id ?? null : null, a.viewer.role === 'studio' ? 'studio' : a.link.kind,
          String(d.name || a.viewer.name || '').slice(0, 80), String(d.email || a.viewer.email || '').trim().toLowerCase().slice(0, 120), String(d.note || '').slice(0, 1000),
          t.subtotal, t.freight, t.total, trial ? 1 : 0, now).first();
    } catch (e) { if (!String(e).includes('UNIQUE') || tries === 4) throw e; }
  }
  await db.batch(t.rows.map((l) => db.prepare(`INSERT INTO print_order_items (order_id, image_id, product_id, product, qty, amount, crop, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
    .bind(order.id, l.image_id, l.product_id, productCopy(l.p), l.qty, l.amount, JSON.stringify(l.crop), now)));

  if (trial) {
    // Tony trying it out: straight to paid, with a pretend address; emails come to him.
    await db.prepare(`UPDATE print_orders SET email = ?2, name = COALESCE(NULLIF(name, ''), 'Tony (test)'), address = ?3 WHERE id = ?1`)
      .bind(order.id, 'tony@momentsinlight.co.nz', JSON.stringify({ name: 'Tony (test order)', line1: '1 Test Street', city: 'Hamilton', postal_code: '3200', country: 'NZ' })).run();
    await orderIn(env, order.id, { session: null, payment: null });
    return { done: order.number };
  }

  // Stripe Checkout: one line per product (Stripe shows them; the bulk price is in the line's total),
  // freight as the shipping option, and the delivery address and phone collected by Stripe.
  const body = new URLSearchParams({
    mode: 'payment',
    'shipping_address_collection[allowed_countries][0]': 'NZ',
    'phone_number_collection[enabled]': 'true',
    'shipping_options[0][shipping_rate_data][type]': 'fixed_amount',
    'shipping_options[0][shipping_rate_data][fixed_amount][amount]': String(t.freight),
    'shipping_options[0][shipping_rate_data][fixed_amount][currency]': 'nzd',
    'shipping_options[0][shipping_rate_data][display_name]': t.freight ? (t.wall ? 'Tracked courier (wall art)' : 'Tracked courier') : 'Free delivery',
    ...(order.email ? { customer_email: order.email } : {}),
    'metadata[print_order]': String(order.id),
    'payment_intent_data[description]': `Prints order ${order.number} (${a.gallery.name})`,
    'payment_intent_data[metadata][print_order]': String(order.id),
    success_url: `${back}${back.includes('?') ? '&' : '?'}printed=${encodeURIComponent(order.number)}`,
    cancel_url: back,
  });
  // Stripe wants whole-cent unit prices: one line per product with quantity 1 and the line's total.
  const byProduct = new Map();
  for (const l of t.lines) {
    const x = byProduct.get(l.product_id) ?? { p: l.p, qty: 0, amount: 0 };
    x.qty += l.qty; x.amount += l.amount; byProduct.set(l.product_id, x);
  }
  [...byProduct.values()].forEach((x, k) => {
    body.set(`line_items[${k}][quantity]`, '1');
    body.set(`line_items[${k}][price_data][currency]`, 'nzd');
    body.set(`line_items[${k}][price_data][unit_amount]`, String(x.amount));
    body.set(`line_items[${k}][price_data][product_data][name]`, `${x.qty} × ${describe(x.p)}`.slice(0, 250));
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body });
  const s = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Stripe: ${s.error?.message ?? r.status}`);
  await db.prepare('UPDATE print_orders SET stripe_session = ?2 WHERE id = ?1').bind(order.id, s.id).run();
  return { url: s.url };
}

/** Stripe's checkout.session.completed for a prints order. Safe to receive twice. */
export async function printsPaid(env, s) {
  const db = env.DB;
  const o = await db.prepare('SELECT * FROM print_orders WHERE id = ?1').bind(Number(s.metadata.print_order)).first();
  if (!o) { console.error('prints: no order', s.metadata.print_order); return null; }
  if (o.status !== 'pending') return o.invoice_id; // already in
  if (s.amount_total !== o.total) console.error('prints: amount differs', o.number, s.amount_total, o.total); // still recorded: Tony sees the paid amount
  const ship = s.collected_information?.shipping_details ?? s.shipping_details ?? null;
  const cust = s.customer_details ?? {};
  await db.prepare(`UPDATE print_orders SET name = ?2, email = ?3, phone = ?4, address = ?5, total = ?6 WHERE id = ?1`)
    .bind(o.id, ship?.name || cust.name || o.name, (cust.email || o.email || '').toLowerCase(), cust.phone || null,
      JSON.stringify({ name: ship?.name || cust.name || '', ...(ship?.address ?? cust.address ?? {}) }), s.amount_total).run();
  return orderIn(env, o.id, { session: s.id, payment: s.payment_intent });
}

/** A paid (or test) order: waiting for Tony, with emails to the buyer and Tony, and for the couple
 *  a paid invoice on their client (receipt, Xero). Returns the invoice id, if one was made. */
async function orderIn(env, id, { session, payment }) {
  const db = env.DB;
  const s = await printSettings(db);
  const now = new Date().toISOString();
  const r = await db.prepare(`UPDATE print_orders SET status = 'paid', paid_at = ?2, hold_until = ?3, stripe_session = COALESCE(?4, stripe_session), stripe_payment = ?5, updated_at = ?2 WHERE id = ?1 AND status = 'pending'`)
    .bind(id, now, addDays(nzToday(), s.hold_days || 0), session, payment).run();
  if (!r.meta.changes) return null;
  const o = await db.prepare('SELECT * FROM print_orders WHERE id = ?1').bind(id).first();
  const g = await db.prepare('SELECT * FROM photo_galleries WHERE id = ?1').bind(o.gallery_id).first();
  const items = (await db.prepare('SELECT * FROM print_order_items WHERE order_id = ?1 ORDER BY id').bind(id).all()).results;

  let invoiceId = null;
  if (o.job_id && !o.test) {
    // The couple: a paid studio invoice on their client (their receipt, Xero, the payment alert).
    let inv = null;
    for (let tries = 0; !inv && tries < 5; tries++) {
      try {
        inv = await db.prepare(`INSERT INTO invoices (job_id, number, label, description, amount, due_date, send_at, token, status, sent_at, gallery_id, print_order_id, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'sent', ?7, ?9, ?10, ?7) RETURNING *`)
          .bind(o.job_id, await nextNumber(db, nzToday().slice(0, 4)), `Prints order ${o.number}`, itemsText(items, o), o.total, nzToday(), now, token(), g.id, o.id).first();
      } catch (e) { if (!String(e).includes('UNIQUE') || tries === 4) throw e; }
    }
    await markPaid(env, inv, { method: 'card', stripeSession: session, stripePayment: payment });
    await db.prepare('UPDATE print_orders SET invoice_id = ?2 WHERE id = ?1').bind(o.id, inv.id).run();
    invoiceId = inv.id;
  }
  await confirmEmail(env, o, g, items).catch((e) => console.error('prints: confirmation', o.number, e.message));
  await alertTony(env, `${o.test ? 'Test prints order' : 'Prints order'}: ${o.number}`, [
    ['Gallery', g.name], ['From', `${o.name || ''} ${o.email ? `<${o.email}>` : ''}`.trim()], ['Total', `${money(o.total)}${o.freight ? ` (incl. ${money(o.freight)} freight)` : ''}`],
    ['Prints', itemsText(items, o)], ['Note', o.note],
    ['Next', `Check the crops, then order from the lab. It’s on hold until ${o.hold_until}.`],
    ...(o.job_id || o.test ? [] : [['Xero', 'Not bought from the couple’s own link, so no invoice was made: record it in Xero yourself.']]),
  ], `${SITE}/studio/gallery-prints?order=${o.id}`);
  return invoiceId;
}

const itemsText = (items, o) => items.map((i) => { const p = JSON.parse(i.product); return `${i.qty} × ${describe(p)}`; }).join('\n') + (o.freight ? `\nFreight ${money(o.freight)}` : '');

/** The table of prints for the buyer's emails (thumbnail, product, quantity, price). */
function itemsTable(items, o, g) {
  const row = (cells) => `<tr>${cells}</tr>`;
  const td = (v, x = '') => `<td style="padding:8px 8px 8px 0;border-bottom:1px solid #eee;vertical-align:middle;${x}">${v}</td>`;
  return `<table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;margin:6px 0 16px">${items.map((i) => {
    const p = JSON.parse(i.product);
    return row(td(`<img src="${esc(webUrl(g.id, i.image_id, 'thumb'))}" width="64" alt="" style="display:block;border-radius:4px">`, 'width:72px') + td(esc(describe(p))) + td(`× ${i.qty}`, 'white-space:nowrap') + td(money(i.amount), 'text-align:right;white-space:nowrap'));
  }).join('')}${o.freight ? row(td('') + td('Freight') + td('') + td(money(o.freight), 'text-align:right')) : ''}${row(td('') + td('<strong>Total</strong>') + td('') + td(`<strong>${money(o.total)}</strong>`, 'text-align:right'))}</table>`;
}

async function confirmEmail(env, o, g, items) {
  if (!o.email) return;
  const template = await env.DB.prepare(`SELECT * FROM templates WHERE key = 'print-order'`).first();
  if (!template) return;
  const first = String(o.name || '').trim().split(/\s+/)[0] || 'there';
  const email = renderTemplate(template, { ...(await studioLinks(env.DB)), first_name: first, order_number: o.number, gallery_name: g.name, order_items: itemsTable(items, o, g) });
  await sendEmail(env, { to: o.test ? 'tony@momentsinlight.co.nz' : o.email, subject: email.subject, html: email.html });
}

/** The "on its way" email (Tony marks an order shipped). */
export async function shippedEmail(env, o) {
  if (!o.email) return false;
  const template = await env.DB.prepare(`SELECT * FROM templates WHERE key = 'print-shipped'`).first();
  if (!template) return false;
  const first = String(o.name || '').trim().split(/\s+/)[0] || 'there';
  const link = /^https?:\/\//.test(o.tracking || '') ? `<p><a href="${esc(o.tracking)}" class="button">Track your parcel</a></p>` : o.tracking ? `<p>Tracking number: <strong>${esc(o.tracking)}</strong></p>` : '<p></p>';
  const email = renderTemplate(template, { ...(await studioLinks(env.DB)), first_name: first, order_number: o.number, tracking: link });
  await sendEmail(env, { to: o.test ? 'tony@momentsinlight.co.nz' : o.email, subject: email.subject, html: email.html });
  return true;
}

export const galleryAddress = (slug) => `${GALLERY_ORIGIN}/${slug}`;
export { PAPER };
