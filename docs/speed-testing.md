# Speed testing

A health check of how fast the live site loads, using **Google PageSpeed Insights**: the same
test as [pagespeed.web.dev](https://pagespeed.web.dev), run on Google's servers. It's what Google
uses when judging page speed for search, and because it doesn't run on this computer, your
internet connection doesn't affect the results.

## Running it

In the project folder:

```bash
node scripts/speed-test.mjs
```

That tests seven key pages (Home, Weddings, a wedding post, Abel Estate, Portraits, Premium
Portraits, the photo guide) on mobile and desktop, three runs each, and takes about 10 minutes.
Results print as a table and are saved to `docs/speed-tests/<date>.json`.

| Option | What it does |
| --- | --- |
| `--why` | Lists what's slowing each page down (heavy scripts, layout shifts, image savings) |
| `--runs=1` | One run per page: quicker, but scores wobble more |
| `--pages=/,/about,/blog/some-post` | Test other pages |
| `--site=https://momentsinlight-website.pages.dev` | Test another address (e.g. a preview) |

Or just ask Claude Code to "run the speed test".

## Setup (done)

It needs a free Google API key in `.env` (never committed):

```
PAGESPEED_API_KEY=AIza...
```

Created 15 Oct 2026 in Google Cloud: PageSpeed Insights API enabled, then APIs & Services >
Credentials > Create credentials > API key, restricted to **PageSpeed Insights API**. Google's
keyless allowance is shared by everyone and usually used up, so the key is needed. If it's ever
lost, make a new one the same way.

## Reading the results

| Measure | What it means | Good |
| --- | --- | --- |
| **Score** | Google's overall speed score out of 100 | 90+ (50–89 needs work) |
| **LCP** | How long until the main photo or heading is shown | under 2.5s |
| **FCP** | How long until anything is shown | under 1.8s |
| **TBT** | How long the phone is too busy running scripts to respond | under 200ms |
| **CLS** | How much the page jumps around while loading | under 0.1 |
| **MB / files** | How much the page downloads | lower is better |

**Mobile** simulates a mid-range phone on slow 4G (the one that matters most for Google);
**desktop** a fast connection.

- **Scores vary ±10 between runs**, which is why it takes the middle of three. Look for a page
  that's consistently lower than before, not one dip.
- **Most of what's left is Google Analytics and the Meta Pixel** (they show up under `--why` as
  scripts). They load after the page has appeared, so visitors don't wait for them, but Google
  still counts them. This is a deliberate trade-off: loading them only on first scroll would
  score higher but lose visitors who leave without touching the page.
- **"Improve image delivery"** usually means Cloudflare's default compression could go a little
  further. Savings of a few hundred KB are fine for a photography site; photo quality matters more.

## When to run it

- After design changes, especially to the home page, slideshows or anything near the top of a page.
- After adding a new tracking script, chat widget or embed.
- Every month or two as a check-up.

If a page drops noticeably, run it with `--why` for that page and ask Claude Code to look into it.

## Results so far

| Date | Notes |
| --- | --- |
| 15 Oct 2026 | Before and after the move from Squarespace (summary in [project-plan.md](project-plan.md#speed)). New site: mobile 84–99, desktop 76–99; Squarespace was 35–62 on mobile. |
| 16 Oct 2026 | First health check after launch: mobile 87–97, desktop 88–99; main photo 1.7–3.2s on mobile, under 1s on desktop; no layout shift. Lowest: photo guide on mobile (87, 3.2s). `docs/speed-tests/2026-10-16.json` |
| 16 Oct 2026 | Testimonials rebuilt without Elfsight: 56 → 98 mobile, 38 → 90 desktop. Portraits photo wall replaced by a slideshow: 92 mobile, 95 desktop, half the data. |

Why not Lighthouse on this computer? It's the same test, but here its test browser kept crashing,
and results would depend on the local connection. PageSpeed Insights avoids both.
