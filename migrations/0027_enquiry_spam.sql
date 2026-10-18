-- Enquiries the form's spam check caught (sales pitches, bots). Kept here, not in jobs, so they
-- never count as leads, trigger emails or alerts. "Not spam" in the studio turns one into a lead.
CREATE TABLE enquiry_spam (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,            -- the form as sent (JSON)
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  released_at TEXT,              -- when Tony said "Not spam"
  job_id INTEGER                 -- the lead it became
);
CREATE INDEX enquiry_spam_created ON enquiry_spam (created_at);
