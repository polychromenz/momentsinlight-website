// Cloudflare Pages Function: the new enquiry form (POST /api/enquiry, from
// src/components/page/EnquiryForm.astro, tested on /newcontact). Saves the client and the lead
// in the CRM tables, plans the workflow's first steps (the automatic reply and the follow-ups)
// and emails Tony an alert. Answers in JSON for the form's script.
//
// Spam protection as on the guide signup: a hidden "website" field bots fill in, plus
// Cloudflare Turnstile when TURNSTILE_SECRET_KEY is set.
import { planEnquirySteps, alertTony, WORKFLOWS } from '../../functions-lib/crm.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  let form;
  try { form = await request.formData(); } catch { return reply({ error: 'Sorry, that didn’t come through. Please try again.' }, 400); }

  // Bots fill in every field, including this hidden one. Pretend it worked.
  if ((form.get('website') || '').toString().trim()) return reply({ ok: true });

  const clean = (k, max) => (form.get(k) || '').toString().replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max);
  const f = {
    first: clean('first_name', 100),
    last: clean('last_name', 100),
    email: clean('email', 254).toLowerCase(),
    phone: clean('phone', 40),
    service: clean('service', 80),
    date: /^\d{4}-\d{2}-\d{2}$/.test(clean('event_date', 10)) ? clean('event_date', 10) : '',
    venue: clean('venue', 200),
    message: clean('message', 5000),
    source: clean('lead_source', 60),
  };
  if (!f.first || !f.last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) || !f.date) {
    return reply({ error: 'Please fill in your name, email and event date.' }, 400);
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const body = new FormData();
    body.append('secret', env.TURNSTILE_SECRET_KEY);
    body.append('response', (form.get('cf-turnstile-response') || '').toString());
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) body.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const outcome = await res.json().catch(() => ({ success: false }));
    if (!outcome.success) {
      console.error('enquiry: Turnstile failed:', (outcome['error-codes'] || []).join(','));
      return reply({ error: 'Sorry, we couldn’t confirm you’re not a robot. Please try again.' }, 400);
    }
  }

  if (!env.DB) {
    console.error('enquiry: no D1 database bound as DB');
    return reply({ error: 'Sorry, something went wrong. Please call me on 021 625 943.' }, 500);
  }

  // The job type must be one from the studio's list (Settings); it decides the workflow.
  const type = await env.DB.prepare(`SELECT value, workflow FROM lists WHERE kind = 'job_type' AND value = ?1`).bind(f.service).first().catch(() => null);
  if (!type) return reply({ error: 'Please choose which service you’re interested in.' }, 400);
  const workflow = WORKFLOWS[type.workflow] ? type.workflow : null;
  const now = new Date();
  const at = now.toISOString();
  let jobId;
  try {
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
  } catch (e) {
    console.error('enquiry: database error', e);
    return reply({ error: 'Sorry, something went wrong. Please try again, or call me on 021 625 943.' }, 500);
  }

  const nzDate = new Date(`${f.date}T12:00:00Z`).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  await alertTony(env, `New ${f.service.toLowerCase()} enquiry: ${f.first} ${f.last}`, [
    ['Name', `${f.first} ${f.last}`], ['Email', f.email], ['Phone', f.phone], ['Service', f.service], ['Date', nzDate],
    ['Venue', f.venue], ['Heard via', f.source], ['Message', f.message],
    ['Next', workflow ? 'Enquiry response (01) goes automatically in about an hour.' : 'No workflow for this type yet: reply from the studio.'],
  ], new URL(`/studio/crm/job?id=${jobId}`, request.url).href);

  return reply({ ok: true });
}

// Anyone visiting the address directly is sent to the contact page.
export function onRequestGet({ request }) {
  return Response.redirect(new URL('/contact', request.url).toString(), 302);
}
