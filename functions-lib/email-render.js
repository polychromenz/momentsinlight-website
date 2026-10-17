// Turns an email template (simple Markdown with {{merge fields}}) into the chosen email design:
// champagne background, logo on top, a white leaf-cornered card, green section labels and
// buttons, and the photo signature. See docs/email-design/email.html (the approved sample).
//
// Template text rules (as Tony's templates are written):
//   blank line            new paragraph
//   **BEFORE YOUR WEDDING**   a paragraph that's all bold capitals → a green section label
//   **bold**, [text](url) inline bold and links
//   a paragraph that is only a link → a green button
//   lines starting "- "   a bulleted list
//   {{first_name}} etc.   merge fields (see fields()); unknown or empty ones are reported

const SITE = 'https://www.momentsinlight.co.nz';
const FONT = "Raleway,'Helvetica Neue',Arial,sans-serif";
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

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
    ...extra,
  };
}

/** Fill in {{fields}}. Returns the text and any fields that had no value. */
export function merge(text, values) {
  const missing = new Set();
  const out = String(text ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => {
    const v = values[k];
    if (v === undefined || v === null || v === '') { missing.add(k); return `[${k}]`; }
    return String(v);
  });
  return { text: out, missing: [...missing] };
}

const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:#1a1a1a;">$1</strong>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|tel:[^)\s]+)\)/g, '<a href="$2" style="color:#5a5e3b;text-decoration:underline;">$1</a>')
  .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" style="color:#5a5e3b;text-decoration:underline;">$2</a>')
  .replace(/\n/g, '<br>');

const P = `margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.75;color:#333333;`;

/** Template body (Markdown) → the inner HTML of the card. */
export function bodyHtml(md) {
  return String(md).trim().split(/\n{2,}/).map((block) => {
    const b = block.trim();
    const label = b.match(/^\*\*([^*a-z]+)\*\*$/);
    if (label) return `<p style="margin:28px 0 6px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#5a5e3b;">${esc(label[1].trim())}</p>`;
    const button = b.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (button) return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;"><tr><td style="background:#5a5e3b;border-radius:14px 0;"><a href="${esc(button[2])}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:14px;font-weight:500;color:#ffffff;text-decoration:none;">${esc(button[1])}</a></td></tr></table>`;
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l) || !l.trim())) {
      return `<ul style="margin:0 0 16px;padding-left:22px;font-family:${FONT};font-size:16px;line-height:1.7;color:#333333;">${lines.filter((l) => l.trim()).map((l) => `<li style="margin:0 0 6px;">${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p style="${P}">${inline(b)}</p>`;
  }).join('\n');
}

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

/** Template + job → { subject, html, text, missing } ready for sendEmail(). */
export function renderTemplate(template, values, edits = {}) {
  const s = merge(edits.subject ?? template.subject, values);
  const b = merge(edits.body ?? template.body, values);
  return {
    subject: s.text,
    body: b.text,
    html: emailHtml({ subject: s.text, body: b.text }),
    missing: [...new Set([...s.missing, ...b.missing])],
  };
}
