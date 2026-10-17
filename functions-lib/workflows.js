// Workflows (Settings > Workflows; table `workflows`, migrations/0017_crm_workflows.sql). Each job
// type chooses one (lists.workflow). A workflow is a list of steps:
//   { id, title, kind, template?, when, days?, hours?, after_step?, stop_on?, questionnaire?, gallery? }
//   kind: auto_email (sends itself) | ready_email (Tony reviews and sends) | todo
//   when: enquiry  – after the enquiry arrives (days/hours)
//         booked   – after they book (quote accepted, or marked booked)
//         deposit  – after the first payment
//         before   – days before the wedding/shoot date (9am NZ)
//         after    – days after the wedding/shoot date (9am NZ)
//         step     – days after another step (after_step) is done or sent
//         manual   – when Tony's ready: a button on the client page (e.g. "Practice photos ready")
//   stop_on: 'reply', 'booked' or both: stops while it's still waiting
//   questionnaire: the questionnaire this email sends ({{questionnaire_link}})
//   gallery: the email needs a gallery link, asked for when Tony sends it ({{gallery_link}})
// Planned steps are rows in `steps` (step_key = workflow-key + '-' + step id, so nothing is planned
// twice), with a copy of their rule in steps.config. Contracts and invoices are built in (quote.js,
// contract.js, invoices.js), not workflow steps.

export const WHEN = {
  enquiry: 'After the enquiry', booked: 'After they book', deposit: 'After the first payment',
  before: 'Before the date', after: 'After the date', step: 'After another step', manual: 'When you’re ready (a button)',
};
export const KINDS = { auto_email: 'Automatic email', ready_email: 'Email you review and send', todo: 'To-do' };
export const MANUAL_DUE = '9999-01-01T00:00:00.000Z';
const HOUR = 3600_000; const DAY = 24 * HOUR;
const text = (v, max) => (v ?? '').toString().trim().slice(0, max);

export async function loadWorkflow(db, key) {
  if (!key) return null;
  const row = await db.prepare('SELECT * FROM workflows WHERE key = ?1').bind(key).first();
  return row ? { key: row.key, name: row.name, steps: JSON.parse(row.steps) } : null;
}

/** A workflow's steps, checked and tidied (Settings). templates/questionnaires: the keys that exist. */
export function cleanSteps(list, templates, questionnaires) {
  if (!Array.isArray(list)) throw new Error('The steps are missing.');
  const ids = new Set();
  const out = list.slice(0, 80).map((x, i) => {
    const title = text(x.title, 120);
    if (!title) throw new Error(`Step ${i + 1} needs a name.`);
    const kind = KINDS[x.kind] ? x.kind : 'todo';
    const when = WHEN[x.when] ? x.when : 'enquiry';
    let id = /^[a-z0-9-]{1,50}$/.test(x.id || '') && !ids.has(x.id) ? x.id : '';
    if (!id) { id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'step'; for (let n = 2; ids.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`; }
    ids.add(id);
    const s = { id, title, kind, when };
    if (kind !== 'todo') {
      if (!templates.includes(x.template)) throw new Error(`“${title}” needs an email template.`);
      s.template = x.template;
      if (x.questionnaire) { if (!questionnaires.includes(x.questionnaire)) throw new Error(`“${title}”: that questionnaire no longer exists.`); s.questionnaire = x.questionnaire; }
      if (x.gallery) s.gallery = true;
    }
    if (when !== 'manual') {
      const days = Math.max(0, Math.min(730, Math.round(Number(x.days) || 0)));
      const hours = when === 'enquiry' ? Math.max(0, Math.min(72, Math.round(Number(x.hours) || 0))) : 0;
      if (days) s.days = days;
      if (hours) s.hours = hours;
    }
    if (when === 'step') s.after_step = text(x.after_step, 50);
    const stops = ['reply', 'booked'].filter((k) => String(x.stop_on || '').includes(k));
    if (stops.length) s.stop_on = stops.join(',');
    return s;
  });
  for (const s of out) if (s.when === 'step' && !out.some((o) => o.id === s.after_step && o !== s)) throw new Error(`“${s.title}” follows a step that isn’t in this workflow.`);
  return out;
}

/** A date at 9am New Zealand time, as a moment (handles daylight saving). */
export function nzNine(date) {
  const guess = new Date(`${date}T09:00:00Z`);
  const nz = new Date(guess.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.valueOf() - (nz - utc));
}

/** When a step is due, or null if it can't be worked out yet (e.g. no wedding date). */
export function dueFor(s, job, base = new Date()) {
  const offset = (s.days || 0) * DAY + (s.hours || 0) * HOUR;
  if (s.when === 'manual') return MANUAL_DUE;
  if (s.when === 'before' || s.when === 'after') {
    if (!job.event_date) return null;
    return new Date(nzNine(job.event_date).valueOf() + (s.when === 'before' ? -offset : offset)).toISOString();
  }
  return new Date(base.valueOf() + offset).toISOString();
}

/**
 * Plan a job's steps for the given moments (e.g. ['enquiry'], ['booked', 'before', 'after',
 * 'manual'], ['deposit'], or after a step: ['step'] with afterStep). Steps already planned are
 * left alone. A step whose time has already passed (e.g. a late booking) is added as skipped, so
 * Tony can see it and bring it back if he wants it.
 */
export async function planSteps(db, job, moments, { base = new Date(), afterStep = null } = {}) {
  const wf = await loadWorkflow(db, job.workflow);
  if (!wf) return 0;
  const now = new Date().toISOString();
  const stmts = [];
  for (const s of wf.steps) {
    if (!moments.includes(s.when)) continue;
    if (s.when === 'step' && s.after_step !== afterStep) continue;
    const due = dueFor(s, job, base);
    if (!due) continue;
    const late = ['before', 'after'].includes(s.when) && due < new Date(Date.now() - DAY).toISOString();
    stmts.push(db.prepare(
      `INSERT OR IGNORE INTO steps (job_id, step_key, kind, title, template_key, due_at, stop_on, status, done_at, note, config, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    ).bind(job.id, `${wf.key}-${s.id}`, s.kind, s.title, s.template ?? null, due, s.stop_on ?? '', late ? 'skipped' : 'scheduled', late ? now : null,
      late ? 'Its time had passed when this was planned' : '', JSON.stringify(s), now));
  }
  if (stmts.length) await db.batch(stmts);
  return stmts.length;
}

/** Everything that hangs off a booking (and the wedding/shoot date). */
export const planBooking = (db, job) => planSteps(db, job, ['booked', 'before', 'after', 'manual']);

/** After a step is done or sent: plan the steps that follow it. */
export async function planAfter(db, jobId, stepKey) {
  const job = await db.prepare('SELECT * FROM jobs WHERE id = ?1').bind(jobId).first();
  const wf = job && await loadWorkflow(db, job.workflow);
  if (!wf || !stepKey.startsWith(`${wf.key}-`)) return 0;
  return planSteps(db, job, ['step'], { afterStep: stepKey.slice(wf.key.length + 1) });
}

/** The wedding/shoot date changed: move the waiting steps timed from it, and plan any now possible. */
export async function replanDates(db, jobId) {
  const job = await db.prepare('SELECT * FROM jobs WHERE id = ?1').bind(jobId).first();
  if (!job) return;
  const open = (await db.prepare(`SELECT id, config FROM steps WHERE job_id = ?1 AND status IN ('scheduled', 'due') AND config IS NOT NULL`).bind(jobId).all()).results;
  const stmts = [];
  for (const st of open) {
    const s = JSON.parse(st.config);
    if (s.when !== 'before' && s.when !== 'after') continue;
    const due = dueFor(s, job);
    if (due) stmts.push(db.prepare('UPDATE steps SET due_at = ?2 WHERE id = ?1').bind(st.id, due));
  }
  if (stmts.length) await db.batch(stmts);
  if (['booked', 'completed'].includes(job.stage)) await planBooking(db, job);
}

/** A planned step's rule (from steps.config). */
export const ruleOf = (step) => (step?.config ? JSON.parse(step.config) : {});
