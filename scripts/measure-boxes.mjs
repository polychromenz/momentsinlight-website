// Lists every element with a background colour, rounded corners, clip-path or an SVG shape,
// to find section backgrounds, angled dividers and cards.   node scripts/measure-boxes.mjs <url> <width>
import { chromium } from 'playwright';

const [, , url, width = '1440'] = process.argv;
const w = Number(width);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 768, hasTouch: w < 768 });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
await page.waitForTimeout(800);

const rows = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 10) continue;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    const rad = cs.borderRadius !== '0px';
    const clip = cs.clipPath !== 'none';
    const svg = el.tagName === 'svg' || el.tagName === 'path';
    if (!(bg || rad || clip || svg)) continue;
    const cls = (el.className?.baseVal ?? el.className ?? '').toString().split(' ').slice(0, 2).join('.');
    out.push([
      el.tagName.toLowerCase() + (cls ? '.' + cls : ''),
      Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height),
      cs.backgroundColor, cs.borderRadius, clip ? cs.clipPath.slice(0, 80) : '',
      svg ? (el.getAttribute('d') || el.getAttribute('viewBox') || '').slice(0, 90) + ' fill=' + cs.fill : '',
      cs.padding,
    ].join(' | '));
  }
  return out;
});
console.log(rows.join('\n'));
await browser.close();
