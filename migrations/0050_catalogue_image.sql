-- A picture for a package or product (Settings > Packages & products), shown beside it on the
-- quote and in the quote PDF. A Cloudflare Images address; quotes copy it with the rest.
ALTER TABLE catalogue ADD COLUMN image TEXT NOT NULL DEFAULT '';
