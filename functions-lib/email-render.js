// Turns an email template into the chosen email design: champagne background, logo on top, a
// white leaf-cornered card, green section labels and buttons, and the photo signature. See
// docs/email-design/email.html (the approved sample).
//
// Template text is HTML from the studio's rich editor (older templates in simple Markdown are
// converted on the fly; see rich-html.js). {{first_name}} etc. are merge fields (see fields());
// unknown or empty ones show as [first_name] and are reported, so nothing half-filled goes out.
import { toHtml, emailify } from './rich-html.js';

const SITE = 'https://www.momentsinlight.co.nz';
const FONT = "Raleway,'Helvetica Neue',Arial,sans-serif";
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Tony's own links (Settings > Your links), e.g. {{booking_link}}: the same for every email. */
export async function studioLinks(db) {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'links'`).first();
  const v = row ? JSON.parse(row.value) : {};
  return { booking_link: v.booking_link || '' };
}

/** The merge field values for a job (from jobs + clients). */
export function fields(job, extra = {}) {
  const date = job.event_date ? new Date(`${job.event_date}T12:00:00Z`) : null;
  return {
    first_name: job.first_name,
    last_name: job.last_name,
    partner_name: job.partner_name,
    couple: job.partner_name ? `${job.first_name} & ${job.partner_name}` : job.first_name,
    event_date: date ? date.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '',
    venue: job.venue,
    shoot_date: date ? date.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '',
    shoot_time: job.event_time ? new Date(`2000-01-01T${job.event_time}:00`).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }) : '',
    location: job.venue,
    ...extra,
  };
}

/** Fields whose values are already HTML (e.g. the quote's payment plan table). */
export const HTML_FIELDS = ['payment_plan'];

/** Fill in {{fields}}. With html: true the values are escaped for HTML (except HTML_FIELDS).
 *  Returns the text and any fields that had no value. */
export function merge(text, values, { html = false } = {}) {
  const missing = new Set();
  const out = String(text ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => {
    const v = values[k];
    if (v === undefined || v === null || v === '') { missing.add(k); return `[${k}]`; }
    return html && !HTML_FIELDS.includes(k) ? esc(v) : String(v);
  });
  return { text: out, missing: [...missing] };
}

/** Template body (rich HTML, or older Markdown) → the inner HTML of the card, email-safe. */
export const bodyHtml = (text) => emailify(toHtml(text));

/** The whole email, in the approved design, with the photo signature. */
export function emailHtml({ subject, body, preheader = '' }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>@media (max-width:620px){.pad{padding-left:22px !important;padding-right:22px !important;}}</style></head>
<body style="margin:0;padding:0;background:#f6f1ea;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ea;"><tr><td align="center" style="padding:32px 12px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td align="center" style="padding:0 0 22px;"><img src="${SITE}/email/logo.png" width="120" alt="Moments in Light" style="display:block;width:120px;height:auto;border:0;"></td></tr>
<tr><td class="pad" style="background:#ffffff;border-radius:32px 0;padding:40px 44px 36px;">
${bodyHtml(body)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px;border-top:1px solid #ece4d7;"><tr><td style="padding-top:22px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="top" style="padding-right:16px;"><img src="${SITE}/email/tony.jpg" width="72" alt="Tony Gorham" style="display:block;width:72px;height:auto;border:0;border-radius:18px 0;"></td>
<td valign="top" style="font-family:${FONT};">
<p style="margin:0;font-size:18px;font-weight:400;color:#1a1a1a;">Tony Gorham</p>
<p style="margin:2px 0 8px;font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:#5a5e3b;">Wedding &amp; portrait photographer</p>
<p style="margin:0;font-size:14px;line-height:1.7;color:#555555;"><a href="tel:+6421625943" style="color:#555555;text-decoration:none;">021 625 943</a><br>
<a href="${SITE}" style="color:#555555;text-decoration:none;">momentsinlight.co.nz</a> &nbsp;·&nbsp; <a href="https://www.instagram.com/momentsinlightnz" style="color:#5a5e3b;text-decoration:none;">Instagram</a></p>
<img src="${SITE}/email/logo.png" width="84" alt="Moments in Light" style="display:block;width:84px;height:auto;border:0;margin-top:12px;">
</td></tr></table>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:20px 10px 0;font-family:${FONT};font-size:12px;color:#8a8a8a;">Moments in Light · Auckland wedding &amp; portrait photography</td></tr>
</table></td></tr></table></body></html>`;
}

/** Template + values → { subject, body (HTML, filled in), html (whole email), missing }.
 *  edits = Tony's reviewed { subject, body } (already filled in; any [gaps] still count). */
export function renderTemplate(template, values, edits = {}) {
  const s = merge(edits.subject ?? template.subject, values);
  // HTML fields (tables) would be stripped by the editor and the email cleaner, so they stay as
  // {{payment_plan}} in the body Tony reviews and are put in only in the final email.
  const keep = Object.fromEntries(HTML_FIELDS.filter((k) => values[k]).map((k) => [k, `{{${k}}}`]));
  const b = merge(toHtml(edits.body ?? template.body), { ...values, ...keep }, { html: true });
  let html = emailHtml({ subject: s.text, body: b.text });
  for (const k of Object.keys(keep)) {
    html = html.replace(new RegExp(`<p[^>]*>\\s*\\{\\{${k}\\}\\}\\s*</p>`, 'g'), values[k]).replaceAll(`{{${k}}}`, values[k]);
  }
  const gaps = (t) => [...String(t).matchAll(/\[(first_name|last_name|partner_name|couple|event_date|venue|portal_link|gallery_link|contract_link|payment_amount|payment_due_date|quote_link|quote_valid_until|payment_plan|invoice_number|invoice_label|invoice_link|questionnaire_link|shoot_date|shoot_time|location|booking_link)\]/g)].map((m) => m[1]);
  return {
    subject: s.text,
    body: b.text,
    html,
    missing: [...new Set([...s.missing, ...b.missing, ...gaps(s.text), ...gaps(b.text)])],
  };
}
