// Visual comparison against the live Squarespace site.
//
//   node scripts/compare.mjs [outDir] [page ...]
//
// For each page, takes full-page screenshots of the live site and the local dev server
// (http://localhost:4321) at 1440px and 390px, then writes a side-by-side image
// (live on the left, local on the right) cut into screen-height slices for review.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const LIVE = 'https://www.momentsinlight.co.nz';
const LOCAL = process.env.LOCAL_URL ?? 'http://localhost:4321';
const WIDTHS = { desktop: 1440, mobile: 390 };

const [, , outArg = 'compare-out', ...pageArgs] = process.argv;
const out = resolve(outArg);
const pages = pageArgs.length ? pageArgs : ['/', '/weddings', '/blog/ellie-and-ryan-tui-hills'];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function shoot(url, width, file) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: width < 768,
    hasTouch: width < 768,
  });
  const page = await ctx.newPage();
  // Pages with live embeds (contact form, reviews widget) never go fully quiet, so fall back
  // to the normal load event after 30 seconds.
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => page.waitForLoadState('load'));
  // Scroll through so lazy images load, then return to the top.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);
  // Hide floating third-party widgets on the live site (accessibility button, chat bubbles).
  await page.addStyleTag({ content: '[class*="accessib" i],[id*="accessib" i],iframe[title*="chat" i]{display:none!important}' });
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
}

for (const p of pages) {
  const slug = p === '/' ? 'home' : p.replace(/^\//, '').replace(/\//g, '_');
  for (const [label, width] of Object.entries(WIDTHS)) {
    const live = join(out, `${slug}-${label}-live.png`);
    const local = join(out, `${slug}-${label}-local.png`);
    await shoot(LIVE + p, width, live);
    await shoot(LOCAL + p, width, local);

    // Side-by-side slices, rendered by the browser itself.
    const ctx = await browser.newContext({ viewport: { width: width * 2 + 24, height: 100 } });
    const page = await ctx.newPage();
    const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
    await page.setContent(`<body style="margin:0;background:#c00;display:flex;gap:24px;align-items:flex-start">
      <img src="${b64(live)}" style="width:${width}px"><img src="${b64(local)}" style="width:${width}px"></body>`);
    await page.waitForLoadState('load');
    const h = await page.evaluate(() => document.body.scrollHeight);
    const slice = width < 768 ? 1600 : 1800;
    for (let y = 0, i = 1; y < h; y += slice, i++) {
      await page.screenshot({
        path: join(out, `${slug}-${label}-sbs-${String(i).padStart(2, '0')}.png`),
        clip: { x: 0, y, width: width * 2 + 24, height: Math.min(slice, h - y) },
        fullPage: true,
      });
    }
    await ctx.close();
    console.log(`${slug} ${label}: done`);
  }
}

await browser.close();
