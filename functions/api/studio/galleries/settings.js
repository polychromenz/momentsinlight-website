// Gallery defaults: how long galleries stay online and the price to keep one longer.
//   PUT /api/studio/galleries/settings { expiry_months, extension_price (cents), extension_months, print_release }
import { json } from '../../../../functions-lib/studio.js';
import { gallerySettings } from '../../../../functions-lib/galleries.js';

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const s = await gallerySettings(env.DB);
  const n = (v, max) => Math.min(max, Math.max(0, Math.round(Number(v))));
  if (d.expiry_months !== undefined) s.expiry_months = n(d.expiry_months, 120);
  if (d.extension_price !== undefined) s.extension_price = n(d.extension_price, 1000000);
  if (d.extension_months !== undefined) s.extension_months = n(d.extension_months, 120) || 12;
  if (d.print_release !== undefined) s.print_release = String(d.print_release).trim().slice(0, 4000);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('galleries', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`).bind(JSON.stringify(s), now).run();
  return json({ ok: true, settings: s });
}
