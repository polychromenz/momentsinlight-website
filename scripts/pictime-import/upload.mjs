// Moves galleries from Pic-Time to MIL Galleries, keeping Tony's Pic-Time layout (scene names and
// order, photo order, the cover and the big photos) and using the full-size photos from Pic-Time's
// download ZIP. Runs unattended (e.g. overnight) and picks up where it left off if stopped.
//
//   node scripts/pictime-import/upload.mjs "D:\Pic-Time moves"
//
// The folder holds one folder per gallery, each with:
//   - link.txt   the gallery's Pic-Time link (the one you'd send the couple)
//   - the ZIP from Pic-Time's Download (or the photos already unzipped, in any folders)
// and, at the top, lightroom-key.txt: the key from Studio > Galleries > Defaults (the same one the
// Lightroom plugin uses). A folder can also be passed on its own.
//
// Uploads go through the same route as the Lightroom plugin (functions/api/lr), so a gallery is
// matched again by its Pic-Time project on a second run, and photos already up are skipped.
// Nothing is deleted. Each gallery stays a draft until Tony checks it and puts it online.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const sharp = createRequire(import.meta.url)('sharp');
const SITE = process.env.MIL_SITE || 'https://www.momentsinlight.co.nz';
const PARALLEL = 3;

const root = path.resolve(process.argv[2] || '.');
const keyFile = [path.join(root, 'lightroom-key.txt'), path.join(path.dirname(root), 'lightroom-key.txt')].find((f) => fs.existsSync(f));
const KEY = (process.env.MIL_LR_KEY || (keyFile ? fs.readFileSync(keyFile, 'utf8') : '')).trim();
if (!KEY) stop(`Put the Lightroom key (Studio > Galleries > Defaults) in ${path.join(root, 'lightroom-key.txt')}`);

const logFile = path.join(root, `upload-log-${new Date().toISOString().slice(0, 10)}.txt`);
function log(...a) {
  const line = `${new Date().toLocaleTimeString('en-NZ')}  ${a.join(' ')}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}
function stop(msg) { console.error(msg); process.exit(1); }

async function api(body, attempt = 1) {
  try {
    const r = await fetch(`${SITE}/api/lr`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mil-key': KEY }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return d;
    if (r.status < 500 || attempt >= 5) throw new Error(d.error || `The studio said ${r.status}.`);
  } catch (e) {
    if (attempt >= 5) throw e;
  }
  await new Promise((res) => setTimeout(res, 3000 * attempt));
  return api(body, attempt + 1);
}
async function put(id, size, bytes, attempt = 1) {
  try {
    const r = await fetch(`${SITE}/api/lr/file?id=${id}&size=${size}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-mil-key': KEY }, body: bytes });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return;
    if (r.status < 500 || attempt >= 5) throw new Error(d.error || `Upload failed (${r.status}).`);
  } catch (e) {
    if (attempt >= 5) throw e;
  }
  await new Promise((res) => setTimeout(res, 5000 * attempt));
  return put(id, size, bytes, attempt + 1);
}

// ---- The Pic-Time layout, from the gallery's public data files ----
async function pictimeLayout(link) {
  const html = await (await fetch(link)).text();
  const base = html.match(/https?:\/\/[^"'\s]+?\/pictures\/\d+\/\d+\/\d+\/[a-z0-9]{10,}\//)?.[0];
  const project = html.match(/"projectId":(\d+)/)?.[1];
  if (!base || !project) throw new Error('Couldn’t read that Pic-Time link. Use the link you send the couple.');
  const g = await (await fetch(base + 'gallery.json.txt')).json();
  const meta = await (await fetch(base + 'gallery_meta.json.txt')).json();
  const names = new Map();
  for (let i = 0; i < meta.photos.length; i += 4) names.set(meta.photos[i], String(meta.photos[i + 3]));
  const scenes = g.scenes
    .map((s) => {
      const ids = [];
      for (let i = 0; i < s.photos.length; i += 5) ids.push(s.photos[i]);
      return { id: s.id, name: s.nm || 'Photos', prio: s.viewPrio ?? 0, photos: ids.map((n) => ({ n, name: names.get(n) ?? '' })) };
    })
    .sort((a, b) => a.prio - b.prio);
  return { project, title: g.title || 'Gallery', date: g.projectDate || null, cover: g.coverId ?? null, big: g.enlargedPhotoIds ?? [], scenes };
}

// ---- The photos on disk ----
function photosIn(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...photosIn(p));
    else if (/\.jpe?g$/i.test(e.name)) out.push(p);
  }
  return out;
}
function unzipAll(folder) {
  for (const z of fs.readdirSync(folder).filter((f) => /\.zip$/i.test(f))) {
    const dest = path.join(folder, '_unzipped', path.basename(z, path.extname(z)));
    if (fs.existsSync(path.join(dest, '.done'))) continue;
    log(`  Unzipping ${z}…`);
    fs.mkdirSync(dest, { recursive: true });
    execFileSync('tar', ['-xf', path.join(folder, z), '-C', dest]); // Windows' tar opens ZIPs
    fs.writeFileSync(path.join(dest, '.done'), '');
  }
}
const bare = (f) => path.basename(f).replace(/\.[^.]+$/, '').toLowerCase();
const isMono = (s) => /\b(mono|b\s*&?\s*w|black|bw)\b/i.test(s);

/** Each Pic-Time photo matched to a file: same name, in the scene's folder when the ZIP has them. */
function match(layout, files) {
  const byName = new Map();
  for (const f of files) (byName.get(bare(f)) ?? byName.set(bare(f), []).get(bare(f))).push(f);
  const used = new Set();
  const missing = [];
  for (const s of layout.scenes) {
    const want = s.name.toLowerCase();
    for (const p of s.photos) {
      const options = (byName.get(p.name.toLowerCase()) ?? []).filter((f) => !used.has(f));
      const parts = (f) => path.relative(root, f).toLowerCase().split(path.sep);
      const pick = options.find((f) => parts(f).includes(want))
        ?? options.find((f) => isMono(s.name) === parts(f).some((x) => isMono(x)))
        ?? options[0];
      if (pick) { used.add(pick); p.file = pick; } else missing.push(`${s.name} / ${p.name}`);
    }
  }
  return missing;
}

// ---- One gallery ----
async function moveGallery(folder) {
  const linkFile = ['link.txt', 'pictime.txt'].map((f) => path.join(folder, f)).find((f) => fs.existsSync(f));
  if (!linkFile) return log(`Skipped ${path.basename(folder)}: no link.txt with the Pic-Time link.`);
  const link = fs.readFileSync(linkFile, 'utf8').match(/https?:\/\/\S+/)?.[0];
  if (!link) return log(`Skipped ${path.basename(folder)}: link.txt has no link in it.`);

  const layout = await pictimeLayout(link);
  const count = layout.scenes.reduce((a, s) => a + s.photos.length, 0);
  log(`${layout.title}: ${layout.scenes.length} sections, ${count} photos in Pic-Time.`);
  unzipAll(folder);
  const missing = match(layout, photosIn(folder));
  if (missing.length) log(`  ${missing.length} photo(s) not found in the folder (skipped): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);

  const g = await api({ action: 'gallery', set_id: `pt:${layout.project}`, name: layout.title, type: 'Wedding', event_date: layout.date, source: 'pictime' });
  log(`  ${g.made ? 'Made' : 'Adding to'} the gallery: ${g.studio}`);
  const jobs = [];
  for (const [order, s] of layout.scenes.entries()) {
    const sec = await api({ action: 'section', gallery_id: g.id, key: `pt:${s.id}`, name: s.name, is_bw: isMono(s.name), order });
    s.photos.forEach((p, i) => p.file && jobs.push({ ...p, section_id: sec.id, sort_order: order * 10000 + i }));
  }

  let done = 0, sent = 0, failed = 0, bytes = 0;
  const started = Date.now();
  async function one(job) {
    const original = fs.readFileSync(job.file);
    const img = sharp(original, { failOn: 'none' }).rotate();
    const m = await sharp(original).metadata();
    const turned = (m.orientation ?? 1) >= 5;
    const r = await api({
      action: 'image', gallery_id: g.id, section_id: job.section_id, lightroom_id: `pt:${layout.project}:${job.n}`,
      checksum: crypto.createHash('sha1').update(original).digest('hex'), filename: path.basename(job.file),
      width: turned ? m.height : m.width, height: turned ? m.width : m.height, sort_order: job.sort_order,
    });
    if (!r.needs?.length) return;
    const web = await img.clone().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    const thumb = await sharp(web).resize(600, 600, { fit: 'inside' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    if (r.needs.includes('thumb')) await put(r.id, 'thumb', thumb);
    if (r.needs.includes('web')) await put(r.id, 'web', web);
    if (r.needs.includes('original')) await put(r.id, 'original', original);
    sent++;
    bytes += original.length + web.length + thumb.length;
  }
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      try { await one(job); } catch (e) { failed++; log(`  Couldn’t send ${path.basename(job.file)}: ${e.message}`); }
      done++;
      if (done % 10 === 0 || done === jobs.length) {
        const mins = (Date.now() - started) / 60000;
        log(`  ${done} of ${jobs.length} done (${sent} sent, ${(bytes / 1048576).toFixed(0)} MB in ${mins.toFixed(0)} min)`);
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  const lr = (n) => `pt:${layout.project}:${n}`;
  const lay = await api({ action: 'layout', gallery_id: g.id, cover: layout.cover != null ? lr(layout.cover) : null, heroes: layout.big.map(lr) });
  log(`  Finished ${layout.title}: ${jobs.length - failed} of ${count} photos up${failed ? `, ${failed} failed (run again to retry)` : ''}${missing.length ? `, ${missing.length} not in the folder` : ''}. Cover ${lay.cover ? 'set' : 'not found'}, ${lay.heroes} big photo(s).`);
  log(`  Check it, then put it online: ${g.studio}`);
}

// ---- All of them ----
await api({ action: 'hello' }).catch((e) => stop(`The studio didn’t accept the key: ${e.message}`));
const single = ['link.txt', 'pictime.txt'].some((f) => fs.existsSync(path.join(root, f)));
const folders = single ? [root] : fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => path.join(root, e.name));
log(`Moving ${folders.length} gallery folder(s) from ${root}`);
for (const f of folders) {
  try { await moveGallery(f); } catch (e) { log(`Problem with ${path.basename(f)}: ${e.message}`); }
}
log('All done.');
