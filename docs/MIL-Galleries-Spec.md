# Moments in Light — Client Galleries & Studio Sales
## Build Spec for Claude Code

Owner: Tony (Moments in Light, Auckland NZ)
Status: Ready to plan / start Phase 1
Date: 2026-10-18

---

## 0. Read first

- This replaces **Pic-Time** (client galleries + print store). Pic-Time is paid up to **March 2027**, so the system must be live and all galleries migrated before then.
- It plugs into the **existing new Moments in Light website** (Cloudflare-hosted, with a `studio` section / client portal that is replacing Studio Ninja). **Inspect the existing repo first** and follow its stack, conventions, auth and styling. Don't introduce a parallel framework.
- Brand: follow `Moments in Light - Brand Guidelines.pdf` and the existing site's design tokens.
- Email: **Resend** is already in use, so reuse the existing integration.
- Payments: **Stripe** (already used by the business; Stripe syncs to Xero).
- Tony is a solo photographer and an experienced .NET developer on Windows. Keep admin UX fast and simple. No Mac-only tooling.
- Plan in phases (section 12). Confirm the plan with Tony before writing large amounts of code.

---

## 1. Goals

1. Client galleries at `galleries.momentsinlight.co.nz`, linked from each client's studio portal page.
2. Match Pic-Time's look and features, restyled to the MIL brand, and improve on them.
3. One image library shared by galleries, the portal and the website blog: pick gallery images into blog posts with no re-uploading.
4. Full-resolution client downloads (clients may print anywhere), plus web-size versions.
5. A sales engine (prints, wall art, albums) driven by branded, image-rich emails.
6. Features Pic-Time lacks: a safe second-photographer upload, vendor links tied to SEO, and better emails.

### Non-goals (for now)
- Automated lab ordering (pending answers from Atkins/Seldex).
- DIY drag-and-drop album editor (later phase).
- Native mobile app (a responsive web app and "add to home screen" are enough).
- Multi-language (English only).

---

## 2. Current state & numbers (for sizing)

- Pic-Time library: **190.4 GB photos + 2.9 GB video (~193 GB)**.
- This year: 46 galleries delivered (14,579 photos), 1,842 views (715 users), 523 downloads, $77.57 revenue.
- Gallery types used: **Wedding, Portraits, Headshots, Events**.
- Every wedding image is delivered in **colour and B&W**. B&W images are in separate sections (e.g. "Ceremony B+W").
- Labs used via Pic-Time: **Atkins** (prints) and **Seldex** (albums), both Australian.

---

## 3. Architecture (proposed; adapt to the existing repo)

| Concern | Choice |
|---|---|
| Hosting / API | Cloudflare (Workers / Pages Functions), matching the existing site |
| Image & video storage | **Cloudflare R2**: originals full size, free egress (~US$3/month at current size) |
| Web sizes | 2048px long edge (+ thumbnails) generated at upload or via Cloudflare image resizing; never resize originals |
| Database | Whatever the site already uses (likely D1); otherwise D1 |
| Email | Resend (+ React Email templates) |
| Payments | Stripe Checkout |
| ZIP downloads | Streamed on demand from R2 using store-only ZIP (JPEGs don't compress); no pre-built ZIPs stored |
| Watermarks | Applied on the fly to web-size images for links that require them; originals stay clean |
| Video | MP4 in R2 with a standard HTML5 player |
| SEO | All client galleries `noindex`; only "portfolio/showcase" versions are indexable |

Storage layout suggestion (R2):
```
galleries/{galleryId}/original/{imageId}.jpg
galleries/{galleryId}/web/{imageId}_2048.jpg
galleries/{galleryId}/thumb/{imageId}_600.jpg
galleries/{galleryId}/video/{videoId}.mp4
contrib/{galleryId}/{uploadId}/...   (second-shooter inbox; lifecycle auto-delete)
```

---

## 4. Data model (starting point)

- **Gallery**: id, slug, name, type (Wedding / Portraits / Headshots / Events; configurable), date, description, location/venue, spouseA, spouseB, newFamilyName, status (draft/online/offline), expiresAt (nullable), coverImageId, templateId, clientId (link to studio client), showOnPortfolio, seoTitle, seoDescription, settings (JSON).
- **Section**: id, galleryId, name, sortOrder, isBW (bool), hidden.
- **Image**: id, galleryId, sectionId, filename, width, height, bytes, sortOrder, isHero, hiddenByClient, lightroomId, checksum, takenAt, contributorId (nullable).
- **Video**: id, galleryId, sectionId, filename, bytes, duration, downloadable.
- **AccessLink**: id, galleryId, kind (main_client / photographer_invited / guest / vendor / list_share), token, accessCode (nullable), visibleSectionIds, watermark (bool), downloads (none / web / highres), allowLists, allowShop, requireEmail, expiresAt, vendorId (nullable), listId (nullable).
- **Viewer**: id, galleryId, email, name, role, consentMarketing, firstSeen, lastSeen.
- **List**: id, galleryId, ownerViewerId, name, kind (favourites / custom / selection_request), purpose (album / retouch / prints / other), status (open / submitted / locked), minCount, maxCount, deadline, instructions, note.
- **ListItem**: listId, imageId, addedAt.
- **Vendor**: id, name, type (venue / florist / celebrant / planner / other), email, website, notes.
- **Contributor** (second shooter): id, name, email.
- **ContributorUpload**: id, galleryId, contributorId, mode (raw / edited), token, expiresAt, status.
- **Event / Analytics**: viewerId, galleryId, type (view / download / share / favourite / list_add / list_submit / shop_view / order), imageId, meta, at.
- **Order** (Phase 3): id, galleryId, viewerId, stripeSessionId, status, items[], labTarget (atkins / seldex / manual / other), labStatus.
- **Template**: per gallery type, default settings and default email package.

---

## 5. Client gallery (viewer)

### 5.1 Cover page
- MIL logo top centre, large cover image, names in spaced capitals, date below, soft sage background (from brand tokens).
- "View gallery" scroll/button into the grid.

### 5.2 Gallery view
- Header: **Gallery / Shop** tabs (left); **Select, Download, Share, Cart, Menu**, logo (right).
- **Sticky section navigation** bar listing sections, overflowing into **More ▾**. Highlights the current section on scroll.
- Search bar placeholder (search lands in a later phase).
- **Mosaic grid** with tight gutters. **Hero images span 2×2.** Section title centred above each section.
- Lightbox: click to enlarge, next/prev, keyboard and swipe, slideshow mode.
- Mobile-first and fast: lazy loading, responsive `srcset`, thumbnails first.

### 5.3 Per-image actions (hover toolbar, tap-menu on mobile)
- Favourite (heart), Buy (bag), Hide (eye), Download, Enlarge.
- **Hide**: moves the image to the end and hides it from anyone the client shares with. Reversible.

### 5.4 Select mode
- Circle tick on each image; select across sections.
- Bottom action bar: **"N photos selected · View" | Shop | Share | Download | Save (to list) | More | ✕**.
- **Download** gives a ZIP of only the selected images.
- **Print prompt** while selecting: a small dismissible card ("Bring your favourite photos to life… from NZ$xx"), shown once per session, opening the Shop with the selection pre-loaded. Copy and prices are editable in the studio.

### 5.5 Favourites, lists & client selection (one unified system)
- **Favourites** = the default list for every viewer.
- **Custom lists** with names chosen by the client ("For Mum", "Album picks", "Wall art").
- Every list can:
  - **Share**: creates a `list_share` AccessLink showing *only* that list. It inherits the parent link's watermark/download rules and can never widen access.
  - **Download** as a ZIP.
  - **Shop** with the list pre-loaded.
  - **Send to Tony**: submit with a purpose (album / retouch / prints / other) and a note. Tony gets notified (email plus studio activity).
- **Selection requests** (created by Tony): name, min/max count, deadline, instructions. The client sees a running count and submits. Submitting locks the list; Tony can reopen it.
- Guests can have their own favourites and lists if their link allows it.

### 5.6 Downloads
- Single image, selection, list, section, full gallery.
- Full-res and web-size options (each toggled per gallery/link).
- Include a **print release** (PDF/TXT) in every ZIP.
- Video downloads per setting.
- Track every download (who, what, when).

### 5.7 Sharing
- Share gallery or single image to social or email, with correct Open Graph preview images.
- Toggle per gallery.

---

## 6. Access & links (studio side)

Per gallery, the studio can create:
- **Main clients** (one or more): name + email, with **Send to client** (branded Resend email) or **Copy link** to send manually.
- **Photographer-invited**: invite by email, secure link, or access code.
- **Guest link**: secure link and/or access code. Watermark optional.
- **Vendor links** (section 8).

Each link sets: visible sections, watermark on/off, downloads (none / web / high-res), lists allowed, shop allowed, require email before entry (captures guest email with explicit marketing consent), and expiry.

Also needed: access request / pre-register option, private gallery flag, social sharing toggle, and a gallery expiry date (the guides promise a minimum of 6 months online).

---

## 7. Studio admin (gallery management)

- **Gallery list**: search, filter by type/date/status. Insights per period: galleries delivered, photos, views (unique users), downloads, revenue.
- **Gallery details**: name, slug, date, type, description, location/venue, spouse A/B, new family name, language (EN), status, expiry.
- **Photos & media**:
  - Drag-and-drop **reorder** of images and sections.
  - Click to set **hero** images.
  - Choose the **cover image**.
  - Move, hide or delete images; rename sections.
  - Manual upload as a fallback to Lightroom.
- **Preview gallery** exactly as a client sees it, with a role switcher: client / guest / vendor.
- **Gallery dashboard**:
  - status, items stored, expiry, active campaigns
  - clients with last visit and downloads
  - views, downloads, shares, favourites and lists, store sales (each with user counts)
  - lists submitted and selection requests
- **Templates**: save a gallery as a template per type (default settings, links, email package).
- **Show on portfolio**: pick sneak-peek images plus SEO fields to create a public showcase page on the main site.
- **Activity feed**: favourites, lists submitted, downloads, orders.
- Link the gallery to the studio client record so it appears in their portal.

---

## 8. Vendor links (SEO)

- **Vendor directory** (venue, florist, celebrant, planner…), reusable across galleries.
- Per gallery, add vendors and pick the images or sections each one sees.
- Web-size downloads only, with a **credit line** (e.g. "Photo: Moments in Light, momentsinlight.co.nz"). Watermark optional.
- Vendor email template (Resend): the link plus a polite request for a credit or backlink to momentsinlight.co.nz.
- Track vendor views and downloads.
- **Blog tie-in**: the website's blog editor gets an **image picker** that browses galleries (web-size versions) so venue/real-wedding posts reuse the same images. Link venue posts to vendor records.

---

## 9. Second photographer upload

- The studio creates a **contributor upload link** for ONE gallery. It is upload-only, time-limited and revocable, with no access to anything else.
- Two modes:
  - **RAW handoff**: large-file resumable upload to `contrib/…`. Tony downloads them into Lightroom. An R2 lifecycle rule auto-deletes after N days (default 30).
  - **Edited JPEGs**: land in a hidden "Second shooter" section for Tony to approve or move.
- Nothing is visible to clients until Tony approves.
- Optional contributor credit.
- Support very large uploads: chunked/multipart uploads to R2 with presigned URLs, and resume after a dropped connection.

---

## 10. Lightroom Classic plugin (Windows) — Publish Service

Tony already uses a custom Lightroom export plugin (written previously). Build a new **Publish Service** plugin (Lua, Lightroom SDK):

- Publish service = the MIL Galleries account (API key or token stored securely).
- **Collection set = gallery; collection = section** (including "… B+W" sections).
- Gallery metadata (name, type, date, venue) set in the plugin's collection-set settings.
- On publish, for each photo:
  - export a full-size JPEG and a 2048px JPEG (or upload full size only and generate sizes server-side; choose the simpler option)
  - upload directly to R2 via presigned URLs from the API
  - register with the API: section, sort order, Lightroom id, checksum
- **Re-publish only changed photos.** Deletions in Lightroom remove the image from the gallery after confirmation.
- Push **Lightroom custom sort order** as the gallery order.
- Map a Lightroom flag/keyword/colour label to **hero** and one to **cover**.
- Later: **pull a client's submitted list back** into Lightroom as a collection (e.g. "Album picks – Josh & Paul").
- Must work on **Windows**, with robust retries and clear progress and errors.

---

## 11. Migration from Pic-Time

- Migrate **all** galleries (customer-service decision), about 193 GB.
- Build an **inventory**: client, date, type, image count, size, whether the Lightroom catalogue is available, old Pic-Time URL.
- Preferred path: **re-publish from Lightroom** using the plugin. This keeps sections and order.
- Fallback: download from Pic-Time and bulk-import through an admin importer (folder per section → section).
- Run newest first. Pic-Time stays live in parallel.
- After each gallery migrates, email the client their new link through the studio.
- Note: Pic-Time favourites, comments and sales history probably won't carry over.
- Target: everything migrated and Pic-Time cancelled before the **March 2027** renewal.

---

## 12. Phases

**Phase 1: Galleries core (MVP for new weddings)**
- Data model, R2 storage, upload API, image sizes
- Lightroom Publish Service plugin
- Client viewer: cover page, sticky sections, mosaic grid with heroes, lightbox, slideshow
- Favourites, lists, list sharing, send to Tony, selection requests
- Select mode, downloads (all variants, streamed ZIP), print release
- Access links (main / invited / guest), access codes, watermark, section visibility, expiry
- Studio admin: gallery CRUD, reorder, hero/cover, preview, templates, gallery dashboard and stats
- Portal integration and the blog image picker

**Phase 2: Vendors, contributors, migration**
- Vendor directory, vendor links, vendor emails
- Second-photographer upload (RAW and edited modes)
- Portfolio/showcase pages with SEO
- Migration importer and inventory, then migrate everything

**Phase 3: Sales**
- Shop tab, product catalogue (sizes, papers, prices in NZD), cart, Stripe Checkout
- Orders in the studio; **manual lab fulfilment** (export a print-ready package per order). Design an adapter interface so Atkins/Seldex/print-on-demand can be automated later.
- **Album Starter**: auto-draft album spreads from a submitted list or the best images, Tony approves, and the client sees a ready-to-buy album
- Album export package for the lab (numbered images plus spread order)
- Print prompts in Select mode
- **Email workflows (Resend + React Email)**, branded and showing the client's own images:
  - gallery delivered
  - favourites reminder (+1 week)
  - album offer with deadline (+3 weeks)
  - wall art with room mockups (+6–8 weeks)
  - anniversary offer
  - seasonal broadcasts
  - list-based triggers (e.g. a "Wall art" list with no order)
  - email package per gallery; Resend webhooks for opens/clicks

**Phase 4: Later / nice to have**
- **Search by person** (face grouping at publish time; AWS Rekognition or an open-source model): face thumbnails in the search bar. Per-gallery opt-out; follow NZ Privacy Commissioner biometrics guidance.
- **Search by text** (AI descriptions/embeddings, e.g. Cloudflare Vectorize): "cake", "dog", "first dance".
- DIY album editor.
- Client can add their own photos.

---

## 13. Open questions (ask Tony / track)

1. Pic-Time billing currency (check invoice) — affects savings calc only.
2. Atkins and Seldex: do they offer an ordering API or file-drop integration? (Tony to email both.)
3. Second shooters: RAW handoff or edited JPEGs by default?
4. Product list and pricing for the shop (prints, wall art, albums).
5. Default gallery expiry (guides promise at least 6 months).
6. Full-res export size and quality from Lightroom (e.g. full size at quality 90, or a capped long edge).

---

## 14. Content to update when Phase 3 ships

- `Moments in Light - Wedding Photos Guide 2026.pdf`:
  - "Delivery of Your Images" bullets
  - "Why Print?" (ordering via two professional labs)
  - "Wedding Albums" (assisted/DIY, video guide)
- `Moments in Light - Wedding Guide 2026.pdf`: picture delivery and the "How do I access my images?" FAQ (mostly still accurate)
- The existing gallery-delivery and print emails
