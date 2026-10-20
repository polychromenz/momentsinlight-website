// A new enquiry becoming a lead: the client and the job in the CRM tables, the workflow's first
// steps (the automatic reply and the follow-ups), and an alert to Tony. Used by the enquiry form
// (functions/api/enquiry.js) and by "Not spam" in the studio (functions/api/studio/crm/spam.js).
import { planEnquirySteps, alertTony, tidyName } from './crm.js';
import { loadWorkflow } from './workflows.js';
import { clashes, clashText, syncSoon } from './calendar.js';

/** f = { first, last, email, phone, service, date, venue, message, source }. Returns the job id.
 *  context = the Pages Function context (for env and waitUntil); origin = the site's address for links. */
export async function createLead(context, f, origin, note = '') {
  f = { ...f, first: tidyName(f.first), last: tidyName(f.last) }; // "jane smith" from a form as "Jane Smith"
  const { env } = context;
  // The job type must be one from the studio's list (Settings); it decides the workflow.
  const type = await env.DB.prepare(`SELECT value, workflow FROM lists WHERE kind = 'job_type' AND value = ?1`).bind(f.service).first().catch(() => null);
  if (!type) throw Object.assign(new Error('Please choose which service you’re interested in.'), { status: 400 });
  const workflow = (await loadWorkflow(env.DB, type.workflow)) ? type.workflow : null;
  const now = new Date();
  const at = now.toISOString();
  let jobId;
  // One client per email address: a repeat enquiry updates their name and phone.
  const client = await env.DB.prepare(
    `INSERT INTO clients (first_name, last_name, email, phone, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT (lower(email)) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name,
       phone = CASE WHEN excluded.phone <> '' THEN excluded.phone ELSE clients.phone END, updated_at = excluded.updated_at
     RETURNING id`,
  ).bind(f.first, f.last, f.email, f.phone, at).first();
  // Sent twice (a double click, or a second thought within a day)? Update that lead instead
  // of starting another one, and keep its planned steps.
  const recent = await env.DB.prepare(
    `SELECT id FROM jobs WHERE client_id = ?1 AND stage = 'lead' AND job_type = ?2 AND created_at > ?3 ORDER BY id DESC LIMIT 1`,
  ).bind(client.id, f.service, new Date(now.valueOf() - 86400_000).toISOString()).first();
  if (recent) {
    jobId = recent.id;
    await env.DB.prepare(
      `UPDATE jobs SET event_date = ?2, venue = ?3, lead_source = CASE WHEN ?4 <> '' THEN ?4 ELSE lead_source END,
         message = CASE WHEN ?5 <> '' AND ?5 <> message THEN trim(message || char(10) || char(10) || ?5) ELSE message END, updated_at = ?6
       WHERE id = ?1`,
    ).bind(jobId, f.date, f.venue, f.source, f.message, at).run();
  } else {
    const job = await env.DB.prepare(
      `INSERT INTO jobs (client_id, title, job_type, event_date, venue, lead_source, message, workflow, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9) RETURNING id`,
    ).bind(client.id, `${f.first} ${f.last}`, f.service, f.date, f.venue, f.source, f.message, workflow, at).first();
    jobId = job.id;
    await planEnquirySteps(env.DB, jobId, workflow, now);
  }

  const nzDate = new Date(`${f.date}T12:00:00Z`).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  // Is the date already taken (booked), or wanted by another lead?
  const clash = await clashes(env.DB, f.date, jobId).catch(() => []);
  const booked = clash.some((c) => c.stage === 'booked');
  await alertTony(env, `${clash.length ? (booked ? '⚠ Date already booked · ' : '⚠ Date clash · ') : ''}New ${f.service.toLowerCase()} enquiry: ${f.first} ${f.last}`, [
    ...(note ? [['Note', note]] : []),
    ...(clash.length ? [['⚠ Date clash', clashText(clash)]] : []),
    ['Name', `${f.first} ${f.last}`], ['Email', f.email], ['Phone', f.phone], ['Service', f.service], ['Date', nzDate],
    ['Venue', f.venue], ['Heard via', f.source], ['Message', f.message],
    ['Next', workflow ? 'Enquiry response (01) goes automatically in about an hour.' : 'No workflow for this type yet: reply from the studio.'],
  ], new URL(`/studio/crm/job?id=${jobId}`, origin).href);
  syncSoon(context, jobId);
  return jobId;
}
