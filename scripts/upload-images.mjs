// Uploads the matched Lightroom exports to Cloudflare Images.
//
//   node scripts/upload-images.mjs --dry-run    (lists what would be uploaded)
//   node scripts/upload-images.mjs
//
// Run scripts/match-exports.mjs first. Uploads every export file it matched to a photo on the
// site, once each, as e.g. "2026-ellen-and-ryan/colour/_30A5340", and records each upload
// (with its pixel size) in docs/image-uploads.json, so running it again only uploads new matches.
//
// Needs, in the project's .env file (never committed):
//   CLOUDFLARE_ACCOUNT_ID=...      (Cloudflare dashboard > Account home > Account ID)
//   CLOUDFLARE_IMAGES_TOKEN=...    (an API token with Account > Cloudflare Images > Edit)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DRY = process.argv.includes('--dry-run');
const MATCHES = 'docs/image-matches.json';
const RECORD = 'docs/image-uploads.json';

const env = Object.fromEntries(
  (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '').split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const account = env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const token = env.CLOUDFLARE_IMAGES_TOKEN || process.env.CLOUDFLARE_IMAGES_TOKEN;
if (!DRY && (!account || !token)) {
  console.error('Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_IMAGES_TOKEN to .env first.');
  process.exit(1);
}
const api = `https://api.cloudflare.com/client/v4/accounts/${account}/images`;
const auth = { Authorization: `Bearer ${token}` };

const matches = JSON.parse(fs.readFileSync(MATCHES, 'utf8'));
const record = fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, 'utf8')) : { accountHash: null, images: {} };
const save = () => fs.writeFileSync(RECORD, JSON.stringify(record, null, 1) + '\n');

const idOf = (r) => `${r.folder}/${r.tone}/${path.basename(r.file, path.extname(r.file))}`;
const files = new Map();
for (const r of Object.values(matches)) if (r.status === 'matched' && r.file) files.set(idOf(r), r.file);
const todo = [...files].filter(([id]) => !record.images[id]);
const mb = todo.reduce((s, [, f]) => s + fs.statSync(f).size, 0) / 1e6;
console.log(`${files.size} matched photos, ${files.size - todo.length} already uploaded, ${todo.length} to upload (${Math.round(mb)} MB).`);
if (DRY || !todo.length) process.exit(0);

// The account hash goes in every photo address (imagedelivery.net/<hash>/<id>/<size>).
if (!record.accountHash) {
  const r = await fetch(`${api}/v1/stats`, { headers: auth });
  if (!r.ok) {
    console.error(`Cloudflare refused the token or account (HTTP ${r.status}). Check .env and that Images is enabled.`);
    process.exit(1);
  }
}

let done = 0, failed = 0;
const upload = async (id, file) => {
  const { width, height } = await sharp(file).metadata();
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
  form.append('id', id);
  form.append('metadata', JSON.stringify({ source: path.basename(file) }));
  for (let tries = 0; tries < 3; tries++) {
    const r = await fetch(`${api}/v1`, { method: 'POST', headers: auth, body: form });
    const body = await r.json().catch(() => ({}));
    const exists = body.errors?.some((e) => e.code === 5409);
    if (r.ok || exists) {
      const variant = body.result?.variants?.[0];
      if (variant && !record.accountHash) record.accountHash = variant.split('/')[3];
      record.images[id] = { width, height };
      return true;
    }
    if (r.status === 401 || r.status === 403) throw new Error(`Cloudflare refused the token (HTTP ${r.status}).`);
    if (tries === 2) console.warn(`  ${id}: ${body.errors?.map((e) => e.message).join('; ') || r.status}`);
  }
  return false;
};
const worker = async () => {
  while (todo.length) {
    const [id, file] = todo.shift();
    if (await upload(id, file)) done++; else failed++;
    if ((done + failed) % 25 === 0) { save(); console.log(`${done} uploaded${failed ? `, ${failed} failed` : ''}`); }
  }
};
try {
  await Promise.all(Array.from({ length: 4 }, worker));
} finally {
  save();
}
console.log(`Done: ${done} uploaded${failed ? `, ${failed} failed (run again to retry)` : ''}.`);
if (!record.accountHash) console.log('Note: account hash not found yet; it is filled in from the first new upload.');
