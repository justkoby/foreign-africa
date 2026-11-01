# Switching from the temporary domain to foreignafrica.org

Planning document. **Nothing here has been done and no DNS record has been changed.** The DNS for `foreignafrica.org` is managed through Microsoft; this plan assumes you (or whoever has access) will make the changes, and that you approve each stage.

## Principle
Keep the WordPress site fully intact and reachable until the new site has been proven on the real address, and keep a one-step way back (the old DNS values).

## Known gaps to close before cutover
| Gap | Detail |
|---|---|
| **No redirect engine** | The `redirects` table exists but nothing reads it. WordPress addresses that differ from the new ones (for example `/?p=123`, `/category/blog/`, `/wp-content/uploads/…` image links, old tag and date archives) will 404. New addresses deliberately match the old ones where possible: commentaries and pages at `/<slug>/`, news at `/news/<slug>/`, `/blog/`, `/commentaries/`. A redirect middleware, an importer from a WordPress export, and tests are needed. **Not implemented** |
| Content completeness | Three seeded news items still have empty bodies and point to the original WordPress articles (documented in `CONTENT_MIGRATION_REPORT.md`). Decide whether to finish them first |
| Verified hosting facts | HTTPS issuance on the real domain, cron, upload persistence and database limits must already be proven on the temporary domain |
| Email | If the domain's email is on Microsoft, its MX/TXT/SPF/DKIM records must **not** be touched; only the web records change |

## Stages
1. **Prove on the temporary domain.** Complete the acceptance checklist in `HOSTINGER_STAGING_SETUP.md`, including uploads surviving a redeploy and a backup restore drill into a scratch database.
2. **Take backups.** Full backup of the WordPress site and its database (read-only copy; do not alter them), the CMS database dump, and the uploads folder.
3. **Redirects and URL audit.** Build the redirect map from WordPress (sitemap or export). Test every old address against the new site on the temporary domain.
4. **Lower DNS TTL.** At least 48 hours before, reduce the TTL on the web records so a rollback is fast. Record the **current values** of the apex `A` and `www` records exactly as they are today.
5. **Attach the domain in Hostinger** to the Node app. Hostinger shows the target IP or hostname. Do not change DNS yet.
6. **Test before DNS changes.** On a test computer, map `foreignafrica.org` to Hostinger's IP in its hosts file and browse the real address to check HTTPS (the certificate can be issued by Hostinger once the domain resolves; if it cannot be issued before DNS moves, schedule the change for a quiet period).
7. **Change the environment** (Hostinger variables) in the same change window: `APP_ENV=production`, `PUBLIC_SITE_URL=https://foreignafrica.org`, remove `STAGING_USER` and `STAGING_PASSWORD`. Redeploy. The app will refuse to start in production without a long `SESSION_SECRET`, Secure cookies and an https address.
8. **Change DNS (Microsoft DNS).** Point the apex `A` record (and `www` `CNAME`/`A`) to Hostinger, leaving all mail and verification records alone.
9. **Verify.** HTTPS padlock; homepage, `/admin`, deep links, a legacy address and its redirect; `robots.txt` now allows indexing and lists `/sitemap.xml`; canonical tags show `https://foreignafrica.org/…`; sign in works (staff sign in again because cookies are host-only); upload and publish a test article.
10. **Tell search engines.** Submit the sitemap; keep monitoring crawl errors and 404s for two weeks.

## What changes at cutover, and why it is safe
| Area | Behaviour |
|---|---|
| Session cookies | Host-only, `HttpOnly`, `SameSite=Lax`, `Secure`. They are not tied to the temporary domain, so nothing breaks; staff sign in once on the new address |
| Canonical URLs and sitemap | Built from `PUBLIC_SITE_URL`; the page templates switch to `index,follow` automatically in production |
| Same-origin protection | Writes are accepted only from the exact `PUBLIC_SITE_URL` origin, so the temporary and the real address cannot both accept staff writes at once. Set the variable before switching DNS |
| Homepage/hero and article links | Links are stored as paths or `https://foreignafrica.org/…`, which remain valid after the move |
| Uploads | Served at `/media/<id>` and stay in `MEDIA_ROOT`; unaffected by the domain |
| Database | Same CMS database, no copy needed |

## Rollback
1. **Fast rollback (minutes to the TTL):** restore the apex and `www` records to the values recorded in stage 4. WordPress resumes serving.
2. **Application rollback:** redeploy the previous successful deployment in Hostinger.
3. **Data rollback:** restore the CMS dump into the CMS database (never the WordPress one) and the uploads folder from the backup.
4. Keep WordPress hosting and its database untouched for at least two weeks after cutover before decommissioning anything.

## Backups after go-live
Daily CMS database dump and a copy of `MEDIA_ROOT` stored outside the site folders, retained at least 14 days (see `HOSTINGER_REQUIREMENTS.md`). A dump contains applicant information and staff password hashes: store it encrypted or access-restricted. Run a restore drill into a scratch database each quarter.
