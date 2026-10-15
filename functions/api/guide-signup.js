// Cloudflare Pages Function: receives the free wedding photo guide signup form
// (POST /api/guide-signup), saves the signup to the D1 database bound as DB, then sends
// the visitor back to the guide page, which shows a thank-you message and the download.
//
// Spam protection: a hidden "website" field that people never fill in, plus Cloudflare
// Turnstile when TURNSTILE_SECRET_KEY is set (see docs/forms-setup.md).

const THANK_YOU = '/wedding-photo-guide?signup=done#guide-signup';
const FORM_PAGE = '/wedding-photo-guide';

const back = (request, error, reason) => {
  const url = new URL(FORM_PAGE, request.url);
  url.searchParams.set('signup', error);
  // Turnstile's reason code (e.g. invalid-input-secret), for diagnosing; not secret.
  if (reason) url.searchParams.set('reason', reason);
  url.hash = 'guide-signup';
  return Response.redirect(url.toString(), 303);
};

export async function onRequestPost({ request, env }) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return back(request, 'invalid');
  }

  // Bots fill in every field, including this hidden one. Pretend it worked.
  if ((form.get('website') || '').toString().trim()) {
    return Response.redirect(new URL(THANK_YOU, request.url).toString(), 303);
  }

  const clean = (v, max) => (v || '').toString().replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  const first = clean(form.get('fname'), 100);
  const last = clean(form.get('lname'), 100);
  const email = clean(form.get('email'), 254).toLowerCase();

  if (!first || !last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return back(request, 'invalid');
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const body = new FormData();
    body.append('secret', env.TURNSTILE_SECRET_KEY);
    body.append('response', (form.get('cf-turnstile-response') || '').toString());
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) body.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const outcome = await res.json().catch(() => ({ success: false, 'error-codes': ['bad-response'] }));
    if (!outcome.success) {
      const reason = (outcome['error-codes'] || []).join(',') || 'unknown';
      console.error('guide-signup: Turnstile failed:', reason, 'hostname:', outcome.hostname);
      return back(request, 'check', reason);
    }
  }

  if (!env.DB) {
    console.error('guide-signup: no D1 database bound as DB; signup not saved');
    return back(request, 'error');
  }

  try {
    // A repeat signup with the same email updates the name and keeps the first signup date.
    await env.DB.prepare(
      `INSERT INTO guide_signups (first_name, last_name, email, created_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(email) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name`,
    )
      .bind(first, last, email, new Date().toISOString())
      .run();
  } catch (e) {
    console.error('guide-signup: database error', e);
    return back(request, 'error');
  }

  return Response.redirect(new URL(THANK_YOU, request.url).toString(), 303);
}

// Anyone visiting the address directly is sent to the form.
export function onRequestGet({ request }) {
  return Response.redirect(new URL(FORM_PAGE, request.url).toString(), 302);
}
