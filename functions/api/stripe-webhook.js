// Stripe tells the site when a card payment has gone through (Stripe dashboard > Developers >
// Webhooks: https://www.momentsinlight.co.nz/api/stripe-webhook, events checkout.session.completed,
// checkout.session.async_payment_succeeded and payout.paid).
// The signature is checked with STRIPE_WEBHOOK_SECRET, then the invoice is marked paid (which
// emails the receipt and alerts Tony). Safe to receive twice: a paid invoice isn't paid again.
// For the Xero link it also records Stripe's fee on each payment, and what made up each payout.
import { verifyStripe, markPaid } from '../../functions-lib/invoices.js';
import { recordFee, recordPayout } from '../../functions-lib/stripe-sync.js';
import { confirmBooking } from '../../functions-lib/booking.js';
import { saveCard } from '../../functions-lib/autopay.js';

export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  if (!env.STRIPE_WEBHOOK_SECRET || !(await verifyStripe(env.STRIPE_WEBHOOK_SECRET, request.headers.get('stripe-signature'), payload))) {
    return new Response('Bad signature', { status: 400 });
  }
  const event = JSON.parse(payload);
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object;
    const id = Number(s.metadata?.invoice_id || s.client_reference_id);
    if (id && s.payment_status === 'paid') {
      const inv = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?1').bind(id).first();
      if (inv && inv.amount === s.amount_total && s.currency === 'nzd') {
        await markPaid(env, inv, { method: 'card', stripeSession: s.id, stripePayment: s.payment_intent });
        await recordFee(env, id, s.payment_intent, event.livemode).catch((e) => console.error('stripe webhook: fee', id, e.message));
        // They chose to pay later instalments automatically: keep the card on their job.
        if (s.metadata?.autopay === '1') await saveCard(env, s, inv.job_id).catch((e) => console.error('stripe webhook: save card', e.message));
        // A paid online booking: it's on (confirmation email and alert).
        const held = await env.DB.prepare(`SELECT id FROM bookings WHERE invoice_id = ?1 AND status = 'held'`).bind(id).first();
        if (held) await confirmBooking({ env }, held.id).catch((e) => console.error('stripe webhook: booking', e.message));
      } else if (inv) {
        console.error('stripe webhook: amount/currency mismatch for invoice', id, s.amount_total, s.currency);
      }
    }
  }
  if (event.type === 'payout.paid') {
    try { await recordPayout(env, event.data.object, event.livemode); } catch (e) {
      console.error('stripe webhook: payout', e.message);
      return new Response('Payout not recorded', { status: 500 }); // Stripe tries again later
    }
  }
  return new Response('ok');
}
