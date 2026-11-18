-- What to order from the lab for a product (2026-11-19, Seldex sizes are in inches), e.g.
-- 'Seldex framed print 11x14" frame, 8x10" print with mat'. Shown on Tony's order view and lab sheet.
ALTER TABLE print_products ADD COLUMN lab_item TEXT;
