// Invoices for the studio CRM (see migrations/0012_crm_invoices.sql).
//   createInvoices()  when a contract is signed: one per payment in the accepted quote's schedule
//   sendInvoice()     the invoice email (or a reminder, or a receipt) with the invoice PDF attached
//   markPaid()        card (Stripe webhook) or bank transfer (Tony): receipt, alert, and after
//                     the first payment, "Thanks for booking"
//   checkout()        a Stripe Checkout page for paying an invoice by card
// All client email goes through sendEmail(): the test-mode lock applies. Stripe: while the CRM is
// in test mode only Stripe *test* keys are used, so no real card can be charged.
import { sendEmail } from './gmail.js';
import { renderTemplate, fields } from './email-render.js';
import { loadJob } from './crm-send.js';
import { sendMode, alertTony } from './crm.js';
import { parseQuote, payments, longDate } from './quotes.js';
import { invoicePdf, toBase64 } from './pdf.js';

export const SITE = 'https://www.momentsinlight.co.nz';
export const money = (c) => `$${(c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
const nzToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const DAY = 86400_000;

/** Bank transfer details etc. (Settings > Payments). */
export async function paymentSettings(db) {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'payments'`).first();
  return { bank_name: '', account_name: 'Moments in Light', account_number: '', gst_number: '', instructions: '', ...(row ? JSON.parse(row.value) : {}) };
}

/** Whether card payments can be taken right now (and why not). */
export function stripeReady(env) {
  const key = env.STRIPE_SECRET_KEY || '';
  if (!key) return { ok: false, why: 'Stripe isn’t connected yet (STRIPE_SECRET_KEY).' };
  if (sendMode(env) !== 'live' && !key.startsWith('sk_test_') && !key.startsWith('rk_test_')) return { ok: false, why: 'The studio is in test mode, so only a Stripe test key can be used.' };
  return { ok: true, test: key.includes('_test_') };
}

async function nextNumber(db, year) {
  const last = await db.prepare(`SELECT number FROM invoices WHERE number LIKE ?1 ORDER BY number DESC LIMIT 1`).bind(`MIL-${year}-%`).first();
  const n = last ? Number(last.number.split('-')[2]) + 1 : 1;
  return `MIL-${year}-${String(n).padStart(4, '0')}`;
}

/** One invoice per payment in the accepted quote's schedule. Returns the invoices made. */
export async function createInvoices(env, contract) {
  const db = env.DB;
  const existing = await db.prepare(`SELECT count(*) n FROM invoices WHERE contract_id = ?1`).bind(contract.id).first();
  if (existing.n) return [];
  const q = parseQuote(await db.prepare('SELECT * FROM quotes WHERE id = ?1').bind(contract.quote_id).first());
  const job = await loadJob(db, contract.job_id);
  if (!q || q.total == null) throw new Error('The accepted quote is missing, so the invoices couldn’t be made.');
  const pkg = q.packages[q.chosen_package];
  const desc = [pkg && `${pkg.name}${pkg.subtitle ? ` (${pkg.subtitle})` : ''}`, ...(q.chosen_extras || []).map((i) => q.extras[i]?.name).filter(Boolean)].join(' + ');
  const today = nzToday();
  const now = new Date();
  const made = [];
  for (const p of payments(q.schedule, q.total, job.event_date, (q.accepted_at || now.toISOString()).slice(0, 10))) {
    // Send the first straight away; later ones 2 weeks before they're due (or now if that's passed).
    const sendDay = p.onAccept ? today : new Date(new Date(`${p.due}T12:00:00Z`).valueOf() - 14 * DAY).toISOString().slice(0, 10);
    const sendAt = sendDay <= today ? now.toISOString() : new Date(`${sendDay}T20:00:00Z`).toISOString(); // ~8–9am NZ that day
    const due = p.due; // as the payment schedule says (the deposit: on acceptance)
    for (let tries = 0; tries < 5; tries++) {
      try {
        const row = await db.prepare(
          `INSERT INTO invoices (job_id, quote_id, contract_id, number, label, description, amount, due_date, send_at, token, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) RETURNING *`,
        ).bind(job.id, q.id, contract.id, await nextNumber(db, today.slice(0, 4)), `${p.label} (${p.percent}%)`, `${desc}${job.event_date ? `, wedding ${longDate(job.event_date)}` : ''}`, p.amount, due, sendAt, token(), now.toISOString()).first();
        made.push(row);
        break;
      } catch (e) {
        if (!String(e).includes('UNIQUE') || tries === 4) throw e;
      }
    }
  }
  return made;
}

/** The fill-ins for an invoice email. */
export const invoiceValues = (inv, job) => fields(job, {
  invoice_number: inv.number, invoice_label: inv.label,
  payment_amount: money(inv.amount), payment_due_date: longDate(inv.due_date),
  invoice_link: `${SITE}/invoice?t=${inv.token}`,
});

/** Email an invoice: kind 'invoice' (first send), 'invoice-reminder' or 'payment-receipt'. */
export async function sendInvoice(env, inv, kind = 'invoice') {
  const db = env.DB;
  const job = await loadJob(db, inv.job_id);
  const template = await db.prepare('SELECT * FROM templates WHERE key = ?1').bind(kind).first();
  if (!template) throw new Error(`The “${kind}” email template is missing (Settings).`);
  const email = renderTemplate(template, invoiceValues(inv, job));
  if (email.missing.length) throw new Error(`The invoice email needs: ${email.missing.join(', ')}.`);
  const pdf = toBase64(await invoicePdf(inv, job, await paymentSettings(db)));
  const last = await db.prepare('SELECT gmail_thread_id FROM messages WHERE job_id = ?1 AND gmail_thread_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1').bind(job.id).first();
  const fileName = `${kind === 'payment-receipt' ? 'Receipt' : 'Invoice'} ${inv.number}.pdf`;
  const sent = await sendEmail(env, { to: job.email, subject: email.subject, html: email.html, threadId: last?.gmail_thread_id,
    attachments: [{ name: fileName, type: 'application/pdf', base64: pdf }] });
  const now = new Date().toISOString();
  await db.batch([
    kind === 'invoice' ? db.prepare(`UPDATE invoices SET status = CASE WHEN status = 'scheduled' THEN 'sent' ELSE status END, sent_at = COALESCE(sent_at, ?2) WHERE id = ?1`).bind(inv.id, now)
      : kind === 'invoice-reminder' ? db.prepare('UPDATE invoices SET reminders = reminders + 1, last_reminder_at = ?2 WHERE id = ?1').bind(inv.id, now)
      : db.prepare('SELECT 1'),
    db.prepare(`INSERT INTO messages (job_id, client_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at, attachments) VALUES (?1, ?2, 'out', ?3, ?4, ?5, ?6, ?7, ?8)`)
      .bind(job.id, job.client_id, email.subject, email.body, sent.id, sent.threadId, now, fileName),
  ]);
  return sent;
}

/** Record a payment: receipt to the couple, alert to Tony; after the first payment, schedule 04. */
export async function markPaid(env, inv, { method, note = '', stripeSession = null, stripePayment = null }) {
  const db = env.DB;
  const now = new Date().toISOString();
  const r = await db.prepare(`UPDATE invoices SET status = 'paid', paid_at = ?2, paid_method = ?3, paid_note = ?4, stripe_session = COALESCE(?5, stripe_session), stripe_payment = COALESCE(?6, stripe_payment) WHERE id = ?1 AND status IN ('scheduled', 'sent')`)
    .bind(inv.id, now, method, note, stripeSession, stripePayment).run();
  if (!r.meta.changes) return false; // already paid (e.g. Stripe sent the webhook twice)
  const paid = await db.prepare('SELECT * FROM invoices WHERE id = ?1').bind(inv.id).first();
  const job = await loadJob(db, inv.job_id);
  let receipt = 'Receipt emailed.';
  try { const s = await sendInvoice(env, paid, 'payment-receipt'); if (s.redirected) receipt += ` (Test mode: to ${s.to}.)`; } catch (e) { receipt = `Receipt not sent (${e.message}).`; }
  // The first payment confirms the booking: "Thanks for booking" goes out (wedding workflow).
  const first = await db.prepare(`SELECT count(*) n FROM invoices WHERE job_id = ?1 AND status = 'paid'`).bind(job.id).first();
  if (first.n === 1 && job.workflow === 'wedding') {
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO steps (job_id, step_key, kind, title, template_key, due_at, created_at) VALUES (?1, 'wedding-04-thanks-for-booking', 'auto_email', '04 Thanks for booking', 'wedding-04-thanks-for-booking', ?2, ?2)`).bind(job.id, now),
      db.prepare(`UPDATE steps SET status = 'done', done_at = ?2, note = 'Deposit paid' WHERE job_id = ?1 AND step_key LIKE 'deposit-invoice-%' AND status IN ('scheduled', 'due')`).bind(job.id, now),
    ]);
  }
  await alertTony(env, `Payment received: ${job.title}`, [
    ['Invoice', `${paid.number}: ${paid.label}`], ['Amount', money(paid.amount)], ['How', method === 'card' ? 'Card (Stripe)' : method === 'bank' ? 'Bank transfer' : method], ['Note', note], ['Receipt', receipt],
    ...(first.n === 1 && job.workflow === 'wedding' ? [['Next', '“Thanks for booking” goes out automatically within 15 minutes.']] : []),
  ], `${SITE}/studio/crm/job?id=${job.id}`);
  return true;
}

/** A Stripe Checkout page for paying an invoice by card. Returns its URL. */
export async function checkout(env, inv, job) {
  const ready = stripeReady(env);
  if (!ready.ok) throw new Error(ready.why);
  const back = `${SITE}/invoice?t=${inv.token}`;
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'nzd',
    'line_items[0][price_data][unit_amount]': String(inv.amount),
    'line_items[0][price_data][product_data][name]': `Moments in Light invoice ${inv.number}: ${inv.label}`,
    customer_email: job.email,
    client_reference_id: String(inv.id),
    'metadata[invoice_id]': String(inv.id),
    'metadata[invoice_number]': inv.number,
    'payment_intent_data[description]': `Invoice ${inv.number}: ${inv.label}`,
    'payment_intent_data[metadata][invoice_id]': String(inv.id),
    success_url: `${back}&paid=1`,
    cancel_url: back,
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Stripe: ${d.error?.message ?? r.status}`);
  await env.DB.prepare('UPDATE invoices SET stripe_session = ?2 WHERE id = ?1').bind(inv.id, d.id).run();
  return d.url;
}

/** Check a Stripe webhook's signature (Stripe-Signature: t=…,v1=…). */
export async function verifyStripe(secret, header, payload) {
  const parts = Object.fromEntries((header || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
  const sigs = (header || '').split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!parts.t || !sigs.length || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${payload}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.includes(mac);
}
