-- Files Tony adds on the client page go into the same pool as the couple's portal uploads; the
-- couple sees them ("From Tony") but can't remove them.
ALTER TABLE uploads ADD COLUMN from_studio INTEGER NOT NULL DEFAULT 0;
