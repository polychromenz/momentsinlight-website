// Studio > Galleries > Prints (src/pages/studio/gallery-prints.astro; functions-lib/prints.js).
//   GET    ?what=setup                   -> { settings, products, rate: today's A$→NZ$ (or null) }
//   GET    ?what=orders                  -> { orders }
//   GET    ?order=<id>                   -> { order, items, gallery }
//   PUT    { settings }                  -> { settings }
//   POST   { action: 'import', rows, rate, replace_prices }  rows: Pic-Time's CSV as objects -> { added, updated }
//   PATCH  { products: [ids], set: { active?, price? } }      -> { ok }
//   POST   { action: 'order', id, status?, lab_ref?, tracking?, tony_note?, email? } -> { order }
//   POST   { action: 'crop', item_id, crop, landscape }      -> { item }
import { json } from '../../../../functions-lib/studio.js';
import { printSettings, DEFAULTS, shippedEmail } from '../../../../functions-lib/prints.js';
import { kindOf, sizeOf, dollars, parseTiers, tidy, cleanCrop, ratioOf } from '../../../../functions-lib/print-pricing.js';
import { webUrl } from '../../../../functions-lib/galleries.js';
import { cleanSale } from '../../../../functions-lib/print-sale.js';

const ORDER = ['Prints', 'Deckled Prints', 'Panoramic Prints', 'Matted Prints', 'Gallery Boards', 'Canvas', 'Frames', 'Float Frames', 'Matted Frames', 'Circular Frames'];
const now = () => new Date().toISOString();

async function rateToday() {
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=AUD&to=NZD', { cf: { cacheTtl: 3600 } });
    const d = await r.json();
    return Number(d?.rates?.NZD) || null;
  } catch { return null; }
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const db = env.DB;
  if (u.searchParams.get('what') === 'setup') {
    const products = (await db.prepare('SELECT * FROM print_products ORDER BY sort, category, type, w_cm * h_cm, name, lab').all()).results;
    return json({ settings: await printSettings(db), products, rate: await rateToday() });
  }
  if (u.searchParams.get('what') === 'orders') {
    const orders = (await db.prepare(`SELECT o.id, o.number, o.status, o.name, o.email, o.buyer_kind, o.total, o.test, o.created_at, o.paid_at, o.hold_until, o.shipped_at, g.name AS gallery, g.id AS gallery_id,
        (SELECT COALESCE(SUM(qty), 0) FROM print_order_items i WHERE i.order_id = o.id) AS prints
      FROM print_orders o LEFT JOIN photo_galleries g ON g.id = o.gallery_id
      WHERE o.status != 'pending' OR o.created_at > ?1 ORDER BY o.id DESC LIMIT 300`).bind(new Date(Date.now() - 2 * 86400_000).toISOString()).all()).results;
    return json({ orders });
  }
  const id = Number(u.searchParams.get('order'));
  if (id) {
    const order = await db.prepare('SELECT * FROM print_orders WHERE id = ?1').bind(id).first();
    if (!order) return json({ error: 'That order isn’t here.' }, 404);
    const g = await db.prepare('SELECT id, name, slug, job_id FROM photo_galleries WHERE id = ?1').bind(order.gallery_id).first();
    const items = (await db.prepare(`SELECT i.*, m.width AS w, m.height AS h, m.filename, m.web_crc FROM print_order_items i LEFT JOIN gallery_images m ON m.id = i.image_id WHERE i.order_id = ?1 ORDER BY i.id`).bind(id).all()).results
      .map((i) => ({ ...i, product: JSON.parse(i.product), crop: i.crop ? JSON.parse(i.crop) : null, web: webUrl(order.gallery_id, i.image_id, 'web', i.web_crc), thumb: webUrl(order.gallery_id, i.image_id, 'thumb', i.web_crc) }));
    return json({ order: { ...order, address: order.address ? JSON.parse(order.address) : null, delivery: order.delivery ? JSON.parse(order.delivery) : null }, items, gallery: g });
  }
  return json({ error: 'What should be shown?' }, 400);
}

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const s = await printSettings(env.DB);
  const x = d.settings ?? {};
  const cents = (v) => Math.min(1_000_000, Math.max(0, Math.round(Number(v) || 0)));
  if (x.live !== undefined) s.live = !!x.live;
  if (x.freight_prints !== undefined) s.freight_prints = cents(x.freight_prints);
  if (x.freight_wall !== undefined) s.freight_wall = cents(x.freight_wall);
  if (x.freight_inhouse !== undefined) s.freight_inhouse = cents(x.freight_inhouse);
  if (x.min_inhouse !== undefined) s.min_inhouse = cents(x.min_inhouse);
  if (x.sale !== undefined) s.sale = cleanSale(x.sale);
  if (x.return_address !== undefined) s.return_address = String(x.return_address).trim().slice(0, 300);
  if (x.free_over !== undefined) s.free_over = cents(x.free_over);
  if (x.hold_days !== undefined) s.hold_days = Math.min(60, Math.max(0, Math.round(Number(x.hold_days) || 0)));
  if (x.rate !== undefined && Number(x.rate) > 0.5 && Number(x.rate) < 3) s.rate = Number(Number(x.rate).toFixed(4));
  if (x.intro !== undefined) s.intro = String(x.intro).trim().slice(0, 600) || DEFAULTS.intro;
  await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('prints', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`).bind(JSON.stringify(s), now()).run();
  return json({ settings: s });
}

export async function onRequestPatch({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const ids = (Array.isArray(d.products) ? d.products : []).map(Number).filter(Boolean);
  if (!ids.length || ids.length > 1000) return json({ error: 'Which products?' }, 400);
  const set = d.set ?? {};
  const stmts = [];
  for (const id of ids) {
    if (set.active !== undefined) stmts.push(env.DB.prepare('UPDATE print_products SET active = ?2, updated_at = ?3 WHERE id = ?1').bind(id, set.active ? 1 : 0, now()));
    // A new single price: bulk prices are dropped (they were worked out from the old price).
    if (set.price !== undefined) stmts.push(env.DB.prepare('UPDATE print_products SET price = ?2, tiers = CASE WHEN ?3 THEN tiers ELSE NULL END, updated_at = ?4 WHERE id = ?1').bind(id, Math.max(0, Math.round(Number(set.price) || 0)), set.keep_tiers ? 1 : 0, now()));
    if (set.tiers !== undefined) stmts.push(env.DB.prepare('UPDATE print_products SET tiers = ?2, updated_at = ?3 WHERE id = ?1').bind(id, set.tiers ? JSON.stringify(set.tiers) : null, now()));
  }
  for (let k = 0; k < stmts.length; k += 90) await env.DB.batch(stmts.slice(k, k + 90));
  return json({ ok: true });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const db = env.DB;
  if (d.action === 'import') return importRows(db, d);
  if (d.action === 'order') {
    const o = await db.prepare('SELECT * FROM print_orders WHERE id = ?1').bind(Number(d.id)).first();
    if (!o) return json({ error: 'That order isn’t here.' }, 404);
    const t = now();
    const next = d.status;
    const steps = { approved: 'approved_at', ordered: 'ordered_at', shipped: 'shipped_at', cancelled: 'cancelled_at', paid: null };
    if (next !== undefined && !(next in steps)) return json({ error: 'That isn’t a step an order can be at.' }, 400);
    await db.prepare(`UPDATE print_orders SET status = COALESCE(?2, status), lab_ref = COALESCE(?3, lab_ref), tracking = COALESCE(?4, tracking), tony_note = COALESCE(?5, tony_note), updated_at = ?6 WHERE id = ?1`)
      .bind(o.id, next ?? null, d.lab_ref ?? null, d.tracking ?? null, d.tony_note ?? null, t).run();
    if (next && steps[next]) await db.prepare(`UPDATE print_orders SET ${steps[next]} = COALESCE(${steps[next]}, ?2) WHERE id = ?1`).bind(o.id, t).run();
    const after = await db.prepare('SELECT * FROM print_orders WHERE id = ?1').bind(o.id).first();
    let emailed = false;
    if (next === 'shipped' && d.email) emailed = await shippedEmail(env, after).catch((e) => { console.error('prints shipped email', e.message); return false; });
    return json({ order: { ...after, address: after.address ? JSON.parse(after.address) : null, delivery: after.delivery ? JSON.parse(after.delivery) : null }, emailed });
  }
  if (d.action === 'crop') {
    const i = await db.prepare(`SELECT i.*, m.width AS w, m.height AS h FROM print_order_items i LEFT JOIN gallery_images m ON m.id = i.image_id WHERE i.id = ?1`).bind(Number(d.item_id)).first();
    if (!i) return json({ error: 'That print isn’t here.' }, 404);
    const p = JSON.parse(i.product);
    const landscape = p.w_cm !== p.h_cm && !!d.landscape;
    const crop = { ...cleanCrop(d.crop, i.w / i.h, ratioOf(p, landscape)), landscape: landscape ? 1 : 0 };
    await db.prepare('UPDATE print_order_items SET crop = ?2 WHERE id = ?1').bind(i.id, JSON.stringify(crop)).run();
    return json({ item: { id: i.id, crop } });
  }
  return json({ error: 'What should happen?' }, 400);
}

/** Pic-Time's price list (CSV rows as objects). Prices there are in the lab's currency (A$), already
 *  2.5× the lab cost; they become tidy NZ$ prices at `rate`. Only Prints are switched on at first.
 *  Importing again updates costs and bulk prices; prices are only replaced if replace_prices. */
async function importRows(db, d) {
  const rate = Number(d.rate);
  if (!(rate > 0.5 && rate < 3)) return json({ error: 'Please give the A$ to NZ$ rate (about 1.1).' }, 400);
  const rows = Array.isArray(d.rows) ? d.rows : [];
  if (!rows.length || rows.length > 3000) return json({ error: 'No products found in that file.' }, 400);
  const have = new Map((await db.prepare('SELECT id, category, type, name, lab FROM print_products').all()).results.map((p) => [`${p.category}|${p.type}|${p.name}|${p.lab}`, p.id]));
  let added = 0, updated = 0;
  const stmts = [];
  for (const r of rows) {
    const category = String(r.Product ?? '').trim(), type = String(r.Type ?? '').trim(), name = String(r.Option ?? '').trim().replace(/\s+/g, ' '), lab = String(r.Fulfiller ?? '').trim();
    if (!category || !name) continue;
    const tiersA = parseTiers(r['Tiered Pricing']);
    const single = tiersA ? tiersA[0].base : dollars(r['Base Price']); // with bulk prices, the base price is the cheapest each
    const price = tidy(single * rate);
    const tiers = tiersA ? tiersA.map((t, k) => ({ q: t.q, base: k === 0 ? price : tidy(t.base * rate), add: k === 0 ? price : Math.max(10, Math.round(t.add * rate * 10) * 10) })) : null;
    const size = sizeOf(name);
    const kind = kindOf(category);
    const cost = Number(String(r.Cost ?? '').replace(/[^0-9.]/g, '')) || null;
    const currency = (String(r.Cost ?? '').match(/[A-Z]{3}/) ?? ['AUD'])[0];
    const sort = (ORDER.indexOf(category) + 1 || 50) * 1000;
    const key = `${category}|${type}|${name}|${lab}`;
    if (have.has(key)) {
      updated++;
      stmts.push(d.replace_prices
        ? db.prepare('UPDATE print_products SET kind = ?2, w_cm = ?3, h_cm = ?4, cost = ?5, cost_currency = ?6, price = ?7, tiers = ?8, sort = ?9, updated_at = ?10 WHERE id = ?1')
          .bind(have.get(key), kind, size?.[0] ?? null, size?.[1] ?? null, cost, currency, price, tiers ? JSON.stringify(tiers) : null, sort, now())
        : db.prepare('UPDATE print_products SET kind = ?2, w_cm = ?3, h_cm = ?4, cost = ?5, cost_currency = ?6, sort = ?7, updated_at = ?8 WHERE id = ?1')
          .bind(have.get(key), kind, size?.[0] ?? null, size?.[1] ?? null, cost, currency, sort, now()));
    } else {
      added++;
      have.set(key, -1);
      stmts.push(db.prepare(`INSERT INTO print_products (category, type, name, lab, kind, w_cm, h_cm, cost, cost_currency, price, tiers, active, sort, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`)
        .bind(category, type, name, lab, kind, size?.[0] ?? null, size?.[1] ?? null, cost, currency, price, tiers ? JSON.stringify(tiers) : null, category === 'Prints' ? 1 : 0, sort, now()));
    }
  }
  for (let k = 0; k < stmts.length; k += 90) await db.batch(stmts.slice(k, k + 90));
  // Remember the rate for the studio's cost and margin figures.
  const s = await printSettings(db);
  s.rate = Number(rate.toFixed(4));
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('prints', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`).bind(JSON.stringify(s), now()).run();
  return json({ added, updated });
}
