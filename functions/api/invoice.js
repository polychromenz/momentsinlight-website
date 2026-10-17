// The couple's invoice page (/invoice?t=…) talks to this. Public, but each invoice is only
// reachable with its long random token. Invoices not emailed yet open too (the link is in the
// PDF), so a couple can pay early; a paid invoice is never emailed later.
//   GET  /api/invoice?t=…          the invoice (and bank transfer details)
//   GET  /api/invoice?t=…&pdf=1    the invoice PDF (a receipt once paid)
//   POST /api/invoice  { t }       a Stripe Checkout page to pay by card → { url }
import { loadJob } from '../../functions-lib/crm-send.js';
import { paymentSettings, checkout, stripeReady } from '../../functions-lib/invoices.js';
import { invoicePdf } from '../../functions-lib/pdf.js';
import { longDate } from '../../functions-lib/quotes.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const find = (env, t) => (/^[a-f0-9]{48}$/.test(t || '') ? env.DB.prepare('SELECT * FROM invoices WHERE token = ?1').bind(t).first() : null);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const inv = await find(env, url.searchParams.get('t'));
  if (!inv || !inv.status || inv.status === 'void') return reply({ error: 'This invoice isn’t available. Please get in touch with Tony.' }, 404);
  const job = await loadJob(env.DB, inv.job_id);
  const pay = await paymentSettings(env.DB);
  if (url.searchParams.has('pdf')) {
    return new Response(await invoicePdf(inv, job, pay), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${inv.status === 'paid' ? 'Receipt' : 'Invoice'} ${inv.number}.pdf"`, 'cache-control': 'no-store' } });
  }
  return reply({
    number: inv.number, label: inv.label, description: inv.description, amount: inv.amount, status: inv.status,
    issued: longDate((inv.sent_at || inv.created_at).slice(0, 10)), due: inv.due_date, due_long: longDate(inv.due_date),
    paid_at: inv.paid_at, paid_method: inv.paid_method,
    client: { name: `${job.first_name} ${job.last_name}`.trim(), email: job.email, address: job.address || '' },
    bank: pay.account_number ? { account_name: pay.account_name, bank_name: pay.bank_name, account_number: pay.account_number, instructions: pay.instructions } : null,
    gst_number: pay.gst_number || '',
    card: stripeReady(env).ok,
  });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const inv = await find(env, d?.t);
  if (!inv || !['sent', 'scheduled'].includes(inv.status)) return reply({ error: inv?.status === 'paid' ? 'This invoice is already paid. Thank you!' : 'This invoice isn’t available.' }, 409);
  try {
    return reply({ url: await checkout(env, inv, await loadJob(env.DB, inv.job_id)) });
  } catch (e) {
    console.error('invoice checkout', e);
    return reply({ error: 'Card payment isn’t available right now. Please pay by bank transfer, or try again later.' }, 503);
  }
}
