// Moves galleries from Pic-Time to MIL Galleries, keeping Tony's Pic-Time layout (scene names and
// order, photo order, the cover and the big photos) and using the full-size photos from Pic-Time's
// download ZIP or Tony's own exports. Runs unattended and picks up where it left off if stopped.
//
//   node scripts/pictime-import/upload.mjs "E:\EXPORTS\WEDDINGS"        (add --check to only report what matches)
//
// Speed: 3 megabits a second from 7am to 10pm (so the internet stays usable), no limit overnight.
// Change with --day-speed=5 or --night-speed=20, or --full for no limit at all.
//
// Under the base folder, any folder with a link.txt is a couple's folder: link.txt holds their
// Pic-Time gallery links (one per line, e.g. practice shoot, sneak peeks, wedding), and the photos
// are anywhere inside it (full size; Web, Social, Small and Prints folders are skipped, as are ZIPs'
// contents once unzipped). lightroom-key.txt at the top holds the key from Studio > Galleries >
// Defaults (the same one the Lightroom plugin uses), and order.txt (optional) the couples to do first.
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

const CHECK = process.argv.includes('--check');
const root = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || '.');
const keyFile = [path.join(root, 'lightroom-key.txt'), path.join(path.dirname(root), 'lightroom-key.txt')].find((f) => fs.existsSync(f));
const KEY = (process.env.MIL_LR_KEY || (keyFile ? fs.readFileSync(keyFile, 'utf8') : '')).trim();
if (!KEY && !CHECK) stop(`Put the Lightroom key (Studio > Galleries > Defaults) in ${path.join(root, 'lightroom-key.txt')}`);

const logFile = path.join(root, `upload-log-${new Date().toLocaleDateString('en-CA')}.txt`);
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
// ---- Upload speed: gentle in the daytime so the internet stays usable, full speed overnight ----
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const DAY_MBPS = Number(arg('day-speed') ?? 3); // megabits a second, 7am to 10pm
const NIGHT_MBPS = Number(arg('night-speed') ?? 0); // 0 = no limit
const FULL = process.argv.includes('--full');
function speedNow() {
  if (FULL) return 0;
  const h = new Date().getHours();
  return h >= 7 && h < 22 ? DAY_MBPS : NIGHT_MBPS;
}
let nextSend = 0; // shared by all uploads, so the limit is for the whole run
async function allowance(bytes) {
  const mbps = speedNow();
  if (!mbps) return;
  const now = Date.now();
  const start = Math.max(now, nextSend);
  nextSend = start + (bytes * 8) / (mbps * 1000); // ms
  if (start > now) await new Promise((res) => setTimeout(res, start - now));
}
/** The bytes as a stream that's sent no faster than the limit allows. */
function paced(bytes) {
  if (!speedNow()) return bytes;
  let at = 0;
  return new ReadableStream({
    async pull(c) {
      if (at >= bytes.length) return c.close();
      const n = Math.min(32 * 1024, bytes.length - at);
      await allowance(n);
      c.enqueue(bytes.subarray(at, at + n));
      at += n;
    },
  });
}

async function put(id, size, bytes, attempt = 1) {
  try {
    const r = await fetch(`${SITE}/api/lr/file?id=${id}&size=${size}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-mil-key': KEY }, body: paced(bytes), duplex: 'half' });
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
    // Web, Social and Small folders hold smaller copies of the same photos (and Prints may be cropped).
    if (e.isDirectory()) { if (!/^(web|small|prints?|social.*)$/i.test(e.name)) out.push(...photosIn(p)); }
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
// File names as Pic-Time knows them, ignoring export prefixes like FULLSIZE_ and SOCIAL_.
const norm = (n) => String(n).toLowerCase().replace(/^(fullsize|social)_/, '');
const bare = (f) => norm(path.basename(f).replace(/\.[^.]+$/, ''));
const isMono = (s) => /\b(mono|b\s*&?\s*w|black|bw)\b/i.test(s);

// Folders for one kind of gallery (a couple's folder can hold its practice shoot, sneak peeks and wedding).
const KIND = /practice|sneak|couple shoot|engagement|pre.?wedding|wedding/;

/**
 * Each Pic-Time photo matched to a file of the same name. When there's more than one, the best
 * is the one in a folder named like the gallery (Sneak peeks for "… - Sneak Peeks") and the section
 * (Colour, Mono), and in a mono folder (or the "-2" copy) for a mono section.
 */
function match(layout, files, folder) {
  const byName = new Map();
  for (const f of files) (byName.get(bare(f)) ?? byName.set(bare(f), []).get(bare(f))).push(f);
  const title = layout.title.toLowerCase();
  const used = new Set();
  const missing = [];
  for (const s of layout.scenes) {
    const want = s.name.toLowerCase();
    const bw = isMono(s.name);
    for (const p of s.photos) {
      const free = (n) => (byName.get(n) ?? []).filter((f) => !used.has(f));
      // Where colour and mono share a folder, the mono copy is the one exported as "-2".
      const two = !norm(p.name).endsWith('-2') ? free(`${norm(p.name)}-2`) : [];
      const options = [...(bw ? two : []), ...free(norm(p.name))];
      const score = (f) => {
        const parts = path.relative(folder, f).toLowerCase().split(path.sep).slice(0, -1);
        let n = 0;
        for (const x of parts) {
          const kind = x.match(KIND)?.[0];
          if (kind) n += title.includes(kind) || (kind === 'wedding' && !/practice|sneak|engagement|couple/.test(title)) ? 4 : -4;
          if (x.includes(want)) n += 2;
        }
        if (bw === (parts.some(isMono) || bare(f).endsWith('-2'))) n += 1;
        return n;
      };
      const pick = options.map((f, i) => ({ f, n: score(f) - i / 1000 })).sort((a, b) => b.n - a.n)[0]?.f;
      if (pick) { used.add(pick); p.file = pick; } else missing.push(`${s.name} / ${p.name}`);
    }
  }
  return missing;
}

// ---- One gallery ----
const LINK_FILES = ['link.txt', 'links.txt', 'pictime.txt'];
const linksIn = (folder) => LINK_FILES.map((f) => path.join(folder, f)).filter((f) => fs.existsSync(f))
  .flatMap((f) => fs.readFileSync(f, 'utf8').match(/https?:\/\/\S+/g) ?? []);
/** Folders with a link.txt, anywhere under the base folder (e.g. 2025\Feby and Steven). */
function galleryFolders(dir) {
  if (linksIn(dir).length) return [dir];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .flatMap((e) => galleryFolders(path.join(dir, e.name)));
}

/** One Pic-Time gallery, its photos found anywhere in the couple's folder (one folder can hold several galleries). */
async function moveGallery(folder, link) {

  const layout = await pictimeLayout(link);
  const count = layout.scenes.reduce((a, s) => a + s.photos.length, 0);
  log(`${layout.title}: ${layout.scenes.length} sections, ${count} photos in Pic-Time.`);
  unzipAll(folder);
  const missing = match(layout, photosIn(folder), folder);
  if (missing.length) log(`  ${missing.length} photo(s) not found in the folder (skipped): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);
  if (CHECK) {
    for (const s of layout.scenes) log(`  ${s.name}: ${s.photos.filter((p) => p.file).length} of ${s.photos.length} found${s.photos[0]?.file ? `, e.g. ${path.relative(folder, s.photos.find((p) => p.file).file)}` : ''}`);
    return;
  }

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
if (!CHECK) await api({ action: 'hello' }).catch((e) => stop(`The studio didn’t accept the key: ${e.message}`));
// order.txt at the top: couples to do first (part of the folder name, one per line), e.g. the
// weddings at venues Tony is about to email. Everyone else follows.
const orderFile = path.join(root, 'order.txt');
const first = fs.existsSync(orderFile) ? fs.readFileSync(orderFile, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')) : [];
const rank = (f) => { const i = first.findIndex((n) => path.basename(f).toLowerCase().includes(n)); return i < 0 ? first.length : i; };
const folders = galleryFolders(root).sort((a, b) => rank(a) - rank(b));
log(`Moving ${folders.length} gallery folder(s) from ${root}`);
for (const f of folders) {
  for (const link of linksIn(f)) {
    try { await moveGallery(f, link); } catch (e) { log(`Problem with ${path.relative(root, f) || f}: ${e.message}`); }
  }
}
log('All done.');
