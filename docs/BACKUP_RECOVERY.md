# Backup and recovery

Nothing in this application has been deployed, and no backup has been verified. The studio reports backup status as unknown. Hostinger’s hPanel backups are outside this app.

A restore has three parts. Restoring the Node deployment does not restore the database or the media directory.

## Application code

Hostinger keeps the live build and replaces it on the next deploy. Roll back by redeploying a known Git commit, then `npm run build` if the host does not build automatically. That does not touch MySQL or `MEDIA_ROOT`.

## Database

1. In hPanel, export the studio database, or run `mysqldump` over SSH against `127.0.0.1`.
2. Store the dump outside the site’s `hbuilds` and `public_html` folders. Those folders are replaced on deploy.
3. Restore with the mysql client into an empty database first. Do not restore over the WordPress database.
4. Run `npm run migrate` only if the dump is older than the code’s migrations. Do not run a dump and a conflicting migration blindly.

Retention: keep daily dumps for 14 days and a monthly dump for 6 months, in hPanel or in a folder outside the deploy tree. Confirm the actual hPanel retention before launch. This repository cannot see it.

If a migration fails, read the error, repair the half-applied tables, and run `npm run migrate` again. Recorded migrations are not repeated. See `docs/DATABASE_SCHEMA.md`.

## Media

`MEDIA_ROOT` must be a directory outside `hbuilds` and `public_html`. Copy that directory in the same backup job as the database dump. A database row that points at a missing file is a broken image. A file without a row is an orphan and can be deleted only after checking `media_assets`.

Uploads write only when `MEDIA_ROOT` is set. Leave it empty on Hostinger until a directory outside the deploy tree is confirmed. See `docs/MEDIA_STORAGE.md`.

## Isolated restore test, 25 October 2026

`tests/phase2-mysql.test.js` ran this against two temporary MySQL 8.4 databases from `mysql-memory-server`, not against Hostinger and not against a shared database.

1. It created a super administrator, an editor, a published article, a draft, and a PNG in a temporary `MEDIA_ROOT`.
2. `server/backup.js` copied the staff, media, content, term, revision, and activity tables into the second database and copied the PNG into a second directory.
3. The restored article text, the role, and the file bytes matched.
4. The draft was absent from the public list. The published article was present.

Result: passed, as part of the suite run the same day (70 tests, 0 failures).

This is not an hPanel restore and it is not `mysqldump`. The health screen still says backup status is unknown. Do not treat this test as proof that Hostinger backups work.

## Staging restore test

Blocked. `preview.foreignafrica.org` is not deployed, and this machine has no persistent MySQL. Run the six steps below there before production, then replace this note with the date and result.

1. Create a staff account, a published article, a draft, and a media file.
2. Dump the database and copy `MEDIA_ROOT`.
3. Restore both into an empty database and an empty media directory. Do not restore over WordPress or over the database you just dumped.
4. Sign in. Confirm the role, the article text, and that the file URL still resolves.
5. Confirm the draft is absent from `/api/public/content`.
6. Confirm submission files, when that module exists, are not reachable without a staff cookie.
