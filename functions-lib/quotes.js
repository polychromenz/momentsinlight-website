// Quotes for the studio CRM: totals (prices include GST), payment schedule dates, and the
// client-safe view of a quote. Money is whole cents.

export const money = (cents) => `$${(cents / 100).toLocaleString('en-NZ', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
/** The GST inside a GST-inclusive amount (15%). */
export const gstOf = (cents) => Math.round((cents * 3) / 23);

const nzToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
export const longDate = (date) => (date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

/** Total for a chosen package and extras, less any discount (never below zero). */
export function totalFor(quote, pkgIndex, extraIndexes = []) {
  const pkg = quote.packages[pkgIndex];
  if (!pkg) return null;
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
    if (due < acceptDate) due = acceptDate;
    return { label: p.label, percent: p.percent, amount, due, onAccept: due === acceptDate };
  });
}

/** A quote row from the database with its JSON fields parsed. */
export const parseQuote = (row) => row && ({
  ...row,
  packages: JSON.parse(row.packages || '[]'),
  extras: JSON.parse(row.extras || '[]'),
  schedule: JSON.parse(row.schedule || '[]'),
  chosen_extras: JSON.parse(row.chosen_extras || '[]'),
});

/** What the couple's quote page may see (nothing private beyond their own quote). */
export function publicQuote(q, job) {
  const expired = q.status === 'sent' && q.valid_until && q.valid_until < nzToday();
  return {
    status: expired ? 'expired' : q.status,
    names: job.partner_name ? `${job.first_name} & ${job.partner_name}` : job.first_name,
    event_date: job.event_date, event_date_long: longDate(job.event_date), venue: job.venue,
    intro: q.intro, packages: q.packages, extras: q.extras, discount: q.discount, discount_label: q.discount_label,
    schedule: q.schedule, notes: q.notes, valid_until: q.valid_until, valid_until_long: longDate(q.valid_until),
    chosen_package: q.chosen_package, chosen_extras: q.chosen_extras, total: q.total, accepted_name: q.accepted_name, accepted_at: q.accepted_at,
    today: nzToday(),
  };
}
