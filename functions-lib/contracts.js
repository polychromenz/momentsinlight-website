// Contracts in the studio CRM. When a couple accepts a quote, makeContract() copies the quote's
// contract (Settings > Contracts; chosen on the quote, defaulting to the job type's) with the
// event details, and sendContract() emails it to sign (the "Contract ready to sign" template) with
// a PDF of the accepted quote attached. The couple signs at /contract?t=… (functions/api/contract.js).
// All client email goes through sendEmail(), so the test-mode lock applies.
import { sendEmail } from './gmail.js';
import { renderTemplate, fields } from './email-render.js';
import { attachmentsFor } from './documents.js';
import { templateAttachments } from './crm-send.js';
import { clean, toHtml } from './rich-html.js';
import { payments, longDate, parseQuote, quoteNumber } from './quotes.js';
import { quotePdf, toBase64 } from './pdf.js';

const SITE = 'https://www.momentsinlight.co.nz';
const money = (c) => `$${(c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** SHA-256 of exactly what's signed: the event details and the wording. */
export const fingerprintOf = async (details, body) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${details}\n---\n${body}`)));

/** Which contract a quote uses: its own choice, else the job type's default, else the first. */
export async function contractKeyFor(db, q, job) {
  if (q?.contract_key && await db.prepare('SELECT 1 FROM contract_templates WHERE key = ?1').bind(q.contract_key).first()) return q.contract_key;
  const byType = await db.prepare(`SELECT contract_key FROM lists WHERE kind = 'job_type' AND value = ?1`).bind(job.job_type).first();
  if (byType?.contract_key) return byType.contract_key;
  return (await db.prepare('SELECT key FROM contract_templates ORDER BY key LIMIT 1').first())?.key ?? null;
}

/** Make the contract for an accepted quote (or return the one already made). */
export async function makeContract(env, quoteRow, job) {
  const db = env.DB;
  const existing = await db.prepare(`SELECT * FROM contracts WHERE quote_id = ?1 AND status <> 'void'`).bind(quoteRow.id).first();
  if (existing) return existing;
  const q = parseQuote(quoteRow);
  const key = await contractKeyFor(db, q, job);
  const tpl = key && await db.prepare('SELECT * FROM contract_templates WHERE key = ?1').bind(key).first();
  if (!tpl) throw new Error('There’s no contract set up yet (Settings > Contracts).');
  const pkg = q.packages[q.chosen_package];
  const extras = (q.chosen_extras || []).map((i) => q.extras[i]).filter(Boolean);
  const total = q.total ?? 0;
  const details = JSON.stringify({
    note: tpl.note || '',
    client: `${job.first_name} ${job.last_name}`.trim(),
    partner: job.partner_name || '',
    email: job.email, address: job.address || '',
    event_date: job.event_date, event_date_long: longDate(job.event_date), venue: job.venue || '',
    package: [pkg && `${pkg.name}${pkg.subtitle ? ` (${pkg.subtitle})` : ''}`, ...extras.map((x) => x.name)].filter(Boolean).join(' + '),
    total: money(total),
    payments: payments(q.schedule, total, job.event_date, (q.accepted_at || new Date().toISOString()).slice(0, 10))
      .map((p) => ({ label: `${p.label} (${p.percent}%) ${p.onAccept ? 'on acceptance' : `by ${longDate(p.due)}`}`, amount: money(p.amount) })),
    quote: quoteNumber(q),
  });
  const body = clean(toHtml(tpl.body));
  const now = new Date().toISOString();
  const row = await db.prepare(
    `INSERT INTO contracts (job_id, quote_id, token, template_key, name, details, body, fingerprint, status, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'sent', ?9) RETURNING *`,
  ).bind(job.id, q.id, token(), tpl.key, tpl.name, details, body, await fingerprintOf(details, body), now).first();
  return row;
}

/** Email the contract to sign, with the accepted quote as a PDF (and the template's documents). */
export async function sendContract(env, contract, quoteRow, job) {
  const db = env.DB;
  const template = await db.prepare(`SELECT * FROM templates WHERE key = 'contract-ready'`).first();
  if (!template) throw new Error('The “Contract ready to sign” email template is missing (Settings).');
  const q = parseQuote(quoteRow);
  const email = renderTemplate(template, fields(job, { contract_link: `${SITE}/contract?t=${contract.token}` }));
  if (email.missing.length) throw new Error(`The contract email needs: ${email.missing.join(', ')}.`);
  const pdf = toBase64(await quotePdf(q, job, quoteNumber(q)));
  const attachments = [{ name: `Moments in Light quote ${quoteNumber(q)}.pdf`, type: 'application/pdf', base64: pdf }, ...await attachmentsFor(db, templateAttachments(template))];
  const last = await db.prepare('SELECT gmail_thread_id FROM messages WHERE job_id = ?1 AND gmail_thread_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1').bind(job.id).first();
  const sent = await sendEmail(env, { to: job.email, subject: email.subject, html: email.html, attachments, threadId: last?.gmail_thread_id });
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE contracts SET sent_at = ?2 WHERE id = ?1').bind(contract.id, now),
    db.prepare(`INSERT INTO messages (job_id, client_id, direction, subject, body, gmail_message_id, gmail_thread_id, sent_at) VALUES (?1, ?2, 'out', ?3, ?4, ?5, ?6, ?7)`)
      .bind(job.id, job.client_id, email.subject, email.body, sent.id, sent.threadId, now),
  ]);
  return sent;
}
