# Database compatibility: MariaDB 11.8 (Hostinger) and MySQL 8

**Target (confirmed by you in phpMyAdmin):** MariaDB Server **11.8.9-MariaDB-log**, `127.0.0.1:3306`, InnoDB. Driver: `mysql2` (unchanged). Also kept working on MySQL 8.0 so developers can use either locally.

**The WordPress database is out of bounds.** The CMS needs its own new database. No migration, seed, restore or test in this repository was run against Hostinger or any shared database; every integration test starts a throwaway server.

## What was run (all against disposable servers)

| Engine / configuration | Result |
|---|---|
| **MariaDB 11.8.9** (official `mariadb:11.8` image, same version as Hostinger), default configuration (`utf8mb4_uca1400_ai_ci`, `STRICT_TRANS_TABLES`) | **93 of 93 pass, 0 skipped** |
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
