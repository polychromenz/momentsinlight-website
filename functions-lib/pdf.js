// PDFs for the studio CRM (pdf-lib, runs on Cloudflare): the accepted quote, and the signed
// contract. A4, the logo on top, Helvetica (the built-in PDF font), the site's greens.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { clean, toHtml } from './rich-html.js';
import { longDate, payments } from './quotes.js';

const money = (c) => `$${(c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SITE = 'https://www.momentsinlight.co.nz';
const GREEN = rgb(0x5a / 255, 0x5e / 255, 0x3b / 255);
const INK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.9, 0.88, 0.84);
const A4 = [595.28, 841.89];
const M = 50; // margin

// The built-in font only covers Windows-1252: keep everything else readable (ā → a etc.).
const CP1252 = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const safe = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[‐‑]/g, '-').replace(/ /g, ' ').replace(/[✓✔]/g, '').replace(/♥/g, '')
  .split('').filter((c) => c === '\n' || (c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 256 && !(c.charCodeAt(0) >= 0x80 && c.charCodeAt(0) < 0xa0)) || CP1252.has(c)).join('');

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
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { const r = await fetch(`${SITE}/email/logo.png`); if (r.ok) logo = await pdf.embedPng(new Uint8Array(await r.arrayBuffer())); } catch { /* the PDF still works without it */ }
  let page; let y;
  const W = A4[0] - 2 * M;
  const newPage = () => { page = pdf.addPage(A4); y = A4[1] - M; };
  const need = (h) => { if (y - h < M + 20) newPage(); };
  newPage();
  if (logo) { const w = 96; const hh = (logo.height / logo.width) * w; page.drawImage(logo, { x: A4[0] / 2 - w / 2, y: y - hh, width: w, height: hh }); y -= hh + 22; }

  /** Write runs of text, wrapped to the width. */
  const write = (runs, { size = 10.5, indent = 0, color = INK, gap = 6, lead = 1.45 } = {}) => {
    const words = [];
    for (const r of runs) for (const [i, piece] of safe(r.text).split('\n').entries()) {
      if (i > 0) words.push({ br: true });
      for (const w of piece.split(/(\s+)/)) if (w) words.push({ w, bold: r.bold });
    }
    let line = []; let width = 0;
    const flush = () => {
      need(size * lead);
      let x = M + indent;
      for (const t of line) { const f = t.bold ? bold : font; page.drawText(t.w, { x, y: y - size, size, font: f, color }); x += f.widthOfTextAtSize(t.w, size); }
      y -= size * lead; line = []; width = 0;
    };
    for (const t of words) {
      if (t.br) { flush(); continue; }
      const f = t.bold ? bold : font;
      const tw = f.widthOfTextAtSize(t.w, size);
      if (width + tw > W - indent && line.length && t.w.trim()) { flush(); if (!t.w.trim()) continue; }
      if (!line.length && !t.w.trim()) continue;
      line.push(t); width += tw;
    }
    if (line.length) flush();
    y -= gap;
  };
  const label = (text) => {
    need(30); y -= 8;
    page.drawText(safe(text.toUpperCase()), { x: M, y: y - 8.5, size: 8.5, font: bold, color: GREEN, characterSpacing: 0.6 });
    y -= 8.5 * 1.45 + 2;
  };
  const rule = () => { need(10); page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: LINE }); y -= 10; };
  /** Rows of [left, right] (right aligned). */
  const rows = (items, { size = 10.5, boldLast = false } = {}) => {
    items.forEach(([l, r], i) => {
      const f = boldLast && i === items.length - 1 ? bold : font;
      need(size * 1.7);
      page.drawText(safe(l), { x: M, y: y - size, size, font: f, color: INK });
      const rt = safe(r);
      page.drawText(rt, { x: A4[0] - M - f.widthOfTextAtSize(rt, size), y: y - size, size, font: f, color: INK });
      y -= size * 1.7;
    });
    y -= 4;
  };
  const html = (h) => {
    for (const b of blocks(h)) {
      if (b.kind === 'h2') write(b.runs.map((r) => ({ ...r, bold: true })), { size: 13, gap: 4 });
      else if (b.kind === 'h3') label(b.runs.map((r) => r.text).join(''));
      else if (b.kind === 'li') write([{ text: '•  ' }, ...b.runs], { indent: 12, gap: 3 });
      else write(b.runs);
    }
  };
  const footer = (text) => pdf.getPages().forEach((p, i, all) => {
    const t = safe(`${text}  ·  Page ${i + 1} of ${all.length}`);
    p.drawText(t, { x: A4[0] / 2 - font.widthOfTextAtSize(t, 8) / 2, y: 26, size: 8, font, color: GREY });
  });
  return { pdf, write, label, rule, rows, html, footer, get y() { return y; } };
}

const FROM = ['Moments in Light', 'Tony Gorham', '021 625 943', 'tony@momentsinlight.co.nz', '985a Hibiscus Coast Highway, Waiwera, Auckland 0994'];

/** The quote as accepted (or as it stands). q = parsed quote; job = job + client. */
export async function quotePdf(q, job, number) {
  const d = await setup();
  const accepted = q.status === 'accepted';
  d.write([{ text: accepted ? 'Accepted quote' : 'Quote', bold: true }], { size: 20, gap: 2 });
  d.write([{ text: `Quote ${number}  ·  Issued ${longDate((q.sent_at || q.created_at).slice(0, 10))}${q.valid_until && !accepted ? `  ·  Valid until ${longDate(q.valid_until)}` : ''}` }], { size: 9.5, color: GREY, gap: 10 });
  d.label('From');
  d.write([{ text: FROM.join('\n') }], { size: 10, gap: 4 });
  d.label('For');
  d.write([{ text: [`${job.first_name} ${job.last_name}`.trim(), job.email, job.address, job.event_date && `Wedding: ${longDate(job.event_date)}`, job.venue].filter(Boolean).join('\n') }], { size: 10, gap: 4 });
  d.rule();
  const pick = accepted ? q.chosen_package : Math.max(0, q.packages.findIndex((p) => p.recommended));
  const pkg = q.packages[pick];
  const extras = (accepted ? q.chosen_extras : []).map((i) => q.extras[i]).filter(Boolean);
  if (pkg) {
    d.label(accepted ? 'Your package' : 'Package');
    d.write([{ text: `${pkg.name}${pkg.subtitle ? ` (${pkg.subtitle})` : ''}`, bold: true }], { size: 13, gap: 4 });
    d.html(pkg.description);
  }
  d.label('Summary');
  const subtotal = (pkg?.price ?? 0) + extras.reduce((a, x) => a + x.price, 0);
  const total = accepted ? q.total : Math.max(0, subtotal - (q.discount || 0));
  d.rows([
    [pkg ? pkg.name : 'Package', money(pkg?.price ?? 0)],
    ...extras.map((x) => [x.name, money(x.price)]),
    ...(q.discount ? [[q.discount_label || 'Discount', `-${money(q.discount)}`]] : []),
    ['GST (15%, included)', money(Math.round((total * 3) / 23))],
    ['Total (incl. GST)', money(total)],
  ], { boldLast: true });
  d.label('Payment schedule');
  d.rows(payments(q.schedule, total, job.event_date, (q.accepted_at || new Date().toISOString()).slice(0, 10))
    .map((p) => [`${p.label} (${p.percent}%)  ·  ${p.onAccept ? 'on acceptance' : `by ${longDate(p.due)}`}`, money(p.amount)]));
  if (q.notes) { d.label('Notes'); d.html(q.notes); }
  if (accepted) {
    d.rule();
    d.write([{ text: `Accepted online by ${q.accepted_name} on ${new Date(q.accepted_at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'long', timeStyle: 'short' })} (NZ time).` }], { size: 9.5, color: GREY });
  }
  d.footer(`Moments in Light  ·  Quote ${number}`);
  return d.pdf.save();
}

/** The contract, with its event details and (once signed) the signature record. */
export async function contractPdf(c) {
  const d = await setup();
  const det = JSON.parse(c.details || '{}');
  d.write([{ text: c.name, bold: true }], { size: 20, gap: det.note ? 2 : 10 });
  if (det.note) d.write([{ text: det.note }], { size: 10, color: GREY, gap: 10 });
  d.label('Between');
  d.write([{ text: `${FROM[0]} (Photographer), ${FROM.slice(2).join(', ')}` }], { size: 10, gap: 2 });
  d.write([{ text: `and ${det.client || ''} (Client)${det.address ? `, ${det.address.replace(/\n/g, ', ')}` : ''}${det.email ? `, ${det.email}` : ''}` }], { size: 10, gap: 4 });
  d.label('The Event');
  d.rows([
    ['Wedding date', det.event_date_long || ''],
    ['Venue', det.venue || ''],
    ['Package', det.package || ''],
    ['Total (incl. GST)', det.total || ''],
  ]);
  if (det.payments?.length) { d.label('Payment schedule'); d.rows(det.payments.map((p) => [p.label, p.amount])); }
  d.rule();
  d.html(c.body);
  d.rule();
  d.label('Signature');
  if (c.status === 'signed') {
    d.write([{ text: `Signed electronically by ${c.signed_name} on ${new Date(c.signed_at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'long', timeStyle: 'short' })} (NZ time).` }], { size: 10.5, gap: 2 });
    d.write([{ text: `IP address ${c.signed_ip || 'unknown'}  ·  Contract fingerprint (SHA-256) ${c.fingerprint}` }], { size: 8, color: GREY, gap: 2 });
    d.write([{ text: 'Electronic signatures are valid under the Contract and Commercial Law Act 2017 (New Zealand).' }], { size: 8, color: GREY });
  } else {
    d.write([{ text: 'Not signed yet.' }], { size: 10.5, color: GREY });
  }
  d.footer(`Moments in Light  ·  ${c.name}`);
  return d.pdf.save();
}

/** Uint8Array → base64 (for email attachments and storage). */
export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
