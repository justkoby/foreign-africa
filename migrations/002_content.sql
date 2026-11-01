-- Shared articles plus the media and audit tables the content API uses.

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  alt_text VARCHAR(300) NOT NULL DEFAULT '',
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  KEY media_created_by (created_by),
  CONSTRAINT media_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  content_type ENUM('news', 'commentary', 'page', 'programme') NOT NULL,
  title VARCHAR(300) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL,
  body_json JSON NULL,
  body_html MEDIUMTEXT NOT NULL,
  featured_media_id BIGINT UNSIGNED NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  status ENUM('draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published', 'rejected', 'archived') NOT NULL DEFAULT 'draft',
  published_at DATETIME(3) NULL,
  seo_title VARCHAR(300) NOT NULL DEFAULT '',
  seo_description VARCHAR(500) NOT NULL DEFAULT '',
  social_image_id BIGINT UNSIGNED NULL,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY content_type_slug (content_type, slug),
  KEY content_public (content_type, status, published_at),
  CONSTRAINT content_author FOREIGN KEY (author_id) REFERENCES users (id),
  CONSTRAINT content_featured_media FOREIGN KEY (featured_media_id) REFERENCES media_assets (id),
  CONSTRAINT content_social_image FOREIGN KEY (social_image_id) REFERENCES media_assets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  content_id BIGINT UNSIGNED NOT NULL,
  editor_id BIGINT UNSIGNED NOT NULL,
  snapshot JSON NOT NULL,
  created_at DATETIME(3) NOT NULL,
  KEY revisions_content (content_id, created_at),
  CONSTRAINT revisions_content FOREIGN KEY (content_id) REFERENCES content_items (id),
  CONSTRAINT revisions_editor FOREIGN KEY (editor_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS terms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vocabulary VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  UNIQUE KEY terms_vocabulary_slug (vocabulary, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_terms (
  content_id BIGINT UNSIGNED NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (content_id, term_id),
  CONSTRAINT content_terms_content FOREIGN KEY (content_id) REFERENCES content_items (id),
  CONSTRAINT content_terms_term FOREIGN KEY (term_id) REFERENCES terms (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  subject_type VARCHAR(40) NOT NULL,
  subject_id VARCHAR(64) NOT NULL DEFAULT '',
  metadata JSON NULL,
  created_at DATETIME(3) NOT NULL,
  KEY activity_time (created_at),
  KEY activity_subject (subject_type, subject_id),
  CONSTRAINT activity_actor FOREIGN KEY (actor_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
