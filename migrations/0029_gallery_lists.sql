-- MIL Galleries 1d: favourites and lists, client hiding, downloads.
-- Photos the couple hides: moved to the end for them, never shown to anyone they share with.
ALTER TABLE gallery_images ADD COLUMN client_hidden INTEGER NOT NULL DEFAULT 0;
-- Size and CRC-32 of the 2048px copy too, so a web-size ZIP can be streamed without reading files twice.
ALTER TABLE gallery_images ADD COLUMN web_bytes INTEGER;
ALTER TABLE gallery_images ADD COLUMN web_crc INTEGER;
-- Lists belong to a link for the couple and invited people (the same lists on every device they
-- use), and to the visitor for guests (each guest gives their email, so theirs follow them).
ALTER TABLE gallery_lists ADD COLUMN owner_link_id INTEGER;
CREATE INDEX gallery_lists_link ON gallery_lists (owner_link_id);
