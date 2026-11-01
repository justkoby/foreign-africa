-- Private submissions workflow. Additive only: no existing column or table is changed or dropped.
-- Form definitions stay developer-controlled (data/cms/forms.json, deployed with the code).
-- Submissions are stored here, never in the deploy tree and never served publicly.

ALTER TABLE submissions
  ADD COLUMN reference VARCHAR(40) NULL AFTER id,
  ADD COLUMN status ENUM('new', 'in_review', 'actioned', 'archived') NOT NULL DEFAULT 'new' AFTER payload,
  ADD COLUMN assigned_to BIGINT UNSIGNED NULL AFTER status,
  ADD COLUMN handled_at DATETIME(3) NULL AFTER assigned_to,
  ADD COLUMN ip_hash CHAR(64) NULL AFTER client_key,
  ADD UNIQUE KEY submissions_reference (reference),
  ADD KEY submissions_status (status, created_at),
  ADD CONSTRAINT submissions_assignee FOREIGN KEY (assigned_to) REFERENCES users (id);

CREATE TABLE IF NOT EXISTS submission_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  note TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  KEY submission_notes_submission (submission_id, created_at),
  CONSTRAINT submission_notes_submission FOREIGN KEY (submission_id) REFERENCES submissions (id),
  CONSTRAINT submission_notes_author FOREIGN KEY (author_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
