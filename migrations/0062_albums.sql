-- Album designer (docs/album-designer-plan.md, phase 1, 2026-11-19): Seldex Boutique Book albums Tony
-- designs in the studio from a client gallery. Studio only; nothing here is shown to clients yet.
-- design: JSON { spreads: [{ layout: 'span' | [left, right], slots: [image id | null], crops: [{ cx, cy, z }] }] }
--   (src/studio/album-layouts.ts). Sizes are Seldex's, in inches: page w × h; each spread file is 2w × h.
CREATE TABLE albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Album',
  product TEXT NOT NULL DEFAULT 'boutique',  -- Seldex Boutique Book (other album types later)
  size TEXT NOT NULL DEFAULT '10x10',        -- page width x height in inches, as Seldex names it (11x14 = portrait)
  orientation TEXT NOT NULL DEFAULT 'square', -- square | portrait | landscape (landscape turns the size: 14x11)
  spreads INTEGER NOT NULL DEFAULT 10,       -- 10 to 45
  bg TEXT NOT NULL DEFAULT '#ffffff',
  design TEXT NOT NULL DEFAULT '{"spreads":[]}',
  status TEXT NOT NULL DEFAULT 'draft',      -- draft (proofing, approved, ordered come later)
  version INTEGER NOT NULL DEFAULT 1,        -- goes up on every save
  exported_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX albums_gallery ON albums (gallery_id);
