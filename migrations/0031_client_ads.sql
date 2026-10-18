-- Whether a client's photos can be used in ads and marketing (some contracts say no).
ALTER TABLE clients ADD COLUMN ads_ok INTEGER NOT NULL DEFAULT 1;
