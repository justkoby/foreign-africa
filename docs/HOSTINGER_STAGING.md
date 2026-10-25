# Hostinger staging

**Not deployed.** DNS for `preview.foreignafrica.org` has not been changed. Do not point the staging host at this app until this file is approved.

Production WordPress stays on `https://foreignafrica.org`.

## Shape

One Node.js 22 application on the preview hostname.

- `https://preview.foreignafrica.org/` the React site
- `https://preview.foreignafrica.org/admin` the staff studio
- `https://preview.foreignafrica.org/editor` the temporary file editor
- `https://preview.foreignafrica.org/api/staff` and `/api/public` the new API
- `/api/discover` and `/api/cms` remain the discovery assistant and the file editor

Do not create a second Node app for the API. Do not attach this app to the apex while WordPress is there.

Checked against Hostinger’s Node.js documentation on 25 October 2026:

| Constraint | Staging consequence |
| --- | --- |
| Node 18, 20, 22, 24 | Select 22 |
| Express, port from `process.env.PORT` | `npm start` binds that port |
| Process sleeps when idle | The first request after a quiet period is slower |
| 120 second request limit | No long import inside a web request |
| No background workers | `npm run promote-scheduled` is a cron command, not a worker |
| Cron, 30 minutes, UTC, command under 255 characters | See below |
| Business plan: 5 Node apps, 120 processes shared with WordPress | This staging app is the one extra process |
| `hbuilds` and `public_html` are replaced on deploy | Database and media live elsewhere |
| MySQL on `127.0.0.1:3306` | Create a new database. Do not use the WordPress database |
| SSL | Hostinger certificate for the subdomain |

## Environment

Set these in hPanel. Do not commit them.

| Name | Staging value |
| --- | --- |
| `APP_ENV` | `staging` |
| `PUBLIC_SITE_URL` | `https://preview.foreignafrica.org` |
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |
| `DB_NAME` | A new database name |
| `DB_USER` | A user that can write only that database |
| `DB_PASSWORD` | From hPanel |
| `SESSION_SECRET` | A long random string |
| `STAGING_USER` | A name staff will type in the browser prompt |
| `STAGING_PASSWORD` | A long password, not a staff account password |
| `MEDIA_ROOT` | An absolute path outside `hbuilds` and `public_html`, after you confirm the folder survives a deploy |
| `GEMINI_API_KEY` | Only if discovery should work on staging |
| `GEMINI_MODEL` | The model already used in development |
| `CMS_PASSWORD` | Only if someone must use `/editor` on staging |
| `COOKIE_SECURE` | Leave unset. Staging sets Secure cookies because `APP_ENV=staging` |
| `PREPARE_DATABASE` | `1` on the first staging deploy. Startup then migrates, creates the first administrator, and seeds |
| `BOOTSTRAP_ADMIN_EMAIL` | The first super administrator. Remove `BOOTSTRAP_ADMIN_PASSWORD` from the panel after the first successful start |
| `BOOTSTRAP_ADMIN_PASSWORD` | At least 12 characters. Panel only. Never commit it |
| `BOOTSTRAP_ADMIN_NAME` | Optional |

`server/index.js` will not listen in staging until `STAGING_USER` and `STAGING_PASSWORD` are set. Every response asks for that HTTP basic password. Pages also send `noindex` and `Disallow: /`. There is no sitemap.

If `PUBLIC_SITE_URL` is left on `foreignafrica.org`, article HTML refuses to render so the preview cannot publish a production canonical URL.

## Hostinger panel settings

Checked again against Hostinger’s Node.js documentation on 25 October 2026. Business Web Hosting runs the app from hPanel. It does not provide a VPS, and npm scripts cannot be run over SSH on this plan.

| Setting | Value |
| --- | --- |
| Website | A new website for `preview.foreignafrica.org` only. Do not convert or remove the apex WordPress site |
| Application type | Express |
| Node.js | 22. `package.json` sets `"engines": { "node": "22" }` |
| Entry file | `server/index.js`. LiteSpeed loads this file with `require()`, so this file and everything it imports must not use top-level await |
| Build command | `npm run build` |
| Output directory | Leave empty. Express serves `dist/` itself. Putting `dist` here would hide the server |
| Start | `npm start`, which runs `node server/index.js` and listens on `process.env.PORT` |
| Root directory | The repository root |

`npm run migrate`, `npm run bootstrap-admin`, and `npm run seed-content` remain the commands for a machine where Node can reach the database. On Business hosting they do not run over SSH. Set `PREPARE_DATABASE=1` instead. The first start applies the four migrations, creates the super administrator when `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are set and no account exists, then seeds. A second start skips applied migrations, skips bootstrap because an account exists, and skips slugs that are already present.

Remove `BOOTSTRAP_ADMIN_PASSWORD` from hPanel after the deployment log says the administrator was created, then redeploy. Leaving it does not create a second account.

Leave `MEDIA_ROOT` empty until the persistence test in `docs/STAGING_READINESS_REPORT.md` passes. A path inside `hbuilds`, `public_html`, or `dist` is refused. Uploads return 503.

The scheduled-publishing cron from the first draft of this file is not created. Its node path was not verified on the current Node.js app layout, and staging does not need it for the acceptance test.

The exact click-by-click setup, the variable list, and the go/no-go decision are in `docs/STAGING_READINESS_REPORT.md`.

## Rollback

Redeploy the previous Git commit for the application. Restore the staging database from a dump if a migration was applied. Restoring the deploy does not restore MySQL or `MEDIA_ROOT`. See `docs/BACKUP_RECOVERY.md`.

## Before the first deploy

1. Create the preview subdomain in hPanel without changing the apex.
2. Create an empty MySQL database.
3. Confirm a writable directory outside the deploy folders, or leave `MEDIA_ROOT` empty.
4. Approve this file.
5. Deploy only after the readiness report is approved. Startup preparation does the migration, the first administrator, and the seed. Sign in through the staging password and then the staff account.

The file editor writes JSON inside the deploy tree. Those edits disappear on the next staging deploy. Use it only to compare the current public site, not as the staging content store.
