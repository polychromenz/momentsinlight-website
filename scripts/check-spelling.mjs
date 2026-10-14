// Spelling and typo check over the built site (run `npm run build` first).
//
//   node scripts/check-spelling.mjs [--words=extra-words.txt] > report.txt
//
// Reads the visible text of every page in dist/, checks each word against a British English
// dictionary (closest to NZ spelling), and looks for common slips: doubled words, a missing
// space after a full stop, a lowercase "i", and sentences starting in lowercase.
// Nothing is changed — this only produces a list for a person to review.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import nspell from 'nspell';
import dictionary from 'dictionary-en-gb';

const spell = nspell(dictionary);
const extra = process.argv.find((a) => a.startsWith('--words='));
if (extra) readFileSync(extra.slice(8), 'utf8').split(/\r?\n/).filter(Boolean).forEach((w) => spell.add(w.trim()));

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && files.push(p); });
walk('dist');

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#x27;/g, '’').replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

const unknown = new Map(); // word -> { count, pages:Set, sample }
const issues = [];

for (const f of files) {
  const page = '/' + relative('dist', f).replace(/\\/g, '/').replace(/(index)?\.html$/, '').replace(/\/$/, '');
  const html = readFileSync(f, 'utf8');
  const main = (html.match(/<main[\s\S]*?<\/main>/) || [''])[0];
  // Headings and paragraphs become separate lines so sentence checks don't run across them.
  const text = decode(
    main
      .replace(/<(script|style|iframe|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|h[1-6]|li|div|figcaption|blockquote|td|th|a)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Inline formatting (bold, italic, links) must not add spaces: "<b>Word</b>," is "Word,".
      .replace(/<\/?(strong|b|em|i|span|a|u|s|sup|sub|time)\b[^>]*>/gi, '')
      .replace(/<[^>]+>/g, ' ')
  );
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  for (const line of lines) {
    for (const m of line.matchAll(/[A-Za-zÀ-ÿāēīōū]+(?:['’][A-Za-z]+)*/g)) {
      const w = m[0].replace(/’/g, "'");
      if (w.length < 2 || /^[A-Z]{2,}$/.test(w)) continue; // skip acronyms
      if (spell.correct(w) || spell.correct(w.toLowerCase())) continue;
      const key = w;
      const e = unknown.get(key) ?? { count: 0, pages: new Set(), sample: '' };
      e.count++;
      e.pages.add(page);
      if (!e.sample) e.sample = line.slice(Math.max(0, m.index - 50), m.index + w.length + 50);
      unknown.set(key, e);
    }
    const ctx = (i) => line.slice(Math.max(0, i - 45), i + 55);
    for (const m of line.matchAll(/\b(\w+)\s+\1\b/gi)) if (!/^(that|had|is|bye|very|so|ha|no)$/i.test(m[1])) issues.push([page, 'doubled word', ctx(m.index)]);
    for (const m of line.matchAll(/[a-z]{2}[.!?,][A-Z][a-z]/g)) issues.push([page, 'missing space', ctx(m.index)]);
    for (const m of line.matchAll(/(^|\s)i(\s|['’])/g)) issues.push([page, 'lowercase "i"', ctx(m.index)]);
    for (const m of line.matchAll(/[a-z]{2}[.!?]\s+[a-z]/g)) issues.push([page, 'lowercase sentence start', ctx(m.index)]);
    for (const m of line.matchAll(/\s[,.;:](?=\s|$)/g)) issues.push([page, 'space before punctuation', ctx(m.index)]);
  }
}

console.log('=== UNKNOWN WORDS (word | count | pages | example) ===');
[...unknown.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .forEach(([w, e]) => console.log(`${w} | ${e.count} | ${[...e.pages].slice(0, 3).join(' ')}${e.pages.size > 3 ? ` +${e.pages.size - 3}` : ''} | ${e.sample}`));
console.log('\n=== OTHER ISSUES (page | type | context) ===');
const seen = new Set();
issues.forEach((i) => { const k = i.join('|'); if (!seen.has(k)) { seen.add(k); console.log(i.join(' | ')); } });
