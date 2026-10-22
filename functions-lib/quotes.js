// Quotes for the studio CRM: totals (prices include GST), payment schedule dates, and the
// client-safe view of a quote. Money is whole cents.
import { clean, toHtml } from './rich-html.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const money = (cents) => `$${(cents / 100).toLocaleString('en-NZ', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
/** The GST inside a GST-inclusive amount (15%). */
export const gstOf = (cents) => Math.round((cents * 3) / 23);

const nzToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
export const longDate = (date) => (date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

/** Total for a chosen package and extras, less any discount (never below zero). A quote with no
 *  packages (e.g. prints sold later) is just its products: at least one must be chosen. */
export function totalFor(quote, pkgIndex, extraIndexes = []) {
  const pkg = quote.packages.length ? quote.packages[pkgIndex] : { price: 0 };
  if (!pkg || (!quote.packages.length && !extraIndexes.length)) return null;
  const extras = extraIndexes.map((i) => quote.extras[i]?.price ?? 0).reduce((a, b) => a + b, 0);
  return Math.max(0, pkg.price + extras - (quote.discount || 0));
}

/**
 * The payments for a total: each part's amount (the last part takes any rounding) and due date.
 * parts: [{ percent, label, when: 'accept' | 'before' | 'after', days?, months? }]
 * Dates that would fall before the acceptance date are due on acceptance.
 */
export function payments(parts, total, eventDate, acceptDate = nzToday()) {
  let left = total;
  return parts.map((p, i) => {
    const amount = i === parts.length - 1 ? left : Math.round((total * p.percent) / 100);
    left -= amount;
    let due = acceptDate;
    if (p.when === 'accept') due = addDays(acceptDate, p.days || 0);
    else if (eventDate) {
      const sign = p.when === 'before' ? -1 : 1;
      due = p.months ? addMonths(eventDate, sign * p.months) : addDays(eventDate, sign * (p.days || 0));
    }
    // A date that has already passed (e.g. 2 months before a wedding that's 6 weeks away) is due on acceptance.
    const passed = due < acceptDate;
    if (passed) due = acceptDate;
    return { label: p.label, percent: p.percent, amount, due, onAccept: due === acceptDate, passed };
  });
}

/** A package or product's picture: a Cloudflare Images address (uploaded through /api/studio/upload), else ''. */
export const imageUrl = (v) => (/^https:\/\/imagedelivery\.net\/[\w-]+\/[\w/.-]+$/.test(String(v ?? '')) ? String(v) : '');

/** Quotes set to "No contract" (e.g. prints): accepting sends the invoice straight away. */
export const NO_CONTRACT = 'none';

/** A quote row from the database with its JSON fields parsed. */
export const parseQuote = (row) => row && ({
  ...row,
  packages: JSON.parse(row.packages || '[]'),
  extras: JSON.parse(row.extras || '[]'),
  schedule: JSON.parse(row.schedule || '[]'),
  chosen_extras: JSON.parse(row.chosen_extras || '[]'),
});

/** The quote's number, as on Studio Ninja's quotes: its date and id, e.g. 20261017-3. */
export const quoteNumber = (q) => `${(q.sent_at || q.created_at).slice(0, 10).replace(/-/g, '')}-${q.id}`;

/** Fill-ins Tony can use in the quote's introduction and notes ({{valid_until}} etc.), with the
 *  text cleaned to the rich editor's formatting. */
export function quoteText(text, q, job) {
  const values = {
    valid_until: longDate(q.valid_until), quote_valid_until: longDate(q.valid_until),
    first_name: job.first_name, partner_name: job.partner_name, couple: job.partner_name ? `${job.first_name} & ${job.partner_name}` : job.first_name,
    event_date: longDate(job.event_date), venue: job.venue,
  };
  return clean(toHtml(text)).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (values[k] ? esc(values[k]) : m));
}

/** The payment plan for every package, as an email-safe table ({{payment_plan}} in the "Quote
 *  ready" email): each package's total and its payments with dates (if accepted today). */
export function planHtml(q, job) {
  const td = 'padding:7px 0;border-bottom:1px solid #f1ebe1;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333;';
  // No packages (just products): one plan for everything on the quote.
  const options = q.packages.length ? q.packages : [{ name: 'Everything on this quote', price: q.extras.reduce((a, x) => a + x.price, 0) }];
  return options.map((p) => {
    const total = Math.max(0, p.price - (q.discount || 0));
    const rows = payments(q.schedule, total, job.event_date).map((x) =>
      `<tr><td style="${td}">${esc(x.label)} (${x.percent}%)</td><td style="${td}text-align:right;">${money(x.amount)}</td><td style="${td}text-align:right;color:#777;padding-left:12px;">${x.passed ? 'on acceptance (the usual date has passed)' : x.onAccept ? 'on acceptance' : `by ${longDate(x.due)}`}</td></tr>`).join('');
    return `<p style="margin:18px 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;"><strong style="font-weight:600;">${esc(p.name)}</strong>${p.subtitle ? ` (${esc(p.subtitle)})` : ''}: ${money(total)} incl. GST</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 8px;">${rows}</table>`;
  }).join('');
}

/** What the couple's quote page may see (nothing private beyond their own quote). */
export function publicQuote(q, job) {
  const expired = q.status === 'sent' && q.valid_until && q.valid_until < nzToday();
  return {
    status: expired ? 'expired' : q.status,
    number: quoteNumber(q), issued: longDate((q.sent_at || q.created_at).slice(0, 10)),
    from: { name: 'Moments in Light', person: 'Tony Gorham', phone: '021 625 943', email: 'tony@momentsinlight.co.nz', address: '985a Hibiscus Coast Highway, Waiwera, Auckland 0994' },
    client: { name: `${job.first_name} ${job.last_name}`.trim(), email: job.email, address: q.status === 'accepted' ? job.address || '' : '' },
    need_phone: !String(job.phone ?? '').trim(), // no phone on file: asked for when they accept
    names: job.partner_name ? `${job.first_name} & ${job.partner_name}` : job.first_name,
    event_date: job.event_date, event_date_long: longDate(job.event_date), venue: job.venue,
    intro: quoteText(q.intro, q, job), packages: q.packages.map((p) => ({ ...p, description: clean(toHtml(p.description)) })), extras: q.extras, discount: q.discount, discount_label: q.discount_label,
    schedule: q.schedule, notes: quoteText(q.notes, q, job), valid_until: q.valid_until, valid_until_long: longDate(q.valid_until),
    contract: q.contract_key !== NO_CONTRACT,
    chosen_package: q.chosen_package, chosen_extras: q.chosen_extras, total: q.total, accepted_name: q.accepted_name, accepted_at: q.accepted_at,
    today: nzToday(),
  };
}
