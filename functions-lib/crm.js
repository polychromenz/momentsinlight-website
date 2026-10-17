// Shared bits for the studio CRM (the Studio Ninja replacement): workflows, planning a job's
// steps, and alert emails to Tony. Data lives in the site's D1 database (bound as DB); see
// migrations/0002_crm.sql and docs/studio-crm-wedding-workflow.md.

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Workflows: the steps planned for a new enquiry, by job type. Times are from the enquiry.
 *  (Steps timed from the wedding date are added when a job is booked, in a later phase.) */
export const WORKFLOWS = {
  wedding: {
    jobTypes: ['Wedding'],
    enquiry: [
      { key: 'wedding-01-enquiry-response', kind: 'auto_email', title: '01 Enquiry response', template: 'wedding-01-enquiry-response', after: 1 * HOUR },
      { key: 'wedding-02-follow-up', kind: 'ready_email', title: '02 Follow-up', template: 'wedding-02-follow-up', after: 4 * DAY, stopOn: 'reply,booked' },
      { key: 'wedding-03-final-follow-up', kind: 'ready_email', title: '03 Final follow-up', template: 'wedding-03-final-follow-up', after: 10 * DAY, stopOn: 'reply,booked' },
    ],
  },
};

/** Which workflow a job type follows, or null (portraits, headshots etc. come later). */
export const workflowFor = (jobType) => Object.entries(WORKFLOWS).find(([, w]) => w.jobTypes.includes(jobType))?.[0] ?? null;

/** Plan a new enquiry's steps. Without a workflow, Tony gets a "reply to this enquiry" to-do. */
export async function planEnquirySteps(db, jobId, workflow, now = new Date()) {
  const steps = workflow ? WORKFLOWS[workflow].enquiry
    : [{ key: 'reply-to-enquiry', kind: 'todo', title: 'Reply to this enquiry', after: 0 }];
  const created = now.toISOString();
  await db.batch(steps.map((s) => db.prepare(
    `INSERT OR IGNORE INTO steps (job_id, step_key, kind, title, template_key, due_at, stop_on, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).bind(jobId, s.key, s.kind, s.title, s.template ?? null, new Date(now.valueOf() + s.after).toISOString(), s.stopOn ?? '', created)));
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** An alert email to Tony through Resend (system messages; client emails go through Gmail).
 *  Never throws: an alert failing mustn't lose the enquiry. */
export async function alertTony(env, subject, rows, link) {
  if (!env.RESEND_API_KEY) { console.error('crm: RESEND_API_KEY not set; alert not sent:', subject); return false; }
  const html = `<div style="font-family:Raleway,Arial,sans-serif;color:#1a1a1a;max-width:560px">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#5a5e3b">Moments Studio</p>
<h1 style="margin:0 0 16px;font-size:24px;font-weight:300">${esc(subject)}</h1>
<table cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.6">${rows.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#777;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>
${link ? `<p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:11px 20px;background:#5a5e3b;color:#fff;text-decoration:none;border-radius:12px 0;font-size:14px">Open in the studio</a></p>` : ''}
</div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'Moments Studio <reports@momentsinlight.co.nz>', to: ['tony@momentsinlight.co.nz'], subject, html }),
    });
    if (!r.ok) console.error('crm: alert failed', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('crm: alert failed', e);
    return false;
  }
}
