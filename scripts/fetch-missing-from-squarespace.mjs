// For blog-post photos Lightroom can't export, saves the Squarespace copy into the wedding's
// export folder instead, resized like the exports (2048px long edge), so the matcher and
// uploader treat it like any other export.
//
//   node scripts/fetch-missing-from-squarespace.mjs [export folder] [--dry-run]
//
// Only for posts whose wedding already has an export folder (the folder most of the post's
// photos matched in). Files are named <camera name>-website.jpg, in colour\ or mono\ to
// match the photo on the site. Run scripts/match-exports.mjs first, and again afterwards.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ROOT = args.find((a) => !a.startsWith('--')) || 'E:\\EXPORTS\\website';
const matches = JSON.parse(fs.readFileSync('docs/image-matches.json', 'utf8'));

// Each post's wedding folder: where most of its matched photos are.
const votes = {};
for (const r of Object.values(matches)) {
  if (r.status !== 'matched') continue;
  for (const f of r.usedIn.filter((f) => f.startsWith('src/content/blog/'))) {
    votes[f] ??= {};
    votes[f][r.folder] = (votes[f][r.folder] ?? 0) + 1;
  }
}
const home = Object.fromEntries(Object.entries(votes).map(([f, v]) => [f, Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]]));

const todo = [];
for (const [url, r] of Object.entries(matches)) {
  if (r.status === 'matched' || !r.name) continue;
  const post = r.usedIn.find((f) => home[f]);
  if (!post) continue;
  const mono = r.status === 'mono version not exported';
  todo.push({ url, name: r.name, folder: home[post], post: path.basename(post, '.md'), mono, why: r.status });
}

let saved = 0;
for (const t of todo) {
  const original = decodeURIComponent(t.url.split('/').pop()).replace(/\.[^.]+$/, '');
  const dir = path.join(ROOT, t.folder, t.mono ? 'mono' : 'colour');
  const out = path.join(dir, `${original.replace(/[^\w.-]+/g, '_')}-website.jpg`);
  console.log(`${t.post}: ${t.name} (${t.why}) -> ${path.relative(ROOT, out)}`);
  if (DRY || fs.existsSync(out)) continue;
  const r = await fetch(`${t.url}?format=2500w`);
  if (!r.ok) { console.warn(`  download failed (HTTP ${r.status})`); continue; }
  fs.mkdirSync(dir, { recursive: true });
  await sharp(Buffer.from(await r.arrayBuffer()))
    .rotate()
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(out);
  saved++;
}
console.log(`${todo.length} photos${DRY ? '' : `, ${saved} saved`}.`);
