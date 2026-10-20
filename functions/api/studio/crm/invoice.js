// Invoices in the studio.
//   GET  /api/studio/crm/invoice?id=4&pdf=1      the invoice PDF (&receipt=1: the receipt, once paid)
//   POST /api/studio/crm/invoice  { id, action: 'paid', method: 'bank'|'other', note }   mark it paid
//                                 { id, action: 'send' }      send it now (or again)
//                                 { id, action: 'void' }      cancel an unpaid invoice
//                                 { id, action: 'edit', amount?, due_date?, label? }   change an unpaid one
//                                 { job_id, action: 'add', label, lines: [{ name, qty, price }], due_date, send }
//                                     an extra invoice (add-ons after booking: second shooter, prints…);
//                                     send: true emails it now, otherwise it goes 2 weeks before it's due
//                                 { contract_id, action: 'create' }   make a signed contract's invoices
//                                                                     (if they weren't made automatically)
import { json } from '../../../../functions-lib/studio.js';
import { loadJob } from '../../../../functions-lib/crm-send.js';
import { markPaid, sendInvoice, paymentSettings, createInvoices, nextNumber, token } from '../../../../functions-lib/invoices.js';
import { money } from '../../../../functions-lib/quotes.js';
import { invoicePdf } from '../../../../functions-lib/pdf.js';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const inv = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?1').bind(Number(u.searchParams.get('id'))).first();
  if (!inv) return json({ error: 'That invoice doesn’t exist.' }, 404);
  const receipt = inv.status === 'paid' && u.searchParams.has('receipt');
  return new Response(await invoicePdf(inv, await loadJob(env.DB, inv.job_id), await paymentSettings(env.DB), { asInvoice: !receipt }),
    { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${receipt ? 'Receipt' : 'Invoice'} ${inv.number}.pdf"`, 'cache-control': 'no-store' } });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  if (d?.action === 'add') {
    const job = await env.DB.prepare('SELECT id, hold FROM jobs WHERE id = ?1').bind(Number(d.job_id)).first();
    if (!job) return json({ error: 'That client doesn’t exist.' }, 404);
    const lines = (Array.isArray(d.lines) ? d.lines : []).map((l) => ({ name: String(l?.name ?? '').trim().slice(0, 160), qty: Math.max(1, Math.min(999, Math.round(Number(l?.qty) || 1))), price: Math.max(0, Math.round(Number(l?.price) || 0)) }))
      .filter((l) => l.name).slice(0, 30);
    if (!lines.length) return json({ error: 'Add at least one item.' }, 400);
    const amount = lines.reduce((t, l) => t + l.qty * l.price, 0);
    if (!amount) return json({ error: 'The total is $0.' }, 400);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
    const due = /^\d{4}-\d{2}-\d{2}$/.test(d.due_date ?? '') && d.due_date >= today ? d.due_date : today;
    const now = new Date();
    // Later: 2 weeks before it's due, about 9am NZ (or now, if that's already passed).
    const sendDay = new Date(Date.parse(`${due}T12:00:00Z`) - 14 * 86400_000).toISOString().slice(0, 10);
    const sendAt = d.send || sendDay <= today ? now.toISOString() : `${sendDay}T20:00:00.000Z`;
    const label = String(d.label ?? '').trim().slice(0, 120) || (lines.length === 1 ? lines[0].name : 'Add-ons');
    const description = lines.map((l) => `${l.name}${l.qty > 1 ? ` × ${l.qty}` : ''} (${money(l.qty * l.price)})`).join(' + ');
    let inv;
    for (let tries = 0; tries < 5 && !inv; tries++) {
      try {
        inv = await env.DB.prepare(`INSERT INTO invoices (job_id, number, label, description, amount, due_date, send_at, token, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) RETURNING *`)
          .bind(job.id, await nextNumber(env.DB, today.slice(0, 4)), label, description, amount, due, sendAt, token(), now.toISOString()).first();
      } catch (e) { if (!String(e).includes('UNIQUE') || tries === 4) throw e; }
    }
    if (d.send && !job.hold) {
      try { await sendInvoice(env, inv); } catch (e) { return json({ ok: true, id: inv.id, warning: `Made ${inv.number}, but it didn’t send: ${e.message}` }); }
    }
    return json({ ok: true, id: inv.id, number: inv.number, sent: !!d.send && !job.hold });
  }
  if (d?.action === 'create') {
    const c = await env.DB.prepare(`SELECT * FROM contracts WHERE id = ?1 AND status = 'signed'`).bind(Number(d.contract_id)).first();
    if (!c) return json({ error: 'Invoices are made once the contract is signed.' }, 400);
    try { const made = await createInvoices(env, c); return json({ ok: true, made: made.length }); } catch (e) { return json({ error: e.message }, 400); }
  }
  const inv = d?.id && await env.DB.prepare('SELECT * FROM invoices WHERE id = ?1').bind(Number(d.id)).first();
  if (!inv) return json({ error: 'That invoice doesn’t exist.' }, 404);
  try {
    if (d.action === 'paid') {
      if (inv.status === 'paid') return json({ error: 'It’s already marked paid.' }, 409);
      if (inv.status === 'void') return json({ error: 'That invoice was cancelled.' }, 409);
      await markPaid(env, inv, { method: ['bank', 'card', 'other'].includes(d.method) ? d.method : 'bank', note: (d.note ?? '').toString().slice(0, 200) });
      return json({ ok: true });
    }
    if (d.action === 'send') {
      if (!['scheduled', 'sent'].includes(inv.status)) return json({ error: `This invoice is ${inv.status}.` }, 409);
      const s = await sendInvoice(env, inv, 'invoice');
      return json({ ok: true, to: s.to, redirected: s.redirected, intended: s.intended });
    }
    if (d.action === 'void') {
      const r = await env.DB.prepare(`UPDATE invoices SET status = 'void' WHERE id = ?1 AND status IN ('scheduled', 'sent')`).bind(inv.id).run();
      return r.meta.changes ? json({ ok: true }) : json({ error: 'Only an unpaid invoice can be cancelled.' }, 409);
    }
    if (d.action === 'edit') {
      if (!['scheduled', 'sent'].includes(inv.status)) return json({ error: 'Only an unpaid invoice can be changed.' }, 409);
      const amount = d.amount !== undefined ? Math.round(Number(d.amount)) : inv.amount;
      const due = /^\d{4}-\d{2}-\d{2}$/.test(d.due_date ?? '') ? d.due_date : inv.due_date;
      if (!(amount > 0)) return json({ error: 'The amount needs to be more than $0.' }, 400);
      // A later due date moves the send date too (2 weeks before), unless it's already been sent.
      const sendAt = inv.status === 'scheduled' && due !== inv.due_date ? new Date(Math.max(Date.now(), new Date(`${due}T20:00:00Z`).valueOf() - 14 * 86400_000)).toISOString() : inv.send_at;
      await env.DB.prepare('UPDATE invoices SET amount = ?2, due_date = ?3, label = ?4, send_at = ?5, reminders = CASE WHEN ?3 <> due_date THEN 0 ELSE reminders END WHERE id = ?1')
        .bind(inv.id, amount, due, (d.label ?? inv.label).toString().slice(0, 100) || inv.label, sendAt).run();
      return json({ ok: true });
    }
    return json({ error: 'What should happen to it?' }, 400);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
