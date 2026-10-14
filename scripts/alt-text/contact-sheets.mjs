// Step 1 of writing photo descriptions (alt text).
//
//   node scripts/alt-text/contact-sheets.mjs <outDir> [--only=file,file]
//
// Collects every photo in blog posts (src/content/blog) and imported pages (src/data/pages),
// writes <outDir>/manifest.json (one entry per photo, with an id and the page it sits on),
// and renders numbered contact sheets — 15 small thumbnails per image, never mixing pages —
// so a person (or Claude) can look at the photos and write a description for each.
// Step 2 is scripts/alt-text/apply.mjs, which writes the descriptions back into the files.
import { chromium } from 'playwright';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, ...rest] = process.argv.slice(2);
const only = rest.find((a) => a.startsWith('--only='))?.slice(7).split(',');
mkdirSync(outDir, { recursive: true });

const photos = [];
const add = (file, where, src, alt, title) => photos.push({ id: `${photos.length + 1}`, file, where, src: src.split('?')[0], alt, title });

for (const f of readdirSync('src/content/blog').sort()) {
  if (only && !only.includes(f)) continue;
  const t = readFileSync(join('src/content/blog', f), 'utf8');
  const title = JSON.parse(t.match(/^title: (.*)$/m)?.[1] ?? '""');
  for (const m of t.matchAll(/^  - (\{.*\})$/gm)) {
    let g; try { g = JSON.parse(m[1]); } catch { continue; }
    add(f, 'gallery', g.src, g.alt, title);
  }
  for (const m of t.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) add(f, 'inline', m[2], m[1], title);
}
for (const f of readdirSync('src/data/pages').sort()) {
  if (only && !only.includes(f)) continue;
  const d = JSON.parse(readFileSync(join('src/data/pages', f), 'utf8'));
  d.sections.forEach((s, si) => {
    (s.images || []).forEach((i, ii) => add(f, `section${si}.images.${ii}`, i.src, i.alt, d.title));
    (s.blocks || []).forEach((b, bi) => b.type === 'image' && add(f, `section${si}.blocks.${bi}`, b.image.src, b.image.alt, d.title));
  });
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(photos, null, 1));

// Group into sheets of up to 15, one page/post at a time.
const sheets = [];
let cur = null;
for (const p of photos) {
  if (!cur || cur.file !== p.file || cur.items.length === 15) sheets.push((cur = { file: p.file, items: [] }));
  cur.items.push(p);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
let n = 0;
for (const s of sheets) {
  n++;
  const cells = s.items.map((p) => {
    const thumb = /squarespace-cdn/.test(p.src) && !/\.gif$/i.test(p.src) ? `${p.src}?format=300w` : p.src;
    return `<figure><img src="${thumb}"><figcaption>${p.id}</figcaption></figure>`;
  }).join('');
  await page.setContent(`<style>body{margin:0;font:600 18px sans-serif;background:#fff}
    h1{font-size:15px;margin:6px 10px;font-weight:600}
    main{display:grid;grid-template-columns:repeat(5,256px);gap:4px;padding:0 6px 6px}
    figure{margin:0;position:relative;height:256px;background:#eee;display:grid;place-items:center}
    img{max-width:256px;max-height:256px}
    figcaption{position:absolute;left:0;top:0;background:#c00;color:#fff;padding:2px 6px}</style>
    <h1>${s.file} — ${s.items[0].title.replace(/</g, '&lt;')}</h1><main>${cells}</main>`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.screenshot({ path: join(outDir, `sheet-${String(n).padStart(3, '0')}.png`), clip: { x: 0, y: 0, width: 1300, height: h } });
}
await browser.close();
console.log(`${photos.length} photos, ${sheets.length} sheets`);
