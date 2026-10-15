// Matches the photos the site shows (still on Squarespace) to the Lightroom exports.
//
//   node scripts/match-exports.mjs [export folder]     (default E:\EXPORTS\website)
//
// The export folder has one subfolder per wedding, each with colour\ and mono\ inside.
// For every Squarespace photo on the site, candidates are export files with the same camera
// file name (e.g. _30A5340, _30A5340-Edit, _30A5340-Edit-2), in colour or mono. Each candidate
// is compared with the Squarespace photo itself, shrunk to a small greyscale and colour
// thumbnail, and the closest wins; that also picks colour vs mono and the right edit.
// Photos in a blog post are first looked for in the folder holding most of that post's photos.
//
// Writes docs/image-matches.json (photo address -> export file and how close it was) and
// prints a summary with anything unmatched or doubtful.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.argv[2] || 'E:\\EXPORTS\\website';
const OUT = 'docs/image-matches.json';
const SQS = /https?:\/\/images\.squarespace-cdn\.com\/[^\s"')\\]+?\.(?:jpe?g|png|webp)/gi;
const camera = (n) => (n.match(/_?(?=[A-Z0-9]*[A-Z])[A-Z0-9]{3,4}\d{4}/i) || [null])[0]?.replace(/^_/, '').toUpperCase();

// ---- Exports: camera name -> files
const exportsByName = new Map();
const folders = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const folder of folders) {
  for (const tone of ['colour', 'mono']) {
    const dir = path.join(ROOT, folder, tone);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f))) {
      const key = camera(f);
      if (!key) continue;
      if (!exportsByName.has(key)) exportsByName.set(key, []);
      exportsByName.get(key).push({ folder, tone, file: path.join(dir, f) });
    }
  }
}

// ---- Photos on the site: address -> where it's used
const uses = new Map();
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
for (const file of walk('src').filter((f) => /\.(md|json|astro|ts)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(SQS)) {
    const url = m[0].split('?')[0];
    if (!uses.has(url)) uses.set(url, new Set());
    uses.get(url).add(file.replace(/\\/g, '/'));
  }
}

// Each blog post's home folder: the export folder holding most of its photos.
const postFolder = new Map();
for (const file of walk('src/content/blog')) {
  const names = [...fs.readFileSync(file, 'utf8').matchAll(SQS)].map((m) => camera(decodeURIComponent(m[0].split('/').pop())));
  const votes = {};
  for (const n of names) for (const c of exportsByName.get(n) ?? []) votes[c.folder] = (votes[c.folder] ?? 0) + 1;
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= Math.min(3, names.length)) postFolder.set(file.replace(/\\/g, '/'), best[0]);
}

// ---- Comparing pictures
const SIZE = 24;
const thumb = async (input) => {
  const { data } = await sharp(input).rotate().resize(SIZE, SIZE, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
};
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
// How colourful a thumbnail is: average spread between its red, green and blue. Mono is ~0.
const colourful = (t) => { let s = 0; for (let i = 0; i < t.length; i += 3) s += Math.max(t[i], t[i + 1], t[i + 2]) - Math.min(t[i], t[i + 1], t[i + 2]); return s / (t.length / 3); };
const isMono = (t) => colourful(t) < 6;
const exportThumbs = new Map();
const exportThumb = async (file) => {
  if (!exportThumbs.has(file)) exportThumbs.set(file, await thumb(file));
  return exportThumbs.get(file);
};
const download = async (url) => {
  for (let tries = 0; tries < 3; tries++) {
    try {
      const r = await fetch(`${url}?format=300w`);
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch {}
  }
  throw new Error('download failed');
};

// ---- Match
const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const results = {};
const todo = [...uses.entries()];
let done = 0;
const worker = async () => {
  while (todo.length) {
    const [url, files] = todo.shift();
    const name = camera(decodeURIComponent(url.split('/').pop()));
    let cands = (name && exportsByName.get(name)) || [];
    const homes = [...files].map((f) => postFolder.get(f)).filter(Boolean);
    if (homes.length) {
      const home = cands.filter((c) => homes.includes(c.folder));
      if (home.length) cands = home;
    }
    const entry = { usedIn: [...files], name };
    if (!cands.length) {
      entry.status = name ? 'not exported yet' : 'no camera file name';
    } else {
      const prev = previous[url];
      try {
        const sq = await thumb(await download(url));
        const scored = [];
        for (const c of cands) {
          const t = await exportThumb(c.file);
          scored.push({ ...c, diff: Math.round(diff(sq, t) * 10) / 10, mono: isMono(t) });
        }
        // Prefer exports in the same tone as the photo on the site (colour or mono).
        const wantMono = isMono(sq);
        scored.sort((a, b) => (a.mono !== wantMono) - (b.mono !== wantMono) || a.diff - b.diff);
        const best = scored[0];
        entry.tone = best.tone;
        entry.diff = best.diff;
        // The same photo differs by a few levels (resizing, compression), or up to ~25 when it
        // was graded or cropped a little differently. Far bigger means a different photo that
        // happens to share the camera file name (the camera's numbering repeats).
        if (best.diff > 40) entry.status = 'not exported yet';
        else if (best.mono !== wantMono) entry.status = wantMono ? 'mono version not exported' : 'colour version not exported';
        else entry.status = best.diff <= 25 ? 'matched' : 'check';
        if (best.diff <= 40) Object.assign(entry, { file: best.file, folder: best.folder });
        if (scored.length > 1) entry.others = scored.slice(1).map((s) => `${path.basename(s.file)} (${s.tone}) ${s.diff}`);
      } catch (e) {
        entry.status = 'error: ' + e.message;
        if (prev?.file) Object.assign(entry, { file: prev.file, folder: prev.folder, tone: prev.tone, diff: prev.diff, status: prev.status });
      }
    }
    results[url] = entry;
    if (++done % 100 === 0) console.log(`${done} / ${uses.size}`);
  }
};
await Promise.all(Array.from({ length: 8 }, worker));

const sorted = Object.fromEntries(Object.entries(results).sort((a, b) => a[0].localeCompare(b[0])));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');

// ---- Summary, per blog post and for other pages
const byStatus = {};
for (const r of Object.values(results)) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
console.log('\nPhotos on the site:', uses.size, byStatus);
const perPost = {};
for (const [url, r] of Object.entries(results)) {
  for (const f of r.usedIn) {
    const key = f.startsWith('src/content/blog/') ? path.basename(f, '.md') : f;
    perPost[key] ??= { total: 0, matched: 0, check: [], tone: [], missing: [] };
    const p = perPost[key];
    p.total++;
    if (r.status === 'matched') p.matched++;
    else if (r.status === 'check') p.check.push(`${r.name} -> ${path.basename(r.file)} (${r.diff})`);
    else if (r.status.endsWith('version not exported')) p.tone.push(`${r.name} (${r.status.split(' ')[0]})`);
    else p.missing.push(r.name ?? url.split('/').pop());
  }
}
for (const [k, p] of Object.entries(perPost).sort()) {
  if (!p.matched && !p.check.length && !p.tone.length) continue;
  console.log(`\n${k}: ${p.matched}/${p.total} matched`);
  if (p.check.length) console.log('  check:', p.check.join('; '));
  if (p.tone.length) console.log('  need other version:', p.tone.join(', '));
  if (p.missing.length) console.log('  missing:', p.missing.join(', '));
}
