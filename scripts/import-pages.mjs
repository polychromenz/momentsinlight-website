// Imports the main (non-blog) pages of the live Squarespace site into src/data/pages/*.json.
//
//   node scripts/import-pages.mjs <path> [<path> ...] [--force]     e.g. /about /contact
//
// Each page is loaded in a headless browser at 1440px and 390px. For every section the
// script records its background, angled edge, spacing and — for Squarespace's "fluid" grid
// sections — the exact grid position of every block at both widths, plus the block's content
// (text, image, button, embed, list of blog posts). Gallery sections record their photos and
// layout. The site renders these JSON files with src/pages/[...slug].astro.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const SITE = 'https://www.momentsinlight.co.nz';
const OUT = 'src/data/pages';
// Existing pages are skipped unless --force is given, so content fixes made after import
// (see "Content fixes" in docs/project-plan.md) are never overwritten by accident.
const force = process.argv.includes('--force');
const paths = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  .filter((p) => force || !existsSync(`${OUT}/${p.replace(/^\//, '') || 'index'}.json`) || (console.log(`skipped ${p} (already imported; use --force to overwrite)`), false));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function load(path, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
  const page = await ctx.newPage();
  await page.goto(SITE + path, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => page.waitForLoadState('load'));
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1000);
  return { ctx, page };
}

// Runs in the browser. Returns everything about the page we need, for one viewport width.
function extract() {
  const px = (v) => Math.round(parseFloat(v) * 10) / 10 || 0;
  const cs = (el) => getComputedStyle(el);
  const rect = (el) => el.getBoundingClientRect();

  // Keep text formatting, links and the theme's text classes; drop Squarespace editor noise.
  const clean = (root) => {
    const node = root.cloneNode(true);
    node.querySelectorAll('*').forEach((el) => {
      for (const a of [...el.attributes]) {
        const keep =
          (a.name === 'href') || (a.name === 'target') || (a.name === 'rel') ||
          (a.name === 'class' && /sqsrte-|preFade/.test(a.value)) ||
          (a.name === 'style' && /text-align/.test(a.value));
        if (!keep) el.removeAttribute(a.name);
        else if (a.name === 'class') el.setAttribute('class', a.value.split(/\s+/).filter((c) => c.startsWith('sqsrte-')).join(' '));
        else if (a.name === 'style') el.setAttribute('style', (a.value.match(/text-align:\s*\w+/) || [''])[0]);
      }
      if (el.getAttribute('class') === '') el.removeAttribute('class');
      if (el.getAttribute('style') === '') el.removeAttribute('style');
    });
    return node.innerHTML.replace(/\s+\n/g, '\n').trim();
  };
  const imgData = (img) => {
    if (!img) return null;
    const [w, h] = (img.getAttribute('data-image-dimensions') || '').split('x').map(Number);
    const focal = (img.getAttribute('data-image-focal-point') || '0.5,0.5').split(',').map(Number);
    return {
      src: (img.getAttribute('data-src') || img.getAttribute('data-image') || img.currentSrc || img.src || '').split('?')[0],
      alt: img.getAttribute('alt') || '',
      width: w || undefined,
      height: h || undefined,
      focal,
    };
  };

  const sections = [];
  for (const s of document.querySelectorAll('main article > section.page-section, main section.page-section')) {
    if (sections.some((x) => x.el === s)) continue;
    const bgEl = s.querySelector(':scope > .section-border .section-background, :scope > .section-background') || s.querySelector('.section-background');
    const borderEl = s.querySelector(':scope > .section-border') || bgEl;
    const pathEl = s.querySelector('.section-divider-stroke, svg.section-divider-svg-clip path');
    let divider = null;
    if (pathEl) {
      const d = pathEl.getAttribute('d') || '';
      // e.g. "M-100,0.5 L-100,1.5 M2.006, 0.941 …": the second move gives the edge's start.
      // x ≈ 2 means it starts at the right (left side higher); x ≈ -1 means the opposite.
      const re = /M\s*(-?[\d.]+)\s*,\s*([\d.]+)/g;
      const moves = [...d.matchAll(re)];
      const start = d.includes('M-100') ? moves[1] : moves[0];
      if (start) {
        const y = parseFloat(start[2]);
        const h = rect(borderEl).height;
        divider = { leftHigh: parseFloat(start[1]) > 0, px: Math.round((1 - y) * h) };
      }
    }
    const content = s.querySelector('.content-wrapper') || s;
    const info = {
      el: s,
      id: s.getAttribute('data-section-id') || '',
      bg: bgEl ? cs(bgEl).backgroundColor : 'rgba(0, 0, 0, 0)',
      bgImage: imgData(s.querySelector('.section-background img')),
      divider,
      padTop: px(cs(content).paddingTop),
      padBottom: px(cs(content).paddingBottom),
      height: Math.round(rect(s).height),
      // Section themes (e.g. white text on a dark photo) change the default text colours.
      headingColor: (() => { const h = s.querySelector('h1, h2, h3, h4'); return h ? cs(h).color : null; })(),
      textColor: (() => { const p = s.querySelector('.sqs-html-content p'); return p ? cs(p).color : null; })(),
      bgOverlay: (() => { const o = s.querySelector('.section-background-overlay'); return o ? { color: cs(o).backgroundColor, opacity: cs(o).opacity } : null; })(),
    };

    const fluid = s.querySelector('.fluid-engine');
    const gallery = s.querySelector('.gallery-section, [class*="gallery-masonry"], [class*="gallery-slideshow"], [class*="gallery-reel"], [class*="gallery-grid"], [class*="gallery-fullscreen-slideshow"]');
    if (fluid) {
      info.kind = 'fluid';
      const feClass = [...fluid.classList].find((c) => /^fe-[a-z0-9]+$/.test(c));
      const styleText = [...document.querySelectorAll('style')].map((st) => st.textContent).find((t) => feClass && t.includes(`.${feClass} {`)) || '';
      info.styleText = styleText;
      info.blocks = [...fluid.querySelectorAll(':scope > .fe-block')].map((fb) => {
        const id = ([...fb.classList].find((c) => c.startsWith('fe-block-')) || '').slice(9);
        const sb = fb.querySelector('.sqs-block');
        const b = { id, rect: [Math.round(rect(fb).left), Math.round(rect(fb).top + scrollY), Math.round(rect(fb).width), Math.round(rect(fb).height)] };
        if (!sb) return { ...b, type: 'empty' };
        const sbs = cs(sb);
        if (sbs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          b.card = { bg: sbs.backgroundColor, radius: sbs.borderRadius, pad: [px(sbs.paddingTop), px(sbs.paddingRight), px(sbs.paddingBottom), px(sbs.paddingLeft)] };
        }
        const html = sb.querySelector('.sqs-html-content');
        const imgRoot = sb.querySelector('.fluid-image-component-root, .image-block-outer-wrapper');
        const btn = sb.querySelector('a.sqs-block-button-element, .sqs-block-button-container a');
        const summary = sb.querySelector('.summary-block-wrapper');
        const embed = sb.querySelector('.sqs-embed-container, .sqs-code-container, .embed-block-wrapper');
        const social = sb.querySelector('.sqs-svg-icon--list, .social-icons, [class*="socialaccountlinks"]');
        if (html) {
          b.type = 'text';
          b.html = clean(html);
          b.color = cs(html).color;
          // Squarespace insets text inside cards with padding on the text element itself.
          const hs = cs(html);
          b.textPad = [px(hs.paddingTop), px(hs.paddingRight), px(hs.paddingBottom), px(hs.paddingLeft)];
        } else if (imgRoot && imgRoot.querySelector('img')) {
          const img = imgRoot.querySelector('img');
          const box = imgRoot.querySelector('.fluid-image-container, .image-block-wrapper') || img.parentElement;
          b.type = 'image';
          b.image = imgData(img);
          b.fit = /container-fit|image-component-container-fit/.test(imgRoot.className) || cs(img).objectFit === 'contain' ? 'contain' : 'cover';
          b.radius = cs(box).borderRadius !== '0px' ? cs(box).borderRadius : cs(img).borderRadius;
          b.href = imgRoot.querySelector('a[href]')?.getAttribute('href') || null;
          b.caption = imgRoot.querySelector('.image-caption, figcaption')?.textContent.trim() || null;
        } else if (btn) {
          const c = cs(btn);
          const wrap = btn.closest('.sqs-block-button-container') || btn.parentElement;
          b.type = 'button';
          b.text = btn.textContent.trim();
          b.href = btn.getAttribute('href');
          b.target = btn.getAttribute('target');
          b.align = (wrap.className.match(/--(left|center|right)/) || [, 'left'])[1];
          b.stretch = /sqs-stretched/.test(wrap.className);
          b.style = { fontSize: c.fontSize, fontWeight: c.fontWeight, letterSpacing: c.letterSpacing, pad: [px(c.paddingTop), px(c.paddingRight), px(c.paddingBottom), px(c.paddingLeft)], bg: c.backgroundColor, color: c.color, radius: c.borderRadius, border: c.border, w: Math.round(rect(btn).width), h: Math.round(rect(btn).height) };
        } else if (summary) {
          b.type = 'summary';
          b.design = (summary.className.match(/summary-block-setting-design-([a-z-]+)/g) || []).map((x) => x.replace('summary-block-setting-design-', ''));
          b.textSize = (summary.className.match(/summary-block-setting-text-size-(\w+)/) || [, 'medium'])[1];
          b.textAlign = (summary.className.match(/summary-block-setting-text-align-(\w+)/) || [, 'left'])[1];
          const items = [...summary.querySelectorAll('.summary-item')];
          b.items = items.map((it) => ({
            href: it.querySelector('a[href]')?.getAttribute('href'),
            title: it.querySelector('.summary-title')?.textContent.trim() || it.querySelector('a[data-title]')?.getAttribute('data-title') || '',
            // Only keep what the live block actually shows (excerpts are often hidden).
            excerpt: (() => { const e = it.querySelector('.summary-excerpt'); return e && rect(e).height > 0 && cs(e).display !== 'none' ? e.innerText.trim() : ''; })(),
            thumb: imgData(it.querySelector('img')),
            metaText: (() => { const m = it.querySelector('.summary-metadata-container--below-content, .summary-metadata-container'); return m && rect(m).height > 0 ? m.innerText.replace(/\s+/g, ' ').trim() : ''; })(),
          }));
          b.colWidthPct = items[0] ? parseFloat(items[0].style.width) || 100 : 100;
          b.showMore = (() => { const m = summary.querySelector('.summary-read-more-link'); return !!m && rect(m).height > 0; })();
          b.thumbRatio = (() => { const tw = summary.querySelector('.summary-thumbnail'); const pb = tw && parseFloat(tw.style.paddingBottom); return pb || null; })();
          const head = summary.querySelector('.summary-heading');
          b.header = head && head.getBoundingClientRect().height > 0 && cs(head).display !== 'none' && cs(head).visibility !== 'hidden' ? head.textContent.trim() : '';
          b.titleStyle = (() => { const t = summary.querySelector('.summary-title'); if (!t) return null; const c = cs(t); return { fontSize: c.fontSize, color: c.color, fontWeight: c.fontWeight, lineHeight: c.lineHeight }; })();
          b.listRect = (() => { const l = items[0]; return l ? [Math.round(rect(l).width), Math.round(rect(l).height)] : null; })();
        } else if (embed) {
          b.type = 'embed';
          const node = embed.cloneNode(true);
          node.removeAttribute('data-localized');
          node.querySelectorAll('[class*="elfsight-app"]').forEach((el) => { el.innerHTML = ''; });
          node.querySelectorAll('iframe').forEach((f) => { f.removeAttribute('style'); });
          b.html = node.innerHTML.replace(/<!--[\s\S]*?-->/g, '').trim();
          b.height = Math.round(rect(embed).height);
        } else if (social) {
          b.type = 'social';
          b.links = [...sb.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
        } else if (/spacer/.test(sb.className)) {
          b.type = 'spacer';
        } else if (sb.querySelector('hr, .horizontalrule-block, [class*="line-block"]') || /horizontalrule|line-block/.test(sb.className)) {
          b.type = 'line';
        } else {
          b.type = 'unknown';
          b.html = sb.innerHTML.slice(0, 400);
        }
        return b;
      });
    } else if (gallery) {
      info.kind = 'gallery';
      const cls = (s.querySelector('[class*="gallery-masonry"], [class*="gallery-slideshow"], [class*="gallery-reel"], [class*="gallery-grid"], [class*="gallery-fullscreen-slideshow"]') || gallery).className;
      info.design = (cls.match(/gallery-(masonry|fullscreen-slideshow|slideshow|reel|grid)/) || [, 'grid'])[1];
      const items = [...s.querySelectorAll('figure, .gallery-masonry-item, .gallery-slideshow-item, .gallery-reel-item, .gallery-grid-item')]
        .filter((f, i, arr) => !arr.some((o) => o !== f && o.contains(f)) && f.querySelector('img'));
      const seen = new Set();
      info.images = items.map((it) => {
        const i = imgData(it.querySelector('img'));
        return { ...i, href: it.querySelector('a[href]')?.getAttribute('href') || null, title: it.querySelector('.gallery-caption, figcaption')?.textContent.trim() || null };
      }).filter((i) => i.src && !seen.has(i.src) && seen.add(i.src));
      const wrap = s.querySelector('[class*="gallery-masonry-wrapper"], [class*="gallery-slideshow-wrapper"], [class*="gallery-reel-wrapper"], [class*="gallery-grid-wrapper"], .gallery-fullscreen-slideshow') || gallery;
      info.galleryRect = [Math.round(rect(wrap).left), Math.round(rect(wrap).width), Math.round(rect(wrap).height)];
      const lefts = [...new Set(items.slice(0, 20).map((it) => Math.round(rect(it).left)))].sort((a, b) => a - b);
      info.columns = lefts.length;
      info.colGap = lefts.length > 1 && items[0] ? Math.round(lefts[1] - lefts[0] - rect(items[0]).width) : 0;
      info.itemH = items[0] ? Math.round(rect(items[0]).height) : 0;
      info.itemW = items[0] ? Math.round(rect(items[0]).width) : 0;
    } else {
      info.kind = 'other';
      info.html = s.innerText.slice(0, 300);
    }
    sections.push(info);
  }

  // Typography samples so the renderer can match heading and paragraph sizes.
  const type = {};
  for (const sel of ['h1', 'h2', 'h3', 'h4', 'p', 'p.sqsrte-large', 'p.sqsrte-small']) {
    const el = document.querySelector(`main .sqs-html-content ${sel}`);
    if (el) { const c = cs(el); type[sel] = [c.fontSize, c.fontWeight, c.lineHeight, c.letterSpacing, c.color]; }
  }
  return {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || '',
    ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
    type,
    sections: sections.map(({ el, ...rest }) => rest),
  };
}

// Pull grid rows and per-block grid positions out of a fluid section's CSS.
function parseFluidCss(css) {
  if (!css) return null;
  const media = css.indexOf('@media (min-width: 768px)');
  const mobileCss = media >= 0 ? css.slice(0, media) : css;
  const deskCss = media >= 0 ? css.slice(media) : '';
  const mRows = mobileCss.match(/grid-template-rows:\s*repeat\((\d+),\s*minmax\(([\d.]+)px/);
  const dRows = deskCss.match(/grid-template-rows:\s*repeat\((\d+),/);
  const scale = deskCss.match(/--row-height-scaling-factor:\s*([\d.]+)/);
  const mGap = mobileCss.match(/row-gap:\s*([\d.]+)px/);
  const dGap = deskCss.match(/row-gap:\s*([\d.]+)px/);
  const areas = {};
  const re = /\.fe-block-([\w-]+)\s*\{\s*grid-area:\s*([^;]+);\s*z-index:\s*(\d+)/g;
  let m;
  while ((m = re.exec(css))) {
    const a = (areas[m[1]] ??= {});
    if (!a.m) { a.m = m[2].trim(); a.zm = +m[3]; }
    else { a.d = m[2].trim(); a.zd = +m[3]; }
  }
  const align = {};
  const re2 = /\.fe-block-([\w-]+)\s+\.sqs-block\s*\{\s*justify-content:\s*([\w-]+)/g;
  while ((m = re2.exec(css))) {
    const a = (align[m[1]] ??= []);
    a.push(m[2]);
  }
  return {
    mRows: mRows ? +mRows[1] : 1,
    mRowMin: mRows ? +mRows[2] : 24,
    dRows: dRows ? +dRows[1] : 1,
    dScale: scale ? +scale[1] : 0.0215,
    mGap: mGap ? +mGap[1] : 11,
    dGap: dGap ? +dGap[1] : mGap ? +mGap[1] : 11,
    areas,
    valign: Object.fromEntries(Object.entries(align).map(([k, v]) => [k, { m: v[0], d: v[1] ?? v[0] }])),
  };
}

for (const path of paths) {
  const slug = path.replace(/^\//, '');
  try {
    const desk = await load(path, 1440);
    const D = await desk.page.evaluate(extract);
    await desk.ctx.close();
    const mob = await load(path, 390);
    const M = await mob.page.evaluate(extract);
    await mob.ctx.close();

    const notes = [];
    const sections = D.sections.map((s, i) => {
      const ms = M.sections[i] || {};
      const out = {
        id: s.id,
        kind: s.kind,
        bg: s.bg,
        bgImage: s.bgImage,
        bgOverlay: s.bgOverlay,
        headingColor: s.headingColor,
        textColor: s.textColor,
        divider: s.divider ? { leftHigh: s.divider.leftHigh, d: s.divider.px, m: ms.divider?.px ?? Math.round(s.divider.px * 0.27) } : null,
        pad: { d: [s.padTop, s.padBottom], m: [ms.padTop ?? s.padTop, ms.padBottom ?? s.padBottom] },
        height: { d: s.height, m: ms.height },
      };
      if (s.kind === 'fluid') {
        out.grid = parseFluidCss(s.styleText);
        const mBlocks = Object.fromEntries((ms.blocks || []).map((b) => [b.id, b]));
        out.blocks = s.blocks.map((b) => {
          const mb = mBlocks[b.id] || {};
          if (b.type === 'unknown') notes.push(`unknown block in section ${i}: ${b.html.slice(0, 120)}`);
          const r = { ...b, area: out.grid?.areas[b.id] ?? null, valign: out.grid?.valign[b.id] ?? null };
          if (b.card) r.card = { ...b.card, padM: mb.card?.pad ?? b.card.pad };
          if (b.type === 'button') r.styleM = mb.style ?? b.style;
          if (b.type === 'text') r.textPadM = mb.textPad ?? [0, 0, 0, 0];
          if (b.type === 'embed') r.heightM = mb.height;
          if (b.type === 'summary') r.colWidthPctM = mb.colWidthPct;
          delete r.rect;
          return r;
        });
        delete out.grid.areas;
        delete out.grid.valign;
      } else if (s.kind === 'gallery') {
        Object.assign(out, {
          design: s.design,
          images: s.images,
          layout: {
            d: { rect: s.galleryRect, columns: s.columns, gap: s.colGap, itemH: s.itemH, itemW: s.itemW },
            m: { rect: ms.galleryRect, columns: ms.columns, gap: ms.colGap, itemH: ms.itemH, itemW: ms.itemW },
          },
        });
      } else {
        notes.push(`unrecognised section ${i}: ${s.html?.slice(0, 120)}`);
      }
      return out;
    });

    const data = { path, title: D.title, description: D.description, ogImage: D.ogImage.split('?')[0], type: { d: D.type, m: M.type }, sections };
    writeFileSync(`${OUT}/${slug || 'index'}.json`, JSON.stringify(data, null, 1));
    console.log(`imported ${path}: ${sections.map((s) => s.kind + (s.blocks ? `(${s.blocks.length})` : s.images ? `[${s.design} ${s.images.length}]` : '')).join(' ')}`);
    notes.forEach((n) => console.log(`  NOTE ${n}`));
  } catch (e) {
    console.log(`FAILED ${path}: ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
