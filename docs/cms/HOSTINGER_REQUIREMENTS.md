# Hostinger Business: requirements and verification checklist

Status: **nothing here has been verified on Hostinger.** "Code requires" is read from this repository and exercised against a disposable MySQL 8.0.46. "Verify" items must be confirmed in hPanel by you before any deploy. No hosting settings were changed.

## 1. Scheduled publishing (no background worker assumed)

**Design (implemented, tested on MySQL):** correctness never depends on a worker.

| Layer | What it does | Needs |
|---|---|---|
| Query-time visibility | A `scheduled` item whose `published_at` has passed is returned by every public query and the sitemap, exactly as if published. Implemented in `content-store.js` (`publicCondition`) | Nothing |
| Opportunistic promotion | Public reads, the staff dashboard and staff lists call `promoteDue()`, at most one `UPDATE` per minute per process, which flips due items to `published` so staff screens show the truth. Failures are swallowed and never break a request | Nothing |
| Cron (enhancement) | Tidies status even when nobody visits. Either `node server/promote-scheduled.js` or an authenticated `POST /api/staff/schedule/run` | Verify below |

**Limits to know:** the Node process may sleep when idle on Hostinger. A scheduled item is still public the instant its time passes, because visibility is decided per request. Only the stored status label lags until the next request or cron run. Caches (CDN, browser) can delay visibility by their TTL; public JSON responses are not marked immutable.

**Verify:**
- hPanel → Advanced → **Cron Jobs** is available on your plan, and what the minimum interval is.
- Whether a cron job can run `node` with Node 22 (a cron shell may default to a different Node). If not, use `curl` against a dedicated token endpoint. (Not built: the current endpoint needs a staff session. Say if you want a secret-token variant for external schedulers.)
- Cron environment has the same `DB_*` variables as the app, or cron reads them from a file. `promote-scheduled.js` reads `.env.local` if present.

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
| `GEMINI_API_KEY` `GEMINI_MODEL` | Public Discovery (and later the editor assistant) | Optional |
| `PORT` | Set by Hostinger | |
| `CMS_PASSWORD` | **Local development only.** Ignored by the Express server | Remove from hPanel |
| `PASSWORD_COST` `COOKIE_SECURE` | Optional tuning | |

Verify: Hostinger's Node.js app UI accepts all of these, supports Node 22, and starts `npm start` (entry `server/index.js`).

## 4. Database connectivity

**Code requires:** MySQL reachable at `DB_HOST:DB_PORT` from the Node app; utf8mb4; JSON columns; InnoDB foreign keys. The DB user needs `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES` (migrations create and alter tables). The app never drops databases (the migrator refuses `DROP DATABASE`).

**Verify:**
- Host to use (`127.0.0.1` vs `localhost` vs a named host) and port, from hPanel → Databases.
- **Engine and version.** All tests ran on **MySQL 8.0.46**, not 8.4 and not MariaDB. If hPanel provisions MariaDB, treat compatibility as untested (JSON columns, `JSON_EXTRACT`, `CAST(JSON AS CHAR)`).
- Max connections (the pool opens several).
- A **new** empty database and a user limited to it; never the WordPress database.

## 5. Media upload permissions

Upload limits and validation are in `server/media.js` (magic-byte sniffing, size limits, `sharp` resize and thumbnail, random file names). Requires §2's writable directory, `content.create` permission on the server, and a matching `Origin`. Verify any reverse-proxy body-size limit in front of Node is at least the app's image/PDF limit, otherwise uploads fail before reaching Express.

## 6. Backup and recovery

| Asset | Backup | Status |
|---|---|---|
| MySQL | hPanel backup/export, or `mysqldump` | Verify retention, restore path and who can restore |
| `MEDIA_ROOT` | Copy with the DB dump; **verify whether hPanel backups include it** | Unknown |
| App-level JSON dump (`server/backup.js`) | Now includes `forms`, `submissions`, `submission_notes`. **Before this change a restore would have dropped all submissions.** Also tolerates timestamps from a dump written to a file | Tested on MySQL 8.0.46 |
| Code | Redeploy a Git commit | |

**Confidentiality:** a dump now contains applicant names, emails and message text, and staff password hashes. Store it encrypted or access-restricted, outside `public_html`, and never attach it to tickets or chat.

**Restore drill (not yet run on Hostinger):** restore into a *new* database, point a staging copy at it, sign in, open a submission, and open a media file. Record time taken.

## What is still unverified on Hostinger
Node 22 availability and process behaviour; cron availability and its Node version; `MEDIA_ROOT` persistence and write permission; database engine/version; hPanel backup scope; proxy upload limits; everything in the browser checklist of `STAGING_READINESS_REPORT.md`.
