# Studio CRM: what's in Studio Ninja today

Reviewed 17 Oct 2026 from Tony's exports and screenshots (kept outside the website folder, in
`F:\DotNet\momentsinlightwebsite\studio-ninja-export\`). No client details are recorded here.
See [studio-crm-plan.md](studio-crm-plan.md) for the plan.

## Data to move across

| Export | What's in it | Size |
|---|---|---|
| Contacts CSV | Every client: date added, name, phone, email (address fields almost never used; consent columns empty; notes on a handful) | 137 contacts |
| Leads ZIP | **Open** leads only: a CSV (name, type, source, main shoot date, location, client, email, phone, note) plus each lead's quote and contract PDFs | 5 leads |
| Jobs ZIP | **Active** jobs only: a CSV (as above) plus each job's quote, contract and invoice PDFs | 4 jobs |
| Payments CSV | Every invoice, all time: status, invoice ID, issue/sent/due dates, client, job, job status, lead source, main shoot date, total, GST | 98 invoices |

Completed jobs and archived leads aren't in the ZIPs. Their invoices are in the payments CSV, and
the clients are in the contacts CSV, which is enough history for the new system. The PDFs for
active jobs and open leads are kept as attachments on those jobs.

## Settings

- **Currency and tax:** NZD; GST 15%, prices **include** GST.
- **Payment methods:** Stripe (card; buy-now-pay-later, surcharge and tipping all off) and bank
  transfer (BNZ account, shown on invoices). PayPal not used.
- **Job types** (colour, linked workflow): Commercial / Advertising, Event, Family, Headshots,
  Lifestyle (Portrait Workflow), Portraits (Portrait Workflow), **Wedding** (Wedding Workflow,
  the default).
- **Lead sources:** Blog post, Bride and Groom, Event, Facebook, Google, Instagram,
  MyWeddingGuide, Online directory, Reddit, Referral, Verve Magazine, Word of mouth.
- **Labels:** "Main Shoot", "Extra Shoot", "Shoots", "Business Number" (Studio Ninja defaults).
- **Client portal:** banner photo, colour #5a5e3b, welcome message: "Hello %client_name%! Welcome
  to your client portal. You should be able to find every[thing] related to your booking here
  but we like to keep things really friendly so, you can always just call and ask if you prefer."
  Shows quotes, contracts, questionnaires, invoices and gallery links; shared files for all
  clients.

## Website enquiry form ("Website Contact Form Wedding")

First name\*, last name\*, email\*, phone (optional), which services are you interested in?\*
(dropdown of job types), venue, event date\*, "Tell me a little about your wedding plans", "How
did you hear about us?" (dropdown of lead sources). \* = required.

## Quote: "Wedding Pick and Choose Template"

- Introduction: "Thank you so much for considering me. If you are ready to go ahead, just click
  the Accept button and then you'll get a contract to sign and a deposit invoice…"
- Packages (client picks one): Classic Wedding Package, Deluxe Wedding Package (marked
  Recommended), each with its description. No add-on products or discounts set up.
- Payment schedule: "Moments In Light Wedding payment schedule 10/40/50".
- Contract: Wedding Contract. Questionnaire: none. Note: "Please note that this quote is valid
  for 30 days."
- An invoice is generated automatically when the quote is accepted.

## Contracts

- **Wedding contract**: Tony's own 20 clauses (merge field `%business_name%`).
- **Wedding contract no ads**: the same, except clause 20 (Promotion) limits use to the wedding
  gallery web page, with no children shown.
- **NZIPP contract**: the NZIPP standard terms (about 3,800 words).

## Questionnaire: "Wedding Day Questionnaire"

Intro text; partner 1 and partner 2: name, phone, email, getting-ready address; ceremony details
(times and address); reception details; first dance? (yes/no); formal speeches? (yes/no); bridal
party size; approximate guest numbers; dress code (formal / black tie / casual); person of honour
and best person name and number (group-shot wranglers); unique events to know about; flash OK
during ceremony / speeches / reception (checkboxes); anything else; reference photo upload (10MB);
Instagram name for tagging.

## Email templates (wedding workflow order)

| # | Template | Subject |
|---|---|---|
| 01 | Initial enquiry response (attaches the 2026 wedding guide PDF) | Re: Wedding Photography Enquiry |
| 02 | Initial enquiry follow-up | Re: Wedding Photography Enquiry |
| 03 | Initial enquiry final follow-up | Following up :-) |
| 04 | Thanks for booking (links to the client portal) | Thank you so much for booking! |
| 05 | Organise wedding schedule (practice shoot, posing videos; questionnaire follows) | It's time to organise your pre wedding meeting |
| 06 | Practice photos are ready (gallery link) | YAY your practice photos are ready! |
| 07 | RunOrder offer | A free tool to help keep your wedding day running on time |
| 07.1 | Pre-wedding email | 1 Week to go! |
| 08 | Post-wedding sneak peek | Your wedding was amazing |
| 09 | Wedding photos are ready (Pic-Time link, printing pointers) | Your wedding photos are ready! |
| 10 | Ask for a review (Google review link) | One last time thank you so much |
| – | Contract ready to sign | Your online contract is ready |
| – | Invoice / payment due | Invoice |

Merge fields used: `%client_name%`, `%client_portal_link%`, `%galleries_link%`,
`%contract_link%`, `%payment_amount%`, `%payment_due_date%`, `%business_name%`. The email signature
is stored once, globally, in Studio Ninja.

## Workflows

Each workflow has three stages (Lead → Production → Post production). Steps are either **emails**
(sent automatically, or "Send email" = Tony sends it when ready), **tasks** (to-dos for Tony, some
with a due date), **appointments**, or **shoots**. "Job accepted" ticks itself when a quote is
accepted, a contract signed or an invoice paid, and turns the lead into a job.

### Wedding Workflow (job type Wedding)

| Stage | Step | Kind | When |
|---|---|---|---|
| Lead | Lead created | – | – |
| Lead | New lead response (email 01) | auto email | 1 hour after lead created |
| Lead | New lead follow-up (email 02) | email, sent by Tony | – |
| Lead | New lead FINAL follow-up (email 03) | email, sent by Tony | – |
| Lead | Meeting to book couple | task | – |
| Lead | Send quote | task | 1 hour after "Meeting to book couple" |
| Production | Job accepted | automatic | quote accepted / contract signed / invoice paid |
| Production | Thanks for booking (email 04) | auto email | 1 day after job accepted |
| Production | Couple shoot | extra shoot | – |
| Production | Organise wedding schedule (email 05) | auto email | 1 month before main shoot |
| Production | Wedding questionnaire | auto questionnaire | 1 month before main shoot |
| Production | Pre-wedding meeting | appointment | – |
| Production | Pre-wedding (email 07.1, "1 week to go") | auto email | 7 days before main shoot |
| Production | Main shoot | main shoot | the wedding |
| Post production | Upload sneak peek to Facebook | task | 1 day after main shoot |
| Post production | Post-wedding sneak peek (email 08) | email, sent by Tony | – |
| Post production | Finish post-production and upload gallery | task | 21 days after main shoot |
| Post production | Your wedding photos are ready (email 09) | email, sent by Tony | – |
| Post production | Thanks and ask for a review (email 10) | auto email | 3 days after email 09 |
| Post production | Job complete | – | – |

Not in the workflow (sent by hand when needed): 06 practice photos ready, 07 RunOrder offer,
contract email, invoice email.

### Portrait Workflow (Portraits, Lifestyle) and Headshots Workflow (identical)

| Stage | Step | Kind | When |
|---|---|---|---|
| Lead | Initial enquiry response / follow-up / FINAL follow-up | emails, sent by Tony | – |
| Lead | Send the booking fee invoice & contract | task | – |
| Production | Job accepted | automatic | as above |
| Production | Thanks for booking | auto email | 1 day after job accepted |
| Production | Pre-shoot reminder and details | auto email | 2 days before main shoot |
| Production | Pre-shoot confirmation call | task | 1 day before main shoot |
| Production | Main shoot | main shoot | – |
| Production | Book IPS meeting straight after the shoot | task | – |
| Post production | Post-shoot email | auto email | 1 day after main shoot |
| Post production | Upload shoot and cull photos | task | 1 day after main shoot |
| Post production | Prepare photos for IPS meeting | task | 7 days after main shoot |
| Post production | IPS meeting (in-person sales) | appointment | – |
| Post production | Invoice client for the sale | task | – |
| Post production | Retouch products & send to production | task | 3 days after invoicing |
| Post production | Receive products from supplier and check quality | task | 14 days after sending to production |
| Post production | Call client that products are ready | task | 1 day after receiving products |
| Post production | Job complete | – | – |

### Family Workflow

Same as the Portrait Workflow, without "Prepare photos for IPS meeting" and "IPS meeting".
(The Family job type isn't linked to it in Job Types, so it's only used when chosen by hand.)

Commercial / Advertising and Event have no workflow.

**What this means for the new system:** workflows need tasks (a to-do list for Tony with due
dates, shown on the studio dashboard) as well as emails; emails can be "send automatically" or
"remind me to send" (pre-filled, one click to send); steps can be timed from another step, not
just from the shoot date.

## Still needed

- **Portrait, family and headshot email templates** (initial enquiry response and follow-ups,
  thanks for booking, pre-shoot reminder, post-shoot email), if they differ from the wedding ones.
- **Products & Packages** list (if anything beyond the two wedding packages is used).
- Which contract goes to which couples (standard vs "no ads" vs NZIPP).

## Payment schedules

| Schedule | Payments |
|---|---|
| **Moments In Light Wedding payment schedule 10/40/50** (on the wedding quote) | 10% deposit when the quote is accepted; 40% 2 months before the wedding; 50% 1 month before |
| **50/50** | 50% 3 days before the shoot; 50% 3 days after |
| **Due in 7 Days** | 100% 7 days after the quote is accepted or the invoice is created |

On a $2,995 Classic wedding that's $299.50, $1,198 and $1,497.50; on a $3,995 Deluxe, $399.50,
$1,598 and $1,997.50.

- **Receipts:** sent automatically after card payments ("Thank you for your payment", receipt
  attached, link to the updated invoice).
- **Reminders:** all **off** (none before, on or after the due date). A template exists: "Invoice
  Reminder" with the amount and due date.

## Signature

Studio Ninja's signature: "Tony", phone number, and the ML Moments in Light logo (applied to every email). To be redesigned (see the plan's Principles).

## Things noticed (to confirm with Tony)

- **Prices differ:** the quote template has Classic **$3,495** and Deluxe **$4,995**; the website
  and enquiry email 01 say **$2,995** and **$3,995**. **Confirmed by Tony (17 Oct 2026): $2,995
  and $3,995 are right.** Use these in the new quotes.
- **Contract clause 2** refers to "Section 11" for force majeure, which is clause **10** in both
  wedding contracts.
- **Wedding timings have moved on from the templates:** Tony now plans the day and does the practice shoot about 6 weeks before, then chats again about the plan 1 week before. Email 04 says "about 6 weeks", the workflow sends 05 at 1 month. Re-plan from how Tony works now.
- The contract email cites NZIPP standard terms sections 14 and 15, but the standard wedding
  contract is Tony's own 20 clauses (the NZIPP terms are a separate contract).
- Email 08 and 10 have no `%client_name%` greeting (08 starts "Wow, what a wedding!!", 10 "Hi
  again,"); email 09 has a manual `<<pic-time link here>>` placeholder.
- Studio Ninja links in templates (`app.studioninja.co/...`) become the new portal's links.
