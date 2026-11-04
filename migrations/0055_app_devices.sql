-- The studio phone app (studio-app/): each linked phone has its own key (only its hash is kept).
-- Tony links a phone from /studio/app (signed in through Cloudflare Access) and can switch one off.
CREATE TABLE IF NOT EXISTS app_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,            -- who linked it; the app acts as them (Settings > People access)
  name TEXT NOT NULL,             -- e.g. "Tony's phone"
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

-- A link in progress: the phone shows a code, Tony approves it in the browser, and the phone
-- collects its key once (the row is then deleted; unclaimed ones expire after 15 minutes).
CREATE TABLE IF NOT EXISTS app_link_codes (
  code_hash TEXT PRIMARY KEY,
  device_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL
);
