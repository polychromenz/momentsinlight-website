-- Free wedding photo guide signups (see functions/api/guide-signup.js).
CREATE TABLE IF NOT EXISTS guide_signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
