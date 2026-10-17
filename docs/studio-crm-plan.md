# Studio CRM: Studio Ninja replacement plan

**Status:** planning only, nothing built yet (17 Oct 2026).
**Owner:** Tony (Moments in Light, momentsinlight.co.nz)
**Lives in:** the `/studio` section of the website (Cloudflare), next to Posts, Reviews and Stats.

## Goal

Replace Studio Ninja (expensive, quirky, very limited email templates) with a custom CRM built
into the website. Run Studio Ninja in parallel until each phase is proven, then cancel.

## Principles (Tony, 17 Oct 2026)

- **Build it the way Tony works, not the way Studio Ninja works.** Studio Ninja forced
  compromises; the exports are a starting point, not a spec. Re-plan each workflow from what
  Tony actually does now (e.g. weddings: plan and practice shoot about **6 weeks** before, then a
  chat about the plan for the day **1 week** before), and tidy the templates to match.
- **Emails match the website's style:** same fonts, champagne/green palette, leaf-corner shapes
  and buttons, so an email from Tony feels like part of momentsinlight.co.nz. Kept simple enough
  to read well in Gmail, Outlook and on phones, and to look like a personal email rather than a
  newsletter.
- **A better signature:** Studio Ninja's is just "Tony", phone number and the logo. The new one
  is designed with the site: name, role, phone, website, the logo, and perhaps a small photo or
  social links.
- **Chosen design (17 Oct 2026):** design A "the card" (champagne background, logo on top, white
  leaf-cornered card, green section labels and button) with the photo signature (photo, name,
  role, phone, website, Instagram, small logo). Sample: [email-design/preview.html](email-design/preview.html).

## Decisions

- **Hosting:** Cloudflare.
  - The website's Pages Functions (`functions/api/studio/...`) for the screens and actions.
  - **D1** for the data, **R2** for signed contract PDFs.
  - A small companion **Worker with a Cron Trigger** for scheduled sending. Pages can't run on a
    timer; the Worker shares the same D1 database.
- **Admin sign-in:** Cloudflare Access on `/studio` and `/api/studio` (already set up: the
  "Moments Studio" app). No custom auth.
- **Client sign-in:** magic links for the client portal, at **`/portal`** (outside `/studio`,
  since clients can't use the studio sign-in). Each link opens only that client's own job.
- **Email to clients:** Gmail API through Tony's Google Workspace account.
  - Sends from his real address; replies thread in his normal inbox; sent mail shows in Gmail.
  - The Google Cloud app is set to **Internal** (Workspace only), which avoids Google's app
    verification. Its OAuth refresh token is stored as a Cloudflare secret.
  - Log the Gmail message ID and thread ID against each client/job in D1, and use thread data
    to show the full email history on each job page.
- **Email to Tony (system alerts):** Resend (already set up for the stats and speed emails):
  "new enquiry", "contract signed", "deposit paid", "a workflow step failed", "Gmail
  connection needs renewing". So he still hears about problems if Gmail's sign-in lapses.
- **Bulk/marketing email:** out of scope. If ever needed, use a separate service on a subdomain
  (e.g. mail.momentsinlight.co.nz) to protect the main domain.
- **Payments:** Stripe Invoices / Payment Links for deposits and payment schedules. The site
  never handles card details; Stripe tells the site when something is paid (webhook).
- **Accounting:** Stripe handles the Xero side. No direct Xero integration.
- **Contracts:** click-to-sign. Record signer name, timestamp, IP, browser, and the exact contract
  version (a fingerprint of the text); store the signed PDF in R2. (Electronic signatures are
  valid in NZ under the Contract and Commercial Law Act 2017.)

## Client data rules

- **Never in git.** The studio's blog posts are saved to GitHub; CRM data must live only in D1
  and R2. Studio Ninja exports stay outside the website folder (see Migration).
- **Backups:** D1 Time Travel (restore to any point in the last 30 days), plus a weekly
  encrypted export kept separately, never in GitHub.
- **Privacy:** update the privacy policy to say what's kept, where (Cloudflare, Google, Stripe)
  and for how long (NZ Privacy Act 2020).

## Email setup

- [x] DKIM for Google Workspace (`google._domainkey`): in place.
- [x] SPF includes `_spf.google.com`: in place. Remove `include:spf.studioninja.co` once Studio
      Ninja is cancelled.
- [x] **DMARC** record: added 17 Oct 2026 in Cloudflare DNS: `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:tony@momentsinlight.co.nz`.
      Tighten to `p=quarantine` after a few weeks of clean reports.
- [x] Resend domain verified (sending subdomain `send`).
- [ ] Google Cloud project with the Gmail API enabled, OAuth consent screen set to Internal,
      OAuth credentials.

## Email templates

- Stored in D1, unlimited.
- Merge fields, e.g. `{{first_name}}`, `{{wedding_date}}`, `{{venue}}`.
- Editor with live preview in `/studio` (same editor style as the post editor).

## Workflows (automation)

Rebuild Studio Ninja-style workflows: scheduled actions relative to job dates.

- A workflow is an ordered list of steps stored in D1 (action, template, offset, anchor date).
  For example:
  - booking confirmation immediately;
  - questionnaire 8 weeks before the shoot;
  - final-details reminder 2 weeks before;
  - follow-up 6 weeks after.
- On booking, generate concrete scheduled actions for the job.
- The cron Worker runs due actions about every 15 minutes.
- **Improvements over Studio Ninja:**
  - Conditional steps (e.g. skip the engagement-shoot email if not booked; elopement variants).
  - Recalculate all scheduled steps if the wedding date changes.
  - Auto-pause a workflow when the client replies (Gmail thread check).
  - Optional "review before send" per step (saved as a draft for approval).
  - Event triggers: contract signed, deposit paid (Stripe webhook).
- **Must-haves:**
  - All scheduling in NZ time (Pacific/Auckland, daylight-saving aware).
  - Idempotent sends: never send the same action twice.
  - A log screen showing sent and queued actions.
  - An alert to Tony (via Resend) whenever a step fails.

## Testing and switchover (Tony, 17 Oct 2026)

- **The public website doesn't change until the switch.** The /contact page keeps the Studio
  Ninja form, and Studio Ninja stays in use, until the very end.
- New pieces are tested out of sight: the new enquiry form lives on a **temporary page,
  `/newcontact`** (hidden from Google and the sitemap, not linked from the menu). When Tony is
  happy and ready to leave Studio Ninja, its form moves onto /contact and `/newcontact` is
  removed (redirected to /contact).

## Client safety during development (Tony, 17 Oct 2026)

Tony can't risk the development system emailing real clients. So:

1. **No client data until the switch.** Studio Ninja's clients are imported only at the very end,
   as the last step before cancelling. Until then the CRM holds test enquiries only.
2. **One way in.** Only the hidden /newcontact form creates leads; the real /contact page keeps
   sending enquiries to Studio Ninja.
3. **Test-mode lock** (`functions-lib/crm.js`, `outgoing()`): every client email goes through one
   function. Unless the Cloudflare setting `CRM_SEND_MODE` is exactly `live`, any email for
   anyone other than tony@momentsinlight.co.nz or polychromenz@gmail.com is redirected to Tony,
   subject "[TEST → their address] …" and a note at the top saying who it would have gone to.
   Missing setting = test mode. **Only Tony sets it to live, on switch-over day.**
4. A **TEST MODE banner** shows across the studio's Clients pages while the lock is on.

## Build phases

1. **Enquiries:** own enquiry form, tested on `/newcontact` (Turnstile spam protection, as on the
   guide signup; replaces the Studio Ninja embed on /contact only at the switch), creates a lead, sends the auto-reply, alerts Tony;
   leads list and email template library in `/studio`.
2. **Quotes → contracts → click-to-sign.**
3. **Stripe invoicing + client portal** (`/portal`). Studio Ninja can be cancelled once this is
   solid.
4. **Workflows/automation** (can overlap with 2–3 once email works).
5. **Move across:** import current clients and jobs from the Studio Ninja exports, run both side
   by side, then cancel Studio Ninja and remove it from SPF.

## Migration from Studio Ninja

Exports contain client personal data, so **keep them outside the website folder**, e.g.
`F:\DotNet\momentsinlightwebsite\studio-ninja-export\` (next to the website folder, not inside
it), so they can never end up in git:

- Leads/Jobs ZIP (includes invoices, quotes, contracts, questionnaires)
- Clients CSV
- Payments CSV (all payments, all time, all columns)
- Screenshots: each workflow with its steps and timings, email templates, pipeline stages,
  contract, quote and questionnaire templates

## Next steps

1. ~~Add the DMARC record~~ (done 17 Oct 2026).
2. Download the exports and screenshots into the folder above.
3. Claude reviews them, maps Studio Ninja's data model and workflows, and designs the D1 schema.
4. Build phase 1.
