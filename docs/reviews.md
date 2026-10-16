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

1. **Moments Studio > ★ Reviews** (www.momentsinlight.co.nz/studio/reviews): **+ Add a review**, then copy
   across their name, the date, the stars and the text (and your reply, the Google link and their
   photos if you like). Save; the reviews page and carousels update in about a minute. Edit or
   remove any review the same way.
2. To show a couple's review in their love story, choose it under **Their Google review** in that
   post's settings.
3. Pages CMS (Reviews) still works too, or ask Claude Code to add it.

Elfsight was cancelled in October 2026, so  (which read its feed) no
longer fetches new reviews.
