// One-off survey: which Squarespace section and block types each live page uses.
//   node scripts/survey-live.mjs <urls.txt> > survey.txt
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const urls = readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(Boolean);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const path of urls) {
  try {
    await page.goto('https://www.momentsinlight.co.nz' + path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const info = await page.evaluate(() => {
      const sections = [...document.querySelectorAll('main section.page-section, main article, main .blog-item-wrapper')].map((s) => {
        const kind = s.classList.contains('page-section')
          ? (s.querySelector('.fluid-engine') ? 'fluid'
            : s.className.match(/gallery-section|user-items-list-section|blog-section|collection-type-[a-z-]+/)?.[0] ?? (s.getAttribute('data-section-theme') ? 'other' : 'other'))
          : s.tagName.toLowerCase();
        const blocks = [...s.querySelectorAll('.sqs-block')].map((b) =>
          (b.className.match(/sqs-block-([a-z0-9-]+)|([a-z0-9-]+-block)\b/g) || []).filter((c) => !/sqs-block-content|sqs-block-alignment/.test(c))[0] ?? 'unknown',
        );
        const counts = {};
        blocks.forEach((b) => (counts[b] = (counts[b] || 0) + 1));
        return `${kind}${Object.keys(counts).length ? ' {' + Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(',') + '}' : ''}`;
      });
      const gal = [...document.querySelectorAll('main [class*="gallery-"], main [data-section-id] .user-items-list')].map((g) => g.className.split(' ').filter((c) => /gallery-|user-items-list-(simple|carousel|banner)|list-/.test(c)).slice(0, 2).join('.')).filter(Boolean);
      return { sections, gal: [...new Set(gal)].slice(0, 6), iframes: [...document.querySelectorAll('main iframe, main script[src]')].map((f) => (f.src || '').slice(0, 70)).slice(0, 4) };
    });
    console.log(`${path}\n  sections: ${info.sections.join(' | ')}\n  galleries: ${info.gal.join(', ')}\n  embeds: ${info.iframes.join(', ')}`);
  } catch (e) {
    console.log(`${path}\n  ERROR ${e.message.split('\n')[0]}`);
  }
  await page.waitForTimeout(400);
}
await browser.close();
