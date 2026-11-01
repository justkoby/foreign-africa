# Staging readiness report

**Date:** 25 October 2026  
**Target:** `https://preview.foreignafrica.org` on Hostinger Business Web Hosting  
**Production:** `https://foreignafrica.org` stays on WordPress  
**Decision:** No-go until you approve a deploy. The repository is ready for that deploy with uploads left off.

Nothing was deployed. DNS was not changed. The production WordPress database was not opened.

## Checks completed

| Check | Result |
| --- | --- |
| `npm run build` | Passed. Vite 7 wrote `dist/` in 8.53s |
| `node --test tests/*.test.js` | Passed. 72 tests, 0 failures |
| Express port | `server/index.js` listens on `process.env.PORT`, or 3000 when that variable is absent |
| One origin | `createSite` serves the React shell, `/api/staff`, `/api/public`, `/api/discover`, `/api/cms`, `/media`, robots, and the sitemap from the same process |
| Client routes | A direct request for `/`, `/admin`, and `/editor/` returns `index.html`. React then chooses the page. Confirmed by `tests/staging-host.test.js` without a browser |
| Admin refresh | The same `index.html` response is what a refresh receives |
| Database credentials | Read from `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. No database password is in the repository |
| Staging lock | `APP_ENV=staging` refuses to start without `STAGING_USER` and `STAGING_PASSWORD`. Every response, including pages and APIs, asks for that basic password |
| Secrets | `.env.local` is gitignored. Staff and staging passwords are not hardcoded. Test fixtures use obvious fake passwords |
| Gemini | `/api/discover` is now part of the production server. Without a key it still returns directory results. The staging test called it with a query that does not contact Gemini |
| Uploads | Empty `MEDIA_ROOT`, or a path inside `hbuilds`, `public_html`, or `dist`, returns 503 and writes nothing |
| Migrations on an empty database | `tests/prepare-database.test.js` applied `001` through `004` on a new MySQL 8.4 database |
| Bootstrap | The same test created one super administrator and skipped the second attempt |
| Seed | The same test inserted 17 rows and, on the second run, inserted 0 and reported 17 already present. No row was blocked. The three incomplete news articles were stored with their existing WordPress URLs and empty bodies |

These tests used a temporary MySQL process on this machine. They did not connect to Hostinger.

## Issues found and fixed before this report

`npm start` previously did not serve `/api/discover` or `/api/cms`. Both only existed in the Vite dev server, so the assistant and `/editor` would have 404’d after deploy. They are now mounted on the Express app, behind the staging password.

Hostinger’s Business plan does not let you run npm scripts over SSH. `server/prepare.js` runs the migration, the one-time administrator, and the idempotent seed when `PREPARE_DATABASE=1`, which is how the first start can do that work.

## Deployment blockers that remain

- Your approval. Do not push to a branch that auto-deploys, and do not create the Hostinger website, until you say so.
- `MEDIA_ROOT` has no confirmed directory outside the deploy tree. Uploads stay off. This does not block the rest of staging.
- The browser checklist below has not been executed on Hostinger. Local browser checks from Phase 2 were against a machine with no database.
- A Hostinger backup restore has not been run.
- If the Hostinger build says `vite` is missing, the install skipped devDependencies. `vite` is required for `npm run build`. Do not switch the framework preset to a static Vite site. Express has to stay the server.

## Hostinger setup

Create a new website for the preview hostname. Do not remove the existing WordPress website, and do not change the apex DNS.

| Panel field | Value |
| --- | --- |
| Application type | Express |
| Node.js | 22 |
| Entry file | `server/index.js` |
| Build command | `npm run build` |
| Output directory | Empty |
| Start | `npm start` |
| Repository | This project, only after approval |

Hostinger installs dependencies on its servers. Do not upload a Windows `node_modules` folder. `sharp` needs the Linux build that npm installs there.

### Environment variables

Enter these in hPanel. Do not commit the values. Do not import `.env.local` if that file contains a key you do not want on staging.

| Name | Staging value |
| --- | --- |
| `APP_ENV` | `staging` |
| `PUBLIC_SITE_URL` | `https://preview.foreignafrica.org` |
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |
| `DB_NAME` | A new database, not the WordPress database |
| `DB_USER` | A user that can write only that database |
| `DB_PASSWORD` | From hPanel |
| `SESSION_SECRET` | A long random string |
| `STAGING_USER` | The name for the browser prompt |
| `STAGING_PASSWORD` | A long password, different from the staff password |
| `PREPARE_DATABASE` | `1` |
| `BOOTSTRAP_ADMIN_EMAIL` | The first super administrator’s email |
| `BOOTSTRAP_ADMIN_PASSWORD` | At least 12 characters. Remove this from the panel after the first successful start |
| `BOOTSTRAP_ADMIN_NAME` | Optional display name |
| `MEDIA_ROOT` | Leave empty |
| `GEMINI_API_KEY` | Optional. Omit it and discovery still returns directory results |
| `GEMINI_MODEL` | The model already used in development, only if the key is set |
| `CMS_PASSWORD` | Optional. Required only if someone uses `/editor` |
| `COOKIE_SECURE` | Leave unset |

`PUBLIC_SITE_URL` must be the exact origin in the browser bar. Staff writes are rejected when the origin does not match. If Hostinger first gives a temporary hostname, either wait until the preview hostname is attached or set `PUBLIC_SITE_URL` to that temporary origin and change it before anyone treats the site as staging. Never set it to `https://foreignafrica.org` on this app. Article HTML refuses to render in that case.

Enable the Hostinger certificate for the preview hostname before sharing the URL. Staging cookies are `Secure`. Basic authentication over plain HTTP would expose the staging password.

### First start

The deployment log should contain:

- `Applied 001_identity, 002_content, 003_listings, 004_editorial.`
- `Super administrator created for …`
- `Seed finished. Inserted 17, already present 0, blocked 0.`
- `Foreign Africa is listening on …`

A later deploy should say migrations are up to date, bootstrap was skipped, and the seed inserted 0.

Then remove `BOOTSTRAP_ADMIN_PASSWORD` from hPanel and redeploy.

### Storage test, before any upload

1. Leave `MEDIA_ROOT` empty for the first deploy. The studio health line should say uploads are not enabled.
2. In File Manager or SSH, create a directory that is not under `hbuilds/` or `public_html/`. For example, a `foreign-africa-media` folder in the account home, beside `domains/`.
3. Put a small text file in it.
4. Redeploy the Node app.
5. Confirm the text file is still there. Files inside `hbuilds/` and `public_html/` are replaced on deploy. A file that disappears failed the test.
6. Only after it survives, set `MEDIA_ROOT` to that absolute path and redeploy.
7. Upload one image in the studio, redeploy again, and confirm the image still opens.

Until step 5 passes, do not set `MEDIA_ROOT`.

### Rollback

1. In the Hostinger deployments list, redeploy the previous successful deployment, or disconnect auto-deploy and leave the current files if the new one has not replaced them.
2. If the new deploy applied a migration you need to undo, restore the staging database from an hPanel dump into that same new database. Do not restore it over the WordPress database.
3. Redeploying the app does not restore MySQL or `MEDIA_ROOT`.
4. The apex WordPress site is a different website. Rolling back staging does not touch it.

There is no in-app Stop button. Removing the preview website takes the app offline and deletes its deployments. It does not remove a separate WordPress website. Export the staging database before you remove the preview website.

## Acceptance checklist

Run this in a private window after the deploy. Items 1–9, 11–15 can pass with `MEDIA_ROOT` empty. Item 10 waits for the storage test.

1. Homepage loads with the existing hero, navigation, programmes, and footer.
2. At a phone width, open and close the navigation.
3. The staging password prompt appears before the page. After that, `/admin` accepts the staff email and password.
4. Create a news draft. It saves without publishing.
5. Publish a separate short article.
6. That article appears at `/news/{slug}/` in the existing layout.
7. Open the draft URL while signed out of the studio, still inside the staging password. It must not show the draft.
8. Open a seeded commentary at `/{slug}/`. The cover and inline images load from `/images/`.
9. With `MEDIA_ROOT` empty, an upload shows the storage error and no file appears.
10. After the storage test, upload an image, redeploy, and confirm the same image URL still loads.
11. Open one of the three incomplete news cards. It must land on the existing `foreignafrica.org` article, not an empty page.
12. Ask the discovery assistant a question that matches a programme. It returns a directory answer. If `GEMINI_API_KEY` and `GEMINI_MODEL` are set, it may add a short answer. If they are omitted, the directory answer is the expected result.
13. View source on a published commentary, without relying on the rendered React page. The HTML contains the title, the canonical `https://preview.foreignafrica.org/{slug}/`, `noindex`, and a sentence from the article.
14. A fresh private window with no staging password receives the sign-in challenge on `/`, `/admin`, and `/news/`.
15. Confirm the live WordPress site still looks unchanged, and that the staging database name is not the WordPress database name.

## Manual actions before a go

1. Approve this deploy in writing.
2. Create the preview website without changing the apex.
3. Create an empty MySQL database and a user limited to it.
4. Enter the variables above. Leave `MEDIA_ROOT` empty.
5. Deploy from the approved commit.
6. Read the startup log.
7. Remove the bootstrap password from the panel.
8. Walk the checklist.
9. Run the storage test only when you want uploads.

## Recommendation

**No-go for deployment today.** The code, build, migrations, seed, staging lock, and upload refusal passed on this machine. Hostinger itself has not been changed, and the browser checklist has not been run there. Deploy only after an explicit approval, using the panel settings in this file, with uploads left off until the marker file survives a redeploy.
