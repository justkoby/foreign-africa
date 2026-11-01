# Diagnosis: 503 on the Hostinger temporary domain

Site: `https://maroon-gazelle-601956.hostingersite.com/` · deployed commit `55d057af` on `staging` · Hostinger status "Completed", website answers **503**.

## Update: `staging` has moved (3019bc7)
After this diagnosis was written, `justkoby` pushed **`3019bc7` "Include compiled dist assets and safeguard startup against unconfigured database"** to `staging`. It (a) moves `vite` from devDependencies to dependencies, (b) un-ignores and commits the compiled `dist/` (38 MB), and (c) replaces the `process.exit(1)` calls in `index.js` and `prepare.js` with log warnings.

What that tells us: (a) and (b) are the classic response to a host that does not run, or cannot run, the build, which supports cause **5** below (the build step) as something that really happened. (c) addresses causes 1 and 2 by carrying on instead of exiting.

How it was integrated: `staging` was **not** overwritten. It was merged into the development branch (commit `f918033`), so it is an ancestor again and a clean fast-forward of `staging` is possible. Where both sides changed `index.js` and `prepare.js`, the fail-soft design here was kept, because carrying on after a failed or half-finished initialisation can serve a half-built database, and a log warning is invisible when the host shows only a 503; here the process stays up and answers with the named reason. Their `vite` and `dist/` changes were kept.

Trap closed: with `dist/` committed, an **old** committed build would be served silently if the host's build step does not run. Each build is now stamped with a fingerprint of its source (`dist/build-stamp.json`) and the server warns at start-up and in Settings when they differ.

## 1. What is confirmed and what is not

**Confirmed (reproduced locally on the exact deployed commit):**
- A completed Git deployment does not mean the app started. The deployed `server/index.js` has four paths that call `process.exit(1)` **before it ever listens**. A host reports any app that is not listening as a bare 503, and the log says almost nothing about why.
- **The deployed commit is the old `staging` head, not the reviewed work.** It lacks the start-up self-checks, the WordPress-database guard and the diagnostics described below. `staging` is an ancestor of `claude/fervent-heisenberg-b5k9dm`, so updating it is a clean fast-forward. I have **not** pushed to `staging` (that would trigger another deployment) or touched Hostinger.

**Not confirmed:** *which* of the causes below is yours. That needs the Hostinger runtime log (or the list of environment-variable **names** you set). I do not have it, so I am not claiming a single certain cause.

## 2. Audit of your ten points

| # | Question | Finding |
|---|---|---|
| 1 | Start-up process | `index.js` runs `prepareDatabase` (when `PREPARE_DATABASE=1`) **before** `listen()`. Any failure there, or a missing staging credential, ends the process first. The only message for a database problem was the generic "Database preparation failed." |
| 2 | Binds `process.env.PORT`? | Yes, when `PORT` is a number (falls back to 3000 if empty). **If the host passes a socket path or pipe name, the deployed code fails with "The server failed to start." and exits.** Reproduced |
| 3 | `dist` built and served? | Express serves `dist` and falls back to `index.html` for deep links. Whether Hostinger **ran** `npm run build` cannot be seen from here. If it did not, the app would answer **404** ("The public site has not been built yet"), not 503, and the new code now names the missing build on the diagnostic page |
| 4 | Required variables | See section 5 |
| 5 | `PREPARE_DATABASE` | With `1`, start-up migrates, creates the admin and seeds **before** listening, and requires `DB_HOST`, `DB_USER`, `DB_NAME`, `SESSION_SECRET`. Any failure exits. On a first start this can also be slow |
| 6 | Diagnostics for missing/unavailable DB | Poor in the deployed build (exit, generic text). Fixed, see section 4 |
| 7 | Hostinger compatibility | Entry file is ESM. A host that `require()`s it works on Node 22.12+ but fails with `ERR_REQUIRE_ESM` on older 22.x. The import graph has no top-level `await`. An optional `server/start.cjs` entry covers old Node |
| 8 | Health endpoint | `/api/health` existed but returned a bare 503. It now reports phase and database state, safely, and works without the staging password |
| 9 | Build and start tests | Section 3 |
| 10 | Most likely cause | Section 6 |

## 3. Reproduction results

Each row is a real run of the server process (`node server/index.js`) with only the stated environment, then a request for `/` as a visitor would make.

| Setup | Deployed code (`55d057a`) | Fixed code |
|---|---|---|
| `APP_ENV=staging` without `STAGING_USER`/`STAGING_PASSWORD` | process **exits** (code 1), nobody can connect, host shows 503 | stays up, HTTP 503 page: "Access restriction: Set STAGING_USER and STAGING_PASSWORD" |
| `PREPARE_DATABASE=1` with no `DB_*` variables | **exits** | stays up, 503 page names the missing settings |
| `PREPARE_DATABASE=1`, database unreachable or wrong credentials | **exits**, log says only "Database preparation failed." | stays up, 503 page: "The database server refused the connection. Check DB_HOST and DB_PORT… (error code ECONNREFUSED)" |
| `PORT` is a socket path | **exits**, "The server failed to start." | listens on the socket |
| `require()`-style loader on Node older than 22.12 | `ERR_REQUIRE_ESM` | works through `server/start.cjs` |
| No `dist/` folder | starts, answers 404 | stays up, 503 page: "The website has not been built… set the build command to npm run build" |

Verified against a real **MariaDB 11.8.9** (disposable): wrong password → `ER_ACCESS_DENIED_ERROR` explained; missing database → `ER_DBACCESS_DENIED_ERROR` explained; user without `CREATE`/`ALTER` → `ER_TABLEACCESS_DENIED_ERROR` explained; a database that holds WordPress tables → refused with "this database contains WordPress tables… Nothing was changed" and the WordPress-like database was **left with exactly its original tables**. In every case the process stayed alive and **no password, user name or database name appeared in the output**.

Automated: `tests/boot.test.js` (10) spawns the real server for each case above; the full suite is reported in the final summary.

## 4. What changed in the code
- **`server/boot.js`, `server/index.js`:** bind the port first, then prepare. While starting, or if it cannot start (outside production), every request returns 503 with `Retry-After` and a plain explanation; `/api/health` returns JSON with the same information. Production still exits (no diagnostic page).
- **`server/prepare.js`:** a missing-settings problem is now reported, not an immediate exit.
- **Database errors** are explained by error **code** with our own wording; the driver's message (which can contain user and host names) is never printed.
- **`PORT`** may be a number, empty, or a socket path.
- **`server/deployment-checks.js`:** adds a "Website build" check; unsafe staging settings (`http://` or production address, short secret, missing password, bad upload folder, no database) are reported by name.
- **`/api/health`:** public, minimal (`ok`, `phase`, `database`, error code only).
- **`server/start.cjs`:** optional entry file for old Node.

## 5. Environment variables (names only; never paste values)

**Required for the first start:**
`APP_ENV=staging` · `PUBLIC_SITE_URL` (exactly `https://maroon-gazelle-601956.hostingersite.com`, no trailing slash or path) · `SESSION_SECRET` (40+ random characters) · `STAGING_USER` · `STAGING_PASSWORD` (12+ characters) · `DB_HOST` · `DB_PORT` · `DB_NAME` · `DB_USER` · `DB_PASSWORD`.

**Only for the first start:** `PREPARE_DATABASE=1` with `PREPARE_DATABASE_CONFIRM` (the exact `DB_NAME`), `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (12+). Run `PREPARE_DATABASE=check` first; see `STAGING_DATABASE_INITIALISATION.md`. Remove the password afterwards.

**Leave empty or unset for now:** `MEDIA_ROOT` (until the storage test passes), `CRON_SECRET`, `CMS_PASSWORD`, `LEGACY_FILE_EDITING`, `GEMINI_*`.

**Build settings:** build command `npm run build`; start `npm start` (entry `server/index.js`); Node 22; dev dependencies installed (the build needs `vite`).

## 6. Most likely cause, in order
Without the runtime log, ranked by how common each is on a first deployment of this kind:
1. **A required environment variable is missing** (`STAGING_USER`/`STAGING_PASSWORD` when `APP_ENV=staging`, or a `DB_*` value with `PREPARE_DATABASE=1`). The deployed code exits instead of reporting it. *Most likely.*
2. **The database step failed** (wrong database name or password, user not assigned to the database, or a missing privilege) with `PREPARE_DATABASE=1`. The deployed code exits with only "Database preparation failed."
3. **`PORT` supplied as a socket/pipe path.**
4. **Old Node 22.x that cannot `require()` the ES-module entry.**
5. Build or install not completed (less likely, since that gives a 404 or a failed deployment rather than 503).

**How to tell which, in one step:** open Hostinger's runtime/application log for the site and look for one of: `Staging requires STAGING_USER and STAGING_PASSWORD.` (cause 1) · `PREPARE_DATABASE=1 requires DB_HOST…` (cause 1) · `Database preparation failed.` (cause 2) · `The server failed to start.` (cause 3) · `ERR_REQUIRE_ESM` (cause 4). Send me that line, or the list of variable **names** you set.

## 7. Database safety: please check before anything else runs
The deployed build has **no guard against the WordPress database**. If `DB_NAME` points at it and `PREPARE_DATABASE=1`, that build will try to add CMS tables to it (it only adds; it does not delete). Because the site is returning 503, start-up probably did not finish, but a failure part-way can still leave tables behind.

1. In hPanel, confirm `DB_NAME` is the **new, dedicated** database, not the WordPress one.
2. In phpMyAdmin, open the **WordPress** database and confirm it has **no** tables named `schema_migrations`, `content_items`, `roles`, `users` (unprefixed), `submissions` or `site_documents`. WordPress tables are normally prefixed (`wp_…`). If any appear, tell me before doing anything else.
3. Set `PREPARE_DATABASE` to empty until the target database is confirmed.

The fixed code refuses to touch any database that holds WordPress tables or is not empty and not ours.

## 8. Exact corrective action
1. Do **steps 1–3 of section 7** first. Do not redeploy yet.
2. Send me the runtime log line (section 6) or the variable names you set. If it matches cause 1–3, correct the variable in hPanel; with the *deployed* code that requires a redeploy anyway.
3. **One deliberate redeploy with the fix.** After your go-ahead I fast-forward `staging` to the reviewed commit (never `main`). That deploys the fix once; if anything is still wrong, the site then answers with a readable 503 naming the setting, so no further blind redeploys are needed.
4. Open `https://maroon-gazelle-601956.hostingersite.com/api/health`. Expected on success: `{"ok":true,"phase":"running","database":"ok"}`. Any other answer states its own reason.
5. If the log shows `ERR_REQUIRE_ESM`, change the entry file in hPanel to `server/start.cjs`.
6. Then follow `HOSTINGER_STAGING_SETUP.md` Steps 6–7 (sign in, check Settings, storage test before enabling uploads).

## 9. What I did not do
No push to `staging` or `main`, no redeploy, no connection to Hostinger or to any real database (all experiments ran on disposable local databases), no DNS change, nothing touching the WordPress site or database.
