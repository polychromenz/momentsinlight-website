-- Couples sign Tony's 20-clause wedding contract (called "Wedding Contract" in Studio Ninja), now
-- named "Moments in Light contract" and the default for weddings (confirmed 17 Oct 2026). The
-- "no ads" version is for a couple who asks to keep their children out of the portfolio.
-- Contracts can have a note shown under their title (none for now).
ALTER TABLE contract_templates ADD COLUMN note TEXT NOT NULL DEFAULT '';
UPDATE contract_templates SET name = 'Moments in Light contract' WHERE key = 'wedding';
UPDATE contract_templates SET name = 'Moments in Light contract (no ads)' WHERE key = 'wedding-no-ads';
UPDATE lists SET contract_key = 'wedding' WHERE kind = 'job_type' AND value = 'Wedding';

-- The contract email: no NZIPP mention; its references point to the contract's own clauses
-- (6 Cancellation, 5 Event Changes). Only if Tony hasn't already edited the email.
UPDATE templates SET body = replace(replace(replace(body,
    ' We use the New Zealand Institute of Professional Photographers (NZIPP) standard Terms for this Agreement.', ''),
    'See section 14 of NZIPP Standard Terms (v2019) for details of cancellation costs.',
    'See clause 6 of the contract (Cancellation) for details.'),
    'See section 15 of NZIPP Standard Terms (v2019) for costs.',
    'See clause 5 of the contract (Event Changes) for details.')
  WHERE key = 'contract-ready' AND updated_at = '2026-10-17T00:00:00.000Z';
