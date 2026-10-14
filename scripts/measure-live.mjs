// Prints sizes, spacing, fonts and colours of key elements on a page, so the rebuild
// can be matched to the live site numerically.   node scripts/measure-live.mjs <url> <width>
import { chromium } from 'playwright';

const [, , url, width = '1440'] = process.argv;
const w = Number(width);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 768, hasTouch: w < 768 });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(800);

const rows = await page.evaluate(() => {
  const pick = 'header, header img, header nav a, header .btn, header a[class*="button"], h1, h2, h3, main p, main li, main a, main img, main section, main article, footer, footer img, footer p, footer a';
  const seen = new Set();
  const out = [];
  for (const el of document.querySelectorAll(pick)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    const text = (el.innerText || el.alt || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const key = `${el.tagName}${Math.round(r.top + scrollY)}${Math.round(r.left)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([
      el.tagName.toLowerCase(),
      Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height),
      cs.fontSize, cs.fontWeight, cs.lineHeight, cs.letterSpacing, cs.color, cs.backgroundColor,
      cs.borderRadius, cs.textAlign, cs.paddingTop + '/' + cs.paddingLeft, el.tagName === 'IMG' ? cs.objectFit : '',
      text,
    ].join(' | '));
  }
  return out;
});
console.log(`doc height ${await page.evaluate(() => document.body.scrollHeight)}`);
console.log('tag | x | y | w | h | size | weight | lh | ls | color | bg | radius | align | pad t/l | fit | text');
console.log(rows.join('\n'));
await browser.close();
