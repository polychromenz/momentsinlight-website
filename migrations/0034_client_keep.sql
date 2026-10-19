-- Clients Tony wants kept even though they never booked (the two-year clean-up of old enquiries,
-- functions-lib/cleanup.js, promised on /privacy, leaves them alone).
ALTER TABLE clients ADD COLUMN keep INTEGER NOT NULL DEFAULT 0;
