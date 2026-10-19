// What Stripe tells the studio about money (for the Xero link, functions-lib/xero.js):
//   recordFee()     after a card payment: Stripe's fee on it
//   recordPayout()  when a payout reaches the bank: which payments, fees and refunds made it up
// Both use the Stripe secret key; Stripe test payments are marked so they never go to Xero.
const stripe = async (env, path) => {
  const r = await fetch(`https://api.stripe.com/v1${path}`, { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Stripe: ${d.error?.message ?? r.status}`);
  return d;
};

export async function recordFee(env, invoiceId, paymentIntent, live) {
  await env.DB.prepare('UPDATE invoices SET stripe_live = ?2 WHERE id = ?1').bind(invoiceId, live ? 1 : 0).run();
  if (!paymentIntent) return;
  const pi = await stripe(env, `/payment_intents/${encodeURIComponent(paymentIntent)}?expand[]=latest_charge.balance_transaction`);
  const bt = pi.latest_charge?.balance_transaction;
  if (bt && typeof bt === 'object') await env.DB.prepare('UPDATE invoices SET stripe_fee = ?2 WHERE id = ?1').bind(invoiceId, bt.fee).run();
}

/** A payout that arrived: its parts, and each studio invoice it paid out. */
export async function recordPayout(env, payout, live) {
  if (!live || payout.status !== 'paid') return;
  const db = env.DB;
  let gross = 0, fees = 0, other = 0, payments = 0, unmatched = 0, after = '';
  for (let page = 0; page < 20; page++) {
    const d = await stripe(env, `/balance_transactions?payout=${encodeURIComponent(payout.id)}&limit=100&expand[]=data.source${after ? `&starting_after=${after}` : ''}`);
    for (const t of d.data) {
      if (t.type === 'payout') continue;
      if (t.type === 'charge' || t.type === 'payment') {
        gross += t.amount; fees += t.fee; payments++;
        const pi = typeof t.source === 'object' ? t.source.payment_intent : null;
        const r = pi ? await db.prepare('UPDATE invoices SET stripe_payout = ?2, stripe_fee = COALESCE(stripe_fee, ?3) WHERE stripe_payment = ?1').bind(pi, payout.id, t.fee).run() : null;
        if (!r?.meta.changes) unmatched++;
      } else { other += t.net; }
    }
    if (!d.has_more || !d.data.length) break;
    after = d.data[d.data.length - 1].id;
  }
  const arrival = new Date(payout.arrival_date * 1000).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
  await db.prepare(`INSERT INTO stripe_payouts (id, amount, arrival_date, gross, fees, other, payments, unmatched, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT (id) DO UPDATE SET amount = ?2, arrival_date = ?3, gross = ?4, fees = ?5, other = ?6, payments = ?7, unmatched = ?8`)
    .bind(payout.id, payout.amount, arrival, gross, fees, other, payments, unmatched, new Date().toISOString()).run();
}
