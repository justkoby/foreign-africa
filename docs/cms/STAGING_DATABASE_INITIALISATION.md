# Initialising the dedicated staging database (final procedure)

Target: database `u777654758_cms_staging`, user `u777654758_cms_user`, MariaDB 11.8.9, site `https://maroon-gazelle-601956.hostingersite.com`.
Nothing here has been run against Hostinger. Passwords never appear in this document; enter them only in hPanel.

## 0. Read this first: the deployed build is not safe to initialise with
The build currently deployed (`55d057af`) has **none** of the safeguards below: no read-only check, no target confirmation, no WordPress guard. **Do not set `PREPARE_DATABASE=1` on that build.** Initialisation is only safe after the reviewed build is deployed, which needs your explicit go-ahead to fast-forward `staging` (never `main`). Until then, leave `PREPARE_DATABASE` empty.

## 1. What the safeguards guarantee
| Guarantee | How |
|---|---|
| Only the named database is ever touched | The app connects to `DB_NAME` only; there is no code path that uses another database |
| You must name the target twice | `PREPARE_DATABASE=1` is refused unless `PREPARE_DATABASE_CONFIRM` equals `DB_NAME` exactly. A typo, or a leftover value from another database, cannot initialise anything |
| A look before any change | `PREPARE_DATABASE=check` is strictly read-only (only `SELECT`/`SHOW`) and reports what initialisation would do |
| WordPress is refused | A database containing WordPress tables, or any non-empty database that is not ours, is refused with nothing written |
| Nothing is dropped or deleted | Migrations only create tables and add columns; no `DROP`/`TRUNCATE`; restore never touches a non-CMS database |
| Bad administrator details fail early | Missing, half-set, short (<12) password or invalid e-mail are refused **before any table is created** |
| Errors are readable | Every failure keeps the site up with a 503 page naming the problem (no passwords, user or host names); `/api/health` says the same |

Proven on a replica of your layout (a CMS database, a separate "WordPress" database with real tables and rows, and a user limited to the CMS database as hPanel creates it) on MariaDB 11.8.9: the WordPress database had identical tables and rows before and after the whole procedure, including when the user was pointed at it. Test: `tests/staging-initialisation.test.js`.

## 2. Before you start
1. hPanel → Databases: confirm `u777654758_cms_user` is assigned to `u777654758_cms_staging` **only**, and (ideally) to nothing else. ALL PRIVILEGES on this one database is acceptable.
2. phpMyAdmin → `u777654758_cms_staging` should be **empty** (no tables). The WordPress database must have no `schema_migrations`, `content_items`, `roles`, `submissions` or `site_documents` tables.
3. Take a phpMyAdmin export of the (empty) CMS database for the record if you wish.

## 3. Step A: read-only check (changes nothing)
Set these in hPanel (values exactly):

| Variable | Value |
|---|---|
| `APP_ENV` | `staging` |
| `PUBLIC_SITE_URL` | `https://maroon-gazelle-601956.hostingersite.com` |
| `SESSION_SECRET` | 40+ random characters |
| `STAGING_USER` / `STAGING_PASSWORD` | your choice / 12+ characters |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` (if the check says the connection was refused, try `localhost`) |
| `DB_NAME` | `u777654758_cms_staging` |
| `DB_USER` / `DB_PASSWORD` | `u777654758_cms_user` / its password |
| `DB_CONNECTION_LIMIT` | `3` |
| `PREPARE_DATABASE` | `check` |

Deploy the reviewed build, then open the site URL. In check mode the website itself is not started; the page is the report (HTTP 200):

```
[ok]   Connection: Connected using the main account.
[ok]   Database engine: MariaDB 11.8.9 (supported…)
[ok]   Target database: u777…staging (character set utf8mb4).
[ok]   Contents: The database is empty. This is the correct starting point.
[info] Migrations: 0 applied, 7 would be applied (001_identity to 007_site_content).
[ok]   Privileges: The account can create and alter tables here (it has ALL PRIVILEGES on this database…).
[ok]   Other databases: This account cannot see any other database.
[ok]   Safe to initialise: Yes. Nothing has been changed by this check.
```

Proceed only if **Safe to initialise** is `Yes` and **Target database** shows `u777…staging`.

| If you see | Meaning and action |
|---|---|
| `Contents … holds WordPress tables` | Wrong database. Stop. Fix `DB_NAME` |
| `Contents … already holds N table(s) that are not the CMS's` | Not empty. Use an empty database |
| `Other databases: … can also see N other database(s)` | The account can open other databases (possibly WordPress). Not a blocker, but limit the account to this database in hPanel before continuing |
| `Account scope … privileges on ALL databases` | Same; use a database-specific account |
| `Privileges … lacks CREATE, ALTER` | Grant them to the user in hPanel |
| `Connection … refused / refused the user name or password / not allowed to use it` | Fix `DB_HOST`/`DB_PORT`, the password, or assign the user to the database |

## 4. Step B: initialise
Change/add (keep everything from step A):

| Variable | Value |
|---|---|
| `PREPARE_DATABASE` | `1` |
| `PREPARE_DATABASE_CONFIRM` | `u777654758_cms_staging` (identical to `DB_NAME`) |
| `BOOTSTRAP_ADMIN_EMAIL` | your administrator e-mail |
| `BOOTSTRAP_ADMIN_PASSWORD` | 12+ characters (this becomes the first administrator's password) |
| `BOOTSTRAP_ADMIN_NAME` | optional display name |
| `MEDIA_ROOT`, `CRON_SECRET` | leave empty for now |

Redeploy and read the log. Expected, in order:
```
Foreign Africa is listening on …
Applied 001_identity, 002_content, 003_listings, 004_editorial, 005_submissions, 006_media_metadata, 007_site_content.
Super administrator created for <your e-mail>.
Seed finished. Inserted 17, already present 0, blocked 0.
Foreign Africa is ready.
```
Then open `https://maroon-gazelle-601956.hostingersite.com/api/health`: expect `{"ok":true,"phase":"running","database":"ok"}` (this address works without the staging password).

## 5. Step C: lock it down (do this straight away)
1. Delete `BOOTSTRAP_ADMIN_PASSWORD` (and the e-mail) from hPanel.
2. Set `PREPARE_DATABASE` to empty and delete `PREPARE_DATABASE_CONFIRM`.
3. Redeploy. The log should now show no `Applied` lines. (Leaving initialisation on is harmless and idempotent, but it keeps the first password in the environment.)

## 6. Step D: login and dashboard test
1. Open the site: the browser asks for `STAGING_USER`/`STAGING_PASSWORD`.
2. Go to `/admin`, sign in with the administrator e-mail and password. A wrong password must be refused.
3. The dashboard should show about 12+ published items (the starting content). **Settings** should list every check as `ok` (warnings for uploads and cron are expected).
4. Sign out and in again. Do **not** enable `MEDIA_ROOT` yet; do the storage test from `HOSTINGER_STAGING_SETUP.md` Step 7.

## 7. What each error will look like, and the fix
| Message (on the page and `/api/health`) | Fix |
|---|---|
| `PREPARE_DATABASE=1 also needs PREPARE_DATABASE_CONFIRM…` | Set it to exactly `DB_NAME` |
| `Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, or neither` | Set both |
| `BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters` / `…not a valid e-mail` | Correct it. Nothing was written |
| `…no administrator exists and BOOTSTRAP_ADMIN_* are not set` | Set them and restart (tables are kept) |
| `Refusing to migrate: this database contains WordPress tables` | Wrong database: fix `DB_NAME`. Nothing changed |
| `refused the user name or password` (`ER_ACCESS_DENIED_ERROR`) | Fix the password / user |
| `Either the database … does not exist, or this database user is not allowed to use it` | Fix `DB_NAME` or assign the user to the database in hPanel |
| `lacks a privilege it needs (CREATE and ALTER…)` | Grant them |
| `Migration 00N failed: …` | See below |

**If a migration fails part-way.** DDL cannot be rolled back, and a migration is recorded only when it completes, so a failed file may have created some of its tables or columns. Re-running then reports a "duplicate column/table" error. Because this database is dedicated and was empty, the safe repair is a fresh start of **this database only**, which means deleting the CMS tables. That is destructive, so I will not do it and you should not do it without confirming with me first: send me the exact message and the migration number, and I will give you the precise statements to run in phpMyAdmin, limited to `u777654758_cms_staging`.

## 8. Size and limits
The 3 GB limit is not a concern for the database: the initialised CMS with its starting content is a few megabytes. Uploaded images and PDFs go to `MEDIA_ROOT` on file storage, not into the database. Keep `DB_CONNECTION_LIMIT` at 3 until Hostinger's per-user connection cap is confirmed.

## 9. Not verified from here
The real hPanel privileges of the user, its connection cap, the exact value of `DB_HOST` Hostinger needs, and that Hostinger runs the build and start commands as expected. The check report in Step A shows the first of these for real before anything is written.
