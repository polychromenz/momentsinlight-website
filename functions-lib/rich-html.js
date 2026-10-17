// Rich text for the studio CRM (email templates, quote packages, intro and notes), shared by the
// studio's editor, the quote page and the email sender. Text is stored as HTML from the rich
// editor (src/studio/rich-editor.ts); older text written in simple Markdown is converted on the
// fly, so nothing needs migrating.
//
//   toHtml(text)    Markdown or HTML → HTML
//   clean(html)     keep only the formatting the editor makes (safe to show on a page)
//   emailify(html)  the same, with inline styles so Gmail, Outlook and phones show it properly

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const isHtml = (s) => /^\s*</.test(String(s ?? ''));

// ---- Simple Markdown (the original templates) → HTML ----
const inlineMd = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  .replace(/\[([^\]]+)\]\(((?:https?:|mailto:|tel:|\{\{)[^)\s]+)\)/g, '<a href="$2">$1</a>')
  .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
  .replace(/\n/g, '<br>');

export function mdToHtml(md) {
  return String(md ?? '').trim().split(/\n{2,}/).filter(Boolean).map((block) => {
    const b = block.trim();
    const label = b.match(/^\*\*([^*a-z]+)\*\*$/);
    if (label) return `<h3>${esc(label[1].trim())}</h3>`;
    if (/^##\s+/.test(b)) return `<h2>${inlineMd(b.replace(/^##\s+/, ''))}</h2>`;
    const button = b.match(/^\[([^\]]+)\]\(((?:https?:|\{\{)[^)\s]+)\)$/);
    if (button) return `<p><a href="${button[2]}" class="button">${esc(button[1])}</a></p>`;
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l) || !l.trim())) return `<ul>${lines.filter((l) => l.trim()).map((l) => `<li><p>${inlineMd(l.replace(/^\s*[-*]\s+/, ''))}</p></li>`).join('')}</ul>`;
    return `<p>${inlineMd(b)}</p>`;
  }).join('');
}

export const toHtml = (text) => (isHtml(text) ? String(text) : mdToHtml(text));

// ---- Cleaning: only the editor's own formatting survives ----
const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote']);
const COLOR = /^(#[0-9a-f]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))$/i;
const SIZE = /^\d{1,2}(\.\d)?px$/;

function cleanStyle(style) {
  const out = [];
  for (const part of String(style).split(';')) {
    const [k, ...v] = part.split(':');
    const key = (k || '').trim().toLowerCase();
    const val = v.join(':').trim();
    if (key === 'color' && COLOR.test(val)) out.push(`color:${val}`);
    else if (key === 'font-size' && SIZE.test(val)) out.push(`font-size:${val}`);
    else if (key === 'text-align' && /^(left|center|right)$/.test(val)) out.push(`text-align:${val}`);
  }
  return out.join(';');
}
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))?.slice(2).find((x) => x !== undefined);
const safeHref = (h) => (/^(https?:|mailto:|tel:|\{\{\w+\}\})/i.test(h || '') ? h : null);

export function clean(html) {
  return String(html ?? '')
    .replace(/<(script|style|iframe|object|embed|template)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (tag, name) => {
      const n = name.toLowerCase();
      if (!ALLOWED.has(n)) return '';
      if (tag.startsWith('</')) return `</${n}>`;
      if (n === 'br') return '<br>';
      if (n === 'a') {
        const href = safeHref(attr(tag, 'href'));
        if (!href) return '<a>';
        const button = /\bbutton\b/.test(attr(tag, 'class') || '');
        return `<a href="${esc(href)}"${button ? ' class="button"' : ''}>`;
      }
      const style = cleanStyle(attr(tag, 'style') || '');
      return `<${n}${style ? ` style="${style}"` : ''}>`;
    })
    .replace(/<a>([\s\S]*?)<\/a>/g, '$1');
}

// ---- Email: inline styles for every element ----
const FONT = "Raleway,'Helvetica Neue',Arial,sans-serif";
const BASE = {
  p: `margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.75;color:#333333;`,
  h2: `margin:26px 0 10px;font-family:${FONT};font-size:22px;font-weight:300;line-height:1.3;color:#1a1a1a;`,
  h3: `margin:28px 0 6px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#5a5e3b;`,
  ul: `margin:0 0 16px;padding-left:22px;font-family:${FONT};font-size:16px;line-height:1.7;color:#333333;`,
  ol: `margin:0 0 16px;padding-left:22px;font-family:${FONT};font-size:16px;line-height:1.7;color:#333333;`,
  li: 'margin:0 0 6px;',
  blockquote: `margin:0 0 16px;padding:4px 0 4px 18px;border-left:2px solid #a3b07a;font-family:${FONT};color:#1a1a1a;`,
  strong: 'font-weight:600;',
  a: 'color:#5a5e3b;text-decoration:underline;',
};
const BUTTON = (href, label) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;"><tr><td style="background:#5a5e3b;border-radius:14px 0;"><a href="${href}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:14px;font-weight:500;color:#ffffff;text-decoration:none;">${label}</a></td></tr></table>`;

export function emailify(html) {
  let h = clean(html)
    // A paragraph holding just a button link becomes a proper email button.
    .replace(/<p[^>]*>\s*<a href="([^"]*)" class="button">([\s\S]*?)<\/a>\s*<\/p>/g, (m, href, label) => BUTTON(href, label.replace(/<[^>]+>/g, '')))
    // List items' inner paragraphs shouldn't add gaps.
    .replace(/<li>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/li>/g, '<li>$1</li>');
  // Add the base styles, keeping any colour/size/alignment the editor set (those come last, so they win).
  h = h.replace(/<(p|h2|h3|ul|ol|li|blockquote|strong|a)( href="[^"]*")?( class="button")?( style="([^"]*)")?>/g, (m, tag, href = '', cls, s, own = '') => `<${tag}${href} style="${BASE[tag]}${own}">`);
  return h.replace(/<b>/g, '<strong style="font-weight:600;">').replace(/<\/b>/g, '</strong>');
}
