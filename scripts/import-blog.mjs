// Imports blog posts from the live Squarespace site into src/content/blog/*.md.
//
//   node scripts/import-blog.mjs <urls.txt> [--force] [--only=slug,slug]
//
// <urls.txt> lists site paths, one per line; only /blog/<slug> entries are used.
// Each post's data comes from Squarespace's JSON view (?format=json). The post body is
// converted to Markdown in a headless browser so real DOM parsing can be used.
// Existing files are kept unless --force is given. A report of anything that needs a
// human look (unknown blocks, mid-post galleries, possible song lyrics) is printed at the end.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://www.momentsinlight.co.nz';
const OUT = 'src/content/blog';
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const urls = readFileSync(args.find((a) => !a.startsWith('--')), 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => /^\/blog\/[^/]+$/.test(s))
  .filter((s) => !only || only.includes(s.slice(6)));

mkdirSync(OUT, { recursive: true });
const report = [];
const browser = await chromium.launch();
const page = await browser.newPage();

const decode = (s = '') =>
  s.replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const yaml = (s) => JSON.stringify(s ?? ''); // JSON strings are valid YAML scalars

for (const path of urls) {
  const slug = path.slice(6);
  const file = join(OUT, `${slug}.md`);
  if (existsSync(file) && !force) {
    report.push(`${slug}: skipped (already exists)`);
    continue;
  }
  const res = await fetch(`${SITE}${path}?format=json`, { headers: { 'user-agent': 'Mozilla/5.0 (site migration)' } });
  if (!res.ok) {
    report.push(`${slug}: HTTP ${res.status}`);
    continue;
  }
  const json = await res.json();
  const item = json.item;

  await page.setContent(`<div id="root">${item.body}</div>`);
  const conv = await page.evaluate(() => {
    const notes = [];
    const esc = (t) => t.replace(/([*_\[\]<>`\\])/g, '\\$1');
    const inline = (node) => {
      let out = '';
      for (const n of node.childNodes) {
        if (n.nodeType === 3) out += esc(n.textContent.replace(/\s+/g, ' '));
        else if (n.nodeType === 1) {
          const tag = n.tagName.toLowerCase();
          const inner = inline(n);
          if (tag === 'br') out += '\\\n';
          else if (tag === 'strong' || tag === 'b') out += inner.trim() ? `**${inner.trim()}**${/\s$/.test(inner) ? ' ' : ''}` : inner;
          else if (tag === 'em' || tag === 'i') out += inner.trim() ? `*${inner.trim()}*${/\s$/.test(inner) ? ' ' : ''}` : inner;
          else if (tag === 'a') out += `[${inner.trim()}](${n.getAttribute('href')})`;
          else if (tag === 'code') out += '`' + n.textContent + '`';
          else out += inner;
        }
      }
      return out;
    };
    // List items can hold several paragraphs and nested lists; keep them as separate lines
    // (a Markdown line break) instead of running the text together.
    const listMd = (list, depth) => {
      let i = 1;
      const pad = '   '.repeat(depth);
      return [...list.children].map((li) => {
        const marker = list.tagName === 'OL' ? `${i++}.` : '-';
        const paras = [];
        const nested = [];
        let loose = '';
        for (const c of li.childNodes) {
          if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) nested.push(listMd(c, depth + 1));
          else if (c.nodeType === 1 && /^(P|DIV|H[1-6])$/.test(c.tagName)) { if (loose.trim()) paras.push(loose.trim()); loose = ''; const t = inline(c).trim(); if (t) paras.push(t); }
          else loose += c.nodeType === 3 ? esc(c.textContent.replace(/\s+/g, ' ')) : inline({ childNodes: [c] });
        }
        if (loose.trim()) paras.push(loose.trim());
        return `${pad}${marker} ${paras.join(`\\\n${pad}   `)}` + (nested.length ? '\n' + nested.join('\n') : '');
      }).join('\n');
    };
    const blockMd = (el) => {
      const parts = [];
      for (const n of el.children) {
        const tag = n.tagName.toLowerCase();
        const text = inline(n).replace(/[ \t]+\n/g, '\n').trim();
        if (/^h[1-6]$/.test(tag)) {
          if (text) parts.push(`${'#'.repeat(Math.max(2, +tag[1]))} ${text}`);
        } else if (tag === 'p') {
          if (text) parts.push(text.replace(/^(#|[-+] |\d+\. )/, '\\$1'));
        } else if (tag === 'ul' || tag === 'ol') {
          parts.push(listMd(n, 0));
        } else if (tag === 'blockquote') {
          parts.push(blockMd(n).split('\n').map((l) => `> ${l}`).join('\n'));
        } else if (tag === 'hr') parts.push('---');
        else if (text) parts.push(text);
      }
      return parts.join('\n\n');
    };
    const imgInfo = (img) => {
      const [w, h] = (img.getAttribute('data-image-dimensions') || '').split('x').map(Number);
      return {
        src: (img.getAttribute('data-src') || img.getAttribute('data-image') || img.getAttribute('src') || '').split('?')[0],
        alt: (img.getAttribute('alt') || '').replace(/\.(jpe?g|png|webp)$/i, '').replace(/^[_A-Z0-9-]+$/i, '').trim(),
        ...(w && h ? { width: w, height: h } : {}),
      };
    };

    const body = [];
    const galleries = [];
    for (const block of document.querySelectorAll('#root .sqs-block')) {
      if (block.parentElement.closest('.sqs-block')) continue;
      const cls = block.className;
      if (block.querySelector('.sqs-html-content')) {
        const md = blockMd(block.querySelector('.sqs-html-content'));
        if (md) body.push(md);
      } else if (/gallery-block/.test(cls)) {
        const imgs = [...block.querySelectorAll('img')].map(imgInfo).filter((i) => i.src);
        const seen = new Set();
        const unique = imgs.filter((i) => !seen.has(i.src) && seen.add(i.src));
        let design = '';
        try { design = JSON.parse(block.getAttribute('data-block-json') || '{}').design || ''; } catch {}
        if (!design) design = (cls + ' ' + block.innerHTML.slice(0, 2000)).match(/sqs-gallery-(?:design|block)-(grid|stacked|autocolumns|autogrid|carousel|slideshow|strip)/)?.[1] || 'grid';
        galleries.push({ at: body.length, design, images: unique });
        body.push(`%%GALLERY${galleries.length - 1}%%`);
      } else if (/image-block/.test(cls) && block.querySelector('img')) {
        const i = imgInfo(block.querySelector('img'));
        const link = block.querySelector('a[href]')?.getAttribute('href');
        const md = `![${i.alt}](${i.src})`;
        body.push(link ? `[${md}](${link})` : md);
      } else if (/video-block|embed-block|code-block/.test(cls)) {
        const json = block.getAttribute('data-block-json');
        let html = '';
        try { html = JSON.parse(json || '{}').html || ''; } catch {}
        // Code blocks carry their HTML (tables, embeds) inside .sqs-code-container.
        if (!html) html = block.querySelector('.sqs-code-container')?.innerHTML.replace(/<!--[\s\S]*?-->/g, '') || '';
        if (!html) html = block.querySelector('iframe')?.outerHTML || '';
        // Markdown treats blank lines inside raw HTML as the end of the HTML, so remove them.
        html = html.replace(/\n\s*\n/g, '\n');
        if (html) body.push(html.trim());
        else notes.push(`empty ${cls.match(/[a-z]+-block/)?.[0]}`);
      } else if (/button-block/.test(cls)) {
        const a = block.querySelector('a');
        if (a) body.push(`[${a.textContent.trim()}](${a.getAttribute('href')})`);
      } else if (/quote-block/.test(cls)) {
        body.push(`> ${block.textContent.replace(/\s+/g, ' ').trim()}`);
      } else if (/horizontalrule-block|line-block/.test(cls)) {
        body.push('---');
      } else if (/spacer-block/.test(cls)) {
        // layout only
      } else {
        notes.push(`unhandled block: ${(cls.match(/sqs-block-([a-z0-9-]+)/g) || [cls.slice(0, 60)]).join(' ')}`);
      }
    }
    return { body, galleries, notes };
  });

  // The gallery that ends the post becomes the post's gallery (layout chosen in Pages CMS);
  // galleries in the middle of the text stay where they are as individual images.
  let frontGallery = null;
  const lastIdx = conv.galleries.length - 1;
  if (lastIdx >= 0 && conv.body.slice(conv.galleries[lastIdx].at + 1).every((p) => p.length < 400)) {
    frontGallery = conv.galleries[lastIdx];
  }
  const body = conv.body
    .map((p) => {
      const m = p.match(/^%%GALLERY(\d+)%%$/);
      if (!m) return p;
      const g = conv.galleries[+m[1]];
      if (g === frontGallery) return null;
      report.push(`${slug}: gallery in the middle of the post kept as ${g.images.length} inline images`);
      return g.images.map((i) => `![${i.alt}](${i.src})`).join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n');

  const plain = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*>\\_[\]()]/g, '').replace(/\s+/g, ' ').trim();
  const seo = item.seoData || {};
  const description = decode(seo.seoDescription || item.excerpt?.replace(/<[^>]+>/g, '') || plain.slice(0, 155)).trim();
  const fm = [
    '---',
    `title: ${yaml(decode(item.title))}`,
    seo.seoTitle ? `seoTitle: ${yaml(decode(seo.seoTitle).trim())}` : null,
    `description: ${yaml(description)}`,
    `date: ${new Date(item.publishOn).toISOString()}`,
    item.updatedOn ? `updated: ${new Date(item.updatedOn).toISOString()}` : null,
    `author: ${yaml(item.author?.displayName || 'Tony Gorham')}`,
    `categories: ${JSON.stringify(item.categories || [])}`,
    `tags: ${JSON.stringify(item.tags || [])}`,
    item.assetUrl ? `thumbnail: ${yaml(item.assetUrl.split('?')[0])}` : null,
    frontGallery ? 'gallery:' : null,
    ...(frontGallery ? frontGallery.images.map((i) => `  - ${JSON.stringify(i)}`) : []),
    '---',
    '',
  ].filter((l) => l !== null);

  writeFileSync(file, fm.join('\n') + body + '\n');
  conv.notes.forEach((n) => report.push(`${slug}: ${n}`));
  // Flag anything that looks like quoted song lyrics so a person can check it.
  if (/lyric|♪|♫|sang along|\bverse\b|\bchorus\b/i.test(plain)) report.push(`${slug}: mentions lyrics/songs — check before publishing`);
  console.log(`imported ${slug} (${body.length} chars${frontGallery ? `, ${frontGallery.images.length}-photo ${frontGallery.design} gallery` : ''})`);
  await new Promise((r) => setTimeout(r, 300));
}

await browser.close();
console.log('\n--- report ---\n' + (report.join('\n') || 'nothing to report'));
