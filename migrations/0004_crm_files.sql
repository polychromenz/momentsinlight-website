-- Private files for the studio CRM (e.g. the wedding guide PDF attached to email 01), stored in
-- pieces because D1 limits the size of a single value. Not public: only the server reads them.
CREATE TABLE files (
  name TEXT NOT NULL,          -- e.g. 'wedding guide 2026.pdf' (as in a template's attachment)
  part INTEGER NOT NULL,       -- 0, 1, 2… in order
  type TEXT NOT NULL,          -- e.g. 'application/pdf'
  data TEXT NOT NULL,          -- base64
  updated_at TEXT NOT NULL,
  PRIMARY KEY (name, part)
);
