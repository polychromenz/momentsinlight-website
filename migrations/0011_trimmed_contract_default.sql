-- Couples sign Tony's trimmed contract (the NZIPP standard terms without the event and commercial
-- parts), now named "Moments in Light contract" and the default for weddings (17 Oct 2026).
-- Contracts get a note shown under their title (e.g. "Based on the NZIPP …").
ALTER TABLE contract_templates ADD COLUMN note TEXT NOT NULL DEFAULT '';
UPDATE contract_templates SET name = 'Moments in Light contract', note = 'Based on the NZIPP Standard Photographic Terms & Conditions of Engagement' WHERE key = 'nzipp';
UPDATE lists SET contract_key = 'nzipp' WHERE kind = 'job_type' AND value = 'Wedding';

-- The contract email refers to "the contract" (its clause numbers follow NZIPP's: 14 cancellation,
-- 15 postponement), unless Tony has already edited the email.
UPDATE templates SET body = replace(replace(replace(body,
    'We use the New Zealand Institute of Professional Photographers (NZIPP) standard Terms for this Agreement.',
    'The contract is based on the New Zealand Institute of Professional Photographers (NZIPP) standard terms.'),
    'See section 14 of NZIPP Standard Terms (v2019) for details of cancellation costs.',
    'See clause 14 of the contract for details of cancellation costs.'),
    'See section 15 of NZIPP Standard Terms (v2019) for costs.',
    'See clause 15 of the contract for costs.')
  WHERE key = 'contract-ready' AND updated_at = '2026-10-17T00:00:00.000Z';

-- The wedding quote's notes mention the contract (unless Tony has edited the quote template).
UPDATE quote_templates SET notes = notes || ' When you accept, I''ll send the contract to sign (based on the NZIPP standard terms).'
  WHERE key = 'wedding' AND updated_at = '2026-10-17T00:00:00.000Z';
