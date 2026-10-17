-- The studio calendar: wedding/shoot dates come from jobs.event_date; appointments are the other
-- things in a job (practice shoot, planning meeting…), with an optional time and place.
-- Google Calendar: each job date and appointment is copied into a "Moments in Light" calendar the
-- studio made in Tony's Google account (functions-lib/calendar.js); the event ids are kept here.
CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs (id),
  title TEXT NOT NULL,
  date TEXT NOT NULL,          -- NZ date, YYYY-MM-DD
  start_time TEXT,             -- 'HH:MM' NZ time; NULL = all day
  end_time TEXT,
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  gcal_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX appointments_date ON appointments (date);
CREATE INDEX appointments_job ON appointments (job_id);
ALTER TABLE jobs ADD COLUMN gcal_event_id TEXT;
ALTER TABLE jobs ADD COLUMN gcal_synced_at TEXT;
