# Clients and jobs as separate pages: plan (2026-11-20, built and live the same day)

Decided with Tony: Jobs tab opens first; a job in the Jobs list opens the job (the client name at
the top goes to their page); the job page is one page of cards with a section menu, like the portal.

Why: Tony (2026-11-20), after the client portal went per client: the studio should show **clients
and jobs as separate tabs**; opening a client shows their jobs; opening a job shows its workflow
and the other job cards, like the client portal does now.

## How it is now

- **Clients** (`/studio/crm`): Today, Coming up, then "Leads and jobs" with filters Leads, Booked,
  Past, Not going ahead, Everyone. Every filter but Everyone lists jobs; Everyone lists people.
- **Job page** (`/studio/crm/job?id=…`): one page mixing the client and the job. Its Details card has
  the client's name, email, phone, address, ads OK, keep, test, and the job's type, date, venue,
  partner and notes. Its tabs are Overview, Steps, Emails, Quotes & money, Portal and Activity.
- There's no page for a client on their own. Their other jobs show as "Also: …".

## Plan

### 1. Clients page: two tabs, Jobs and Clients
- **Jobs**: what's there now (Leads, Booked, Past, Not going ahead), one row per job. The client's
  name links to their client page and the job type links to the job.
- **Clients**: one row per person (replaces "Everyone"), with their jobs, the next date and what
  they've paid. Search works the same.
- Today and Coming up stay above both tabs, unchanged.

### 2. A new client page (`/studio/crm/client?id=…`)
- **Their details**: name, email, phone, address, ads OK, keep, test, and notes about them (moved
  off the job page).
- **Their jobs**: a card for each (type, date, venue, stage, quote/contract/payment status, next
  step), newest first, with **+ New job**.
- **Portal**: their one portal link (it shows every job), their galleries from every job, and the
  shared "online until" date with what keeping them online costs.
- **Emails**: everything sent to or from them, across all their jobs.

### 3. The job page keeps its address and becomes job-only
- Same URL (`/studio/crm/job?id=…`), so every link in alerts, emails, the calendar, Payments and the
  phone app keeps working.
- Header: "Cerise Brown › Family photoshoot", the client's name linking to the client page.
- Cards: **Workflow** (the steps), Quotes, Contracts, Invoices, Questionnaire, Appointments, Files,
  Emails for this job, Activity. Laid out like the client portal: an overview of what's done and
  what's next, then the sections.
- **Job details**: type, date, time, venue, partner (name, email, phone), status, notes. The partner
  stays per job (a family shoot isn't the same couple as the wedding).
- The client's own details show as a short read-only card ("Edit on their page").

### 4. Nothing else changes
- Workflows, steps, automatic emails, quotes, contracts, invoices and the client portal work as they
  do now. No database changes: clients and jobs are already separate tables.
- The phone app is checked afterwards (it opens jobs by the same id).

## Checks before going live
- [ ] Every old job link still opens the job
- [ ] Client with one job, client with several (Cerise), lead with no client details yet
- [ ] Editing client details on the client page shows on all their jobs
- [ ] Saving job details doesn't touch the client's details, and the other way round
- [ ] Phone app still opens jobs
