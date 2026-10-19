// Online booking for the public page src/pages/book.astro (functions-lib/booking.js).
//   GET  /api/book                    -> { on, types }   the kinds of booking that are on
//   GET  /api/book?type=wedding-chat  -> { type, days: { 'YYYY-MM-DD': ['HH:MM', …] } }   free times
//   POST /api/book { type, date, time, first, last, email, phone, partner, event_date, message, website, ms }
//        -> { ok, when } booked; or { pay_url } for a paid session (held 30 minutes while they pay)
// Spam: the hidden "website" field and functions-lib/spam.js, as on the enquiry form.
import { bookingSettings, freeSlots, makeBooking, whenText } from '../../functions-lib/booking.js';
import { spamCheck } from '../../functions-lib/spam.js';
import { checkout, nextNumber, token, stripeReady } from '../../functions-lib/invoices.js';
import { loadJob } from '../../functions-lib/crm-send.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const pub = (t) => ({ key: t.key, name: t.name, minutes: t.minutes, price: t.price, where: t.where, description: t.description, wedding: /wedding/i.test(t.job_type) });

export async function onRequestGet({ request, env }) {
  const s = await bookingSettings(env.DB);
  const types = s.on ? s.types.filter((t) => t.on) : [];
  const key = new URL(request.url).searchParams.get('type');
  if (!key) return reply({ on: !!types.length, types: types.map(pub) });
  const type = types.find((t) => t.key === key);
  if (!type) return reply({ error: 'That kind of booking isn’t available.' }, 404);
  return reply({ type: pub(type), days: await freeSlots(env, type, s) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const d = await request.json().catch(() => ({}));
  if (String(d.website ?? '').trim()) return reply({ ok: true, when: '' }); // a bot
  const s = await bookingSettings(env.DB);
  const type = s.on && s.types.find((t) => t.on && t.key === d.type);
  if (!type) return reply({ error: 'That kind of booking isn’t available any more.' }, 404);
  const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n);
  const f = {
    first: clean(d.first, 100), last: clean(d.last, 100), email: clean(d.email, 254).toLowerCase(), phone: clean(d.phone, 40),
    partner: clean(d.partner, 100), message: clean(d.message, 2000), venue: '',
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(d.event_date ?? '') ? d.event_date : '',
    date: /^\d{4}-\d{2}-\d{2}$/.test(d.date ?? '') ? d.date : '', time: /^\d{2}:\d{2}$/.test(d.time ?? '') ? d.time : '',
  };
  if (!f.first || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return reply({ error: 'Please add your name and email.' }, 400);
  if (!f.date || !f.time) return reply({ error: 'Please choose a time.' }, 400);
  const spam = await spamCheck(env, f, Number.isFinite(Number(d.ms)) ? Number(d.ms) : null).catch(() => ({ spam: false }));
  if (spam.spam) { console.log('book: spam', spam.reason); return reply({ ok: true, when: whenText(f.date, f.time) }); }
  if (type.price > 0 && !stripeReady(env).ok) return reply({ error: 'Online payment isn’t available just now, so this can’t be booked online. Please get in touch instead.' }, 503);
  try {
    const b = await makeBooking(context, type, s, f);
    if (!b.held) return reply({ ok: true, when: whenText(f.date, f.time) });
    // A paid session: its invoice, then Stripe's payment page. The time is held for 30 minutes.
    const db = env.DB;
    const now = new Date().toISOString();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
    const inv = await db.prepare(`INSERT INTO invoices (job_id, number, label, description, amount, due_date, send_at, token, status, sent_at, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'sent', ?7, ?7) RETURNING *`)
      .bind(b.job_id, await nextNumber(db, today.slice(0, 4)), type.name, `${type.name}, ${whenText(f.date, f.time)}`, type.price, today, now, token()).first();
    await db.prepare('UPDATE bookings SET invoice_id = ?2 WHERE id = ?1').bind(b.id, inv.id).run();
    return reply({ pay_url: await checkout(env, inv, await loadJob(db, b.job_id), { expiresMin: 31 }) });
  } catch (e) {
    return reply({ error: e.message }, e.status ?? 500);
  }
}
