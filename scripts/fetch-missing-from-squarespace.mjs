// For photos Lightroom can't export, saves the Squarespace copy instead, resized like the
// exports (2048px long edge), so the matcher and uploader treat it like any other export.
//
//   node scripts/fetch-missing-from-squarespace.mjs [export folder] [--pages] [--dry-run]
//
// Default: blog-post photos, for posts whose wedding already has an export folder (the folder
// most of the post's photos matched in), saved there.
// --pages: photos used only on other pages (venue pages, home, weddings...), saved in
// <export folder>\_from-website. --only=page,post limits it to those pages and blog posts
// (by address), including photos they share with others. The matcher prefers your own
// exports over these, so exporting one of these sessions later replaces them automatically.
//
// Files are named <original name>-website.jpg (or .png), in colour\ or mono\ to match the
// photo on the site. Run scripts/match-exports.mjs first, and again afterwards.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const PAGES = args.includes('--pages');
// --only=abel-estate,tui-hills limits --pages to photos on those pages.
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const ROOT = args.find((a) => !a.startsWith('--')) || 'E:\\EXPORTS\\website';
const matches = JSON.parse(fs.readFileSync('docs/image-matches.json', 'utf8'));
const isPost = (f) => f.startsWith('src/content/blog/');

// Each post's wedding folder: where most of its matched photos are.
const votes = {};
for (const r of Object.values(matches)) {
  if (r.status !== 'matched') continue;
  for (const f of r.usedIn.filter(isPost)) {
    votes[f] ??= {};
    votes[f][r.folder] = (votes[f][r.folder] ?? 0) + 1;
  }
}
const home = Object.fromEntries(Object.entries(votes).map(([f, v]) => [f, Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]]));

const todo = [];
for (const [url, r] of Object.entries(matches)) {
  if (r.status === 'matched' || /\.gif$/i.test(url)) continue;
  if (PAGES) {
    // Example/draft pages aren't on the live site.
    const slug = (f) => path.basename(f).replace(/\.\w+$/, '');
    const live = r.usedIn.filter((f) => !f.includes('example-page'));
    if (ONLY) {
      // Named pages or blog posts (by address), whatever else uses the photo.
      if (!live.some((f) => ONLY.includes(slug(f)))) continue;
    } else if (r.usedIn.some(isPost) || !live.length) continue;
    todo.push({ url, name: r.name, folder: '_from-website', where: live.map(slug).join(', '), why: r.status });
  } else {
    const post = r.usedIn.find((f) => home[f]);
    if (!post) continue;
    todo.push({ url, name: r.name, folder: home[post], where: path.basename(post, '.md'), why: r.status });
  }
}

// Mono if the colours barely differ from grey.
const monoOf = async (buf) => {
  const { data } = await sharp(buf).resize(24, 24, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let s = 0;
  for (let i = 0; i < data.length; i += 3) s += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
  return s / (data.length / 3) < 6;
};

let saved = 0;
for (const t of todo) {
  const file = decodeURIComponent(t.url.split('/').pop());
  const ext = /\.png$/i.test(file) ? 'png' : 'jpg';
  const base = file.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
  console.log(`${t.where}: ${t.name} (${t.why})`);
  if (DRY) continue;
  const r = await fetch(`${t.url}?format=2500w`);
  if (!r.ok) { console.warn(`  download failed (HTTP ${r.status})`); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  const mono = t.why === 'mono version not exported' || (t.why !== 'colour version not exported' && await monoOf(buf));
  const dir = path.join(ROOT, t.folder, mono ? 'mono' : 'colour');
  const out = path.join(dir, `${base}-website.${ext}`);
  if (fs.existsSync(out)) continue;
  fs.mkdirSync(dir, { recursive: true });
  const img = sharp(buf).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true });
  await (ext === 'png' ? img.png() : img.jpeg({ quality: 90, mozjpeg: true })).toFile(out);
  saved++;
}
console.log(`${todo.length} photos${DRY ? '' : `, ${saved} saved`}.`);
