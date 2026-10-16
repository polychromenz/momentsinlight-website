# Moments Studio: your post editor

**Address:** https://www.momentsinlight.co.nz/studio. Sign in with your email and the code Cloudflare emails you.

## Everyday use

- **Your posts:** cover cards, newest first. Search, or filter by Love stories, Portraits, Family, Articles, or Drafts & scheduled. **+ New post** starts one.
- **The editor:** the post as it will look.
  - **Title:** type it straight onto the page. The web address fills in from it (it's fixed once the post is first saved, so links keep working).
  - **Story:** headings, bold, italic, links, lists, quotes, and **🖼 Photo** to put a photo inside the text.
  - **Photos:** drag in photos or a whole Lightroom export folder. Drag to reorder, **☆** to choose the cover, **×** to remove (it stays in your photo library). Each photo has a description for Google and screen readers: **✨ Suggest** writes one; always give it a quick read.
  - **Cover:** click on the faces in the big cover photo to set where it crops on the post cards.
  - **Settings panel:** type, post date, venue (choosing one of your venues puts the post on that venue's page), venue website, their Google review, opening, gallery style, Google title and description (**✨ Suggest from the post**, with a preview of how it looks on Google), and under More settings: web address, tags, author, last updated.
- **Buttons**
  - **Save draft:** saved, but not on the site.
  - **Publish:** live in about a minute. If the post date is in the future the button says **Schedule**, and the post appears on that day (the site rebuilds every morning at 6am to release it).
  - **Update:** saves changes to a published post.
  - **Unpublish:** takes a post off the site and keeps it as a draft.
  - **Delete post:** removes it completely (its photos stay in your photo library).
- **★ Reviews** (from the post list): add a new Google review (copy it across from Google), or edit or remove one. See reviews.md.
- **📈 Stats** (from the post list): visits and page views for the last 7, 30 or 90 days, top pages and love stories, where visitors come from, devices and countries. Numbers come from Cloudflare Web Analytics.
- **Share it** (in Settings, once a post is live): Facebook and Pinterest buttons (Pinterest gets the cover photo and title), Copy link, and Copy Instagram caption (Instagram doesn’t take posts from websites, so paste the caption into the app).
- Posts with a table (some articles) open in a safe plain-text mode with a preview underneath, so the table can't be damaged.

## If something goes wrong

1. Open **https://www.momentsinlight.co.nz/api/studio/check** (while signed in to the studio). It tests each setting and says in plain words what's wrong. It never shows the keys.
2. After changing any setting in Cloudflare, the site must rebuild before it takes effect: GitHub → momentsinlight-website → **Actions → Daily rebuild for scheduled posts → Run workflow**, then wait a couple of minutes.

## Settings (for reference)

Cloudflare → Workers & Pages → momentsinlight-website → Settings → Variables and secrets (Production):

| Name | What it is |
|---|---|
| `GITHUB_TOKEN` | GitHub fine-grained token "Moments Studio": this repository only, Contents read and write. **Expires about October 2027**: make a new one before then and replace it here. |
| `CF_IMAGES_TOKEN` | Cloudflare Images key (same as `CLOUDFLARE_IMAGES_TOKEN` in `.env`) |
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `ACCESS_TEAM` | `holy-disk-a1da` (Cloudflare Zero Trust team) |
| `ACCESS_AUD` | The Moments Studio Access application's AUD tag |
| `CF_ANALYTICS_TOKEN` | Cloudflare API token "Moments Studio stats": Account → Account Analytics → Read (Stats page only) |

- **Sign-in:** Cloudflare Zero Trust → Access → Applications → **Moments Studio** (protects `www.momentsinlight.co.nz/studio` and `/api/studio`), policy **studioaccess** (your email addresses).
- **Scheduled posts:** `.github/workflows/daily-rebuild.yml` calls the Cloudflare deploy hook stored in GitHub as the `CF_DEPLOY_HOOK` secret, every day at about 6am NZ time.
- **Suggestions:** Cloudflare Workers AI (`[ai]` in `wrangler.toml`); free allowance.
- **Code:** `src/pages/studio/` (pages), `src/studio/` (editor), `functions/api/studio/` and `functions-lib/studio.js` (server side).
