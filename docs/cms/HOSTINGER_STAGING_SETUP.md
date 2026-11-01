# Temporary-domain staging on Hostinger: readiness audit and setup

**Nothing here has been done.** No site was created, nothing was deployed, no branch was pushed to `staging`, and no DNS record, Microsoft setting or WordPress database was touched. Every step marked ► needs your approval or an action only you can take.

The plan: run the new site and CMS on a Hostinger **temporary domain** (a `*.hostingersite.com` address) so `foreignafrica.org` and its Microsoft-managed DNS stay exactly as they are. The production WordPress site is unaffected because nothing points at the new app and it has its own, separate database.

## 1. Readiness audit

Verified in this repository (automated tests, run on MariaDB 11.8.9 and MySQL 8.0.46, plus browser checks):

| Requirement | Status |
|---|---|
| Express + React/Vite + MariaDB, Node 22 | Ready. `engines: 22`, `npm run build`, `npm start` (`server/index.js`, listens on `PORT`) |
| Temporary URL from environment, not hardcoded | Ready. Canonical addresses, the same-origin check, sitemap and links use `PUBLIC_SITE_URL`. The only fixed `foreignafrica.org` references are *content* links to existing WordPress pages and the always-allowed link host; staging refuses to start if `PUBLIC_SITE_URL` is the production address |
| `/admin`, APIs, auth, sessions | Ready. Cookie is `HttpOnly; SameSite=Lax; Secure`, host-only (no `Domain`), so it works on any domain and simply asks staff to sign in again after a move |
| Deep links and refresh | Ready. Tested: `/admin`, `/editor/`, `/news/<slug>/`, `/people/<id>/`, `/?story=…` all serve the app on direct load |
| Preview mode | Ready. Login-only, `noindex`, no-store, framed by the Studio only (`frame-ancestors 'self'`). Needs the built site (`npm run build` runs on deploy) |
| Access restriction | Ready. `APP_ENV=staging` makes every page, API and file ask for `STAGING_USER`/`STAGING_PASSWORD` |
| Excluded from search | Ready. Every response (even the password challenge) carries `X-Robots-Tag: noindex, nofollow`; `robots.txt` disallows everything; no sitemap; article pages carry `noindex` |
| Separate staging MariaDB, MariaDB 11.8 | Ready. Migrations `001`–`007` apply on 11.8.9; startup refuses any database that holds WordPress tables or is not a CMS database |
| Self-check on Hostinger (no shell needed) | Ready. At start-up the app prints `[fail]`/`[warn]` lines and **refuses to start** with an unsafe staging setup; Studio → Settings shows the same checklist |
| Scheduled publishing without traffic | Ready. `POST /api/cron/publish` with a secret; reachable without the staging password; HTTPS-only; see `CRON_SCHEDULING.md` |
| Persistent uploads, verified | Ready in code. First start writes a marker in `MEDIA_ROOT`; after a redeploy, Studio → System health says the folder **survived a restart**. Until then it says "not yet proven" |

### Blockers and open questions
| # | Item | Why it matters | Who |
|---|---|---|---|
| B1 | Approval to deploy, and to update the `staging` branch | `staging` currently holds the older commit `55d057a`; the reviewed work is on `claude/fervent-heisenberg-b5k9dm`. I will not push to `staging` or `main` without approval | ► you |
| B2 | A **new, empty** MariaDB database and user in hPanel | The CMS must never share the WordPress database. Whether hPanel lets you limit the user's privileges is **unverified** | ► you |
| B3 | A persistent folder for uploads (`MEDIA_ROOT`) | Hostinger replaces deployment folders on each deploy. The folder must be **outside** it. Which absolute path works is **unverified** | ► you, then the marker test |
| B4 | Hostinger runs `npm run build` with dev dependencies installed | The build needs `vite`. If the log says `vite: not found`, the install skipped dev dependencies | verify at first deploy |
| B5 | The `sharp` image library installs on Hostinger's Linux | Needed for thumbnails and resizing. If it fails, uploads still validate but are not resized | verify at first deploy |
| B6 | HTTPS on the temporary domain | The app requires `https://` and Secure cookies. Hostinger normally provides it on the temporary domain; confirm the padlock | verify |
| B7 | Cron Jobs availability on your plan | Optional. Without it scheduled items still go live when the site is visited | verify; or use an external scheduler |
| B8 | Hostinger access to the private GitHub repository | Needed for the Git import | ► you (authorise the Hostinger GitHub app) |
| B9 | Real database privileges and connection limit | `DB_CONNECTION_LIMIT` must not exceed the per-user cap; one account for everything is acceptable if hPanel cannot split privileges | verify |

A rehearsal of this whole setup on a throwaway MariaDB 11.8 (staging mode, an https address delivered through proxy headers, password gate, Secure cookie, upload, preview, cron, and a restart proving the upload folder persists) passes 19 of 19 checks: `node scripts/staging-simulation.mjs` (needs `npm run build` and Docker, or a local MySQL). It simulates Hostinger's proxy; it is not Hostinger.

None of B1–B9 can be completed or confirmed from the development environment. Cutover-specific gaps (redirects) are in `CUTOVER_TO_PRODUCTION.md`.

## 2. Exact setup (after you approve)
Hostinger's screens change; if a label differs, follow the intent and tell me what you see.

**Step 0: approvals.** Approve in writing: (a) creating the Hostinger site, (b) updating `staging` to the reviewed commit. Then I will fast-forward `staging` to `claude/fervent-heisenberg-b5k9dm` (never `main`).

**Step 1: database (hPanel → Databases).** Create a database such as `u123_fa_cms` and a user `u123_fa_cms`, assign the user to that database only. Note the exact names, host (expected `127.0.0.1`), and port (3306). If hPanel lets you create a second user, create `u123_fa_cms_mig` for migrations and grant only `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, REFERENCES` on this database (see `DATABASE_COMPATIBILITY.md`); otherwise use one user. **Do not select, open or reuse the WordPress database.**

**Step 2: persistent upload folder (File Manager or SSH).** In your account home, **outside** `domains/` and `public_html/`, create `foreign-africa-media`. Note its absolute path (for example `/home/u123456789/foreign-africa-media`). Leave `MEDIA_ROOT` empty for the first deploy.

**Step 3: create the site (hPanel → Websites → Add website → Node.js).** Choose to import from Git, authorise GitHub, select repository `justkoby/foreign-africa`, branch **`staging`**. Use the temporary domain Hostinger assigns.

| Field | Value |
|---|---|
| Framework / app type | Express (do **not** choose a static Vite site: the Express server must run) |
| Node.js version | 22 |
| Build command | `npm run build` |
| Start command / entry file | `npm start` / `server/index.js` |
| Output directory | leave empty |

**Step 4: environment variables** (hPanel → the app → Environment variables). Replace the temporary address with the one Hostinger gave you, exactly as shown in the browser bar.

| Name | Value | Notes |
|---|---|---|
| `APP_ENV` | `staging` | Turns on the password gate and noindex |
| `PUBLIC_SITE_URL` | `https://<name>.hostingersite.com` | Origin only: no path, no trailing slash. Never `https://foreignafrica.org` (the app refuses to start) |
| `SESSION_SECRET` | 40+ random characters | `openssl rand -base64 48` |
| `STAGING_USER` / `STAGING_PASSWORD` | your choice / 12+ characters | Different from every staff password |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | from Step 1 | |
| `DB_MIGRATE_USER` `DB_MIGRATE_PASSWORD` | only if you made two users | Then `DB_USER` can be data-only |
| `DB_CONNECTION_LIMIT` | `3` to start | Keep at or below the per-user cap |
| `PREPARE_DATABASE` | `1` | Applies migrations, creates the first admin, loads the starting content |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_ADMIN_NAME` | your details; password 12+ characters | **Remove the password after the first start** |
| `MEDIA_ROOT` | *(empty)* | Set in Step 7 |
| `CRON_SECRET` | 40+ random characters | Optional; see `CRON_SCHEDULING.md` |
| `GEMINI_API_KEY` `GEMINI_MODEL` | optional | Public search assistant only |
| `CMS_PASSWORD`, `LEGACY_FILE_EDITING` | **leave unset** | |

**Step 5: deploy** and read the log. Expect: `Applied 001_identity … 007_site_content.`, `Super administrator created for …`, `Seed finished …`, `Foreign Africa is listening on …`. Any `[fail]` line means the app deliberately did not start; fix the named variable and redeploy.

**Step 6: first checks.** Open the temporary address in a private window: the browser must ask for the staging password. Sign in at `/admin`. Open **Settings**: every row should be `ok` (warnings for uploads and cron are expected at this point). Remove `BOOTSTRAP_ADMIN_PASSWORD`, redeploy.

**Step 7: uploads (storage test).** Set `MEDIA_ROOT` to the absolute path from Step 2 and redeploy. Open **System health** → media should say the folder is writable but "not yet proven". Redeploy once more (any change). Check again: it must say the folder **survived a restart**. Only then upload real files. If it never says so, the folder is inside the deployment tree: choose another location.

**Step 8: scheduling (optional).** Follow `CRON_SCHEDULING.md`, using `https://<name>.hostingersite.com/api/cron/publish`.

## 3. Acceptance checklist (private window)
1. Password prompt appears before any page, including `/admin`, `/api/health` and `/robots.txt`; wrong password is refused.
2. Response headers on any page include `X-Robots-Tag: noindex, nofollow`; `/robots.txt` is `Disallow: /`; `/sitemap.xml` is 404.
3. Homepage looks like the current design; hero slides advance; mobile menu works.
4. Refresh on `/admin`, `/news/`, a news article, a people page and `/?story=kigali-engagement`: each loads (no 404).
5. Sign in, sign out, sign in again; closing and reopening the browser keeps the session for 7 days.
6. Create a news draft; it is not visible publicly; publish it; it appears at `/news/<slug>/`; Preview opens.
7. Upload an image (after Step 7); it appears in the library with a thumbnail; use it as a featured image.
8. Homepage editor: change a sentence, **Save draft**, confirm the live page is unchanged, check the desktop and mobile preview, **Publish**, confirm the live page changed.
9. Hero editor: edit a slide, add a hidden slide, publish; visitors see only shown slides.
10. Schedule an article for 2 minutes ahead; it appears on time (with cron) or on the next visit (without).
11. Studio → System health shows the database and uploads as ok; Settings shows no `fail` rows.
12. Confirm `https://foreignafrica.org` still shows the WordPress site, unchanged.

## 4. Backups and rollback (staging)
- Before risky changes, export the staging database from hPanel and copy the `MEDIA_ROOT` folder; store them outside the site folders.
- Roll back the app by redeploying the previous successful deployment in Hostinger. That does **not** restore the database or uploads; restore the dump into the same **new** database only, never into the WordPress database.
- Removing the staging site takes it offline and deletes its deployments but not a separate database or the upload folder; export first.
