// Contracts in the studio.
//   GET  /api/studio/crm/contract?id=5&pdf=1      a contract's PDF (the signed copy once signed)
//   GET  /api/studio/crm/contract?quote=3&pdf=1   a quote's PDF
//   POST /api/studio/crm/contract  { quote_id }   make and send the contract for an accepted quote
//                                                 (normally automatic; this is for retries)
//   DELETE /api/studio/crm/contract?id=5          void an unsigned contract (its link stops working)
import { json } from '../../../../functions-lib/studio.js';
import { loadJob } from '../../../../functions-lib/crm-send.js';
import { makeContract, sendContract } from '../../../../functions-lib/contracts.js';
import { contractPdf, quotePdf } from '../../../../functions-lib/pdf.js';
import { parseQuote, quoteNumber } from '../../../../functions-lib/quotes.js';
import { loadNamed } from '../../../../functions-lib/documents.js';

const pdf = (bytes, name) => new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${name}"`, 'cache-control': 'no-store' } });

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url).searchParams;
  if (u.get('quote')) {
    const q = parseQuote(await env.DB.prepare('SELECT * FROM quotes WHERE id = ?1').bind(Number(u.get('quote'))).first());
    if (!q) return json({ error: 'That quote doesn’t exist.' }, 404);
    const job = await loadJob(env.DB, q.job_id);
    return pdf(await quotePdf(q, job, quoteNumber(q)), `Quote ${quoteNumber(q)}.pdf`);
  }
  const c = await env.DB.prepare('SELECT * FROM contracts WHERE id = ?1').bind(Number(u.get('id'))).first();
  if (!c) return json({ error: 'That contract doesn’t exist.' }, 404);
  const stored = c.status === 'signed' && await loadNamed(env.DB, `contract-${c.id}.pdf`);
  return pdf(stored ? Uint8Array.from(atob(stored.base64), (x) => x.charCodeAt(0)) : await contractPdf(c), `${c.name}${c.status === 'signed' ? ' (signed)' : ''}.pdf`);
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const qRow = d?.quote_id && await env.DB.prepare('SELECT * FROM quotes WHERE id = ?1').bind(Number(d.quote_id)).first();
  if (!qRow || qRow.status !== 'accepted') return json({ error: 'Contracts are sent once a quote is accepted.' }, 400);
  try {
    const job = await loadJob(env.DB, qRow.job_id);
    const contract = await makeContract(env, qRow, job);
    if (contract.status === 'signed') return json({ error: 'That contract is already signed.' }, 409);
    const sent = await sendContract(env, contract, qRow, job);
    await env.DB.prepare(`UPDATE steps SET status = 'done', done_at = ?2, note = 'Contract sent' WHERE job_id = ?1 AND step_key = ?3 AND status IN ('scheduled', 'due', 'failed')`)
      .bind(job.id, new Date().toISOString(), `send-contract-${qRow.id}`).run();
    return json({ ok: true, to: sent.to, redirected: sent.redirected, intended: sent.intended });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestDelete({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  const r = await env.DB.prepare(`UPDATE contracts SET status = 'void' WHERE id = ?1 AND status = 'sent'`).bind(id).run();
  if (!r.meta.changes) return json({ error: 'Only an unsigned contract can be cancelled.' }, 409);
  return json({ ok: true });
}
