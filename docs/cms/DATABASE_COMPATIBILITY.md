# Database compatibility: MariaDB 11.8 (Hostinger) and MySQL 8

**Target (confirmed by you in phpMyAdmin):** MariaDB Server **11.8.9-MariaDB-log**, `127.0.0.1:3306`, InnoDB. Driver: `mysql2` (unchanged). Also kept working on MySQL 8.0 so developers can use either locally.

**The WordPress database is out of bounds.** The CMS needs its own new database. No migration, seed, restore or test in this repository was run against Hostinger or any shared database; every integration test starts a throwaway server.

## What was run (all against disposable servers)

| Engine / configuration | Result |
|---|---|
| **MariaDB 11.8.9** (official `mariadb:11.8` image, same version as Hostinger), default configuration (`utf8mb4_uca1400_ai_ci`, `STRICT_TRANS_TABLES`) | **157 of 157 pass, 0 skipped** |
| MariaDB 11.8.9, strict `sql_mode` incl. `ONLY_FULL_GROUP_BY`, server time zone +09:00, Node `TZ=America/New_York` | 17 of 17 DB suites pass |
| MariaDB 11.8.9, hostile `sql_mode=NO_BACKSLASH_ESCAPES` | 20 of 20 DB suites pass **after fixes below** (3 failures before) |
| MariaDB 11.8.9 and MySQL 8.0.46, password-authenticated user with only `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES` on one database and `MAX_USER_CONNECTIONS 5`: migrate, bootstrap, seed, login, 30 concurrent requests | pass on both |
| MySQL 8.0.46 (system server) | all pass |

Reproduce: `docker pull mariadb:11.8` then `TEST_DB=mariadb npm test` (see `tests/helpers/mysql.js`; `TEST_MARIADB_ARGS` passes server flags). Without Docker the suites fall back to a local `mysqld` or `mysql-memory-server`.

## Review findings and what was done

| Area | Finding | Action |
|---|---|---|
| `JSON` columns | MariaDB's `JSON` is `LONGTEXT` + `CHECK (json_valid(...))`, so `mysql2` returns **strings**, not objects. Code already parses `string` or `object` everywhere it reads `body_json`, `snapshot`, `metadata`, `payload` | Verified on 11.8; no change. New code (`submissions.js`) follows the same rule. Any future JSON read **must** accept both |
| JSON storage | MariaDB keeps the text as written (key order preserved); MySQL normalises it. Nothing in the code depends on key order | None |
| JSON functions | Only `CAST(body_json AS CHAR) LIKE`, and in tests `JSON_EXTRACT`/`JSON_UNQUOTE`; all work on both | None |
| `DATETIME(3)` / time zones | App writes UTC strings; pool uses `timezone: 'Z'`; no `NOW()` in SQL | Tested with a skewed server and Node zone |
| Collation | Every table declares `utf8mb4_unicode_ci`. The MariaDB 11.8 default server collation is `utf8mb4_uca1400_ai_ci` | Tested with the real default; no mixed-collation errors |
| `sql_mode` | Hostinger's value is unknown. MariaDB default lacks `ONLY_FULL_GROUP_BY` | Tested strict and stock |
| **`LIKE … ESCAPE '\\'`** | Backslash escaping breaks under `NO_BACKSLASH_ESCAPES` | **Fixed:** `ESCAPE '!'` via `likeContains()` |
| **Client-side `?` interpolation (`pool.query`)** | Under `NO_BACKSLASH_ESCAPES` it corrupted JSON on restore and is a known injection vector | **Fixed:** restore and submissions use prepared statements (`execute`). Remaining `query()` calls take no user values |
| **Restore (`importTables`)** | `SET FOREIGN_KEY_CHECKS` is per connection but ran on a pool; a failed restore left tables emptied | **Fixed:** one dedicated connection inside a transaction, rolled back on error (test added) |
| Migrations | `ALTER … ADD COLUMN … AFTER`, multi-clause `ALTER` with FK, `CREATE TABLE IF NOT EXISTS`, `ON DUPLICATE KEY UPDATE … VALUES()`, `INSERT IGNORE` all valid on 11.8. No `IF NOT EXISTS` on `ADD COLUMN` (MySQL lacks it); the ledger guarantees each file runs once. DDL commits implicitly on both, so a failed file can leave earlier statements applied (documented in `migrate.js`) | None |
| Indexes | Longest unique key: `VARCHAR(500)` × 4 bytes = 2,000 < 3,072-byte InnoDB limit | None |
| Transactions | Only the restore uses one. Duplicate protection relies on unique keys and `ER_DUP_ENTRY` (same code on both) | Tested sequentially; concurrent same-key submissions rely on the unique key and are retried once |
| Auth plugin | Users created with a password on 11.8 use `mysql_native_password`, which `mysql2` supports | Tested |
| Privileges | The app needs no `DROP`, `TRUNCATE`, `CREATE USER` or `SUPER` | Tested with the limited user |
| Connections | Pool `connectionLimit: 5`; startup preparation opens its own pool before the web pool | Tested at a cap of 5. Lower the limit if Hostinger's per-user cap is lower |
| New safety: database guard | `migrate()`, startup preparation and restores refuse a database holding WordPress tables, or any tables without our `schema_migrations` ledger | Tested: nothing is created, altered or dropped |

## Cannot be tested from here (verify on Hostinger)
- The actual hPanel database user's privileges (can it `CREATE`/`ALTER`/add foreign keys?), its `max_user_connections`, and the server's real `sql_mode` and `max_allowed_packet` (stock is 16 MB; an article is capped at about 0.5 MB).
- That the Hostinger **application runtime** reaches `127.0.0.1:3306` with the chosen credentials.
- TLS (relevant only if you ever use a non-local host).
- Backup/restore through hPanel, and whether the engine's version string stays 11.8.x after Hostinger upgrades.
- Behaviour under real shared-hosting load.

## Run order on Hostinger (when you approve a deploy)
1. In hPanel, create a **new empty database and user** for the CMS. Do not reuse the WordPress database.
2. Set `DB_*` to that database. The guard will refuse to start preparation if the database is not empty or contains WordPress tables.
3. First start with `PREPARE_DATABASE=1` applies migrations `001`–`005`.


## Minimum privileges (measured, not assumed)
Each set below was tried by running the full startup path (migrations, first administrator, seed) as a password-authenticated user limited to one empty database. "Needs" means removing it made startup fail.

| Privilege | MariaDB 11.8.9 | MySQL 8.0.46 |
|---|---|---|
| `SELECT`, `INSERT`, `UPDATE`, `DELETE` | needed | needed |
| `CREATE` | needed | needed |
| `ALTER` | needed (migrations `004`–`006` alter tables) | needed |
| `REFERENCES` | **not** needed | **needed** (foreign keys) |
| `INDEX` | not needed | not needed |
| `DROP`, `TRUNCATE`, `LOCK TABLES`, `CREATE VIEW`, `TRIGGER`, `SUPER`, `CREATE USER`, `PROCESS` | never used | never used |

**Portable minimum for the migration account:** `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, REFERENCES` on the CMS database only.

**The running site needs only `SELECT, INSERT, UPDATE, DELETE`.** This is tested: a second account with exactly those four privileges runs login, content, scheduling, the cron endpoint, submissions and the staff APIs, and genuinely cannot `CREATE` or `DROP` (the test asserts the denial). Locking reads (`FOR UPDATE`) and transactions need no extra privilege.

### Recommended setup
- Create two accounts on the **new** CMS database: a *migration* account (portable minimum above) and a *runtime* account (four privileges). Set `DB_USER`/`DB_PASSWORD` to the runtime account and `DB_MIGRATE_USER`/`DB_MIGRATE_PASSWORD` to the migration account. Startup preparation and `npm run migrate` use the migration account; the web server never does.
- If Hostinger only lets you create one account per database, use it for both (leave `DB_MIGRATE_*` unset). That account then holds DDL rights at runtime; the guard against WordPress/foreign tables and the absence of any `DROP` in the code still apply.

### Connection limit
`DB_CONNECTION_LIMIT` sets the pool size (default 5, accepted range 1–25; invalid values fall back to 5). Startup preparation opens its own short-lived pool before the web server starts. Tested with a per-user cap of 5 connections and 30 concurrent requests (they queue; none fail), and with a pool of 3. Set it at or below Hostinger's per-user `max_user_connections`, which is **not yet confirmed**.

### Still to verify on Hostinger
Whether hPanel allows creating two accounts and granting this exact privilege set (some panels grant "ALL PRIVILEGES" only); the real per-user connection cap; the server's `sql_mode`.
