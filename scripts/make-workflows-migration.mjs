// Writes migrations/0017_crm_workflows.sql: workflows become data (Settings > Workflows) instead
// of code. Seeds the Wedding workflow as agreed with Tony (docs/studio-crm-wedding-workflow.md,
// including the planning steps), and Portrait and Headshot workflows using the drafts in
// docs/studio-crm-email-drafts.md as email templates (their [check: …] gaps are for Tony; emails
// with a gap can't be sent, so those steps start as review-first).
// Run once: node scripts/make-workflows-migration.mjs
import fs from 'fs';

const s = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const NOW = '2026-10-17T00:00:00.000Z';

// Step: { id, title, kind: auto_email|ready_email|todo, template?, when, days?, hours?, after_step?,
//         stop_on?: 'reply,booked', questionnaire?: key, gallery?: true }
// when: enquiry | booked | deposit | before | after | step | manual
const wedding = [
  { id: '01-enquiry-response', title: '01 Enquiry response', kind: 'auto_email', template: 'wedding-01-enquiry-response', when: 'enquiry', hours: 1 },
  { id: '02-follow-up', title: '02 Follow-up', kind: 'ready_email', template: 'wedding-02-follow-up', when: 'enquiry', days: 4, stop_on: 'reply,booked' },
  { id: '03-final-follow-up', title: '03 Final follow-up', kind: 'ready_email', template: 'wedding-03-final-follow-up', when: 'enquiry', days: 10, stop_on: 'reply,booked' },
  { id: '04-thanks-for-booking', title: '04 Thanks for booking', kind: 'auto_email', template: 'wedding-04-thanks-for-booking', when: 'deposit', days: 0 },
  { id: '05-plan-your-day', title: '05 Plan your day', kind: 'auto_email', template: 'wedding-05-plan-your-day', when: 'before', days: 42 },
  { id: 'questionnaire', title: 'Wedding Day Questionnaire', kind: 'auto_email', template: 'wedding-questionnaire', when: 'before', days: 41, questionnaire: 'wedding-day' },
  { id: 'book-practice-shoot', title: 'Book the practice shoot (if it isn’t booked yet)', kind: 'todo', when: 'step', after_step: '05-plan-your-day', days: 14 },
  { id: '06-practice-photos-ready', title: '06 Practice photos ready', kind: 'ready_email', template: 'wedding-06-practice-photos-ready', when: 'manual', gallery: true },
  { id: '07-runorder', title: '07 RunOrder offer', kind: 'auto_email', template: 'wedding-07-runorder', when: 'before', days: 28 },
  { id: '07-1-week-to-go', title: '07.1 One week to go', kind: 'auto_email', template: 'wedding-07-1-week-to-go', when: 'before', days: 7 },
  { id: 'upload-sneak-peek', title: 'Upload a sneak peek to Facebook', kind: 'todo', when: 'after', days: 1 },
  { id: '08-sneak-peek', title: '08 Sneak peek', kind: 'ready_email', template: 'wedding-08-sneak-peek', when: 'after', days: 1 },
  { id: 'finish-gallery', title: 'Finish post-production and upload the gallery', kind: 'todo', when: 'after', days: 21 },
  { id: '09-photos-ready', title: '09 Wedding photos ready', kind: 'ready_email', template: 'wedding-09-photos-ready', when: 'manual', gallery: true },
  { id: '10-review', title: '10 Review request', kind: 'auto_email', template: 'wedding-10-review', when: 'step', after_step: '09-photos-ready', days: 3 },
];

// Portrait and headshot templates from the drafts.
const drafts = fs.readFileSync('docs/studio-crm-email-drafts.md', 'utf8');
const templates = [];
const section = (prefix) => [...drafts.matchAll(new RegExp(`### (${prefix}\\d) ([^\\n]+)\\n\\n\\*\\*Subject:\\*\\* ([^\\n]+)\\n\\n([\\s\\S]*?)(?=\\n### |\\n---|$)`, 'g'))];
const kinds = ['01-enquiry-response', '02-follow-up', '03-final-follow-up', '04-thanks-for-booking', '05-pre-shoot', '06-after-shoot'];
const steps = (wf, prefix) => section(prefix).map((m, i) => {
  const key = `${wf}-${kinds[i]}`;
  const name = `${m[1]} ${m[2].replace(/ \(automatic[^)]*\)/, '').replace('Initial enquiry', 'Enquiry')}`;
  templates.push({ key, name, subject: m[3].trim(), body: m[4].trim() });
  const when = [{ when: 'enquiry', hours: 1 }, { when: 'enquiry', days: 4, stop_on: 'reply,booked' }, { when: 'enquiry', days: 10, stop_on: 'reply,booked' }, { when: 'booked', days: 1 }, { when: 'before', days: 2 }, { when: 'after', days: 1 }][i];
  return { id: kinds[i], title: name, kind: 'ready_email', template: key, ...when };
});
const portrait = steps('portrait', 'P');
const headshot = steps('headshot', 'H');
if (portrait.length !== 6 || headshot.length !== 6) throw new Error(`drafts not found: ${portrait.length} ${headshot.length}`);

// The questionnaire email (new; Tony's 05 says "The system will send you a questionnaire soon").
templates.push({ key: 'wedding-questionnaire', name: 'Wedding Day Questionnaire', subject: 'Your wedding day questionnaire', body: 'Hey {{first_name}},\n\nAs promised, here is your wedding day questionnaire. It only takes a few minutes, and your answers help me plan everything for your day.\n\n[Fill in your questionnaire]({{questionnaire_link}})\n\nYour answers save as you go, so you can come back to it any time before we meet.\n\nCheers,' });

const sql = `-- Workflows become data: Settings > Workflows edits them, and each job type chooses one
-- (lists.workflow = workflows.key). Steps are JSON; see functions-lib/workflows.js. Planned steps
-- keep a copy of their rule (steps.config) so a changed wedding date can move them.
-- Seeds: Wedding (as agreed, with the planning steps), Portrait and Headshot (from the drafts).
CREATE TABLE workflows (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
INSERT INTO workflows (key, name, steps, updated_at) VALUES ('wedding', 'Wedding', ${s(JSON.stringify(wedding))}, '${NOW}');
INSERT INTO workflows (key, name, steps, updated_at) VALUES ('portrait', 'Portrait', ${s(JSON.stringify(portrait))}, '${NOW}');
INSERT INTO workflows (key, name, steps, updated_at) VALUES ('headshot', 'Headshot', ${s(JSON.stringify(headshot))}, '${NOW}');
${templates.map((t) => `INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES (${s(t.key)}, ${s(t.name)}, ${s(t.subject)}, ${s(t.body)}, '[]', '${NOW}');`).join('\n')}
UPDATE lists SET workflow = 'portrait' WHERE kind = 'job_type' AND value IN ('Portraits', 'Lifestyle') AND workflow IS NULL;
UPDATE lists SET workflow = 'headshot' WHERE kind = 'job_type' AND value = 'Headshots' AND workflow IS NULL;
ALTER TABLE steps ADD COLUMN config TEXT;
ALTER TABLE jobs ADD COLUMN event_time TEXT;
`;
fs.writeFileSync('migrations/0017_crm_workflows.sql', sql);
console.log('wrote migrations/0017_crm_workflows.sql', templates.map((t) => t.key).join(', '));
