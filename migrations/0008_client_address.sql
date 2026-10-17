-- Clients' postal address, captured when they accept a quote (and editable on the client page).
ALTER TABLE clients ADD COLUMN address TEXT NOT NULL DEFAULT '';
