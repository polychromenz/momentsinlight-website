# Wedding photo guide signup form: setup

The signup on `/wedding-photo-guide` asks for first name, last name and email. When someone
submits it, a Cloudflare Pages Function (`functions/api/guide-signup.js`) saves the signup to a
Cloudflare D1 database and sends them back to the guide page, which then shows a thank-you message and the download button for the guide
(`public/s/Wedding-photography-guide-Moments-In-Light.pdf`).

Spam protection: a hidden field that only bots fill in, plus Cloudflare Turnstile (a free,
usually invisible "are you human" check).

## Status (15 Oct 2026)

Set up and working on the preview site: the `momentsinlight-signups` D1 database is bound as
`DB`, the table exists, and the Turnstile secret is set. **When the domain switches**, add
`momentsinlight.co.nz` and `www.momentsinlight.co.nz` to the Turnstile widget's hostnames
(see [domain-switch.md](domain-switch.md)), or the form will reject visitors on the real domain.

## One-off setup (done)

1. **Create the database** (in a terminal in the project folder):
   `npx wrangler login`, then `npx wrangler d1 create momentsinlight-signups`.
   In `wrangler.toml`, remove the `#` from the `[[d1_databases]]` lines and paste in the `database_id` it prints.
2. **Create the table:** `npx wrangler d1 migrations apply momentsinlight-signups --remote`
3. **Connect it to the site:** Cloudflare dashboard > Workers & Pages > the site > Settings >
   Bindings > add a D1 database binding named `DB` pointing at `momentsinlight-signups`.
   (Pages reads this from `wrangler.toml` too, but check it's listed.)
4. **Turnstile:** Cloudflare dashboard > Turnstile > Add widget, for `momentsinlight.co.nz`
   (and the `.pages.dev` preview address). It gives a site key and a secret key. In the site's
   Settings > Variables and secrets add:
   - The site key is already in `src/components/page/GuideSignup.astro` (it is public)
   - `TURNSTILE_SECRET_KEY` = the secret key (as a secret)

   Then redeploy. Until this is done the form shows a "For testing only" Turnstile box.

## Seeing who has signed up

Cloudflare dashboard > Storage & Databases > D1 > `momentsinlight-signups` > Console, and run:

    SELECT first_name, last_name, email, created_at FROM guide_signups ORDER BY created_at DESC;

or from the project folder:
`npx wrangler d1 execute momentsinlight-signups --remote --command "SELECT * FROM guide_signups"`

## Testing locally

`npm run build`, then `npx wrangler d1 migrations apply momentsinlight-signups --local`
(first time only), then `npx wrangler pages dev dist` and open http://localhost:8788/wedding-photo-guide.
`npm run dev` shows the form but can't submit it, because the Function only runs under Wrangler.
Local test keys live in `.dev.vars` (not committed).
