# Studio CRM: the new wedding workflow

Drafted 17 Oct 2026 with Tony: Studio Ninja's Wedding Workflow (see
[studio-crm-findings.md](studio-crm-findings.md)) reworked to how Tony works now. Open questions
are at the end.

## How steps work

- **Automatic email:** sent by the system at the set time.
- **Ready-to-send email:** written from the template with the couple's details filled in, then
  waits on Tony's "Today" list; he reviews, personalises and sends it.
- **Action button:** e.g. "Practice photos are ready": Tony pastes the Pic-Time link, the email
  opens pre-filled with the link for him to review and personalise, and sending it ticks the
  task off.
- **To-do:** a task for Tony with a due date, on the "Today" list.
- **Stops:** enquiry follow-ups stop as soon as the couple **replies or books** (quote accepted,
  contract signed or deposit paid). Some couples book very quickly.

## The workflow

### Enquiry

1. Enquiry arrives from the website form → lead created, Tony alerted.
2. **01 Enquiry response** (automatic, 1 hour after; attaches the wedding guide PDF).
3. **02 Follow-up** (stops if they reply or book). *[timing and kind: open question 1]*
4. **03 Final follow-up** (stops if they reply or book). *[open question 1]*
5. Discovery call, booked through Tony's Google calendar link.
6. **Send quote** (one click from the template: Classic $2,995, Deluxe $3,995; valid 30 days).

### Booking

7. Couple accepts the quote and signs the contract online.
8. **Contract signed → 10% deposit invoice sent automatically** (Stripe payment link plus bank
   transfer details). *(Studio Ninja needed this sent by hand.)*
9. **04 Thanks for booking.** *[when: open question 3]*

### Planning

10. **About 6 weeks before:** **05 "Let's plan your day"** (automatic) and the wedding
    questionnaire; planning meeting and practice shoot. *[open question 4]*
11. **Practice photos ready** (action button: paste the Pic-Time link → review and personalise
    **06** → send → task done).
12. **07 RunOrder offer.** *[when: open question 5]*
13. **1 week before:** **07.1 "1 week to go"** (automatic) and a chat about the plan for the day.
14. **40% invoice** (due 2 months before) and **50% invoice** (due 1 month before), sent
    automatically. *[how far ahead, reminders: open question 2]*

### The wedding and after

15. Wedding day (main shoot).
16. To-do: upload a sneak peek to Facebook (1 day after).
17. **08 Sneak peek** (ready-to-send email: review, personalise, send).
18. To-do: finish post-production and upload the gallery (21 days after).
19. **Wedding photos ready** (action button: paste the Pic-Time link → review and personalise
    **09** → send → task done).
20. **10 Review request** (automatic, 3 days after 09).
21. Job complete.

## Open questions (suggested answers in brackets)

1. **Follow-ups 02 and 03:** how long after 01, and automatic or ready-to-send? *(02 after 4
   days, 03 after 10 days; ready-to-send)*
2. **40% and 50% invoices:** sent how long before each due date, and reminders? *(Sent 2 weeks
   before; a gentle reminder on the due date and another if 3 days late. Studio Ninja's
   reminders are all off.)*
3. **04 Thanks for booking:** straight after the contract is signed, or once the deposit is
   paid? *(Once the deposit is paid, so it confirms the booking is locked in.)*
4. **Practice shoot:** always about 6 weeks before now? The package description says "done near
   to booking". *(Usually 6 weeks before, with the option to schedule it earlier per couple.)*
5. **07 RunOrder:** when? *(4 weeks before, automatic.)*
6. **Bank transfer** as an option on invoices alongside card? *(Yes.)*

## Later

- **Replace Pic-Time** with galleries hosted on the site (photos already live on Cloudflare
  Images; full-resolution downloads would need R2 storage). Pic-Time also runs the print store
  and lab orders, so that part needs a plan before switching. Separate project, after the CRM.
