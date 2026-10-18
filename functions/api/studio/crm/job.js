// One lead or job in the studio CRM.
//   GET  /api/studio/crm/job?id=12      the job, its client, its planned steps and its emails
//   PUT  /api/studio/crm/job            { id, ...fields } update the details Tony can edit
//   POST /api/studio/crm/job            add a client by hand (a phone, Facebook or walk-in enquiry):
//        { first_name, last_name, email, phone, partner_name, job_type, event_date, event_time, venue,
//          lead_source, notes, stage: 'lead'|'booked', workflow: true|false } → { id, clashes }
//        The same email as an existing client adds the job to them. workflow: start the job
//        type's workflow (a lead: its enquiry emails; booked: its planning steps); without it,
//        nothing is planned and nothing is sent.
// Marking a lead booked or lost stops any steps waiting on that ('booked' in stop_on).
import { json } from '../../../../functions-lib/studio.js';
import { sendMode } from '../../../../functions-lib/crm.js';
import { clashes, syncSoon, calendarReady } from '../../../../functions-lib/calendar.js';
import { planBooking, replanDates, planSteps, loadWorkflow } from '../../../../functions-lib/workflows.js';

const STAGES = ['lead', 'booked', 'completed', 'lost'];

export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: 'Which job?' }, 400);
  const job = await env.DB.prepare(
    `SELECT j.*, c.first_name, c.last_name, c.email, c.phone, c.address, c.ads_ok, c.notes AS client_notes
     FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = ?1`,
  ).bind(id).first();
  if (!job) return json({ error: 'That job doesn’t exist (it may have been deleted).' }, 404);
  const [steps, messages, others, quotes, contracts, invoices, questionnaires, qTemplates, qDefault, clash, appointments, gcal] = await Promise.all([
    env.DB.prepare('SELECT * FROM steps WHERE job_id = ?1 ORDER BY created_at, due_at, id').bind(id).all(),
    env.DB.prepare('SELECT id, direction, subject, body, sent_at, attachments, gmail_message_id FROM messages WHERE job_id = ?1 ORDER BY sent_at DESC').bind(id).all(),
    env.DB.prepare('SELECT id, title, job_type, stage, event_date FROM jobs WHERE client_id = ?1 AND id <> ?2 ORDER BY created_at DESC').bind(job.client_id, id).all(),
    env.DB.prepare('SELECT id, status, total, sent_at, viewed_at, accepted_at, created_at FROM quotes WHERE job_id = ?1 ORDER BY created_at DESC').bind(id).all(),
    env.DB.prepare('SELECT id, quote_id, name, status, sent_at, viewed_at, signed_name, signed_at FROM contracts WHERE job_id = ?1 ORDER BY id DESC').bind(id).all(),
    env.DB.prepare('SELECT id, contract_id, number, label, amount, due_date, send_at, status, sent_at, reminders, paid_at, paid_method, paid_note, token FROM invoices WHERE job_id = ?1 ORDER BY due_date, id').bind(id).all(),
    env.DB.prepare('SELECT id, name, status, token, created_at, updated_at, submitted_at FROM questionnaires WHERE job_id = ?1 ORDER BY id').bind(id).all(),
    env.DB.prepare('SELECT key, name FROM questionnaire_templates ORDER BY name').all(),
    env.DB.prepare(`SELECT questionnaire_key FROM lists WHERE kind = 'job_type' AND value = ?1`).bind(job.job_type).first(),
    clashes(env.DB, job.event_date, job.id),
    env.DB.prepare('SELECT id, title, date, start_time, end_time, location, notes FROM appointments WHERE job_id = ?1 ORDER BY date, start_time').bind(id).all(),
    calendarReady(env.DB),
  ]);
  return json({ mode: sendMode(env), job, steps: steps.results, messages: messages.results, otherJobs: others.results, quotes: quotes.results, contracts: contracts.results, invoices: invoices.results,
    questionnaires: questionnaires.results, questionnaireTemplates: qTemplates.results, defaultQuestionnaire: qDefault?.questionnaire_key ?? null,
    clashes: clash, appointments: appointments.results, googleCalendar: gcal });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const d = await request.json().catch(() => null);
  const id = Number(d?.id);
  if (!id) return json({ error: 'Which job?' }, 400);
  const job = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?1').bind(id).first();
  if (!job) return json({ error: 'That job doesn’t exist.' }, 404);
  const now = new Date().toISOString();
  const text = (v, max) => (v ?? '').toString().trim().slice(0, max);

  const jobFields = {
    title: d.title !== undefined ? text(d.title, 200) || job.title : job.title,
    job_type: d.job_type !== undefined ? text(d.job_type, 60) : job.job_type,
    stage: STAGES.includes(d.stage) ? d.stage : job.stage,
    partner_name: d.partner_name !== undefined ? text(d.partner_name, 200) : job.partner_name,
    event_date: d.event_date !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(d.event_date) ? d.event_date : null) : job.event_date,
    event_time: d.event_time !== undefined ? (/^([01]\d|2[0-3]):[0-5]\d$/.test(d.event_time) ? d.event_time : null) : job.event_time,
    venue: d.venue !== undefined ? text(d.venue, 200) : job.venue,
    lead_source: d.lead_source !== undefined ? text(d.lead_source, 60) : job.lead_source,
    notes: d.notes !== undefined ? text(d.notes, 20000) : job.notes,
  };
  const stmts = [
    env.DB.prepare(
      `UPDATE jobs SET title = ?2, job_type = ?3, stage = ?4, partner_name = ?5, event_date = ?6, venue = ?7, lead_source = ?8, notes = ?9, event_time = ?11,
         booked_at = CASE WHEN ?4 = 'booked' AND booked_at IS NULL THEN ?10 ELSE booked_at END,
         lost_at = CASE WHEN ?4 = 'lost' AND lost_at IS NULL THEN ?10 ELSE lost_at END,
         updated_at = ?10 WHERE id = ?1`,
    ).bind(id, jobFields.title, jobFields.job_type, jobFields.stage, jobFields.partner_name, jobFields.event_date, jobFields.venue, jobFields.lead_source, jobFields.notes, now, jobFields.event_time),
  ];
  // Client details (name, email, phone) live on the client.
  if (d.first_name !== undefined || d.last_name !== undefined || d.email !== undefined || d.phone !== undefined || d.address !== undefined) {
    const c = await env.DB.prepare('SELECT * FROM clients WHERE id = ?1').bind(job.client_id).first();
    const email = d.email !== undefined ? text(d.email, 254).toLowerCase() : c.email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'That email address doesn’t look right.' }, 400);
    stmts.push(env.DB.prepare('UPDATE clients SET first_name = ?2, last_name = ?3, email = ?4, phone = ?5, address = ?7, updated_at = ?6 WHERE id = ?1')
      .bind(c.id, d.first_name !== undefined ? text(d.first_name, 100) || c.first_name : c.first_name, d.last_name !== undefined ? text(d.last_name, 100) : c.last_name, email, d.phone !== undefined ? text(d.phone, 40) : c.phone, now, d.address !== undefined ? text(d.address, 300) : c.address));
  }
  // Whether their photos can be used in ads (some contracts say no).
  if (d.ads_ok !== undefined) stmts.push(env.DB.prepare('UPDATE clients SET ads_ok = ?2, updated_at = ?3 WHERE id = ?1').bind(job.client_id, d.ads_ok ? 1 : 0, now));
  // Booked or lost: steps waiting on a booking stop.
  if ((jobFields.stage === 'booked' || jobFields.stage === 'lost') && job.stage !== jobFields.stage) {
    stmts.push(env.DB.prepare(
      `UPDATE steps SET status = 'skipped', note = ?2, done_at = ?3 WHERE job_id = ?1 AND status IN ('scheduled', 'due') AND (',' || stop_on || ',') LIKE '%,booked,%'`,
    ).bind(id, jobFields.stage === 'booked' ? 'Stopped: booked' : 'Stopped: not going ahead', now));
  }
  try {
    await env.DB.batch(stmts);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return json({ error: 'Another client already has that email address.' }, 409);
    throw e;
  }
  // Workflow: a booking plans its steps; a new date moves the ones timed from it.
  if (jobFields.stage === 'booked' && job.stage !== 'booked') await planBooking(env.DB, await env.DB.prepare('SELECT * FROM jobs WHERE id = ?1').bind(id).first());
  if (jobFields.event_date !== job.event_date) await replanDates(env.DB, id);
  syncSoon(context, id);
  return json({ ok: true });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const d = await request.json().catch(() => null);
  const text = (v, max) => (v ?? '').toString().trim().slice(0, max);
  const first = text(d?.first_name, 100);
  const email = text(d?.email, 254).toLowerCase();
  if (!first) return json({ error: 'Add their first name.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Add their email address (it’s how the studio sends them anything).' }, 400);
  const type = await env.DB.prepare(`SELECT value, workflow FROM lists WHERE kind = 'job_type' AND value = ?1`).bind(text(d.job_type, 60)).first();
  if (!type) return json({ error: 'Choose a job type.' }, 400);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d.event_date || '') ? d.event_date : null;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(d.event_time || '') ? d.event_time : null;
  const stage = d.stage === 'booked' ? 'booked' : 'lead';
  const now = new Date();
  const at = now.toISOString();
  const last = text(d.last_name, 100);
  const client = await env.DB.prepare(
    `INSERT INTO clients (first_name, last_name, email, phone, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT (lower(email)) DO UPDATE SET phone = CASE WHEN excluded.phone <> '' THEN excluded.phone ELSE clients.phone END, updated_at = excluded.updated_at
     RETURNING id, first_name, last_name`,
  ).bind(first, last, email, text(d.phone, 40), at).first();
  const workflow = (await loadWorkflow(env.DB, type.workflow)) ? type.workflow : null;
  const job = await env.DB.prepare(
    `INSERT INTO jobs (client_id, title, job_type, stage, partner_name, event_date, event_time, venue, lead_source, notes, workflow, booked_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13) RETURNING *`,
  ).bind(client.id, `${client.first_name} ${client.last_name}`.trim(), type.value, stage, text(d.partner_name, 200), date, time, text(d.venue, 200), text(d.lead_source, 60), text(d.notes, 20000), workflow, stage === 'booked' ? at : null, at).first();
  if (d.workflow && workflow) {
    if (stage === 'booked') await planBooking(env.DB, job);
    else await planSteps(env.DB, job, ['enquiry'], { base: now });
  }
  const clash = await clashes(env.DB, date, job.id);
  syncSoon(context, job.id);
  return json({ ok: true, id: job.id, clashes: clash });
}
