-- Mileage log for the IRD kilometre-rate claim, exported as a Xero manual journal (Studio > Mileage).
-- Trips come from jobs and appointments (a return trip from Tony's base) and can be added by hand.
-- Settings (base address, vehicle, account codes) are in settings 'mileage'.
ALTER TABLE jobs ADD COLUMN venue_address TEXT NOT NULL DEFAULT '';  -- the venue's address from the lookup

CREATE TABLE IF NOT EXISTS mileage_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE,                       -- 'job:12' or 'appt:5' for trips made from the studio; NULL if added by hand
  date TEXT NOT NULL,                    -- NZ date
  job_id INTEGER,
  purpose TEXT NOT NULL DEFAULT '',      -- e.g. 'Wedding: Cherry and Chi'
  destination TEXT NOT NULL DEFAULT '',
  km REAL,                               -- the whole trip (there and back); NULL until worked out
  km_edited INTEGER NOT NULL DEFAULT 0,  -- Tony changed the km, so it isn't recalculated
  skip INTEGER NOT NULL DEFAULT 0,       -- not a claim (e.g. no travel, or a trip combined with another)
  note TEXT NOT NULL DEFAULT '',
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mileage_trips_date ON mileage_trips (date);

-- Driving distances already looked up (one way), so each route is only asked of Google once.
CREATE TABLE IF NOT EXISTS mileage_places (
  route TEXT PRIMARY KEY,
  km REAL NOT NULL,
  created_at TEXT NOT NULL
);
