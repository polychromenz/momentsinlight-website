// Switches the site from Squarespace photo addresses to the Cloudflare Images uploads.
//
//   node scripts/use-uploaded-images.mjs --dry-run
//   node scripts/use-uploaded-images.mjs
//
// For every photo matched (docs/image-matches.json) and uploaded (docs/image-uploads.json),
// replaces its Squarespace address in src/ with https://imagedelivery.net/<hash>/<id>/public,
// and where the photo's width and height are recorded next to it (blog galleries, imported
// pages), updates them to the export's, in case it was cropped differently.
// Photos not uploaded yet keep their Squarespace address, so this can be run after each upload.
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const matches = JSON.parse(fs.readFileSync('docs/image-matches.json', 'utf8'));
const uploads = JSON.parse(fs.readFileSync('docs/image-uploads.json', 'utf8'));
if (!uploads.accountHash) throw new Error('No account hash in docs/image-uploads.json yet.');

const swap = new Map();
for (const [url, r] of Object.entries(matches)) {
  if (r.status !== 'matched' || !r.file) continue;
  const id = `${r.folder}/${r.tone}/${path.basename(r.file, path.extname(r.file))}`;
  const up = uploads.images[id];
  if (up) swap.set(url, { to: `https://imagedelivery.net/${uploads.accountHash}/${id}/public`, ...up });
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let changedFiles = 0, replaced = 0;
for (const file of walk('src').filter((f) => /\.(md|json|astro|ts)$/.test(f))) {
  const before = fs.readFileSync(file, 'utf8');
  let text = before;
  for (const [url, s] of swap) {
    if (!text.includes(url)) continue;
    // The address, with any ?format=… after it.
    const re = new RegExp(`${esc(url)}(\\?[^\\s"'\`)]*)?`, 'g');
    // Width/height on the same line as the address (blog gallery entries).
    text = text.replace(new RegExp(`^.*${esc(url)}.*$`, 'gm'), (line) =>
      line.replace(/(\bwidth["']?\s*:\s*)\d+/, `$1${s.width}`).replace(/(\bheight["']?\s*:\s*)\d+/, `$1${s.height}`));
    // Width/height on the following lines of the same list entry (block-style YAML).
    text = text.replace(new RegExp(`(- src: ["']?${esc(url)}["']?\\n)((?: {2,}\\w+:.*\\n)*)`, 'g'), (m, first, rest) =>
      first + rest.replace(/^(\s+width:\s*)\d+/m, `$1${s.width}`).replace(/^(\s+height:\s*)\d+/m, `$1${s.height}`));
    const n = (text.match(re) || []).length;
    replaced += n;
    text = text.replace(re, s.to);
  }
  if (file.endsWith('.json') && text !== before) {
    // Imported pages: objects holding the photo also hold its size.
    const fix = (o) => {
      if (Array.isArray(o)) return o.forEach(fix);
      if (!o || typeof o !== 'object') return;
      for (const v of Object.values(o)) {
        if (typeof v === 'string' && v.startsWith('https://imagedelivery.net/')) {
          const s = [...swap.values()].find((x) => x.to === v);
          if (s && 'width' in o && 'height' in o) { o.width = s.width; o.height = s.height; }
        }
        fix(v);
      }
    };
    const data = JSON.parse(text);
    fix(data);
    text = JSON.stringify(data, null, before.match(/^\{\n(\s+)/)?.[1] ?? 1) + (before.endsWith('\n') ? '\n' : '');
  }
  if (text !== before) {
    changedFiles++;
    if (!DRY) fs.writeFileSync(file, text);
  }
}
console.log(`${swap.size} uploaded photos; ${replaced} addresses in ${changedFiles} files ${DRY ? 'would be' : ''} switched to Cloudflare Images.`);
