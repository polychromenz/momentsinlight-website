// The wedding workflow as Tony agreed it (docs/studio-crm-wedding-workflow.md), for the read-only
// Settings > Workflows screen. status: 'live' (working now), 'next' (being built), 'later'.
// Keep this in step with functions-lib/crm.js (WORKFLOWS) and the booking/contract code.
export type Step = { title: string; kind: 'auto' | 'review' | 'you' | 'todo'; when: string; stops?: string; status: 'live' | 'next' | 'later'; note?: string };
export type Stage = { name: string; steps: Step[] };

export const WEDDING: Stage[] = [
  { name: 'Enquiry', steps: [
    { title: 'Enquiry arrives (website form)', kind: 'auto', when: 'Straight away', status: 'live', note: 'Saved as a lead; you get an alert email.' },
    { title: '01 Enquiry response', kind: 'auto', when: '1 hour after the enquiry', status: 'live', note: 'Attaches the wedding guide.' },
    { title: '02 Follow-up', kind: 'review', when: '4 days after the enquiry', stops: 'they reply or book', status: 'live' },
    { title: '03 Final follow-up', kind: 'review', when: '10 days after the enquiry', stops: 'they reply or book', status: 'live' },
    { title: 'Discovery call', kind: 'you', when: 'When they book a time', status: 'live', note: 'Through your Google calendar link.' },
    { title: 'Send the quote', kind: 'you', when: 'After the call', status: 'live', note: 'From their page: + New quote, then Send to client.' },
  ] },
  { name: 'Booking', steps: [
    { title: 'Quote accepted', kind: 'auto', when: 'When they accept online', status: 'live', note: 'They’re booked, follow-ups stop, their address is saved, you get an alert.' },
    { title: 'Contract sent to sign, with the quote PDF', kind: 'auto', when: 'Straight after accepting', status: 'live', note: 'Your Moments in Light contract, or the one chosen on the quote.' },
    { title: 'Contract signed', kind: 'auto', when: 'When they sign online', status: 'live', note: 'Signed PDF emailed to them and to you.' },
    { title: '10% deposit invoice', kind: 'auto', when: 'Straight after signing', status: 'next', note: 'Needs Stripe; until then a “Send the deposit invoice” to-do.' },
    { title: '04 Thanks for booking', kind: 'auto', when: 'Once the deposit is paid', status: 'next' },
  ] },
  { name: 'Planning', steps: [
    { title: '05 Let’s plan your day + questionnaire', kind: 'auto', when: '6 weeks before the wedding', status: 'later', note: 'Arranges the planning meeting and practice shoot; links the photo guide.' },
    { title: 'Practice photos ready (06)', kind: 'review', when: 'When you click the button and paste the Pic-Time link', status: 'later' },
    { title: '07 RunOrder offer', kind: 'auto', when: '4 weeks before the wedding', status: 'later' },
    { title: '40% invoice', kind: 'auto', when: 'Sent 2 weeks before it’s due (2 months before the wedding)', status: 'later', note: 'Reminders on the due date and 3 days late.' },
    { title: '50% invoice', kind: 'auto', when: 'Sent 2 weeks before it’s due (1 month before the wedding)', status: 'later' },
    { title: '07.1 One week to go', kind: 'auto', when: '7 days before the wedding', status: 'later' },
  ] },
  { name: 'The wedding and after', steps: [
    { title: 'Upload a sneak peek to Facebook', kind: 'todo', when: '1 day after the wedding', status: 'later' },
    { title: '08 Sneak peek', kind: 'review', when: 'When you’re ready', status: 'later' },
    { title: 'Finish post-production and upload the gallery', kind: 'todo', when: '21 days after the wedding', status: 'later' },
    { title: 'Wedding photos ready (09)', kind: 'review', when: 'When you click the button and paste the Pic-Time link', status: 'later' },
    { title: '10 Review request', kind: 'auto', when: '3 days after email 09', status: 'later' },
  ] },
];

export const KIND: Record<Step['kind'], string> = { auto: 'Automatic', review: 'Email for you to review', you: 'You', todo: 'To-do' };
export const STATUS: Record<Step['status'], string> = { live: 'Live now', next: 'Coming next', later: 'Later' };
