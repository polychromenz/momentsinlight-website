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
import { xero, xeroConnection, settledShare } from '../../../../functions-lib/xero.js';

// Studio Ninja sent its invoices to Xero too: one Xero invoice for the whole booking, paid in parts,
// where the studio has an invoice per instalment. Each imported unpaid instalment is linked to that
// Xero invoice (found by number, else by the client: the one for the booking's total, or one with at
// least this much owing). What Xero says is still owing decides which instalments are already paid
// (settledShare): those are marked paid at the switch, and reconciling one later stops the studio's
// reminders (checkPaidInXero), as Studio Ninja did.
async function findInXero(env, inv) {
  const ok = (x) => x.Type === 'ACCREC' && !['DELETED', 'VOIDED', 'DRAFT'].includes(x.Status);
  const pick = (x) => ({ id: x.InvoiceID, number: x.InvoiceNumber, status: x.Status, owing: Math.round((x.AmountDue ?? 0) * 100), total: Math.round((x.Total ?? 0) * 100) });
  const bare = inv.number.replace(/^SN-/, ''), base = bare.replace(/-\d+$/, '');
  const nums = [...new Set([inv.number, bare, base, `SN-${base}`])];
  const byNo = (await xero(env, 'GET', `/Invoices?InvoiceNumbers=${nums.map(encodeURIComponent).join(',')}&summaryOnly=true`)).Invoices?.filter(ok) ?? [];
  if (byNo.length) return pick(byNo[0]);
  const name = `${inv.first_name} ${inv.last_name}`.trim();
  const contacts = (await xero(env, 'GET', `/Contacts?searchTerm=${encodeURIComponent(name)}&summaryOnly=true`)).Contacts ?? [];
  if (!contacts.length) return null;
  const list = (await xero(env, 'GET', `/Invoices?ContactIDs=${contacts.slice(0, 5).map((c) => c.ContactID).join(',')}&Statuses=AUTHORISED,PAID&summaryOnly=true`)).Invoices?.filter(ok) ?? [];
  const cents = (v) => Math.round((v ?? 0) * 100);
  const hit = list.find((x) => cents(x.Total) === inv.job_total) ?? list.find((x) => cents(x.Total) === inv.amount)
    ?? list.find((x) => x.Status === 'AUTHORISED' && cents(x.AmountDue) >= inv.amount);
  return hit ? pick(hit) : null;
}
async function xeroMatches(env, invoices) {
  if (!(await xeroConnection(env.DB))?.refresh) return { error: 'Xero isn’t connected, so these couldn’t be looked up there.' };
  const out = {};
  try {
    // One lookup per booking: its instalments share the Xero invoice.
    const byJob = new Map();
    for (const inv of invoices) {
      if (!byJob.has(inv.job_id)) byJob.set(inv.job_id, await findInXero(env, inv));
      out[inv.id] = byJob.get(inv.job_id);
    }
  } catch (e) { return { error: `Xero lookup stopped: ${e.message}` }; }
  // Which instalments Xero shows as paid already.
  for (const [jobId, x] of new Map(invoices.map((i) => [i.job_id, out[i.id]]))) {
    if (!x) continue;
    const paid = new Set(settledShare(invoices.filter((i) => i.job_id === jobId), { Status: x.status, AmountDue: x.owing / 100 }).map((i) => i.id));
    for (const i of invoices.filter((r) => r.job_id === jobId)) out[i.id] = { ...x, paid: paid.has(i.id) };
  }
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
const heldInvoices = async (db) => (await db.prepare(`SELECT i.id, i.job_id, i.number, i.label, i.amount, i.status, i.due_date, i.send_at, i.xero_invoice_id, j.title, c.first_name, c.last_name,
      (SELECT sum(amount) FROM invoices x WHERE x.job_id = i.job_id AND x.status <> 'group') job_total
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
      if (x.paid) {
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
