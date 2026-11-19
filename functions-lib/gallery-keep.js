// Keeping galleries online past their expiry (decided with Tony 2026-11-16): galleries are online for
// 12 months from the wedding (Galleries > Defaults), then the couple can keep them for another 12 months
// for NZ$49 (a gallery's own price can be a special price, or 0 = free, which extends it straight away).
// It's per client (Tony, 2026-11-20): all the galleries on their client, from every job (e.g. the
// wedding, the practice shoot and a later family shoot), share one expiry date (the latest of them,
// see lineUpExpiry in galleries.js), one payment keeps them all online, and one reminder goes for them all.
//   keepOffer()       what the couple's link may see: { price, months } from 30 days before expiry
//   keepCheckout()    a Stripe Checkout page for it
//   keptPaid()        Stripe says it's paid: extend it, and record the payment as a paid studio
//                     invoice on their client (receipt, Xero, alert to Tony) when it has one
//   expiryReminders() the timer: an email to the couple 30 and 7 days before their gallery expires
import { gallerySettings } from './galleries.js';
import { GALLERY_ORIGIN, linkUrl } from './gallery-access.js';
import { nextNumber, token, money, markPaid, stripeReady } from './invoices.js';
import { loadJob } from './crm-send.js';
import { sendEmail } from './gmail.js';
import { renderTemplate, studioLinks } from './email-render.js';
import { alertTony } from './crm.js';
import { portalToken, portalLink } from './portal.js';

const SITE = 'https://www.momentsinlight.co.nz';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const addMonths = (d, m) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };
const longDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const SHOW_DAYS = 30; // the offer shows on the gallery from this many days before it expires

/** What it costs to keep this gallery, and for how long: { price (cents), months }. */
export async function keepTerms(db, g) {
  const s = await gallerySettings(db);
  return { price: g.extension_price ?? s.extension_price, months: s.extension_months || 12 };
}

/** The offer for the couple's own link (kind main_client): from 30 days before expiry, or once expired. */
export async function keepOffer(db, g, linkKind) {
  if (!g || g.status !== 'online' || !g.expires_at || linkKind !== 'main_client') return null;
  if (g.expires_at > addDays(today(), SHOW_DAYS)) return null;
  const t = await keepTerms(db, g);
  return { ...t, until: g.expires_at, expired: g.expires_at < today() };
}

/** The couple's galleries that expire: all the online ones on the same client (any of their jobs)
 *  with an expiry date, or just this one if it isn't on a client. */
export async function coupleGalleries(db, g) {
  if (!g.client_id && !g.job_id) return [g];
  const all = (g.client_id
    ? await db.prepare(`SELECT * FROM photo_galleries WHERE client_id = ?1 AND status = 'online' AND expires_at IS NOT NULL`).bind(g.client_id).all()
    : await db.prepare(`SELECT * FROM photo_galleries WHERE job_id = ?1 AND status = 'online' AND expires_at IS NOT NULL`).bind(g.job_id).all()).results;
  return all.length ? all : [g];
}

/** All the couple's galleries move to one new expiry: 12 months on from the latest of them, or from
 *  today if that has already passed. */
export async function extendGallery(db, g, months) {
  const gs = await coupleGalleries(db, g);
  const latest = gs.reduce((a, x) => (x.expires_at && x.expires_at > a ? x.expires_at : a), '');
  const from = latest && latest >= today() ? latest : today();
  const until = addMonths(from, months);
  const now = new Date().toISOString();
  await db.batch(gs.map((x) => db.prepare(`UPDATE photo_galleries SET expires_at = ?2, reminded_for = NULL, updated_at = ?3 WHERE id = ?1`).bind(x.id, until, now)));
  return until;
}

/** The couple's email for this gallery (its client's), or null. */
async function coupleOf(db, g) {
  if (!g.job_id) return null;
  return loadJob(db, g.job_id);
}

/** A Stripe Checkout page to keep the gallery online. back: the gallery address to return to. */
export async function keepCheckout(env, g, back) {
  const ready = stripeReady(env);
  if (!ready.ok) throw new Error('Paying online isn’t available right now. Please get in touch with Tony.');
  const { price, months } = await keepTerms(env.DB, g);
  const job = await coupleOf(env.DB, g);
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'nzd',
    'line_items[0][price_data][unit_amount]': String(price),
    'line_items[0][price_data][product_data][name]': `Keep your galleries online for ${months} more months`,
    ...(job?.email ? { customer_email: job.email } : {}),
    'metadata[gallery_keep]': g.id,
    'metadata[months]': String(months),
    'payment_intent_data[description]': `Galleries: ${months} more months online (${g.name})`,
    'payment_intent_data[metadata][gallery_keep]': g.id,
    success_url: `${back}${back.includes('?') ? '&' : '?'}kept=1`,
    cancel_url: back,
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Stripe: ${d.error?.message ?? r.status}`);
  return d.url;
}

/** Stripe's checkout.session.completed for a gallery: extend it, and record the payment. Safe to
 *  receive twice (the session is recorded on the invoice / in the gallery's settings). */
export async function keptPaid(env, s) {
  const db = env.DB;
  const g = await db.prepare('SELECT * FROM photo_galleries WHERE id = ?1').bind(String(s.metadata.gallery_keep)).first();
  if (!g) { console.error('gallery keep: no gallery', s.metadata.gallery_keep); return; }
  const seen = await db.prepare(`SELECT 1 FROM invoices WHERE stripe_session = ?1 UNION SELECT 1 FROM settings WHERE key = ?2`).bind(s.id, `gallery_keep:${s.id}`).first();
  if (seen) return;
  const months = Number(s.metadata.months) || (await keepTerms(db, g)).months;
  const until = await extendGallery(db, g, months);
  const now = new Date().toISOString();
  if (g.job_id) {
    // A paid studio invoice on their client: the receipt email, Xero and the payment alert.
    let inv = null;
    for (let tries = 0; !inv && tries < 5; tries++) {
      try {
        inv = await db.prepare(`INSERT INTO invoices (job_id, number, label, description, amount, due_date, send_at, token, status, sent_at, gallery_id, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'sent', ?7, ?9, ?7) RETURNING *`)
          .bind(g.job_id, await nextNumber(db, today().slice(0, 4)), `Galleries: ${months} more months online`, `${(await coupleGalleries(db, g)).map((x) => x.name).join(', ')}: now online until ${longDate(until)}`, s.amount_total, today(), now, token(), g.id).first();
      } catch (e) { if (!String(e).includes('UNIQUE') || tries === 4) throw e; }
    }
    await markPaid(env, inv, { method: 'card', stripeSession: s.id, stripePayment: s.payment_intent });
    return inv.id;
  }
  // Not linked to a client: no invoice, just remember the session and tell Tony.
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)`).bind(`gallery_keep:${s.id}`, JSON.stringify({ gallery: g.id, amount: s.amount_total, until }), now).run();
  await alertTony(env, `Gallery kept online: ${g.name}`, [['Paid', `${money(s.amount_total)} by card`], ['Online until', longDate(until)], ['Note', 'This gallery isn’t linked to a client, so no invoice was made. Record it in Xero yourself.']], `${SITE}/studio/gallery?id=${g.id}`);
  return null;
}

/** Free to keep (its price is $0): extend it now and tell Tony. */
export async function keepFree(env, g) {
  const { months } = await keepTerms(env.DB, g);
  const until = await extendGallery(env.DB, g, months);
  await alertTony(env, `Gallery kept online (free): ${g.name}`, [['Online until', longDate(until)], ['Why free', 'Its price to keep it is set to $0 (the gallery’s Details).']], `${SITE}/studio/gallery?id=${g.id}`);
  return until;
}

/** The timer, once a day: email the couple 30 and 7 days before their gallery expires (the
 *  "gallery-expiring" template, Settings > Templates). Only galleries linked to a client, online,
 *  and not free to keep. reminded_for remembers which reminder went for which expiry date. */
export async function expiryReminders(env) {
  const db = env.DB;
  const t = today();
  const due = (await db.prepare(`SELECT * FROM photo_galleries WHERE status = 'online' AND job_id IS NOT NULL AND expires_at BETWEEN ?1 AND ?2`)
    .bind(t, addDays(t, SHOW_DAYS)).all()).results;
  const template = await db.prepare(`SELECT * FROM templates WHERE key = 'gallery-expiring'`).first();
  if (!template) return 'no template';
  let sent = 0;
  const done = new Set(); // one reminder per client, for all their galleries (from every job)
  for (const g of due) {
    const who = g.client_id ?? `job${g.job_id}`;
    if (done.has(who)) continue;
    done.add(who);
    const left = Math.round((Date.parse(`${g.expires_at}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 86400_000);
    const stage = left <= 7 ? '7' : '30';
    if (g.reminded_for === `${g.expires_at}:${stage}` || (stage === '30' && g.reminded_for === `${g.expires_at}:7`)) continue;
    const { price, months } = await keepTerms(db, g);
    if (!price) continue; // free to keep: Tony looks after it
    const job = await loadJob(db, g.job_id);
    const gs = await coupleGalleries(db, g);
    // Their wedding gallery's link if they have one (the button keeps them all online).
    const main = gs.find((x) => x.type === 'Wedding') ?? g;
    const link = await db.prepare(`SELECT token FROM gallery_links WHERE gallery_id = ?1 AND kind = 'main_client' ORDER BY id LIMIT 1`).bind(main.id).first();
    if (!job?.email || !link) continue;
    const galleryLink = linkUrl(main.slug, link.token);
    const values = {
      ...(await studioLinks(db)),
      first_name: job.first_name, last_name: job.last_name, partner_name: job.partner_name || '',
      couple: job.partner_name ? `${job.first_name} & ${job.partner_name}` : job.first_name,
      gallery_name: gs.map((x) => x.name).join(', '), gallery_link: galleryLink, portal_link: portalLink(await portalToken(db, job.id)), keep_link: `${galleryLink}&keep=1`,
      expiry_date: longDate(g.expires_at), keep_price: money(price).replace(/\.00$/, ''), keep_months: String(months), days_left: String(left),
    };
    const email = renderTemplate(template, values);
    if (email.missing.length) { console.error('gallery reminder: missing', email.missing); continue; }
    try {
      const last = await db.prepare('SELECT gmail_thread_id FROM messages WHERE job_id = ?1 AND gmail_thread_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1').bind(job.id).first();
      const out = await sendEmail(env, { to: job.email, subject: email.subject, html: email.html, threadId: last?.gmail_thread_id });
      const now = new Date().toISOString();
      await db.batch([
        ...gs.map((x) => db.prepare('UPDATE photo_galleries SET reminded_for = ?2 WHERE id = ?1').bind(x.id, `${g.expires_at}:${stage}`)),
        db.prepare(`INSERT INTO messages (job_id, client_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at) VALUES (?1, ?2, 'out', ?3, ?4, ?5, ?6, ?7)`)
          .bind(job.id, job.client_id, email.subject, email.body, out.id, out.threadId, now),
      ]);
      sent++;
    } catch (e) {
      console.error('gallery reminder', g.id, e.message);
    }
  }
  return `${sent} sent`;
}

export const galleryOrigin = GALLERY_ORIGIN;

/** Once a day from 9am NZ (the timer): the expiry reminders. */
export async function galleryReminderTimer(env) {
  const hour = Number(new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hourCycle: 'h23' }));
  if (hour < 9 || hour >= 20) return 'not now';
  const t = today();
  const r = await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('gallery_reminders', ?1, ?2)
    ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2 WHERE json_extract(settings.value, '$.last') IS NOT ?3`)
    .bind(JSON.stringify({ last: t }), new Date().toISOString(), t).run();
  if (!r.meta.changes) return 'done today';
  return expiryReminders(env);
}
