// Adds Google reviews to src/data/reviews.json (shown on /testimonials), copying any review
// photos to Cloudflare Images.
//
//   node scripts/import-reviews.mjs [--dry-run]
//
// Reads the reviews feed of the Elfsight Google Reviews widget the old site used, so it only
// works while that Elfsight subscription is active. After that, add new reviews in Pages CMS
// (Reviews) instead. Reviews already in the file are left exactly as they are, so edits made
// in Pages CMS are never overwritten; only new ones are added.
//
// Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_IMAGES_TOKEN in .env (see docs/photos.md).
import fs from 'node:fs';
import sharp from 'sharp';

const DRY = process.argv.includes('--dry-run');
const FILE = 'src/data/reviews.json';
const PLACE = 'ChIJXU4tP3hEf68RuSbX4BL4QgM'; // Moments in Light's Google listing
const FEED = `https://service-reviews-ultimate.elfsight.com/data/reviews?uris%5B%5D=${PLACE}&filter_content=with_content&min_rating=1&page_length=500&order=date`;

const env = Object.fromEntries(
  (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '').split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);

const data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {
  writeReviewUrl: `https://search.google.com/local/writereview?placeid=${PLACE}`,
  allReviewsUrl: `https://search.google.com/local/reviews?placeid=${PLACE}`,
  summary: [],
  reviews: [],
};
const uploads = JSON.parse(fs.readFileSync('docs/image-uploads.json', 'utf8'));

const nzDate = (unix) => new Date(unix * 1000).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const slug = (s) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-').slice(0, 40);
const tidy = (s) => (s || '').replace(/\r\n/g, '\n').trim();
// Same review: same Google link, or the same person on the same day.
const known = (r) => data.reviews.some((x) => (x.url && x.url === r.url) || (x.name === r.reviewer_name && x.date === nzDate(r.published_at)));

const upload = async (id, url) => {
  // Google refuses some requests without a browser name; try 2048px, then the size it gave.
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' };
  let res = await fetch(url.replace(/=[^=/]*$/, '=s2048'), { headers });
  if (!res.ok) res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`photo download failed (HTTP ${res.status}): ${url.slice(0, 80)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { width, height } = await sharp(buf).metadata();
  if (!uploads.images[id]) {
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'image/jpeg' }), `${id.split('/').pop()}.jpg`);
    form.append('id', id);
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/images/v1`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_IMAGES_TOKEN}` }, body: form,
    });
    const body = await r.json();
    if (!body.success && !body.errors?.some((e) => e.code === 5409)) throw new Error(`upload failed: ${JSON.stringify(body.errors)}`);
    uploads.images[id] = { width, height };
  }
  return { src: `https://imagedelivery.net/${uploads.accountHash}/${id}/public`, width, height };
};

const feed = await (await fetch(FEED)).json();
if (feed.status !== 'success') throw new Error('Could not read the Elfsight feed (has the subscription ended?)');
const fresh = feed.result.data.filter((r) => !known(r));
console.log(`${feed.result.data.length} reviews on Google, ${data.reviews.length} already on the site, ${fresh.length} new.`);

for (const r of fresh) {
  const date = nzDate(r.published_at);
  const id = `${date}-${slug(r.reviewer_name)}`;
  console.log(`  + ${r.reviewer_name} (${date}, ${r.rating} stars, ${r.images.length} photos)`);
  if (DRY) continue;
  const photos = [];
  // Google stops serving some older review photos (the old widget hid those too); skip them.
  for (const [n, url] of r.images.entries()) {
    try { photos.push(await upload(`reviews/${id}-${n + 1}`, url)); }
    catch (e) { console.warn(`    photo ${n + 1} skipped: ${e.message.split(':')[0]}`); }
  }
  data.reviews.push({
    name: r.reviewer_name,
    date,
    rating: r.rating,
    text: tidy(r.text),
    photos,
    reply: tidy(r.response?.text),
    url: r.url,
  });
}

if (!DRY && fresh.length) {
  data.reviews.sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  fs.writeFileSync('docs/image-uploads.json', JSON.stringify(uploads, null, 1) + '\n');
  console.log(`Saved ${FILE}.`);
}
