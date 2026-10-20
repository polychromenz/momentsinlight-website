// Packages and products (Settings > Packages & products): Tony's library for building quotes.
//   GET    /api/studio/crm/catalogue                -> { packages, products }
//   POST   /api/studio/crm/catalogue { kind, name, subtitle?, description?, price, recommended? }   add one
//   PUT    /api/studio/crm/catalogue { id, … }      change one
//   DELETE /api/studio/crm/catalogue?id=4
// Prices are cents, GST inclusive. Quotes copy what they use, so changes here never alter a sent quote.
import { json } from '../../../../functions-lib/studio.js';

const text = (v, max) => (v ?? '').toString().trim().slice(0, max);
const values = (d) => ({
  name: text(d.name, 160), subtitle: text(d.subtitle, 120), description: text(d.description, 20000),
  price: Math.max(0, Math.round(Number(d.price) || 0)), recommended: d.recommended ? 1 : 0,
});

export async function onRequestGet({ env }) {
  const rows = (await env.DB.prepare('SELECT * FROM catalogue ORDER BY sort, name, id').all()).results;
  return json({ packages: rows.filter((r) => r.kind === 'package'), products: rows.filter((r) => r.kind === 'product') });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  if (!['package', 'product'].includes(d.kind)) return json({ error: 'A package or a product?' }, 400);
  const v = values(d);
  if (!v.name) return json({ error: 'Give it a name.' }, 400);
  const now = new Date().toISOString();
  const sort = (await env.DB.prepare('SELECT COALESCE(max(sort), 0) + 1 n FROM catalogue').first()).n;
  const r = await env.DB.prepare(`INSERT INTO catalogue (kind, name, subtitle, description, price, recommended, sort, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) RETURNING *`)
    .bind(d.kind, v.name, v.subtitle, v.description, v.price, v.recommended, sort, now).first();
  return json({ item: r });
}

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const v = values(d);
  if (!v.name) return json({ error: 'Give it a name.' }, 400);
  const r = await env.DB.prepare(`UPDATE catalogue SET name = ?2, subtitle = ?3, description = ?4, price = ?5, recommended = ?6, updated_at = ?7 WHERE id = ?1 RETURNING *`)
    .bind(Number(d.id), v.name, v.subtitle, v.description, v.price, v.recommended, new Date().toISOString()).first();
  return r ? json({ item: r }) : json({ error: 'That one isn’t there any more.' }, 404);
}

export async function onRequestDelete({ request, env }) {
  await env.DB.prepare('DELETE FROM catalogue WHERE id = ?1').bind(Number(new URL(request.url).searchParams.get('id'))).run();
  return json({ ok: true });
}
