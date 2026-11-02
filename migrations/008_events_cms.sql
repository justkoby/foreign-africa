-- Complete Events Management Module & Database-Backed Forms
-- Extends events and forms tables from 003_listings.sql with full structured
-- event metadata, revision history, taxonomy joins, and form field definitions.

ALTER TABLE events
  ADD COLUMN body_json JSON NULL AFTER body_html,
  ADD COLUMN event_date VARCHAR(20) NOT NULL DEFAULT '' AFTER starts_at,
  ADD COLUMN timezone VARCHAR(80) NOT NULL DEFAULT 'Africa/Accra' AFTER ends_at,
  ADD COLUMN time_label VARCHAR(160) NOT NULL DEFAULT '' AFTER timezone,
  ADD COLUMN format ENUM('physical', 'virtual', 'hybrid') NOT NULL DEFAULT 'physical' AFTER time_label,
  ADD COLUMN location_address VARCHAR(360) NOT NULL DEFAULT '' AFTER venue,
  ADD COLUMN online_platform VARCHAR(120) NOT NULL DEFAULT '' AFTER location_address,
  ADD COLUMN meeting_url VARCHAR(500) NOT NULL DEFAULT '' AFTER online_platform,
  ADD COLUMN meeting_access ENUM('public', 'registered_only', 'private') NOT NULL DEFAULT 'private' AFTER meeting_url,
  ADD COLUMN image_fit VARCHAR(20) NOT NULL DEFAULT 'cover' AFTER featured_media_id,
  ADD COLUMN social_image_id BIGINT UNSIGNED NULL AFTER image_fit,
  ADD COLUMN gallery_json JSON NULL AFTER social_image_id,
  ADD COLUMN speakers_json JSON NULL AFTER gallery_json,
  ADD COLUMN agenda_json JSON NULL AFTER speakers_json,
  ADD COLUMN documents_json JSON NULL AFTER agenda_json,
  ADD COLUMN programme_id VARCHAR(120) NOT NULL DEFAULT '' AFTER documents_json,
  ADD COLUMN programme_label VARCHAR(180) NOT NULL DEFAULT '' AFTER programme_id,
  ADD COLUMN story_url VARCHAR(500) NOT NULL DEFAULT '' AFTER programme_label,
  ADD COLUMN source_label VARCHAR(180) NOT NULL DEFAULT '' AFTER story_url,
  ADD COLUMN source_url VARCHAR(500) NOT NULL DEFAULT '' AFTER source_label,
  ADD COLUMN recording_url VARCHAR(500) NOT NULL DEFAULT '' AFTER source_url,
  ADD COLUMN registration_form_key VARCHAR(80) NOT NULL DEFAULT '' AFTER registration_url,
  ADD COLUMN registration_open_at DATETIME(3) NULL AFTER registration_form_key,
  ADD COLUMN registration_close_at DATETIME(3) NULL AFTER registration_open_at,
  ADD COLUMN registration_closed TINYINT(1) NOT NULL DEFAULT 0 AFTER registration_close_at,
  ADD COLUMN registration_label VARCHAR(120) NOT NULL DEFAULT '' AFTER registration_closed,
  ADD COLUMN cancelled TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN cancellation_note VARCHAR(400) NOT NULL DEFAULT '' AFTER cancelled,
  ADD COLUMN published_at DATETIME(3) NULL AFTER cancellation_note,
  ADD COLUMN featured TINYINT(1) NOT NULL DEFAULT 0 AFTER published_at,
  ADD COLUMN seo_title VARCHAR(260) NOT NULL DEFAULT '' AFTER featured,
  ADD COLUMN seo_description VARCHAR(500) NOT NULL DEFAULT '' AFTER seo_title,
  ADD COLUMN author_name VARCHAR(180) NOT NULL DEFAULT '' AFTER author_id;

CREATE TABLE IF NOT EXISTS event_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  title VARCHAR(260) NOT NULL,
  summary VARCHAR(500) NOT NULL DEFAULT '',
  body_json JSON NULL,
  body_html MEDIUMTEXT NOT NULL,
  snapshot_json JSON NULL,
  editor_id BIGINT UNSIGNED NULL,
  note VARCHAR(240) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_revision (event_id, revision_number),
  CONSTRAINT fk_event_revisions_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_terms (
  event_id BIGINT UNSIGNED NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (event_id, term_id),
  CONSTRAINT fk_event_terms_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  CONSTRAINT fk_event_terms_term FOREIGN KEY (term_id) REFERENCES terms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE forms
  ADD COLUMN purpose VARCHAR(80) NOT NULL DEFAULT 'general_enquiry' AFTER form_key,
  ADD COLUMN consent_label VARCHAR(360) NOT NULL DEFAULT '' AFTER success_message,
  ADD COLUMN fields_json JSON NULL AFTER consent_label;
