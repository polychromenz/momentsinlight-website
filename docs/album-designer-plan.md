# Album designer and album sales (plan, 2026-11-19)

Tony wants to sell Seldex **Boutique Book** albums from the client galleries, designed in his own
studio instead of Seldex's SDS (app.seldex.com.au), then uploaded to Seldex by hand like prints.
Hidden from clients until he switches it on (same "only Tony sees it" rule as the print shop at first).

## What Seldex needs (seldex.com.au/product/boutique-books-matte, /filepreparation)

- Double-page spreads, **JPEG**, sRGB or Adobe RGB (1998), **300 dpi at the exact size**:
  a W×H album needs spreads of 2W × H inches, e.g. 10×10 → 6000 × 3000 px, 12×12 → 7200 × 3600 px.
- Files named in order: `001.jpg`, `002.jpg`, …
- Sizes: 12×12, 10×10, 8×8, 6×6; 11×14, 10×14, 9×12, 8×12, 8×10, 7×10, 7×5½, 7×5 (portrait or landscape).
- 10 spreads included, up to 45.
- Order options: cover material (Premium/Classic Leather, Velvet, Macrosuede, Asahi, Image Wrap, Linen,
  Leatherette, Buckram) and colour, lining (white, black, printed, handmade), paper (Matte Ivory/White),
  packaging (presentation boxes, slipcase, folio box), studio logo position, vellum title page,
  companion albums (up to 4; same spreads, 6×6, 7×5, 7×5½).
- **To confirm with Seldex:** bleed and the safe area around the layflat gutter (not stated online),
  and the cover file needs for Image Wrap covers.

## How it would work

1. **Shop (hidden at first).** A Boutique Book product: size, number of spreads (10 included, extra per
   spread), cover material and colour, packaging. The couple pays (in full or a deposit, to decide).
2. **Choosing photos.** The couple picks their album photos in the gallery (a list, like favourites),
   with a target count suggested from the spreads (about 2–3 photos a spread).
3. **Designer (studio).** Tony opens the order and gets an automatic first draft: the picks flowed into
   spreads in gallery order, using layouts for 1 to 4 photos a spread (portrait/landscape aware, never a
   face across the gutter: single photos sit on one page or span with the gutter kept clear). Then he
   edits: swap and drag photos between spreads, change a spread's layout, pan and zoom inside each frame,
   background colour, add or remove spreads, a 150 dpi quality warning per frame (as the print shop does).
   Guides show the trim, safe area and gutter.
4. **Proofing (gallery).** The couple pages through the spreads in their gallery, comments on any
   spread and approves. Tony makes changes; a new proof version goes back. Approval is recorded.
5. **Export.** In Tony's browser, from the originals (like the print lab files): every spread at the
   exact pixel size, JPEG at 300 dpi in sRGB, named 001.jpg onwards, in a ZIP with an order sheet
   (size, cover, options). He uploads it to Seldex with the order.

## Building blocks already there

- Gallery photos and originals (R2), crops as fractions, browser-side rendering and ZIP (src/prints/lab-files.ts).
- Print shop: products, cart, Stripe checkout, orders, Seldex lab_item notes, the "Tony only" switch.
- Gallery lists (favourites) for choosing photos; gallery comments patterns for proofing.

## Phases

1. Album product + photo choosing + order (hidden), Seldex costs and prices.
2. Designer: auto layout, editing, guides, save versions.
3. Proofing in the gallery: comments, approve.
4. Export ZIP for Seldex; order steps (designed → proofed → approved → ordered → shipped).
5. Later: companion albums, image wrap covers, other album types.

## To decide with Tony

- Prices (Seldex costs per size, per extra spread and per cover, behind the login) and his design fee.
- Deposit or full payment up front; how many proof rounds are included.
- Which sizes and cover materials to offer (a shorter list is easier for couples).
- Bleed/safe area from Seldex before building the export.
