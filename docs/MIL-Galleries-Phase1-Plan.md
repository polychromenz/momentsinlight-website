# MIL Galleries: Phase 1 plan

Agreed with Tony on 2026-10-18. Builds on `MIL-Galleries-Spec.md`. Phase 1 = galleries core, plus an early Pic-Time importer so real galleries can be previewed.

## Decisions
| | |
|---|---|
| Where | Same repo and Cloudflare Pages project as the website and studio; `galleries.momentsinlight.co.nz` added as a second domain and routed by hostname. Shares D1, studio sign-in (Cloudflare Access), Resend, styling (the website's own design tokens and components). |
| Photos | Cloudflare **R2** (Tony's existing account; pay as you go past the free 10 GB, about US$3/month at 193 GB). Website photos stay in Cloudflare Images. |
| Cloudflare plan | **Workers Paid** (US$5/month): needed for streamed ZIPs of full-size photos; also lifts the 50-requests-per-run limit. |
| Sizes | Full size (sRGB, JPEG quality 90, no resize) + 2048px web + 600px thumbnail. Lightroom exports all three; the studio importer makes web/thumb in the browser. No per-image processing fees. |
| Privacy | Web/thumb photos at long random addresses; full size only through the API after checking the link's rights; every client gallery `noindex`. Watermark (Tony's monogram) added on the fly to web sizes for links that need it. |
| Expiry | 6 months by default; then offline (not deleted). Paid extension NZ$49 for 12 months, **overridable per gallery/client** (free, special price). Payment via Stripe comes with the extension feature. |
| Hero & cover | Chosen in the studio after publishing (as Tony does in Pic-Time). |
| Sections | Lightroom: collection set = gallery, collection = section; **green label = colour → "Section", purple = mono → "Section B+W"**; other labels skipped (same rules as Tony's Wedding Collection Export plugin). |
| Lightroom plugin | A **new** Publish Service plugin, separate from the existing Wedding Collection Export (kept for Pic-Time). Publishes in small batches, uploads photo by photo, skips what's already uploaded, so a whole wedding can't crash or restart from scratch. |
| Early real data | **Pic-Time downloads**, imported in the studio (folder per section), before the plugin is finished. |

## Milestones
1. **1a Foundations**: R2 bucket, D1 tables (galleries, sections, images, videos, access links, viewers, lists, list items, events, templates, settings), upload API (presigned R2 URLs, API key for Lightroom), galleries domain.
2. **1b Studio importer + admin basics**: import a Pic-Time download (folder per section, browser makes sizes, resumable), gallery list and details, reorder photos/sections, hero/cover, hide/move/delete. → first real galleries online for preview.
3. **1c Client gallery**: cover page, sticky sections, mosaic with 2×2 heroes, lightbox/slideshow, per-photo actions; access links (main / invited / guest), access codes, email-at-entry with consent, watermark, visible sections, download level, expiry.
4. **1d Lists & downloads**: favourites, named lists, list sharing (never wider than the parent link), send to Tony (purpose + note), selection requests (min/max/deadline, lock/reopen), select mode; downloads of a photo / selection / list / section / gallery, full or web size, streamed store-only ZIP with print release, all tracked.
5. **1e Lightroom Publish Service** (Windows): green/purple → sections, custom sort order, re-publish changes only, deletions after confirmation, retries and clear progress.
6. **1f Studio extras**: Send to client (branded email), preview as client/guest, templates per type, gallery dashboard and activity feed (also on the studio dashboard and morning email), portal link, blog photo picker, videos.

## Later / noted
- A Lightroom helper that **creates the standard wedding collections** on import (Tony's idea), possibly as a menu item in the new plugin.
- Phase 2: vendors, second shooter, full migration, portfolio pages. Phase 3: shop, sales emails, paid expiry extension checkout if not done earlier.
