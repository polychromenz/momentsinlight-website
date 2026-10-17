-- Moments Studio CRM (the Studio Ninja replacement): phase 1, enquiries.
-- Lives in the site's existing D1 database (momentsinlight-signups, bound as DB) alongside the
-- guide signups, so the studio can link enquiries, signups and blog posts. Client data lives
-- only here, never in git.
-- See docs/studio-crm-plan.md and docs/studio-crm-wedding-workflow.md.
--
-- Dates are ISO 8601 text: date-times in UTC ("2026-10-17T03:15:00.000Z"), wedding and shoot
-- dates as plain NZ dates ("2027-03-14"). Money is whole cents (299500 = $2,995.00).

-- People: one row per person we deal with (a couple has one client row for the main contact,
-- and the partner's details on the job).
CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX clients_email ON clients (lower(email));

-- Leads and jobs are the same row: a lead becomes a job when it's booked.
-- stage: lead | booked | completed | lost
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients (id),
  title TEXT NOT NULL,                       -- e.g. "Emma & Liam"
  job_type TEXT NOT NULL DEFAULT 'Wedding',  -- Wedding, Portraits, Family, Headshots, ...
  stage TEXT NOT NULL DEFAULT 'lead',
  partner_name TEXT NOT NULL DEFAULT '',
  event_date TEXT,                           -- the wedding / main shoot date (NZ date)
  venue TEXT NOT NULL DEFAULT '',
  lead_source TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',          -- what they wrote on the enquiry form
  notes TEXT NOT NULL DEFAULT '',            -- Tony's own notes
  workflow TEXT,                             -- e.g. 'wedding'; NULL = none
  replied_at TEXT,                           -- last time the client replied (stops follow-ups)
  booked_at TEXT,
  lost_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX jobs_stage ON jobs (stage, created_at);
CREATE INDEX jobs_client ON jobs (client_id);

-- Email templates (unlimited; edited in the studio). Merge fields like {{first_name}}.
CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,                  -- e.g. 'wedding-01-enquiry-response'
  name TEXT NOT NULL,                        -- e.g. "01 Enquiry response"
  subject TEXT NOT NULL,
  body TEXT NOT NULL,                        -- Markdown
  attachment TEXT,                           -- e.g. the wedding guide PDF's address
  updated_at TEXT NOT NULL
);

-- Workflow steps planned for each job: emails (automatic or ready-to-send) and to-dos.
-- kind: auto_email | ready_email | todo
-- status: scheduled | due | done | skipped | failed
-- stop_on: comma list of events that cancel the step while it's not done ('reply,booked').
CREATE TABLE steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs (id),
  step_key TEXT NOT NULL,                    -- e.g. 'wedding-02-follow-up'; one per job
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  template_key TEXT,
  due_at TEXT NOT NULL,                      -- when it's sent (auto) or appears on Today
  status TEXT NOT NULL DEFAULT 'scheduled',
  stop_on TEXT NOT NULL DEFAULT '',
  done_at TEXT,
  note TEXT NOT NULL DEFAULT '',             -- e.g. why it failed or was skipped
  created_at TEXT NOT NULL,
  UNIQUE (job_id, step_key)                  -- never plan (or send) the same step twice
);
CREATE INDEX steps_due ON steps (status, due_at);

-- Every email sent or received for a job (the email history on each job page).
-- direction: out | in
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES jobs (id),
  client_id INTEGER REFERENCES clients (id),
  step_id INTEGER REFERENCES steps (id),
  direction TEXT NOT NULL DEFAULT 'out',
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  sent_at TEXT NOT NULL
);
CREATE INDEX messages_job ON messages (job_id, sent_at);
CREATE INDEX messages_thread ON messages (gmail_thread_id);

-- Small settings, e.g. the Gmail connection (its refresh token stored encrypted).
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
