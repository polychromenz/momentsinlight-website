// Studio > Settings > Online booking (functions-lib/booking.js).
//   GET  /api/studio/booking   -> { settings, job_types, recent, stripe }
//   POST /api/studio/booking { on, hours, notice_hours, ahead_days, gap_min, types }
import { json } from '../../../functions-lib/studio.js';
import { bookingSettings, saveBookingSettings } from '../../../functions-lib/booking.js';
import { stripeReady } from '../../../functions-lib/invoices.js';

export async function onRequestGet({ env }) {
  const db = env.DB;
  const [settings, types, recent] = await Promise.all([
    bookingSettings(db),
    db.prepare(`SELECT value FROM lists WHERE kind = 'job_type' ORDER BY sort, id`).all(),
    db.prepare(`SELECT b.*, c.first_name, c.last_name FROM bookings b JOIN jobs j ON j.id = b.job_id JOIN clients c ON c.id = j.client_id ORDER BY b.id DESC LIMIT 15`).all().catch(() => ({ results: [] })),
  ]);
  return json({ settings, job_types: types.results.map((t) => t.value), recent: recent.results, stripe: stripeReady(env) });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  return json({ settings: await saveBookingSettings(env.DB, d) });
}
