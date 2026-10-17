// Stripe tells the site when a card payment has gone through (Stripe dashboard > Developers >
// Webhooks: https://www.momentsinlight.co.nz/api/stripe-webhook, event checkout.session.completed).
// The signature is checked with STRIPE_WEBHOOK_SECRET, then the invoice is marked paid (which
// emails the receipt and alerts Tony). Safe to receive twice: a paid invoice isn't paid again.
import { verifyStripe, markPaid } from '../../functions-lib/invoices.js';

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
      } else if (inv) {
        console.error('stripe webhook: amount/currency mismatch for invoice', id, s.amount_total, s.currency);
      }
    }
  }
  return new Response('ok');
}
