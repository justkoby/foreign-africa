# Database schema

MySQL 8, InnoDB, `utf8mb4`. Applied by `npm run migrate`. The runner records filenames in `schema_migrations` and skips ones already applied.

MySQL commits each `CREATE TABLE` immediately. If a file fails, earlier statements in that file may already exist and the file is not recorded. Fix the database, then run the command again. Applied files are skipped. The runner refuses `DROP DATABASE`.

## 001_identity.sql

| Table | Purpose |
| --- | --- |
| `roles` | `super_admin`, `admin`, `editor`, `contributor` |
| `users` | Email, name, password hash, `active` or `disabled`, soft delete |
| `user_roles` | One role is assigned by the studio. The table allows more than one later |
| `sessions` | SHA-256 of the cookie token, expiry, revocation |
| `login_attempts` | Failed and successful sign-in attempts |

## 002_content.sql

| Table | Purpose |
| --- | --- |
| `media_assets` | Uploaded files and registered `public/images/` paths |
| `content_items` | News, commentary, page, and programme articles |
| `content_revisions` | JSON snapshot on each save, including a restore |
| `terms`, `content_terms` | One category and any number of tags per article |
| `activity_logs` | Editorial and account actions |

`content_items.status` allows `draft`, `in_review`, `changes_requested`, `approved`, `scheduled`, `published`, `rejected`, and `archived`. The studio uses draft, scheduled, published, and archived.

A slug is unique per content type, not across types.

## 003_listings.sql

Tables only: `events`, `opportunities`, `team_members`, `partners`, `publications`, `forms`, `form_fields`, `submissions`, `submission_files`, `navigation_items`, `homepage_slots`, `settings`, `redirects`.

Phase 2 does not write these tables. They are ready for later modules and are not decorative API responses.

## 004_editorial.sql

Adds columns. The runner applies the file once. It is not safe to run the `ALTER` statements a second time by hand.

| Table | Columns |
| --- | --- |
| `media_assets` | `original_name`, `width`, `height`, `thumb_path` |
| `content_items` | `author_name`, `location`, `image_fit`, `external_url`, `source_url`, `legacy_id` |

`body_json` holds the TipTap document. `body_html` holds the HTML the server generated from that document. A row with `external_url` and an empty document is an incomplete news card: the public site links to that WordPress URL and does not present an article body.

`image_fit` is `cover` or `contain`. A featured image can be a `site:/images/...` record, which serves the existing file in `public/images/` without copying it.
