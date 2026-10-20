-- A test client (Tony's own test leads): never sent to Xero (functions-lib/xero.js).
ALTER TABLE clients ADD COLUMN test INTEGER NOT NULL DEFAULT 0;
