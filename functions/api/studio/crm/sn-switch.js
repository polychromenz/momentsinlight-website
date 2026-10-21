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

const DAY = 86400_000;
const nzDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const plus = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const MOMENTS = ['before', 'after', 'manual'];

async function preview(db) {
  const held = (await db.prepare(`SELECT stage, count(*) n FROM jobs WHERE hold = 1 GROUP BY stage`).all()).results;
  const invoices = (await db.prepare(`SELECT i.number, i.label, i.amount, i.status, i.due_date, i.send_at, j.title FROM invoices i JOIN jobs j ON j.id = i.job_id
      WHERE j.hold = 1 AND i.status IN ('sent', 'scheduled') ORDER BY COALESCE(i.due_date, i.send_at)`).all()).results
    .map((i) => ({ ...i, reminder: i.status === 'sent' && i.due_date ? i.due_date : null, late: i.status === 'sent' && i.due_date ? plus(i.due_date, 3) : null, send: i.status === 'scheduled' && i.send_at ? nzDay(i.send_at) : null }));
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
  return { held, invoices, couples };
}

export async function onRequestGet({ env }) {
  const done = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'sn_switch'`).first();
  return json({ done: done ? JSON.parse(done.value) : null, ...(await preview(env.DB)) });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const d = await request.json().catch(() => ({}));
  if (d.action !== 'switch') return json({ error: 'What should happen?' }, 400);
  const booked = (await db.prepare(`SELECT * FROM jobs WHERE hold = 1 AND stage = 'booked'`).all()).results;
  if (!booked.length && !(await db.prepare('SELECT 1 FROM jobs WHERE hold = 1 LIMIT 1').first())) return json({ error: 'There’s nothing on hold: it’s already switched over.' }, 400);
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
    .bind(JSON.stringify({ at: now, jobs, planned }), now).run();
  return json({ jobs, planned });
}
