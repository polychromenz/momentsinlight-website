# Moments in Light Website Rebuild — Project Plan

Oct 13, 2026 · @Tony

## Overview

Rebuild [momentsinlight.co.nz](https://www.momentsinlight.co.nz) off Squarespace as a fast static site that looks the same at launch, then improve it gradually. Nothing changes on the live site until the new one has been reviewed side by side.

- **Why:** SEO tools flag issues that can't be fixed on Squarespace, the design is restrictive, and the subscription is expensive.
- **Goal:** better SEO and page speed, full design control, lower running costs.
- **Must keep:** an easy way to add wedding blog posts, every existing URL, and current Google rankings.
- **Status:** exploring; no start date set.

## Decisions

| Area | Decision | Why |
| --- | --- | --- |
| Site framework | [Astro](https://astro.build) | Outputs plain, fast HTML with full control over titles, meta tags, structured data and URLs |
| Hosting | [Cloudflare](https://pages.cloudflare.com) (static site, free) | Auckland edge server, unlimited bandwidth, free preview address for review |
| Images | [Cloudflare Images](https://www.cloudflare.com/developer-platform/products/cloudflare-images/) (about US$5/month) | Auto-resizes and serves WebP/AVIF per device; biggest speed gain |
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

About two weekends of hands-on time, spread over two to three weeks.

1. **Accounts (about 1 hour)**
   - [ ] Create a private GitHub repo for the site (done: momentsinlight-website)
   - [ ] Create a Cloudflare account and authorise GitHub access (done); select the repo and deploy after the first push
2. **Image exports (a few hours, unattended)**
   - [ ] Export every wedding, portrait and family session at 2048px into a `web` subfolder (spec below)
3. **Build (one or two sessions with Claude Code)**
   - [ ] Give Claude Code this plan as its brief
   - [ ] Recreate the design and all main pages from the live site
   - [ ] Build the blog and venue templates, then convert all posts
   - [ ] Embed the Studio Ninja contact form and carry over Pic-Time links
   - [ ] Set up Pages CMS for adding new blog posts
4. **Image matching**
   - [ ] Run the matching script against the `web` folders
   - [ ] Check the flagged, uncertain matches by eye
   - [ ] Export the landing-page images at 3000px once the script lists them
   - [ ] Set up Cloudflare Images
5. **Review on the preview address (as long as needed)**
   - [ ] Compare the new site side by side with the live one
   - [ ] Approve or reject each flagged typo
   - [ ] Request tweaks
6. **Switchover (about 1 hour, plus up to a day to propagate)**
   - [ ] Check every current URL resolves on the new site or redirects
   - [ ] Point the domain at Cloudflare
   - [ ] Submit the new sitemap in Google Search Console
   - [ ] Keep Squarespace active for a few weeks as a fallback, then cancel

## Image exports and matching

Use original files rather than Squarespace's compressed copies, matched to each page by a script on the PC.

| Export | Size | Format | Where | When |
| --- | --- | --- | --- | --- |
| Blog and gallery images | 2048px long edge | sRGB JPEG, quality \~85 | `web` subfolder in each session folder | Before the build |
| Landing and full-width images | 3000px long edge | sRGB JPEG, quality \~85 | Same folder | After the script lists which ones they are |

- **Folders:** existing session folders are already named by date and couple (for example, 2025-03-15 Sarah & James), so each blog post is matched only against its own wedding's folder.
- **Matching:** filename first, then visual matching (perceptual hashing) to confirm each pair and catch renamed files.
- **Filename clean-up:** the script strips Squarespace extras such as SOCIAL\_\_, FULLSIZE\_\_, -Edit and " - Copy" before matching.
- **Duplicate names:** not a risk, since the two R5 Mark II bodies already use different prefixes (\_30A and \_Q9A).
- **Fallback:** any image with no original found uses the downloaded Squarespace copy, so nothing goes missing.
- **Scope:** include portrait and family sessions too, since they appear on the landing pages.

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
| Cloudflare Images | About US$5/month |
| Domain | Unchanged |
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
| Current site | [momentsinlight.co.nz](https://www.momentsinlight.co.nz) |
| Current sitemap | [momentsinlight.co.nz/sitemap.xml](https://www.momentsinlight.co.nz/sitemap.xml) |
