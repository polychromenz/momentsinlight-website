// Print sales (Tony's Christmas promo, 2026-11-19). Settings 'prints' → sale:
//   { on, name, start, end (NZ dates, inclusive), pct: { [category]: percent off },
//     free_home, free_seldex (free delivery on in-house / Seldex items), order_by: { [category]: date } }
// While a sale is running, the shop's prices are the sale prices everywhere: the gallery page, the cart,
// the server's checks and the order (so the couple pays what they saw). Each product keeps its normal
// price as `was` so the shop can show it crossed out.

/** Tidy sale prices (dollars → cents): to the dollar under $20, to $5 under $200, then to $10. */
const tidy = (dollars) => Math.round((dollars < 20 ? Math.round(dollars) : dollars < 200 ? Math.round(dollars / 5) * 5 : Math.round(dollars / 10) * 10) * 100);

export const nzToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });

/** Is the sale on today? */
export function saleOn(s, today = nzToday()) {
  const x = s?.sale;
  return !!(x && x.on && x.start && x.end && x.start <= today && today <= x.end);
}

/** A product at its sale price (with `was` and `sale_pct`), or as it is. */
export function onSale(p, s) {
  const pct = saleOn(s) ? Number(s.sale.pct?.[p.category] || 0) : 0;
  if (!(pct > 0 && pct < 100)) return p;
  const k = 1 - pct / 100;
  const tiers = p.tiers ? p.tiers.map((t) => ({ ...t, base: tidy((t.base / 100) * k), add: Math.max(100, Math.round((t.add / 100) * k) * 100) })) : null;
  return { ...p, was: p.price, was_tiers: p.tiers, price: tidy((p.price / 100) * k), tiers, sale_pct: pct };
}

/** What the gallery page needs to show the sale (null when none is running). */
export function saleForShop(s) {
  if (!saleOn(s)) return null;
  const x = s.sale;
  return { name: x.name || 'Sale', end: x.end, pct: x.pct || {}, free_home: !!x.free_home, free_seldex: !!x.free_seldex, order_by: x.order_by || {} };
}

/** The sale settings as saved from the studio, made safe. */
export function cleanSale(x) {
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : '');
  const pct = {}, by = {};
  for (const [k, v] of Object.entries(x?.pct ?? {})) { const n = Math.round(Number(v) || 0); if (n > 0 && n < 90) pct[String(k).slice(0, 40)] = n; }
  for (const [k, v] of Object.entries(x?.order_by ?? {})) { const d = date(v); if (d) by[String(k).slice(0, 40)] = d; }
  return { on: !!x?.on, name: String(x?.name ?? '').trim().slice(0, 60), start: date(x?.start), end: date(x?.end), pct, free_home: !!x?.free_home, free_seldex: !!x?.free_seldex, order_by: by };
}
