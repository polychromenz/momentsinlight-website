# Clients with more than one job: plan (2026-11-20, built and live the same day)

Why: Cerise Brown (client 10009) accepted a family shoot quote that had been made on her 2025
wedding job. It was moved by hand to a new Family job (10149). Tony's rule: **a client's portal
shows all their jobs and galleries, and paying to keep galleries online is per client, not per
gallery.** Existing workflows (steps, automatic emails) must not change.

Today 7 clients have more than one job; 1 client has galleries on two different jobs.

## How it works now

- **Portal is per job.** Each job has its own `jobs.portal_token`; `/portal?t=…` shows only that
  job's quotes, contracts, questionnaires, invoices, galleries, documents and uploads
  (`functions-lib/portal.js` `portalData`, `functions/api/portal.js`). Emails put the job's link in
  `{{portal_link}}` (`crm-send.js` `jobLinks`), and the booking page uses the same token (`?c=`).
- **Keeping galleries online is per job.** `gallery-keep.js` groups galleries by `job_id`: one
  expiry, one payment and one reminder per job. A client with a wedding job and a family job would
  get two reminders and pay twice.
- **A new job for an existing client** only happens through **+ Add client** with the same email.
  The job page lists "Also: <other jobs>" but has no "new job for this client" button, and there's
  no way to move a quote to another job.

## Plan

### 1. Client portal shows every job
- Keep every existing portal link working: any of the client's job links opens the **client's**
  portal, with that job shown first and their other jobs below (newest first), each with its own
  quotes, contracts, questionnaires, invoices, galleries and documents.
- All galleries (from every job) and the client's documents/uploads are shown once each.
- Emails, `{{portal_link}}` and the booking link carry on using the job's token, so no template or
  workflow changes. Uploads go on the job whose link they opened.
- Lost jobs are left out. Built as tabs at the top of the portal (`?job=…`); a job id from another
  client is refused.

### 2. Keeping galleries online per client
- `coupleGalleries` groups by `client_id` instead of `job_id`: one expiry date, one payment, one
  reminder (30 and 7 days) for all the client's online galleries.
- The keep invoice stays on the job of the gallery they paid from (it's already a studio invoice,
  so receipt, Xero and the payment alert stay the same).
- Lining up happens when a gallery goes online, is linked to a client, or Tony changes a gallery's
  "Online until" date (that date then goes on all the client's online galleries). A save that
  doesn't change the date changes nothing (`lineUpExpiry` in `functions-lib/galleries.js`).
- `{{gallery_expiry}}` in emails reads the client's shared date.
- A new gallery lines everything up to the latest expiry, so older galleries stay up free until
  the newest expires (Tony, 2026-11-20).

Decided 2026-11-20: portal via any existing job link; all galleries line up to the latest date;
+ New job button and Move to a new job on quotes; build, test and deploy without asking again.

### 3. "Add a job" for an existing client
Already true (checked in the code): a website enquiry (`functions-lib/enquiry.js`) and an online
booking (`functions-lib/booking.js`) each create a client **and** a job, and start the job type's
workflow. The same email joins the existing client, so a returning client gets a new job.

What's missing is doing it from the studio (Cerise's family job 10149 was made by hand, with no
workflow):
- **Clients › + Add a job** (beside + Add client): search for an existing client, pick the job
  type, date, venue, lead or booked, and the job type's workflow starts for the new job (ticked
  by default, can be unticked). Same server code as Add client, so steps plan the same way.
- The same action as **+ New job** on the job page next to "Also: …", with the client already chosen.
- On a draft or sent quote (not accepted): **Move to a new job…** opens Add a job for the same
  client; the quote and its unsigned contract move onto the job it makes. The workflow box starts
  unticked there, since the quote has already gone.
- Job 10149 itself: start the Family booked workflow, skipping steps already done (quote,
  contract), and show Tony the planned emails before any go (decided 2026-11-20).
- Add a job: workflow box ticked by default (decided 2026-11-20).

### 4. Not disturbing existing workflows
- Steps, timers and automatic emails stay per job and keep working as they do now. Nothing is
  re-sent, and no steps are added to existing jobs.
- No changes to existing data apart from lining up gallery expiry dates (question 2), which will
  be shown to Tony as a list before it runs.
- Database change: none needed for 1 and 3 (both use `jobs.client_id`); 2 uses
  `photo_galleries.client_id`, which is already filled in for every linked gallery.

## Checks before going live
- [ ] Old portal links from sent emails still open (one from each of the 7 multi-job clients)
- [ ] Cerise's portal shows the wedding and the family job
- [ ] A test client with two jobs: one keep reminder, one payment extends both galleries
- [ ] Booking link with `?c=` still fills in their details
- [ ] A scheduled workflow email still sends with the right `{{portal_link}}`
