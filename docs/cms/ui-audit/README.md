# Studio UI/UX overhaul: before and after

Baseline = a local replica of the staging Studio with realistic data (not the live Hostinger site, which was not contacted).
Capture: `node scripts/ui-audit/serve.mjs` then `node scripts/ui-audit/capture.mjs http://localhost:4400 <dir>`.

| Screen | Before | After |
|---|---|---|
| Dashboard | before-dashboard-1440.png | after-1440-dashboard.png |
| News listing | before-news-1440.png | after-1440-news.png |
| Editor | before-editor-1440.png | after-1440-editor.png, after-tablet-editor.png |
| Login | before-login-1440.png | after-1440-login.png |
| Media, Users, System health | (legacy, unstyled) | after-1440-media/users/health.png |
| Mobile listing | | after-mobile-news.png |

## Outstanding verification (not yet done)

The redesigned Studio was captured and reviewed visually, and the API/database suites pass (173/173 on MariaDB 11.8.9, 0 skipped). These **workflows have not been exercised end to end in a browser** and must be checked on the Hostinger staging site:

- [ ] Publishing: Publish, Schedule, Reschedule, Switch to draft, Archive from the new editor panel
- [ ] Editor autosave, Save draft, Preview, revision restore (now a confirmation dialog)
- [ ] Add user dialog (validation, role choice, creation) and Disable/Enable with its confirmation dialog
- [ ] Delete content (confirmation dialog) and delete media file (confirmation dialog)
- [ ] Media upload with progress, replace file, alt-text save, copy address, picker inside the editor
- [ ] Bulk actions on listings; search, sort, tab filters and pagination with real data
- [ ] Change password (Account), sign out, role restrictions as editor and contributor
- [ ] Responsive pass on a real tablet and phone
- [ ] MySQL 8.0 test run for this commit (only MariaDB 11.8.9 was run this round)
- [ ] Hero/homepage editors, Categories and tags, Submissions and legacy collections are not yet restyled

Staging startup behaviour: the server now prepares the database on start (migrations, bootstrap admin, seed). The administrator is created or synchronised only when BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12+ characters) are both set; there is no default password. Remove BOOTSTRAP_ADMIN_PASSWORD after first sign-in so it stops resetting that account's password.
