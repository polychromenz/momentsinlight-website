// The couple's contract page (/contract?t=…) talks to this. Public, but each contract is only
// reachable with its long random token.
//   GET  /api/contract?t=…            the contract (marks it viewed, unless &preview=1)
//   GET  /api/contract?t=…&pdf=1      the PDF (signed copy once signed)
//   POST /api/contract  { t, name, agree, fingerprint }   sign it
// Signing checks the wording is exactly what they were shown (fingerprint), records their typed
// name, the time, their IP address and browser, makes the signed PDF (kept privately), emails it
// to them (from Tony's Gmail, test-mode lock applies) and to Tony, then makes the invoices and
// sends the deposit invoice.
import { loadJob } from '../../functions-lib/crm-send.js';
import { alertTony } from '../../functions-lib/crm.js';
import { contractPdf, toBase64 } from '../../functions-lib/pdf.js';
import { fingerprintOf } from '../../functions-lib/contracts.js';
import { storeNamed, loadNamed } from '../../functions-lib/documents.js';
import { sendEmail } from '../../functions-lib/gmail.js';
import { renderTemplate, fields, studioLinks } from '../../functions-lib/email-render.js';
import { createInvoices, sendInvoice, money } from '../../functions-lib/invoices.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const find = (env, t) => (/^[a-f0-9]{48}$/.test(t || '') ? env.DB.prepare('SELECT * FROM contracts WHERE token = ?1').bind(t).first() : null);
const pdfResponse = (bytes, name) => new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${name}"`, 'cache-control': 'no-store' } });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const c = await find(env, url.searchParams.get('t'));
  if (!c || c.status === 'void') return reply({ error: 'This contract isn’t available. Please get in touch with Tony.' }, 404);
  if (url.searchParams.has('pdf')) {
    const stored = c.status === 'signed' && await loadNamed(env.DB, `contract-${c.id}.pdf`);
    const bytes = stored ? Uint8Array.from(atob(stored.base64), (x) => x.charCodeAt(0)) : await contractPdf(c);
    return pdfResponse(bytes, `${c.name}${c.status === 'signed' ? ' (signed)' : ''}.pdf`);
  }
  if (!url.searchParams.has('preview') && !c.viewed_at) await env.DB.prepare('UPDATE contracts SET viewed_at = ?2 WHERE id = ?1 AND viewed_at IS NULL').bind(c.id, new Date().toISOString()).run();
  // One-step booking: once signed, the deposit invoice to pay next (while it's unpaid).
  let pay_link = null;
  if (c.status === 'signed') {
    const inv = await env.DB.prepare(`SELECT token FROM invoices WHERE contract_id = ?1 AND status IN ('sent', 'scheduled') AND send_at <= ?2 ORDER BY due_date LIMIT 1`).bind(c.id, new Date().toISOString()).first();
    if (inv) pay_link = `/invoice?t=${inv.token}`;
  }
  return reply({ name: c.name, status: c.status, details: JSON.parse(c.details), body: c.body, fingerprint: c.fingerprint, signed_name: c.signed_name, signed_at: c.signed_at, pay_link });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const c = await find(env, d?.t);
  if (!c || c.status === 'void') return reply({ error: 'This contract isn’t available. Please get in touch with Tony.' }, 404);
  if (c.status === 'signed') return reply({ error: 'This contract is already signed. Thank you!' }, 409);
  const name = (d.name ?? '').toString().trim().slice(0, 120);
  if (!d.agree) return reply({ error: 'Please tick to confirm you’ve read and agree to the contract.' }, 400);
  if (name.length < 2) return reply({ error: 'Please type your full name to sign.' }, 400);
  // The wording they saw must be exactly what's stored (and what was sent).
  if (d.fingerprint !== c.fingerprint || await fingerprintOf(c.details, c.body) !== c.fingerprint) {
    return reply({ error: 'This contract has changed since you opened it. Please reload the page and read it again.' }, 409);
  }
  const at = new Date().toISOString();
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const agent = (request.headers.get('user-agent') || '').slice(0, 300);
  const r = await env.DB.prepare(`UPDATE contracts SET status = 'signed', signed_name = ?2, signed_at = ?3, signed_ip = ?4, signed_agent = ?5 WHERE id = ?1 AND status = 'sent'`)
    .bind(c.id, name, at, ip, agent).run();
  if (!r.meta.changes) return reply({ error: 'This contract has just changed. Please reload the page.' }, 409);

  const signed = await env.DB.prepare('SELECT * FROM contracts WHERE id = ?1').bind(c.id).first();
  const pdf = toBase64(await contractPdf(signed));
  const fileName = `${signed.name} (signed).pdf`;
  await storeNamed(env.DB, `contract-${c.id}.pdf`, 'application/pdf', pdf);
  const job = await loadJob(env.DB, c.job_id);

  // Their copy, from Tony's Gmail.
  let theirs = 'Emailed them a signed copy.';
  try {
    const template = await env.DB.prepare(`SELECT * FROM templates WHERE key = 'contract-signed'`).first();
    if (!template) throw new Error('the “Contract signed” email template is missing');
    const email = renderTemplate(template, fields(job, await studioLinks(env.DB)));
    const last = await env.DB.prepare('SELECT gmail_thread_id FROM messages WHERE job_id = ?1 AND gmail_thread_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1').bind(job.id).first();
    const sent = await sendEmail(env, { to: job.email, subject: email.subject, html: email.html, attachments: [{ name: fileName, type: 'application/pdf', base64: pdf }], threadId: last?.gmail_thread_id });
    await env.DB.prepare(`INSERT INTO messages (job_id, client_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at, attachments) VALUES (?1, ?2, 'out', ?3, ?4, ?5, ?6, ?7, ?8)`)
      .bind(job.id, job.client_id, email.subject, email.body, sent.id, sent.threadId, at, fileName).run();
    if (sent.redirected) theirs += ` (Test mode: it went to ${sent.to}.)`;
  } catch (e) {
    console.error('contract signed: copy not sent', e);
    theirs = `Their signed copy couldn’t be emailed (${e.message}); download it from their page and send it.`;
  }
  // The invoices (one per payment in the schedule); the deposit goes straight away, the rest on
  // their send dates (the timer). If that fails, Tony gets a to-do instead.
  let next;
  try {
    const made = await createInvoices(env, signed);
    const deposit = made.find((i) => i.send_at <= new Date().toISOString());
    if (deposit) { const s = await sendInvoice(env, deposit, 'invoice'); next = `Deposit invoice ${deposit.number} (${money(deposit.amount)}) sent${s.redirected ? ` (test mode: to ${s.to})` : ''}; ${made.length - 1} more scheduled.`; }
    else next = `${made.length} invoices scheduled.`;
  } catch (e) {
    console.error('contract signed: invoices', e);
    next = `The deposit invoice couldn’t be sent automatically (${e.message}). It’s on your Today list.`;
    await env.DB.prepare(`INSERT OR IGNORE INTO steps (job_id, step_key, kind, title, due_at, note, created_at) VALUES (?1, ?2, 'todo', 'Send the deposit invoice (contract signed)', ?3, ?4, ?3)`)
      .bind(job.id, `deposit-invoice-${c.id}`, at, String(e.message).slice(0, 300)).run();
  }
  await alertTony(env, `Contract signed: ${job.title}`, [
    ['Contract', signed.name], ['Signed by', `${name}, ${new Date(at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}`],
    ['Their copy', theirs], ['Invoices', next],
  ], `https://www.momentsinlight.co.nz/studio/crm/job?id=${job.id}`, [{ name: fileName, base64: pdf }]);
  return reply({ ok: true });
}
