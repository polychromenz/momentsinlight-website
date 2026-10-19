-- Xero link (functions-lib/xero.js, Studio > Payments > Xero): the studio copies invoices, payments,
-- Stripe fees and Stripe payouts into Xero. Until Tony switches a kind to "send without asking",
-- each one waits in xero_queue for his approval.
ALTER TABLE invoices ADD COLUMN xero_invoice_id TEXT;
ALTER TABLE invoices ADD COLUMN xero_payment_id TEXT;   -- 'xero' when it was paid in Xero itself
ALTER TABLE invoices ADD COLUMN stripe_live INTEGER;    -- the card payment was real (not a Stripe test)
ALTER TABLE invoices ADD COLUMN stripe_fee INTEGER;     -- cents Stripe kept
ALTER TABLE invoices ADD COLUMN stripe_payout TEXT;     -- the Stripe payout it was paid out in

CREATE TABLE IF NOT EXISTS stripe_payouts (
  id TEXT PRIMARY KEY,                 -- Stripe's po_…
  amount INTEGER NOT NULL,             -- cents paid into the bank
  arrival_date TEXT NOT NULL,          -- NZ date
  gross INTEGER NOT NULL DEFAULT 0,    -- card payments in it
  fees INTEGER NOT NULL DEFAULT 0,
  other INTEGER NOT NULL DEFAULT 0,    -- refunds, disputes and anything else
  payments INTEGER NOT NULL DEFAULT 0, -- how many card payments
  unmatched INTEGER NOT NULL DEFAULT 0,-- card payments not linked to a studio invoice
  xero_transfer_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS xero_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                  -- invoice | payment | fee | payout | paid_in_xero
  ref TEXT NOT NULL,                   -- invoice id, or payout id
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | done | failed | skipped
  xero_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  done_at TEXT,
  UNIQUE (kind, ref)
);
CREATE INDEX IF NOT EXISTS xero_queue_status ON xero_queue (status);
