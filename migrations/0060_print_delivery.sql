-- Prints delivery by lab and country (2026-11-19): where the order goes and how its freight was
-- worked out. JSON: { dest: { country, postcode, speed }, parts: [{ lab, label, amount }], notes: [for Tony] }
ALTER TABLE print_orders ADD COLUMN delivery TEXT;
