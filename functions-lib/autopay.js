// Automatic instalments (feature ideas, 20 Oct 2026). When a couple pays an invoice by card they can
// tick "pay my remaining instalments automatically with this card": Stripe keeps the card, and on
// each later invoice's due date the timer charges it and the usual receipt goes out. A card that
// fails gets them a friendly "please pay here" email and Tony an alert; the normal reminders then
// carry on. Tony can switch it off on the client page. Stripe test keys until Stripe goes live.
import { markPaid } from './invoices.js';
import { recordFee } from './stripe-sync.js';
import { alertTony } from './crm.js';
import { sendEmail } from './gmail.js';
import { renderTemplate, studioLinks } from './email-render.js';
import { loadJob } from './crm-send.js';
import { invoiceValues } from './invoices.js';

const SITE = 'https://www.momentsinlight.co.nz';
const stripe = async (env, method, path, body, key = null) => {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method, headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(key ? { 'idempotency-key': key } : {}) },
    body: body ? new URLSearchParams(body) : undefined,
  });
  return { ok: r.ok, d: await r.json().catch(() => ({})) };
};

/** After a card payment where they ticked automatic payments: keep the card on their job. */
export async function saveCard(env, session, jobId) {
  if (!session.customer || !session.payment_intent) return;
  const { ok, d: pi } = await stripe(env, 'GET', `/payment_intents/${encodeURIComponent(session.payment_intent)}?expand[]=payment_method`);
  if (!ok || !pi.payment_method) return;
  const pm = pi.payment_method;
  const card = pm.card ? `${pm.card.brand.replace(/^\w/, (c) => c.toUpperCase())} ending ${pm.card.last4}` : 'your card';
  await env.DB.prepare('UPDATE jobs SET autopay = 1, stripe_customer = ?2, stripe_payment_method = ?3, autopay_card = ?4, updated_at = ?5 WHERE id = ?1')
    .bind(jobId, session.customer, pm.id ?? pm, card, new Date().toISOString()).run();
  // Only later instalments are paid automatically: anything already due stays a normal invoice
  // (with its reminders), so the card isn't charged straight away for it.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
  await env.DB.prepare(`UPDATE invoices SET autopay_tried_at = ?2, autopay_error = 'Already due when the card was saved, so not paid automatically' WHERE job_id = ?1 AND status IN ('sent', 'scheduled') AND due_date <= ?3 AND autopay_tried_at IS NULL`)
    .bind(jobId, new Date().toISOString(), today).run();
}

/** The timer: charge instalments that are due today for jobs on automatic payments. */
export async function chargeDue(env) {
  const db = env.DB;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
  const due = (await db.prepare(`SELECT i.* FROM invoices i JOIN jobs j ON j.id = i.job_id
      WHERE j.autopay = 1 AND j.hold = 0 AND j.stripe_payment_method IS NOT NULL AND i.status IN ('sent', 'scheduled') AND i.due_date <= ?1 AND i.autopay_tried_at IS NULL LIMIT 10`).bind(today).all()).results;
  let paid = 0, failed = 0;
  for (const inv of due) {
    const claim = await db.prepare('UPDATE invoices SET autopay_tried_at = ?2 WHERE id = ?1 AND autopay_tried_at IS NULL').bind(inv.id, new Date().toISOString()).run();
    if (!claim.meta.changes) continue;
    const job = await db.prepare('SELECT * FROM jobs WHERE id = ?1').bind(inv.job_id).first();
    const { ok, d } = await stripe(env, 'POST', '/payment_intents', {
      amount: String(inv.amount), currency: 'nzd', customer: job.stripe_customer, payment_method: job.stripe_payment_method,
      off_session: 'true', confirm: 'true', description: `Invoice ${inv.number}: ${inv.label}`,
      'metadata[invoice_id]': String(inv.id), 'metadata[autopay]': '1',
    }, `autopay-${inv.id}`);
    const pi = ok ? d : d.error?.payment_intent;
    if (ok && pi?.status === 'succeeded') {
      await markPaid(env, inv, { method: 'card', note: `Automatic payment (${job.autopay_card})`, stripePayment: pi.id });
      await recordFee(env, inv.id, pi.id, pi.livemode).catch(() => {});
      paid++;
      continue;
    }
    failed++;
    const why = d.error?.message ?? `Stripe said ${pi?.status ?? 'no'}`;
    await db.prepare('UPDATE invoices SET autopay_error = ?2 WHERE id = ?1').bind(inv.id, why.slice(0, 300)).run();
    let told = 'Emailed them a link to pay.';
    try { await failedEmail(env, inv); } catch (e) { told = `Couldn’t email them (${e.message}).`; }
    await alertTony(env, `An automatic payment didn’t go through: ${inv.number}`, [['Why', why], ['Card', job.autopay_card ?? ''], ['Them', told], ['What now', 'The usual invoice reminders carry on. They can pay from the link in the email.']],
      `${SITE}/studio/crm/job?id=${inv.job_id}`);
  }
  return { paid, failed };
}

async function failedEmail(env, inv) {
  const db = env.DB;
  const job = await loadJob(db, inv.job_id);
  const t = await db.prepare(`SELECT * FROM templates WHERE key = 'autopay-failed'`).first();
  if (!t) throw new Error('the “Automatic payment didn’t go through” template is missing');
  const e = renderTemplate(t, { ...(await studioLinks(db)), ...invoiceValues(inv, job), autopay_card: job.autopay_card ?? 'your card' });
  const s = await sendEmail(env, { to: job.email, subject: e.subject, html: e.html });
  await db.prepare(`INSERT INTO messages (job_id, client_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at) VALUES (?1, ?2, 'out', ?3, ?4, ?5, ?6, ?7)`)
    .bind(job.id, job.client_id, e.subject, e.body, s.id, s.threadId, new Date().toISOString()).run();
}
