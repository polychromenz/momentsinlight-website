-- One invoice with several payments (the Studio Ninja way, for invoices brought across from it; Tony,
-- 22 Oct 2026). The invoice is a row with status 'group' (its number and total); each payment is an
-- ordinary invoice row pointing to it with parent_id, so reminders, card payments, receipts and Xero
-- work on the payments as before, and everything that adds up money leaves the 'group' rows out.
ALTER TABLE invoices ADD COLUMN parent_id INTEGER;
CREATE INDEX IF NOT EXISTS invoices_parent ON invoices (parent_id);
