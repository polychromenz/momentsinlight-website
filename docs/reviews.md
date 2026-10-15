# Reviews (Testimonials page)

Since 16 Oct 2026 `/testimonials` shows Google reviews from the site itself instead of the
Elfsight widget, which was the slowest thing on the site (Google speed score 56 mobile / 38
desktop; now 98 / 90) and made the page jump while loading.

- **Data:** `src/data/reviews.json`: each review's name, date, stars, text, photos, Tony's
  reply and a link to it on Google, plus the summary card's points and the "Review us on
  Google" link. The page sorts by date, newest first, and works out the rating and count.
- **Page:** `src/components/Reviews.astro`: rating header, summary card, review cards with
  "Read more" / "See reply", "Load more", full review with reply, and a photo viewer.
- **Review photos** are on Cloudflare Images (`reviews/...`). Ten photos on older reviews
  (Cerise Brown, Ally Weir, Kelly Ross, Princess) no longer exist on Google and weren't shown
  by Elfsight either, so they were left out. lanlancherry's photo is a 600px copy.

## Adding a new review

1. **Pages CMS > Reviews:** add the name, date, stars and text (and your reply, the Google link,
   and photos if you like). Save; the site updates in a couple of minutes.
2. Or ask Claude Code to add it (paste the review from Google's email).
3. While the Elfsight subscription is still active, `node scripts/import-reviews.mjs` adds any
   new Google reviews automatically (with their photos). It never changes reviews already on
   the site. Once Elfsight is cancelled, use 1 or 2.

Elfsight can be cancelled; nothing on the site uses it any more.
