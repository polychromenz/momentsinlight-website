// The client portal: each job's private link, the portal's settings (Settings > Portal), and
// everything a couple sees, gathered for /portal (functions/api/portal.js).
import { loadJob } from './crm-send.js';
import { jobGalleries, GALLERY_ORIGIN } from './gallery-access.js';
import { parseQuote, longDate, payments, quoteNumber } from './quotes.js';

export const SITE = 'https://www.momentsinlight.co.nz';
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');

// Tony's wording from Studio Ninja's portal (with "every" → "everything").
export const PORTAL_DEFAULTS = {
  welcome: 'Hello {{first_name}}!\n\nWelcome to your client portal. You should be able to find everything related to your booking here but we like to keep things really friendly so, you can always just call and ask if you prefer.',
  gallery_intro: 'Welcome to your Gallery.\n\nYou can download both full hi res and web sized versions at no additional charge. You can download individual images, a selection of images or the whole lots the choice is yours. You can even invite others to view and download these images if you wish to.\n\nAs always, if you have any issues, questions or feedback, please do not hesitate to contact us.\n\nOK, dig in and enjoy!',
  banner: 'https://imagedelivery.net/qzGY-glAlQGHmkVvJZVh0Q/_from-website/colour/tay-barn-bronze-nzipp-2026-website/public',
};

export async function portalSettings(db) {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'portal'`).first();
  const saved = row ? JSON.parse(row.value) : {};
  return Object.fromEntries(Object.entries(PORTAL_DEFAULTS).map(([k, v]) => [k, saved[k] || v]));
}

/** A job's portal token, made the first time it's needed. */
export async function portalToken(db, jobId) {
  const row = await db.prepare('SELECT portal_token FROM jobs WHERE id = ?1').bind(jobId).first();
  if (!row) throw new Error('That job doesn’t exist.');
  if (row.portal_token) return row.portal_token;
  const t = token();
  await db.prepare('UPDATE jobs SET portal_token = ?2 WHERE id = ?1 AND portal_token IS NULL').bind(jobId, t).run();
  return (await db.prepare('SELECT portal_token FROM jobs WHERE id = ?1').bind(jobId).first()).portal_token;
}

export const portalLink = (t) => `${SITE}/portal?t=${t}`;

/** Everything the couple's portal shows. */
export async function portalData(db, job) {
  const [quotes, contracts, questionnaires, invoices, galleries, docs, uploads, settings] = await Promise.all([
    db.prepare(`SELECT * FROM quotes WHERE job_id = ?1 AND status IN ('sent', 'accepted') ORDER BY created_at DESC`).bind(job.id).all(),
    db.prepare(`SELECT id, name, status, token, signed_name, signed_at, sent_at FROM contracts WHERE job_id = ?1 AND status IN ('sent', 'signed') ORDER BY id DESC`).bind(job.id).all(),
    db.prepare('SELECT id, name, status, token, submitted_at, updated_at, created_at FROM questionnaires WHERE job_id = ?1 ORDER BY id').bind(job.id).all(),
    db.prepare(`SELECT i.id, COALESCE(p.number, i.number) number, i.label, i.amount, i.due_date, i.status, i.token, i.paid_at, i.paid_method, i.send_at FROM invoices i LEFT JOIN invoices p ON p.id = i.parent_id
      WHERE i.job_id = ?1 AND i.status IN ('scheduled', 'sent', 'paid') ORDER BY i.due_date, i.id`).bind(job.id).all(),
    db.prepare('SELECT id, title, url, note FROM galleries WHERE job_id = ?1 ORDER BY id').bind(job.id).all(),
    db.prepare('SELECT d.id, d.name, d.size, d.type FROM job_documents jd JOIN documents d ON d.id = jd.document_id WHERE jd.job_id = ?1 ORDER BY d.name').bind(job.id).all(),
    db.prepare('SELECT id, name, size, type, questionnaire_id, created_at FROM uploads WHERE job_id = ?1 ORDER BY id').bind(job.id).all(),
    portalSettings(db),
  ]);
  // The accepted quote (else the latest sent one): its package and payment plan.
  const qRow = quotes.results.find((q) => q.status === 'accepted') ?? quotes.results[0];
  let quote = null;
  if (qRow) {
    const q = parseQuote(qRow);
    const accepted = q.status === 'accepted';
    const pkg = accepted ? q.packages[q.chosen_package] : null;
    quote = {
      number: quoteNumber(q), status: q.status, token: q.token, accepted_at: q.accepted_at,
      package: pkg ? `${pkg.name}${pkg.subtitle ? ` (${pkg.subtitle})` : ''}` : null,
      extras: accepted ? (q.chosen_extras || []).map((i) => q.extras[i]?.name).filter(Boolean) : [],
      total: accepted ? q.total : null,
      payments: accepted ? payments(q.schedule, q.total, job.event_date, q.accepted_at.slice(0, 10)).map((p) => ({ label: `${p.label} (${p.percent}%)`, amount: p.amount, due: p.onAccept ? 'on acceptance' : longDate(p.due) })) : [],
    };
  }
  const inv = invoices.results;
  const owing = inv.filter((i) => i.status !== 'paid').reduce((a, i) => a + i.amount, 0);
  const paid = inv.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amount, 0);
  const first = job.first_name;
  return {
    couple: job.partner_name ? `${first} & ${job.partner_name}` : `${first} ${job.last_name}`.trim(),
    first_name: first, job_type: job.job_type, event_date: job.event_date, event_date_long: job.event_date ? longDate(job.event_date) : '', venue: job.venue, stage: job.stage,
    welcome: settings.welcome.replace(/\{\{\s*first_name\s*\}\}/g, first), gallery_intro: settings.gallery_intro, banner: settings.banner,
    quote, contracts: contracts.results.map(({ id, ...c }) => c),
    questionnaires: questionnaires.results.map(({ id, ...q }) => ({ ...q, started: q.updated_at > q.created_at })),
    invoices: inv.map(({ id, ...i }) => ({ ...i, due_long: longDate(i.due_date), payable: i.status !== 'paid' })), owing, paid,
    galleries: [...(await jobGalleries(db, job.id)).filter((g) => g.online && g.url).map((g) => ({ title: g.name, url: g.url, note: '' })),
      ...galleries.results.filter((g) => !g.url.startsWith(GALLERY_ORIGIN)).map(({ id, ...g }) => g)],
    documents: docs.results, uploads: uploads.results,
  };
}

export const findByPortal = async (db, t) => {
  if (!/^[a-f0-9]{48}$/.test(t || '')) return null;
  const row = await db.prepare('SELECT id FROM jobs WHERE portal_token = ?1').bind(t).first();
  return row ? loadJob(db, row.id) : null;
};
