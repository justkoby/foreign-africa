-- Editorial fields and media details used by the studio.
-- Recorded once. A failed run is not recorded; repair the table, then run npm run migrate again.

ALTER TABLE media_assets
  ADD COLUMN original_name VARCHAR(255) NOT NULL DEFAULT '' AFTER mime_type,
  ADD COLUMN width INT UNSIGNED NULL AFTER byte_size,
  ADD COLUMN height INT UNSIGNED NULL AFTER width,
  ADD COLUMN thumb_path VARCHAR(500) NULL AFTER height;

ALTER TABLE content_items
  ADD COLUMN author_name VARCHAR(300) NOT NULL DEFAULT '' AFTER author_id,
  ADD COLUMN location VARCHAR(160) NOT NULL DEFAULT '' AFTER author_name,
  ADD COLUMN image_fit VARCHAR(16) NOT NULL DEFAULT 'cover' AFTER featured,
  ADD COLUMN external_url VARCHAR(500) NOT NULL DEFAULT '' AFTER image_fit,
  ADD COLUMN source_url VARCHAR(500) NOT NULL DEFAULT '' AFTER external_url,
  ADD COLUMN legacy_id VARCHAR(40) NOT NULL DEFAULT '' AFTER source_url;
