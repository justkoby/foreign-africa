# Hostinger Business: requirements and verification checklist

> **Temporary-domain staging:** the exact step-by-step setup, readiness audit and blockers are in `HOSTINGER_STAGING_SETUP.md`; moving to `foreignafrica.org` is in `CUTOVER_TO_PRODUCTION.md`. Those supersede any `preview.foreignafrica.org` references in older documents.

Status: **nothing here has been verified on Hostinger.** "Code requires" is read from this repository and exercised against disposable MariaDB 11.8.9 (the Hostinger engine) and MySQL 8.0.46. "Verify" items must be confirmed in hPanel by you before any deploy. No hosting settings were changed.

## 1. Scheduled publishing (no background worker assumed)

Implemented as a hybrid: due items go live at query time, are tidied opportunistically by visitors and staff, and an optional **token-protected cron endpoint** (`POST /api/cron/publish`) keeps status timely when traffic is low. Promotion is atomic and idempotent. Full design, security properties, setup commands for Hostinger cron or an external scheduler, and the checklist of things to verify are in `docs/cms/CRON_SCHEDULING.md`. **No scheduler is configured or activated.**

**Verify:** Cron Jobs availability and minimum interval on your plan; which `curl`/`node` the cron shell sees; that the reverse proxy forwards `X-Forwarded-Proto` and `X-Forwarded-For`.

## 2. Persistent media storage outside deployment directories

**Code requires:** `MEDIA_ROOT` set to an absolute path that is **not** inside `hbuilds`, `public_html` or `dist` (`mediaRootProblem` rejects those; uploads then return 503). The directory must exist and be writable by the Node process user. Files are served only through `/media/:id` (never as static files). Allowed types: JPEG, PNG, WebP, GIF, PDF by magic bytes. `sharp` needs the Linux binary, which npm installs on Hostinger.

**Verify (the storage test already in `docs/STAGING_READINESS_REPORT.md`):** create `~/foreign-africa-media` beside `domains/`; put a marker file; redeploy; confirm it survives; only then set `MEDIA_ROOT` and redeploy; upload one image; redeploy; confirm it still loads. Also confirm: the account's disk quota, and whether the Node app user can write there (Node apps may run as a different user than File Manager).

**Public vs private:** today every `media_assets` file is served publicly by id. **Applicant documents must not use this store.** Applicant file uploads are not implemented; when they are (Step 7), they will use a separate non-public directory and an authenticated download route.

## 3. Environment variables (names only; set in hPanel, never commit values)

| Variable | Purpose | Notes |
|---|---|---|
| `APP_ENV` | `staging` or `production` | Staging forces the Basic-Auth lock, `noindex`, Secure cookies, and **disables legacy file writes** |
| `PUBLIC_SITE_URL` | Exact public origin | Used for same-origin checks on every write. Wrong value = all staff writes rejected |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | MySQL | See §4 |
| `SESSION_SECRET` | Long random string | Required for staff sign-in and IP hashing |
| `PREPARE_DATABASE=1` | Migrate, bootstrap, seed and import legacy submissions on start | Idempotent. Now applies `001`–`005` |
| `BOOTSTRAP_ADMIN_EMAIL` `BOOTSTRAP_ADMIN_PASSWORD` `BOOTSTRAP_ADMIN_NAME` | First super administrator | Remove the password after first start |
| `STAGING_USER` `STAGING_PASSWORD` | Staging gate | Required when `APP_ENV=staging` |
| `MEDIA_ROOT` | §2 | Leave empty until verified |
| `LEGACY_FILE_EDITING` | `1` allows writing the file collections | Default: on in development, **off in staging and production**. Leave unset on Hostinger |
| `CRON_SECRET` | Bearer token for `POST /api/cron/publish` (at least 32 characters, or the endpoint is disabled) | Optional. See `CRON_SCHEDULING.md`. Never commit it |
| `DB_CONNECTION_LIMIT` | Pool size, 1–25, default 5 | Keep at or below the per-user connection cap |
| `DB_MIGRATE_USER` `DB_MIGRATE_PASSWORD` | Optional second account with `CREATE, ALTER, REFERENCES` used only for startup preparation | Lets `DB_USER` have data-only privileges. See `DATABASE_COMPATIBILITY.md` |
| `GEMINI_API_KEY` `GEMINI_MODEL` | Public Discovery (and later the editor assistant) | Optional |
| `PORT` | Set by Hostinger | |
| `CMS_PASSWORD` | **Local development only.** Ignored by the Express server | Remove from hPanel |
| `PASSWORD_COST` `COOKIE_SECURE` | Optional tuning | |

Verify: Hostinger's Node.js app UI accepts all of these, supports Node 22, and starts `npm start` (entry `server/index.js`).

## 4. Database connectivity

**Code requires:** MySQL reachable at `DB_HOST:DB_PORT` from the Node app; utf8mb4; JSON columns; InnoDB foreign keys. The DB user needs `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES` (migrations create and alter tables). The app never drops databases (the migrator refuses `DROP DATABASE`).

**Confirmed by you:** MariaDB Server 11.8.9, `127.0.0.1:3306`, InnoDB. Full review and test matrix: `docs/cms/DATABASE_COMPATIBILITY.md`. The suite passes on the identical engine version (168 of 168) and on MySQL 8.0.

**Verify:**
- The CMS database user can `CREATE`, `ALTER`, add foreign keys and has a `max_user_connections` of at least 5 (lower `connectionLimit` in `server/db.js` otherwise).
- A **new, empty** database exists for the CMS. The code refuses to migrate into a database that has WordPress tables or any tables without our ledger.

## 5. Media upload permissions

Upload limits and validation are in `server/media.js` (magic-byte sniffing, size limits, `sharp` resize and thumbnail, random file names). Requires §2's writable directory, `content.create` permission on the server, and a matching `Origin`. Verify any reverse-proxy body-size limit in front of Node is at least the app's image/PDF limit, otherwise uploads fail before reaching Express.

## 6. Backup and recovery

| Asset | Backup | Status |
|---|---|---|
| MySQL | hPanel backup/export, or `mysqldump` | Verify retention, restore path and who can restore |
| `MEDIA_ROOT` | Copy with the DB dump; **verify whether hPanel backups include it** | Unknown |
| App-level JSON dump (`server/backup.js`) | Now includes `forms`, `submissions`, `submission_notes`. **Before this change a restore would have dropped all submissions.** Also tolerates timestamps from a dump written to a file | Tested on MariaDB 11.8.9 and MySQL 8.0.46 |
| Code | Redeploy a Git commit | |

**Confidentiality:** a dump now contains applicant names, emails and message text, and staff password hashes. Store it encrypted or access-restricted, outside `public_html`, and never attach it to tickets or chat.

**Restore drill (not yet run on Hostinger):** restore into a *new* database, point a staging copy at it, sign in, open a submission, and open a media file. Record time taken.

## What is still unverified on Hostinger
Node 22 availability and process behaviour; cron availability and its Node version; `MEDIA_ROOT` persistence and write permission; the database user's privileges and connection cap; hPanel backup scope; proxy upload limits; everything in the browser checklist of `STAGING_READINESS_REPORT.md`.
