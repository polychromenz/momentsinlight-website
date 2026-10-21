-- Bank reconciliation runs (Studio > Payments > Reconcile; functions-lib/recon.js): Tony's bank and
-- Stripe exports for a period, the plan the studio builds from them and Xero, what he approved and
-- what was created in Xero (so it can be found and undone).
CREATE TABLE IF NOT EXISTS recon_runs (
  id INTEGER PRIMARY KEY,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'plan',      -- plan | sent
  bank_csv TEXT,
  stripe_csv TEXT,
  plan TEXT,                                 -- JSON: { lines: [...], summary }
  result TEXT,                               -- JSON: created Xero ids by line
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
