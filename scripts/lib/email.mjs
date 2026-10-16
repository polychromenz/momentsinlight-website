// Shared bits for the report emails (weekly stats, monthly speed): sending through Resend,
// the site-styled email layout, and New Zealand time checks for the scheduled GitHub Actions.
import fs from 'node:fs';

export const TO = 'tony@momentsinlight.co.nz';
export const FROM = 'Moments in Light <reports@momentsinlight.co.nz>';
export const SITE = 'https://www.momentsinlight.co.nz';

/** Settings from the environment (GitHub secrets), or .env when run on this computer. */
export const env = {
  ...Object.fromEntries(
    (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '').split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]),
  ),
  ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)),
};

/** The date and time in New Zealand, whatever the computer's time zone. */
export function nzNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, day: Number(p.day), hour: Number(p.hour), weekday: p.weekday };
}

/** GitHub runs each schedule at two UTC hours (NZ daylight saving moves 8am by an hour); only
 *  the run that lands at 8am NZ carries on. --now (or a manual run) skips the check. */
export function onlyAt8am(extra = () => true) {
  if (process.argv.includes('--now') || process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') return;
  const nz = nzNow();
  if (nz.hour !== 8 || !extra(nz)) {
    console.log(`Not time yet (it's ${nz.weekday} ${nz.date}, ${nz.hour}:00 in NZ).`);
    process.exit(0);
  }
}

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const num = (n) => Number(n).toLocaleString('en-NZ');

/** The email page: champagne background, white card, the site's greens. */
export function layout(heading, intro, body) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f1ea;font-family:Raleway,'Helvetica Neue',Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ea"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:28px 0">
<tr><td style="padding:30px 30px 6px">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#5a5e3b">Moments in Light</p>
<h1 style="margin:0 0 10px;font-size:26px;font-weight:300;color:#1a1a1a">${heading}</h1>
<p style="margin:0;font-size:14px;line-height:1.6;color:#555">${intro}</p>
</td></tr>
<tr><td style="padding:10px 30px 30px">${body}</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#888">Sent automatically by your website.</p>
</td></tr></table></body></html>`;
}

/** A section heading inside the email. */
export const h2 = (t) => `<h2 style="margin:26px 0 10px;font-size:17px;font-weight:400;color:#1a1a1a">${t}</h2>`;

/** A simple table: rows of cells, the first column left-aligned and the rest right-aligned. */
export function table(head, rows) {
  const cell = (c, i, th) => `<${th ? 'th' : 'td'} style="padding:7px 6px;border-bottom:1px solid ${th ? '#e8e1d5' : '#f3eee6'};text-align:${i ? 'right' : 'left'};font-size:${th ? 11 : 14}px;${th ? 'letter-spacing:1px;text-transform:uppercase;color:#777;font-weight:600' : ''}">${c}</${th ? 'th' : 'td'}>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
<tr>${head.map((c, i) => cell(c, i, true)).join('')}</tr>
${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => cell(c, i)).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}" style="padding:8px 6px;color:#999;font-size:14px">Nothing yet</td></tr>`}
</table>`;
}

export const button = (label, href) =>
  `<p style="margin:28px 0 0"><a href="${href}" style="display:inline-block;padding:12px 22px;background:#5a5e3b;color:#ffffff;text-decoration:none;border-radius:14px 0;font-size:14px">${label}</a></p>`;

/** Send through Resend. With --dry, saves the email to a file instead. */
export async function send(subject, html) {
  if (process.argv.includes('--dry')) {
    fs.writeFileSync('email-preview.html', html);
    console.log(`Dry run: "${subject}" saved to email-preview.html`);
    return;
  }
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY isn’t set.');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend said ${r.status}: ${d.message ?? JSON.stringify(d)}`);
  console.log(`Sent "${subject}" to ${TO} (${d.id}).`);
}

/** Posts by web address id, from the blog files: title, date, whether it's a love story, draft. */
export function posts() {
  const dir = 'src/content/blog';
  return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const s = fs.readFileSync(`${dir}/${f}`, 'utf8').split(/^---\s*$/m)[1] ?? '';
    const get = (k) => s.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, 'm'))?.[1]?.replace(/\\"/g, '"');
    return [f.replace(/\.md$/, ''), { title: get('title') ?? f, date: get('date') ?? '', wedding: /^categories:.*Wedding/m.test(s), draft: get('draft') === 'true' }];
  }));
}
