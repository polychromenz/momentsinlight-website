// Shared bits for the studio CRM (the Studio Ninja replacement): workflows, planning a job's
// steps, and alert emails to Tony. Data lives in the site's D1 database (bound as DB); see
// migrations/0002_crm.sql and docs/studio-crm-wedding-workflow.md. Workflows: functions-lib/workflows.js.
import { planSteps } from './workflows.js';

// ---- Test mode: the safety lock on client emails ----
// Until Tony switches the CRM on for real (Cloudflare setting CRM_SEND_MODE = "live", set by
// Tony on switch-over day), every client email is redirected to him instead, with a note saying
// who it would have gone to. Missing or any other value = test mode. EVERY client email must go
// through outgoing() below; nothing else may choose a recipient.
export const SAFE_RECIPIENTS = ['tony@momentsinlight.co.nz', 'polychromenz@gmail.com'];

export const sendMode = (env) => (env.CRM_SEND_MODE === 'live' ? 'live' : 'test');

/** The email as it will really be sent: unchanged in live mode (or to a safe address); in test
 *  mode, anything for anyone else goes to Tony with "TEST" on it. */
export function outgoing(env, { to, subject, html }, newClient = false) {
  const intended = String(to ?? '').trim().toLowerCase();
  if (sendMode(env) === 'live' || SAFE_RECIPIENTS.includes(intended) || newClient) return { to: intended, subject, html, redirected: false, intended };
  const note = `<div style="margin:0 0 16px;padding:12px 16px;background:#fff4d6;border:1px solid #e0c46c;border-radius:10px 0;font-family:Arial,sans-serif;font-size:14px;color:#5c4400">
<strong>TEST MODE</strong>: this email would have gone to <strong>${intended.replace(/[<>&"]/g, '')}</strong>. The studio is in test mode, so it came to you instead.</div>`;
  return { to: SAFE_RECIPIENTS[0], subject: `[TEST → ${intended}] ${subject}`, html: html.includes('<body') ? html.replace(/<body([^>]*)>/, `<body$1>${note}`) : note + html, redirected: true, intended };
}


/**
 * "New enquiries live" (Settings, switched on by Tony): while the rest of the studio is in test
 * mode, emails to a client may go to them for real only if they first enquired after the switch
 * was turned on, and aren't from the Studio Ninja import. Everyone else still comes to Tony.
 * Pass the result to outgoing() as `newClient`.
 */
export async function liveForNew(env, to) {
  const email = String(to ?? '').trim().toLowerCase();
  if (!email || sendMode(env) === 'live') return false;
  const on = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'send_new_live'`).first();
  const since = on && JSON.parse(on.value).on ? JSON.parse(on.value).since : null;
  if (!since) return false;
  const c = await env.DB.prepare(`SELECT created_at, import_batch FROM clients WHERE lower(email) = ?1`).bind(email).first();
  if (!c || c.import_batch || c.created_at < since) return false;
  // Never anyone with history from before the switch (e.g. an older enquiry under the same email).
  const old = await env.DB.prepare(`SELECT 1 FROM jobs j JOIN clients c ON c.id = j.client_id WHERE lower(c.email) = ?1 AND (j.import_batch IS NOT NULL OR j.created_at < ?2) LIMIT 1`).bind(email, since).first();
  return !old;
}

/** Plan a new enquiry's steps from its workflow (Settings > Workflows; functions-lib/workflows.js).
 *  Without a workflow, Tony gets a "reply to this enquiry" to-do. */
export async function planEnquirySteps(db, jobId, workflow, now = new Date()) {
  const job = await db.prepare('SELECT * FROM jobs WHERE id = ?1').bind(jobId).first();
  if (workflow && await planSteps(db, job, ['enquiry'], { base: now })) return;
  await db.prepare(`INSERT OR IGNORE INTO steps (job_id, step_key, kind, title, due_at, created_at) VALUES (?1, 'reply-to-enquiry', 'todo', 'Reply to this enquiry', ?2, ?2)`)
    .bind(jobId, now.toISOString()).run();
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** An alert email to Tony through Resend (system messages; client emails go through Gmail).
 *  Never throws: an alert failing mustn't lose the enquiry. */
export async function alertTony(env, subject, rows, link, attachments = []) {
  if (!env.RESEND_API_KEY) { console.error('crm: RESEND_API_KEY not set; alert not sent:', subject); return false; }
  const html = `<div style="font-family:Raleway,Arial,sans-serif;color:#1a1a1a;max-width:560px">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#5a5e3b">Moments Studio</p>
<h1 style="margin:0 0 16px;font-size:24px;font-weight:300">${esc(subject)}</h1>
<table cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.6">${rows.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#777;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>
${link ? `<p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:11px 20px;background:#5a5e3b;color:#fff;text-decoration:none;border-radius:12px 0;font-size:14px">Open in the studio</a></p>` : ''}
</div>`;
  return emailTony(env, subject, html, attachments);
}

/** An email to Tony from the studio (alerts, the morning email) through Resend. Never throws. */
export async function emailTony(env, subject, html, attachments = []) {
  if (!env.RESEND_API_KEY) { console.error('crm: RESEND_API_KEY not set; email to Tony not sent:', subject); return false; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'Moments Studio <reports@momentsinlight.co.nz>', to: ['tony@momentsinlight.co.nz'], subject, html,
        ...(attachments.length ? { attachments: attachments.map((a) => ({ filename: a.name, content: a.base64 })) } : {}) }),
    });
    if (!r.ok) console.error('crm: email to Tony failed', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('crm: email to Tony failed', e);
    return false;
  }
}
