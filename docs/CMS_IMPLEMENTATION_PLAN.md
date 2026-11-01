# CMS implementation plan

**Status:** Phase 2 is in the repository. It has not been deployed, and it has not been seeded into a persistent database. Phase 3 has not started.

This plan matches the code on 25 October 2026.

## Completed in Phase 1 and still in place

- MySQL migrations `001_identity.sql`, `002_content.sql`, and `003_listings.sql`.
- Migration runner: `npm run migrate`. It does not run on server startup.
- Staff accounts, sessions, roles, login limits, and activity logs.
- First administrator command: `npm run bootstrap-admin`.
- Studio sign-in at `/admin`.
- Staging lock, `noindex`, and no staging sitemap.
- The file editor at `/editor` for events, people, engage, and forms.

## Completed in Phase 2

- Migration `004_editorial.sql` adds author, location, image fit, external and source URLs, the legacy id, and media dimensions.
- TipTap 2.27 stores a document in `body_json`. The server rebuilds `body_html`. Client HTML is not stored.
- News and commentaries are edited in `/admin`: create, edit, draft, publish, unpublish, archive, duplicate, preview, and restore a revision.
- Contributors stay on their own drafts. Editors, administrators, and super administrators publish directly. Review statuses remain in the database and are not a queue.
- Media library for JPEG, PNG, WebP, GIF, and PDF. Uploads require `MEDIA_ROOT`. SVG is rejected.
- Public `/news/` and `/blog/` read `/api/public/content`. They do not fall back to the JSON catalogue.
- `npm run seed-content` inserts the 12 commentaries and the five news cards. It skips a slug that already exists.
- `/editor` returns 409 for news and commentary writes. It still writes the other sections.
- Article URLs inject the article into the initial HTML shell. Visitors still receive the React design after JavaScript runs.

## Partially completed

- System health checks the database, the media directory, recorded errors, and upload failures. Backup status stays unknown.
- Listing tables exist for events, opportunities, team, partners, publications, forms, navigation, homepage slots, settings, and redirects. No screens write to them.
- Scheduled publishing can be run with `npm run promote-scheduled`. No Hostinger cron is installed.
- The discovery assistant still searches the static page directory, not MySQL.
- Homepage story cards still use `src/activities.js`. The two complete news stories also have MySQL pages at `/news/{slug}/`.

## Blocked

- `MEDIA_ROOT` is empty in local `.env.local`, and a Hostinger directory outside `hbuilds` and `public_html` has not been confirmed. Uploads return 503 until that path is set.
- The seed has been proven only against the in-memory test database. This machine has no MySQL, so `/news/` and `/blog/` currently show “The staff database is not configured.”
- A Hostinger restore test has not been run. The isolated test in `tests/phase2-mysql.test.js` passed. See `docs/BACKUP_RECOVERY.md`.
- Three news articles and the programme pages listed in `docs/WORDPRESS_MIGRATION_PLAN.md` still need a WordPress export. Their bodies were not invented.

## Not started

- Forms and submissions.
- Events, people, partners, programmes, and the homepage as MySQL sections.
- WordPress import of the missing bodies.
- DNS, staging deploy, or production cutover.

## Next phase, after approval

Do not start it from this phase. The useful next work is a staging database, `npm run migrate`, `npm run bootstrap-admin`, `npm run seed-content`, and a confirmed `MEDIA_ROOT`, then an editor session against that database. Missing WordPress bodies stay blocked until an export exists.
