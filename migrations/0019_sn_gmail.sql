-- Studio Ninja import (temporary): what was read from Studio Ninja's emails in Tony's Gmail
-- (functions-lib/sn-gmail.js): each enquiry ("New lead from …"), quote accepted and contract
-- signed. Used to fill in what SN's exports leave out; emptied after the import (or a dry run).
CREATE TABLE sn_gmail (
  message_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,          -- lead | quote_accepted | contract_signed
  received_at TEXT NOT NULL,
  subject TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX sn_gmail_kind ON sn_gmail (kind, received_at);
