// Cloudflare Pages Function: the new enquiry form (POST /api/enquiry, from
// src/components/page/EnquiryForm.astro, tested on /newcontact). Checks for spam, then makes the
// client and the lead, plans the workflow's first steps and emails Tony (functions-lib/enquiry.js).
// Answers in JSON for the form's script.
//
// Spam protection: a hidden "website" field bots fill in, Cloudflare Turnstile when
// TURNSTILE_SECRET_KEY is set, and functions-lib/spam.js (too fast for a person, sales-pitch
// wording, an AI check). Caught enquiries are kept for the studio's Spam list, not made into leads;
// the sender sees the usual thank-you.
import { createLead } from '../../functions-lib/enquiry.js';
import { spamCheck, keepSpam } from '../../functions-lib/spam.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export async function onRequestPost(context) {
  const { request, env } = context;
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

  // How long the page was open before sending (set by the form's script; missing without script).
  const ms = /^\d+$/.test(clean('t', 12)) ? Number(clean('t', 12)) : null;
  const spam = await spamCheck(env, f, ms).catch(() => ({ spam: false }));
  if (spam.spam) {
    await keepSpam(env, f, spam.reason).catch((e) => console.error('enquiry: could not keep spam', e));
    return reply({ ok: true });
  }

  try {
    await createLead(context, f, request.url);
  } catch (e) {
    if (e.status === 400) return reply({ error: e.message }, 400);
    console.error('enquiry: database error', e);
    return reply({ error: 'Sorry, something went wrong. Please try again, or call me on 021 625 943.' }, 500);
  }
  return reply({ ok: true });
}

// Anyone visiting the address directly is sent to the contact page.
export function onRequestGet({ request }) {
  return Response.redirect(new URL('/contact', request.url).toString(), 302);
}
