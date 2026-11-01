# Foreign Africa CMS: Audit Report

Audited 2026-11-01. **Supersedes the first version of this file**, which was written from a clone that contained only `main` and wrongly concluded no CMS existed.

## 1. What was inspected

| Item | Result |
|---|---|
| Remote branches (`git ls-remote`, GitHub API) | `main` `f1b7841`, `staging` `55d057a`, `claude/fervent-heisenberg-b5k9dm`. **No Antigravity branch exists on the remote** |
| `staging` history | `f1b7841` → `1426dfb` (your verified commit, "MySQL studio and Hostinger staging preparation") → `585eb2c` → `db67a07` → `55d057a` (three Hostinger startup/cert fixes). `1426dfb` is an ancestor of `staging` |
| Stashes / uncommitted work in this workspace | None |
| Antigravity work | Not identifiable as such. If it lives on your machine, in a fork, or in an unpushed branch, it is not visible to me. Please push it or tell me where it is |
| Checkpoint | Local tag `checkpoint/staging-55d057a`. `staging` was merged into the working branch with a normal merge (`472e324`); nothing was rewritten or discarded |

## 2. Verified baseline

- `npm run build`: passes (Studio is a separate lazy chunk, 361 kB / 113 kB gzip; public bundle 438 kB / 128 kB).
- `npm test`: **66 tests, 63 pass, 0 fail, 3 skipped.** The staging report says 72. The 3 skipped suites are the MySQL-backed ones (`phase2-mysql`, `prepare-database`, `staff-mysql`). They need `mysql-memory-server` to download MySQL from `cdn.mysql.com`, which this sandbox blocks. **I therefore could not independently confirm the migration/seed/permission claims; they are taken from the staging report and code reading.** Run `npm test` on a machine with internet to confirm, or give me a MySQL/MariaDB service.
- Nothing has been deployed. Hostinger was not contacted.

> **Step 1 update (2026-11-01):** the legacy `/editor` shared-password and file-submission risks described in section 3 have been addressed in code (see roadmap). Disposable MySQL 8.0.46 is now available in this sandbox via `tests/helpers/mysql.js`; the suite has since been run against the Hostinger engine itself, MariaDB 11.8.9 (146 of 146 pass); see `DATABASE_COMPATIBILITY.md`.

## 3. Architecture as it actually is

One Node 22 Express process (`server/index.js`) serves the Vite SPA, `/api/staff`, `/api/public`, `/api/discover`, `/api/cms`, `/media`, robots and sitemap. MySQL via `mysql2`; four forward-only migrations (`001_identity` … `004_editorial`); bcrypt passwords; hashed session tokens; DB-backed login throttling; same-origin check on all staff writes; staging Basic-Auth lock; media via `busboy` + `sharp` into `MEDIA_ROOT` outside the deploy tree. Tiptap 2 editor. This matches your description and is retained.

### Two separate editing surfaces (the central architectural problem)

| | `/admin` "Studio" | `/editor` legacy editor |
|---|---|---|
| Storage | MySQL | **JSON files** in `data/cms/*.json` and `public/content/commentaries/` inside the deploy tree |
| Auth | Per-user accounts, 4 roles, sessions | **One shared password** (`CMS_PASSWORD`), HMAC cookie |
| Covers | news, commentaries, pages, programmes | commentaries, news, events, people, engage, **forms and submissions** |
| Audit/revisions | Activity log, revisions, restore | None |

Consequences of `/editor` staying live: on Hostinger the deploy tree is replaced on each deploy, so file-edited events/people/forms and **private form submissions (`submissions.json`) can be lost**; submissions sit beside code with only a shared password; no per-user accountability. This is the highest-priority risk to resolve, and it is also where the Phase 5 modules (events, people, forms) currently live.

## 4. What the Studio does today (code-verified)

Working: sign-in/out, session, password change; user list/create/role/disable with a guard keeping ≥1 super admin; dashboard counts; content list with search, status filter, sort and pagination; Tiptap editor (H2–H4, bold/italic/underline, lists, quote, links, images with alt/caption/link); server-side document validation and HTML rendering with link/mark/node allow-lists and depth limit; SEO title/description; author name, location, tags, category, featured, image fit; featured and social image via media picker; duplicate; soft delete; state workflow (draft, in_review, changes_requested, approved, scheduled, published, rejected, archived) gated by permission; revisions list, compare, restore; 4-second draft autosave; `beforeunload` unsaved-changes warning; scheduled promotion (`server/promote-scheduled.js` and `POST /api/staff/schedule/run`); media library with magic-byte sniffing, size limits, sharp resize/thumbnail, alt text, PDF support, delete blocked while referenced by content; activity log; health; read-only settings; server-rendered SEO meta, canonical, JSON-LD, robots and sitemap (noindex outside production).

Placeholders: the sidebar lists Events, Publications, Team, Partners, Opportunities, Forms, Submissions, Homepage, Navigation and Redirects, each labelled "Not in this release" (honest, not dead buttons). Tables for these exist in `003_listings.sql` ("No application code writes these").

## 5. Gaps against the brief (summary; detail in the gap analysis)

1. **No AI in the CMS.** Gemini exists only in the public Discovery endpoint.
2. **Hero and homepage are not CMS-driven.** `hero-content.js` and inline JSX in `main.jsx`; `homepage_slots` table unused.
3. **Events, opportunities, team, partners, policy briefs, forms, submissions, menus, redirects, settings** have no MySQL-backed code. Events/people/forms exist only in the legacy file editor.
4. **Roles:** 4 roles (`contributor` ≈ Author); no Reviewer; no assignment of submissions; permissions are coarse (no per-content-type or per-section grants, so "Editor may edit homepage sections but not settings" cannot yet be expressed).
5. **Editor:** no tables, no video embeds, no per-block AI, no in-app navigation guard for unsaved changes (only tab close), no bulk actions, no categories/tags management screen, media has no replace-image, grid/list toggle, drag-drop upload, usage list, or upload to private storage for applicant documents.
6. **Public sync:** commentaries/news read from `/api/public/content`; hero, team, partners, policy briefs, opportunities, events and Smart Discovery's catalogue are still static modules.
7. **Hosting unknowns:** `MEDIA_ROOT` outside the deploy tree unconfirmed; scheduled-publish needs a cron or an external caller to hit the schedule endpoint (not verified on Hostinger Business); no backup restore drill run; nothing deployed.

## 6. Risks and fixes made

| Finding | Status |
|---|---|
| Discovery rate limiter keyed on `x-vercel-forwarded-for` (client-spoofable off Vercel) falling back to the socket address (the proxy's IP on Hostinger, so one shared bucket) | **Fixed**: prefers Express `req.ip` (trust proxy is already set); regression test added |
| Admin typography used DM Sans/Mark Pro | **Fixed** for `/admin` and `/editor` only: Inter, self-hosted via `@fontsource/inter` (OFL), latin 400/500/600. Public site CSS unchanged and verified in browser (Mark Pro still renders on `/`) |
| `UPDATES/` 36 MB bundle | Already removed on `staging`; nothing to do |
| Four `WhatsApp-Image-*.webp` files at repo root | Still present. Not referenced? **Verify before deleting** (not done) |
| `npm audit` reports vulnerabilities in the dependency tree | Not triaged yet |
| Legacy `/editor` shared password + file storage in production | Open, P0 (see roadmap) |
| `/api/cms` write endpoints rate limits are per-process memory | Low; acceptable behind per-user auth |
| `docs/cms-handoff.md` and `supabase/` are historical (Supabase proposal) | Mark as superseded; not deleted |

## 7. Documentation accuracy
`STAGING_READINESS_REPORT.md` is detailed and mostly consistent with the code, except the test count (72 stated vs 66 here, 3 skipped for sandbox network reasons). `CMS_AUDIT.md` (25 Oct) still describes "no MySQL, no Express" and is historical. `cms-handoff.md` is historical Supabase planning.
