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

## Still needed

- **Workflow timings:** when each email is sent (e.g. "02: 5 days after 01 if no reply"), for the
  Wedding Workflow and the Portrait Workflow.
- **Email signature** text.
- **Payment schedule 10/40/50:** when each part is due (e.g. 10% on booking, 40% at…, 50% before
  the wedding?).
- **Portrait/family templates**, if the Portrait Workflow uses different emails.
- **Products & Packages** list (if anything beyond the two wedding packages is used).
- Which contract goes to which couples (standard vs "no ads" vs NZIPP).

## Things noticed (to confirm with Tony)

- **Prices differ:** the quote template has Classic **$3,495** and Deluxe **$4,995**; the website
  and enquiry email 01 say **$2,995** and **$3,995**. **Confirmed by Tony (17 Oct 2026): $2,995
  and $3,995 are right.** Use these in the new quotes.
- **Contract clause 2** refers to "Section 11" for force majeure, which is clause **10** in both
  wedding contracts.
- The contract email cites NZIPP standard terms sections 14 and 15, but the standard wedding
  contract is Tony's own 20 clauses (the NZIPP terms are a separate contract).
- Email 08 and 10 have no `%client_name%` greeting (08 starts "Wow, what a wedding!!", 10 "Hi
  again,"); email 09 has a manual `<<pic-time link here>>` placeholder.
- Studio Ninja links in templates (`app.studioninja.co/...`) become the new portal's links.
