-- Structured, CMS-managed site content (homepage sections and hero slider). Additive only.
-- Each document has a DRAFT and a PUBLISHED copy. The public site only ever reads the published copy.
CREATE TABLE IF NOT EXISTS site_documents (
  doc_key VARCHAR(40) NOT NULL PRIMARY KEY,
  draft_json JSON NULL,
  published_json JSON NULL,
  draft_version INT UNSIGNED NOT NULL DEFAULT 0,
  draft_updated_at DATETIME(3) NULL,
  draft_updated_by BIGINT UNSIGNED NULL,
  published_at DATETIME(3) NULL,
  published_by BIGINT UNSIGNED NULL,
  CONSTRAINT site_documents_draft_by FOREIGN KEY (draft_updated_by) REFERENCES users (id),
  CONSTRAINT site_documents_published_by FOREIGN KEY (published_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_document_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc_key VARCHAR(40) NOT NULL,
  kind ENUM('draft', 'published') NOT NULL,
  snapshot JSON NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL,
  KEY site_revisions_doc (doc_key, id),
  CONSTRAINT site_revisions_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
