# Moments in Light Website Rebuild — Project Plan

Oct 13, 2026 · @Tony · updated Oct 15, 2026

## Overview

Rebuild [momentsinlight.co.nz](https://www.momentsinlight.co.nz) off Squarespace as a fast static site that looks the same at launch, then improve it gradually. Nothing changes on the live site until the new one has been reviewed side by side.

- **Why:** SEO tools flag issues that can't be fixed on Squarespace, the design is restrictive, and the subscription is expensive.
- **Goal:** better SEO and page speed, full design control, lower running costs.
- **Must keep:** an easy way to add wedding blog posts, every existing URL, and current Google rankings.
- **Status (15 Oct 2026):** the new site is built and running at [momentsinlight-website.pages.dev](https://momentsinlight-website.pages.dev), every photo is on Cloudflare Images, and **momentsinlight.co.nz has been serving the new site since the evening of 15 Oct 2026** (DNS on Cloudflare, domain still registered with iwantmyname). See [domain-switch.md](domain-switch.md).

Related docs:

| Doc | What it covers |
| --- | --- |
| [domain-switch.md](domain-switch.md) | Moving momentsinlight.co.nz to the new site: DNS records, steps, what's left |
| [photos.md](photos.md) | How photos are hosted (Cloudflare Images), the scripts, and adding photos for a new post |
| [forms-setup.md](forms-setup.md) | Wedding photo guide signup form (Cloudflare D1 database, Turnstile) |
| [wedding-exports-checklist.md](wedding-exports-checklist.md) | Lightroom export checklist used for the photo move (finished) |

## Decisions

| Area | Decision | Why |
| --- | --- | --- |
| Site framework | [Astro](https://astro.build) | Outputs plain, fast HTML with full control over titles, meta tags, structured data and URLs |
| Hosting | [Cloudflare](https://pages.cloudflare.com) (static site, free) | Auckland edge server, unlimited bandwidth, free preview address for review |
| Images | [Cloudflare Images](https://www.cloudflare.com/developer-platform/products/cloudflare-images/) (Images & Stream starter bundle, US$5/month) | Auto-resizes and serves WebP/AVIF per device; biggest speed gain. All 1,523 photos moved 15 Oct 2026 |
| Guide signup form | Cloudflare Pages Function + D1 database + Turnstile | Replaces the Squarespace newsletter block; see forms-setup.md |
| Analytics | Google Analytics 4 and Meta Pixel, loaded after the page | Same IDs as Squarespace; loading them late keeps the photos fast |
| Blog editing | [Pages CMS](https://pagescms.org) | Free, simple editor for posts and photos, works with GitHub |
| Code storage | [GitHub](https://github.com), existing account, private repo momentsinlight-website | Every push publishes automatically via Cloudflare |
| Build tool | [Claude Code](https://claude.com/product/claude-code) on PC (already installed) | Can build the site, run the image script locally, and push to GitHub |
| Contact form | Keep the embedded Studio Ninja form | Enquiries keep flowing into Studio Ninja unchanged |
| Pic-Time galleries | Embeds or links carry over as-is | No rework needed |
| Shopping cart | Remove | Not used |

Ruled out: Base44 (pages built in the browser, weaker for SEO), Azure Static Web Apps and Bluehost (slower or more limited than Cloudflare for this use).

## Current site inventory

About 48 pages: roughly 23 main pages and 25 blog posts. The blog count is approximate because the sitemap read was cut off.

| Group | Pages | Count |
| --- | --- | --- |
| Core | Home, Weddings, About, Testimonials, Contact | 5 |
| Galleries | Wedding Galleries, Portraits Gallery, Family Galleries | 3 |
| Portraits | Portraits, Premium Portraits, Lifestyle, Headshots, Family | 5 |
| Venues | West Auckland Wedding Venues, Abel Estate, Bridgewater Estate, Kumeu Valley Estate, Markovina Vineyard Estate, Settlers Country Manor, The Barn Waimauku, Tui Hills | 8 |
| Guides | Wedding Photo Guide, Wedding Resources | 2 |
| Blog: weddings | About 20 real-wedding posts, 15 to 40 photos each | \~20 |
| Blog: articles | Wedding day timeline planner, Auckland wedding venues, Auckland wedding photographers, Engagement rings 101, 2026 NZIPP Iris awards | 5 |

Venue pages share one layout, and so do wedding posts, so both convert in bulk once their template is built.

## Roadmap

1. **Accounts**
   - [x] Private GitHub repo: momentsinlight-website
   - [x] Cloudflare account, Pages project connected to GitHub (every push publishes)
2. **Build**
   - [x] Recreate the design and all main pages from the live site
   - [x] Blog and venue templates; all posts converted
   - [x] Studio Ninja contact form embedded; Pic-Time links carried over
   - [x] Pages CMS for blog posts and section-built pages
   - [x] Guide signup form on Cloudflare (D1 + Turnstile); GA4 and Meta Pixel
   - [x] Squarespace URL mappings carried over as 301 redirects; 404 page
3. **Review on the preview address**
   - [x] Compared side by side with the live site at desktop and phone widths
   - [x] Flagged typos approved or rejected (see Content fixes)
   - [x] Tweaks: buttons, headings, slideshows, blog galleries, gallery pages filtered by category
   - [x] Retired 9 older wedding posts (redirected to /wedding-galleries)
4. **Photos (15 Oct 2026)**
   - [x] Lightroom exports for the weddings; anything Lightroom couldn't find, plus portraits, family, venue pages and articles, taken from the current site
   - [x] Matched and uploaded to Cloudflare Images (1,523 photos); nothing loads from Squarespace any more
   - [ ] Optional: re-export the full-width hero photos at 3000px (not needed for speed or quality at current sizes)
5. **Speed (15 Oct 2026)**
   - [x] Compared old and new with Google PageSpeed Insights (see Speed below)
   - [x] Slideshows load each photo just before it shows; main photo fetched first; styles inline; analytics after load; fonts preloaded
6. **Switchover** (see [domain-switch.md](domain-switch.md))
   - [x] Every sitemap URL checked on the new site (all 200), redirects and 404 tested
   - [x] Domain added to Cloudflare (Free plan), DNS records copied and checked
   - [x] Nameservers changed at iwantmyname to dora/eoin.ns.cloudflare.com
   - [x] Cloudflare shows the domain Active
   - [x] www and the bare domain added as custom domains on the Pages project; root-to-www redirect
   - [x] Both hostnames on the Turnstile widget
   - [x] Live domain tested (all pages, canonical tags, old links, contact form, analytics)
   - [x] A real guide signup on the live domain (after fixing the Turnstile site key)
   - [x] Sitemap submitted in Google Search Console; test email arrived
   - [ ] Keep Squarespace a few weeks as a fallback, then cancel

## Image exports and matching

Done 15 Oct 2026; how it works now is in [photos.md](photos.md).

- **Exports:** 2048px long edge, sRGB JPEG, into `E:\EXPORTS\website\<year-couple>\colour` and `\mono`.
- **Matching:** camera file name first (the script strips SOCIAL\_\_, FULLSIZE\_\_, -Edit, -2, " - Copy"), then the pictures themselves are compared, which also picks colour or mono and the right edit. Camera numbering does repeat across weddings, so each post is matched against its own wedding's folder.
- **From the current site:** photos Lightroom couldn't find (most older weddings, all portraits, family, headshots, lifestyle, venue pages and articles) were downloaded from Squarespace at 2500px and resized to 2048px. Visitors see no difference at the sizes the site shows.
- **Result:** 1,523 photos on Cloudflare Images; no page loads anything from Squarespace.

## Speed

Google PageSpeed Insights, 15 Oct 2026, median of 3 runs per page, old and new tested at the same time. Mobile is a mid-range phone on slow 4G (what Google uses for rankings). Score out of 100, then how long until the main photo appears.

| Page | Squarespace | New site |
| --- | --- | --- |
| Home | 47, 5.3s | 93, 1.8s |
| Weddings | 47, 4.6s | 89, 2.1s |
| Ellie & Ryan post | 39, 13.4s | 87, 1.1s |
| Abel Estate | 38, 9.4s | 99, 2.0s |
| Portraits | 49, 5.0s | 84–97, 2.1s |
| Premium Portraits | 39, 10.1s | 86, 2.1s |

Desktop scores are 76–99 with the main photo in under a second. Pages download about a third of the data and a quarter of the files Squarespace's did. Scores move ±10 between runs; what's left is mostly Google Analytics and the Meta Pixel, which now load after the page has appeared (kept on purpose: starting them only on first scroll would lose visitors who leave without touching the page).

Rerun any time with `node scripts/speed-compare.mjs` (needs `PAGESPEED_API_KEY` in `.env`; results in `docs/speed-compare.json`).

## URLs, redirects and SEO

Every page and blog post keeps its current address, so links and rankings carry over.

- **Same URLs:** for example, /blog/kayla-and-scott-devonport-wedding stays exactly as it is.
- **Redirects:** any address that must change gets a permanent (301) redirect in a redirects file.
- **Pre-switch check:** test every URL in the current sitemap against the new site before changing the domain.
- **SEO control:** proper titles, meta descriptions, structured data and image alt text on every page, none of which Squarespace fully allows.
- **AI crawlers:** leave AI crawler access on, so the site can be read for the rebuild and recommended by AI search tools.

## Content fixes

Typos are flagged in a list for approval, never changed automatically, because some New Zealand names are unusual.

| Found | Fix | Where | Decision |
| --- | --- | --- | --- |
| Mikalea | Mikaela | Homepage, venue section | Approved |
| Bridewater | Bridgewater | Homepage, recent weddings | Approved |
| Abale estate | Abel Estate | Homepage, venue section | Approved |
| Kumeu Valley Esate | Kumeu Valley Estate | Homepage, recent weddings | Approved |
| "here are", "i have shot" | Capitalise | Homepage, venue intro | Approved |
| aand amazing, way | an amazing way | Blog: Melissa & Logan | Approved |
| passionare | passionate | Blog: Melissa & Logan | Approved |
| priviledge | privilege | Blog: Stephanie & Jankai | Approved |
| seperately | separately | Blog: how to dress for a family portrait | Approved |
| thijngs | things | Blog: Anita at the Fable | Approved |
| Ther results | The results | Blog: Viv ballet portraits | Approved |
| t0he | the | Blog: best man speech | Approved |
| posing ect. | posing etc. | Blog: Emma & Corey | Approved |
| parling | parking | Lifestyle | Approved |
| be their on their special day | be there on | Blog: Stephanie & Jankai | Approved |
| we emphasis how | we emphasise how | Blog: Melissa & Logan | Approved |
| A a result | As a result | Blog: Andrea & Nigel | Approved |
| they are they under duress | they are under duress | Blog: how to dress for a family portrait | Approved |
| 60-90 mins or photography | for photography | How I Work guide | Approved |
| the same suburb of me, of Titirangi | the same suburb as me, Titirangi | Blog: Lisa & Anthony | Approved |
| a The Barn Waimauku wedding photographer | a wedding photographer at The Barn Waimauku | The Barn venue page (text and Google description) | Approved |
| The Hotel Britomart(Britomart) | add a space | Blog: Auckland wedding venues | Approved |
| real wedding of real couples | real weddings | Homepage, recent weddings | Approved |
| Headline repeated underneath itself | Remove repeat | Homepage, top | Approved |
| Lowercase sentence starts ("the quote", "no two", "the field", "yes, she") | Capitalise | How I Work, FAQs, Sunflowers 2024, Anita at the Fable | Approved |
| i am a pretty friendly guy | I am | Portraits gallery | Approved |
| Jiankai | Jankai | Galleries, Settlers venue page, Stephanie & Jankai post | Approved (correct spelling is Jankai) |
| Dundle Hill / Dundall Hill | Dundel Hill | Blog: Bronte & Greg | Approved (correct spelling is Dundel) |
| Cauldrey house | Cauldrey House | Blog: Rebecca & Michael | Approved |
| big 2colourful outfit | big, colourful outfit | Sunflowers 2024 | Approved |
| Tonys communication | — | Blog: Julia & Alistair (client review) | Rejected: client reviews stay as written |
| American spellings (color, favorite, jewelry…) in planning posts | — | About 15 info posts | Rejected: leave as they are |

Checked 15 October 2026 across all 133 pages with `scripts/check-spelling.mjs`. Fixes apply to the new site only; the live Squarespace site still has the originals.

## Costs

Running costs drop to about US$5 a month, plus the domain already being paid for. Prices are approximate.

| Item | Cost |
| --- | --- |
| Astro, Pages CMS, GitHub | Free |
| Cloudflare hosting | Free |
| Cloudflare Images | US$5/month (Images & Stream starter bundle) |
| Cloudflare DNS | Free plan |
| Google PageSpeed API key | Free |
| Domain | Unchanged (still registered with iwantmyname) |
| Squarespace | Cancelled after switchover |

The main cost is setup time, about two weekends.

## Related ideas (exploring)

Two Studio Ninja ideas came up alongside the rebuild; neither is decided.

- **Enquiry reporting:** a [Zapier](https://zapier.com) zap logs each new Studio Ninja lead and booking to a Google Sheet, backfilled from a CSV export. Claude reads the sheet via Google Drive to report enquiry trends, conversion rate, time to book and best lead sources.
- **Own CRM on Base44:** replace [Studio Ninja](https://www.studioninja.co) with a custom CRM on [Base44](https://base44.com).
  - Data imported from a Studio Ninja CSV export
  - Built-in click-to-sign contracts with an audit trail (timestamp, IP, locked PDF)
  - Existing [Stripe](https://stripe.com) account reconnected; current clients finish in Studio Ninja
  - Pic-Time gallery link stored per client
  - Next step: list the Studio Ninja features in use and which are needed on day one

## Links

| Tool | Link |
| --- | --- |
| GitHub sign-up | [github.com/signup](https://github.com/signup) |
| GitHub Desktop | [desktop.github.com](https://desktop.github.com) |
| Cloudflare sign-up | [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) |
| Cloudflare Pages | [pages.cloudflare.com](https://pages.cloudflare.com) |
| Cloudflare Images | [cloudflare.com/…/cloudflare-images](https://www.cloudflare.com/developer-platform/products/cloudflare-images/) |
| Astro | [astro.build](https://astro.build) |
| Pages CMS | [pagescms.org](https://pagescms.org) |
| Claude Code | [claude.com/product/claude-code](https://claude.com/product/claude-code) |
| New site (preview) | [momentsinlight-website.pages.dev](https://momentsinlight-website.pages.dev) |
| PageSpeed Insights | [pagespeed.web.dev](https://pagespeed.web.dev) |
| Current site | [momentsinlight.co.nz](https://www.momentsinlight.co.nz) |
| Current sitemap | [momentsinlight.co.nz/sitemap.xml](https://www.momentsinlight.co.nz/sitemap.xml) |
