// Remakes a gallery's web and thumbnail copies from the originals on Tony's PC, with the light
// output sharpening the uploader now uses (19 Oct 2026). For galleries sent before that through the
// studio's browser importer (e.g. Sofia and John). Only the small copies are sent, never the full size.
//
//   node scripts/pictime-import/refresh-web.mjs <gallery id> "E:\EXPORTS\WEDDINGS\2026\2026 Sofia and John"
//
// Photos are matched by file name, and colour or B+W by the section and the folder (Mono, B+W…).
// The Lightroom key comes from lightroom-key.txt in E:\EXPORTS\WEDDINGS (or MIL_LR_KEY).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const sharp = createRequire(import.meta.url)('sharp');
const SITE = process.env.MIL_SITE || 'https://www.momentsinlight.co.nz';
const [galleryId, folder] = process.argv.slice(2);
if (!galleryId || !folder) { console.error('Usage: node refresh-web.mjs <gallery id> <folder of originals>'); process.exit(1); }
const keyFile = ['E:/EXPORTS/WEDDINGS/lightroom-key.txt', path.join(folder, '..', 'lightroom-key.txt'), path.join(folder, '..', '..', 'lightroom-key.txt')].find((f) => fs.existsSync(f));
const KEY = (process.env.MIL_LR_KEY || (keyFile ? fs.readFileSync(keyFile, 'utf8') : '')).trim();
if (!KEY) { console.error('No Lightroom key (lightroom-key.txt).'); process.exit(1); }

const isMono = (s) => /\b(mono|b\s*[&+]?\s*w|black|bw)\b/i.test(String(s ?? ''));
const skip = /^(web|small|prints?|social.*)$/i;
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!skip.test(e.name)) walk(p); } else if (/\.jpe?g$/i.test(e.name)) files.push(p); } })(folder);
const byName = new Map();
for (const f of files) { const k = path.basename(f).toLowerCase(); (byName.get(k) ?? byName.set(k, []).get(k)).push(f); }

const api = async (body) => {
  const r = await fetch(`${SITE}/api/lr`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mil-key': KEY }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `The studio said ${r.status}`);
  return d;
};
const put = async (id, size, bytes) => {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`${SITE}/api/lr/file?id=${id}&size=${size}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-mil-key': KEY }, body: bytes }).catch(() => null);
    if (r?.ok) return;
    if (attempt >= 4) throw new Error(`Upload failed (${r?.status ?? 'network'})`);
    await new Promise((res) => setTimeout(res, 3000 * attempt));
  }
};

const { images } = await api({ action: 'list', gallery_id: galleryId });
console.log(`${images.length} photos in the gallery, ${files.length} files in the folder.`);
let done = 0, missing = 0, next = 0;
async function worker() {
  while (next < images.length) {
    const i = images[next++];
    const options = byName.get(String(i.filename).toLowerCase()) ?? [];
    const bw = !!i.is_bw || isMono(i.section);
    const file = options.find((f) => path.relative(folder, f).split(path.sep).slice(0, -1).some(isMono) === bw) ?? options[0];
    if (!file) { missing++; continue; }
    const img = sharp(fs.readFileSync(file), { failOn: 'none' }).rotate();
    const web = await img.clone().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).sharpen({ sigma: 0.8 }).withIccProfile('srgb').jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    const thumb = await img.clone().resize(600, 600, { fit: 'inside' }).sharpen({ sigma: 0.6 }).withIccProfile('srgb').jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    await put(i.id, 'thumb', thumb);
    await put(i.id, 'web', web);
    if (++done % 25 === 0) console.log(`${done} of ${images.length} redone`);
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`Done: ${done} redone${missing ? `, ${missing} not found in the folder` : ''}.`);
