# Photos: how they're hosted and how to add new ones

Since 15 Oct 2026 every photo on the site is on **Cloudflare Images** (Images & Stream starter
bundle, US$5/month, up to 100,000 photos). Nothing loads from Squarespace any more.

## How it works

- A photo's address looks like
  `https://imagedelivery.net/qzGY-glAlQGHmkVvJZVh0Q/2026-ellen-and-ryan/colour/_30A5340/public`.
  The middle part is the photo's id: its export folder, colour or mono, and file name.
- **Flexible variants** are switched on in Cloudflare Images, so the site asks for each photo at
  the size it's shown (`/w=500`, `/w=1000` and so on, in `src/lib/images.mjs`) and Cloudflare
  sends WebP or AVIF to browsers that support it. A phone typically gets a 40KB version.
- Slideshows only load each photo just before it fades in, at the size it's shown.
- The first photo near the top of each page is fetched before anything else.
- The About page's animated photo is `public/images/tony-solo.webp` (an animated WebP, 117KB,
  made from Squarespace's 4MB GIF).
- Small brand images (logo, badges) are in `src/assets/brand` and optimised by Astro.

## Settings (in `.env`, never committed)

| Setting | What it is |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The Account ID shown on Cloudflare's **Images** page (`ba83c09b…`). The first ID found elsewhere was a different one and gave "authentication error". |
| `CLOUDFLARE_IMAGES_TOKEN` | API token with **Account > Cloudflare Images > Edit**. Created in Profile > API Tokens. Never paste it into chat. |
| `PAGESPEED_API_KEY` | Free Google key for `scripts/speed-compare.mjs`, restricted to PageSpeed Insights API. |

## Adding photos for a new blog post

The easiest way: give Claude Code the story and the export folder, and ask for the post.
What happens behind that:

1. Export from Lightroom at **2048px long edge**, sRGB JPEG, quality about 85–90, into
   `E:\EXPORTS\website\<year-couple>\colour` (and `\mono` for black and white). No need to
   run them through JPEGmini; Cloudflare makes the small versions.
2. Upload each photo to Cloudflare Images with an id like `<folder>/<colour|mono>/<file name>`
   (the same upload call `scripts/upload-images.mjs` uses), and record it in
   `docs/image-uploads.json` with its width and height.
3. In the post's gallery, use `https://imagedelivery.net/qzGY-glAlQGHmkVvJZVh0Q/<id>/public`
   with the photo's width and height, so the page reserves the right space.

Photos added through **Pages CMS** go into `public/images` in the repo instead, which also
works; they're just not resized by Cloudflare.

## The scripts (used for the move from Squarespace)

| Script | What it does |
| --- | --- |
| `scripts/match-exports.mjs [folder]` | Finds each Squarespace photo on the site among the exports: camera file name first (ignoring SOCIAL\_\_, FULLSIZE\_\_, -Edit, -2, " - Copy"), then compares the pictures, which also picks colour or mono and the right edit. Writes `docs/image-matches.json`. |
| `scripts/fetch-missing-from-squarespace.mjs [folder] [--pages] [--only=a,b]` | Downloads photos Lightroom couldn't provide from the current site (2500px, resized to 2048px) into the wedding's folder, or `_from-website` for pages. Your own exports always win over these. |
| `scripts/upload-images.mjs [--dry-run]` | Uploads every matched photo not yet uploaded; records it in `docs/image-uploads.json`. |
| `scripts/use-uploaded-images.mjs [--dry-run]` | Swaps Squarespace addresses in `src/` for the Cloudflare ones and updates widths and heights. |
| `scripts/speed-compare.mjs [runs]` | Compares page speed of the old and new sites with PageSpeed Insights. |

Where the 1,523 photos came from: most wedding-post photos are your Lightroom exports. The rest
were downloaded from the current site: gaps Lightroom couldn't fill (mainly Gel & James,
Rebecca & Michael and Raewyn & Shane, plus a few in other weddings), and all of the portraits,
family, headshots, lifestyle, venue-page, article and share images. The
downloaded copies are in `E:\EXPORTS\website\_from-website` and the wedding folders, named
`…-website.jpg`.

## Notes

- Camera numbering repeats across weddings (`_30A6750` is in two), so matching always looks in
  the post's own wedding folder first.
- Two Squarespace photos with the same file name (e.g. two `1_SOCIAL.jpg`) get the Squarespace
  folder id added to the downloaded copy's name.
- Squarespace addresses without a file type (the wedding prices chart) and GIFs are skipped by
  the scripts and were done by hand.
