-- Media library metadata. Additive only.
ALTER TABLE media_assets
  ADD COLUMN caption VARCHAR(500) NOT NULL DEFAULT '' AFTER alt_text,
  ADD COLUMN title VARCHAR(200) NOT NULL DEFAULT '' AFTER caption,
  ADD COLUMN updated_at DATETIME(3) NULL AFTER created_at;
