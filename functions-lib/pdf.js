// PDFs for the studio CRM (pdf-lib, runs on Cloudflare): quotes, contracts, invoices, receipts
// and questionnaire answers. A4 in the email design: a champagne band with the logo, Raleway
// (public/fonts/pdf, fetched from the site like the logo), green letter-spaced labels, and
// leaf-cornered champagne panels; the page itself stays white so it prints cleanly. If the fonts
// can't be fetched it falls back to Helvetica, so a PDF is always made.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { clean, toHtml } from './rich-html.js';
import { longDate, payments } from './quotes.js';

const money = (c) => `$${(c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SITE = 'https://www.momentsinlight.co.nz';
const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const GREEN = hex('#5a5e3b');
const INK = hex('#2b2d1f');
const TEXT = hex('#3a3a36');
const GREY = hex('#7a7870');
const LINE = hex('#ece4d7');
const CHAMPAGNE = hex('#f6f1ea');
const A4 = [595.28, 841.89];
const M = 54; // margin
const BAND = 112; // the champagne band at the top of the first page

// Raleway, once per worker (the files are on the site: public/fonts/pdf).
const FONT_FILES = { light: 300, regular: 400, medium: 500, bold: 600 };
let fontBytes = null;
async function loadFonts() {
  if (fontBytes) return fontBytes;
  const got = await Promise.all(Object.entries(FONT_FILES).map(async ([k, w]) => {
    const r = await fetch(`${SITE}/fonts/pdf/raleway-${w}.ttf`);
    if (!r.ok) throw new Error(`font ${w}: ${r.status}`);
    return [k, new Uint8Array(await r.arrayBuffer())];
  }));
  fontBytes = Object.fromEntries(got);
  return fontBytes;
}
// A box with two leaf corners (top left and bottom right rounded), as in the emails.
const leaf = (w, h, r = 16) => `M ${r} 0 H ${w} V ${h - r} Q ${w} ${h} ${w - r} ${h} H 0 V ${r} Q 0 0 ${r} 0 Z`;

// The built-in font only covers Windows-1252: keep everything else readable (ā → a etc.).
const CP1252 = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const safe = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[‐‑]/g, '-').replace(/ /g, ' ').replace(/[✓✔]/g, '').replace(/♥/g, '')
  .split('').filter((c) => c === '\n' || (c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 256 && !(c.charCodeAt(0) >= 0x80 && c.charCodeAt(0) < 0xa0)) || CP1252.has(c)).join('');

const tidy = (s) => String(s ?? '').replace(/[✓✔♥]/g, '').replace(/ /g, ' ').split('').filter((c) => c === '\n' || c.charCodeAt(0) >= 32).join('');

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Cleaned HTML → blocks of text runs: [{ kind: 'p'|'h2'|'h3'|'li', runs: [{ text, bold }] }]. */
export function blocks(html) {
  const out = [];
  const h = clean(toHtml(html)).replace(/<li>\s*<p[^>]*>/g, '<li>').replace(/<\/p>\s*<\/li>/g, '</li>');
  const re = /<(p|h2|h3|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(h))) {
    const runs = [];
    let bold = false;
    for (const part of m[2].replace(/<br>/g, '\n').split(/(<\/?(?:strong|b)>)/)) {
      if (/^<(strong|b)>$/.test(part)) { bold = true; continue; }
      if (/^<\/(strong|b)>$/.test(part)) { bold = false; continue; }
      const text = decode(part.replace(/<[^>]+>/g, ''));
      if (text) runs.push({ text, bold });
    }
    if (runs.length) out.push({ kind: m[1] === 'blockquote' ? 'p' : m[1], runs });
  }
  return out;
}

async function setup() {
  const pdf = await PDFDocument.create();
  let F; let txt = safe;
  try {
    const b = await loadFonts();
    pdf.registerFontkit(fontkit);
    const e = (k) => pdf.embedFont(b[k], { subset: true });
    F = { light: await e('light'), regular: await e('regular'), medium: await e('medium'), bold: await e('bold') };
    txt = tidy;
  } catch (err) {
    console.error('pdf: Raleway not loaded, using Helvetica', err?.message);
    const reg = await pdf.embedFont(StandardFonts.Helvetica); const b = await pdf.embedFont(StandardFonts.HelveticaBold);
    F = { light: reg, regular: reg, medium: b, bold: b };
  }
  let logo = null;
  try { const r = await fetch(`${SITE}/email/logo.png`); if (r.ok) logo = await pdf.embedPng(new Uint8Array(await r.arrayBuffer())); } catch { /* the PDF still works without it */ }
  let page; let y;
  const W = A4[0] - 2 * M;
  const newPage = (first = false) => {
    page = pdf.addPage(A4);
    if (first) {
      page.drawRectangle({ x: 0, y: A4[1] - BAND, width: A4[0], height: BAND, color: CHAMPAGNE });
      if (logo) { const w = 84; const hh = (logo.height / logo.width) * w; page.drawImage(logo, { x: A4[0] / 2 - w / 2, y: A4[1] - BAND / 2 - hh / 2, width: w, height: hh }); }
      y = A4[1] - BAND - 38;
    } else {
      page.drawRectangle({ x: 0, y: A4[1] - 10, width: A4[0], height: 10, color: CHAMPAGNE });
      y = A4[1] - M;
    }
  };
  const need = (h) => { if (y - h < M + 24) newPage(); };
  newPage(true);

  const font = (r) => (r.bold ? F.bold : r.weight ? F[r.weight] : F.regular);
  /** Write runs of text ({ text, bold?, weight? }), wrapped to the width. */
  const write = (runs, { size = 10, indent = 0, color = TEXT, gap = 6, lead = 1.55, width = W, x0 = M, align = 'left', bullet = false } = {}) => {
    let first = true;
    const words = [];
    for (const r of runs) for (const [i, piece] of txt(r.text).split('\n').entries()) {
      if (i > 0) words.push({ br: true });
      for (const w of piece.split(/(\s+)/)) if (w) words.push({ w, r });
    }
    let line = []; let lw = 0;
    const flush = () => {
      need(size * lead);
      let x = x0 + indent + (align === 'center' ? (width - indent - lw) / 2 : 0);
      if (bullet && first) page.drawCircle({ x: x0 + indent - 9, y: y - size * 0.68, size: 1.6, color: GREEN });
      first = false;
      for (const t of line) { const f = font(t.r); page.drawText(t.w, { x, y: y - size, size, font: f, color: t.r.color ?? color }); x += f.widthOfTextAtSize(t.w, size); }
      y -= size * lead; line = []; lw = 0;
    };
    for (const t of words) {
      if (t.br) { flush(); continue; }
      const tw = font(t.r).widthOfTextAtSize(t.w, size);
      if (lw + tw > width - indent && line.length && t.w.trim()) flush();
      if (!line.length && !t.w.trim()) continue;
      line.push(t); lw += tw;
    }
    if (line.length) flush();
    y -= gap;
  };
  const title = (text, sub) => {
    write([{ text, weight: 'light' }], { size: 26, color: INK, gap: 4, lead: 1.25 });
    if (sub) write([{ text: sub }], { size: 9, color: GREY, gap: 18 });
  };
  const label = (text, { x0 = M, keep = true } = {}) => {
    if (keep) { need(40); y -= 10; }
    page.drawText(txt(text.toUpperCase()), { x: x0, y: y - 7.5, size: 7.5, font: F.bold, color: GREEN, characterSpacing: 1.6 });
    if (keep) y -= 7.5 + 9;
  };
  const rule = (gap = 12) => { need(gap + 2); y -= gap / 2; page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: LINE }); y -= gap / 2; };
  /** Two blocks side by side: [[label, text], [label, text]]. */
  const columns = (cols) => {
    need(80); y -= 10;
    const top = y; let low = y; const cw = (W - 24) / 2;
    cols.forEach(([l, t], i) => {
      y = top; const x0 = M + i * (cw + 24);
      label(l, { x0, keep: false }); y -= 7.5 + 9;
      write([{ text: t }], { size: 9.5, gap: 0, width: cw, x0, lead: 1.6 });
      low = Math.min(low, y);
    });
    y = low - 4;
  };
  /** Rows of [left, right], with hairlines between. bold: the last row stands out. */
  const rows = (items, { size = 10, boldLast = false } = {}) => {
    items.forEach(([l, r], i) => {
      const last = boldLast && i === items.length - 1;
      const f = last ? F.bold : F.regular; const sz = last ? size + 1 : size;
      need(sz * 2.2);
      const lt = txt(l); const rt = txt(r);
      page.drawText(lt, { x: M, y: y - sz - 3, size: sz, font: f, color: last ? INK : TEXT });
      page.drawText(rt, { x: A4[0] - M - f.widthOfTextAtSize(rt, sz), y: y - sz - 3, size: sz, font: f, color: last ? INK : TEXT });
      y -= sz * 2.2;
      if (i < items.length - 1) page.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4[0] - M, y: y + 4 }, thickness: 0.5, color: LINE });
    });
    y -= 6;
  };
  /** A leaf-cornered champagne panel holding rows of [left, right] (e.g. the total, or bank details). */
  const panel = (items, { size = 10, boldLast = false, heading = '' } = {}) => {
    const pad = 16; const lh = size * 1.9;
    const h = pad * 2 + items.length * lh + (heading ? 18 : 0);
    need(h + 10); y -= 6;
    page.drawSvgPath(leaf(W, h), { x: M, y, color: CHAMPAGNE });
    let yy = y - pad;
    if (heading) { page.drawText(txt(heading.toUpperCase()), { x: M + pad, y: yy - 7.5, size: 7.5, font: F.bold, color: GREEN, characterSpacing: 1.6 }); yy -= 18; }
    items.forEach(([l, r], i) => {
      const last = boldLast && i === items.length - 1;
      const f = last ? F.bold : F.regular; const sz = last ? size + 2 : size;
      const lt = txt(l); const rt = txt(r);
      page.drawText(lt, { x: M + pad, y: yy - sz - 2, size: sz, font: last ? F.medium : F.regular, color: last ? INK : TEXT });
      page.drawText(rt, { x: A4[0] - M - pad - f.widthOfTextAtSize(rt, sz), y: yy - sz - 2, size: sz, font: f, color: last ? INK : TEXT });
      yy -= lh;
    });
    y -= h + 8;
  };
  const html = (h, size = 9.5) => {
    for (const b of blocks(h)) {
      if (b.kind === 'h2') write(b.runs.map((r) => ({ ...r, weight: 'medium', bold: false })), { size: size + 3, gap: 4, color: INK });
      else if (b.kind === 'h3') label(b.runs.map((r) => r.text).join(''));
      else if (b.kind === 'li') write(b.runs, { size, indent: 16, gap: 3, bullet: true });
      else write(b.runs, { size });
    }
  };
  const footer = (text) => pdf.getPages().forEach((p, i, all) => {
    const t = txt(`${text}  ·  momentsinlight.co.nz  ·  Page ${i + 1} of ${all.length}`);
    p.drawLine({ start: { x: M, y: 40 }, end: { x: A4[0] - M, y: 40 }, thickness: 0.5, color: LINE });
    p.drawText(t, { x: A4[0] / 2 - F.regular.widthOfTextAtSize(t, 7.5) / 2, y: 26, size: 7.5, font: F.regular, color: GREY });
  });
  return { pdf, write, title, label, rule, columns, rows, panel, html, footer, get y() { return y; } };
}

const FROM = ['Moments in Light', 'Tony Gorham', '021 625 943', 'tony@momentsinlight.co.nz', '985a Hibiscus Coast Highway', 'Waiwera, Auckland 0994'];

/** The quote as accepted (or as it stands). q = parsed quote; job = job + client. */
export async function quotePdf(q, job, number) {
  const d = await setup();
  const accepted = q.status === 'accepted';
  d.title(accepted ? 'Accepted quote' : 'Quote', `Quote ${number}  ·  Issued ${longDate((q.sent_at || q.created_at).slice(0, 10))}${q.valid_until && !accepted ? `  ·  Valid until ${longDate(q.valid_until)}` : ''}`);
  d.columns([['From', FROM.join('\n')], ['For', [`${job.first_name} ${job.last_name}`.trim(), job.email, job.address, job.event_date && `Wedding: ${longDate(job.event_date)}`, job.venue].filter(Boolean).join('\n')]]);
  d.rule(20);
  const pick = accepted ? q.chosen_package : Math.max(0, q.packages.findIndex((p) => p.recommended));
  const pkg = q.packages[pick];
  const extras = (accepted ? q.chosen_extras : []).map((i) => q.extras[i]).filter(Boolean);
  if (pkg) {
    d.label(accepted ? 'Your package' : 'Package');
    d.write([{ text: `${pkg.name}${pkg.subtitle ? ` (${pkg.subtitle})` : ''}`, weight: 'medium' }], { size: 14, gap: 4, color: INK });
    d.html(pkg.description);
  }
  d.label('Summary');
  const subtotal = (pkg?.price ?? 0) + extras.reduce((a, x) => a + x.price, 0);
  const total = accepted ? q.total : Math.max(0, subtotal - (q.discount || 0));
  d.rows([
    [pkg ? pkg.name : 'Package', money(pkg?.price ?? 0)],
    ...extras.map((x) => [x.name, money(x.price)]),
    ...(q.discount ? [[q.discount_label || 'Discount', `-${money(q.discount)}`]] : []),
  ]);
  d.panel([['GST (15%, included)', money(Math.round((total * 3) / 23))], ['Total (incl. GST)', money(total)]], { boldLast: true });
  d.label('Payment schedule');
  d.rows(payments(q.schedule, total, job.event_date, (q.accepted_at || new Date().toISOString()).slice(0, 10))
    .map((p) => [`${p.label} (${p.percent}%)  ·  ${p.onAccept ? 'on acceptance' : `by ${longDate(p.due)}`}`, money(p.amount)]));
  if (q.notes) { d.label('Notes'); d.html(q.notes); }
  if (accepted) {
    d.rule(20);
    d.write([{ text: `Accepted online by ${q.accepted_name} on ${new Date(q.accepted_at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'long', timeStyle: 'short' })} (NZ time).` }], { size: 9, color: GREY });
  }
  d.footer(`Moments in Light  ·  Quote ${number}`);
  return d.pdf.save();
}

/** An invoice (or, once paid, its receipt). inv = invoice row; job = job + client; pay = Settings > Payments.
 *  asInvoice: the invoice itself even when it's been paid (the studio's invoice link). */
export async function invoicePdf(inv, job, pay, { asInvoice = false } = {}) {
  const d = await setup();
  const paid = inv.status === 'paid' && !asInvoice;
  const wasPaid = inv.status === 'paid' && asInvoice;
  d.title(paid ? 'Receipt' : pay?.gst_number ? 'Tax invoice' : 'Invoice', `Invoice ${inv.number}  ·  Issued ${longDate((inv.sent_at || inv.created_at).slice(0, 10))}${paid ? `  ·  Paid ${longDate(inv.paid_at.slice(0, 10))}` : `  ·  Due ${longDate(inv.due_date)}`}`);
  d.columns([['From', [...FROM, pay?.gst_number && `GST number: ${pay.gst_number}`].filter(Boolean).join('\n')], ['To', [`${job.first_name} ${job.last_name}`.trim(), job.email, job.address].filter(Boolean).join('\n')]]);
  d.rule(20);
  d.label('For');
  d.write([{ text: inv.label, weight: 'medium' }], { size: 14, gap: 2, color: INK });
  if (inv.description) d.write([{ text: inv.description }], { size: 9.5, color: GREY, gap: 8 });
  d.rows([[inv.label, money(inv.amount)], ['GST (15%, included)', money(Math.round((inv.amount * 3) / 23))]]);
  d.panel([[paid ? 'Paid (incl. GST)' : 'Amount due (incl. GST)', money(inv.amount)]], { boldLast: true });
  if (paid) {
    d.write([{ text: `Paid ${inv.paid_method === 'card' ? 'by card' : inv.paid_method === 'bank' ? 'by bank transfer' : ''} on ${longDate(inv.paid_at.slice(0, 10))}. Thank you!`, weight: 'medium' }], { size: 11, color: GREEN });
  } else {
    d.label('How to pay');
    d.write([{ text: 'By card: ', weight: 'medium' }, { text: `use the Pay button in your email, or ${SITE.replace('https://', '')}/invoice` }], { size: 9.5, gap: 6 });
    if (pay?.account_number) {
      d.panel([['Account name', pay.account_name], ...(pay.bank_name ? [['Bank', pay.bank_name]] : []), ['Account number', pay.account_number], ['Reference', inv.number]].filter(([, v]) => v), { heading: 'By bank transfer', size: 9.5 });
    }
    if (pay?.instructions) d.write([{ text: pay.instructions }], { size: 9, color: GREY });
  }
  if (wasPaid) d.write([{ text: `Paid on ${longDate(inv.paid_at.slice(0, 10))}. Thank you!`, weight: 'medium' }], { size: 11, color: GREEN });
  d.footer(`Moments in Light  ·  Invoice ${inv.number}`);
  return d.pdf.save();
}

/** The contract, with its event details and (once signed) the signature record. */
export async function contractPdf(c) {
  const d = await setup();
  const det = JSON.parse(c.details || '{}');
  d.title(c.name, det.note || ' ');
  d.columns([['Photographer', FROM.join('\n')], ['Client', [det.client, det.address, det.email].filter(Boolean).join('\n')]]);
  d.label('The Event');
  d.rows([
    ['Wedding date', det.event_date_long || ''],
    ['Venue', det.venue || ''],
    ['Package', det.package || ''],
    ['Total (incl. GST)', det.total || ''],
  ]);
  if (det.payments?.length) { d.label('Payment schedule'); d.rows(det.payments.map((p) => [p.label, p.amount])); }
  d.rule(20);
  d.html(c.body);
  d.rule(20);
  d.label('Signature');
  if (c.status === 'signed') {
    d.write([{ text: `Signed electronically by ${c.signed_name} on ${new Date(c.signed_at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'long', timeStyle: 'short' })} (NZ time).`, weight: 'medium' }], { size: 10.5, gap: 2, color: INK });
    d.write([{ text: `IP address ${c.signed_ip || 'unknown'}  ·  Contract fingerprint (SHA-256) ${c.fingerprint}` }], { size: 8, color: GREY, gap: 2 });
    d.write([{ text: 'Electronic signatures are valid under the Contract and Commercial Law Act 2017 (New Zealand).' }], { size: 8, color: GREY });
  } else {
    d.write([{ text: 'Not signed yet.' }], { size: 10.5, color: GREY });
  }
  d.footer(`Moments in Light  ·  ${c.name}`);
  return d.pdf.save();
}

/** A couple's questionnaire answers. q = questionnaire row; uploads = their files (names only). */
export async function questionnairePdf(q, job, uploads = []) {
  const d = await setup();
  const questions = JSON.parse(q.questions); const answers = JSON.parse(q.answers || '{}');
  d.title(q.name, [job.partner_name ? `${job.first_name} & ${job.partner_name}` : `${job.first_name} ${job.last_name}`, job.event_date && longDate(job.event_date), job.venue, q.submitted_at ? `sent in ${longDate(q.submitted_at.slice(0, 10))}` : 'not sent in yet'].filter(Boolean).join('  ·  '));
  for (const x of questions) {
    if (x.type === 'heading') { d.rule(16); d.write([{ text: x.label, weight: 'medium' }], { size: 14, color: INK, gap: 4 }); continue; }
    if (x.type === 'text') continue;
    const v = x.type === 'file' ? uploads.filter((u) => u.question_id === x.id).map((u) => u.name).join(', ') : answers[x.id];
    const shown = Array.isArray(v) ? v.join(', ') : String(v ?? '').trim();
    d.write([{ text: x.label, weight: 'medium' }], { size: 9.5, color: INK, gap: 1 });
    d.write([{ text: shown || 'No answer' }], { size: 10, color: shown ? TEXT : GREY, gap: 10 });
  }
  d.footer(`Moments in Light  ·  ${q.name}`);
  return d.pdf.save();
}

/** Uint8Array → base64 (for email attachments and storage). */
export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
