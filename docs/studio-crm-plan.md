# Studio CRM: Studio Ninja replacement plan

**Status:** planning only, nothing built yet (17 Oct 2026).
**Owner:** Tony (Moments in Light, momentsinlight.co.nz)
**Lives in:** the `/studio` section of the website (Cloudflare), next to Posts, Reviews and Stats.

## Goal

Replace Studio Ninja (expensive, quirky, very limited email templates) with a custom CRM built
into the website. Run Studio Ninja in parallel until each phase is proven, then cancel.

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
- [ ] **DMARC** record: missing. Add `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:tony@momentsinlight.co.nz`,
      tighten to `p=quarantine` after a few weeks of clean reports.
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

## Build phases

1. **Enquiries:** own enquiry form on /contact replaces the Studio Ninja embed (Turnstile spam
   protection, as on the guide signup), creates a lead, sends the auto-reply, alerts Tony;
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

1. Add the DMARC record.
2. Download the exports and screenshots into the folder above.
3. Claude reviews them, maps Studio Ninja's data model and workflows, and designs the D1 schema.
4. Build phase 1.
