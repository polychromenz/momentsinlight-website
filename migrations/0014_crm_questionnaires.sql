-- Questionnaires (Settings > Questionnaires). A template is a title, intro text and a list of
-- questions (JSON; see functions-lib/questionnaires.js for the question types). Each job type can
-- have a default (lists.questionnaire_key). A couple's questionnaire keeps its own copy of the
-- questions, so editing the template never changes what they were asked; answers are JSON keyed by
-- question id. Files they upload are in `uploads` (data in `files` as 'upload-<id>').
CREATE TABLE questionnaire_templates (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  intro TEXT NOT NULL DEFAULT '',
  questions TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
INSERT INTO questionnaire_templates (key, name, intro, questions, updated_at) VALUES ('wedding-day', 'Wedding Day Questionnaire', '<p>Thank you for taking the time to complete this questionnaire.<br>This is our standard survey so just ignore any sections that are not relevant to your wedding.</p><p>Your answers will help me to get a better understanding of your day and plan everything perfectly :-)</p>', '[{"id":"p1-name","type":"short","label":"Partner 1''s Name:","placeholder":"Enter Partner 1''s first name e.g. Jane","fill":"first_name"},{"id":"p1-phone","type":"short","label":"Partner 1''s Phone Number:","half":true,"fill":"phone"},{"id":"p1-email","type":"short","label":"Partner 1''s Email:","half":true,"fill":"email"},{"id":"p1-ready","type":"short","label":"What is the address of where the Partner 1 will be getting ready?"},{"id":"p2-name","type":"short","label":"Partner 2''s Name:","placeholder":"Enter Partner 2''s first name e.g. Mark","fill":"partner_name"},{"id":"p2-phone","type":"short","label":"Partner 2''s Phone Number:","half":true},{"id":"p2-email","type":"short","label":"Partner 2''s Email:","half":true},{"id":"p2-ready","type":"short","label":"What is the address of where the Partner 2 will be getting ready?"},{"id":"ceremony","type":"long","label":"Please confirm the exact details of your CEREMONY, e.g start/end time and address."},{"id":"reception","type":"long","label":"Please confirm the exact details of your RECEPTION, e.g start/end time and address."},{"id":"first-dance","type":"radio","label":"Will there be a first dance?","options":["Yes","No"],"half":true},{"id":"speeches","type":"radio","label":"Will there be formal speeches?","options":["Yes","No"],"half":true},{"id":"bridal-party","type":"short","label":"How many people will be in your bridal party?"},{"id":"guests","type":"short","label":"How many guests will you have approx.","placeholder":"Enter your single-line answer"},{"id":"dress-code","type":"radio","label":"Dress code","options":["Formal","Black Tie","Casual"]},{"id":"wranglers","type":"long","label":"Please add the name and best contact number of your person of honour and best person. They will be the goto person to wrangle people who you want group shots with. Please make sure they are aware ;)"},{"id":"unique","type":"long","label":"Are there any unique events happening at the wedding that I need to be made aware?"},{"id":"flash","type":"checks","label":"Please confirm that you are happy for me to use flash during","options":["Ceremony","Speeches","Reception"]},{"id":"additional","type":"long","label":"Is there any additional information you would like to include?"},{"id":"reference","type":"file","label":"Please upload any reference photos that you''d like to share with me."},{"id":"instagram","type":"short","label":"Please supply your Instagram name if you are happy to be tagged in images.","placeholder":"Enter your single-line answer"}]', '2026-10-17T00:00:00.000Z');
ALTER TABLE lists ADD COLUMN questionnaire_key TEXT;
UPDATE lists SET questionnaire_key = 'wedding-day' WHERE kind = 'job_type' AND value = 'Wedding';

-- status: open (they can fill it in) | submitted
CREATE TABLE questionnaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs (id),
  template_key TEXT,
  name TEXT NOT NULL,
  intro TEXT NOT NULL DEFAULT '',
  questions TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '{}',
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT
);
CREATE INDEX questionnaires_job ON questionnaires (job_id);

-- Files a couple uploads (questionnaire reference photos now; the portal's Files later).
CREATE TABLE uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs (id),
  questionnaire_id INTEGER,
  question_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX uploads_job ON uploads (job_id);
