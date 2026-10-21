// Switching over from Studio Ninja (Settings > Studio Ninja, step 4): the imported jobs come off hold
// (jobs.hold, migration 0028), so the studio takes over from here: invoice reminders (on the due date
// and three days late, with the studio's Stripe link), invoices waiting to be sent, Google Calendar,
// and for booked couples the wedding workflow's steps that are still ahead (anything whose time has
// passed is skipped, so nobody gets a burst of emails). Tony turns Studio Ninja's own reminders and
// workflows off the same day.
//   GET  /api/studio/crm/sn-switch                       -> what would happen (or when it was done)
//   POST /api/studio/crm/sn-switch { action: 'switch' }  do it
import { json } from '../../../../functions-lib/studio.js';
import { loadWorkflow, dueFor, planSteps } from '../../../../functions-lib/workflows.js';
import { xero, xeroConnection } from '../../../../functions-lib/xero.js';

// Studio Ninja sent its invoices to Xero too. Each imported unpaid invoice is found there (by its number,
// else by the client and amount), so the studio links to it: one already paid in Xero (a bank transfer
// Tony reconciled) is marked paid at the switch, and reconciling one later stops the studio's reminders
// (functions-lib/xero.js checkPaidInXero), as Studio Ninja did.
async function findInXero(env, inv) {
  const ok = (x) => x.Type === 'ACCREC' && !['DELETED', 'VOIDED', 'DRAFT'].includes(x.Status);
  const pick = (x) => ({ id: x.InvoiceID, number: x.InvoiceNumber, status: x.Status, due: x.AmountDue });
  const nums = [...new Set([inv.number, inv.number.replace(/^SN-/, '')])];
  const byNo = (await xero(env, 'GET', `/Invoices?InvoiceNumbers=${nums.map(encodeURIComponent).join(',')}&summaryOnly=true`)).Invoices?.filter(ok) ?? [];
  if (byNo.length) return pick(byNo[0]);
  const name = `${inv.first_name} ${inv.last_name}`.trim();
  const contacts = (await xero(env, 'GET', `/Contacts?searchTerm=${encodeURIComponent(name)}&summaryOnly=true`)).Contacts ?? [];
  if (!contacts.length) return null;
  const list = (await xero(env, 'GET', `/Invoices?ContactIDs=${contacts.slice(0, 5).map((c) => c.ContactID).join(',')}&Statuses=AUTHORISED,PAID&summaryOnly=true`)).Invoices?.filter(ok) ?? [];
  const same = list.filter((x) => Math.round(x.Total * 100) === inv.amount);
  if (!same.length) return null;
  // Two the same amount: the one due nearest this invoice's date.
  const day = (x) => Math.abs(Date.parse(String(x.DueDateString ?? x.DateString ?? '').slice(0, 10)) - Date.parse(inv.due_date ?? inv.send_at ?? ''));
  return pick(same.sort((a, b) => day(a) - day(b))[0]);
}
async function xeroMatches(env, invoices) {
  if (!(await xeroConnection(env.DB))?.refresh) return { error: 'Xero isn’t connected, so these couldn’t be looked up there.' };
  const out = {};
  try { for (const inv of invoices) out[inv.id] = await findInXero(env, inv); }
  catch (e) { return { error: `Xero lookup stopped: ${e.message}` }; }
  return out;
}

const DAY = 86400_000;
const nzDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const plus = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const MOMENTS = ['before', 'after', 'manual'];

async function preview(env) {
  const db = env.DB;
  const held = (await db.prepare(`SELECT stage, count(*) n FROM jobs WHERE hold = 1 GROUP BY stage`).all()).results;
  const rows = await heldInvoices(db);
  const found = await xeroMatches(env, rows);
  const invoices = rows.map(({ first_name, last_name, ...i }) => ({ ...i, reminder: i.status === 'sent' && i.due_date ? i.due_date : null, late: i.status === 'sent' && i.due_date ? plus(i.due_date, 3) : null,
    send: i.status === 'scheduled' && i.send_at ? nzDay(i.send_at) : null, xero: found.error ? undefined : found[i.id] ?? null }));
  const booked = (await db.prepare(`SELECT * FROM jobs WHERE hold = 1 AND stage = 'booked' ORDER BY event_date`).all()).results;
  const couples = [];
  for (const job of booked) {
    const wf = await loadWorkflow(db, job.workflow);
    const steps = [];
    let skipped = 0;
    for (const s of wf?.steps ?? []) {
      if (!MOMENTS.includes(s.when)) continue;
      const due = dueFor(s, job);
      if (!due) continue;
      if (['before', 'after'].includes(s.when) && due < new Date(Date.now() - DAY).toISOString()) { skipped++; continue; }
      steps.push({ title: s.title, kind: s.kind, due: s.when === 'manual' ? null : nzDay(due) });
    }
    couples.push({ title: job.title, event_date: job.event_date, steps: steps.sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9')), skipped });
  }
  return { held, invoices, couples, xero_error: found.error ?? null };
}
const heldInvoices = async (db) => (await db.prepare(`SELECT i.id, i.number, i.label, i.amount, i.status, i.due_date, i.send_at, i.xero_invoice_id, j.title, c.first_name, c.last_name
    FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN clients c ON c.id = j.client_id
    WHERE j.hold = 1 AND i.status IN ('sent', 'scheduled') ORDER BY COALESCE(i.due_date, i.send_at)`).all()).results;

export async function onRequestGet({ env }) {
  const done = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'sn_switch'`).first();
  return json({ done: done ? JSON.parse(done.value) : null, ...(await preview(env)) });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const d = await request.json().catch(() => ({}));
  if (d.action !== 'switch') return json({ error: 'What should happen?' }, 400);
  const booked = (await db.prepare(`SELECT * FROM jobs WHERE hold = 1 AND stage = 'booked'`).all()).results;
  if (!booked.length && !(await db.prepare('SELECT 1 FROM jobs WHERE hold = 1 LIMIT 1').first())) return json({ error: 'There’s nothing on hold: it’s already switched over.' }, 400);
  // Link the invoices to Studio Ninja's copies in Xero; any already paid there are marked paid quietly
  // (no receipt: the couple paid weeks ago).
  const rows = await heldInvoices(db);
  const found = await xeroMatches(env, rows);
  let linked = 0, paidInXero = 0;
  if (!found.error) {
    const now0 = new Date().toISOString();
    for (const inv of rows) {
      const x = found[inv.id];
      if (!x) continue;
      linked++;
      if (x.status === 'PAID') {
        paidInXero++;
        await db.prepare(`UPDATE invoices SET xero_invoice_id = ?2, xero_payment_id = 'xero', status = 'paid', paid_at = ?3, paid_method = 'bank', paid_note = 'Paid in Xero before the switch from Studio Ninja' WHERE id = ?1`).bind(inv.id, x.id, now0).run();
      } else await db.prepare('UPDATE invoices SET xero_invoice_id = ?2 WHERE id = ?1').bind(inv.id, x.id).run();
    }
  }
  // The wedding workflow's steps still ahead (planSteps skips any whose time has passed).
  let planned = 0;
  for (const job of booked) planned += await planSteps(db, job, MOMENTS);
  const now = new Date().toISOString();
  const r = await db.batch([
    // Past and lost jobs needn't go into the studio's Google Calendar: mark them as already in step.
    db.prepare(`UPDATE jobs SET gcal_synced_at = ?1 WHERE hold = 1 AND stage IN ('completed', 'lost')`).bind(now),
    db.prepare(`UPDATE jobs SET hold = 0, updated_at = ?1 WHERE hold = 1`).bind(now),
  ]);
  const jobs = r[1].meta.changes;
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('sn_switch', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify({ at: now, jobs, planned, linked, paid_in_xero: paidInXero }), now).run();
  return json({ jobs, planned, linked, paid_in_xero: paidInXero, xero_error: found.error ?? null });
}
