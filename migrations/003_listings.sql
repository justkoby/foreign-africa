-- Tables for later modules. No application code writes these in Phase 1.

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL,
  body_html MEDIUMTEXT NOT NULL,
  starts_at DATETIME(3) NULL,
  ends_at DATETIME(3) NULL,
  venue VARCHAR(300) NOT NULL DEFAULT '',
  organiser VARCHAR(200) NOT NULL DEFAULT '',
  featured_media_id BIGINT UNSIGNED NULL,
  registration_mode ENUM('none', 'url', 'form') NOT NULL DEFAULT 'none',
  registration_url VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published', 'rejected', 'archived') NOT NULL DEFAULT 'draft',
  author_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY events_slug (slug),
  CONSTRAINT events_author FOREIGN KEY (author_id) REFERENCES users (id),
  CONSTRAINT events_media FOREIGN KEY (featured_media_id) REFERENCES media_assets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS opportunities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  organisation VARCHAR(200) NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  body_html MEDIUMTEXT NOT NULL,
  eligibility TEXT NOT NULL,
  requirements TEXT NOT NULL,
  deadline_at DATETIME(3) NULL,
  application_mode ENUM('form', 'url', 'email', 'none') NOT NULL DEFAULT 'none',
  application_target VARCHAR(500) NOT NULL DEFAULT '',
  featured_media_id BIGINT UNSIGNED NULL,
  status ENUM('draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published', 'rejected', 'archived') NOT NULL DEFAULT 'draft',
  author_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY opportunities_slug (slug),
  CONSTRAINT opportunities_author FOREIGN KEY (author_id) REFERENCES users (id),
  CONSTRAINT opportunities_media FOREIGN KEY (featured_media_id) REFERENCES media_assets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS team_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  position VARCHAR(200) NOT NULL DEFAULT '',
  team_group VARCHAR(40) NOT NULL DEFAULT '',
  biography MEDIUMTEXT NOT NULL,
  email VARCHAR(255) NOT NULL DEFAULT '',
  contact_url VARCHAR(500) NOT NULL DEFAULT '',
  portrait_media_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY team_slug (slug),
  CONSTRAINT team_portrait FOREIGN KEY (portrait_media_id) REFERENCES media_assets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS partners (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT '',
  website_url VARCHAR(500) NOT NULL DEFAULT '',
  logo_media_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY partners_slug (slug),
  CONSTRAINT partners_logo FOREIGN KEY (logo_media_id) REFERENCES media_assets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS publications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL,
  published_on DATE NULL,
  category VARCHAR(80) NOT NULL DEFAULT '',
  cover_media_id BIGINT UNSIGNED NULL,
  file_media_id BIGINT UNSIGNED NULL,
  status ENUM('draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published', 'rejected', 'archived') NOT NULL DEFAULT 'draft',
  author_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY publications_slug (slug),
  CONSTRAINT publications_author FOREIGN KEY (author_id) REFERENCES users (id),
  CONSTRAINT publications_cover FOREIGN KEY (cover_media_id) REFERENCES media_assets (id),
  CONSTRAINT publications_file FOREIGN KEY (file_media_id) REFERENCES media_assets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  form_key VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  success_message VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY forms_key (form_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS form_fields (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  form_id BIGINT UNSIGNED NOT NULL,
  field_key VARCHAR(80) NOT NULL,
  label VARCHAR(200) NOT NULL,
  field_type ENUM('text', 'email', 'phone', 'textarea', 'select', 'radio', 'checkbox', 'date', 'file') NOT NULL,
  required TINYINT(1) NOT NULL DEFAULT 0,
  help_text VARCHAR(300) NOT NULL DEFAULT '',
  options_json JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY form_field_key (form_id, field_key),
  CONSTRAINT form_fields_form FOREIGN KEY (form_id) REFERENCES forms (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  form_id BIGINT UNSIGNED NOT NULL,
  payload JSON NOT NULL,
  client_key CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY submissions_client_key (client_key),
  KEY submissions_form (form_id, created_at),
  CONSTRAINT submissions_form FOREIGN KEY (form_id) REFERENCES forms (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS submission_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT UNSIGNED NOT NULL,
  media_id BIGINT UNSIGNED NOT NULL,
  CONSTRAINT submission_files_submission FOREIGN KEY (submission_id) REFERENCES submissions (id),
  CONSTRAINT submission_files_media FOREIGN KEY (media_id) REFERENCES media_assets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS navigation_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  menu_key ENUM('header', 'footer') NOT NULL,
  label VARCHAR(160) NOT NULL,
  url VARCHAR(500) NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  KEY navigation_menu (menu_key, sort_order),
  CONSTRAINT navigation_parent FOREIGN KEY (parent_id) REFERENCES navigation_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS homepage_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slot_key VARCHAR(80) NOT NULL,
  content_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  payload JSON NULL,
  KEY homepage_slot (slot_key, sort_order),
  CONSTRAINT homepage_content FOREIGN KEY (content_id) REFERENCES content_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS redirects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_path VARCHAR(500) NOT NULL,
  target_path VARCHAR(500) NOT NULL,
  status_code SMALLINT UNSIGNED NOT NULL DEFAULT 301,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY redirects_source (source_path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
